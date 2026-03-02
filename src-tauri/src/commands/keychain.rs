//! Keychain commands for secure API key storage.
//!
//! Uses macOS Keychain (via `keyring` crate) to store the Gemini API key.
//! Falls back gracefully when no key is stored (normal state for fresh installs).

const SERVICE: &str = "com.komugi.tutor";
const ACCOUNT: &str = "gemini-api-key";

/// Minimum valid key length (Gemini keys are ~39 chars, but be lenient).
const MIN_KEY_LENGTH: usize = 20;
/// Maximum key length to prevent degenerate inputs.
const MAX_KEY_LENGTH: usize = 256;
/// Prefix for Gemini API keys.
const KEY_PREFIX: &str = "AIza";

/// Checks whether an API key is stored in the keychain.
#[tauri::command]
#[specta::specta]
pub fn check_api_key_configured() -> Result<bool, String> {
    let entry = keyring::Entry::new(SERVICE, ACCOUNT).map_err(map_keyring_error)?;
    match entry.get_password() {
        Ok(_) => Ok(true),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(e) => Err(map_keyring_error(e)),
    }
}

/// Saves an API key to the keychain after validating its format.
/// Performs a read-back verification after writing (NASA Rule #5).
#[tauri::command]
#[specta::specta]
pub fn save_api_key(key: String) -> Result<(), String> {
    let key = key.trim().to_string();
    if key.len() < MIN_KEY_LENGTH {
        return Err(format!(
            "API key too short (minimum {MIN_KEY_LENGTH} characters)"
        ));
    }
    if key.len() > MAX_KEY_LENGTH {
        return Err(format!(
            "API key too long (maximum {MAX_KEY_LENGTH} characters)"
        ));
    }
    if !key.starts_with(KEY_PREFIX) {
        return Err(format!("API key must start with \"{KEY_PREFIX}\""));
    }

    let entry = keyring::Entry::new(SERVICE, ACCOUNT).map_err(map_keyring_error)?;
    entry.set_password(&key).map_err(map_keyring_error)?;

    // Read-back verification: confirm the write succeeded
    let stored = entry.get_password().map_err(|e| {
        log::error!("Keychain read-back failed after write: {e}");
        format!(
            "Key was saved but verification failed: {}",
            map_keyring_error(e)
        )
    })?;

    if stored != key {
        log::error!("Keychain read-back mismatch after write");
        return Err("Key verification failed: stored value doesn't match".to_string());
    }

    log::info!("API key saved to keychain ({}...)", &key[..4]);
    Ok(())
}

/// Loads the API key from the keychain.
/// Returns None if no key is stored (normal state, not an error).
#[tauri::command]
#[specta::specta]
pub fn load_api_key() -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(SERVICE, ACCOUNT).map_err(map_keyring_error)?;
    match entry.get_password() {
        Ok(key) => Ok(Some(key)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(map_keyring_error(e)),
    }
}

/// Removes the API key from the keychain.
/// Returns Ok if no key was stored (idempotent).
#[tauri::command]
#[specta::specta]
pub fn remove_api_key() -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE, ACCOUNT).map_err(map_keyring_error)?;
    match entry.delete_credential() {
        Ok(()) => {
            log::info!("API key removed from keychain");
            Ok(())
        }
        Err(keyring::Error::NoEntry) => {
            log::debug!("No API key to remove (already empty)");
            Ok(())
        }
        Err(e) => Err(map_keyring_error(e)),
    }
}

/// Maps keyring errors to descriptive user-facing messages.
/// Distinguishes access denied, not found, and other failures.
fn map_keyring_error(e: keyring::Error) -> String {
    match e {
        keyring::Error::NoEntry => "No API key stored".to_string(),
        keyring::Error::Ambiguous(_) => {
            log::error!("Keychain ambiguous entry: {e}");
            "Multiple keychain entries found. Remove duplicates in Keychain Access.app.".to_string()
        }
        keyring::Error::PlatformFailure(ref inner) => {
            let msg = inner.to_string();
            log::error!("Keychain platform error: {msg}");
            if msg.contains("denied") || msg.contains("-25293") || msg.contains("authorization") {
                "Keychain access denied. Check System Settings > Privacy > Keychain Access."
                    .to_string()
            } else {
                format!("Keychain error: {msg}")
            }
        }
        _ => {
            log::error!("Keychain error: {e}");
            format!("Keychain error: {e}")
        }
    }
}
