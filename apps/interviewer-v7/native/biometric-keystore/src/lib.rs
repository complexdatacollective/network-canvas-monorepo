#![deny(clippy::all)]

use napi::bindgen_prelude::*;
use napi_derive::napi;

#[cfg(target_os = "macos")]
mod mac;

/// Returns true if the platform supports biometric-gated keychain storage.
/// macOS only; other platforms always return false.
#[napi]
pub async fn is_available() -> bool {
  #[cfg(target_os = "macos")]
  {
    mac::is_available()
  }
  #[cfg(not(target_os = "macos"))]
  {
    false
  }
}

/// Store a secret in the macOS keychain protected by biometric ACL.
/// Overwrites any existing item with the same service/account.
#[napi]
pub async fn store(service: String, account: String, secret: Buffer) -> Result<()> {
  #[cfg(target_os = "macos")]
  {
    mac::store(&service, &account, secret.as_ref()).map_err(to_napi)
  }
  #[cfg(not(target_os = "macos"))]
  {
    let _ = (service, account, secret);
    Err(Error::from_reason(
      "biometric-keystore is only available on macOS".to_string(),
    ))
  }
}

/// Read the secret. Triggers Touch ID or device-passcode prompt on macOS.
/// Errors with `cancelled` if the user dismisses the prompt.
#[napi]
pub async fn load(service: String, account: String) -> Result<Buffer> {
  #[cfg(target_os = "macos")]
  {
    mac::load(&service, &account)
      .map(Buffer::from)
      .map_err(to_napi)
  }
  #[cfg(not(target_os = "macos"))]
  {
    let _ = (service, account);
    Err(Error::from_reason(
      "biometric-keystore is only available on macOS".to_string(),
    ))
  }
}

/// Delete the stored secret. Succeeds even if the item does not exist.
#[napi(js_name = "delete")]
pub async fn delete_secret(service: String, account: String) -> Result<()> {
  #[cfg(target_os = "macos")]
  {
    mac::delete(&service, &account).map_err(to_napi)
  }
  #[cfg(not(target_os = "macos"))]
  {
    let _ = (service, account);
    Err(Error::from_reason(
      "biometric-keystore is only available on macOS".to_string(),
    ))
  }
}

#[cfg(target_os = "macos")]
fn to_napi(err: mac::KeystoreError) -> Error {
  Error::from_reason(err.to_string())
}
