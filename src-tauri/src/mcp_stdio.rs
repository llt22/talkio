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

    let mut cmd = Command::new(&command);
    cmd.args(&args);
    for (k, v) in &env {
        cmd.env(k, v);
    }
    cmd.stdin(std::process::Stdio::piped());
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| {
        format!("Failed to spawn MCP process '{}': {}", command, e)
    })?;

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

    // Send the message
    stdin_tx
        .send(message)
        .await
        .map_err(|e| format!("Failed to send message: {}", e))?;

    // Wait for response on the channel (no polling, no memory leak)
    let mut rx = stdout_rx.lock().await;
    match tokio::time::timeout(
        tokio::time::Duration::from_secs(60),
        rx.recv(),
    ).await {
        Ok(Some(line)) => Ok(line),
        Ok(None) => Err("MCP stdio process closed".to_string()),
        Err(_) => Err("MCP stdio response timeout (60s)".to_string()),
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
