import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, test } from 'vitest';

// apps/studio/scripts/auto-update.sh with curl, cosign and Compose stubbed:
// curl answers the GitHub API and raw.githubusercontent.com from fixtures and
// records every request; the upgrade.sh it serves is a stub that logs its call.

const SCRIPT = fileURLToPath(
  new URL('../../apps/studio/scripts/auto-update.sh', import.meta.url),
);
const digest = (char) => char.repeat(64);
const OLD_API = `ghcr.io/complexdatacollective/studio-api@sha256:${digest('a')}`;
const OLD_WEB = `ghcr.io/complexdatacollective/studio-web@sha256:${digest('b')}`;
const NEW_API = `ghcr.io/complexdatacollective/studio-api@sha256:${digest('c')}`;
const NEW_WEB = `ghcr.io/complexdatacollective/studio-web@sha256:${digest('d')}`;
const COMMIT = 'e'.repeat(40);
const MANIFEST_URL =
  'https://github.com/complexdatacollective/network-canvas-monorepo/releases/download/studio@0.4.0/studio-release.json';
const API =
  'https://api.github.com/repos/complexdatacollective/network-canvas-monorepo';

const RELEASES = [
  {
    tag_name: 'studio@0.5.0',
    draft: true,
    prerelease: false,
    assets: [{ name: 'studio-release.json', browser_download_url: 'draft' }],
  },
  {
    tag_name: '@codaco/fresco-ui@2.0.0',
    draft: false,
    prerelease: false,
    assets: [],
  },
  {
    tag_name: 'studio@0.4.0',
    draft: false,
    prerelease: false,
    assets: [
      { name: 'studio-api.cdx.json', browser_download_url: 'sbom' },
      { name: 'studio-release.json', browser_download_url: MANIFEST_URL },
    ],
  },
];

const MANIFEST = {
  version: '0.4.0',
  date: '2026-10-22T12:00:00Z',
  notes:
    'https://github.com/complexdatacollective/network-canvas-monorepo/releases/tag/studio@0.4.0',
  migration: '0042_example',
  tag: 'studio@0.4.0',
  commit: COMMIT,
  images: { api: NEW_API, web: NEW_WEB },
};

const CURL = `#!/usr/bin/env bash
echo "$*" >> "$STUB_STATE/argv.log"
method=GET body= url= out=
while [ $# -gt 0 ]; do
  case "$1" in
    -X) method="$2"; shift 2 ;;
    -d) body="$2"; shift 2 ;;
    -o) out="$2"; shift 2 ;;
    -H) shift 2 ;;
    -*) shift ;;
    *) url="$1"; shift ;;
  esac
done
printf '%s %s %s\\n' "$method" "$url" "$body" >> "$STUB_STATE/requests.log"
case "$method $url" in
  "GET $STUB_API/releases?per_page=100&page="*)
    page="$STUB_STATE/releases-\${url##*page=}.json"
    if [ -f "$page" ]; then cat "$page"; else echo '[]'; fi ;;
  "GET $STUB_MANIFEST_URL") cat "$STUB_STATE/manifest.json" ;;
  "GET $STUB_RAW/apps/studio/docker-compose.yml") cp "$STUB_STATE/raw-compose.yml" "$out" ;;
  "GET $STUB_RAW/apps/studio/scripts/upgrade.sh") cp "$STUB_STATE/raw-upgrade.sh" "$out" ;;
  "POST $STUB_API/deployments")
    [ -n "\${STUB_DEPLOYMENT_FAILS:-}" ] && exit 22
    echo '{"id":42}' ;;
  "POST $STUB_API/deployments/42/statuses") echo '{}' ;;
  *) echo "curl stub: unexpected $method $url" >&2; exit 99 ;;
esac
`;

const COSIGN = `#!/usr/bin/env bash
echo "$*" >> "$STUB_STATE/cosign.log"
[ -n "\${STUB_COSIGN_REJECT:-}" ] && [ "\${*: -1}" = "$STUB_COSIGN_REJECT" ] && exit 1
exit 0
`;

const UPGRADE = `#!/usr/bin/env bash
echo "$*" >> "$STUB_STATE/upgrade.log"
cp "\${@: -3:1}" "$STUB_STATE/upgrade-compose.yml"
exit "\${STUB_UPGRADE_EXIT:-0}"
`;

const COMPOSE = `#!/usr/bin/env bash
echo "$*" >> "$STUB_STATE/compose.log"
[ -n "\${STUB_COMPOSE_STDERR:-}" ] && echo "$STUB_COMPOSE_STDERR" >&2
exit "\${STUB_COMPOSE_EXIT:-0}"
`;

const RELEASE_COMPOSE = 'services:\n  api:\n';

const dirs = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

function stub(dir, name, body) {
  writeFileSync(join(dir, name), body);
  chmodSync(join(dir, name), 0o755);
}

function setup({
  api = OLD_API,
  web = OLD_WEB,
  releases = RELEASES,
  pages = [releases],
} = {}) {
  const root = mkdtempSync(join(tmpdir(), 'studio-auto-update-'));
  dirs.push(root);
  const s = {
    stack: join(root, 'stack'),
    scripts: join(root, 'scripts'),
    bin: join(root, 'bin'),
    state: join(root, 'state'),
  };
  for (const dir of Object.values(s)) mkdirSync(dir);
  writeFileSync(
    join(s.stack, '.env'),
    `STUDIO_HOSTNAME=studio.example.org\nSTUDIO_API_IMAGE=${api}\nSTUDIO_WEB_IMAGE=${web}\n`,
  );
  pages.forEach((page, index) =>
    writeFileSync(
      join(s.state, `releases-${index + 1}.json`),
      JSON.stringify(page),
    ),
  );
  writeFileSync(join(s.state, 'manifest.json'), JSON.stringify(MANIFEST));
  for (const log of [
    'requests.log',
    'argv.log',
    'cosign.log',
    'upgrade.log',
    'compose.log',
  ])
    writeFileSync(join(s.state, log), '');
  copyFileSync(SCRIPT, join(s.scripts, 'auto-update.sh'));
  chmodSync(join(s.scripts, 'auto-update.sh'), 0o755);
  writeFileSync(join(s.state, 'raw-upgrade.sh'), UPGRADE);
  writeFileSync(join(s.state, 'raw-compose.yml'), RELEASE_COMPOSE);
  stub(s.bin, 'compose', COMPOSE);
  stub(s.bin, 'curl', CURL);
  stub(s.bin, 'cosign', COSIGN);
  return s;
}

function environment(s, env) {
  return {
    PATH: `${s.bin}:${process.env.PATH}`,
    HOME: process.env.HOME,
    GITHUB_TOKEN: 'token',
    STUB_STATE: s.state,
    STUB_API: API,
    STUB_MANIFEST_URL: MANIFEST_URL,
    STUB_RAW: `https://raw.githubusercontent.com/complexdatacollective/network-canvas-monorepo/${COMMIT}`,
    COMPOSE: join(s.bin, 'compose'),
    ...env,
  };
}

function lines(s, name) {
  return readFileSync(join(s.state, name), 'utf8')
    .split('\n')
    .filter((line) => line !== '');
}

function run(s, { env = {} } = {}) {
  const result = spawnSync(
    join(s.scripts, 'auto-update.sh'),
    ['--dir', s.stack],
    { encoding: 'utf8', timeout: 30_000, env: environment(s, env) },
  );
  const halted = join(s.stack, '.auto-update-halted');
  return {
    status: result.status,
    output: `${result.stdout}${result.stderr}`,
    requests: lines(s, 'requests.log'),
    argv: lines(s, 'argv.log'),
    cosign: lines(s, 'cosign.log'),
    upgrade: lines(s, 'upgrade.log'),
    halted: existsSync(halted) ? readFileSync(halted, 'utf8') : null,
    statuses: lines(s, 'requests.log')
      .filter((line) => line.startsWith(`POST ${API}/deployments/42/statuses`))
      .map((line) => JSON.parse(line.split(' ').slice(2).join(' ')).state),
  };
}

test('does nothing but read the release when .env already runs it', () => {
  const r = run(setup({ api: NEW_API, web: NEW_WEB }));
  assert.equal(r.status, 0, r.output);
  assert.match(r.output, /up to date with 0\.4\.0/);
  assert.deepEqual(r.requests, [
    `GET ${API}/releases?per_page=100&page=1 `,
    `GET ${MANIFEST_URL} `,
  ]);
  assert.deepEqual(r.cosign, []);
  assert.deepEqual(r.upgrade, []);
});

test('verifies, records a deployment and upgrades to the newest published Studio release', () => {
  const s = setup();
  const r = run(s);
  assert.equal(r.status, 0, r.output);
  assert.equal(r.upgrade.length, 1);
  assert.match(
    r.upgrade[0],
    new RegExp(
      `^--dir \\. --compose /\\S+/docker-compose\\.yml ${NEW_API} ${NEW_WEB}$`,
    ),
  );
  assert.equal(
    readFileSync(join(s.state, 'upgrade-compose.yml'), 'utf8'),
    RELEASE_COMPOSE,
  );
  assert.match(
    lines(s, 'compose.log').join('\n'),
    /^-f \S+\/docker-compose\.yml --project-directory \. config -q$/,
  );
  assert.deepEqual(
    r.cosign.map((line) => line.split(' ').at(-1)),
    [NEW_API, NEW_WEB],
  );
  for (const line of r.cosign) {
    assert.match(
      line,
      /--certificate-identity https:\/\/github\.com\/complexdatacollective\/network-canvas-monorepo\/\.github\/workflows\/ci-and-release\.yml@refs\/heads\/main --certificate-oidc-issuer https:\/\/token\.actions\.githubusercontent\.com --certificate-github-workflow-sha e{40} /,
    );
  }
  const created = r.requests.find((line) =>
    line.startsWith(`POST ${API}/deployments `),
  );
  assert.deepEqual(JSON.parse(created.split(' ').slice(2).join(' ')), {
    ref: COMMIT,
    environment: 'staging',
    auto_merge: false,
    required_contexts: [],
    description: 'Studio 0.4.0',
  });
  assert.deepEqual(r.statuses, ['in_progress', 'success']);
  assert.equal(r.halted, null);
});

for (const [code, state, result] of [
  [3, 'failure', 'rolled-back'],
  [2, 'error', 'not-started'],
  [4, 'error', 'rollback-failed'],
  [5, 'error', 'fix-forward'],
]) {
  test(`reports ${result} as a deployment ${state} and halts later runs`, () => {
    const s = setup();
    const r = run(s, { env: { STUB_UPGRADE_EXIT: String(code) } });
    assert.equal(r.status, code, r.output);
    assert.deepEqual(r.statuses, ['in_progress', state]);
    assert.match(
      r.halted,
      new RegExp(
        `Studio 0\\.4\\.0: upgrade\\.sh ended ${result} \\(exit ${code}\\)`,
      ),
    );

    const again = run(s);
    assert.equal(again.status, 0, again.output);
    assert.match(again.output, /halted: Studio 0\.4\.0/);
    assert.equal(again.requests.length, r.requests.length);
    assert.equal(again.upgrade.length, 1);
  });
}

test('changes nothing when an image is not signed by the release workflow', () => {
  const r = run(setup(), { env: { STUB_COSIGN_REJECT: NEW_WEB } });
  assert.notEqual(r.status, 0, r.output);
  assert.match(r.output, /is not signed by the Studio release workflow/);
  assert.deepEqual(r.upgrade, []);
  assert.equal(
    r.requests.some((line) => line.startsWith('POST')),
    false,
  );
  assert.equal(r.halted, null);
});

test('does not upgrade when the deployment cannot be recorded', () => {
  const r = run(setup(), { env: { STUB_DEPLOYMENT_FAILS: '1' } });
  assert.notEqual(r.status, 0, r.output);
  assert.deepEqual(r.upgrade, []);
});

test('skips a run while another holds the lock', async () => {
  const s = setup();
  writeFileSync(join(s.stack, '.auto-update.lock'), '');
  const holder = spawn(
    'flock',
    [join(s.stack, '.auto-update.lock'), 'sleep', '30'],
    { stdio: 'ignore' },
  );
  try {
    await new Promise((resolve) => setTimeout(resolve, 300));
    const r = run(s);
    assert.equal(r.status, 0, r.output);
    assert.match(r.output, /another run holds the lock/);
    assert.deepEqual(r.requests, []);
  } finally {
    holder.kill();
  }
});

test('ignores drafts, prereleases and other packages’ releases', () => {
  const r = run(
    setup({
      releases: [
        { ...RELEASES[2], tag_name: 'studio@0.6.0', prerelease: true },
        ...RELEASES,
      ].map((release) =>
        release.tag_name === 'studio@0.6.0'
          ? {
              ...release,
              assets: [
                { name: 'studio-release.json', browser_download_url: 'pre' },
              ],
            }
          : release,
      ),
    }),
  );
  assert.equal(r.status, 0, r.output);
  assert.equal(r.requests[1], `GET ${MANIFEST_URL} `);
});

test('pages through other releases to find the newest Studio one', () => {
  const others = Array.from({ length: 100 }, (_, i) => ({
    tag_name: `@codaco/fresco-ui@2.0.${i}`,
    draft: false,
    prerelease: false,
    assets: [],
  }));
  const r = run(
    setup({ api: NEW_API, web: NEW_WEB, pages: [others, RELEASES] }),
  );
  assert.equal(r.status, 0, r.output);
  assert.match(r.output, /up to date with 0\.4\.0/);
  assert.equal(r.requests[1], `GET ${API}/releases?per_page=100&page=2 `);
});

test('keeps the token out of curl’s arguments and bounds every request', () => {
  const r = run(setup());
  assert.equal(r.status, 0, r.output);
  assert.ok(r.argv.length > 0);
  for (const argv of r.argv) {
    assert.doesNotMatch(argv, /token/);
    assert.match(argv, /--max-time 120/);
  }
});

test('fails, rather than skipping, when flock itself fails', () => {
  const s = setup();
  stub(s.bin, 'flock', '#!/usr/bin/env bash\nexit 1\n');
  const r = run(s);
  assert.equal(r.status, 1, r.output);
  assert.match(r.output, /could not take the lock/);
  assert.deepEqual(r.requests, []);
});

test('changes nothing when the release’s compose file needs a variable .env lacks', () => {
  const r = run(setup(), {
    env: {
      STUB_COMPOSE_STDERR:
        'time="2026-10-22T12:00:00Z" level=warning msg="The \\"STUDIO_NEW_SETTING\\" variable is not set. Defaulting to a blank string."',
    },
  });
  assert.equal(r.status, 1, r.output);
  assert.match(r.output, /Studio 0\.4\.0 needs STUDIO_NEW_SETTING in \.env/);
  assert.deepEqual(r.upgrade, []);
  assert.equal(
    r.requests.some((line) => line.startsWith('POST')),
    false,
  );
  assert.equal(r.halted, null);
});

test('changes nothing when Compose rejects the release’s compose file', () => {
  const r = run(setup(), {
    env: { STUB_COMPOSE_EXIT: '1', STUB_COMPOSE_STDERR: 'invalid' },
  });
  assert.equal(r.status, 1, r.output);
  assert.match(
    r.output,
    /Compose rejects the docker-compose\.yml of Studio 0\.4\.0/,
  );
  assert.deepEqual(r.upgrade, []);
  assert.equal(r.halted, null);
});
