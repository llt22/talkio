//! Secure secret storage via the OS credential store (macOS Keychain,
//! Windows Credential Manager, Linux Secret Service).
//!
//! Desktop only: Android does not have a supported keyring backend, so the
//! frontend falls back to local storage there (see src/services/secret-store.ts).

const SERVICE: &str = "com.lilongtao.talkio";

#[tauri::command]
pub fn secret_set(account: String, secret: String) -> Result<(), String> {
  let entry = keyring::Entry::new(SERVICE, &account).map_err(|e| e.to_string())?;
  entry.set_password(&secret).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn secret_get(account: String) -> Result<Option<String>, String> {
  let entry = keyring::Entry::new(SERVICE, &account).map_err(|e| e.to_string())?;
  match entry.get_password() {
    Ok(secret) => Ok(Some(secret)),
    Err(keyring::Error::NoEntry) => Ok(None),
    Err(e) => Err(e.to_string()),
  }
}

#[tauri::command]
pub fn secret_delete(account: String) -> Result<(), String> {
  let entry = keyring::Entry::new(SERVICE, &account).map_err(|e| e.to_string())?;
  match entry.delete_credential() {
    Ok(()) => Ok(()),
    Err(keyring::Error::NoEntry) => Ok(()),
    Err(e) => Err(e.to_string()),
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn set_get_delete_roundtrip() {
    let account = format!("test-account-{}", uuid::Uuid::new_v4());
    secret_set(account.clone(), "sk-test-secret".into()).expect("set should succeed");
    assert_eq!(secret_get(account.clone()).unwrap(), Some("sk-test-secret".into()));
    secret_delete(account.clone()).expect("delete should succeed");
    assert_eq!(secret_get(account).unwrap(), None);
  }

  #[test]
  fn get_missing_returns_none() {
    let account = format!("missing-account-{}", uuid::Uuid::new_v4());
    assert_eq!(secret_get(account).unwrap(), None);
  }

  #[test]
  fn delete_missing_is_ok() {
    let account = format!("missing-account-{}", uuid::Uuid::new_v4());
    secret_delete(account).expect("delete of missing entry should be a no-op");
  }
}
