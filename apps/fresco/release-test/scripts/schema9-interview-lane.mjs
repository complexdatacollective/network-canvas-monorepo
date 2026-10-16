#!/usr/bin/env node
// Conducts the schema 9 protocol in Fresco with the participant's browser set
// to Spanish, and follows it out through an export.
//
// interview-lane.mjs conducts a schema 8 protocol that Fresco migrates on
// import, so everything it sees is what a migrated protocol can express. This
// lane conducts one written in schema 9 (packages/protocols/e2e/
// fresco-release-test-v9): two languages and a Language Chooser, text that
// shows dynamic values, an Anonymisation stage whose passphrase encrypts the
// names a Family Pedigree records, a categorical bin answered by tapping that
// keeps the participant until everyone is placed, a stage with nobody to show,
// and two finish stages — one that waits for the participant to confirm, and
// one, reached only by skip logic when consent is declined, that finishes the
// interview as soon as it is shown.
//
// Two browsers: the participant's, whose languages are Spanish, and the
// researcher's, in English, for the import and the export. The interview's
// language is the participant's business, never the researcher's.
//
// Usage:
//   node schema9-interview-lane.mjs --lane fresh [--signed-in] [--out <dir>]
//
// Prints one JSON line: { ok, checks, ... }. The workflow binds the check ids
// to a list of its own (expectedScriptChecks.schema9).
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

// The interview's own encryption format, loaded from source, so Linda's
// stored name is decrypted exactly as the interview would decrypt it.
import {
  decryptValue,
  deriveInterviewKey,
} from '../../../../packages/interview/src/interfaces/Anonymisation/encryptionFormat.ts';
import {
  ncSourceUUID,
  ncTargetUUID,
} from '../../../../packages/shared-consts/src/export-process.ts';
import {
  attempt,
  check,
  completeSetup,
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
  previousStage,
  psqlFor,
  settledStep,
  sqlText,
  startInterview,
} from './interview-walk.mjs';
import { lane } from './lanes.mjs';
import {
  anythingBut,
  categoricalColumns,
  edgeAnswerProblems,
  egoAnswerProblems,
  encryptedValueProblems,
  finishOutcomeProblems,
  nodeAnswerProblems,
} from './schema9-export-contract.mjs';

const argv = process.argv.slice(2);
const argument = (name, fallback) => {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? fallback : argv[index + 1];
};
const laneName = argument('lane', 'fresh');
const config = lane(laneName);
const outDir = argument(
  'out',
  join(import.meta.dirname, '..', 'artifacts', laneName),
);
const fixtures = argument(
  'fixtures',
  join(import.meta.dirname, '..', 'artifacts', 'fixtures'),
);
const alreadySetUp = argv.includes('--signed-in');

const psql = psqlFor(laneName);

/** The participant's browser languages: Spanish, with English as a fallback. */
const PARTICIPANT_LOCALE = 'es-ES';

/** The fixture's stage indices (packages/protocols/e2e/fresco-release-test-v9). */
const STEP = {
  language: '0',
  welcome: '1',
  aboutYou: '2',
  privacy: '3',
  greeting: '4',
  people: '5',
  eachPerson: '6',
  contextBin: '7',
  nobodyToShow: '8',
  family: '9',
  finish: '10',
};

/** The answers this walk gives, which the export then has to carry. */
const TRANSCRIPT = {
  egoName: 'Rosa Prueba',
  passphrase: 'release-pass-1',
  people: ['Ana', 'Bruno'],
  hours: { Ana: '5', Bruno: '12' },
  // Spanish option label → the value the export carries.
  context: {
    Ana: { label: 'Trabajo', value: 'work' },
    Bruno: { label: 'Familia', value: 'family' },
  },
  // The relative the pedigree records, under the attribute the protocol
  // encrypts with the participant's passphrase, and the rest of what the
  // walk answers about her: a woman, female at birth, the participant's
  // biological parent, who carried the pregnancy.
  relative: 'Linda',
  relativeAnswers: {
    genderIdentity: 'woman',
    sexAssignedAtBirth: 'female',
    kind: 'biological',
    gestationalCarrier: true,
  },
  declinedName: 'Declina Prueba',
};

/** The fixture's person type, and the attribute that names each person. */
const PERSON = { type: 'node-type-9009-3', attribute: 'var-9009-4' };

/**
 * The fixture's Family Pedigree person type and relationship, the attributes
 * read here, and the names the export gives them (the codebook's variable
 * names; a categorical answer is one true/false column per option).
 */
const RELATIVE = {
  type: 'node-type-9009-17',
  name: 'var-9009-18',
  genderIdentity: 'var-9009-20',
  sexAssignedAtBirth: 'var-9009-21',
  ego: 'var-9009-22',
  edge: 'edge-type-9009-23',
  kind: 'var-9009-24',
  gestationalCarrier: 'var-9009-25',
  currentPartner: 'var-9009-26',
};

/**
 * One true/false column per option of one of the relative's categorical
 * answers, as the stored codebook lists the options.
 */
const optionColumns = (codebook, entity, variable, chosen) =>
  categoricalColumns(
    codebook,
    entity,
    entity === 'node' ? RELATIVE.type : RELATIVE.edge,
    RELATIVE[variable],
    chosen,
  );

const checks = [];
const result = { ok: false, checks };
let browser;

/** Inserted dynamic values: the text of each value, without its sr-only twin. */
const insertedValues = (locator) =>
  locator.locator('[data-dynamic-value] bdi').allTextContents();

try {
  const researcher = await launch({ lane: laneName });
  browser = researcher.browser;
  const desk = await newPage(researcher.context);
  if (alreadySetUp) {
    await signIn(desk, { lane: laneName });
    await desk.waitForURL(/\/dashboard/, { timeout: 90_000 });
  } else {
    await completeSetup(desk, { lane: laneName });
  }

  checks.push(
    await attempt('schema9-protocol-imported', async () => {
      const id = await importProtocol(desk, {
        baseUrl: config.baseUrl,
        psql,
        path: join(fixtures, 'fresco-release-test-v9.netcanvas'),
        fileStem: 'fresco-release-test-v9',
        upload: uploadProtocol,
      });
      result.protocolId = id;
      const stored = id
        ? psql(
            `select "schemaVersion" || '|' || (localization->>'defaultLocale') || '|' || jsonb_array_length(stages::jsonb) from "Protocol" where id = ${sqlText(id)};`,
          )
        : '';
      return {
        pass: stored === '9|en|12',
        detail: id
          ? `imported as ${id}, stored as schema|default language|stages = ${stored}`
          : 'the protocol never appeared in the database within 120s',
      };
    }),
  );
  if (!result.protocolId) throw new Error('no protocol to conduct');

  // The participant: a browser of their own, whose languages are Spanish.
  const participantBrowser = await launch({
    lane: laneName,
    locale: PARTICIPANT_LOCALE,
  });
  const visitor = participantBrowser.context;
  const page = await newPage(visitor);
  recordDiagnosticsTo(page, outDir);
  const main = () => page.getByRole('main');
  const step = () => settledStep(page);

  // --- language ----------------------------------------------------------
  checks.push(
    await attempt('schema9-opens-in-browser-language', async () => {
      const started = await startInterview(
        page,
        config.baseUrl,
        result.protocolId,
        `schema9-${Date.now()}`,
      );
      result.interviewId = started.interviewId;
      const at = await step();
      const lang = await main().getAttribute('lang');
      const chooser = page.getByRole('listbox', { name: 'Elige un idioma' });
      const selected = await chooser
        .getByRole('option', { name: 'español' })
        .getAttribute('aria-selected')
        .catch(() => null);
      const interfaceSpanish = await page
        .getByRole('button', { name: 'Siguiente paso' })
        .isVisible()
        .catch(() => false);
      return {
        pass:
          at === STEP.language &&
          lang === 'es' &&
          selected === 'true' &&
          interfaceSpanish,
        detail: `interview ${result.interviewId} opened on step ${at} with lang="${lang}", español selected: ${selected}, interface in Spanish: ${interfaceSpanish}`,
      };
    }),
  );

  checks.push(
    await attempt('schema9-language-chooser-switches', async () => {
      await page
        .getByRole('listbox', { name: 'Elige un idioma' })
        .getByRole('option', { name: 'English' })
        .click();
      await page
        .getByRole('listbox', { name: 'Choose a language' })
        .waitFor({ timeout: 15_000 });
      const englishLang = await main().getAttribute('lang');
      await nextStage(page);
      const englishHeading = await page
        .getByRole('heading', { name: 'Welcome', exact: true })
        .isVisible()
        .catch(() => false);
      await previousStage(page);
      await page
        .getByRole('listbox', { name: 'Choose a language' })
        .getByRole('option', { name: 'español' })
        .click();
      await page
        .getByRole('listbox', { name: 'Elige un idioma' })
        .waitFor({ timeout: 15_000 });
      const spanishLang = await main().getAttribute('lang');
      await nextStage(page);
      const spanishHeading = await page
        .getByRole('heading', { name: 'Bienvenida', exact: true })
        .isVisible()
        .catch(() => false);
      return {
        pass:
          englishLang === 'en' &&
          englishHeading &&
          spanishLang === 'es' &&
          spanishHeading,
        detail: `English chosen: lang="${englishLang}", "Welcome" shown: ${englishHeading}; español chosen again: lang="${spanishLang}", "Bienvenida" shown: ${spanishHeading}`,
      };
    }),
  );

  // --- dynamic values ----------------------------------------------------
  // Three bindings, each read where the participant reads it: the date the
  // interview started, formatted in the interview's language; the ego's own
  // answer, in a heading and a sentence on a later stage; and each person's
  // label, in a form question asked about them.
  const dynamic = {};
  {
    const line = page.getByText(/^Esta entrevista se empezó el/).first();
    dynamic.today = await insertedValues(line).catch(() => []);
  }

  await nextStage(page);
  checks.push(
    await attempt('schema9-ego-form-answered', async () => {
      const at = await step();
      const name = page.getByRole('textbox', { name: '¿Cómo te llamas?' });
      await name.fill(TRANSCRIPT.egoName);
      // Blur is load-bearing: protocol forms validate on blur.
      await name.blur();
      await page.getByRole('radio', { name: 'Sí, acepto' }).click();
      await page.waitForTimeout(500);
      const value = await name.inputValue();
      const consented = await page
        .getByRole('radio', { name: 'Sí, acepto' })
        .isChecked();
      return {
        pass: at === STEP.aboutYou && value === TRANSCRIPT.egoName && consented,
        detail: `step ${at}: name "${value}", consent given: ${consented}`,
      };
    }),
  );
  await nextStage(page);

  // --- encryption --------------------------------------------------------
  checks.push(
    await attempt('schema9-passphrase-chosen', async () => {
      const at = await step();
      await page
        .locator('[data-field-name="passphrase"] input')
        .fill(TRANSCRIPT.passphrase);
      await page
        .locator('[data-field-name="passphrase-2"] input')
        .fill(TRANSCRIPT.passphrase);
      await page.locator('button[type="submit"]').click();
      const accepted = await page
        .getByText(/Frase de contraseña aceptada/)
        .first()
        .waitFor({ timeout: 20_000 })
        .then(() => true)
        .catch(() => false);
      return {
        pass: at === STEP.privacy && accepted,
        detail: `step ${at}: passphrase chosen and accepted: ${accepted}`,
      };
    }),
  );
  await nextStage(page);
  {
    const heading = page.getByRole('heading', { level: 1 }).first();
    dynamic.greeting = await insertedValues(heading).catch(() => []);
    dynamic.greetingStep = await step();
  }
  await nextStage(page);

  checks.push(
    await attempt('schema9-people-named', async () => {
      const at = await step();
      for (const name of TRANSCRIPT.people) {
        const toggle = page.getByTestId('quick-add-toggle');
        if ((await toggle.getAttribute('aria-pressed')) !== 'true')
          await toggle.click();
        const input = page.getByTestId('quick-add-input');
        await input.fill(name);
        await input.press('Enter');
        await page.getByRole('option', { name }).waitFor({ timeout: 15_000 });
      }
      const options = await page.getByRole('option').allTextContents();
      return {
        pass:
          at === STEP.people &&
          TRANSCRIPT.people.every((name) => options.includes(name)),
        detail: `step ${at}: added ${options.join(', ')}`,
      };
    }),
  );
  await nextStage(page);

  // The Alter Form asks one question per person, and names them in it.
  dynamic.perPerson = [];
  for (const name of TRANSCRIPT.people) {
    await main()
      .getByRole('button', { name, exact: true })
      .waitFor({ timeout: 15_000 });
    const question = page
      .getByText(/^¿Cuántas horas a la semana pasas con/)
      .first();
    dynamic.perPerson.push(await insertedValues(question).catch(() => []));
    const field = page.locator('[data-field-name="hours"] input');
    await field.fill(TRANSCRIPT.hours[name]);
    await field.blur();
    await page.waitForTimeout(400);
    await settledStep(page);
    await page.getByTestId('next-button').click();
    await page.waitForTimeout(1500);
  }

  checks.push(
    check(
      'schema9-dynamic-values',
      (() => {
        const today = new Intl.DateTimeFormat('es', {
          dateStyle: 'long',
        }).format(new Date());
        return (
          JSON.stringify(dynamic.today) === JSON.stringify([today]) &&
          dynamic.greetingStep === STEP.greeting &&
          dynamic.greeting.length === 1 &&
          dynamic.greeting[0] === TRANSCRIPT.egoName &&
          JSON.stringify(dynamic.perPerson) ===
            JSON.stringify(TRANSCRIPT.people.map((name) => [name]))
        );
      })(),
      `start date ${JSON.stringify(dynamic.today)} (expected ${JSON.stringify(
        new Intl.DateTimeFormat('es', { dateStyle: 'long' }).format(new Date()),
      )}); greeting on step ${dynamic.greetingStep} named ${JSON.stringify(dynamic.greeting)}; per-person questions named ${JSON.stringify(dynamic.perPerson)}`,
    ),
  );

  // --- the bin -----------------------------------------------------------
  checks.push(
    await attempt('schema9-bin-completion-gate', async () => {
      const at = await step();
      await page.getByTestId('next-button').click();
      const notice = await page
        .getByText('Debes colocar todos los elementos antes de continuar.')
        .first()
        .waitFor({ timeout: 10_000 })
        .then(() => true)
        .catch(() => false);
      // Time for a wrongly permitted advance to land before reading the step.
      await page.waitForTimeout(1000);
      const after = await step();
      return {
        pass: at === STEP.contextBin && notice && after === STEP.contextBin,
        detail: `Next pressed on step ${at} with everyone unplaced: notice shown ${notice}, still on step ${after}`,
      };
    }),
  );

  checks.push(
    await attempt('schema9-bin-tap-to-place', async () => {
      const person = (name) =>
        main().getByRole('button', { name, exact: true });
      const first = TRANSCRIPT.people[0];
      const second = TRANSCRIPT.people[1];
      const initiallySelected =
        await person(first).getAttribute('aria-pressed');
      // Out of turn: tapping someone else in the drawer makes them the one
      // being placed.
      await person(second).click();
      const outOfTurn = await person(second).getAttribute('aria-pressed');
      for (const name of [second, first]) {
        if ((await person(name).getAttribute('aria-pressed')) !== 'true')
          await person(name).click();
        await page
          .getByRole('button', {
            name: `Colocar a ${name} en «${TRANSCRIPT.context[name].label}»`,
          })
          .click();
        await page.waitForTimeout(800);
      }
      const done = await page
        .getByText('0 sin colocar')
        .isVisible()
        .catch(() => false);
      // The stored answers, waited for: Fresco batches sync writes, so the
      // database catches up with the screen within the debounce interval.
      const deadline = Date.now() + 20_000;
      let stored = '';
      while (Date.now() < deadline) {
        stored = psql(
          `select string_agg(n->'attributes'->'var-9009-4' #>> '{}' || '=' || coalesce(n->'attributes'->'context'->>0, ''), ',' order by n->'attributes'->>'var-9009-4') from "Interview", jsonb_array_elements(network::jsonb->'nodes') n where id = ${sqlText(result.interviewId)} and n->>'type' = 'node-type-9009-3';`,
        );
        if (stored === 'Ana=work,Bruno=family') break;
        await page.waitForTimeout(1000);
      }
      return {
        pass:
          initiallySelected === 'true' &&
          outOfTurn === 'true' &&
          done &&
          stored === 'Ana=work,Bruno=family',
        detail: `${first} selected first: ${initiallySelected}; ${second} selected out of turn: ${outOfTurn}; nothing left to place: ${done}; stored contexts = ${stored}`,
      };
    }),
  );

  // --- a stage with nobody to show --------------------------------------
  checks.push(
    await attempt('schema9-empty-stage-skipped', async () => {
      const forward = await nextStage(page);
      const back = await previousStage(page);
      const again = await nextStage(page);
      return {
        pass:
          forward === STEP.family &&
          back === STEP.contextBin &&
          again === STEP.family,
        detail: `Next from ${STEP.contextBin} → ${forward}, Back → ${back}, Next → ${again}; the pets stage (step ${STEP.nobodyToShow}) has nobody to show`,
      };
    }),
  );

  // --- the family pedigree ----------------------------------------------
  checks.push(
    await attempt('schema9-pedigree-relative-added', async () => {
      await page.getByTestId('pedigree-person').first().waitFor();
      await page.getByTestId('pedigree-person').first().hover();
      await page.getByTestId('pedigree-menu-parent').click();
      const panel = page.getByTestId('pedigree-person-panel');
      await panel.waitFor();
      const title = await panel
        .getByRole('heading', { name: 'Añadir tu progenitor' })
        .isVisible()
        .catch(() => false);
      await panel
        .getByRole('textbox', { name: /^Nombre/ })
        .fill(TRANSCRIPT.relative);
      await panel
        .getByRole('radiogroup', { name: /^Identidad de género/ })
        .getByRole('radio', { name: 'Mujer', exact: true })
        .click();
      await panel
        .getByRole('radiogroup', { name: /^Sexo asignado al nacer/ })
        .getByRole('radio', { name: 'Femenino', exact: true })
        .click();
      await panel
        .getByRole('radiogroup', { name: /^¿Fue este progenitor/ })
        .getByRole('radio', { name: 'Sí', exact: true })
        .click();
      await panel.getByRole('button', { name: 'Guardar', exact: true }).click();
      await panel.waitFor({ state: 'detached', timeout: 20_000 });
      await page.waitForTimeout(1000);
      const people = await page
        .getByTestId('pedigree-person')
        .evaluateAll((elements) =>
          elements.map((element) => element.textContent?.trim() ?? ''),
        );
      return {
        pass:
          title &&
          people.length === 3 &&
          people.some((label) => label.startsWith(TRANSCRIPT.relative)),
        detail: `panel titled in Spanish: ${title}; the family drawn: ${JSON.stringify(people)}`,
      };
    }),
  );
  await nextStage(page);

  // --- finishing ---------------------------------------------------------
  checks.push(
    await attempt('schema9-finished-with-outcome', async () => {
      const at = await step();
      await page
        .getByRole('button', { name: 'Finalizar', exact: true })
        .click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor({ timeout: 15_000 });
      await dialog
        .getByRole('button', { name: 'Finalizar', exact: true })
        .click();
      const finished = await page
        .getByRole('heading', { name: 'Entrevista finalizada' })
        .waitFor({ timeout: 20_000 })
        .then(() => true)
        .catch(() => false);
      const row = psql(
        `select coalesce("finishStageId", '') || '|' || coalesce("finishOutcome"::text, '') || '|' || ("finishTime" is not null) || '|' || (select count(*) from jsonb_array_elements(network::jsonb->'nodes') n where n->>'type' = 'node-type-9009-17') from "Interview" where id = ${sqlText(result.interviewId)};`,
      );
      // The pedigree was the last thing answered before finishing; finishing
      // waits for the latest answers to be saved, so all three relatives are
      // in the stored network by the time the interview is finished.
      return {
        pass:
          at === STEP.finish && finished && row === 'finish|completed|true|3',
        detail: `finish stage at step ${at}; finished text shown: ${finished}; stored stage|outcome|finished|relatives = ${row}`,
      };
    }),
  );

  checks.push(
    await attempt('schema9-encrypted-name-stored-encrypted', async () => {
      const stored = JSON.parse(
        psql(
          `select json_build_object('nodes', network::jsonb->'nodes', 'stageMetadata', "stageMetadata", 'relative', position(${sqlText(TRANSCRIPT.relative)} in network::text), 'ego', position(${sqlText(TRANSCRIPT.egoName)} in network::text)) from "Interview" where id = ${sqlText(result.interviewId)};`,
        ),
      );
      // The stage labels the relatives it adds itself ("Sperm parent"), and
      // holds that label in the same encrypted name attribute, so a count of
      // encrypted names would pass with Linda's lost. Her node is the one
      // relative who is neither the participant nor a person the stage
      // records as labelled by itself.
      const generated = new Set();
      const collect = (value) => {
        if (!value || typeof value !== 'object') return;
        for (const [key, inner] of Object.entries(value)) {
          if (key === 'generatedLabels' && inner && typeof inner === 'object')
            for (const id of Object.keys(inner)) generated.add(id);
          else collect(inner);
        }
      };
      collect(stored.stageMetadata);
      const relatives = (stored.nodes ?? []).filter(
        (node) => node.type === RELATIVE.type,
      );
      const named = relatives.filter(
        (node) =>
          node.attributes?.[RELATIVE.ego] !== true && !generated.has(node._uid),
      );
      const linda = named.length === 1 ? named[0] : undefined;
      result.relativeNodeId = linda?._uid;
      // Encrypted, and still hers: the stored value has to decrypt, with the
      // passphrase this walk chose and bound to her node and the name
      // variable, to the name the walk typed. Any ciphertext would pass a
      // check that only looked for one.
      const value = linda?.attributes?.[RELATIVE.name];
      const iv = linda?._secureAttributes?.[RELATIVE.name]?.iv;
      let decrypted = '<no ciphertext>';
      if (Array.isArray(value) && Array.isArray(iv))
        decrypted = await decryptValue(
          await deriveInterviewKey(TRANSCRIPT.passphrase, result.interviewId),
          { iv, data: value },
          { nodeId: linda._uid, variableId: RELATIVE.name },
        ).catch((error) => `<refused: ${error?.name ?? error}>`);
      const held = decrypted === TRANSCRIPT.relative;
      // The ego's name is the positive control: a network that could not be
      // read at all would not hold the relative's name either.
      return {
        pass:
          stored.relative === 0 && stored.ego > 0 && generated.size > 0 && held,
        detail: `"${TRANSCRIPT.relative}" in the stored network: ${stored.relative > 0}; the ego's unencrypted name found: ${stored.ego > 0}; relatives the stage labelled itself: ${generated.size}; relatives the participant named: ${named.length}${linda ? ` (node ${linda._uid}, stored name decrypts to ${JSON.stringify(decrypted)})` : ''}`,
      };
    }),
  );

  // Linda's other answers, as stored: her gender identity and sex at birth,
  // and the one relationship that makes her the participant's parent, with
  // its kind and who carried the pregnancy.
  checks.push(
    await attempt('schema9-pedigree-answers-stored', async () => {
      if (!result.relativeNodeId)
        throw new Error(
          `the stored network did not identify ${TRANSCRIPT.relative}'s node`,
        );
      const network = JSON.parse(
        psql(
          `select network::jsonb from "Interview" where id = ${sqlText(result.interviewId)};`,
        ),
      );
      const linda = network.nodes.find(
        (node) => node._uid === result.relativeNodeId,
      );
      const egos = network.nodes.filter(
        (node) =>
          node.type === RELATIVE.type &&
          node.attributes?.[RELATIVE.ego] === true,
      );
      result.familyEgoNodeId = egos.length === 1 ? egos[0]._uid : undefined;
      const edges = network.edges.filter(
        (edge) =>
          edge.type === RELATIVE.edge &&
          edge.from === result.relativeNodeId &&
          edge.to === result.familyEgoNodeId,
      );
      result.relativeEdgeId = edges.length === 1 ? edges[0]._uid : undefined;
      // Adding Linda as a biological parent draws the other biological
      // parent too: the one relative besides her and the participant, who
      // has to be the participant's parent as well, not an orphan.
      const others = network.nodes.filter(
        (node) =>
          node.type === RELATIVE.type &&
          node._uid !== result.relativeNodeId &&
          node._uid !== result.familyEgoNodeId,
      );
      result.standInNodeId = others.length === 1 ? others[0]._uid : undefined;
      const standInEdges = network.edges.filter(
        (edge) =>
          edge.type === RELATIVE.edge &&
          edge.from === result.standInNodeId &&
          edge.to === result.familyEgoNodeId,
      );
      result.standInEdgeId =
        standInEdges.length === 1 ? standInEdges[0]._uid : undefined;
      const stored = {
        genderIdentity: linda?.attributes?.[RELATIVE.genderIdentity] ?? null,
        sexAssignedAtBirth:
          linda?.attributes?.[RELATIVE.sexAssignedAtBirth] ?? null,
        parentRelationships: edges.map((edge) => ({
          kind: edge.attributes?.[RELATIVE.kind] ?? null,
          gestationalCarrier:
            edge.attributes?.[RELATIVE.gestationalCarrier] ?? null,
          currentPartner: edge.attributes?.[RELATIVE.currentPartner] ?? null,
        })),
        otherParent: standInEdges.map((edge) => ({
          kind: edge.attributes?.[RELATIVE.kind] ?? null,
          gestationalCarrier:
            edge.attributes?.[RELATIVE.gestationalCarrier] ?? null,
          currentPartner: edge.attributes?.[RELATIVE.currentPartner] ?? null,
        })),
      };
      const answers = TRANSCRIPT.relativeAnswers;
      const expected = {
        genderIdentity: [answers.genderIdentity],
        sexAssignedAtBirth: [answers.sexAssignedAtBirth],
        parentRelationships: [
          {
            kind: [answers.kind],
            gestationalCarrier: answers.gestationalCarrier,
            // The current partner flag belongs to partners only.
            currentPartner: null,
          },
        ],
        otherParent: [
          {
            kind: [answers.kind],
            gestationalCarrier: false,
            currentPartner: null,
          },
        ],
      };
      return {
        pass:
          egos.length === 1 &&
          JSON.stringify(stored) === JSON.stringify(expected),
        detail: `${TRANSCRIPT.relative} (node ${result.relativeNodeId}) is stored with ${JSON.stringify(stored)} (expected ${JSON.stringify(expected)}); participants in the family: ${egos.length}; other relatives: ${others.length}`,
      };
    }),
  );

  // --- a second interview, which declines -------------------------------
  checks.push(
    await attempt('schema9-declined-finishes-automatically', async () => {
      const declinePage = await newPage(visitor);
      const started = await startInterview(
        declinePage,
        config.baseUrl,
        result.protocolId,
        `schema9-declined-${Date.now()}`,
      );
      result.declinedInterviewId = started.interviewId;
      await nextStage(declinePage);
      await nextStage(declinePage);
      const name = declinePage.getByRole('textbox', {
        name: '¿Cómo te llamas?',
      });
      await name.fill(TRANSCRIPT.declinedName);
      await name.blur();
      await declinePage.getByRole('radio', { name: 'No, no acepto' }).click();
      await declinePage.waitForTimeout(500);
      await settledStep(declinePage);
      await declinePage.getByTestId('next-button').click();
      // Automatic mode: no confirmation, the interview is finished as soon as
      // the stage is shown, and there is no way back.
      const shown = await declinePage
        .getByRole('heading', { name: 'Elegiste no participar' })
        .waitFor({ timeout: 20_000 })
        .then(() => true)
        .catch(() => false);
      const deadline = Date.now() + 30_000;
      let row = '';
      while (Date.now() < deadline) {
        row = psql(
          `select coalesce("finishStageId", '') || '|' || coalesce("finishOutcome"::text, '') || '|' || ("finishTime" is not null) from "Interview" where id = ${sqlText(started.interviewId)};`,
        );
        if (!row.startsWith('||')) break;
        await declinePage.waitForTimeout(1000);
      }
      const back = await declinePage
        .getByTestId('previous-button')
        .isVisible()
        .catch(() => false);
      await declinePage.close();
      return {
        // Finished, too: a finish time is what marks an interview complete.
        pass: shown && row === 'finish-declined|terminated|true' && !back,
        detail: `declining consent showed the second finish stage: ${shown}; stored stage|outcome|finished = ${row}; a way back offered: ${back}`,
      };
    }),
  );
  await participantBrowser.browser.close();

  // --- the export --------------------------------------------------------
  recordDiagnosticsTo(desk, outDir);
  let exported = null;
  checks.push(
    await attempt('schema9-export-carries-the-answers', async () => {
      const archivePath = await exportAllInterviews(
        desk,
        config.baseUrl,
        join(outDir, 'schema9-export.zip'),
      );
      result.exportPath = archivePath;
      exported = await readInterviewExport(archivePath);
      // Each answer is read from its own record. Each interview's ego answers
      // from that interview's one ego row and one graph, and the short
      // answers ("5", "work") — which would be found anywhere in the
      // archive's text — from each person's own records: a categorical
      // answer is one true/false column per option.
      const misplaced = egoAnswerProblems(exported.files, {
        [result.interviewId]: { ego_name: TRANSCRIPT.egoName, consent: 'true' },
        [result.declinedInterviewId]: {
          ego_name: TRANSCRIPT.declinedName,
          consent: 'false',
        },
      });
      const ids = nodeIdsBy(psql, result.interviewId, PERSON);
      const codebook = JSON.parse(
        psql(
          `select codebook::jsonb from "Protocol" where id = ${sqlText(result.protocolId)};`,
        ) || '{}',
      );
      misplaced.push(
        ...nodeAnswerProblems(
          exported.files,
          Object.fromEntries(
            TRANSCRIPT.people.map((name) => [
              ids[name] ?? `(no stored node named ${name})`,
              {
                name,
                hours: TRANSCRIPT.hours[name],
                // Every option the codebook lists, not only the ones chosen.
                ...categoricalColumns(
                  codebook,
                  'node',
                  PERSON.type,
                  'context',
                  TRANSCRIPT.context[name].value,
                ),
              },
            ]),
          ),
        ),
      );
      return {
        pass: exported.entries > 0 && misplaced.length === 0,
        detail:
          exported.entries === 0
            ? `the export archive held no data files${exported.error ? ` (${exported.error})` : ''}`
            : misplaced.length
              ? misplaced.join('; ')
              : `each interview's ego name and consent are in its one ego CSV row and its one GraphML graph, and each person's name, hours and context in that person's one CSV row and one GraphML node (${exported.entries} file(s))`,
      };
    }),
  );

  checks.push(
    await attempt('schema9-export-records-outcomes', async () => {
      if (!exported) throw new Error('no export was read');
      const problems = finishOutcomeProblems(exported.files, {
        [result.interviewId]: 'completed',
        [result.declinedInterviewId]: 'terminated',
      });
      return {
        pass: problems.length === 0,
        detail: problems.length
          ? problems.join('; ')
          : 'the ego CSV and the GraphML record "completed" and "terminated" for the two interviews',
      };
    }),
  );

  checks.push(
    await attempt('schema9-export-carries-pedigree-answers', async () => {
      if (!exported) throw new Error('no export was read');
      if (!result.relativeNodeId || !result.relativeEdgeId)
        throw new Error(
          `the stored network did not identify ${TRANSCRIPT.relative}'s node and her one relationship to the participant`,
        );
      const answers = TRANSCRIPT.relativeAnswers;
      const codebook = JSON.parse(
        psql(
          `select codebook::jsonb from "Protocol" where id = ${sqlText(result.protocolId)};`,
        ) || '{}',
      );
      const problems = [
        ...nodeAnswerProblems(exported.files, {
          [result.relativeNodeId]: {
            ...optionColumns(
              codebook,
              'node',
              'genderIdentity',
              answers.genderIdentity,
            ),
            ...optionColumns(
              codebook,
              'node',
              'sexAssignedAtBirth',
              answers.sexAssignedAtBirth,
            ),
          },
        }),
        ...edgeAnswerProblems(exported.files, {
          [result.relativeEdgeId]: {
            [ncSourceUUID]: result.relativeNodeId,
            [ncTargetUUID]: result.familyEgoNodeId,
            ...optionColumns(codebook, 'edge', 'kind', answers.kind),
            gestationalCarrier: String(answers.gestationalCarrier),
            currentPartner: anythingBut('true'),
          },
          [result.standInEdgeId ??
          '(no stored relationship for the other parent)']: {
            [ncSourceUUID]: result.standInNodeId,
            [ncTargetUUID]: result.familyEgoNodeId,
            ...optionColumns(codebook, 'edge', 'kind', answers.kind),
            gestationalCarrier: 'false',
            currentPartner: anythingBut('true'),
          },
        }),
      ];
      return {
        pass: problems.length === 0,
        detail: problems.length
          ? problems.join('; ')
          : `${TRANSCRIPT.relative}'s one CSV row and one GraphML node hold her gender identity and sex at birth, and her relationship and the other parent's to the participant each have one edge list row and one GraphML edge holding its ends, its kind and its carrier flag`,
      };
    }),
  );

  checks.push(
    await attempt('schema9-export-keeps-encrypted-value-out', async () => {
      if (!exported) throw new Error('no export was read');
      if (!result.relativeNodeId)
        throw new Error(
          `the stored network did not identify ${TRANSCRIPT.relative}'s node`,
        );
      const problems = encryptedValueProblems(
        exported.files,
        TRANSCRIPT.relative,
        result.relativeNodeId,
      );
      return {
        pass: problems.length === 0,
        detail: problems.length
          ? problems.join('; ')
          : `"${TRANSCRIPT.relative}" is in no exported file, and each exported record of her node (${result.relativeNodeId}) carries the encrypted placeholder`,
      };
    }),
  );
  result.ok = true;
} catch (error) {
  result.error = error.message;
  checks.push(check('schema9-walk-completed', false, error.message));
} finally {
  await browser?.close().catch(() => {});
}

writeFileSync(
  join(outDir, 'schema9-walk.json'),
  JSON.stringify({ ...result, transcript: TRANSCRIPT }, null, 2),
);
report(result);
process.exit(0);
