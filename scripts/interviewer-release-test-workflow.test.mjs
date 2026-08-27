import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// Offline tests for the verdict logic of the Interviewer release smoke-test
// workflow (.claude/workflows/interviewer-release-test.js). The workflow body
// runs with stubbed agent/parallel/pipeline globals and canned agent results,
// so every fail-closed guard in the synthesis is exercised without spawning
// agents or touching a deployment. WF_UNDER_TEST overrides the script path
// for mutation-testing the guards.
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const workflowPath =
  process.env.WF_UNDER_TEST ??
  path.join(repoRoot, '.claude', 'workflows', 'interviewer-release-test.js');
const source = readFileSync(workflowPath, 'utf8');
// The runtime evaluates the script as a function body with injected globals;
// mirror that by dropping the `export const meta` statement and wrapping the
// rest (the body uses top-level await and top-level return).
const bodyStart = source.indexOf('};\n\nconst DEFAULT_URL');
assert.notEqual(bodyStart, -1, 'meta anchor not found in workflow source');
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const runBody = new AsyncFunction(
  'agent',
  'parallel',
  'pipeline',
  'phase',
  'log',
  'args',
  'budget',
  'workflow',
  source.slice(bodyStart + 2),
);

const phase = () => {};
const log = () => {};
const pipeline = async (items, s1, s2) => {
  const out = [];
  for (const [i, item] of items.entries()) {
    let r = await s1(item, item, i);
    if (s2) r = await s2(r, item, i);
    out.push(r);
  }
  return out;
};
const parallel = async (thunks) =>
  Promise.all(thunks.map((t) => t().catch(() => null)));

const run = (agentImpl, args) =>
  runBody(
    agentImpl,
    parallel,
    pipeline,
    phase,
    log,
    args,
    undefined,
    undefined,
  );

const PREFLIGHT = {
  ok: true,
  fingerprint: 'abcd1234abcd1234',
  workDir: '/tmp/x',
  repoRoot: '/tmp/r',
  version: '9.9.9',
  failures: [],
  notes: '',
};

const EXPECTED_CHECKS = {
  'protocol-management': 9,
  'conduct-sample-interview': 7,
  'session-management': 8,
  'data-export': 7,
  'security-vault': 10,
  'pwa-offline': 10,
  'settings-and-chrome': 9,
};

const mkChecks = (n, { failAt = [], skipAt = [] } = {}) =>
  Array.from({ length: n }, (_, k) => ({
    name: `${k + 1}. check`,
    status: failAt.includes(k + 1)
      ? 'fail'
      : skipAt.includes(k + 1)
        ? 'skipped'
        : 'pass',
    detail: 'x',
  }));

// Canned-result agent: journeys get a valid artifactsDir injected unless the
// fixture sets one; the evidence audit confirms every claimed directory
// unless a fixture overrides it.
function makeAgent(journeyResults, verifyResults = {}, evidenceResult) {
  return async (prompt, opts) => {
    if (opts.label === 'preflight') return PREFLIGHT;
    if (opts.label === 'verify:evidence') {
      if (evidenceResult !== undefined) return evidenceResult;
      return {
        fingerprint: PREFLIGHT.fingerprint,
        entries: [
          ...Object.keys(journeyResults).map((k) => ({
            journey: k,
            exists: true,
            screenshots: 25,
            checkpointNumbers: Array.from({ length: 25 }, (_, i) => i + 1),
            stageNumbers: Array.from({ length: 25 }, (_, i) => i + 1),
          })),
          ...Object.keys(verifyResults).map((k) => ({
            journey: `verify-${k}`,
            exists: true,
            screenshots: 5,
            checkpointNumbers: [1, 2, 3, 4, 5],
            stageNumbers: [],
          })),
        ],
      };
    }
    if (opts.label.startsWith('journey:')) {
      const key = opts.label.slice(8);
      const r = journeyResults[key];
      return r ? { artifactsDir: `/tmp/x/${key}`, ...r } : r;
    }
    if (opts.label.startsWith('verify:'))
      return verifyResults[opts.label.slice(7)];
    throw new Error(`unexpected agent ${opts.label}`);
  };
}

const journey = (key, overrides = {}) => ({
  journey: key,
  status: 'pass',
  checks: mkChecks(EXPECTED_CHECKS[key]),
  failures: [],
  ...(key === 'conduct-sample-interview'
    ? { traversedStages: Array.from({ length: 25 }, (_, i) => i + 1) }
    : {}),
  ...overrides,
});

test('a failing status without failure records is incomplete', async () => {
  const jr = {
    'pwa-offline': journey('pwa-offline', {
      status: 'fail',
      checks: mkChecks(10, { failAt: [1] }),
    }),
  };
  const res = await run(makeAgent(jr), { journeys: ['pwa-offline'] });
  assert.equal(res.verdict, 'INCOMPLETE');
  assert.ok(res.inconsistentJourneys.includes('pwa-offline'));
});

test('a partial verifier response never dismisses unmatched failures', async () => {
  const jr = {
    'pwa-offline': journey('pwa-offline', {
      status: 'fail',
      checks: mkChecks(10, { failAt: [1] }),
      failures: [
        {
          severity: 'major',
          description: 'failure A',
          check: 1,
          reproduction: 'r',
        },
        { severity: 'minor', description: 'failure B', reproduction: 'r' },
      ],
    }),
  };
  const vr = {
    'pwa-offline': {
      verdicts: [
        {
          description: 'failure B',
          failure: 2,
          verdict: 'not-reproduced',
          severity: 'minor',
          explanation: 'nope',
        },
      ],
    },
  };
  const res = await run(makeAgent(jr, vr), { journeys: ['pwa-offline'] });
  assert.ok(res.unverifiedFailures.some((f) => f.description === 'failure A'));
  assert.equal(res.verdict, 'BLOCK');
  assert.ok(res.summaryMarkdown.includes('Unverified failures'));
  assert.equal(
    res.automationIssues.filter((a) => a.includes('failure B')).length,
    1,
  );
});

test('verdicts bind by failure id, never by position', async () => {
  const base = journey('pwa-offline', {
    status: 'fail',
    checks: mkChecks(10, { failAt: [1] }),
    failures: [
      {
        severity: 'minor',
        description: 'failure A',
        check: 1,
        reproduction: 'r',
      },
      {
        severity: 'major',
        description: 'failure B',
        check: 1,
        reproduction: 'r',
      },
    ],
  });
  // Paraphrased verdicts WITH ids bind correctly.
  const withIds = await run(
    makeAgent(
      { 'pwa-offline': base },
      {
        'pwa-offline': {
          verdicts: [
            {
              description: 'A (reworded)',
              failure: 1,
              verdict: 'confirmed',
              severity: 'minor',
              explanation: 'yes',
            },
            {
              description: 'B (reworded)',
              failure: 2,
              verdict: 'automation-issue',
              severity: 'minor',
              explanation: 'harness',
            },
          ],
        },
      },
    ),
    { journeys: ['pwa-offline'] },
  );
  assert.equal(withIds.confirmedFailures.length, 1);
  assert.equal(withIds.confirmedFailures[0].description, 'failure A');
  assert.equal(withIds.verdict, 'PASS_WITH_ISSUES');
  // Paraphrased verdicts WITHOUT ids bind nothing — fail closed on the major.
  const withoutIds = await run(
    makeAgent(
      { 'pwa-offline': base },
      {
        'pwa-offline': {
          verdicts: [
            {
              description: 'first issue (reworded)',
              verdict: 'not-reproduced',
              severity: 'minor',
              explanation: 'n',
            },
            {
              description: 'second issue (reworded)',
              verdict: 'not-reproduced',
              severity: 'minor',
              explanation: 'n',
            },
          ],
        },
      },
    ),
    { journeys: ['pwa-offline'] },
  );
  assert.equal(withoutIds.unverifiedFailures.length, 2);
  assert.equal(withoutIds.verdict, 'BLOCK');
});

test('a confirmed major on a passing journey blocks', async () => {
  const jr = {
    'pwa-offline': journey('pwa-offline', {
      failures: [
        { severity: 'major', description: 'incidental', reproduction: 'r' },
      ],
    }),
  };
  const vr = {
    'pwa-offline': {
      verdicts: [
        {
          description: 'incidental',
          failure: 1,
          verdict: 'confirmed',
          severity: 'major',
          explanation: 'real',
        },
      ],
    },
  };
  const res = await run(makeAgent(jr, vr), { journeys: ['pwa-offline'] });
  assert.equal(res.verdict, 'BLOCK');
});

test('truncated, misnumbered, or misreported reports are incomplete', async () => {
  const truncated = await run(
    makeAgent({ 'pwa-offline': journey('pwa-offline', { checks: [] }) }),
    { journeys: ['pwa-offline'] },
  );
  assert.equal(truncated.verdict, 'INCOMPLETE');
  assert.ok(truncated.summaryMarkdown.includes('❌ pwa-offline'));

  const dupChecks = mkChecks(10);
  dupChecks[4] = { name: '4. check', status: 'pass', detail: 'duplicate' };
  const misnumbered = await run(
    makeAgent({ 'pwa-offline': journey('pwa-offline', { checks: dupChecks }) }),
    { journeys: ['pwa-offline'] },
  );
  assert.equal(misnumbered.verdict, 'INCOMPLETE');
  assert.ok(
    misnumbered.certificationGaps.some((a) => a.includes('position(s) 5')),
  );

  const misreported = await run(
    makeAgent({
      'pwa-offline': journey('pwa-offline', { journey: '', checks: [] }),
    }),
    { journeys: ['pwa-offline'] },
  );
  assert.equal(misreported.verdict, 'INCOMPLETE');
  assert.ok(misreported.certificationGaps.some((a) => a.includes('(empty)')));
  assert.equal(misreported.journeys[0].journey, 'pwa-offline');
});

test('skips outside the whitelist and broken skip pairs are incomplete', async () => {
  const allowed = await run(
    makeAgent({
      'pwa-offline': journey('pwa-offline', {
        checks: mkChecks(10, { skipAt: [10] }),
      }),
    }),
    { journeys: ['pwa-offline'] },
  );
  assert.equal(allowed.verdict, 'PASS');

  const disallowed = await run(
    makeAgent({
      'pwa-offline': journey('pwa-offline', {
        checks: mkChecks(10, { skipAt: [4] }),
      }),
    }),
    { journeys: ['pwa-offline'] },
  );
  assert.equal(disallowed.verdict, 'INCOMPLETE');
  assert.ok(disallowed.certificationGaps.some((a) => a.includes('#4')));

  for (const skipAt of [[7], [6]]) {
    const halfPair = await run(
      makeAgent({
        'protocol-management': journey('protocol-management', {
          checks: mkChecks(9, { skipAt }),
        }),
      }),
      { journeys: ['protocol-management'] },
    );
    assert.equal(halfPair.verdict, 'INCOMPLETE', `lone skip of ${skipAt}`);
  }
});

test('invalid journeys args throw instead of narrowing coverage', async () => {
  await assert.rejects(
    run(makeAgent({}), { journeys: ['pwa-offline', 'nope'] }),
    /nope/,
  );
  await assert.rejects(
    run(makeAgent({}), { journeys: 'data-export' }),
    /array/,
  );
});

test('preflight invariants are enforced in code, not agent self-report', async () => {
  const okButFailures = async (p, o) =>
    o.label === 'preflight'
      ? { ...PREFLIGHT, ok: true, failures: ['manifest invalid'] }
      : null;
  const inconsistent = await run(okButFailures, undefined);
  assert.equal(inconsistent.verdict, 'BLOCKED');
  assert.ok(inconsistent.summaryMarkdown.includes('manifest invalid'));

  const staleDeploy = await run(makeAgent({}), {
    journeys: ['pwa-offline'],
    expectedVersion: '9.9.8',
  });
  assert.equal(staleDeploy.verdict, 'BLOCKED');
  assert.ok(staleDeploy.summaryMarkdown.includes('stale or wrong'));

  const emptyWorkDir = async (p, o) =>
    o.label === 'preflight' ? { ...PREFLIGHT, workDir: '' } : null;
  assert.equal(
    (await run(emptyWorkDir, { journeys: ['pwa-offline'] })).verdict,
    'BLOCKED',
  );

  const dead = async (p, o) =>
    o.label === 'preflight'
      ? { ...PREFLIGHT, ok: false, failures: ['down'] }
      : null;
  assert.equal((await run(dead, undefined)).verdict, 'BLOCKED');
});

test('evidence must exist on disk with per-check identity', async () => {
  const clean = journey('pwa-offline');
  const foreignDir = await run(
    makeAgent({
      'pwa-offline': { ...clean, artifactsDir: '/elsewhere/dir' },
    }),
    { journeys: ['pwa-offline'] },
  );
  assert.equal(foreignDir.verdict, 'INCOMPLETE');

  const runRoot = await run(
    makeAgent({ 'pwa-offline': { ...clean, artifactsDir: '/tmp/x' } }),
    { journeys: ['pwa-offline'] },
  );
  assert.equal(runRoot.verdict, 'INCOMPLETE');

  const contradicted = await run(
    makeAgent(
      { 'pwa-offline': clean },
      {},
      {
        entries: [
          {
            journey: 'pwa-offline',
            exists: false,
            screenshots: 0,
            checkpointNumbers: [],
            stageNumbers: Array.from({ length: 25 }, (_, i) => i + 1),
          },
        ],
      },
    ),
    { journeys: ['pwa-offline'] },
  );
  assert.equal(contradicted.verdict, 'INCOMPLETE');

  const deadAudit = await run(makeAgent({ 'pwa-offline': clean }, {}, null), {
    journeys: ['pwa-offline'],
  });
  assert.equal(deadAudit.verdict, 'INCOMPLETE');

  // Right cardinality, wrong identity: an out-of-range prefix cannot stand
  // in for a missing check's capture.
  const identityMismatch = await run(
    makeAgent(
      { 'pwa-offline': clean },
      {},
      {
        entries: [
          {
            journey: 'pwa-offline',
            exists: true,
            screenshots: 30,
            checkpointNumbers: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
            stageNumbers: Array.from({ length: 25 }, (_, i) => i + 1),
          },
        ],
      },
    ),
    { journeys: ['pwa-offline'] },
  );
  assert.equal(identityMismatch.verdict, 'INCOMPLETE');
  assert.ok(
    identityMismatch.certificationGaps.some((a) => a.includes('check(s) #1')),
  );

  // The legitimate import pair-skip leaves seven executed checks — seven
  // per-check captures satisfy the audit.
  const pairSkip = await run(
    makeAgent(
      {
        'protocol-management': journey('protocol-management', {
          checks: mkChecks(9, { skipAt: [6, 7] }),
        }),
      },
      {},
      {
        fingerprint: PREFLIGHT.fingerprint,
        entries: [
          {
            journey: 'protocol-management',
            exists: true,
            screenshots: 7,
            checkpointNumbers: [1, 2, 3, 4, 5, 8, 9],
            stageNumbers: Array.from({ length: 25 }, (_, i) => i + 1),
          },
        ],
      },
    ),
    { journeys: ['protocol-management'] },
  );
  assert.equal(pairSkip.verdict, 'PASS');
});

test('failed checks need failure records bound by check number', async () => {
  const jr = {
    'pwa-offline': journey('pwa-offline', {
      status: 'fail',
      checks: mkChecks(10, { failAt: [1, 2] }),
      failures: [
        {
          severity: 'minor',
          description: 'covers 1 only',
          check: 1,
          reproduction: 'r',
        },
      ],
    }),
  };
  const vr = {
    'pwa-offline': {
      verdicts: [
        {
          description: 'covers 1 only',
          failure: 1,
          verdict: 'not-reproduced',
          severity: 'minor',
          explanation: 'n',
        },
      ],
    },
  };
  const res = await run(makeAgent(jr, vr), { journeys: ['pwa-offline'] });
  assert.equal(res.verdict, 'INCOMPLETE');
  assert.ok(res.certificationGaps.some((a) => a.includes('#2')));
});

test('unadjudicated failures cap the run at INCOMPLETE', async () => {
  const jr = {
    'pwa-offline': journey('pwa-offline', {
      status: 'fail',
      checks: mkChecks(10, { failAt: [1] }),
      failures: [
        {
          severity: 'minor',
          description: 'small',
          check: 1,
          reproduction: 'r',
        },
      ],
    }),
  };
  const emptyVerdicts = await run(
    makeAgent(jr, { 'pwa-offline': { verdicts: [] } }),
    { journeys: ['pwa-offline'] },
  );
  assert.equal(emptyVerdicts.verdict, 'INCOMPLETE');
  assert.equal(emptyVerdicts.unverifiedFailures.length, 1);

  const deadVerifier = await run(makeAgent(jr, {}), {
    journeys: ['pwa-offline'],
  });
  assert.equal(deadVerifier.verdict, 'INCOMPLETE');
});

test('verifier-discovered defects surface; attribution cannot be hijacked', async () => {
  const jr = {
    'pwa-offline': journey('pwa-offline', {
      status: 'fail',
      checks: mkChecks(10, { failAt: [1] }),
      failures: [
        {
          severity: 'minor',
          description: 'attributed',
          check: 1,
          journey: 'data-export',
          reproduction: 'r',
        },
      ],
    }),
  };
  const vr = {
    'pwa-offline': {
      verdicts: [
        {
          description: 'attributed',
          failure: 1,
          verdict: 'confirmed',
          severity: 'minor',
          explanation: 'real',
        },
        {
          description: 'NEW: sort wipes all rows',
          verdict: 'confirmed',
          severity: 'minor',
          explanation: 'found while reproducing',
        },
      ],
    },
  };
  const res = await run(makeAgent(jr, vr), { journeys: ['pwa-offline'] });
  assert.equal(res.confirmedFailures[0].journey, 'pwa-offline');
  assert.ok(
    res.confirmedFailures.some((f) => f.description.startsWith('NEW:')),
  );
});

test('only full pinned runs certify', async () => {
  const jr = Object.fromEntries(
    Object.keys(EXPECTED_CHECKS).map((k) => [k, journey(k)]),
  );
  const unpinned = await run(makeAgent(jr), undefined);
  assert.equal(unpinned.verdict, 'PASS');
  assert.equal(unpinned.certifying, false);
  assert.ok(
    unpinned.summaryMarkdown.includes('unpinned run — not release-certifying'),
  );

  const pinnedDefaultTarget = await run(makeAgent(jr), {
    expectedVersion: '9.9.9',
  });
  assert.equal(pinnedDefaultTarget.verdict, 'PASS');
  assert.equal(pinnedDefaultTarget.certifying, false);
  assert.ok(
    pinnedDefaultTarget.summaryMarkdown.includes('not a candidate deployment'),
  );
  const pinnedDevOrigin = await run(makeAgent(jr), {
    url: 'https://interviewer.networkcanvas.dev',
    expectedVersion: '9.9.9',
  });
  assert.equal(pinnedDevOrigin.certifying, false);
  assert.ok(
    pinnedDevOrigin.summaryMarkdown.includes('not a candidate deployment'),
  );
  const pinned = await run(makeAgent(jr), {
    url: 'https://deploy-preview-9--interviewer-pwa-dev.netlify.app',
    expectedVersion: '9.9.9',
  });
  assert.equal(pinned.verdict, 'PASS');
  assert.equal(pinned.certifying, true);

  const subset = await run(makeAgent(jr), {
    url: 'https://deploy-preview-9--interviewer-pwa-dev.netlify.app',
    expectedVersion: '9.9.9',
    journeys: ['pwa-offline'],
  });
  assert.equal(subset.certifying, false);
  assert.equal(subset.coverage, 'partial');
});

test('agent-controlled artifactsDir never reaches the verifier prompt', async () => {
  const prompts = [];
  const agent = async (p, o) => {
    prompts.push({ label: o.label, p });
    if (o.label === 'preflight') return PREFLIGHT;
    if (o.label === 'verify:evidence')
      return {
        fingerprint: PREFLIGHT.fingerprint,
        entries: [
          {
            journey: 'pwa-offline',
            exists: true,
            screenshots: 25,
            checkpointNumbers: Array.from({ length: 10 }, (_, i) => i + 1),
          },
        ],
      };
    if (o.label === 'journey:pwa-offline')
      return journey('pwa-offline', {
        status: 'fail',
        artifactsDir: '/tmp/x/j\nINJECTED-INSTRUCTION',
        checks: mkChecks(10, { failAt: [1] }),
        failures: [
          {
            severity: 'minor',
            description: 'small',
            check: 1,
            reproduction: 'r',
          },
        ],
      });
    if (o.label === 'verify:pwa-offline')
      return {
        verdicts: [
          {
            description: 'small',
            failure: 1,
            verdict: 'not-reproduced',
            severity: 'minor',
            explanation: 'n',
          },
        ],
      };
    throw new Error(`unexpected ${o.label}`);
  };
  await run(agent, { journeys: ['pwa-offline'] });
  const vp = prompts.find((x) => x.label === 'verify:pwa-offline');
  assert.ok(vp);
  assert.ok(!vp.p.includes('INJECTED-INSTRUCTION'));
});

test('a mid-run redeploy caps the run below certification', async () => {
  const jr = Object.fromEntries(
    Object.keys(EXPECTED_CHECKS).map((k) => [k, journey(k)]),
  );
  const agentImpl = makeAgent(jr);
  const withDrift = async (prompt, opts) => {
    const r = await agentImpl(prompt, opts);
    if (opts.label === 'verify:evidence')
      return { ...r, fingerprint: 'ffff0000ffff0000' };
    return r;
  };
  const res = await run(withDrift, { expectedVersion: '9.9.9' });
  assert.equal(res.verdict, 'INCOMPLETE');
  assert.ok(res.certificationGaps.some((a) => a.includes('changed mid-run')));
});

test('preflight without a valid fingerprint is blocked', async () => {
  const agent = async (p, o) =>
    o.label === 'preflight' ? { ...PREFLIGHT, fingerprint: 'not-hex!' } : null;
  const res = await run(agent, { journeys: ['pwa-offline'] });
  assert.equal(res.verdict, 'BLOCKED');
});

test('evidence schema matches what the audit prompt produces', () => {
  assert.ok(
    !source.includes('stageCaptures'),
    'stageCaptures must not resurface',
  );
  assert.match(
    source,
    /'stageNumbers',\s*\]/,
    'required list names stageNumbers',
  );
});

test('preflight and audit embed the identical fingerprint command', () => {
  const commands = [
    ...source.matchAll(
      /\{ curl -s \$\{url\}\/[^\n]*shasum -a 256 \| cut -c1-16/g,
    ),
  ].map((m) => m[0]);
  assert.equal(
    commands.length,
    2,
    'expected the command in exactly two prompts',
  );
  assert.equal(commands[0], commands[1]);
});

test('hostile url and version args are rejected before interpolation', async () => {
  await assert.rejects(
    run(makeAgent({}), {
      url: 'https://x.dev/; rm -rf ~',
      journeys: ['pwa-offline'],
    }),
    /plain https origin/,
  );
  await assert.rejects(
    run(makeAgent({}), { url: 'http://plain.dev', journeys: ['pwa-offline'] }),
    /plain https origin/,
  );
  await assert.rejects(
    run(makeAgent({}), {
      expectedVersion: '1.0 `whoami`',
      journeys: ['pwa-offline'],
    }),
    /plain version string/,
  );
  const ok = await run(makeAgent({ 'pwa-offline': journey('pwa-offline') }), {
    url: 'https://deploy-preview-9--interviewer-pwa-dev.netlify.app',
    journeys: ['pwa-offline'],
  });
  assert.equal(ok.verdict, 'PASS');
});

test('a permitted skip still needs a nonempty reason', async () => {
  const checks = mkChecks(10, { skipAt: [10] });
  checks[9] = { name: '10. check', status: 'skipped' };
  const res = await run(
    makeAgent({ 'pwa-offline': journey('pwa-offline', { checks }) }),
    { journeys: ['pwa-offline'] },
  );
  assert.equal(res.verdict, 'INCOMPLETE');
  assert.ok(res.certificationGaps.some((a) => a.includes('#10')));
});

test('verifier-discovered defects keep their reproduction steps', async () => {
  const jr = {
    'pwa-offline': journey('pwa-offline', {
      status: 'fail',
      checks: mkChecks(10, { failAt: [1] }),
      failures: [
        {
          severity: 'minor',
          description: 'small',
          check: 1,
          reproduction: 'r',
        },
      ],
    }),
  };
  const vr = {
    'pwa-offline': {
      verdicts: [
        {
          description: 'small',
          failure: 1,
          verdict: 'not-reproduced',
          severity: 'minor',
          explanation: 'n',
        },
        {
          description: 'NEW: found it',
          verdict: 'confirmed',
          severity: 'major',
          explanation: 'e',
          reproduction: '1. do X 2. see Y',
        },
      ],
    },
  };
  const res = await run(makeAgent(jr, vr), { journeys: ['pwa-offline'] });
  const discovered = res.confirmedFailures.find((f) =>
    f.description.startsWith('NEW:'),
  );
  assert.equal(discovered.reproduction, '1. do X 2. see Y');
  // Omitting the steps still blocks, and the report names its own gap.
  const vrNoSteps = {
    'pwa-offline': {
      verdicts: [
        {
          description: 'small',
          failure: 1,
          verdict: 'not-reproduced',
          severity: 'minor',
          explanation: 'n',
        },
        {
          description: 'NEW: found it',
          verdict: 'confirmed',
          severity: 'major',
          explanation: 'e',
        },
      ],
    },
  };
  const res2 = await run(makeAgent(jr, vrNoSteps), {
    journeys: ['pwa-offline'],
  });
  assert.equal(res2.verdict, 'BLOCK');
  assert.ok(
    res2.certificationGaps.some((a) => a.includes('no reproduction steps')),
  );
});

test('an evidence-free verifier cannot dismiss failures', async () => {
  const jr = {
    'pwa-offline': journey('pwa-offline', {
      status: 'fail',
      checks: mkChecks(10, { failAt: [1] }),
      failures: [
        {
          severity: 'major',
          description: 'real one',
          check: 1,
          reproduction: 'r',
        },
      ],
    }),
  };
  const vr = {
    'pwa-offline': {
      verdicts: [
        {
          description: 'real one',
          failure: 1,
          verdict: 'not-reproduced',
          severity: 'minor',
          explanation: 'trust me',
        },
      ],
    },
  };
  // Default stub provides verifier evidence: the dismissal is accepted.
  const evidenced = await run(makeAgent(jr, vr), { journeys: ['pwa-offline'] });
  assert.equal(evidenced.unverifiedFailures.length, 0);
  // Same verdicts with NO on-disk verifier evidence: dismissal rejected,
  // the major stays unverified and blocks.
  const bare = await run(
    makeAgent(jr, vr, {
      fingerprint: PREFLIGHT.fingerprint,
      entries: [
        {
          journey: 'pwa-offline',
          exists: true,
          screenshots: 25,
          checkpointNumbers: Array.from({ length: 25 }, (_, i) => i + 1),
        },
      ],
    }),
    { journeys: ['pwa-offline'] },
  );
  assert.equal(bare.verdict, 'BLOCK');
  assert.ok(bare.unverifiedFailures.some((f) => f.description === 'real one'));
  assert.ok(
    bare.certificationGaps.some((a) =>
      a.includes('dismissals are not accepted'),
    ),
  );
});

test('every certification gap caps the verdict', async () => {
  const jr = {
    'pwa-offline': journey('pwa-offline', {
      status: 'fail',
      checks: mkChecks(10, { failAt: [1] }),
      failures: [
        {
          severity: 'minor',
          description: 'small',
          check: 1,
          reproduction: 'r',
        },
      ],
    }),
  };
  const vr = {
    'pwa-offline': {
      verdicts: [
        {
          description: 'small',
          failure: 1,
          verdict: 'confirmed',
          severity: 'minor',
          explanation: 'real',
        },
        {
          description: 'NEW: minor found',
          verdict: 'confirmed',
          severity: 'minor',
          explanation: 'e',
        },
      ],
    },
  };
  const res = await run(makeAgent(jr, vr), { journeys: ['pwa-offline'] });
  assert.equal(res.verdict, 'INCOMPLETE');
  assert.ok(
    res.certificationGaps.some((a) => a.includes('no reproduction steps')),
  );
});

test('conduct needs distinct per-stage captures, not raw totals', async () => {
  const jr = {
    'conduct-sample-interview': journey('conduct-sample-interview'),
  };
  const res = await run(
    makeAgent(
      jr,
      {},
      {
        fingerprint: PREFLIGHT.fingerprint,
        entries: [
          {
            journey: 'conduct-sample-interview',
            exists: true,
            screenshots: 40,
            checkpointNumbers: [1, 2, 3, 4, 5, 6, 7],
            stageNumbers: [],
          },
        ],
      },
    ),
    { journeys: ['conduct-sample-interview'] },
  );
  assert.equal(res.verdict, 'INCOMPLETE');
  assert.ok(
    res.certificationGaps.some((a) =>
      a.includes('no capture for traversed stage(s)'),
    ),
  );
});

test('dismissals bind to per-failure verifier captures', async () => {
  const jr = {
    'pwa-offline': journey('pwa-offline', {
      status: 'fail',
      checks: mkChecks(10, { failAt: [1] }),
      failures: [
        {
          severity: 'major',
          description: 'first',
          check: 1,
          reproduction: 'r',
        },
        {
          severity: 'minor',
          description: 'second',
          check: 1,
          reproduction: 'r',
        },
      ],
    }),
  };
  const vr = {
    'pwa-offline': {
      verdicts: [
        {
          description: 'first',
          failure: 1,
          verdict: 'not-reproduced',
          severity: 'minor',
          explanation: 'n',
        },
        {
          description: 'second',
          failure: 2,
          verdict: 'not-reproduced',
          severity: 'minor',
          explanation: 'n',
        },
      ],
    },
  };
  const res = await run(
    makeAgent(jr, vr, {
      fingerprint: PREFLIGHT.fingerprint,
      entries: [
        {
          journey: 'pwa-offline',
          exists: true,
          screenshots: 25,
          checkpointNumbers: Array.from({ length: 10 }, (_, i) => i + 1),
          stageNumbers: [],
        },
        {
          journey: 'verify-pwa-offline',
          exists: true,
          screenshots: 1,
          checkpointNumbers: [2],
          stageNumbers: [],
        },
      ],
    }),
    { journeys: ['pwa-offline'] },
  );
  assert.equal(res.verdict, 'BLOCK');
  assert.ok(res.unverifiedFailures.some((f) => f.description === 'first'));
  assert.ok(!res.unverifiedFailures.some((f) => f.description === 'second'));
});

test('unbindable numbered verdicts are never promoted as discoveries', async () => {
  const jr = {
    'pwa-offline': journey('pwa-offline', {
      status: 'fail',
      checks: mkChecks(10, { failAt: [1] }),
      failures: [
        {
          severity: 'minor',
          description: 'only one',
          check: 1,
          reproduction: 'r',
        },
      ],
    }),
  };
  const vr = {
    'pwa-offline': {
      verdicts: [
        {
          description: 'only one',
          failure: 1,
          verdict: 'confirmed',
          severity: 'minor',
          explanation: 'real',
        },
        {
          description: 'phantom duplicate',
          failure: 1,
          verdict: 'confirmed',
          severity: 'blocker',
          explanation: 'malformed',
        },
      ],
    },
  };
  const res = await run(makeAgent(jr, vr), { journeys: ['pwa-offline'] });
  assert.ok(
    !res.confirmedFailures.some((f) => f.description === 'phantom duplicate'),
  );
  assert.notEqual(res.verdict, 'BLOCK');
  assert.equal(res.verdict, 'INCOMPLETE');
  assert.ok(res.certificationGaps.some((a) => a.includes('unbindable')));
});

test('malformed preflight paths are blocked', async () => {
  const badWorkDir = async (p, o) =>
    o.label === 'preflight'
      ? { ...PREFLIGHT, workDir: '/tmp/x\n### INJECT' }
      : null;
  assert.equal(
    (await run(badWorkDir, { journeys: ['pwa-offline'] })).verdict,
    'BLOCKED',
  );
  const badRepoRoot = async (p, o) =>
    o.label === 'preflight' ? { ...PREFLIGHT, repoRoot: 'not-a-path' } : null;
  assert.equal(
    (await run(badRepoRoot, { journeys: ['pwa-offline'] })).verdict,
    'BLOCKED',
  );
});

test('an unnumbered verbatim verdict never dismisses a reported failure', async () => {
  const jr = {
    'pwa-offline': journey('pwa-offline', {
      status: 'fail',
      checks: mkChecks(10, { failAt: [1] }),
      failures: [
        {
          severity: 'major',
          description: 'the real one',
          check: 1,
          reproduction: 'r',
        },
      ],
    }),
  };
  const vr = {
    'pwa-offline': {
      verdicts: [
        {
          description: 'the real one',
          verdict: 'not-reproduced',
          severity: 'minor',
          explanation: 'verbatim but unnumbered',
        },
      ],
    },
  };
  const res = await run(makeAgent(jr, vr), { journeys: ['pwa-offline'] });
  assert.equal(res.verdict, 'BLOCK');
  assert.ok(
    res.unverifiedFailures.some((f) => f.description === 'the real one'),
  );
});

test('a zero failure id is unbindable, never a discovery', async () => {
  const jr = {
    'pwa-offline': journey('pwa-offline', {
      status: 'fail',
      checks: mkChecks(10, { failAt: [1] }),
      failures: [
        {
          severity: 'minor',
          description: 'small',
          check: 1,
          reproduction: 'r',
        },
      ],
    }),
  };
  const vr = {
    'pwa-offline': {
      verdicts: [
        {
          description: 'small',
          failure: 1,
          verdict: 'confirmed',
          severity: 'minor',
          explanation: 'real',
        },
        {
          description: 'phantom',
          failure: 0,
          verdict: 'confirmed',
          severity: 'blocker',
          explanation: 'malformed',
        },
      ],
    },
  };
  const res = await run(makeAgent(jr, vr), { journeys: ['pwa-offline'] });
  assert.ok(!res.confirmedFailures.some((f) => f.description === 'phantom'));
  assert.notEqual(res.verdict, 'BLOCK');
  assert.ok(res.certificationGaps.some((a) => a.includes('unbindable')));
});

test('cosmetic developer-origin variants never certify', async () => {
  const jr = Object.fromEntries(
    Object.keys(EXPECTED_CHECKS).map((k) => [k, journey(k)]),
  );
  for (const variant of [
    'https://interviewer.networkcanvas.dev:443',
    'https://INTERVIEWER.networkcanvas.dev',
  ]) {
    const res = await run(makeAgent(jr), {
      url: variant,
      expectedVersion: '9.9.9',
    });
    assert.equal(res.certifying, false, variant);
  }
});

test('repeated stage ids do not satisfy the conduct walk floor', async () => {
  const jr = {
    'conduct-sample-interview': journey('conduct-sample-interview', {
      traversedStages: Array.from({ length: 25 }, () => 3),
    }),
  };
  const res = await run(makeAgent(jr), {
    journeys: ['conduct-sample-interview'],
  });
  assert.equal(res.verdict, 'INCOMPLETE');
  assert.ok(
    res.certificationGaps.some((a) => a.includes('distinct traversed stages')),
  );
});

test('unevidenced severity downgrades keep the reported severity', async () => {
  const jr = {
    'pwa-offline': journey('pwa-offline', {
      status: 'fail',
      checks: mkChecks(10, { failAt: [1] }),
      failures: [
        {
          severity: 'major',
          description: 'big one',
          check: 1,
          reproduction: 'r',
        },
      ],
    }),
  };
  const vr = {
    'pwa-offline': {
      verdicts: [
        {
          description: 'big one',
          failure: 1,
          verdict: 'confirmed',
          severity: 'minor',
          explanation: 'softened',
        },
      ],
    },
  };
  // No verifier evidence entry: the downgrade is rejected, major blocks.
  const bare = await run(
    makeAgent(jr, vr, {
      fingerprint: PREFLIGHT.fingerprint,
      entries: [
        {
          journey: 'pwa-offline',
          exists: true,
          screenshots: 25,
          checkpointNumbers: Array.from({ length: 10 }, (_, i) => i + 1),
          stageNumbers: [],
        },
      ],
    }),
    { journeys: ['pwa-offline'] },
  );
  assert.equal(bare.verdict, 'BLOCK');
  assert.ok(bare.certificationGaps.some((a) => a.includes('downgraded')));
  // With per-failure verifier evidence the downgrade is accepted.
  const evidenced = await run(makeAgent(jr, vr), { journeys: ['pwa-offline'] });
  assert.notEqual(evidenced.verdict, 'BLOCK');
});

test('a dead journey is incomplete', async () => {
  const res = await run(makeAgent({ 'pwa-offline': null }), {
    journeys: ['pwa-offline'],
  });
  assert.equal(res.verdict, 'INCOMPLETE');
});
