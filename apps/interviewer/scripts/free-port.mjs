// Frees the dev-server TCP port by terminating whatever is listening on it.
//
// The Capacitor dev port must stay fixed: the native app is told the dev-server
// URL (host:port) at `cap sync` time, before the webview loads, so a random
// port would leave the app pointing at nothing. This makes a stale dev server
// the usual failure, so each `cap:dev` run frees the port up front instead of
// erroring on "port already in use".
import { execFileSync } from 'node:child_process';

const port = process.argv[2] ?? '5181';

if (!/^\d+$/.test(port)) {
  console.error(`free-port: invalid port "${port}"`);
  process.exit(1);
}

let pids = [];
try {
  // execFileSync (no shell) so the port — already validated as digits — can't
  // be a shell-injection vector.
  const listed = execFileSync(
    'lsof',
    ['-nP', `-tiTCP:${port}`, '-sTCP:LISTEN'],
    { stdio: ['ignore', 'pipe', 'ignore'] },
  )
    .toString()
    .trim();
  pids = listed ? listed.split('\n').filter(Boolean) : [];
} catch {
  // lsof exits non-zero when nothing is listening (or isn't installed) — treat
  // that as the port being free.
}

for (const pid of pids) {
  try {
    process.kill(Number(pid), 'SIGKILL');
    console.log(`free-port: freed ${port} (killed pid ${pid})`);
  } catch {
    // Process already exited between listing and killing — fine.
  }
}

if (pids.length === 0) {
  console.log(`free-port: ${port} already free`);
}
