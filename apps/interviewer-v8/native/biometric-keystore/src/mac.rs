use security_framework::base::Error as SfError;
use security_framework::passwords::{
  delete_generic_password_options, generic_password, set_generic_password_options,
  AccessControlOptions, PasswordOptions,
};

const ERR_SEC_ITEM_NOT_FOUND: i32 = -25300;
const ERR_SEC_AUTH_FAILED: i32 = -25293;
const ERR_SEC_USER_CANCELED: i32 = -128;

#[derive(Debug)]
pub enum KeystoreError {
  Cancelled,
  AuthFailed,
  NotFound,
  Other(String),
}

impl std::fmt::Display for KeystoreError {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    match self {
      Self::Cancelled => write!(f, "User cancelled the biometric prompt"),
      Self::AuthFailed => write!(f, "Biometric authentication failed"),
      Self::NotFound => write!(f, "No keychain item found for the given service and account"),
      Self::Other(msg) => write!(f, "Keychain error: {msg}"),
    }
  }
}

impl From<SfError> for KeystoreError {
  fn from(err: SfError) -> Self {
    match err.code() {
      ERR_SEC_ITEM_NOT_FOUND => Self::NotFound,
      ERR_SEC_USER_CANCELED => Self::Cancelled,
      ERR_SEC_AUTH_FAILED => Self::AuthFailed,
      _ => Self::Other(format!("{} (code {})", err, err.code())),
    }
  }
}

pub fn is_available() -> bool {
  true
}

pub fn store(service: &str, account: &str, secret: &[u8]) -> Result<(), KeystoreError> {
  let del_opts = PasswordOptions::new_generic_password(service, account);
  if let Err(err) = delete_generic_password_options(del_opts) {
    if err.code() != ERR_SEC_ITEM_NOT_FOUND {
      return Err(err.into());
    }
  }
  let mut opts = PasswordOptions::new_generic_password(service, account);
  opts.set_access_control_options(AccessControlOptions::USER_PRESENCE);
  set_generic_password_options(secret, opts).map_err(Into::into)
}

pub fn load(service: &str, account: &str) -> Result<Vec<u8>, KeystoreError> {
  let opts = PasswordOptions::new_generic_password(service, account);
  generic_password(opts).map_err(Into::into)
}

pub fn delete(service: &str, account: &str) -> Result<(), KeystoreError> {
  let opts = PasswordOptions::new_generic_password(service, account);
  match delete_generic_password_options(opts) {
    Ok(()) => Ok(()),
    Err(err) if err.code() == ERR_SEC_ITEM_NOT_FOUND => Ok(()),
    Err(err) => Err(err.into()),
  }
}
