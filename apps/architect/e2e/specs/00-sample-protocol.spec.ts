import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { BrowserContext, Page } from '@playwright/test';

import {
  type CurrentProtocol,
  validateProtocol,
} from '@codaco/protocol-validation';

import { expect, gotoProtocol, test } from '../fixtures/architect-test.js';
import { emptyProtocol, seedProtocol } from '../fixtures/seed.js';
import {
  assertBuiltProtocolInvariants,
  dropForcedRequiredValidation,
  normalizeProtocol,
} from '../helpers/normalize-protocol.js';
import { readProtocolJson, readStageJson } from '../helpers/read-store.js';
import { assignBooleanAttribute } from '../pageobjects/editor-sections/additional-attributes.js';
import {
  openResourceBrowser,
  uploadIntoResourceBrowser,
} from '../pageobjects/editor-sections/asset-upload.js';
import {
  setConcentricCirclesBackground,
  setImageBackground,
} from '../pageobjects/editor-sections/background.js';
import { enableOtherOption } from '../pageobjects/editor-sections/categorical-other.js';
import {
  addAssetItem,
  addTextItem,
} from '../pageobjects/editor-sections/content-grid.js';
import {
  selectOrCreateEdgeType,
  selectOrCreateNodeType,
} from '../pageobjects/editor-sections/entity-types.js';
import { configureStageFilter } from '../pageobjects/editor-sections/filter.js';
import { addConfiguredFormField } from '../pageobjects/editor-sections/form-field-controls.js';
import { fillIntroductionPanel } from '../pageobjects/editor-sections/introduction-panel.js';
import {
  addNarrativePreset,
  setNarrativeBehaviours,
} from '../pageobjects/editor-sections/narrative-presets.js';
import { addExistingNetworkPanel } from '../pageobjects/editor-sections/panels.js';
import { addPrompt } from '../pageobjects/editor-sections/prompts.js';
import { createQuickAddVariable } from '../pageobjects/editor-sections/quick-add.js';
import {
  addCardDisplayProperties,
  configureSearchOptions,
  configureSortOptions,
} from '../pageobjects/editor-sections/roster-options.js';
import { configureSkipLogic } from '../pageobjects/editor-sections/skip-logic.js';
import { addSociogramPrompt } from '../pageobjects/editor-sections/sociogram-prompts.js';
import {
  createVariableViaSpotlight,
  createVariableWithOptions,
  type OptionRow,
} from '../pageobjects/editor-sections/variables.js';
import { StageEditor } from '../pageobjects/stage-editor.js';

// Build the ENTIRE canonical sample protocol
// (packages/protocols/sample/protocol.json — 30 stages, 4 node types, 2 edge
// types, 24 codebook variables, 10 assets) from scratch through the real
// Architect editors, then compare the persisted protocol structurally against
// the canonical file. This is the regression oracle for the redux-form
// migration: it exercises every editor surface the sample protocol touches
// and pins the exact JSON the current implementation writes.
//
// One serial block sharing one page: the protocol accretes stage by stage
// (later stages reference variables/edge types created by earlier ones —
// verified: zero forward references in protocol order), so tests cannot run
// independently, but per-test grouping still isolates which build step broke.
// Playwright's "Consider running tests from slow files in parallel" hint is
// intentionally wrong for this harness. Do not parallelise or shard it: every
// test consumes the IndexedDB protocol authored by the preceding tests, and
// the final test compares that complete from-scratch document.
// Long texts, option lists, and parameters are sourced from the canonical
// JSON itself rather than transcribed, so the spec cannot drift from the
// fixture it asserts against.
const CANONICAL_PATH = path.resolve(
  import.meta.dirname,
  '../../../../packages/protocols/sample/protocol.json',
);

const FIXTURES = path.resolve(
  import.meta.dirname,
  '../fixtures/files/sample-protocol',
);

const fixture = (name: string) => path.join(FIXTURES, name);

const canonicalRaw: unknown = JSON.parse(readFileSync(CANONICAL_PATH, 'utf8'));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// Walk the canonical document with runtime narrowing (no casts) — a wrong
// segment throws with the offending path instead of yielding undefined.
function at(...segments: (string | number)[]): unknown {
  let current: unknown = canonicalRaw;
  for (const segment of segments) {
    if (typeof segment === 'number') {
      if (!Array.isArray(current) || current[segment] === undefined) {
        throw new Error(`canonical path missing at ${segments.join('.')}`);
      }
      current = current[segment];
    } else {
      if (!isRecord(current) || !(segment in current)) {
        throw new Error(`canonical path missing at ${segments.join('.')}`);
      }
      current = current[segment];
    }
  }
  return current;
}

function s(...segments: (string | number)[]): string {
  const value = at(...segments);
  if (typeof value !== 'string') {
    throw new Error(`canonical value at ${segments.join('.')} is not a string`);
  }
  return value;
}

// Canonical codebook option lists as raw Options-editor rows. Numeric values
// become the strings the Value input receives; parseOptionValue coerces them
// back to numbers on write, so the round trip preserves 5 / -1 exactly.
function optionRows(...segments: (string | number)[]): OptionRow[] {
  const value = at(...segments);
  if (!Array.isArray(value)) {
    throw new Error(`canonical value at ${segments.join('.')} is not an array`);
  }
  return value.map((option, index) => {
    if (
      !isRecord(option) ||
      typeof option.label !== 'string' ||
      (typeof option.value !== 'string' && typeof option.value !== 'number')
    ) {
      throw new Error(
        `canonical option at ${segments.join('.')}[${index}] has an unexpected shape`,
      );
    }
    return { label: option.label.trim(), value: String(option.value) };
  });
}

// Canonical uuids used only to LOOK UP fixture content (option lists,
// parameters, labels) — never typed into the app.
const EGO = ['codebook', 'ego', 'variables'] as const;
const PERSON = '3d5c30be-e733-490e-868d-fcc0dc3d5a4d';
const CLINIC = '14a93cae-06c6-4d40-9c19-66c9ac434d34';
const UNIVERSITY = 'a634a5e3-cce6-46a3-ae18-4c0cf5dbbb32';
const V_CONSENT = '09306238-68e4-498c-8c12-923eb2eec760';
const V_LANGUAGES = '92326a8e-f5a1-4918-8717-a4d6917a9264';
const V_EXISTING_SOFTWARE = 'aa418971-ce17-4f0f-8060-438197298a82';
const V_RESEARCH_SUPPORT = 'd2ac00d6-337a-4ce4-87de-028eccd81617';
const V_OPERATION_PAIN = '3609188b-dfbe-482a-995c-d71387e22054';
const V_PREFERRED_CONTACT = '835ea5b5-1fbf-472d-ad3a-df74ec1d6870';
const V_COMM_FREQ = '6637c4a8-c383-4a54-bfd8-7f093a1cb4e1';
const V_GROUP = '132ad372-2ef2-4eec-820e-9eae91829e53';
const V_SNR_RELATIONSHIP = '52138688-e1e9-418b-9c33-ec9f3def499b';
const V_LAST_VISIT = '1d1460f2-8c11-4f66-8647-83801116aebf';
const V_OVERALL_REVIEW = 'd91ca102-954d-4da1-b8b8-d9490c7bca44';
const V_VISITED = '95c5bb4d-5ac2-4ddd-8dd9-fca518f15748';

test.describe.serial('sample protocol built from scratch', () => {
  // Each build test drives between one and nine editor dialogs, several of
  // them carrying rich-text fields, so these run long by construction: the
  // heaviest (the nine-field ego form) takes ~60s on an idle machine. The
  // suite's 60s default left no room for a loaded CI runner — measured
  // there: tests that take 30s standalone take 60s under parallel load, and
  // two of them timed out on the first pass. 120s keeps a 4x margin over
  // observed worst cases without masking a genuine hang.
  test.describe.configure({ retries: 1, timeout: 120_000 });

  // Undefined until `beforeAll` assigns them, which is what `afterAll` has to
  // tolerate: if setup throws before the assignment, an unguarded teardown
  // raises a TypeError that replaces the real failure in the report.
  let context: BrowserContext | undefined;
  let page: Page;
  let editor: StageEditor;

  test.beforeAll(async ({ browser }) => {
    // One page for the whole block: its own context gets a fresh IndexedDB.
    // `browser.newContext` does not inherit the config's `use` options, so
    // the relevant ones are re-applied from the project definition.
    const { baseURL, serviceWorkers, viewport, contextOptions } =
      test.info().project.use;
    context = await browser.newContext({
      baseURL,
      serviceWorkers,
      viewport,
      ...contextOptions,
    });
    page = await context.newPage();
    editor = new StageEditor(page);
    // `experiments: {}` is seeded because it is UNWRITABLE through the
    // running editor (ExperimentsPage can only ever write an
    // `encryptedVariables` boolean; only the v7→v8 migration emits `{}`).
    // Every activeProtocol reducer spreads state, so the seeded key
    // survives all subsequent edits. The name is seeded (the seed fixture
    // requires one); the description is authored through the UI in the
    // first test.
    await seedProtocol(page, {
      ...emptyProtocol(),
      name: s('name'),
      experiments: {},
    });
    await gotoProtocol(page);
  });

  test.afterAll(async () => {
    await context?.close();
  });

  async function saveStage(
    index: number,
    expectedType: CurrentProtocol['stages'][number]['type'],
  ) {
    await editor.expectNoIssues();
    await editor.save();
    const stage = await readStageJson(page, index);
    expect(stage.type).toBe(expectedType);
    return stage;
  }

  test('01 sets the description and builds the welcome information stages', async () => {
    // Protocol description: ProtocolInfoCard commits on blur; the accepted
    // commit lands in IndexedDB asynchronously behind validation.
    const description = page.getByRole('textbox', {
      name: 'Protocol description',
    });
    await description.fill(s('description'));
    await description.blur();
    await readProtocolJson(
      page,
      (protocol) => protocol.description === s('description'),
    );

    // Stage 0 — Welcome (Information): two text items + the png at SMALL,
    // uploading the image at first use through the item dialog's Resource
    // Browser.
    await editor.createNew('Information', 0);
    await editor.setStageName(s('stages', 0, 'label'));
    await editor
      .field('title')
      .getByRole('textbox')
      .fill(s('stages', 0, 'title'));
    await addTextItem(editor, page, s('stages', 0, 'items', 0, 'content'));
    await addTextItem(editor, page, s('stages', 0, 'items', 1, 'content'));
    await addAssetItem(editor, page, {
      kind: 'Image',
      source: { upload: fixture('NC-Type and Mark Pos@4x.png') },
      size: 'Small',
    });
    const welcome = await saveStage(0, 'Information');
    if (welcome.type !== 'Information') throw new Error('narrowed above');
    expect(welcome.items).toHaveLength(3);

    // Stage 1 — Information Interface: reuses the uploaded png.
    await editor.createNew('Information', 1);
    await editor.setStageName(s('stages', 1, 'label'));
    await editor
      .field('title')
      .getByRole('textbox')
      .fill(s('stages', 1, 'title'));
    await addTextItem(editor, page, s('stages', 1, 'items', 0, 'content'));
    await addAssetItem(editor, page, {
      kind: 'Image',
      source: { select: 'NC-Type and Mark Pos@4x.png' },
      size: 'Small',
    });
    await saveStage(1, 'Information');

    // Stage 2 — Ego Form Introduction.
    await editor.createNew('Information', 2);
    await editor.setStageName(s('stages', 2, 'label'));
    await editor
      .field('title')
      .getByRole('textbox')
      .fill(s('stages', 2, 'title'));
    await addTextItem(editor, page, s('stages', 2, 'items', 0, 'content'));
    await saveStage(2, 'Information');
  });

  test('02 builds the consent form (EgoForm + BooleanChoice)', async () => {
    await editor.createNew('EgoForm', 3);
    await editor.setStageName(s('stages', 3, 'label'));
    await fillIntroductionPanel(
      editor,
      s('stages', 3, 'introductionPanel', 'title'),
      s('stages', 3, 'introductionPanel', 'text'),
    );
    await addConfiguredFormField(editor.section('Form'), {
      variableName: 'participant_consent',
      promptText: s('stages', 3, 'form', 'fields', 0, 'prompt').trim(),
      inputControl: 'BooleanChoice',
      booleanOptions: {
        // Canonical: both options carry explicit `negative` booleans.
        positive: {
          label: s(...EGO, V_CONSENT, 'options', 0, 'label').trim(),
          negative: false,
        },
        negative: {
          label: s(...EGO, V_CONSENT, 'options', 1, 'label').trim(),
          negative: true,
        },
      },
      required: true,
    });
    const stage = await saveStage(3, 'EgoForm');
    if (stage.type !== 'EgoForm') throw new Error('narrowed above');
    expect(stage.form.fields).toHaveLength(1);
  });

  test('03 builds the nine-field ego form with skip logic', async () => {
    // Nine dialog round-trips plus the skip-logic rule dialog.
    test.slow();
    await editor.createNew('EgoForm', 4);
    await editor.setStageName(s('stages', 4, 'label'));
    await fillIntroductionPanel(
      editor,
      s('stages', 4, 'introductionPanel', 'title'),
      s('stages', 4, 'introductionPanel', 'text'),
    );

    const form = editor.section('Form');
    const prompt = (index: number) =>
      s('stages', 4, 'form', 'fields', index, 'prompt').trim();
    await addConfiguredFormField(form, {
      variableName: 'first_name',
      promptText: prompt(0),
      inputControl: 'Text Input',
      required: true,
    });
    await addConfiguredFormField(form, {
      variableName: 'last_name',
      promptText: prompt(1),
      inputControl: 'Text Input',
      required: true,
    });
    await addConfiguredFormField(form, {
      variableName: 'dob',
      promptText: prompt(2),
      inputControl: 'DatePicker',
    });
    await addConfiguredFormField(form, {
      variableName: 'languages_spoken',
      promptText: prompt(3),
      inputControl: 'Toggle Button Group',
      options: optionRows(...EGO, V_LANGUAGES, 'options'),
    });
    await addConfiguredFormField(form, {
      variableName: 'existing_software',
      promptText: prompt(4),
      inputControl: 'Radio Group',
      options: optionRows(...EGO, V_EXISTING_SOFTWARE, 'options'),
    });
    await addConfiguredFormField(form, {
      variableName: 'research_support',
      promptText: prompt(5),
      inputControl: 'LikertScale',
      options: optionRows(...EGO, V_RESEARCH_SUPPORT, 'options'),
    });
    await addConfiguredFormField(form, {
      variableName: 'operation_pain',
      promptText: prompt(6),
      inputControl: 'VisualAnalogScale',
      scalarParameters: {
        minLabel: s(...EGO, V_OPERATION_PAIN, 'parameters', 'minLabel'),
        maxLabel: s(...EGO, V_OPERATION_PAIN, 'parameters', 'maxLabel'),
      },
    });
    await addConfiguredFormField(form, {
      variableName: 'preferred_contact_method',
      promptText: prompt(7),
      inputControl: 'Checkbox Group',
      options: optionRows(...EGO, V_PREFERRED_CONTACT, 'options'),
    });
    await addConfiguredFormField(form, {
      variableName: 'other_info',
      promptText: prompt(8),
      inputControl: 'Text Area',
    });

    await configureSkipLogic(editor, page, {
      action: 'Skip this stage',
      rules: [
        {
          kind: 'egoBooleanExactly',
          variableName: 'participant_consent',
          value: false,
        },
      ],
      destination: 'End the interview',
    });

    const stage = await saveStage(4, 'EgoForm');
    if (stage.type !== 'EgoForm') throw new Error('narrowed above');
    expect(stage.form.fields).toHaveLength(9);
    expect(stage.skipLogic?.action).toBe('SKIP');
  });

  test('04 builds the quick-add name generator (creates Person + name)', async () => {
    await editor.createNew('Information', 5);
    await editor.setStageName(s('stages', 5, 'label'));
    await editor
      .field('title')
      .getByRole('textbox')
      .fill(s('stages', 5, 'title'));
    await addTextItem(editor, page, s('stages', 5, 'items', 0, 'content'));
    await addAssetItem(editor, page, {
      kind: 'Video',
      source: { upload: fixture('01.mov') },
      size: 'Medium',
    });
    await saveStage(5, 'Information');

    await editor.createNew('NameGeneratorQuickAdd', 6);
    await editor.setStageName(s('stages', 6, 'label'));
    await selectOrCreateNodeType(page, 'Person');
    // The QuickAdd picker hard-codes required validation onto the variable
    // it creates; the canonical `name` variable has none, so clear it.
    await createQuickAddVariable(editor, page, 'name', {
      clearRequiredValidation: true,
    });
    await addPrompt(editor.field('prompts'), async () => {
      await editor.fillRichTextMarkdown(
        'Prompt text',
        s('stages', 6, 'prompts', 0, 'text'),
      );
    });
    const stage = await saveStage(6, 'NameGeneratorQuickAdd');
    if (stage.type !== 'NameGeneratorQuickAdd') throw new Error('narrowed');
    expect(stage.quickAdd).not.toBe('');
  });

  test('05 builds quick-add with side panel and additional attributes', async () => {
    await editor.createNew('Information', 7);
    await editor.setStageName(s('stages', 7, 'label'));
    await editor
      .field('title')
      .getByRole('textbox')
      .fill(s('stages', 7, 'title'));
    await addTextItem(editor, page, s('stages', 7, 'items', 0, 'content'));
    await addAssetItem(editor, page, {
      kind: 'Video',
      source: { upload: fixture('02.mov') },
      size: 'Medium',
    });
    await saveStage(7, 'Information');

    await editor.createNew('NameGeneratorQuickAdd', 8);
    await editor.setStageName(s('stages', 8, 'label'));
    await selectOrCreateNodeType(page, 'Person');
    // Selecting the EXISTING `name` variable (exact match → Enter-select in
    // the spotlight) — no creation, so no validation to clear.
    await createQuickAddVariable(editor, page, 'name');
    await addExistingNetworkPanel(editor, s('stages', 8, 'panels', 0, 'title'));
    await addPrompt(editor.field('prompts'), async () => {
      await editor.fillRichTextMarkdown(
        'Prompt text',
        s('stages', 8, 'prompts', 0, 'text'),
      );
      await assignBooleanAttribute(
        editor,
        page,
        0,
        'discuss_network_research',
        true,
      );
    });
    const stage = await saveStage(8, 'NameGeneratorQuickAdd');
    if (stage.type !== 'NameGeneratorQuickAdd') throw new Error('narrowed');
    expect(stage.panels).toHaveLength(1);
  });

  test('06 builds the clinic name generator with form fields', async () => {
    await editor.createNew('Information', 9);
    await editor.setStageName(s('stages', 9, 'label'));
    await editor
      .field('title')
      .getByRole('textbox')
      .fill(s('stages', 9, 'title'));
    await addTextItem(editor, page, s('stages', 9, 'items', 0, 'content'));
    await addAssetItem(editor, page, {
      kind: 'Video',
      source: { upload: fixture('03.mov') },
      size: 'Medium',
    });
    await saveStage(9, 'Information');

    await editor.createNew('NameGenerator', 10);
    await editor.setStageName(s('stages', 10, 'label'));
    // Canonical Clinic uses the add-a-place icon (creation default is
    // add-a-person).
    await selectOrCreateNodeType(page, 'Clinic', { icon: 'add-a-place' });
    await editor
      .field('form.title')
      .getByRole('textbox')
      .fill(s('stages', 10, 'form', 'title'));
    const form = editor.section('Form');
    await addConfiguredFormField(form, {
      variableName: 'name',
      promptText: s('stages', 10, 'form', 'fields', 0, 'prompt').trim(),
      inputControl: 'Text Input',
      required: true,
    });
    await addConfiguredFormField(form, {
      variableName: 'last_visit',
      promptText: s('stages', 10, 'form', 'fields', 1, 'prompt').trim(),
      inputControl: 'DatePicker',
      dateMin: s(
        'codebook',
        'node',
        CLINIC,
        'variables',
        V_LAST_VISIT,
        'parameters',
        'min',
      ),
    });
    await addConfiguredFormField(form, {
      variableName: 'visit_purpose',
      promptText: s('stages', 10, 'form', 'fields', 2, 'prompt').trim(),
      inputControl: 'Text Area',
    });
    await addPrompt(editor.field('prompts'), async () => {
      await editor.fillRichTextMarkdown(
        'Prompt text',
        s('stages', 10, 'prompts', 0, 'text'),
      );
    });
    const stage = await saveStage(10, 'NameGenerator');
    if (stage.type !== 'NameGenerator') throw new Error('narrowed');
    expect(stage.form.fields).toHaveLength(3);
  });

  test('07 builds the small classroom roster stage', async () => {
    await editor.createNew('Information', 11);
    await editor.setStageName(s('stages', 11, 'label'));
    await editor
      .field('title')
      .getByRole('textbox')
      .fill(s('stages', 11, 'title'));
    await addTextItem(editor, page, s('stages', 11, 'items', 0, 'content'));
    await saveStage(11, 'Information');

    await editor.createNew('NameGeneratorRoster', 12);
    await editor.setStageName(s('stages', 12, 'label'));
    await selectOrCreateNodeType(page, 'Classmate');
    // Data source: upload the trimmed roster CSV at first use. Configure
    // card/sort options only AFTER the data source (changing it resets all
    // three option areas).
    await openResourceBrowser(editor.field('dataSource'));
    await uploadIntoResourceBrowser(page, fixture('class roster.csv'));
    await addCardDisplayProperties(editor, [
      { variable: 'first_name', label: 'First Name' },
      { variable: 'last_name', label: 'Last Name' },
    ]);
    await configureSortOptions(editor, {
      sortOrder: { property: 'first_name', direction: 'asc' },
      sortableProperties: [
        { variable: 'first_name', label: 'First Name' },
        { variable: 'last_name', label: 'Last Name' },
      ],
    });
    await addPrompt(editor.field('prompts'), async () => {
      await editor.fillRichTextMarkdown(
        'Prompt text',
        s('stages', 12, 'prompts', 0, 'text'),
      );
    });
    const stage = await saveStage(12, 'NameGeneratorRoster');
    if (stage.type !== 'NameGeneratorRoster') throw new Error('narrowed');
    expect(typeof stage.dataSource).toBe('string');
  });

  test('08 builds the university roster and per-alter form', async () => {
    await editor.createNew('NameGeneratorRoster', 13);
    await editor.setStageName(s('stages', 13, 'label'));
    await selectOrCreateNodeType(page, 'University', { icon: 'add-a-place' });
    await openResourceBrowser(editor.field('dataSource'));
    await uploadIntoResourceBrowser(page, fixture('world-universities.csv'));
    await addCardDisplayProperties(editor, [
      { variable: 'website', label: 'Website' },
      { variable: 'country', label: 'Country Code' },
    ]);
    await configureSearchOptions(editor, page, {
      matchProperties: ['website', 'country', 'name'],
      accuracy: 'High accuracy',
    });
    await addPrompt(editor.field('prompts'), async () => {
      await editor.fillRichTextMarkdown(
        'Prompt text',
        s('stages', 13, 'prompts', 0, 'text'),
      );
    });
    await saveStage(13, 'NameGeneratorRoster');

    await editor.createNew('AlterForm', 14);
    await editor.setStageName(s('stages', 14, 'label'));
    await selectOrCreateNodeType(page, 'University');
    await fillIntroductionPanel(
      editor,
      s('stages', 14, 'introductionPanel', 'title'),
      s('stages', 14, 'introductionPanel', 'text'),
    );
    const form = editor.section('Form');
    await addConfiguredFormField(form, {
      variableName: 'visited',
      promptText: s('stages', 14, 'form', 'fields', 0, 'prompt').trim(),
      inputControl: 'BooleanChoice',
      booleanOptions: {
        // Canonical: option one has NO negative key; option two carries an
        // explicit `negative: false`.
        positive: {
          label: s(
            'codebook',
            'node',
            UNIVERSITY,
            'variables',
            V_VISITED,
            'options',
            0,
            'label',
          ).trim(),
          negative: 'omit',
        },
        negative: {
          label: s(
            'codebook',
            'node',
            UNIVERSITY,
            'variables',
            V_VISITED,
            'options',
            1,
            'label',
          ).trim(),
          negative: false,
        },
      },
    });
    await addConfiguredFormField(form, {
      variableName: 'overall_review',
      promptText: s('stages', 14, 'form', 'fields', 1, 'prompt').trim(),
      inputControl: 'LikertScale',
      options: optionRows(
        'codebook',
        'node',
        UNIVERSITY,
        'variables',
        V_OVERALL_REVIEW,
        'options',
      ),
    });
    const stage = await saveStage(14, 'AlterForm');
    if (stage.type !== 'AlterForm') throw new Error('narrowed');
    expect(stage.form.fields).toHaveLength(2);
  });

  test('09 builds the person sociograms (layout variables + svg background)', async () => {
    await editor.createNew('Information', 15);
    await editor.setStageName(s('stages', 15, 'label'));
    await editor
      .field('title')
      .getByRole('textbox')
      .fill(s('stages', 15, 'title'));
    await addTextItem(editor, page, s('stages', 15, 'items', 0, 'content'));
    await addAssetItem(editor, page, {
      kind: 'Video',
      source: { upload: fixture('05.mov') },
      size: 'Medium',
    });
    await saveStage(15, 'Information');

    await editor.createNew('Sociogram', 16);
    await editor.setStageName(s('stages', 16, 'label'));
    await selectOrCreateNodeType(page, 'Person');
    await setConcentricCirclesBackground(editor, { circles: 3, skewed: true });
    await addSociogramPrompt(editor, page, {
      text: s('stages', 16, 'prompts', 0, 'text'),
      layoutVariable: 'sociogram_layout',
      // Canonical carries `highlight: { allowHighlighting: false }`, which
      // only the Interaction Behavior on-then-off dance writes.
      interaction: { kind: 'none-explicit' },
    });
    await saveStage(16, 'Sociogram');

    await editor.createNew('Sociogram', 17);
    await editor.setStageName(s('stages', 17, 'label'));
    await selectOrCreateNodeType(page, 'Person');
    await setImageBackground(editor, page, {
      upload: fixture('responsive-political-compass.svg'),
    });
    await addSociogramPrompt(editor, page, {
      text: s('stages', 17, 'prompts', 0, 'text'),
      layoutVariable: 'box_layout',
      interaction: { kind: 'none-explicit' },
    });
    const stage = await saveStage(17, 'Sociogram');
    if (stage.type !== 'Sociogram') throw new Error('narrowed');
    expect(stage.background && 'image' in stage.background).toBe(true);
  });

  test('10 builds the edge-creation sociogram (creates know + conflict)', async () => {
    await editor.createNew('Information', 18);
    await editor.setStageName(s('stages', 18, 'label'));
    await editor
      .field('title')
      .getByRole('textbox')
      .fill(s('stages', 18, 'title'));
    await addTextItem(editor, page, s('stages', 18, 'items', 0, 'content'));
    await addAssetItem(editor, page, {
      kind: 'Video',
      source: { upload: fixture('06.mov') },
      size: 'Medium',
    });
    await saveStage(18, 'Information');

    await editor.createNew('Sociogram', 19);
    await editor.setStageName(s('stages', 19, 'label'));
    await selectOrCreateNodeType(page, 'Person');
    await setConcentricCirclesBackground(editor, { circles: 3, skewed: true });
    await addSociogramPrompt(editor, page, {
      text: s('stages', 19, 'prompts', 0, 'text'),
      layoutVariable: 'sociogram_layout',
      interaction: {
        kind: 'createEdge',
        edgeName: 'know',
        createNewEdgeType: true,
      },
    });
    await addSociogramPrompt(editor, page, {
      text: s('stages', 19, 'prompts', 1, 'text'),
      layoutVariable: 'sociogram_layout',
      interaction: {
        kind: 'createEdge',
        edgeName: 'conflict',
        createNewEdgeType: true,
      },
    });
    const stage = await saveStage(19, 'Sociogram');
    if (stage.type !== 'Sociogram') throw new Error('narrowed');
    expect(stage.prompts).toHaveLength(2);
  });

  test('11 builds the dyad census pair with complementary skip logic', async () => {
    await editor.createNew('DyadCensus', 20);
    await editor.setStageName(s('stages', 20, 'label'));
    await selectOrCreateNodeType(page, 'Classmate');
    await fillIntroductionPanel(
      editor,
      s('stages', 20, 'introductionPanel', 'title'),
      s('stages', 20, 'introductionPanel', 'text'),
    );
    await addPrompt(editor.field('prompts'), async () => {
      // DyadCensus's prompt label is 'Prompt Text' (capital T) — a distinct
      // component from the shared PromptText.
      await editor.fillRichTextMarkdown(
        'Prompt Text',
        s('stages', 20, 'prompts', 0, 'text'),
      );
      await selectOrCreateEdgeType(page, 'know');
    });
    await configureSkipLogic(editor, page, {
      action: 'Skip this stage',
      rules: [
        {
          kind: 'alterPresence',
          nodeTypeName: 'Classmate',
          operator: 'does not exist',
        },
      ],
    });
    const census = await saveStage(20, 'DyadCensus');
    if (census.type !== 'DyadCensus') throw new Error('narrowed');
    expect(census.skipLogic?.destination).toBeUndefined();

    await editor.createNew('Information', 21);
    await editor.setStageName(s('stages', 21, 'label'));
    await editor
      .field('title')
      .getByRole('textbox')
      .fill(s('stages', 21, 'title'));
    await addTextItem(editor, page, s('stages', 21, 'items', 0, 'content'));
    await configureSkipLogic(editor, page, {
      action: 'Skip this stage',
      rules: [
        {
          kind: 'alterPresence',
          nodeTypeName: 'Classmate',
          operator: 'exists',
        },
      ],
    });
    await saveStage(21, 'Information');
  });

  test('12 builds the attribute-nomination sociogram', async () => {
    await editor.createNew('Information', 22);
    await editor.setStageName(s('stages', 22, 'label'));
    await editor
      .field('title')
      .getByRole('textbox')
      .fill(s('stages', 22, 'title'));
    await addTextItem(editor, page, s('stages', 22, 'items', 0, 'content'));
    await addAssetItem(editor, page, {
      kind: 'Video',
      source: { upload: fixture('07.mov') },
      size: 'Medium',
    });
    await saveStage(22, 'Information');

    await editor.createNew('Sociogram', 23);
    await editor.setStageName(s('stages', 23, 'label'));
    await selectOrCreateNodeType(page, 'Person');
    await setConcentricCirclesBackground(editor, { circles: 3, skewed: true });
    await addSociogramPrompt(editor, page, {
      text: s('stages', 23, 'prompts', 0, 'text'),
      layoutVariable: 'sociogram_layout',
      interaction: { kind: 'highlight', variableName: 'provides_advice' },
      displayEdges: ['know', 'conflict'],
    });
    await addSociogramPrompt(editor, page, {
      text: s('stages', 23, 'prompts', 1, 'text'),
      layoutVariable: 'sociogram_layout',
      interaction: {
        kind: 'highlight',
        variableName: 'provides_material_support',
      },
      displayEdges: ['know', 'conflict'],
    });
    const stage = await saveStage(23, 'Sociogram');
    if (stage.type !== 'Sociogram') throw new Error('narrowed');
    expect(stage.prompts).toHaveLength(2);
  });

  test('13 builds the ordinal bin (communication_freq)', async () => {
    await editor.createNew('OrdinalBin', 24);
    await editor.setStageName(s('stages', 24, 'label'));
    await selectOrCreateNodeType(page, 'Person');
    await addPrompt(editor.field('prompts'), async () => {
      await editor.fillRichTextMarkdown(
        'Prompt text',
        s('stages', 24, 'prompts', 0, 'text'),
      );
      await createVariableViaSpotlight(page, {
        variableName: 'communication_freq',
        // The locked-type picker opens NewVariableWindow on create — the
        // required outcome for the helper's swallowed-click retry.
        until: page.getByRole('textbox', { name: 'Attribute name' }),
      });
      await createVariableWithOptions(page, {
        variableName: 'communication_freq',
        options: optionRows(
          'codebook',
          'node',
          PERSON,
          'variables',
          V_COMM_FREQ,
          'options',
        ),
        type: 'ordinal',
      });
    });
    const stage = await saveStage(24, 'OrdinalBin');
    if (stage.type !== 'OrdinalBin') throw new Error('narrowed');
    expect(stage.prompts[0]?.color).toBe('ord-color-seq-1');
  });

  test('14 builds the categorical bin with an other-variable', async () => {
    await editor.createNew('CategoricalBin', 25);
    await editor.setStageName(s('stages', 25, 'label'));
    await selectOrCreateNodeType(page, 'Person');
    await addPrompt(editor.field('prompts'), async () => {
      await editor.fillRichTextMarkdown(
        'Prompt text',
        s('stages', 25, 'prompts', 0, 'text'),
      );
      await createVariableViaSpotlight(page, {
        variableName: 'group',
        // The locked-type picker opens NewVariableWindow on create — the
        // required outcome for the helper's swallowed-click retry.
        until: page.getByRole('textbox', { name: 'Attribute name' }),
      });
      await createVariableWithOptions(page, {
        variableName: 'group',
        options: optionRows(
          'codebook',
          'node',
          PERSON,
          'variables',
          V_GROUP,
          'options',
        ),
        type: 'categorical',
      });
      await enableOtherOption(editor, page, {
        variableName: 'group_other',
        optionLabel: s('stages', 25, 'prompts', 0, 'otherOptionLabel'),
        variablePrompt: s('stages', 25, 'prompts', 0, 'otherVariablePrompt'),
      });
    });
    const stage = await saveStage(25, 'CategoricalBin');
    if (stage.type !== 'CategoricalBin') throw new Error('narrowed');
    expect(stage.prompts[0]?.otherVariable).toBeDefined();
  });

  test('15 builds the filtered relationship-type bin (SHOW + AND skip logic)', async () => {
    await editor.createNew('Information', 26);
    await editor.setStageName(s('stages', 26, 'label'));
    await editor
      .field('title')
      .getByRole('textbox')
      .fill(s('stages', 26, 'title'));
    await addTextItem(editor, page, s('stages', 26, 'items', 0, 'content'));
    await addTextItem(editor, page, s('stages', 26, 'items', 1, 'content'));
    await addAssetItem(editor, page, {
      kind: 'Image',
      source: { select: 'NC-Type and Mark Pos@4x.png' },
      size: 'Small',
    });
    await saveStage(26, 'Information');

    await editor.createNew('CategoricalBin', 27);
    await editor.setStageName(s('stages', 27, 'label'));
    await selectOrCreateNodeType(page, 'Person');
    await addPrompt(editor.field('prompts'), async () => {
      await editor.fillRichTextMarkdown(
        'Prompt text',
        s('stages', 27, 'prompts', 0, 'text'),
      );
      await createVariableViaSpotlight(page, {
        variableName: 'social_networks_research_relationship',
        // The locked-type picker opens NewVariableWindow on create — the
        // required outcome for the helper's swallowed-click retry.
        until: page.getByRole('textbox', { name: 'Attribute name' }),
      });
      await createVariableWithOptions(page, {
        variableName: 'social_networks_research_relationship',
        options: optionRows(
          'codebook',
          'node',
          PERSON,
          'variables',
          V_SNR_RELATIONSHIP,
          'options',
        ),
        type: 'categorical',
      });
      await enableOtherOption(editor, page, {
        variableName: 'social_network_research_relationship_other',
        optionLabel: s('stages', 27, 'prompts', 0, 'otherOptionLabel'),
        variablePrompt: s('stages', 27, 'prompts', 0, 'otherVariablePrompt'),
      });
    });
    await configureStageFilter(editor, {
      rules: [
        {
          kind: 'alterBooleanAttribute',
          nodeTypeName: 'Person',
          variableName: 'discuss_network_research',
          value: true,
        },
      ],
    });
    await configureSkipLogic(editor, page, {
      action: 'Show this stage',
      rules: [
        { kind: 'alterPresence', nodeTypeName: 'Person', operator: 'exists' },
        {
          kind: 'alterBooleanAttribute',
          nodeTypeName: 'Person',
          variableName: 'discuss_network_research',
          value: true,
        },
      ],
      join: 'All rules',
    });
    const stage = await saveStage(27, 'CategoricalBin');
    if (stage.type !== 'CategoricalBin') throw new Error('narrowed');
    expect(stage.skipLogic?.filter.join).toBe('AND');
    expect(stage.filter?.rules).toHaveLength(1);
  });

  test('16 builds the narrative stage (preset + behaviours)', async () => {
    await editor.createNew('Information', 28);
    await editor.setStageName(s('stages', 28, 'label'));
    await editor
      .field('title')
      .getByRole('textbox')
      .fill(s('stages', 28, 'title'));
    await addTextItem(editor, page, s('stages', 28, 'items', 0, 'content'));
    await saveStage(28, 'Information');

    await editor.createNew('Narrative', 29);
    await editor.setStageName(s('stages', 29, 'label'));
    await selectOrCreateNodeType(page, 'Person');
    await setConcentricCirclesBackground(editor, { circles: 1 });
    await addNarrativePreset(editor, page, {
      label: s('stages', 29, 'presets', 0, 'label'),
      layoutVariable: 'sociogram_layout',
      groupVariable: 'group',
      displayEdges: ['know', 'conflict'],
      highlight: ['provides_advice', 'provides_material_support'],
    });
    await setNarrativeBehaviours(editor, {
      freeDraw: true,
      automaticLayout: false,
    });
    const stage = await saveStage(29, 'Narrative');
    if (stage.type !== 'Narrative') throw new Error('narrowed');
    expect(stage.presets).toHaveLength(1);
  });

  test('17 the persisted protocol matches the canonical sample protocol', async () => {
    test.setTimeout(30_000);
    const built = await readProtocolJson(
      page,
      (protocol) => protocol.stages.length === 30,
    );

    // The built protocol must be schema-valid in its own right — the
    // structural comparison below normalizes ids and a small set of
    // source-verified representation differences, so validity is asserted
    // separately on the raw document.
    const validation = await validateProtocol(built);
    expect(validation.error?.message ?? '').toBe('');
    expect(validation.success).toBe(true);

    // The comparison below deletes a handful of fields from BOTH documents to
    // forgive 2022-era authoring artifacts, which would otherwise make it
    // blind to those fields entirely. Assert them against the built protocol
    // on its own terms first, so a migration that (say) stopped minting
    // form-field ids or assigned every entity the same colour still fails —
    // schema validation would not catch either.
    assertBuiltProtocolInvariants(built);

    const normalizedBuilt = normalizeProtocol(built);
    const normalizedCanonical = normalizeProtocol(canonicalRaw);
    expect(
      dropForcedRequiredValidation(normalizedBuilt, normalizedCanonical),
    ).toEqual(normalizedCanonical);
  });
});
