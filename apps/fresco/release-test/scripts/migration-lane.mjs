#!/usr/bin/env node
// The schema 8 to 9 upgrade, on the interviews a deployment already holds.
//
// The upgrade lane seeds the RELEASED image and swaps it for the pending one
// against the same database, and the pending image's startup migrates every
// stored protocol to schema 9 together with every interview recorded against
// it (scripts/setup-database.ts, scripts/migrate-protocols.ts). This lane is
// what proves that migration did right by those interviews, in three phases:
//
//   --phase seed      on the released image, before the swap: imports a
//                     schema 8 protocol with introduction panels and a Family
//                     Pedigree (packages/protocols/e2e/
//                     fresco-release-test-migration), conducts an interview of
//                     it through the schema 8 pedigree (a family of three,
//                     built with its quick-start questions and finalized) to
//                     the Alter Form behind an introduction panel and leaves it
//                     there unfinished, then reads every protocol and
//                     interview the deployment holds into
//                     artifacts/migration/before.json.
//   --phase migrated  on the pending image, straight after the swap and
//                     BEFORE anything opens an interview: reads the database
//                     again into artifacts/migration/after.json and compares
//                     the two readings (migration-contract.mjs). Read-only, so
//                     the export capture that follows still sees exactly what
//                     the migration left.
//   --phase resume    on the pending image, after the export capture: opens
//                     the unfinished interview as its participant, goes back
//                     to the redesigned pedigree to find the family there,
//                     adds a relative to it, finishes the interview, and
//                     exports it.
//
// Once the released image itself runs schema 9, it migrates the schema 8
// fixture on import and the release under test carries no schema 8 data
// across. The seed phase then still creates its interview, so the upgrade
// lane's interview counts hold, and every phase reports `notApplicable` with
// the reason and no checks; the workflow accepts that only when all three
// phases agree, and records that the upgrade was not exercised.
//
// The seed phase's interview is one of the seeded interviews the upgrade lane
// compares before and after the upgrade, so it is created before the seed
// takes its snapshots, and the workflow counts it.
//
// Usage: node migration-lane.mjs --lane upgrade --phase seed|migrated|resume
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
  interviewMigrationProblems,
  introductionPanelProblems,
  pedigreeMigrationProblems,
  protocolMigrationProblems,
} from './migration-contract.mjs';
import {
  anythingBut,
  categoricalColumns,
  edgeAnswerProblems,
  egoAnswerProblems,
  finishOutcomeProblems,
  nodeAnswerProblems,
} from './schema9-export-contract.mjs';

/** The schema the fixture is written in, which this lane carries across. */
const FIXTURE_SCHEMA = '8';

const argv = process.argv.slice(2);
const argument = (name, fallback) => {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? fallback : argv[index + 1];
};
const laneName = argument('lane', 'upgrade');
const config = lane(laneName);
const phase = argument('phase', '');
const artifacts = join(import.meta.dirname, '..', 'artifacts');
const outDir = argument('out', join(artifacts, 'migration'));
const fixtures = argument('fixtures', join(artifacts, 'fixtures'));
const BEFORE = join(outDir, 'before.json');
const AFTER = join(outDir, 'after.json');
const SEEDED = join(outDir, 'seeded.json');

mkdirSync(outDir, { recursive: true });
const psql = psqlFor(laneName);

/**
 * The answers the seeded interview gives: before the upgrade, the ego's name,
 * the people, and a family on the schema 8 pedigree (the participant, female;
 * Linda, who gave the egg and carried the pregnancy; Robert, who gave the
 * sperm; the two of them current partners); after it, each person's hours,
 * and a parent of Linda's added on the redesigned pedigree.
 */
const TRANSCRIPT = {
  participant: 'migration-resume',
  egoName: 'Mira Upgrade',
  people: ['Alex', 'Blair'],
  hours: { Alex: '3', Blair: '7' },
  family: { egg: 'Linda', sperm: 'Robert' },
  grandparent: 'Grace',
};

/** The fixture's stages, by id: where the walk parks, and what surrounds it. */
const PARKED_AT = 'each-person';
const PEDIGREE = 'family';

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
 * One interview's family as stored: each person by name ("You" for the
 * participant) with their sex at birth, and each relationship between two of
 * them with its kind, its gestational carrier flag, its current partner flag
 * and its gamete role — what both the seed and the resume read back.
 */
function storedFamily(interviewId) {
  const network = JSON.parse(
    psql(
      `select network::jsonb from "Interview" where id = ${sqlText(interviewId)};`,
    ) || '{}',
  );
  const people = (network.nodes ?? []).filter((n) => n.type === FAMILY.type);
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
    relationships: (network.edges ?? [])
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
      `select coalesce(json_agg(json_build_object('id', id, 'name', name, 'schemaVersion', "schemaVersion", 'stages', stages, 'codebook', codebook) order by id), '[]') from "Protocol";`,
    ),
  );
  const interviews = JSON.parse(
    psql(
      `select coalesce(json_agg(json_build_object('id', id, 'protocolId', "protocolId", 'currentStep', "currentStep", 'finishTime', "finishTime"::text, 'finishStageId', ${hasFinish ? '"finishStageId"' : 'null'}, 'finishOutcome', ${hasFinish ? '"finishOutcome"::text' : 'null'}, 'network', network::jsonb, 'stageMetadata', "stageMetadata"::jsonb) order by id), '[]') from "Interview";`,
    ),
  );
  return { protocols, interviews };
}

const checks = [];
const result = { ok: false, phase, checks };
let browser;

try {
  if (phase === 'seed') await seed();
  else if (phase === 'migrated') migrated();
  else if (phase === 'resume') await resume();
  else
    throw new Error(
      `--phase must be seed, migrated or resume (got "${phase}")`,
    );
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
if (['seed', 'migrated', 'resume'].includes(phase))
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

  checks.push(
    await attempt('migration-seed-protocol-imported', async () => {
      const id = await importProtocol(page, {
        baseUrl: config.baseUrl,
        psql,
        path: join(fixtures, 'fresco-release-test-migration.netcanvas'),
        fileStem: 'fresco-release-test-migration',
        upload: uploadProtocol,
      });
      result.protocolId = id;
      const version = id
        ? psql(
            `select "schemaVersion" from "Protocol" where id = ${sqlText(id)};`,
          )
        : '';
      result.storedSchema = version;
      return {
        pass: Boolean(id) && version === FIXTURE_SCHEMA,
        detail: id
          ? `imported as ${id}, stored as schema ${version}`
          : 'the protocol never appeared in the database within 120s',
      };
    }),
  );
  if (!result.protocolId) throw new Error('no protocol to conduct');

  // A released image that already runs the pending schema stored the fixture
  // migrated: there is no schema 8 data for this release to carry across.
  if (result.storedSchema === String(CURRENT_SCHEMA_VERSION)) {
    checks.length = 0;
    result.notApplicable = `the released image stores the schema ${FIXTURE_SCHEMA} fixture as schema ${result.storedSchema}, the schema the pending image runs, so this release carries no schema ${FIXTURE_SCHEMA} data across`;
    const started = await startInterview(
      page,
      config.baseUrl,
      result.protocolId,
      TRANSCRIPT.participant,
    );
    result.interviewId = started.interviewId;
    writeFileSync(
      SEEDED,
      JSON.stringify(
        {
          protocolId: result.protocolId,
          interviewId: result.interviewId,
          notApplicable: result.notApplicable,
        },
        null,
        2,
      ),
    );
    return;
  }

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
      const panel = await page
        .getByRole('heading', { name: 'About each person' })
        .first()
        .isVisible()
        .catch(() => false);
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
function migrated() {
  const seeded = JSON.parse(readFileSync(SEEDED, 'utf8'));
  if (seeded.notApplicable) {
    result.notApplicable = seeded.notApplicable;
    return;
  }
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
      'migration-protocols-stored-as-schema-9',
      protocolMigrationProblems(before, after),
      `all ${before.protocols.length} protocol(s) stored before the upgrade are stored as schema 9 and end at a finish stage`,
    ),
  );
  checks.push(
    verdict(
      'migration-introduction-panels-are-information-stages',
      introductionPanelProblems(before, after),
      'every introduction panel is now an Information stage before its stage (an Ego Form panel titles its form), with its title, text and skip logic',
    ),
  );
  checks.push(
    verdict(
      'migration-pedigree-family-kept',
      pedigreeMigrationProblems(before, after),
      'every Family Pedigree family recorded before the upgrade is stored after it with every person and relationship and what each recorded, and its stage record is in the shape the redesigned stage reads',
    ),
  );
  checks.push(
    verdict(
      'migration-interviews-resume-where-they-were',
      interviewMigrationProblems(before, after),
      `all ${before.interviews.length} interview(s) are stored with their answers (outside the pedigree family, judged above) and stage records unchanged, resume at the stage they were on, and carry no outcome nothing recorded`,
    ),
  );
  const parked = after.interviews.find((i) => i.id === seeded.interviewId);
  const protocol = after.protocols.find((p) => p.id === seeded.protocolId);
  const parkedId = protocol?.stages?.[parked?.currentStep]?.id;
  checks.push(
    check(
      'migration-unfinished-interview-kept-in-place',
      parkedId === PARKED_AT,
      `the interview left unfinished before the upgrade resumes at step ${parked?.currentStep}, stage "${parkedId}" (expected "${PARKED_AT}", not the Information stage now in front of it)`,
    ),
  );
}

/** On the pending image, after the export capture: the participant returns. */
async function resume() {
  const seeded = JSON.parse(readFileSync(SEEDED, 'utf8'));
  if (seeded.notApplicable) {
    result.notApplicable = seeded.notApplicable;
    return;
  }
  const after = JSON.parse(readFileSync(AFTER, 'utf8'));
  const protocol = after.protocols.find((p) => p.id === seeded.protocolId);
  const stepOf = (id) =>
    String(protocol?.stages?.findIndex((stage) => stage.id === id));
  const participant = await launch({ lane: laneName });
  browser = participant.browser;
  const page = await newPage(participant.context);
  recordDiagnosticsTo(page, outDir);
  const { egg, sperm } = TRANSCRIPT.family;
  const drawnFamily = () =>
    page
      .getByRole('region', { name: 'Your family' })
      .getByRole('button')
      .allTextContents()
      .then((names) => names.map((name) => name.trim()).toSorted())
      .catch(() => []);

  checks.push(
    await attempt('migration-interview-resumes-where-it-was', async () => {
      await openInterview(
        page,
        `${config.baseUrl}/interview/${seeded.interviewId}`,
      );
      const at = await settledStep(page);
      const asked = await page
        .getByText('How many hours a week do you spend with them?')
        .first()
        .waitFor({ timeout: 15_000 })
        .then(() => true)
        .catch(() => false);
      const person = await page
        .getByRole('main')
        .getByRole('button', { name: TRANSCRIPT.people[0], exact: true })
        .waitFor({ timeout: 15_000 })
        .then(() => true)
        .catch(() => false);
      return {
        pass: at === stepOf(PARKED_AT) && asked && person,
        detail: `opened on step ${at} (the Alter Form "${PARKED_AT}" is step ${stepOf(PARKED_AT)}); its question about ${TRANSCRIPT.people[0]} shown: ${asked && person}`,
      };
    }),
  );

  // The Information stage carries the Alter Form's skip logic (skip when
  // nobody was named), which is false here: it has to be shown.
  checks.push(
    await attempt(
      'migration-introduction-panel-shown-as-information-stage',
      async () => {
        const at = await previousStage(page);
        const title = await page
          .getByRole('heading', { name: 'About each person' })
          .first()
          .isVisible()
          .catch(() => false);
        const text = await page
          .getByText('Now some questions about each person you named.')
          .isVisible()
          .catch(() => false);
        const questions = await page.locator('[data-field-name]').count();
        return {
          pass:
            at === stepOf(`${PARKED_AT}-introduction`) &&
            title &&
            text &&
            questions === 0,
          detail: `Back from the Alter Form reached step ${at} (its introduction is step ${stepOf(`${PARKED_AT}-introduction`)}): the panel's title shown ${title}, its text ${text}, ${questions} question(s)`,
        };
      },
    ),
  );

  // The family built on the schema 8 pedigree, drawn by the redesigned one.
  checks.push(
    await attempt('migration-pedigree-shown-after-upgrade', async () => {
      const at = await previousStage(page);
      await page
        .getByRole('region', { name: 'Your family' })
        .getByRole('button', { name: egg, exact: true })
        .waitFor({ timeout: 15_000 })
        .catch(() => {});
      const drawn = await drawnFamily();
      return {
        pass:
          at === stepOf(PEDIGREE) &&
          JSON.stringify(drawn) === JSON.stringify([egg, sperm, 'You']),
        detail: `Back from the Information stage reached step ${at} (the pedigree is step ${stepOf(PEDIGREE)}), which draws ${JSON.stringify(drawn)}`,
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
          TRANSCRIPT.people.every((name) => options.includes(name)) &&
          formStep === stepOf('about-you') &&
          value === TRANSCRIPT.egoName &&
          heading,
        detail: `step ${peopleStep} lists ${JSON.stringify(options)}; step ${formStep}'s form, headed by its former panel's title (${heading}), holds "${value}"`,
      };
    }),
  );

  checks.push(
    await attempt('migration-interview-finished-after-upgrade', async () => {
      // Forward through what is left: the people, the redesigned Family
      // Pedigree (where a parent of Linda's is added, so the migrated stage
      // is used, not just passed), the former panel, a question about each
      // person, the closing Information stage, and the finish stage the
      // migration appended.
      await nextStage(page);
      const pedigree = await nextStage(page);
      const members = await addParentOnPedigree(page, egg);
      await nextStage(page);
      await nextStage(page);
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
      await page.getByRole('button', { name: 'Finish', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor({ timeout: 15_000 });
      await dialog.getByRole('button', { name: 'Finish', exact: true }).click();
      const finished = await page
        .getByRole('heading', { name: 'Interview Finished' })
        .waitFor({ timeout: 20_000 })
        .then(() => true)
        .catch(() => false);
      const row = psql(
        `select coalesce("finishStageId", '') || '|' || coalesce("finishOutcome"::text, '') || '|' || ("finishTime" is not null) from "Interview" where id = ${sqlText(seeded.interviewId)};`,
      );
      return {
        pass:
          pedigree === stepOf(PEDIGREE) &&
          goodbye === stepOf('goodbye') &&
          finishStep === stepOf('finish') &&
          members.includes(TRANSCRIPT.grandparent) &&
          finished &&
          row === 'finish|completed|true',
        detail: `on the Family Pedigree (step ${pedigree}) added ${TRANSCRIPT.grandparent}, members now ${JSON.stringify(members)}; reached the closing stage (step ${goodbye}) and the appended finish stage (step ${finishStep}); finished text shown: ${finished}; stored stage|outcome|finished = ${row}`,
      };
    }),
  );

  // What the network holds once the interview is finished: the family
  // seeded before the upgrade, as the upgrade left it, and the parent added
  // after it with the answers the walk gave.
  let family = { people: {}, relationships: [] };
  let standIn;
  checks.push(
    await attempt('migration-pedigree-answers-stored', async () => {
      family = storedFamily(seeded.interviewId);
      const eggEdge = relationshipBetween(family, egg, 'You');
      const spermEdge = relationshipBetween(family, sperm, 'You');
      const added = relationshipBetween(family, TRANSCRIPT.grandparent, egg);
      // Adding one biological parent draws the other as well, unnamed but
      // labelled by the stage, male to Grace's female: the one person the
      // walk did not name.
      const named = new Set([TRANSCRIPT.grandparent, egg, sperm, 'You']);
      const others = Object.keys(family.people).filter((n) => !named.has(n));
      standIn = others.length === 1 ? others[0] : undefined;
      const otherParent = standIn && relationshipBetween(family, standIn, egg);
      const partners = family.relationships.filter((r) =>
        same(r.kind, ['partner']),
      );
      return {
        pass:
          [...named].every((name) => name in family.people) &&
          standIn !== undefined &&
          same(family.people.You?.sex, ['female']) &&
          same(family.people[egg]?.sex, ['female']) &&
          same(family.people[sperm]?.sex, ['male']) &&
          same(family.people[TRANSCRIPT.grandparent]?.sex, ['female']) &&
          same(family.people[standIn]?.sex, ['male']) &&
          family.relationships.length === 5 &&
          same(eggEdge?.kind, ['biological']) &&
          eggEdge?.carrier === true &&
          eggEdge?.active === null &&
          same(spermEdge?.kind, ['biological']) &&
          spermEdge?.carrier === false &&
          spermEdge?.active === null &&
          same(added?.kind, ['biological']) &&
          added?.carrier === true &&
          added?.active === null &&
          same(otherParent?.kind, ['biological']) &&
          otherParent?.carrier === false &&
          otherParent?.active === null &&
          partners.length === 1 &&
          partners[0].active === true,
        detail: `stored family ${JSON.stringify(family)}`,
      };
    }),
  );
  await participant.browser.close();

  // The researcher's export: the interview finished after the upgrade carries
  // its outcome; every interview finished before it carries none, because
  // nothing recorded where those ended.
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
      const finishedBefore = JSON.parse(readFileSync(BEFORE, 'utf8'))
        .interviews.filter((i) => i.finishTime !== null)
        .map((i) => i.id);
      const problems = finishOutcomeProblems(exported.files, {
        [seeded.interviewId]: 'completed',
        ...Object.fromEntries(finishedBefore.map((id) => [id, ''])),
      });
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
          exported.entries > 0 && problems.length === 0 && missing.length === 0,
        detail:
          exported.entries === 0
            ? `the export archive held no data files${exported.error ? ` (${exported.error})` : ''}`
            : [
                problems.length
                  ? problems.join('; ')
                  : `outcomes as expected: "completed" for ${seeded.interviewId}, none for the ${finishedBefore.length} finished before the upgrade`,
                missing.length
                  ? `the export does not carry: ${missing.join(' | ')}`
                  : "the ego's name is in this interview's one ego row and graph, and each person's name and hours in that person's one CSV row and one GraphML node",
              ].join('; '),
      };
    }),
  );

  // The family, exported: each person's name and sex at birth (one
  // true/false column per option) in that person's own records, and each
  // parent relationship's ends, kind and carrier flag in its own.
  checks.push(
    await attempt('migration-export-carries-the-pedigree', async () => {
      if (!exported) throw new Error('no export was read');
      const person = (name) =>
        family.people[name]?.id ?? `(no stored family member named ${name})`;
      // Categorical answers as the upgraded codebook lists their options.
      const codebook = JSON.parse(
        psql(
          `select codebook::jsonb from "Protocol" where id = ${sqlText(seeded.protocolId)};`,
        ) || '{}',
      );
      const sex = (value) =>
        categoricalColumns(codebook, 'node', FAMILY.type, FAMILY.sex, value);
      // A parent relationship is never marked as a current partnership: that
      // flag is the partners' alone.
      const parentEdge = (from, to, carrier) => [
        relationshipBetween(family, from, to)?.id ??
          `(no stored relationship from ${from} to ${to})`,
        {
          [ncSourceUUID]: person(from),
          [ncTargetUUID]: person(to),
          ...categoricalColumns(
            codebook,
            'edge',
            FAMILY.edge,
            FAMILY.kind,
            'biological',
          ),
          [FAMILY.carrier]: String(carrier),
          [FAMILY.active]: anythingBut('true'),
        },
      ];
      const problems = [
        ...nodeAnswerProblems(exported.files, {
          [person('You')]: sex('female'),
          [person(egg)]: { [FAMILY.name]: egg, ...sex('female') },
          [person(sperm)]: { [FAMILY.name]: sperm, ...sex('male') },
          [person(TRANSCRIPT.grandparent)]: {
            [FAMILY.name]: TRANSCRIPT.grandparent,
            ...sex('female'),
          },
          [person(standIn)]: sex('male'),
        }),
        ...edgeAnswerProblems(
          exported.files,
          Object.fromEntries([
            parentEdge(egg, 'You', true),
            parentEdge(sperm, 'You', false),
            parentEdge(TRANSCRIPT.grandparent, egg, true),
            parentEdge(standIn, egg, false),
          ]),
        ),
      ];
      return {
        pass: problems.length === 0,
        detail: problems.length
          ? problems.join('; ')
          : `each of the family (${Object.keys(family.people).join(', ')}) has one CSV row and one GraphML node holding their name and sex at birth, and each parent relationship one edge list row and one GraphML edge holding its ends, its kind (every option column), its carrier flag and no current partner flag`,
      };
    }),
  );
}

/**
 * On the migrated Family Pedigree: adds a biological parent of `child`, who
 * carried the pregnancy, through that person's menu. The redesigned panel asks
 * for a name and sex at birth, then the kind of parent and the carrier
 * question. Returns the members drawn afterwards.
 */
async function addParentOnPedigree(page, child) {
  const panel = page.getByTestId('pedigree-person-panel');
  await page
    .getByTestId('pedigree-person')
    .filter({ hasText: child })
    .first()
    .hover();
  await page.getByTestId('pedigree-menu-parent').click();
  await panel.waitFor({ timeout: 15_000 });
  await panel
    .getByRole('textbox', { name: /^Name/ })
    .fill(TRANSCRIPT.grandparent);
  await panel
    .getByRole('radiogroup', { name: /^Sex assigned at birth/ })
    .getByRole('radio', { name: 'Female', exact: true })
    .click();
  // The panel's second page asks about the relationship; Save is on it.
  const save = panel.getByRole('button', { name: 'Save', exact: true });
  await panel.getByRole('button', { name: 'Continue', exact: true }).click();
  await save.waitFor({ timeout: 15_000 });
  await panel
    .getByRole('radiogroup', { name: /^What kind of parent/ })
    .getByRole('radio', { name: 'Biological parent', exact: true })
    .click();
  await panel
    .getByRole('radiogroup', { name: /carry the pregnancy/ })
    .getByRole('radio', { name: 'Yes', exact: true })
    .click();
  await save.click();
  await panel.waitFor({ state: 'detached', timeout: 15_000 });
  return page.getByTestId('pedigree-person').allTextContents();
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
