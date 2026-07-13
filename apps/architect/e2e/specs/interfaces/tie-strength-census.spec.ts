import type { CurrentProtocol } from '@codaco/protocol-validation';

import { expect, gotoProtocol, test } from '../../fixtures/architect-test.js';
import { emptyProtocol } from '../../fixtures/seed.js';
import { stageSnapshotJson } from '../../helpers/normalize-stage.js';
import { readStageJson } from '../../helpers/read-store.js';
import { selectOrCreateNodeType } from '../../pageobjects/editor-sections/entity-types.js';
import { addPrompt } from '../../pageobjects/editor-sections/prompts.js';
import {
  createVariableViaSpotlight,
  createVariableWithOptions,
} from '../../pageobjects/editor-sections/variables.js';
import { StageEditor } from '../../pageobjects/stage-editor.js';

// KNOWN APP BUG, worked around below (see the long comment on the
// `addPrompt` call for the full trace) — TieStrengthCensusPrompts/
// PromptFields.tsx's `createEdge` NativeSelect wires `onCreateOption:
// (option) => { handleChangeCreateEdge(handleCreateEdge(option)); }`.
// `handleCreateEdge` (withCreateEdgeHandler.tsx) is `async`, so calling it
// returns a *pending Promise*, not the created edge type's id — and nothing
// awaits it, so `handleChangeCreateEdge` stores that raw Promise object into
// the `createEdge` redux-form field. That value later flows into
// `createVariableAsync`/`updateVariableAsync` as an edge-type key, where it
// gets string-coerced to the literal `"[object Promise]"` and written into
// `codebook.edge` — corrupting the protocol (fails the record-key regex,
// `/^[a-zA-Z0-9._:-]+$/`, and pops the "Misconfigured Protocol" recovery
// dialog with no clean way back). This reproduced deterministically every
// time (not a timing flake — a Promise is always synchronously truthy, so
// the corrupted value gets committed on every "Create" click), and traces
// back to the original architect-classic port (`git log -p --follow`), not
// anything on this branch.
//
// A live "pre-create the edge type through a working flow, then select it"
// workaround (creating it via the standalone Codebook page's correctly-
// awaited `EntityTypeDialog`, e.g.) was tried first, but that ALSO doesn't
// survive to the TieStrengthCensus stage: `seed.ts`'s `page.addInitScript`
// re-runs on *every* subsequent navigation (Playwright re-executes it before
// each new document load, not just the first), re-stamping
// `sessionStorage`'s `@@remember-*` keys back to the ORIGINAL seeded
// snapshot — so any live edit made through a page reached via a hard
// `page.goto` (both the Codebook page and `editor.createNew`'s own
// navigation) is silently discarded the next time either of those fires.
// That's a property of this test harness's seeding contract, not an app bug.
// The edge type is seeded directly into the protocol's `codebook` below
// instead — a legitimate starting state (an author's protocol can easily
// already have an edge type defined before adding a TieStrengthCensus
// stage) that sidesteps both issues at once: the census interface's own
// `createEdge` select only ever needs to SELECT that already-existing option
// (`selectOption`), never its own broken "_create" inline path.
function protocolWithCloseEdgeType(): CurrentProtocol {
  return {
    ...emptyProtocol(),
    codebook: {
      edge: {
        // uuid-shaped so `normalize-stage.ts`'s `UUID_RE` placeholder-maps it
        // the same way a live-created type's id would be.
        '11111111-1111-4111-8111-111111111111': {
          name: 'close',
          color: 'edge-color-seq-1',
        },
      },
    },
  };
}

type TieStrengthPrompt = {
  id: string;
  text: string;
  createEdge: string;
  edgeVariable: string;
  negativeLabel: string;
};

// Narrow one element of the saved `prompts` array with a real runtime guard
// (mirroring `toStage` in timeline.spec.ts) rather than an `as` cast: the
// schema (`tieStrengthCensusPromptSchema`, a `z.strictObject`) rejects any
// extra key, including the `variableOptions` the editor's `withVariableOptions`
// enhancer syncs onto the *draft* form — `withPromptChangeHandler.tsx`'s
// `onBeforeSave` strips it back out before the array item is committed, so
// asserting this exact key set is a real check that the strip actually
// happened, not just that the stage saved successfully.
function toTieStrengthPrompt(value: unknown): TieStrengthPrompt {
  if (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'text' in value &&
    typeof value.text === 'string' &&
    'createEdge' in value &&
    typeof value.createEdge === 'string' &&
    'edgeVariable' in value &&
    typeof value.edgeVariable === 'string' &&
    'negativeLabel' in value &&
    typeof value.negativeLabel === 'string' &&
    Object.keys(value).length === 5
  ) {
    return {
      id: value.id,
      text: value.text,
      createEdge: value.createEdge,
      edgeVariable: value.edgeVariable,
      negativeLabel: value.negativeLabel,
    };
  }
  throw new Error(
    `saved TieStrengthCensus prompt has an unexpected shape: ${JSON.stringify(value)}`,
  );
}

test('creates a valid TieStrengthCensus stage from scratch', async ({
  architectPage,
  seed,
}) => {
  await seed(protocolWithCloseEdgeType());
  await gotoProtocol(architectPage);

  const editor = new StageEditor(architectPage);
  await editor.createNew('TieStrengthCensus');
  await editor.setStageName('How Strong Is This Tie?');

  // Same `FilteredNodeType` subject + shared `IntroductionPanel.tsx` as
  // DyadCensus (StageEditor/Interfaces.tsx registers
  // `[FilteredNodeType, IntroductionPanel, TieStrengthCensusPrompts, ...]`).
  await selectOrCreateNodeType(architectPage, 'person');
  await editor
    .field('introductionPanel.title')
    .getByRole('textbox')
    .fill('How Strong Is This Tie?');
  await editor.fillRichText(
    'Introduction text',
    'We would like to ask you how close you are with the people you know.',
  );

  // TieStrengthCensusPrompts.tsx's PromptFields.tsx is the heaviest prompt
  // editor in the census family, and diverges from DyadCensus/
  // OneToManyDyadCensus in two ways:
  //
  // - `createEdge` is a `NativeSelect` (Form/Fields/NativeSelect.tsx, wrapping
  //   fresco-ui's real `<select>`) — NOT an `EntitySelectField` pill picker.
  //   Its reserved `value="_create"` option (label `createLabelText`, "✨
  //   Create new edge type ✨" — PromptFields.tsx's `componentProps`) is
  //   real and does work UI-wise (swaps the `<select>` for an inline "New
  //   edge type name" `InputField` + "Create" button, `onCreateNew` isn't
  //   wired so NativeSelect's own `showCreateOptionForm` state handles it) —
  //   but actually clicking that "Create" button hits the app bug documented
  //   above, so this test selects the pre-created "close" type instead
  //   (`selectOption`) and never exercises "_create" here.
  // - `edgeVariable` is a `VariablePicker` (same "Select variable" button +
  //   VariableSpotlight `createVariableViaSpotlight` already drives), but its
  //   `onCreateOption` is wired to `handleNewVariable`, which opens
  //   `NewVariableWindow` with `initialValues: { name, type: 'ordinal' }` —
  //   i.e. this IS the "locked-type" NewVariableWindow flow
  //   `createVariableWithOptions`'s own doc comment calls out. Both
  //   variables.ts helpers are needed together here:
  //   `createVariableViaSpotlight` opens the spotlight and clicks "Create new
  //   variable called…" (which is what actually opens NewVariableWindow,
  //   pre-filled with that name and its "Variable type" combobox already
  //   disabled/set to "Ordinal" via `initialValues.type`), then
  //   `createVariableWithOptions` fills in and submits that already-open
  //   dialog. Confirmed live: `NewVariableWindow.tsx`'s "Variable type"
  //   combobox is disabled here (`disabled: !!initialValues?.type`), so
  //   `createVariableWithOptions`'s existing `isEnabled()` branch already
  //   does the right thing without modification — the helper needed no fix
  //   for this call site.
  //
  // After `edgeVariable` is set, a "Variable Options" `<Options
  // name="variableOptions" .../>` section appears — but it's just a *draft
  // mirror* of the variable's own options (`withVariableOptions.tsx`'s
  // `updateFormVariableOptions` lifecycle copies them in whenever
  // `edgeVariable` changes) that the author *could* edit further here.
  // `withPromptChangeHandler.tsx`'s `onBeforeSave` strips `variableOptions`
  // back out of the saved prompt (it already persisted the options onto the
  // variable itself via `updateVariableAsync`), so this test deliberately
  // leaves that mirror section untouched and asserts its absence below via
  // `toTieStrengthPrompt`.
  await addPrompt(editor.section('Prompts'), async () => {
    await editor.fillRichText('Prompt Text', 'How close are you?');

    await architectPage
      .getByLabel('Select an edge type')
      .selectOption({ label: 'close' });

    await createVariableViaSpotlight(architectPage, {
      variableName: 'strength',
    });
    await createVariableWithOptions(architectPage, {
      variableName: 'strength',
      options: ['Low', 'High'],
      type: 'ordinal',
    });

    await editor.fillRichText(
      'Label for the decline option',
      'We are not close',
    );
  });

  await editor.expectNoIssues();
  await editor.save();

  const stage = await readStageJson(architectPage, 0);
  expect(stage.type).toBe('TieStrengthCensus');

  const { prompts } = stage;
  if (!Array.isArray(prompts) || prompts.length !== 1) {
    throw new Error('expected exactly one saved TieStrengthCensus prompt');
  }
  const prompt = toTieStrengthPrompt(prompts[0]);
  expect(prompt.text).toContain('How close are you?');
  expect(prompt.negativeLabel).toContain('We are not close');

  expect(stageSnapshotJson(stage)).toMatchSnapshot(
    'tie-strength-census-stage.json',
  );
});
