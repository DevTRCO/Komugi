//! Learning profile management commands.
//!
//! Handles loading, appending, deleting, and clearing learning profile entries.
//! The profile stores session summaries to provide learner context across sessions.

use std::path::PathBuf;
use tauri::{AppHandle, Manager};

use crate::types::{
    validate_string_input, LearningProfile, LearningProfileEntry, LearningProfileError,
    MAX_PROFILE_ENTRIES,
};

/// Gets the path to the learning profile file.
fn get_profile_path(app: &AppHandle) -> Result<PathBuf, LearningProfileError> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| LearningProfileError::Io {
            message: format!("Failed to get app data directory: {e}"),
        })?;

    std::fs::create_dir_all(&app_data_dir).map_err(|e| LearningProfileError::Io {
        message: format!("Failed to create app data directory: {e}"),
    })?;

    Ok(app_data_dir.join("learning-profile.json"))
}

/// Validates a single learning profile entry.
fn validate_entry(entry: &LearningProfileEntry) -> Result<(), LearningProfileError> {
    validate_string_input(&entry.session_id, 100, "session_id").map_err(|e| {
        LearningProfileError::Validation {
            message: e.to_string(),
        }
    })?;

    validate_string_input(&entry.summary, 2000, "summary").map_err(|e| {
        LearningProfileError::Validation {
            message: e.to_string(),
        }
    })?;

    if entry.topics.len() > 10 {
        return Err(LearningProfileError::Validation {
            message: "Too many topics (max 10)".to_string(),
        });
    }

    for topic in &entry.topics {
        validate_string_input(topic, 50, "topic").map_err(|e| {
            LearningProfileError::Validation {
                message: e.to_string(),
            }
        })?;
    }

    Ok(())
}

/// Atomic write: write to temp file then rename.
fn atomic_write(path: &PathBuf, profile: &LearningProfile) -> Result<(), LearningProfileError> {
    let json = serde_json::to_string_pretty(profile).map_err(|e| LearningProfileError::Parse {
        message: format!("Failed to serialize profile: {e}"),
    })?;

    let temp_path = path.with_extension("tmp");

    std::fs::write(&temp_path, json).map_err(|e| LearningProfileError::Io {
        message: format!("Failed to write profile file: {e}"),
    })?;

    if let Err(rename_err) = std::fs::rename(&temp_path, path) {
        // Clean up temp file
        let _ = std::fs::remove_file(&temp_path);
        return Err(LearningProfileError::Io {
            message: format!("Failed to finalize profile file: {rename_err}"),
        });
    }

    Ok(())
}

/// Loads learning profile from disk.
/// Returns empty profile if file missing or corrupt.
#[tauri::command]
#[specta::specta]
pub async fn load_learning_profile(
    app: AppHandle,
) -> Result<LearningProfile, LearningProfileError> {
    let path = get_profile_path(&app)?;

    if !path.exists() {
        return Ok(LearningProfile::default());
    }

    let contents = std::fs::read_to_string(&path).map_err(|e| LearningProfileError::Io {
        message: format!("Failed to read profile: {e}"),
    })?;

    let profile: LearningProfile = serde_json::from_str(&contents).unwrap_or_else(|e| {
        log::warn!("Failed to parse learning profile, returning empty: {e}");
        LearningProfile::default()
    });

    Ok(profile)
}

/// Appends a new entry to the learning profile.
/// Skips duplicates (same session_id). Prunes to max 20 entries.
#[tauri::command]
#[specta::specta]
pub async fn append_learning_profile_entry(
    app: AppHandle,
    entry: LearningProfileEntry,
) -> Result<(), LearningProfileError> {
    validate_entry(&entry)?;

    let path = get_profile_path(&app)?;
    let mut profile = if path.exists() {
        let contents = std::fs::read_to_string(&path).map_err(|e| LearningProfileError::Io {
            message: format!("Failed to read profile: {e}"),
        })?;
        serde_json::from_str(&contents).unwrap_or_else(|e| {
            log::warn!("Failed to parse profile during append, starting fresh: {e}");
            LearningProfile::default()
        })
    } else {
        LearningProfile::default()
    };

    // Skip duplicate session_id
    if profile
        .entries
        .iter()
        .any(|e| e.session_id == entry.session_id)
    {
        log::debug!(
            "Skipping duplicate profile entry for session {}",
            entry.session_id
        );
        return Ok(());
    }

    profile.entries.push(entry);

    // Prune oldest entries if over limit
    if profile.entries.len() > MAX_PROFILE_ENTRIES {
        let excess = profile.entries.len() - MAX_PROFILE_ENTRIES;
        profile.entries.drain(..excess);
    }

    atomic_write(&path, &profile)?;
    log::info!(
        "Learning profile entry appended ({} entries)",
        profile.entries.len()
    );
    Ok(())
}

/// Deletes a single entry by session_id. No-op if not found.
#[tauri::command]
#[specta::specta]
pub async fn delete_learning_profile_entry(
    app: AppHandle,
    session_id: String,
) -> Result<(), LearningProfileError> {
    let path = get_profile_path(&app)?;

    if !path.exists() {
        return Ok(());
    }

    let contents = std::fs::read_to_string(&path).map_err(|e| LearningProfileError::Io {
        message: format!("Failed to read profile: {e}"),
    })?;

    let mut profile: LearningProfile = serde_json::from_str(&contents).unwrap_or_else(|e| {
        log::warn!("Failed to parse profile during delete: {e}");
        LearningProfile::default()
    });

    let before = profile.entries.len();
    profile.entries.retain(|e| e.session_id != session_id);

    if profile.entries.len() < before {
        atomic_write(&path, &profile)?;
        log::info!("Learning profile entry deleted for session {session_id}");
    }

    Ok(())
}

/// Clears all learning profile data by deleting the file.
#[tauri::command]
#[specta::specta]
pub async fn clear_learning_profile(app: AppHandle) -> Result<(), LearningProfileError> {
    let path = get_profile_path(&app)?;

    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| LearningProfileError::Io {
            message: format!("Failed to delete profile: {e}"),
        })?;
        log::info!("Learning profile cleared");
    }

    Ok(())
}
