//! MCP Stdio subprocess manager — desktop only.
//!
//! Spawns MCP servers as child processes and communicates via stdin/stdout
//! using the JSON-RPC protocol (one JSON message per line).
//!
//! Uses async mpsc channels (not polling) for efficient response handling.

use std::collections::HashMap;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;
use uuid::Uuid;

/// Shared state holding all active stdio sessions.
pub type Sessions = Arc<Mutex<HashMap<String, StdioSession>>>;

pub struct StdioSession {
    child: Child,
    stdin_tx: tokio::sync::mpsc::Sender<String>,
    /// Per-session receiver for stdout lines, behind its own Mutex
    /// so we can hold it during async recv() without blocking other sessions.
    stdout_rx: Arc<Mutex<tokio::sync::mpsc::Receiver<String>>>,
}

/// Start a new MCP stdio subprocess.
/// Returns a session_id that the frontend uses for subsequent calls.
#[tauri::command]
pub async fn mcp_stdio_start(
    command: String,
    args: Vec<String>,
    env: HashMap<String, String>,
    sessions: tauri::State<'_, Sessions>,
) -> Result<String, String> {
    let session_id = Uuid::new_v4().to_string();

    // On Windows, commands like "npx" are actually "npx.cmd" — Command::new
    // doesn't resolve .cmd/.bat extensions. Wrap with cmd.exe /C to fix this.
    #[cfg(target_os = "windows")]
    let mut cmd = {
        let mut c = Command::new("cmd.exe");
        c.arg("/C");
        c.arg(&command);
        c.args(&args);
        c
    };
    #[cfg(not(target_os = "windows"))]
    let mut cmd = {
        let mut c = Command::new(&command);
        c.args(&args);
        c
    };
    for (k, v) in &env {
        cmd.env(k, v);
    }

    // macOS .app bundles don't inherit the user's shell PATH, so commands
    // like "npx", "node", "python3" etc. won't be found. Prepend common
    // executable paths to the child process PATH.
    {
        let current_path = std::env::var("PATH").unwrap_or_default();
        let home = std::env::var("HOME").unwrap_or_default();

        let mut paths: Vec<String> = Vec::new();

        // Try to find the actual nvm node binary dir
        let nvm_dir = format!("{}/.nvm/versions/node", home);
        if let Ok(entries) = std::fs::read_dir(&nvm_dir) {
            let mut versions: Vec<String> = entries
                .filter_map(|e| e.ok())
                .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
                .map(|e| e.file_name().to_string_lossy().to_string())
                .collect();
            versions.sort();
            if let Some(latest) = versions.last() {
                paths.push(format!("{}/{}/bin", nvm_dir, latest));
            }
        }

        // Homebrew (Apple Silicon + Intel)
        paths.push("/opt/homebrew/bin".into());
        paths.push("/opt/homebrew/sbin".into());
        paths.push("/usr/local/bin".into());
        paths.push("/usr/local/sbin".into());
        // Common tool paths
        paths.push(format!("{}/.local/bin", home));
        paths.push(format!("{}/.cargo/bin", home));
        paths.push(format!("{}/.volta/bin", home));
        paths.push(format!("{}/.fnm/aliases/default/bin", home));
        // System
        paths.push("/usr/bin".into());
        paths.push("/bin".into());
        paths.push("/usr/sbin".into());
        paths.push("/sbin".into());
        // Existing PATH
        if !current_path.is_empty() {
            paths.push(current_path);
        }

        let merged = paths.join(":");
        cmd.env("PATH", &merged);
        log::debug!("[MCP stdio] PATH set to: {}", merged);
    }

    cmd.stdin(std::process::Stdio::piped());
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());
    // Prevent console window from flashing on Windows
    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    log::info!("[MCP stdio] Spawning: {} {:?}", command, args);
    log::debug!("[MCP stdio] env={:?}", env);
    let mut child = cmd.spawn().map_err(|e| {
        log::error!("[MCP stdio] Spawn failed: {}", e);
        format!("Failed to spawn MCP process '{}': {}", command, e)
    })?;
    log::info!("[MCP stdio] Process spawned successfully, pid={:?}", child.id());

    let child_stdin = child.stdin.take().ok_or("Failed to get child stdin")?;
    let child_stdout = child.stdout.take().ok_or("Failed to get child stdout")?;
    let child_stderr = child.stderr.take().ok_or("Failed to get child stderr")?;

    // Channel: frontend → child stdin
    let (stdin_tx, mut stdin_rx) = tokio::sync::mpsc::channel::<String>(64);
    // Channel: child stdout → frontend (bounded to prevent unbounded memory growth)
    let (stdout_tx, stdout_rx) = tokio::sync::mpsc::channel::<String>(256);

    // Task: write messages to child stdin
    let mut writer = child_stdin;
    tokio::spawn(async move {
        while let Some(msg) = stdin_rx.recv().await {
            if writer.write_all(msg.as_bytes()).await.is_err() { break; }
            if writer.write_all(b"\n").await.is_err() { break; }
            if writer.flush().await.is_err() { break; }
        }
    });

    // Task: read lines from child stdout → push to channel
    tokio::spawn(async move {
        let reader = BufReader::new(child_stdout);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if !line.trim().is_empty() {
                if stdout_tx.send(line).await.is_err() { break; }
            }
        }
    });

    // Task: log stderr
    let sid_for_log = session_id.clone();
    tokio::spawn(async move {
        let reader = BufReader::new(child_stderr);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            log::warn!("[MCP stdio {}] stderr: {}", sid_for_log, line);
        }
    });

    let session = StdioSession {
        child,
        stdin_tx,
        stdout_rx: Arc::new(Mutex::new(stdout_rx)),
    };
    sessions.lock().await.insert(session_id.clone(), session);
    log::info!("[MCP stdio] Started session {} (cmd: {} {:?})", session_id, command, args);

    Ok(session_id)
}

/// Send a JSON-RPC message to the MCP subprocess and wait for a response.
/// Uses async channel recv with timeout — no polling.
#[tauri::command]
pub async fn mcp_stdio_send(
    session_id: String,
    message: String,
    sessions: tauri::State<'_, Sessions>,
) -> Result<String, String> {
    // Get stdin sender and stdout receiver Arc (short lock)
    let (stdin_tx, stdout_rx) = {
        let guard = sessions.lock().await;
        let session = guard
            .get(&session_id)
            .ok_or_else(|| format!("Session not found: {}", session_id))?;
        (session.stdin_tx.clone(), session.stdout_rx.clone())
    };
    // Sessions lock released here

    log::debug!("[MCP stdio {}] send() len={}", session_id, message.len());

    // Lock the receiver and drain any buffered lines (startup text, etc.)
    // that arrived before this send — they are not responses to our request.
    let mut rx = stdout_rx.lock().await;
    while rx.try_recv().is_ok() {
        log::debug!("[MCP stdio {}] Drained buffered line", session_id);
    }

    stdin_tx
        .send(message)
        .await
        .map_err(|e| {
            log::error!("[MCP stdio {}] stdin send failed: {}", session_id, e);
            format!("Failed to send message: {}", e)
        })?;

    // Wait for response on the channel (no polling, no memory leak)
    match tokio::time::timeout(
        tokio::time::Duration::from_secs(60),
        rx.recv(),
    ).await {
        Ok(Some(line)) => Ok(line),
        Ok(None) => {
            log::error!("[MCP stdio {}] Process closed", session_id);
            Err("MCP stdio process closed".to_string())
        }
        Err(_) => {
            log::error!("[MCP stdio {}] Response timeout (60s)", session_id);
            Err("MCP stdio response timeout (60s)".to_string())
        }
    }
}

/// Stop an MCP stdio subprocess and clean up.
#[tauri::command]
pub async fn mcp_stdio_stop(
    session_id: String,
    sessions: tauri::State<'_, Sessions>,
) -> Result<(), String> {
    let mut guard = sessions.lock().await;
    if let Some(mut session) = guard.remove(&session_id) {
        let _ = session.child.kill().await;
        log::info!("[MCP stdio] Stopped session {}", session_id);
    }
    Ok(())
}

/// List all active stdio sessions (for debugging).
#[tauri::command]
pub async fn mcp_stdio_list(
    sessions: tauri::State<'_, Sessions>,
) -> Result<Vec<String>, String> {
    let guard = sessions.lock().await;
    Ok(guard.keys().cloned().collect())
}
