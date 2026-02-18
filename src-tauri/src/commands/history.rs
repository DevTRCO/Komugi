//! SQLite-backed history commands for session persistence.
//!
//! Stores chat sessions (screenshot + messages) in a local SQLite database.
//! The database file is created in the Tauri app data directory.

use std::sync::Mutex;

use rusqlite::Connection;
use tauri::Manager;

use crate::types::{HistoryError, StoredMessage, StoredSession, StoredSessionSummary};

// ============================================================================
// Database State (managed by Tauri)
// ============================================================================

pub struct DbState(pub Mutex<Connection>);

// ============================================================================
// Database Initialization
// ============================================================================

/// Initialize the SQLite database: create file, run migrations, return managed state.
pub fn initialize_database(app: &tauri::AppHandle) -> Result<DbState, String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))?;

    std::fs::create_dir_all(&app_dir).map_err(|e| format!("Failed to create app data dir: {e}"))?;

    let db_path = app_dir.join("komugi-history.db");
    log::info!("Opening database at: {}", db_path.display());

    let conn = Connection::open(&db_path).map_err(|e| format!("Failed to open database: {e}"))?;

    // Enable WAL mode for better concurrent read performance
    conn.execute_batch("PRAGMA journal_mode=WAL;")
        .map_err(|e| format!("Failed to set WAL mode: {e}"))?;

    // Enable foreign keys
    conn.execute_batch("PRAGMA foreign_keys=ON;")
        .map_err(|e| format!("Failed to enable foreign keys: {e}"))?;

    run_migrations(&conn)?;

    Ok(DbState(Mutex::new(conn)))
}

/// Run schema migrations based on PRAGMA user_version.
fn run_migrations(conn: &Connection) -> Result<(), String> {
    let version: u32 = conn
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(|e| format!("Failed to read user_version: {e}"))?;

    if version < 1 {
        log::info!("Running migration v1: create sessions and messages tables");
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY NOT NULL,
                screenshot_base64 TEXT NOT NULL,
                screenshot_width INTEGER NOT NULL,
                screenshot_height INTEGER NOT NULL,
                difficulty TEXT NOT NULL DEFAULT 'beginner',
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY NOT NULL,
                session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                sort_order INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
            CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at DESC);

            PRAGMA user_version = 1;
            ",
        )
        .map_err(|e| format!("Migration v1 failed: {e}"))?;
    }

    if version < 2 {
        log::info!("Running migration v2: add per-message screenshot columns");

        // Each ALTER is idempotent: skip if column already exists (crash recovery).
        for col in [
            "screenshot_base64 TEXT",
            "screenshot_width INTEGER",
            "screenshot_height INTEGER",
        ] {
            let sql = format!("ALTER TABLE messages ADD COLUMN {col}");
            match conn.execute_batch(&sql) {
                Ok(()) => {}
                Err(e) if e.to_string().contains("duplicate column") => {
                    log::info!("Column already exists, skipping: {col}");
                }
                Err(e) => return Err(format!("Migration v2 failed: {e}")),
            }
        }

        conn.execute_batch("PRAGMA user_version = 2;")
            .map_err(|e| format!("Migration v2 failed to set version: {e}"))?;
    }

    Ok(())
}

// ============================================================================
// Helper: lock the DB connection
// ============================================================================

fn with_db<T>(
    state: &tauri::State<'_, DbState>,
    f: impl FnOnce(&Connection) -> Result<T, rusqlite::Error>,
) -> Result<T, HistoryError> {
    let conn = state.0.lock().map_err(|e| HistoryError::DatabaseError {
        message: format!("Failed to lock database: {e}"),
    })?;
    f(&conn).map_err(|e| HistoryError::DatabaseError {
        message: format!("{e}"),
    })
}

// ============================================================================
// Commands
// ============================================================================

/// Upsert a full session (session row + all messages).
#[tauri::command]
#[specta::specta]
pub fn history_save_session(
    state: tauri::State<'_, DbState>,
    session: StoredSession,
) -> Result<(), HistoryError> {
    with_db(&state, |conn| {
        let tx = conn.unchecked_transaction()?;

        tx.execute(
            "INSERT INTO sessions (id, screenshot_base64, screenshot_width, screenshot_height, difficulty, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT(id) DO UPDATE SET
               screenshot_base64 = excluded.screenshot_base64,
               screenshot_width = excluded.screenshot_width,
               screenshot_height = excluded.screenshot_height,
               difficulty = excluded.difficulty,
               updated_at = excluded.updated_at",
            rusqlite::params![
                session.id,
                session.screenshot_base64,
                session.screenshot_width,
                session.screenshot_height,
                session.difficulty,
                session.created_at,
                session.updated_at,
            ],
        )?;

        // Delete existing messages and re-insert (simpler than diffing)
        tx.execute("DELETE FROM messages WHERE session_id = ?1", [&session.id])?;

        {
            let mut stmt = tx.prepare(
                "INSERT INTO messages (id, session_id, role, content, timestamp, sort_order, screenshot_base64, screenshot_width, screenshot_height)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            )?;

            for msg in &session.messages {
                stmt.execute(rusqlite::params![
                    msg.id,
                    msg.session_id,
                    msg.role,
                    msg.content,
                    msg.timestamp,
                    msg.sort_order,
                    msg.screenshot_base64,
                    msg.screenshot_width,
                    msg.screenshot_height,
                ])?;
            }
        }

        tx.commit()?;
        Ok(())
    })
}

/// Incrementally save messages for an existing session (appends new, updates existing).
#[tauri::command]
#[specta::specta]
pub fn history_save_messages(
    state: tauri::State<'_, DbState>,
    session_id: String,
    messages: Vec<StoredMessage>,
) -> Result<(), HistoryError> {
    with_db(&state, |conn| {
        let tx = conn.unchecked_transaction()?;

        // Update session's updated_at timestamp
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);

        tx.execute(
            "UPDATE sessions SET updated_at = ?1 WHERE id = ?2",
            rusqlite::params![now, session_id],
        )?;

        {
            let mut stmt = tx.prepare(
                "INSERT INTO messages (id, session_id, role, content, timestamp, sort_order, screenshot_base64, screenshot_width, screenshot_height)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
                 ON CONFLICT(id) DO UPDATE SET
                   content = excluded.content,
                   timestamp = excluded.timestamp,
                   screenshot_base64 = excluded.screenshot_base64,
                   screenshot_width = excluded.screenshot_width,
                   screenshot_height = excluded.screenshot_height",
            )?;

            for msg in &messages {
                stmt.execute(rusqlite::params![
                    msg.id,
                    msg.session_id,
                    msg.role,
                    msg.content,
                    msg.timestamp,
                    msg.sort_order,
                    msg.screenshot_base64,
                    msg.screenshot_width,
                    msg.screenshot_height,
                ])?;
            }
        }

        tx.commit()?;
        Ok(())
    })
}

/// List session summaries (newest first, paginated). No screenshot data.
#[tauri::command]
#[specta::specta]
pub fn history_list_sessions(
    state: tauri::State<'_, DbState>,
    limit: u32,
    offset: u32,
) -> Result<Vec<StoredSessionSummary>, HistoryError> {
    with_db(&state, |conn| {
        let mut stmt = conn.prepare(
            "SELECT s.id, s.difficulty, s.created_at, s.updated_at,
                    (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id) as msg_count,
                    (SELECT m.content FROM messages m WHERE m.session_id = s.id AND m.role = 'user' ORDER BY m.sort_order ASC LIMIT 1) as preview
             FROM sessions s
             ORDER BY s.created_at DESC
             LIMIT ?1 OFFSET ?2",
        )?;

        let rows = stmt.query_map(rusqlite::params![limit, offset], |row| {
            let content: Option<String> = row.get(5)?;
            let preview = content.unwrap_or_default();
            let truncated: String = if preview.chars().count() > 80 {
                let short: String = preview.chars().take(80).collect();
                format!("{short}...")
            } else {
                preview
            };

            Ok(StoredSessionSummary {
                id: row.get(0)?,
                difficulty: row.get(1)?,
                created_at: row.get(2)?,
                updated_at: row.get(3)?,
                message_count: row.get(4)?,
                preview: truncated,
            })
        })?;

        rows.collect()
    })
}

/// Load a full session with all messages.
#[tauri::command]
#[specta::specta]
pub fn history_load_session(
    state: tauri::State<'_, DbState>,
    session_id: String,
) -> Result<StoredSession, HistoryError> {
    let conn = state.0.lock().map_err(|e| HistoryError::DatabaseError {
        message: format!("Failed to lock database: {e}"),
    })?;

    let session = conn
        .query_row(
            "SELECT id, screenshot_base64, screenshot_width, screenshot_height, difficulty, created_at, updated_at
             FROM sessions WHERE id = ?1",
            [&session_id],
            |row| {
                Ok(StoredSession {
                    id: row.get(0)?,
                    screenshot_base64: row.get(1)?,
                    screenshot_width: row.get(2)?,
                    screenshot_height: row.get(3)?,
                    difficulty: row.get(4)?,
                    created_at: row.get(5)?,
                    updated_at: row.get(6)?,
                    messages: Vec::new(),
                })
            },
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => HistoryError::NotFound {
                id: session_id.clone(),
            },
            other => HistoryError::DatabaseError {
                message: format!("{other}"),
            },
        })?;

    let mut stmt = conn
        .prepare(
            "SELECT id, session_id, role, content, timestamp, sort_order, screenshot_base64, screenshot_width, screenshot_height
             FROM messages WHERE session_id = ?1 ORDER BY sort_order ASC",
        )
        .map_err(|e| HistoryError::DatabaseError {
            message: format!("{e}"),
        })?;

    let messages: Vec<StoredMessage> = stmt
        .query_map([&session_id], |row| {
            Ok(StoredMessage {
                id: row.get(0)?,
                session_id: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
                timestamp: row.get(4)?,
                sort_order: row.get(5)?,
                screenshot_base64: row.get(6)?,
                screenshot_width: row.get(7)?,
                screenshot_height: row.get(8)?,
            })
        })
        .map_err(|e| HistoryError::DatabaseError {
            message: format!("{e}"),
        })?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| HistoryError::DatabaseError {
            message: format!("{e}"),
        })?;

    Ok(StoredSession {
        messages,
        ..session
    })
}

/// Delete a single session and all its messages (CASCADE).
#[tauri::command]
#[specta::specta]
pub fn history_delete_session(
    state: tauri::State<'_, DbState>,
    session_id: String,
) -> Result<(), HistoryError> {
    with_db(&state, |conn| {
        conn.execute("DELETE FROM sessions WHERE id = ?1", [&session_id])?;
        Ok(())
    })
}

/// Delete all sessions and messages.
#[tauri::command]
#[specta::specta]
pub fn history_clear_all(state: tauri::State<'_, DbState>) -> Result<(), HistoryError> {
    with_db(&state, |conn| {
        conn.execute_batch("DELETE FROM messages; DELETE FROM sessions;")?;
        Ok(())
    })
}
