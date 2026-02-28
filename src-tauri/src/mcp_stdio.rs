//! MCP Stdio subprocess manager — desktop only.
//!
//! Spawns MCP servers as child processes and communicates via stdin/stdout
//! using the JSON-RPC protocol (one JSON message per line).

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
    stdout_lines: Arc<Mutex<Vec<String>>>,
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

    // Merge current env with custom env
    for (k, v) in &env {
        cmd.env(k, v);
    }

    cmd.stdin(std::process::Stdio::piped());
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| {
        format!(
            "Failed to spawn MCP process '{}': {}",
            command,
            e
        )
    })?;

    let child_stdin = child.stdin.take().ok_or("Failed to get child stdin")?;
    let child_stdout = child.stdout.take().ok_or("Failed to get child stdout")?;
    let child_stderr = child.stderr.take().ok_or("Failed to get child stderr")?;

    // Channel for sending messages to stdin
    let (stdin_tx, mut stdin_rx) = tokio::sync::mpsc::channel::<String>(64);

    // Shared buffer for stdout lines (responses from the MCP server)
    let stdout_lines: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));

    // Task: write messages to child stdin
    let mut writer = child_stdin;
    tokio::spawn(async move {
        while let Some(msg) = stdin_rx.recv().await {
            if writer.write_all(msg.as_bytes()).await.is_err() {
                break;
            }
            if writer.write_all(b"\n").await.is_err() {
                break;
            }
            if writer.flush().await.is_err() {
                break;
            }
        }
    });

    // Task: read lines from child stdout
    let stdout_lines_clone = stdout_lines.clone();
    tokio::spawn(async move {
        let reader = BufReader::new(child_stdout);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if !line.trim().is_empty() {
                stdout_lines_clone.lock().await.push(line);
            }
        }
    });

    // Task: log stderr (for debugging)
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
        stdout_lines,
    };

    sessions.lock().await.insert(session_id.clone(), session);
    log::info!("[MCP stdio] Started session {} (cmd: {} {:?})", session_id, command, args);

    Ok(session_id)
}

/// Send a JSON-RPC message to the MCP subprocess and wait for a response.
/// The message should be a complete JSON string (one JSON-RPC request).
/// Returns the first available response line, or times out after 60s.
#[tauri::command]
pub async fn mcp_stdio_send(
    session_id: String,
    message: String,
    sessions: tauri::State<'_, Sessions>,
) -> Result<String, String> {
    let sessions_guard = sessions.lock().await;
    let session = sessions_guard
        .get(&session_id)
        .ok_or_else(|| format!("Session not found: {}", session_id))?;

    // Record current line count so we know where to look for new responses
    let start_count = session.stdout_lines.lock().await.len();

    // Send the message
    session
        .stdin_tx
        .send(message)
        .await
        .map_err(|e| format!("Failed to send message: {}", e))?;

    // Drop the sessions lock so other calls can proceed
    drop(sessions_guard);

    // Wait for a new line to appear in stdout (poll with timeout)
    let timeout = tokio::time::Duration::from_secs(60);
    let start = tokio::time::Instant::now();
    let interval = tokio::time::Duration::from_millis(10);

    loop {
        if start.elapsed() > timeout {
            return Err("MCP stdio response timeout (60s)".to_string());
        }

        {
            let sessions_guard = sessions.lock().await;
            if let Some(session) = sessions_guard.get(&session_id) {
                let lines = session.stdout_lines.lock().await;
                if lines.len() > start_count {
                    // Return the newest line
                    return Ok(lines[lines.len() - 1].clone());
                }
            } else {
                return Err("Session was closed".to_string());
            }
        }

        tokio::time::sleep(interval).await;
    }
}

/// Stop an MCP stdio subprocess and clean up.
#[tauri::command]
pub async fn mcp_stdio_stop(
    session_id: String,
    sessions: tauri::State<'_, Sessions>,
) -> Result<(), String> {
    let mut sessions_guard = sessions.lock().await;
    if let Some(mut session) = sessions_guard.remove(&session_id) {
        // Try graceful kill first
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
    let sessions_guard = sessions.lock().await;
    Ok(sessions_guard.keys().cloned().collect())
}
