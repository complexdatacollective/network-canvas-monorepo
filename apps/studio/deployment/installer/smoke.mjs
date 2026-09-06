import { readFileSync } from 'node:fs';

/** Runs inside the selected image with only loopback HTTP and stdin credentials. */
export async function smoke(input, request = fetch) {
  const base = 'http://127.0.0.1:3000';
  if (
    !input ||
    !['fresh', 'update'].includes(input.mode) ||
    typeof input.origin !== 'string' ||
    !/^https:\/\/[a-z0-9.-]+$/.test(input.origin)
  )
    throw new Error('Invalid private smoke input.');
  const call = (path, options = {}) =>
    request(`${base}${path}`, {
      ...options,
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
      headers: { origin: input.origin, ...options.headers },
    });
  const readiness = await call('/readyz');
  if (!readiness.ok || (await readiness.json()).status !== 'ready')
    throw new Error('Private readiness failed.');
  const shell = await call('/');
  if (!shell.ok || !/text\/html/.test(shell.headers.get('content-type') ?? ''))
    throw new Error('The selected client shell is unavailable.');
  const setup = await call('/setup');
  if (input.mode === 'fresh') {
    if (setup.status !== 200)
      throw new Error('First-run setup is unavailable.');
    return { ready: true, setup: 'ready', authenticated: false };
  }
  if (setup.status !== 404) throw new Error('Completed setup reopened.');
  if (
    !input.credentials ||
    typeof input.credentials.email !== 'string' ||
    typeof input.credentials.password !== 'string' ||
    !input.credentials.email ||
    !input.credentials.password
  )
    throw new Error(
      'Authenticated upgrade smoke requires private credentials.',
    );
  const login = await call('/api/auth/sign-in/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input.credentials),
  });
  if (!login.ok) throw new Error('The existing account could not sign in.');
  const cookie = login.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  if (!cookie) throw new Error('No authenticated session was established.');
  let sessionClosed = false;
  try {
    const response = await call('/api/auth/get-session', {
      headers: { cookie },
    });
    const session = response.ok ? await response.json() : null;
    if (!session?.user?.id || session.user.email !== input.credentials.email)
      throw new Error('The restored account session is invalid.');
    const me = await call('/rpc/me', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: '{}',
    });
    const result = me.ok ? await me.json() : null;
    if (
      result?.json?.userId !== session.user.id ||
      !Array.isArray(result.json.teams)
    )
      throw new Error('The authorized Studio API is unavailable.');
  } finally {
    const signedOut = await call('/api/auth/sign-out', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: '{}',
    });
    sessionClosed = signedOut.ok;
  }
  if (!sessionClosed) throw new Error('The smoke session could not be closed.');
  return { ready: true, setup: 'completed', authenticated: true };
}

async function runSmoke() {
  try {
    const bytes = readFileSync(0);
    if (bytes.length > 16_384)
      throw new Error('Private smoke input is too large.');
    process.stdout.write(`${JSON.stringify(await smoke(JSON.parse(bytes)))}\n`);
  } catch {
    process.stderr.write(
      'Private release smoke failed; admission must remain closed.\n',
    );
    process.exitCode = 1;
  }
}

if (process.argv.length === 2 && process.argv[1] === '--studio-installer-smoke')
  await runSmoke();
