function ipc() {
  const api = window.electronAPI;
  if (!api?.auth) {
    throw new Error('Electron auth IPC bridge not available');
  }
  return api.auth;
}

export async function status(): Promise<AuthStatus> {
  return ipc().status();
}

export async function setup(args: {
  credentialIdB64: string;
  saltB64: string;
  prfOutputB64: string;
}): Promise<{ ok: boolean; message?: string }> {
  return ipc().setup(args);
}

export async function setupPin(args: {
  pin: string;
}): Promise<{ ok: boolean; message?: string }> {
  return ipc().setupPin(args);
}

export async function setupNone(): Promise<{
  ok: boolean;
  message?: string;
}> {
  return ipc().setupNone();
}

export async function unlock(args: {
  prfOutputB64: string;
}): Promise<{ ok: boolean; message?: string }> {
  return ipc().unlock(args);
}

export async function unlockPin(args: {
  pin: string;
}): Promise<{ ok: boolean; message?: string }> {
  return ipc().unlockPin(args);
}

export async function lock(): Promise<void> {
  return ipc().lock();
}

export async function reEnrol(args: {
  currentPrfOutputB64: string;
  nextCredentialIdB64: string;
  nextSaltB64: string;
  nextPrfOutputB64: string;
}): Promise<{ ok: boolean; message?: string }> {
  return ipc().reEnrol(args);
}

export async function reEnrolPin(args: {
  currentPin: string;
  nextPin: string;
}): Promise<{ ok: boolean; message?: string }> {
  return ipc().reEnrolPin(args);
}

export async function revoke(): Promise<void> {
  return ipc().revoke();
}
