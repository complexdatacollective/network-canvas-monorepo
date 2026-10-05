#!/usr/bin/env node
// What an ENABLED deployment sends to the analytics relay.
//
// Every other lane runs with `DISABLE_ANALYTICS` and asks whether the
// deployment stays silent. That question cannot reach any of the pending
// analytics behaviour, because a disabled deployment never loads posthog-js at
// all: session replay being off, autocapture being off, element data being
// stripped, interview identifiers being dropped and entity ids being
// pseudonymised are all statements about what an enabled deployment PUTS ON
// THE WIRE, and the only way to check them is to read the wire.
//
// So this lane runs with analytics on, against a sink that terminates TLS and
// records every request (relay-payload-sink.mjs) — reached by the container
// through the compose network alias and by the browser through Chromium's
// host-resolver rules, so nothing leaves the machine and one file holds both
// halves of the conversation. `relay-payload-protocol.mjs` holds the contract
// the payloads are judged against; this script is only the driving.
//
// It also imports the damaged protocol fixtures, because "opening a damaged
// file is no longer recorded as an application error" is a claim about what is
// sent, and can only be checked where something is being sent.
//
// Usage: node analytics-lane.mjs [--lane analytics]
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  attempt,
  check,
  completeSetup,
  launch,
  newPage,
  recordDiagnosticsTo,
  report,
  uploadProtocol,
  ADMIN_USER,
} from './fresco-driver.mjs';
import { lane, postgresContainer } from './lanes.mjs';
import { relayHost } from './relay-host.mjs';
import { evaluateAnalyticsContract } from './relay-payload-protocol.mjs';

const argv = process.argv.slice(2);
const argument = (name, fallback) => {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? fallback : argv[index + 1];
};
const laneName = argument('lane', 'analytics');
const config = lane(laneName);
const here = import.meta.dirname;
const outDir = argument('out', join(here, '..', 'artifacts', laneName));
const fixtures = argument(
  'fixtures',
  join(here, '..', 'artifacts', 'fixtures'),
);
const captureFile = join(
  here,
  '..',
  'artifacts',
  'relay-capture',
  `${laneName}.jsonl`,
);

const psql = (sql) =>
  execFileSync('docker', [
    'exec',
    postgresContainer(laneName),
    'psql',
    '-U',
    'postgres',
    '-t',
    '-A',
    '-c',
    sql,
  ])
    .toString()
    .trim();

/**
 * What each damaged fixture must be told about, and by which message.
 *
 * The messages are the researcher-facing sentences `@codaco/protocol-validation`
 * defines, quoted here by their distinguishing clause rather than in full: what
 * is being checked is that the right KIND of answer comes back — a damaged
 * archive described as damaged rather than as "could not be opened", a missing
 * resource named the way the researcher named it rather than by its internal
 * filename — not the exact wording, which the package's own tests own.
 */
const DAMAGED_FIXTURES = [
  {
    id: 'analytics-damaged-missing-resource-named',
    file: 'missing-asset.netcanvas',
    expect: /refers to a file that isn't included in it: "Duck clip"/i,
    why: 'the resource is named as the researcher named it, not by its internal filename',
  },
  {
    id: 'analytics-damaged-archive-described',
    file: 'damaged-archive.netcanvas',
    expect: /isn't a Network Canvas protocol|contents are damaged/i,
    why: 'a damaged archive is described as damaged',
  },
  {
    id: 'analytics-inflation-limit-enforced',
    file: 'inflation-bomb.netcanvas',
    expect: /expands to more data than can be opened safely/i,
    why: 'the shared inflation limit applies to Fresco imports',
  },
  {
    id: 'analytics-fractional-count-refused',
    file: 'fractional-count-filter.netcanvas',
    expect: /invalid|check the protocol structure/i,
    why: 'an operator that counts selected options still takes a whole number',
  },
];

const checks = [];
const result = { ok: false, checks, lane: laneName };
let browser;

try {
  const launched = await launch({
    lane: laneName,
    relayTo: {
      host: relayHost(),
      port: config.sinkHttpsPort,
    },
  });
  browser = launched.browser;
  const page = await newPage(launched.context);
  recordDiagnosticsTo(page, outDir);

  await completeSetup(page, { lane: laneName });

  // The dashboard, including the pages whose search text goes into the URL —
  // the reason heatmap capture is off everywhere rather than only on
  // participant pages.
  for (const path of [
    '/dashboard',
    '/dashboard/participants?pt_q=release-test-search',
    '/dashboard/interviews?iv_q=release-test-search',
    '/dashboard/settings',
  ]) {
    await page.goto(`${config.baseUrl}${path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    // Click something on each page: autocapture, rageclick and dead-click
    // capture are all driven by clicks, so a lane that never clicked could not
    // see them being off.
    await page
      .getByRole('heading')
      .first()
      .click({ force: true })
      .catch(() => {});
  }

  // A participant-facing interview, with entities created in it: the interview
  // route starts analytics by its own path, and the entity-id pseudonyms
  // cannot be judged without events that carry entity ids.
  const walk = spawnSync(
    process.execPath,
    [
      join(here, 'interview-lane.mjs'),
      '--lane',
      laneName,
      '--signed-in',
      '--stop-after',
      // Far enough to place nodes on the sociogram: entity ids are reported by
      // the stages AFTER the name generator, and without an event carrying one
      // "no raw _uid was sent" is a claim about nothing.
      'sociogram',
      '--out',
      outDir,
    ],
    { encoding: 'utf8', timeout: 900_000 },
  );
  const walkResult = (() => {
    try {
      return JSON.parse(walk.stdout.trim().split('\n').at(-1));
    } catch {
      return null;
    }
  })();
  result.interviewId = walkResult?.interviewId ?? null;
  checks.push(
    check(
      'analytics-interview-conducted',
      Boolean(result.interviewId) &&
        (walkResult?.checks ?? []).every((entry) => entry.status === 'pass'),
      walkResult
        ? `interview ${result.interviewId ?? 'none'}: ${
            (walkResult.checks ?? [])
              .filter((entry) => entry.status !== 'pass')
              .map((entry) => entry.id)
              .join(', ') || 'every step passed'
          }`
        : `the interview walk produced no result (${(walk.stderr ?? '').slice(-200)})`,
    ),
  );

  // Every damaged file, one by one, each with the answer it must produce.
  for (const fixture of DAMAGED_FIXTURES) {
    checks.push(
      await attempt(fixture.id, async () => {
        await page.goto(`${config.baseUrl}/dashboard/protocols`, {
          waitUntil: 'networkidle',
        });
        await page.waitForTimeout(1500);
        if (!result.damagedImportFrom)
          result.damagedImportFrom = new Date(Date.now() - 1000).toISOString();
        await uploadProtocol(page, join(fixtures, fixture.file));
        const deadline = Date.now() + 240_000;
        let said = '';
        while (Date.now() < deadline) {
          await page.waitForTimeout(2000);
          said =
            (await page
              .locator('[data-testid=toast-viewport]')
              .textContent()
              .catch(() => '')) ?? '';
          if (fixture.expect.test(said)) break;
        }
        return {
          pass: fixture.expect.test(said),
          detail: fixture.expect.test(said)
            ? `${fixture.why}: ${said.slice(0, 160).trim()}`
            : `expected ${fixture.expect} (${fixture.why}); the import said: ${said.slice(0, 200).trim() || '(nothing)'}`,
        };
      }),
    );
  }

  // The control for the pair above: the same protocol with a comparison value
  // that is a fraction — which is now allowed, because a scalar attribute
  // records a normalised reading — must import. Without it, "the fractional
  // COUNT was refused" says nothing: a file refused for any other reason
  // looks identical.
  checks.push(
    await attempt('analytics-fractional-value-accepted', async () => {
      const before = Number(psql('select count(*) from "Protocol";'));
      await page.goto(`${config.baseUrl}/dashboard/protocols`, {
        waitUntil: 'networkidle',
      });
      await page.waitForTimeout(1500);
      await uploadProtocol(
        page,
        join(fixtures, 'fractional-value-filter.netcanvas'),
      );
      const deadline = Date.now() + 240_000;
      let after = before;
      while (Date.now() < deadline && after === before) {
        await page.waitForTimeout(2000);
        after = Number(psql('select count(*) from "Protocol";'));
      }
      return {
        pass: after > before,
        detail:
          after > before
            ? 'a filter comparing against a fraction imports'
            : 'a filter comparing against a fraction was refused, so the refusal of a fractional COUNT proves nothing',
      };
    }),
  );

  // Let the last events reach the sink: posthog-js batches, and the sink
  // classifies nothing — an assertion made a moment too early reads a page's
  // own traffic as silence.
  await page.waitForTimeout(8000);
  await browser.close();
  browser = null;

  // --- what was actually sent ---------------------------------------------
  const lines = readFileSync(captureFile, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { unreadable: true };
      }
    });
  const listeningRecords = lines.filter(
    (entry) => entry.kind === 'listening',
  ).length;
  const records = lines.filter((entry) => !entry.kind);

  // Everything this deployment holds that must never appear in a payload. The
  // node ids come from the interview's own stored network, so they are the
  // real `_uid`s an event could have carried rather than a shape that looks
  // like one.
  const secrets = [
    { name: 'the interview id', value: result.interviewId },
    { name: "the researcher's username", value: ADMIN_USER },
  ];
  if (result.interviewId) {
    const network = psql(
      `select network from "Interview" where id = '${result.interviewId}';`,
    );
    try {
      const parsed = JSON.parse(network);
      for (const node of parsed.nodes ?? [])
        secrets.push({ name: `node ${node._uid}`, value: node._uid });
      for (const edge of parsed.edges ?? [])
        secrets.push({ name: `edge ${edge._uid}`, value: edge._uid });
    } catch {
      checks.push(
        check(
          'analytics-lane-completed',
          false,
          'the interview network could not be read, so no real entity id was available to look for',
        ),
      );
    }
    const participant = psql(
      `select p.identifier from "Participant" p join "Interview" i on i."participantId" = p.id where i.id = '${result.interviewId}';`,
    );
    if (participant)
      secrets.push({
        name: "the participant's identifier",
        value: participant,
      });
  }
  result.secrets = secrets.map((secret) => secret.name);

  const verdict = evaluateAnalyticsContract({
    records,
    secrets: secrets.filter((secret) => secret.value),
    damagedImportFrom: result.damagedImportFrom ?? null,
    listeningRecords,
  });
  checks.push(...verdict.checks);
  result.requestCount = verdict.requestCount;
  result.eventCount = verdict.eventCount;
  result.ok = true;
} catch (error) {
  result.error = error.message;
  checks.push(check('analytics-lane-completed', false, error.message));
} finally {
  await browser?.close().catch(() => {});
}

report(result);
