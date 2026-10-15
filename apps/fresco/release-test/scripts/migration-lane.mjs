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
//                     it to the stage behind an introduction panel and leaves
//                     it there unfinished, then reads every protocol and
//                     interview the deployment holds into
//                     artifacts/migration/before.json.
//   --phase migrated  on the pending image, straight after the swap and
//                     BEFORE anything opens an interview: reads the database
//                     again into artifacts/migration/after.json and compares
//                     the two readings (migration-contract.mjs). Read-only, so
//                     the export capture that follows still sees exactly what
//                     the migration left.
//   --phase resume    on the pending image, after the export capture: opens
//                     the unfinished interview as its participant, and
//                     finishes it, and exports it.
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
  protocolMigrationProblems,
} from './migration-contract.mjs';
import {
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

/** The answers the seeded interview gives before the upgrade. */
const TRANSCRIPT = {
  participant: 'migration-resume',
  egoName: 'Mira Upgrade',
  people: ['Alex', 'Blair'],
  hours: { Alex: '3', Blair: '7' },
  parent: 'Linda',
};

/** The fixture's stages, by id: where the walk parks, and what surrounds it. */
const PARKED_AT = 'each-person';

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
      `select coalesce(json_agg(json_build_object('id', id, 'name', name, 'schemaVersion', "schemaVersion", 'stages', stages) order by id), '[]') from "Protocol";`,
    ),
  );
  const interviews = JSON.parse(
    psql(
      `select coalesce(json_agg(json_build_object('id', id, 'protocolId', "protocolId", 'currentStep', "currentStep", 'finishTime', "finishTime"::text, 'finishStageId', ${hasFinish ? '"finishStageId"' : 'null'}, 'finishOutcome', ${hasFinish ? '"finishOutcome"::text' : 'null'}, 'networkHash', md5(network::jsonb::text), 'stageMetadataKeys', (select coalesce(json_agg(key order by key), '[]') from jsonb_object_keys(case when jsonb_typeof("stageMetadata"::jsonb) = 'object' then "stageMetadata"::jsonb else '{}'::jsonb end) key)) order by id), '[]') from "Interview";`,
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

  // The released interview, as its participant meets it: the Ego Form shows
  // its panel above its question; the Alter Form opens on its panel.
  checks.push(
    await attempt('migration-seed-interview-parked', async () => {
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
      await nextStage(page);
      const at = await settledStep(page);
      // Parked: the database has to hold the position and the answers before
      // anything reads it, and Fresco batches its sync writes.
      const stages = JSON.parse(
        psql(
          `select stages from "Protocol" where id = ${sqlText(result.protocolId)};`,
        ),
      );
      const parkedStep = stages.findIndex((stage) => stage.id === PARKED_AT);
      const deadline = Date.now() + 30_000;
      let row = '';
      const want = `${parkedStep}|${TRANSCRIPT.egoName}|${TRANSCRIPT.people.length}`;
      while (Date.now() < deadline) {
        row = psql(
          `select "currentStep" || '|' || coalesce(network::jsonb #>> '{ego,attributes,ego_name}', '') || '|' || jsonb_array_length(network::jsonb->'nodes') from "Interview" where id = ${sqlText(result.interviewId)};`,
        );
        if (row === want) break;
        await page.waitForTimeout(1000);
      }
      return {
        pass: at === String(parkedStep) && row === want,
        detail: `interview ${result.interviewId} on step ${at}; stored step|ego name|people = ${row} (expected ${want})`,
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
      'migration-interviews-resume-where-they-were',
      interviewMigrationProblems(before, after),
      `all ${before.interviews.length} interview(s) are stored with their answers and stage records unchanged, resume at the stage they were on, and carry no outcome nothing recorded`,
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
      // Forward through what is left: the people, the former panel, a
      // question about each person, the redesigned Family Pedigree (which
      // holds the participant until their own sex at birth is recorded; a
      // parent is added too, so the migrated stage is used, not just passed),
      // the closing Information stage, and the finish stage the migration
      // appended.
      await nextStage(page);
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
      const pedigree = await settledStep(page);
      const members = await completeFamilyPedigree(page);
      await nextStage(page);
      await nextStage(page);
      const finishStep = await settledStep(page);
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
          pedigree === stepOf('family') &&
          finishStep === stepOf('finish') &&
          members.includes(TRANSCRIPT.parent) &&
          finished &&
          row === 'finish|completed|true',
        detail: `passed the Family Pedigree (step ${pedigree}, members ${JSON.stringify(members)}) and reached the appended finish stage (step ${finishStep}); finished text shown: ${finished}; stored stage|outcome|finished = ${row}`,
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
      const exported = await readInterviewExport(archivePath);
      const finishedBefore = JSON.parse(readFileSync(BEFORE, 'utf8'))
        .interviews.filter((i) => i.finishTime !== null)
        .map((i) => i.id);
      const problems = finishOutcomeProblems(exported.files, {
        [seeded.interviewId]: 'completed',
        ...Object.fromEntries(finishedBefore.map((id) => [id, ''])),
      });
      const answers = [
        TRANSCRIPT.egoName,
        ...TRANSCRIPT.people,
        ...Object.values(TRANSCRIPT.hours),
      ];
      const missing = answers.filter(
        (answer) => !exported.text.includes(answer),
      );
      // "3" and "7" would be found anywhere in the archive's text, so each
      // person's hours are read from that person's own records.
      const ids = nodeIdsBy(psql, seeded.interviewId, {
        type: 'person',
        attribute: 'name',
      });
      const misplaced = nodeAnswerProblems(
        exported.files,
        Object.fromEntries(
          TRANSCRIPT.people.map((name) => [
            ids[name] ?? `(no stored node named ${name})`,
            { hours: TRANSCRIPT.hours[name] },
          ]),
        ),
      );
      missing.push(...misplaced);
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
                  : 'every answer given before and after the upgrade is exported',
              ].join('; '),
      };
    }),
  );
}

/**
 * On the migrated Family Pedigree: adds a parent through the participant's
 * menu, then records the participant's own sex at birth — the redesigned
 * stage asks for it before it lets them continue. Returns the members shown.
 */
async function completeFamilyPedigree(page) {
  const panel = page.getByTestId('pedigree-person-panel');
  const sexAtBirth = panel
    .getByRole('radiogroup', { name: /^Sex assigned at birth/ })
    .getByRole('radio', { name: 'Female', exact: true });
  const save = async () => {
    const button = panel.getByRole('button', { name: 'Save', exact: true });
    for (let i = 0; i < 5 && !(await button.isVisible()); i++)
      await panel.getByRole('button', { name: /^(Continue|Skip)$/ }).click();
    await button.click();
    await panel.waitFor({ state: 'detached', timeout: 15_000 });
  };

  await page.getByTestId('pedigree-person').first().hover();
  await page.getByTestId('pedigree-menu-parent').click();
  await panel.waitFor({ timeout: 15_000 });
  await panel.getByRole('textbox', { name: /^Name/ }).fill(TRANSCRIPT.parent);
  await sexAtBirth.click();
  const carried = panel
    .getByRole('radiogroup', { name: /carry the pregnancy/ })
    .getByRole('radio', { name: 'Yes', exact: true });
  await carried.waitFor({ timeout: 5_000 }).catch(() => {});
  if (await carried.isVisible().catch(() => false)) await carried.click();
  await save();

  await page
    .getByRole('region', { name: 'Your family' })
    .getByRole('button', { name: 'You' })
    .click();
  await panel.waitFor({ timeout: 15_000 });
  await sexAtBirth.click();
  await save();
  return page.getByTestId('pedigree-person').allTextContents();
}
