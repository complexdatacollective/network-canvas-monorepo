#!/usr/bin/env node
// The schema 8 data a deployment already holds, carried across an upgrade
// untouched.
//
// The upgrade lane seeds the RELEASED image and swaps it for the pending one
// against the same database. The pending image's startup applies the Prisma
// migrations and the categorical-answer clean-up and nothing else
// (scripts/setup-database.ts): it does not upgrade stored protocols or the
// interviews recorded against them. A schema 8 protocol stays at schema 8,
// and its interviews run in the schema 8 interview Fresco bundles, at
// /v8/interview/<id>. This lane is what proves that, in three phases:
//
//   --phase seed      on the released image, before the swap: imports a
//                     schema 8 protocol with introduction panels and a Family
//                     Pedigree (packages/protocols/e2e/
//                     fresco-release-test-migration), keeping it at schema 8
//                     if the released build asks; conducts an interview of it
//                     through the schema 8 pedigree (a family of three, built
//                     with its quick-start questions and finalized) to the
//                     Alter Form behind its introduction panel and leaves it
//                     there unfinished; then reads every protocol and
//                     interview the deployment holds into
//                     artifacts/migration/before.json.
//   --phase upgraded  on the pending image, straight after the swap and
//                     BEFORE anything opens an interview: reads the database
//                     again into artifacts/migration/after.json and holds it
//                     to being exactly what it was (migration-contract.mjs).
//                     Read-only, so the export capture that follows still
//                     sees exactly what the upgrade left.
//   --phase resume    on the pending image, after the export capture: the
//                     participant comes back at /interview/<id>, is sent to
//                     /v8/interview/<id>, finds the interview where they left
//                     it with every answer and the family still there, and
//                     finishes it; the researcher exports it, then imports
//                     the schema 8 fixture twice more, once kept at schema 8
//                     and once upgraded to schema 9.
//
// The seed phase's interview is one of the seeded interviews the upgrade lane
// compares before and after the upgrade, so it is created before the seed
// takes its snapshots, and the workflow counts it.
//
// Usage: node migration-lane.mjs --lane upgrade --phase seed|upgraded|resume
//
// Prints one JSON line: { ok, checks, ... }, and writes the same object to
// artifacts/migration/<phase>-result.json. Each phase's check ids are bound by
// the workflow (expectedScriptChecks.migrationSeed, .migration and
// .migrationResume).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { CURRENT_SCHEMA_VERSION } from '../../../../packages/protocol-validation/src/schemas/index.ts';
import {
  ncSourceUUID,
  ncTargetUUID,
} from '../../../../packages/shared-consts/src/export-process.ts';
import {
  attempt,
  check,
  launch,
  newPage,
  recordDiagnosticsTo,
  report,
  signIn,
  uploadProtocol,
} from './fresco-driver.mjs';
import { readInterviewExport } from './interview-export-contract.mjs';
import {
  exportAllInterviews,
  importProtocol,
  nextStage,
  nodeIdsBy,
  openInterview,
  previousStage,
  psqlFor,
  settledStep,
  sqlText,
  startInterview,
} from './interview-walk.mjs';
import { lane } from './lanes.mjs';
import {
  familyKeptProblems,
  interviewKeptProblems,
  KEPT_SCHEMA,
  protocolKeptProblems,
} from './migration-contract.mjs';
import {
  anythingBut,
  categoricalColumns,
  edgeAnswerProblems,
  egoAnswerProblems,
  finishOutcomesByFormat,
  nodeAnswerProblems,
} from './schema9-export-contract.mjs';

const argv = process.argv.slice(2);
const argument = (name, fallback) => {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? fallback : argv[index + 1];
};
const laneName = argument('lane', 'upgrade');
const config = lane(laneName);
const phase = argument('phase', '');
const PHASES = ['seed', 'upgraded', 'resume'];
const artifacts = join(import.meta.dirname, '..', 'artifacts');
const outDir = argument('out', join(artifacts, 'migration'));
const fixtures = argument('fixtures', join(artifacts, 'fixtures'));
const BEFORE = join(outDir, 'before.json');
const AFTER = join(outDir, 'after.json');
const SEEDED = join(outDir, 'seeded.json');

mkdirSync(outDir, { recursive: true });
const psql = psqlFor(laneName);

/**
 * The answers the seeded interview gives before the upgrade — the ego's name,
 * the people, and a family on the schema 8 pedigree (the participant, female;
 * Linda, who gave the egg and carried the pregnancy; Robert, who gave the
 * sperm; the two of them current partners) — and, after it, each person's
 * hours.
 */
const TRANSCRIPT = {
  participant: 'migration-resume',
  egoName: 'Mira Upgrade',
  people: ['Alex', 'Blair'],
  hours: { Alex: '3', Blair: '7' },
  family: { egg: 'Linda', sperm: 'Robert' },
};

/** The fixture's stages, by id: where the walk parks, and what surrounds it. */
const PARKED_AT = 'each-person';
const PEDIGREE = 'family';

/**
 * The copies of the fixture the researcher imports after the upgrade, by the
 * answer each is given (make-fixtures.mjs builds them). Fresco names a
 * protocol after its file.
 */
const IMPORTS = {
  keep: 'release-test-kept-schema-8',
  upgrade: 'release-test-upgraded-schema-9',
};

/** The fixture's Family Pedigree person and relationship, and their attributes. */
const FAMILY = {
  type: 'family_member',
  name: 'fm_name',
  ego: 'is_ego',
  sex: 'biologicalSex',
  edge: 'family_edge',
  kind: 'relationshipType',
  active: 'isActive',
  carrier: 'isGestationalCarrier',
  gamete: 'gameteRole',
};

/**
 * One interview's family: each person by name ("You" for the participant)
 * with their sex at birth, and each relationship between two of them with its
 * kind, its gestational carrier flag, its current partner flag and its gamete
 * role.
 */
function familyOf(network) {
  const people = (network?.nodes ?? []).filter((n) => n.type === FAMILY.type);
  const nameOf = new Map(
    people.map((n) => [
      n._uid,
      n.attributes?.[FAMILY.ego] === true
        ? 'You'
        : (n.attributes?.[FAMILY.name] ?? n._uid),
    ]),
  );
  return {
    people: Object.fromEntries(
      people.map((n) => [
        nameOf.get(n._uid),
        { id: n._uid, sex: n.attributes?.[FAMILY.sex] ?? null },
      ]),
    ),
    relationships: (network?.edges ?? [])
      .filter(
        (e) => e.type === FAMILY.edge && nameOf.has(e.from) && nameOf.has(e.to),
      )
      .map((e) => ({
        id: e._uid,
        from: nameOf.get(e.from),
        to: nameOf.get(e.to),
        kind: e.attributes?.[FAMILY.kind] ?? null,
        carrier: e.attributes?.[FAMILY.carrier] ?? null,
        active: e.attributes?.[FAMILY.active] ?? null,
        gamete: e.attributes?.[FAMILY.gamete] ?? null,
      })),
  };
}

/** The family one interview holds in the database now. */
const storedFamily = (interviewId) =>
  familyOf(
    JSON.parse(
      psql(
        `select network::jsonb from "Interview" where id = ${sqlText(interviewId)};`,
      ) || '{}',
    ),
  );

/** Whether two stored values are the same, arrays and all. */
const same = (value, expected) =>
  JSON.stringify(value) === JSON.stringify(expected);

/** The one relationship of `family` from one person to another, if just one. */
const relationshipBetween = (family, from, to) => {
  const found = family.relationships.filter(
    (r) => r.from === from && r.to === to,
  );
  return found.length === 1 ? found[0] : undefined;
};

/**
 * Every protocol and interview the deployment holds, as migration-contract.mjs
 * reads them. The finish columns exist only from the schema 9 release on, so
 * they are read only when the database has them.
 */
function readDatabase() {
  const hasFinish =
    psql(
      `select count(*) from information_schema.columns where table_name = 'Interview' and column_name = 'finishOutcome';`,
    ) === '1';
  const protocols = JSON.parse(
    psql(
      `select coalesce(json_agg(json_build_object('id', id, 'name', name, 'hash', hash, 'schemaVersion', "schemaVersion", 'description', description, 'importedAt', "importedAt"::text, 'lastModified', "lastModified"::text, 'stages', stages, 'codebook', codebook) order by id), '[]') from "Protocol";`,
    ),
  );
  const interviews = JSON.parse(
    psql(
      `select coalesce(json_agg(json_build_object('id', id, 'protocolId', "protocolId", 'participantId', "participantId", 'startTime', "startTime"::text, 'finishTime', "finishTime"::text, 'currentStep', "currentStep", 'isSynthetic', "isSynthetic", 'finishStageId', ${hasFinish ? '"finishStageId"' : 'null'}, 'finishOutcome', ${hasFinish ? '"finishOutcome"::text' : 'null'}, 'network', network::jsonb, 'stageMetadata', "stageMetadata"::jsonb) order by id), '[]') from "Interview";`,
    ),
  );
  return { protocols, interviews };
}

const checks = [];
const result = { ok: false, phase, checks };
let browser;

try {
  if (phase === 'seed') await seed();
  else if (phase === 'upgraded') upgraded();
  else if (phase === 'resume') await resume();
  else throw new Error(`--phase must be ${PHASES.join(', ')} (got "${phase}")`);
  result.ok = true;
} catch (error) {
  result.error = error.message;
  checks.push(
    check(`migration-${phase || 'phase'}-completed`, false, error.message),
  );
} finally {
  await browser?.close().catch(() => {});
}
// Also left on disk: the seed phase runs inside the seed checklist agent's
// sequence, and the workflow binds its checks by reading this file rather
// than that agent's account of them.
if (PHASES.includes(phase))
  writeFileSync(join(outDir, `${phase}-result.json`), JSON.stringify(result));
report(result);
process.exit(0);

/** On the released image: the unfinished interview, then the reading. */
async function seed() {
  const launched = await launch({ lane: laneName });
  browser = launched.browser;
  const page = await newPage(launched.context);
  recordDiagnosticsTo(page, outDir);
  await signIn(page, { lane: laneName });
  await page.waitForURL(/\/dashboard/, { timeout: 90_000 });

  // Fresco 4 imports a schema 8 protocol as it is. A released build that
  // asks how to import one is told to keep it, which is the same thing.
  checks.push(
    await attempt('migration-seed-protocol-imported', async () => {
      const id = await importProtocol(page, {
        baseUrl: config.baseUrl,
        psql,
        path: join(fixtures, 'fresco-release-test-migration.netcanvas'),
        fileStem: 'fresco-release-test-migration',
        upload: uploadProtocol,
        schemaChoice: 'keep',
      });
      result.protocolId = id;
      const version = id
        ? psql(
            `select "schemaVersion" from "Protocol" where id = ${sqlText(id)};`,
          )
        : '';
      result.storedSchema = version;
      return {
        pass: Boolean(id) && version === String(KEPT_SCHEMA),
        detail: id
          ? `imported as ${id}, stored as schema ${version} (expected ${KEPT_SCHEMA})`
          : 'the protocol never appeared in the database within 120s',
      };
    }),
  );
  if (!result.protocolId) throw new Error('no protocol to conduct');

  const stages = JSON.parse(
    psql(
      `select stages from "Protocol" where id = ${sqlText(result.protocolId)};`,
    ),
  );
  const stepOf = (id) => String(stages.findIndex((stage) => stage.id === id));

  // The released interview, as its participant meets it: the Ego Form shows
  // its panel above its question, then the people, then the schema 8 Family
  // Pedigree, built through its quick-start questions and finalized, which
  // is when schema 8 wrote the family to the network.
  checks.push(
    await attempt('migration-seed-pedigree-recorded', async () => {
      const started = await startInterview(
        page,
        config.baseUrl,
        result.protocolId,
        TRANSCRIPT.participant,
      );
      result.interviewId = started.interviewId;
      await nextStage(page);
      const field = page.locator('[data-field-name="ego_name"] input');
      await field.fill(TRANSCRIPT.egoName);
      await field.blur();
      await page.waitForTimeout(500);
      await nextStage(page);
      for (const name of TRANSCRIPT.people) {
        const toggle = page.getByTestId('quick-add-toggle');
        if ((await toggle.getAttribute('aria-pressed')) !== 'true')
          await toggle.click();
        const input = page.getByTestId('quick-add-input');
        await input.fill(name);
        await input.press('Enter');
        await page.getByRole('option', { name }).waitFor({ timeout: 15_000 });
      }
      const pedigreeStep = await nextStage(page);
      const drawn = await buildSchema8Pedigree(page);
      // Finalizing commits the family and moves on to the next stage.
      await page.getByTestId('next-button').click();
      const confirm = page.getByRole('dialog');
      await confirm
        .getByText('Finalize your family pedigree?')
        .waitFor({ timeout: 15_000 });
      await confirm.getByRole('button', { name: 'Finalize' }).click();
      const { egg, sperm } = TRANSCRIPT.family;
      const deadline = Date.now() + 30_000;
      let family;
      let record;
      for (;;) {
        family = storedFamily(result.interviewId);
        record = JSON.parse(
          psql(
            `select coalesce("stageMetadata"::jsonb -> ${sqlText(stepOf(PEDIGREE))}, 'null') from "Interview" where id = ${sqlText(result.interviewId)};`,
          ),
        );
        if (
          (family.relationships.length === 3 && record?.isNetworkCommitted) ||
          Date.now() > deadline
        )
          break;
        await page.waitForTimeout(1000);
      }
      const eggEdge = relationshipBetween(family, egg, 'You');
      const spermEdge = relationshipBetween(family, sperm, 'You');
      const partners = family.relationships.filter(
        (r) => JSON.stringify(r.kind) === '["partner"]',
      );
      return {
        pass:
          String(pedigreeStep) === stepOf(PEDIGREE) &&
          same(Object.keys(family.people).toSorted(), [
            'Linda',
            'Robert',
            'You',
          ]) &&
          same(family.people.You?.sex, ['female']) &&
          same(family.people[egg]?.sex, ['female']) &&
          same(family.people[sperm]?.sex, ['male']) &&
          family.relationships.length === 3 &&
          same(eggEdge?.kind, ['biological']) &&
          same(eggEdge?.gamete, ['egg']) &&
          eggEdge?.carrier === true &&
          same(spermEdge?.kind, ['biological']) &&
          same(spermEdge?.gamete, ['sperm']) &&
          partners.length === 1 &&
          partners[0].active === true &&
          record?.isNetworkCommitted === true &&
          (record?.nodes ?? []).length === 3,
        detail: `the pedigree (step ${pedigreeStep}, expected ${stepOf(PEDIGREE)}) drew ${JSON.stringify(drawn)}; stored family ${JSON.stringify(family)}; its stage record committed: ${record?.isNetworkCommitted}, listing ${(record?.nodes ?? []).length} people and ${(record?.edges ?? []).length} relationships`,
      };
    }),
  );

  // Parked behind the Alter Form's panel: its skip logic (skip when nobody
  // was named) is false for this interview, so the stage is shown.
  checks.push(
    await attempt('migration-seed-interview-parked', async () => {
      const at = await settledStep(page);
      const panel = await introductionPanelShown(page);
      // Parked: the database has to hold the position and the answers before
      // anything reads it, and Fresco batches its sync writes.
      const deadline = Date.now() + 30_000;
      let row = '';
      const want = `${stepOf(PARKED_AT)}|${TRANSCRIPT.egoName}|${TRANSCRIPT.people.length}`;
      while (Date.now() < deadline) {
        row = psql(
          `select "currentStep" || '|' || coalesce(network::jsonb #>> '{ego,attributes,ego_name}', '') || '|' || (select count(*) from jsonb_array_elements(network::jsonb->'nodes') n where n->>'type' = 'person') from "Interview" where id = ${sqlText(result.interviewId)};`,
        );
        if (row === want) break;
        await page.waitForTimeout(1000);
      }
      return {
        pass: at === stepOf(PARKED_AT) && panel && row === want,
        detail: `interview ${result.interviewId} on step ${at}, its introduction panel shown: ${panel}; stored step|ego name|people = ${row} (expected ${want})`,
      };
    }),
  );

  writeFileSync(
    SEEDED,
    JSON.stringify(
      {
        protocolId: result.protocolId,
        interviewId: result.interviewId,
        transcript: TRANSCRIPT,
      },
      null,
      2,
    ),
  );
  const before = readDatabase();
  writeFileSync(BEFORE, JSON.stringify(before, null, 2));
  checks.push(
    check(
      'migration-seed-read',
      before.protocols.length > 0 &&
        before.interviews.some((i) => i.id === result.interviewId),
      `read ${before.protocols.length} protocol(s) and ${before.interviews.length} interview(s) before the upgrade into ${BEFORE}`,
    ),
  );
}

/** On the pending image, before anything opens an interview. */
function upgraded() {
  const seeded = JSON.parse(readFileSync(SEEDED, 'utf8'));
  const before = JSON.parse(readFileSync(BEFORE, 'utf8'));
  const after = readDatabase();
  writeFileSync(AFTER, JSON.stringify(after, null, 2));
  const verdict = (id, problems, success) =>
    check(
      id,
      problems.length === 0,
      problems.length ? problems.join('; ') : success,
    );
  checks.push(
    verdict(
      'migration-protocols-kept-at-schema-8',
      protocolKeptProblems(before, after),
      `all ${before.protocols.length} protocol(s) stored before the upgrade are stored after it at the schema they were stored at (${[...new Set(before.protocols.map((p) => p.schemaVersion))].join(', ')}), with their hash, stages and codebook unchanged`,
    ),
  );
  checks.push(
    verdict(
      'migration-pedigree-family-kept',
      familyKeptProblems(before, after),
      'every Family Pedigree family recorded before the upgrade is stored after it exactly as recorded, every person, relationship and answer, and its schema 8 stage record with it',
    ),
  );
  checks.push(
    verdict(
      'migration-interviews-resume-where-they-were',
      interviewKeptProblems(before, after),
      `all ${before.interviews.length} interview(s) are stored with their step, answers, stage records and times unchanged, and carry no finish stage or outcome nothing recorded`,
    ),
  );
  const parked = after.interviews.find((i) => i.id === seeded.interviewId);
  const protocol = after.protocols.find((p) => p.id === seeded.protocolId);
  const parkedId = protocol?.stages?.[parked?.currentStep]?.id;
  checks.push(
    check(
      'migration-unfinished-interview-kept-in-place',
      parkedId === PARKED_AT && protocol?.schemaVersion === KEPT_SCHEMA,
      `the interview left unfinished before the upgrade resumes at step ${parked?.currentStep}, stage "${parkedId}" (expected "${PARKED_AT}") of a schema ${protocol?.schemaVersion} protocol (expected ${KEPT_SCHEMA})`,
    ),
  );
}

/** On the pending image, after the export capture: the participant returns. */
async function resume() {
  const seeded = JSON.parse(readFileSync(SEEDED, 'utf8'));
  const before = JSON.parse(readFileSync(BEFORE, 'utf8'));
  const protocol = before.protocols.find((p) => p.id === seeded.protocolId);
  const stepOf = (id) =>
    String(protocol?.stages?.findIndex((stage) => stage.id === id));
  const familyBefore = familyOf(
    before.interviews.find((i) => i.id === seeded.interviewId)?.network,
  );
  const v8Path = `/v8/interview/${seeded.interviewId}`;
  const participant = await launch({ lane: laneName });
  browser = participant.browser;
  const page = await newPage(participant.context);
  recordDiagnosticsTo(page, outDir);
  const { egg, sperm } = TRANSCRIPT.family;

  // The participant's own link: the interview route of the current build,
  // which has to hand a schema 8 interview to the schema 8 one.
  checks.push(
    await attempt('migration-interview-redirected-to-schema-8', async () => {
      await page.goto(`${config.baseUrl}/interview/${seeded.interviewId}`, {
        waitUntil: 'domcontentloaded',
      });
      await page
        .waitForURL((url) => url.pathname === v8Path, { timeout: 60_000 })
        .catch(() => {});
      const landed = new URL(page.url()).pathname;
      return {
        pass: landed === v8Path,
        detail: `/interview/${seeded.interviewId} landed on ${landed} (expected ${v8Path})`,
      };
    }),
  );

  checks.push(
    await attempt('migration-interview-resumes-where-it-was', async () => {
      const attempts = await openInterview(page, `${config.baseUrl}${v8Path}`);
      const at = await settledStep(page);
      const panel = await introductionPanelShown(page);
      const landed = new URL(page.url()).pathname;
      return {
        pass: landed === v8Path && at === stepOf(PARKED_AT) && panel,
        detail: `${v8Path} served ${landed} after ${attempts} attempt(s), on step ${at} (the Alter Form "${PARKED_AT}" is step ${stepOf(PARKED_AT)}); its introduction panel shown, as it was when the participant left: ${panel}`,
      };
    }),
  );

  // The family built on the schema 8 pedigree, drawn by the same stage.
  checks.push(
    await attempt('migration-pedigree-shown-after-upgrade', async () => {
      const at = await previousStage(page);
      const main = page.getByRole('main');
      const drawn = {};
      for (const name of [egg, sperm])
        drawn[name] = await main
          .getByText(name, { exact: true })
          .first()
          .waitFor({ timeout: 15_000 })
          .then(() => true)
          .catch(() => false);
      // A pedigree that lost its family would offer to start one again.
      const startOver = await page
        .getByTestId('pedigree-get-started')
        .isVisible()
        .catch(() => false);
      return {
        pass:
          at === stepOf(PEDIGREE) &&
          Object.values(drawn).every(Boolean) &&
          !startOver,
        detail: `Back from the Alter Form reached step ${at} (the pedigree is step ${stepOf(PEDIGREE)}), which draws ${JSON.stringify(drawn)}${startOver ? ' and offers to start a family again' : ''}`,
      };
    }),
  );

  checks.push(
    await attempt('migration-interview-keeps-its-answers', async () => {
      const peopleStep = await previousStage(page);
      await page
        .getByRole('option', { name: TRANSCRIPT.people.at(-1) })
        .waitFor({ timeout: 15_000 })
        .catch(() => {});
      const options = await page.getByRole('option').allTextContents();
      const formStep = await previousStage(page);
      const value = await page
        .locator('[data-field-name="ego_name"] input')
        .inputValue()
        .catch(() => null);
      const heading = await page
        .getByRole('heading', { name: 'About you' })
        .first()
        .isVisible()
        .catch(() => false);
      return {
        pass:
          peopleStep === stepOf('people') &&
          TRANSCRIPT.people.every((name) =>
            options.some((option) => option.includes(name)),
          ) &&
          formStep === stepOf('about-you') &&
          value === TRANSCRIPT.egoName &&
          heading,
        detail: `step ${peopleStep} lists ${JSON.stringify(options)}; step ${formStep}'s form, under its introduction panel's title (${heading}), holds "${value}"`,
      };
    }),
  );

  checks.push(
    await attempt('migration-interview-finished-after-upgrade', async () => {
      // Forward through what is left: the people, the finalized pedigree,
      // the Alter Form (its panel, then a question about each person), the
      // closing Information stage, and the finish screen schema 8 appends.
      await nextStage(page);
      const pedigree = await nextStage(page);
      const alterForm = await nextStage(page);
      // Past the panel, on the same step.
      await page.getByTestId('next-button').click();
      await page
        .getByText('How many hours a week do you spend with them?')
        .first()
        .waitFor({ timeout: 15_000 });
      for (const name of TRANSCRIPT.people) {
        await page
          .getByRole('main')
          .getByRole('button', { name, exact: true })
          .waitFor({ timeout: 15_000 });
        const field = page.locator('[data-field-name="hours"] input');
        await field.fill(TRANSCRIPT.hours[name]);
        await field.blur();
        await page.waitForTimeout(400);
        await settledStep(page);
        await page.getByTestId('next-button').click();
        await page.waitForTimeout(1500);
      }
      const goodbye = await settledStep(page);
      const finishStep = await nextStage(page);
      const finishScreen = await page
        .getByRole('heading', { name: 'Finish Interview' })
        .first()
        .isVisible()
        .catch(() => false);
      await page.getByRole('button', { name: 'Finish', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor({ timeout: 15_000 });
      await dialog
        .getByRole('button', { name: 'Finish Interview', exact: true })
        .click();
      const thanked = await page
        .getByText('Thank you for participating!')
        .first()
        .waitFor({ timeout: 30_000 })
        .then(() => true)
        .catch(() => false);
      // The thank-you page shows at once, then takes over the address.
      await page
        .waitForURL((url) => url.pathname === '/v8/interview/finished', {
          timeout: 30_000,
        })
        .catch(() => {});
      const landed = new URL(page.url()).pathname;
      // A schema 8 interview records when it finished and nothing about
      // where: it has no finish stages.
      const row = psql(
        `select coalesce("finishStageId", '') || '|' || coalesce("finishOutcome"::text, '') || '|' || ("finishTime" is not null) from "Interview" where id = ${sqlText(seeded.interviewId)};`,
      );
      return {
        pass:
          pedigree === stepOf(PEDIGREE) &&
          alterForm === stepOf(PARKED_AT) &&
          goodbye === stepOf('goodbye') &&
          finishScreen &&
          thanked &&
          landed === '/v8/interview/finished' &&
          row === '||true',
        detail: `passed the pedigree (step ${pedigree}) and answered the Alter Form (step ${alterForm}), reached the closing stage (step ${goodbye}) and the finish screen (step ${finishStep}, shown: ${finishScreen}); after finishing, ${landed} thanked the participant: ${thanked}; stored stage|outcome|finished = ${row} (expected ||true)`,
      };
    }),
  );

  // The family once the interview is finished: exactly what the released
  // build stored, the answers given since then touching none of it.
  let family = { people: {}, relationships: [] };
  checks.push(
    await attempt('migration-pedigree-answers-stored', async () => {
      family = storedFamily(seeded.interviewId);
      return {
        pass:
          Object.keys(familyBefore.people).length === 3 &&
          familyBefore.relationships.length === 3 &&
          same(family, familyBefore),
        detail: same(family, familyBefore)
          ? `the finished interview holds the family recorded before the upgrade, unchanged: ${JSON.stringify(family)}`
          : `the finished interview holds ${JSON.stringify(family)}; before the upgrade it held ${JSON.stringify(familyBefore)}`,
      };
    }),
  );
  await participant.browser.close();

  // The researcher's export. Every interview this deployment holds is a
  // schema 8 one, so the export is the one schema 8 exported: no interview
  // carries a finish outcome, and the ego CSV has no column for one.
  const researcher = await launch({ lane: laneName });
  browser = researcher.browser;
  const desk = await newPage(researcher.context);
  recordDiagnosticsTo(desk, outDir);
  let exported = null;
  checks.push(
    await attempt('migration-export-after-upgrade', async () => {
      await signIn(desk, { lane: laneName });
      await desk.waitForURL(/\/dashboard/, { timeout: 90_000 });
      const archivePath = await exportAllInterviews(
        desk,
        config.baseUrl,
        join(outDir, 'migration-export.zip'),
      );
      result.exportPath = archivePath;
      exported = await readInterviewExport(archivePath);
      const outcomes = finishOutcomesByFormat(exported.files);
      const recorded = [
        ...Object.keys(outcomes.csv).map(
          (session) =>
            `an ego CSV has a finish outcome column (interview ${session}: "${outcomes.csv[session]}")`,
        ),
        ...Object.entries(outcomes.graphml)
          .filter(([, outcome]) => outcome !== '')
          .map(
            ([session, outcome]) =>
              `GraphML records interview ${session} as "${outcome}"`,
          ),
      ];
      const graphed = seeded.interviewId in outcomes.graphml;
      // Each answer is read from its own record: the ego's name from this
      // interview's ego row and graph, and each person's name and hours
      // ("3" and "7" would be found anywhere in the archive's text) from
      // that person's.
      const ids = nodeIdsBy(psql, seeded.interviewId, {
        type: 'person',
        attribute: 'name',
      });
      const missing = [
        ...egoAnswerProblems(exported.files, {
          [seeded.interviewId]: { ego_name: TRANSCRIPT.egoName },
        }),
        ...nodeAnswerProblems(
          exported.files,
          Object.fromEntries(
            TRANSCRIPT.people.map((name) => [
              ids[name] ?? `(no stored node named ${name})`,
              { name, hours: TRANSCRIPT.hours[name] },
            ]),
          ),
        ),
      ];
      return {
        pass:
          exported.entries > 0 &&
          graphed &&
          recorded.length === 0 &&
          missing.length === 0,
        detail:
          exported.entries === 0
            ? `the export archive held no data files${exported.error ? ` (${exported.error})` : ''}`
            : [
                !graphed
                  ? `no GraphML graph is interview ${seeded.interviewId}'s`
                  : recorded.length
                    ? recorded.join('; ')
                    : 'no exported interview carries a finish outcome, as schema 8 exports none',
                missing.length
                  ? `the export does not carry: ${missing.join(' | ')}`
                  : "the ego's name is in this interview's one ego row and graph, and each person's name and hours in that person's one CSV row and one GraphML node",
              ].join('; '),
      };
    }),
  );

  // The family, exported as schema 8 exported it: each person's name and sex
  // at birth (one true/false column per option of the schema 8 codebook) in
  // that person's own records, and each relationship's ends, kind, gamete
  // role and flags in its own.
  checks.push(
    await attempt('migration-export-carries-the-pedigree', async () => {
      if (!exported) throw new Error('no export was read');
      const codebook = protocol?.codebook ?? {};
      const sex = (value) =>
        categoricalColumns(codebook, 'node', FAMILY.type, FAMILY.sex, value);
      const kind = (value) =>
        categoricalColumns(codebook, 'edge', FAMILY.edge, FAMILY.kind, value);
      // The gamete role recorded, or, where none was, no role marked at all.
      const gamete = (value) =>
        value
          ? categoricalColumns(
              codebook,
              'edge',
              FAMILY.edge,
              FAMILY.gamete,
              value,
            )
          : {
              [`${FAMILY.gamete}_egg`]: anythingBut('true'),
              [`${FAMILY.gamete}_sperm`]: anythingBut('true'),
            };
      // A flag as recorded; one nobody set may be blank or left out, but
      // never true.
      const flag = (value) =>
        typeof value === 'boolean' ? String(value) : anythingBut('true');
      const people = Object.entries(family.people);
      const problems = [
        ...nodeAnswerProblems(
          exported.files,
          Object.fromEntries(
            people.map(([name, person]) => [
              person.id,
              {
                ...(name === 'You' ? {} : { [FAMILY.name]: name }),
                ...sex(person.sex?.[0]),
              },
            ]),
          ),
        ),
        ...edgeAnswerProblems(
          exported.files,
          Object.fromEntries(
            family.relationships.map((relationship) => [
              relationship.id,
              {
                [ncSourceUUID]: family.people[relationship.from]?.id,
                [ncTargetUUID]: family.people[relationship.to]?.id,
                ...kind(relationship.kind?.[0]),
                ...gamete(relationship.gamete?.[0]),
                [FAMILY.carrier]: flag(relationship.carrier),
                [FAMILY.active]: flag(relationship.active),
              },
            ]),
          ),
        ),
      ];
      return {
        pass:
          people.length === 3 &&
          family.relationships.length === 3 &&
          problems.length === 0,
        detail: problems.length
          ? problems.join('; ')
          : `each of the family (${people.map(([name]) => name).join(', ')}) has one CSV row and one GraphML node holding their name and sex at birth, and each of its ${family.relationships.length} relationships one edge list row and one GraphML edge holding its ends, its kind (every option column), its gamete role and its carrier and current partner flags as recorded`,
      };
    }),
  );

  // The two ways an older protocol can still be imported: kept at schema 8,
  // to run in the schema 8 interview like the one carried across, or
  // upgraded to a schema 9 copy. Fresco has to ask; uploadProtocol fails
  // when it does not.
  const importAs = (choice) =>
    importProtocol(desk, {
      baseUrl: config.baseUrl,
      psql,
      path: join(fixtures, `${IMPORTS[choice]}.netcanvas`),
      fileStem: IMPORTS[choice],
      upload: (target, path) =>
        uploadProtocol(target, path, { olderSchema: choice }),
    });
  const stored = (id) =>
    id
      ? psql(
          `select "schemaVersion" || '|' || coalesce(stages::jsonb -> -1 ->> 'type', '') from "Protocol" where id = ${sqlText(id)};`,
        )
      : '';
  // The schema badges a protocol's row in the protocols table carries, or
  // null when the table has no row for it: an absent row carries no badge
  // either, and must not read as a protocol that needs none.
  const badgesOf = async (name) => {
    await desk.goto(`${config.baseUrl}/dashboard/protocols`, {
      waitUntil: 'networkidle',
    });
    const row = desk.getByRole('row').filter({ hasText: name }).first();
    const listed = await row
      .waitFor({ timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    return listed ? row.getByText(/^Schema \d+$/).allTextContents() : null;
  };

  const listing = (badges) =>
    badges === null ? 'not listed' : `badged ${JSON.stringify(badges)}`;

  checks.push(
    await attempt('migration-import-keeps-schema-8', async () => {
      const id = await importAs('keep');
      const row = stored(id);
      const badges = await badgesOf(IMPORTS.keep);
      // The protocol carried across the upgrade is marked the same way.
      const carried = await badgesOf(protocol?.name ?? '(no seeded protocol)');
      const badge = `Schema ${KEPT_SCHEMA}`;
      return {
        pass:
          Boolean(id) &&
          row.startsWith(`${KEPT_SCHEMA}|`) &&
          row !== `${KEPT_SCHEMA}|FinishSession` &&
          same(badges, [badge]) &&
          same(carried, [badge]),
        detail: id
          ? `"Keep schema ${KEPT_SCHEMA}" stored ${IMPORTS.keep} as ${id}, schema|last stage = ${row}; in the protocols table it is ${listing(badges)}, and the protocol carried across the upgrade ${listing(carried)} (expected badged ["${badge}"] for both)`
          : `the protocol kept at schema ${KEPT_SCHEMA} never appeared in the database within 120s`,
      };
    }),
  );

  checks.push(
    await attempt('migration-import-upgrades-to-schema-9', async () => {
      const id = await importAs('upgrade');
      const row = stored(id);
      const badges = await badgesOf(IMPORTS.upgrade);
      const want = `${CURRENT_SCHEMA_VERSION}|FinishSession`;
      return {
        pass: Boolean(id) && row === want && same(badges, []),
        detail: id
          ? `"Upgrade to schema ${CURRENT_SCHEMA_VERSION}" stored ${IMPORTS.upgrade} as ${id}, schema|last stage = ${row} (expected ${want}); in the protocols table it is ${listing(badges)} (expected listed with no badge)`
          : `the upgraded protocol never appeared in the database within 120s`,
      };
    }),
  );
}

/**
 * Whether the parked Alter Form is showing its introduction panel, title and
 * text, which schema 8 shows in front of the stage's questions.
 */
async function introductionPanelShown(page) {
  const title = await page
    .getByRole('heading', { name: 'About each person' })
    .first()
    .isVisible()
    .catch(() => false);
  const text = await page
    .getByText('Now some questions about each person you named.')
    .first()
    .isVisible()
    .catch(() => false);
  return title && text;
}

/**
 * The schema 8 Family Pedigree's quick start, as the released image draws it
 * (the interview package's own e2e drives it the same way: packages/interview/
 * e2e/matrix/family-pedigree.scenarios.ts): the participant's sex at birth,
 * then the egg and sperm parents by name — neither a donor, the egg parent
 * carried the pregnancy — no other parents, the two of them current partners,
 * and no partner of the participant's own. Returns the people drawn.
 */
async function buildSchema8Pedigree(page) {
  const { egg, sperm } = TRANSCRIPT.family;
  const dialog = page.getByRole('dialog');
  const field = (name) => dialog.locator(`[data-field-name="${name}"]`);
  const choose = (name, value) =>
    field(name)
      .locator(
        `[role="radio"][data-value="${value}"], [role="option"][data-value="${value}"]`,
      )
      .first()
      .click();
  const answer = async (name, value) => {
    const toggle = field(name).getByRole('switch');
    if (await toggle.count()) {
      if (((await toggle.getAttribute('aria-checked')) === 'true') !== value)
        await toggle.click();
      return;
    }
    await choose(name, String(value));
  };
  const next = () => dialog.getByTestId('wizard-next').click();

  await page.getByTestId('pedigree-get-started').click();
  await dialog.waitFor({ timeout: 15_000 });
  await choose('biologicalSex', 'female');
  await next();
  await answer('egg-parent.is-donor', false);
  await field('egg-parent.name').getByRole('textbox').fill(egg);
  await answer('egg-parent.gestationalCarrier', true);
  await next();
  await answer('sperm-parent.is-donor', false);
  await field('sperm-parent.name').getByRole('textbox').fill(sperm);
  await next();
  await answer('hasOtherParents', false);
  await next();
  await field('partnerships.egg-parent')
    .getByRole('radiogroup', { name: sperm })
    .locator('[role="radio"][data-value="current"]')
    .click();
  await next();
  await answer('hasPartner', false);
  await next();
  // The hint the quick start ends on holds the page until it is read.
  await dialog
    .getByText('Building the rest of your pedigree')
    .waitFor({ timeout: 15_000 });
  await dialog.getByTestId('dialog-primary').click();
  await dialog.waitFor({ state: 'detached', timeout: 15_000 }).catch(() => {});
  return page
    .getByRole('main')
    .getByRole('button', { name: new RegExp(`^(You|${egg}|${sperm})$`) })
    .evaluateAll((buttons) =>
      buttons.map(
        (button) => button.getAttribute('aria-label') ?? button.textContent,
      ),
    )
    .then((names) => names.toSorted())
    .catch(() => []);
}
