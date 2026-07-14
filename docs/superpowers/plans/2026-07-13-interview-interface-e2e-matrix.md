# Interview Interface E2E Configuration Matrix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** E2E coverage for every wired configuration option of all 20 interview interfaces: ~207 scenarios with functional assertions + aria snapshots, plus a small all-browser pixel-snapshot suite, running fully parallel.

**Architecture:** Scenarios build protocols in TypeScript with `SyntheticInterview`, convert them through a new schema-validating payload adapter, install them via `window.__test.installProtocol`, and start interviews with seeded networks via an extended `createInterview` hook. Per-interface scenario registries drive both the functional matrix (aria snapshots) and the visual suite (pixel snapshots, `visual: true` scenarios); a vitest coverage-manifest test makes "every option covered" a red/green invariant.

**Tech Stack:** Playwright 1.61 (Docker-pinned for pixel baselines), Vitest, `@codaco/protocol-utilities` (SyntheticInterview), `@codaco/protocol-validation` (Zod schemas), pnpm/turbo monorepo.

**Spec:** `docs/superpowers/specs/2026-07-13-interview-interface-e2e-matrix-design.md`

**Research artifacts:** per-interface option inventories with wiring citations and testable-scenario proposals live at
`/private/tmp/claude-1530134172/-Users-jmh629-Projects-network-canvas--claude-worktrees-interview-interface-e2e-tests-e307d9/6a8edc4c-1996-4424-a9b4-871c24941a42/scratchpad/research/dive-<Interface>.json`.
Each interface task below embeds the scenario table derived from its dive file; consult the dive file for exact `file:line` wiring citations when an assertion needs adjusting.

## Global Constraints

- Monorepo rules: NO `any` types; no barrel files; no type assertions (`as`) to silence errors; comment only the unusual.
- Run `pnpm typecheck`, `pnpm lint:fix` (via lint-staged hook on commit), and `pnpm knip` before any commit that changes exports.
- Never regenerate PIXEL baselines locally — only via `pnpm --filter @codaco/interview test:e2e:update-snapshots` (Docker). ARIA snapshots (`.aria.yml`) MAY be regenerated locally with `--update-snapshots` — they are OS-independent.
- Every attribute visible in an assertion or snapshot must be explicitly seeded (`setNodeAttribute`/`setEdgeAttribute`) — SyntheticInterview randomizes unset attributes on procedural nodes and neutral-fills manual nodes.
- Categorical attribute values are always arrays — assert them as arrays.
- Participant-facing copy in test protocols must be neutral and non-normative (no "normal"/"traditional" family framing).
- Scenario ids are kebab-case, unique within their interface file.
- Timer-driven UI uses `page.clock` or explicit settle-waits; never fixed `waitForTimeout` sleeps.
- The existing `specs/silos-protocol.spec.ts` and its snapshots must NOT change behavior (legacy projects keep it byte-identical in runtime semantics).
- The dev-host flow (`pnpm dev:host`, `?bootstrap=` URL) must keep working after testHooks changes.
- Commit after every task (repo convention allows committing without asking once types/lint/tests pass). Never commit directly to `main` — all work happens on the current feature branch.
- All paths below are relative to `packages/interview/` unless they start with `packages/` or `docs/`.

---

### Task 1: SyntheticInterview builder extensions

**Files:**

- Modify: `packages/protocol-utilities/src/types.ts` (AddStageInput ~line 351, StageEntry, AddPromptInput)
- Modify: `packages/protocol-utilities/src/SyntheticInterview.ts` (AddFormFieldOpts ~line 83, addPanel handles ~lines 93/98/779/794, buildStageConfig ~line 1630, getInterviewPayload ~line 1535)
- Test: `packages/protocol-utilities/src/__tests__/SyntheticInterview.test.ts` (extend existing)

**Interfaces:**

- Consumes: existing `SyntheticInterview` class, `SkipLogicSchema`/`FilterSchema` from `@codaco/protocol-validation` (`src/schemas/8/common/skipLogic.ts`, `src/schemas/8/filters/`).
- Produces (later tasks rely on these exact signatures):
  - `AddStageInput.interviewScript?: string` / `StageEntry.interviewScript?: string` — threaded through `addStage` and emitted verbatim by `buildStageConfig` on the built stage config for EVERY stage type (mirroring how `label` flows). ~15 later tasks pass `interviewScript` into `addStage()`; this task is the sole owner making that legal.
  - `AddStageInput.skipLogic?: SkipLogic` and `AddStageInput.filter?: Filter` — emitted verbatim on the built stage config for EVERY stage type.
  - `addPanel(opts?: { title?: string; dataSource?: string; filter?: Filter })` on NameGenerator/NameGeneratorQuickAdd handles.
  - `AddFormFieldOpts` gains `hint?: string; showValidationHints?: boolean; parameters?: Record<string, unknown>` (passed through to the codebook variable / form field).
  - `AddPromptInput` gains `sortOrder?: SortRule[]` passed through for Sociogram prompts.
  - `AddStageInput.validation?: { minLength?: number; maxLength?: number }` emitted on Anonymisation stage configs.
  - `synth.setExperiments(experiments: { encryptedVariables?: boolean })` — stored and emitted by `getInterviewPayload()` in place of the hardcoded `experiments: null` (default stays `null` when never called).
  - AlterForm/AlterEdgeForm stage configs NEVER emit `form.title` (rejected by `TitlelessFormSchema`); EgoForm/NameGenerator keep emitting it.
  - `AddPromptInput.additionalAttributes?: { variable: string; value: boolean }[]` — threaded through `resolvePrompt` and emitted on NameGenerator/NameGeneratorQuickAdd/NameGeneratorRoster prompts (all three share `resolvePrompt`); `buildStageConfig` already spreads `stage.prompts` verbatim, so no further wiring is needed there.
  - `NetworkComposerFormFieldInput.hint?: string; showValidationHints?: boolean` (types.ts:343-349 currently lacks them) — passed through by `resolveNetworkComposerFormField` onto the emitted `NetworkComposerFormFieldEntry` (which already declares both fields, types.ts:176-183); Task 19's scenarios consume them.
  - `AddVariableInput.encrypted?: boolean` / `VariableEntry.encrypted?: boolean` — accepted by `addVariableToNodeType` (including its dedupe branch, so redeclaring the auto-seeded `name` variable with `encrypted: true` mutates the existing entry) and emitted by `buildCodebook`'s **node** variable loop only. `addVariableToEdgeType`/`addEgoVariable` and their `buildCodebook` loops are deliberately left untouched: `packages/protocol-validation/src/schemas/8/variables/variable.ts` enforces `encrypted` only on node `text` variables and rejects it outright on ego/edge variables (`rejectEncryptedOnNonTextNode`/`rejectEncrypted`), so wiring it through those paths would just produce schema-invalid protocols.

- [ ] **Step 1: Write failing tests for every new passthrough**

Add to `packages/protocol-utilities/src/__tests__/SyntheticInterview.test.ts`:

```ts
describe('e2e-matrix builder extensions', () => {
  const filter = {
    join: 'AND',
    rules: [
      {
        id: 'rule-1',
        type: 'node',
        options: { type: 'person', operator: 'EXISTS' },
      },
    ],
  } as const;

  it('emits skipLogic and stage-level filter on stage configs', () => {
    const synth = new SyntheticInterview();
    const person = synth.addNodeType({ name: 'Person' });
    synth.addStage('NameGenerator', {
      subject: { entity: 'node', type: person.id },
      skipLogic: { action: 'SKIP', filter },
      filter,
    });
    const stage = synth.getProtocol().stages[0] as Record<string, unknown>;
    expect(stage.skipLogic).toEqual({ action: 'SKIP', filter });
    expect(stage.filter).toEqual(filter);
  });

  it('emits panel filter', () => {
    const synth = new SyntheticInterview();
    const person = synth.addNodeType({ name: 'Person' });
    const ng = synth.addStage('NameGenerator', {
      subject: { entity: 'node', type: person.id },
    });
    ng.addPanel({ title: 'Filtered', dataSource: 'existing', filter });
    const stage = synth.getProtocol().stages[0] as {
      panels: { filter?: unknown }[];
    };
    expect(stage.panels[0]?.filter).toEqual(filter);
  });

  it('passes hint/showValidationHints/parameters through form fields', () => {
    const synth = new SyntheticInterview();
    const person = synth.addNodeType({ name: 'Person' });
    const af = synth.addStage('AlterForm', {
      subject: { entity: 'node', type: person.id },
    });
    af.addFormField({
      component: 'Text',
      hint: 'A helpful hint',
      showValidationHints: true,
      parameters: { minLabel: 'Low' },
    });
    const stage = synth.getProtocol().stages[0] as {
      form: { fields: Record<string, unknown>[] };
    };
    expect(stage.form.fields[0]?.hint).toBe('A helpful hint');
    expect(stage.form.fields[0]?.showValidationHints).toBe(true);
  });

  it('never emits form.title on AlterForm/AlterEdgeForm', () => {
    const synth = new SyntheticInterview();
    const person = synth.addNodeType({ name: 'Person' });
    synth.addStage('AlterForm', {
      subject: { entity: 'node', type: person.id },
      form: { title: 'Should be dropped', fields: [] },
    });
    const stage = synth.getProtocol().stages[0] as {
      form: Record<string, unknown>;
    };
    expect(stage.form).not.toHaveProperty('title');
  });

  it('passes sortOrder through Sociogram prompts', () => {
    const synth = new SyntheticInterview();
    const person = synth.addNodeType({ name: 'Person' });
    const soc = synth.addStage('Sociogram', {
      subject: { entity: 'node', type: person.id },
    });
    soc.addPrompt({
      sortOrder: [{ property: 'name', direction: 'asc' }],
    });
    const stage = synth.getProtocol().stages[0] as {
      prompts: { sortOrder?: unknown }[];
    };
    expect(stage.prompts[0]?.sortOrder).toEqual([
      { property: 'name', direction: 'asc' },
    ]);
  });

  it('emits Anonymisation validation and protocol experiments', () => {
    const synth = new SyntheticInterview();
    synth.addStage('Anonymisation', {
      validation: { minLength: 4, maxLength: 12 },
    });
    synth.setExperiments({ encryptedVariables: true });
    const stage = synth.getProtocol().stages[0] as Record<string, unknown>;
    expect(stage.validation).toEqual({ minLength: 4, maxLength: 12 });
    const payload = synth.getInterviewPayload();
    expect(payload.protocol.experiments).toEqual({ encryptedVariables: true });
  });

  it('passes additionalAttributes through NameGenerator-family prompts', () => {
    const synth = new SyntheticInterview();
    const person = synth.addNodeType({ name: 'Person' });
    const closeTie = person.addVariable({ type: 'boolean', name: 'closeTie' });
    const ng = synth.addStage('NameGenerator', {
      subject: { entity: 'node', type: person.id },
    });
    ng.addPrompt({
      text: 'Who is close to you?',
      additionalAttributes: [{ variable: closeTie.id, value: true }],
    });
    const stage = synth.getProtocol().stages[0] as {
      prompts: { additionalAttributes?: unknown }[];
    };
    expect(stage.prompts[0]?.additionalAttributes).toEqual([
      { variable: closeTie.id, value: true },
    ]);
  });

  it('emits encrypted on node text variables and rejects it on edge/ego', () => {
    const synth = new SyntheticInterview();
    const person = synth.addNodeType({ name: 'Person' });
    const nameVar = person.addVariable({
      type: 'text',
      name: 'name',
      encrypted: true,
    });
    const codebook = synth.getProtocol().codebook as {
      node: Record<
        string,
        { variables: Record<string, { encrypted?: boolean }> }
      >;
    };
    expect(codebook.node[person.id]?.variables[nameVar.id]?.encrypted).toBe(
      true,
    );

    // Redeclaring an existing node variable with encrypted:true mutates the
    // existing entry rather than being silently dropped by the dedupe branch.
    const nameVarAgain = person.addVariable({
      type: 'text',
      name: 'name',
      encrypted: true,
    });
    expect(nameVarAgain.id).toBe(nameVar.id);

    // Edge/ego variables never carry `encrypted` — protocol-validation's
    // variable schema rejects it outright for those entities, so the builder
    // must not thread it through those paths at all.
    const colleague = synth.addEdgeType({ name: 'Colleague' });
    const edgeVar = colleague.addVariable({ type: 'text', name: 'note' });
    const codebookWithEdge = synth.getProtocol().codebook as {
      edge: Record<
        string,
        { variables: Record<string, { encrypted?: boolean }> }
      >;
    };
    expect(
      codebookWithEdge.edge[colleague.id]?.variables[edgeVar.id],
    ).not.toHaveProperty('encrypted');
  });

  it('emits interviewScript verbatim on stage configs', () => {
    const synth = new SyntheticInterview();
    const person = synth.addNodeType({ name: 'Person' });
    synth.addStage('NameGenerator', {
      subject: { entity: 'node', type: person.id },
      interviewScript: 'Ask the participant who they trust.',
    });
    const stage = synth.getProtocol().stages[0] as Record<string, unknown>;
    expect(stage.interviewScript).toBe('Ask the participant who they trust.');
  });

  it('passes hint/showValidationHints through NetworkComposer form fields', () => {
    const synth = new SyntheticInterview();
    const person = synth.addNodeType({ name: 'Person' });
    const nc = synth.addStage('NetworkComposer', {
      subject: { entity: 'node', type: person.id },
    });
    nc.addNodeFormField({
      component: 'Text',
      label: 'Age',
      hint: 'Enter age in years',
      showValidationHints: true,
    });
    const stage = synth.getProtocol().stages[0] as {
      nodeForm: { fields: Record<string, unknown>[] };
    };
    expect(stage.nodeForm.fields[0]?.hint).toBe('Enter age in years');
    expect(stage.nodeForm.fields[0]?.showValidationHints).toBe(true);
  });
});
```

Adjust the `filter` literal if `FilterSchema` requires different rule fields — open `packages/protocol-validation/src/schemas/8/filters/` and copy a schema-valid rule shape verbatim. Do NOT weaken the assertions.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @codaco/protocol-utilities test -- --run SyntheticInterview`
Expected: FAIL — type errors (`skipLogic` not in `AddStageInput`) and/or assertion failures.

- [ ] **Step 3: Implement the type additions**

In `packages/protocol-utilities/src/types.ts`:

```ts
import type { Filter, SkipLogic } from '@codaco/protocol-validation';
```

(If `Filter`/`SkipLogic` types are not exported from the package entry, export them from `packages/protocol-validation/src/index.ts` — they are legitimately needed by another package. Run `pnpm knip` after.)

Add to `AddStageInput` (top, alongside `label`):

```ts
  interviewScript?: string;
  skipLogic?: SkipLogic;
  filter?: Filter;
  // Anonymisation
  validation?: { minLength?: number; maxLength?: number };
```

Add `interviewScript?: string` to `StageEntry` (types.ts:204-207, alongside `label: string`) so `addStage` can store it.

Add `sortOrder?: SortRule[]` to `AddPromptInput`. Add `filter?: Filter` to the panel entry type stored on `StageEntry` (find the `panels` field on `StageEntry`/`NameGeneratorPromptEntry` and extend it). Mirror the new `AddStageInput` fields onto `StageEntry` so `addStage` can store them.

Add `hint?: string; showValidationHints?: boolean` to `NetworkComposerFormFieldInput` (types.ts:343-349):

```ts
export type NetworkComposerFormFieldInput = {
  variable?: string;
  label?: string;
  hint?: string;
  showValidationHints?: boolean;
  component: ComponentType;
  parameters?: Record<string, unknown>;
  validation?: Record<string, unknown>;
};
```

(`NetworkComposerFormFieldEntry`, types.ts:176-183, already declares both `hint` and `showValidationHints` — only the input type was missing them.)

Add `additionalAttributes?: { variable: string; value: boolean }[]` to `AddPromptInput` (~line 433) — `NameGeneratorPromptEntry` (types.ts:52-56) already carries this field, only the input type is missing it:

```ts
export type AddPromptInput = {
  text?: string;
  additionalAttributes?: { variable: string; value: boolean }[];
  layout?: {
    layoutVariable?: string;
  };
  edges?: {
    create?: boolean | string;
    display?: string[];
  };
  highlight?: {
    variable?: string | boolean;
  };
};
```

Add `encrypted?: boolean` to both `VariableEntry` (~line 15) and `AddVariableInput` (~line 323):

```ts
export type VariableEntry = {
  id: string;
  name: string;
  type: VariableType;
  component?: ComponentType;
  options?: VariableOption[];
  validation?: Record<string, unknown>;
  encrypted?: boolean;
};
```

```ts
export type AddVariableInput = {
  id?: string;
  name?: string;
  type?: VariableType;
  component?: ComponentType;
  options?: VariableOption[];
  validation?: Record<string, unknown>;
  encrypted?: boolean;
};
```

`encrypted` is deliberately **not** added anywhere else — `packages/protocol-validation/src/schemas/8/variables/variable.ts` (`rejectEncryptedOnNonTextNode`/`rejectEncrypted`) enforces it only on node `text` variables and rejects it on ego/edge variables, so `VariableEntry`/`AddVariableInput` staying generic is fine as long as only the node code path (below) ever reads/emits it.

- [ ] **Step 4: Implement the builder wiring**

In `packages/protocol-utilities/src/SyntheticInterview.ts`:

1. `AddFormFieldOpts` (line ~83) gains:

```ts
  hint?: string;
  showValidationHints?: boolean;
  parameters?: Record<string, unknown>;
```

Thread them into every `addFormField` implementation (lines ~763, 864, 887, 905) and emit them on the built form-field object in `buildStageConfig` (only when set — do not emit `undefined` keys; `CurrentProtocolSchema` uses strict objects).

2. Both `addPanel` implementations (lines ~779, ~794) accept and store `filter`; `buildStageConfig` emits it on the panel object when set.

3. `addStage` copies `opts.skipLogic`, `opts.filter`, `opts.validation`, `opts.interviewScript` onto the `StageEntry` (the `entry` literal at ~line 428, alongside `label: opts?.label ?? type,`); `buildStageConfig` (line ~1630, alongside `label: stage.label,`) spreads them onto the emitted config for every stage type:

```ts
      ...(stage.interviewScript ? { interviewScript: stage.interviewScript } : {}),
      ...(stage.skipLogic ? { skipLogic: stage.skipLogic } : {}),
      ...(stage.filter ? { filter: stage.filter } : {}),
```

(`validation` only on the Anonymisation branch.)

4. Sociogram prompt resolution (`resolveSociogramPrompt`) passes `sortOrder` through when provided.

5. AlterForm/AlterEdgeForm branches of `buildStageConfig`: strip `title` from the emitted `form` object.

6. Add private `experiments: { encryptedVariables?: boolean } | null = null`, public `setExperiments(experiments: { encryptedVariables?: boolean }): void`, and replace `experiments: null` in `getInterviewPayload` (line ~1556) with `experiments: this.experiments`.

7. `resolvePrompt` (line ~1123, shared by NameGenerator/NameGeneratorQuickAdd/NameGeneratorRoster) gains the `additionalAttributes` passthrough — `buildStageConfig` already spreads `stage.prompts` verbatim (line ~1645-1646), so no separate emit step is needed:

```ts
  private resolvePrompt(
    opts: AddPromptInput | undefined,
    entry: StageEntry,
  ): NameGeneratorPromptEntry {
    return {
      id: this.nextId('prompt'),
      text: opts?.text ?? this.valueGen.generatePromptText(entry.type),
      ...(opts?.additionalAttributes
        ? { additionalAttributes: opts.additionalAttributes }
        : {}),
    };
  }
```

8. `encrypted` on node text variables: `addVariableToNodeType` (line ~284-323) reads `opts?.encrypted` in both branches — the dedupe branch merges it onto the existing entry (so redeclaring the auto-seeded `name` variable with `encrypted: true` works), and the fresh-entry branch sets it on creation:

```ts
const existing = this.findVariableByName(nodeType.variables, name);
if (existing) {
  if (existing.type !== type) {
    throw new Error(
      `Variable "${name}" already exists on node type "${nodeTypeId}" with type "${existing.type}"; cannot redeclare as "${type}".`,
    );
  }
  if (opts?.encrypted !== undefined) {
    existing.encrypted = opts.encrypted;
  }
  return { id: existing.id };
}

const varId = opts?.id ?? this.nextId('var');
const options = this.resolveOptions(type, opts?.options);

const entry: VariableEntry = {
  id: varId,
  name,
  type,
  component: opts?.component,
  options,
  validation: opts?.validation,
  encrypted: opts?.encrypted,
};
```

`addVariableToEdgeType` (line ~325-361) and `addEgoVariable` (line ~373+) are **not** touched — leave their `opts?.encrypted` unread, since edge/ego variables can never legally carry `encrypted` (see the schema citation above).

In `buildCodebook` (line ~1563), only the **node** variable loop emits `encrypted`, guarded so an unset/false value never appears as a key:

```ts
if (varEntry.component) variable.component = varEntry.component;
if (varEntry.options) variable.options = varEntry.options;
if (varEntry.validation) variable.validation = varEntry.validation;
if (varEntry.encrypted) variable.encrypted = varEntry.encrypted;
variables[varId] = variable;
```

The edge-type loop (line ~1586-1608) and ego loop (line ~1610-1625) are left exactly as they are today — do not add an `encrypted` line to either, even though `VariableEntry` now structurally has the field.

9. `resolveNetworkComposerFormField` (line ~1061) passes `hint`/`showValidationHints` through onto the emitted `NetworkComposerFormFieldEntry` (only when set — `NetworkComposerFormFieldEntry` already declares both fields, so no type change is needed there):

```ts
return {
  variable: variableId,
  component: input.component,
  ...(input.parameters ? { parameters: input.parameters } : {}),
  ...(input.hint ? { hint: input.hint } : {}),
  ...(input.showValidationHints !== undefined
    ? { showValidationHints: input.showValidationHints }
    : {}),
  label: input.label ?? variable?.name ?? 'Field',
};
```

(`resolveNetworkComposerEdgeFormField`, the sibling method for edge attribute fields, is left untouched — Task 19's scenarios only exercise node fields.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @codaco/protocol-utilities test -- --run SyntheticInterview`
Expected: PASS (all pre-existing tests too).

- [ ] **Step 6: Audit affected Storybook stories**

All changes are additive (new optional fields/params), so existing stories should be unaffected — verify rather than assume:

Run: `grep -rln "SyntheticInterview" packages/interview/src --include "*.stories.tsx" | head` then `pnpm --filter @codaco/interview test -- --run --project units`
Expected: unit suite green; no story imports break. If any story consumed a changed signature, update it in this task.

- [ ] **Step 7: Typecheck, knip, commit**

Run: `pnpm typecheck` then `pnpm knip`
Expected: clean (knip may require the new protocol-validation exports to be consumed — they are, by this package).

```bash
git add packages/protocol-utilities packages/protocol-validation
git commit -m "feat(protocol-utilities): builder support for skipLogic, filters, and form passthroughs"
```

---

### Task 2: Payload adapter (SyntheticInterview → ProtocolPayload)

**Files:**

- Create: `e2e/helpers/synthetic-payload.ts`
- Test: `e2e/helpers/synthetic-payload.test.ts` (node-side vitest; see step 4 for how it runs)

**Interfaces:**

- Consumes: `SyntheticInterview` (Task 1), `CurrentProtocolSchema`, `hashProtocol` from `@codaco/protocol-validation`, `ProtocolPayload`/`ResolvedAsset`/`SessionPayload` from `../../src/contract/types.js`.
- Produces:
  - `type SyntheticAssetSpec = { assetId: string; name: string; type: 'image' | 'video' | 'audio' | 'network' | 'geojson'; source: string; localPath: string } | { assetId: string; name: string; type: 'apikey'; value: string }`
  - `buildSyntheticPayload(synth: SyntheticInterview, opts: { protocolName: string; assets?: SyntheticAssetSpec[]; currentStep?: number; seedNetwork?: boolean; stageMetadata?: unknown }): { protocol: ProtocolPayload; session: SessionPayload; assetFiles: { assetId: string; source: string; localPath: string }[] }`
  - Throws a descriptive error when the assembled protocol fails `CurrentProtocolSchema`.

E2E asset convention: a scenario registers each asset TWICE — once on the builder (`synth.addAsset({ id: spec.assetId, name, type, source })`, matching the real `assetSchema`, so codebook/stage references validate) and once in `opts.assets` (adding `localPath` pointing at a real file, e.g. under `packages/development-protocol/assets/` or `.storybook/static/storybook/`). `buildSyntheticPayload` builds the `assetManifest` for validation from `opts.assets`; the fixture (Task 3) copies `localPath` files into `e2e/.assets/<protocolId>/<source>` and registers URLs.

- [ ] **Step 1: Write the failing test**

```ts
// e2e/helpers/synthetic-payload.test.ts
import { describe, expect, it } from 'vitest';

import { SyntheticInterview } from '@codaco/protocol-utilities';

import { buildSyntheticPayload } from './synthetic-payload.js';

describe('buildSyntheticPayload', () => {
  it('produces a schema-valid ProtocolPayload with hash and ResolvedAsset[]', () => {
    const synth = new SyntheticInterview();
    const person = synth.addNodeType({ name: 'Person' });
    synth.addStage('NameGeneratorQuickAdd', {
      subject: { entity: 'node', type: person.id },
    });
    const { protocol, session } = buildSyntheticPayload(synth, {
      protocolName: 'adapter-test',
    });
    expect(protocol.hash).toMatch(/^[0-9a-f]+$/i);
    expect(protocol.id).toBeTruthy();
    expect(Array.isArray(protocol.assets)).toBe(true);
    expect(protocol).not.toHaveProperty('isPreview');
    expect(protocol).not.toHaveProperty('isPending');
    expect(protocol).not.toHaveProperty('assetManifest');
    expect(session.currentStep).toBe(0);
    expect(typeof session.startTime).toBe('string');
  });

  it('seeds the session network when seedNetwork is set', () => {
    const synth = new SyntheticInterview();
    const person = synth.addNodeType({ name: 'Person' });
    synth.addStage('Sociogram', {
      subject: { entity: 'node', type: person.id },
      initialNodes: 3,
    });
    const { session } = buildSyntheticPayload(synth, {
      protocolName: 'seeded',
      seedNetwork: true,
      currentStep: 0,
    });
    expect(session.network.nodes).toHaveLength(3);
  });

  it('rejects a protocol that fails CurrentProtocolSchema', () => {
    const synth = new SyntheticInterview();
    const person = synth.addNodeType({ name: 'Person' });
    synth.addStage('NameGeneratorRoster', {
      subject: { entity: 'node', type: person.id },
      dataSource: 'no-such-asset', // roster dataSource must reference a network asset
    });
    expect(() =>
      buildSyntheticPayload(synth, { protocolName: 'invalid' }),
    ).toThrow(/CurrentProtocolSchema|dataSource|asset/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @codaco/interview exec vitest run e2e/helpers/synthetic-payload.test.ts`
Expected: FAIL — module not found. (If vitest doesn't pick up e2e files, add the path to the `units` project `include` in the package's vitest config — see Task 6 step 5, do it here first if needed.)

- [ ] **Step 3: Implement the adapter**

```ts
// e2e/helpers/synthetic-payload.ts
import { v4 as uuid } from 'uuid';

import type { SyntheticInterview } from '@codaco/protocol-utilities';
import {
  CurrentProtocolSchema,
  hashProtocol,
} from '@codaco/protocol-validation';

import type {
  ProtocolPayload,
  ResolvedAsset,
  SessionPayload,
} from '../../src/contract/types.js';

type FileAssetSpec = {
  assetId: string;
  name: string;
  type: 'image' | 'video' | 'audio' | 'network' | 'geojson';
  source: string;
  localPath: string;
};

type ApiKeyAssetSpec = {
  assetId: string;
  name: string;
  type: 'apikey';
  value: string;
};

export type SyntheticAssetSpec = FileAssetSpec | ApiKeyAssetSpec;

export type BuildSyntheticPayloadOptions = {
  protocolName: string;
  assets?: SyntheticAssetSpec[];
  currentStep?: number;
  seedNetwork?: boolean;
  stageMetadata?: unknown;
};

export type SyntheticPayloadResult = {
  protocol: ProtocolPayload;
  session: SessionPayload;
  assetFiles: { assetId: string; source: string; localPath: string }[];
};

export function buildSyntheticPayload(
  synth: SyntheticInterview,
  opts: BuildSyntheticPayloadOptions,
): SyntheticPayloadResult {
  const raw = synth.getInterviewPayload({
    currentStep: opts.currentStep ?? 0,
    ...(opts.stageMetadata !== undefined
      ? { stageMetadata: opts.stageMetadata }
      : {}),
  });

  const assetManifest = Object.fromEntries(
    (opts.assets ?? []).map((a) => [
      a.assetId,
      a.type === 'apikey'
        ? { name: a.name, type: a.type, value: a.value }
        : { name: a.name, type: a.type, source: a.source },
    ]),
  );

  // Validate against the REAL protocol schema (incl. cross-reference
  // superRefines) so an invalid builder config fails at build time with a
  // Zod error instead of a mystery render inside the interview.
  const candidate = {
    name: opts.protocolName,
    schemaVersion: raw.protocol.schemaVersion,
    codebook: raw.protocol.codebook,
    stages: raw.protocol.stages,
    ...(Object.keys(assetManifest).length > 0 ? { assetManifest } : {}),
    ...(raw.protocol.experiments
      ? { experiments: raw.protocol.experiments }
      : {}),
  };
  const parsed = CurrentProtocolSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new Error(
      `Synthetic protocol "${opts.protocolName}" failed CurrentProtocolSchema:\n${parsed.error.message}`,
    );
  }
  const { assetManifest: _manifest, ...protocolBody } = parsed.data;

  const resolvedAssets: ResolvedAsset[] = (opts.assets ?? []).map((a) =>
    a.type === 'apikey'
      ? { assetId: a.assetId, name: a.name, type: a.type, value: a.value }
      : { assetId: a.assetId, name: a.name, type: a.type, source: a.source },
  );

  const protocol: ProtocolPayload = {
    ...protocolBody,
    id: uuid(),
    hash: hashProtocol(parsed.data),
    importedAt: new Date().toISOString(),
    assets: resolvedAssets,
  };

  const emptyNetwork: SessionPayload['network'] = raw.network;
  const session: SessionPayload = {
    id: uuid(),
    startTime: new Date().toISOString(),
    finishTime: null,
    exportTime: null,
    lastUpdated: new Date().toISOString(),
    network: opts.seedNetwork
      ? raw.network
      : { ...emptyNetwork, nodes: [], edges: [] },
    currentStep: opts.currentStep ?? 0,
    ...(raw.stageMetadata != null ? { stageMetadata: raw.stageMetadata } : {}),
  };

  return {
    protocol,
    session,
    assetFiles: (opts.assets ?? []).flatMap((a) =>
      a.type === 'apikey'
        ? []
        : [{ assetId: a.assetId, source: a.source, localPath: a.localPath }],
    ),
  };
}
```

Check the exact `SessionPayload`/`stageMetadata` and `GetSessionInput` types while implementing — `raw.network`'s ego shape comes from `getNetwork()` and is already correct. If `hashProtocol` requires the full `CurrentProtocol` (with `assetManifest`), pass `parsed.data`; mirror what `ProtocolFixture.install` does at `e2e/fixtures/protocol-fixture.ts:100`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @codaco/interview exec vitest run e2e/helpers/synthetic-payload.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/interview/e2e/helpers/synthetic-payload.ts packages/interview/e2e/helpers/synthetic-payload.test.ts
git commit -m "feat(interview-e2e): schema-validating SyntheticInterview payload adapter"
```

---

### Task 3: Seeded interviews + installPayload fixture

**Files:**

- Modify: `e2e/host/src/testHooks.ts:108-129` (createInterview)
- Modify: `e2e/fixtures/window-test.d.ts`
- Modify: `e2e/fixtures/protocol-fixture.ts` (add `installPayload`, extend `createInterview`)
- Modify: `e2e/host/src/testHooks.test.ts` (extend existing unit tests)
- Modify: `specs/silos-protocol.spec.ts:15-18` (fix the stale `restoreSnapshot()` comment only — the real mechanism is `window.__test.reset()`)

**Interfaces:**

- Consumes: `buildSyntheticPayload` + `SyntheticPayloadResult` (Task 2).
- Produces:
  - `window.__test.createInterview(protocolId: string, participantId: string, session?: SessionSeed): string` where `type SessionSeed = { network?: SessionPayload['network']; currentStep?: number; stageMetadata?: SessionPayload['stageMetadata'] }`. Omitted fields keep today's defaults (empty network, step 0) — the silos suite and dev-host bootstrap are unaffected.
  - `ProtocolFixture.installPayload(result: SyntheticPayloadResult): Promise<{ protocolId: string }>` — copies `assetFiles` into `e2e/.assets/<protocolId>/<source>`, installs the protocol via `window.__test.installProtocol`, registers each file asset's URL via `setAssetUrl`, tracks the id for cleanup.
  - `ProtocolFixture.createInterview(protocolId: string, participantIdentifier?: string, session?: SessionSeed): Promise<string>` (extended pass-through).

- [ ] **Step 1: Write failing unit tests for the seeded createInterview**

Extend `e2e/host/src/testHooks.test.ts` (it already unit-tests these hooks — follow its existing setup pattern):

```ts
it('createInterview seeds network, currentStep and stageMetadata when provided', () => {
  const seededNetwork = {
    ego: { _uid: 'ego-1', attributes: {} },
    nodes: [
      {
        _uid: 'n1',
        type: 'person',
        promptIDs: [],
        stageId: 's1',
        attributes: {},
      },
    ],
    edges: [],
  };
  const id = createInterview('proto-1', 'participant-1', {
    network: seededNetwork,
    currentStep: 2,
    stageMetadata: { 3: [[1, 0, 0, false]] },
  });
  const entry = getTestState().interviews.get(id);
  expect(entry?.session.network.nodes).toHaveLength(1);
  expect(entry?.session.currentStep).toBe(2);
  expect(entry?.session.stageMetadata).toEqual({ 3: [[1, 0, 0, false]] });
});

it('createInterview without a seed keeps the empty-network default', () => {
  const id = createInterview('proto-1', 'participant-1');
  const entry = getTestState().interviews.get(id);
  expect(entry?.session.network.nodes).toHaveLength(0);
  expect(entry?.session.currentStep).toBe(0);
});
```

Use the real property names — `entityPrimaryKeyProperty`/`entityAttributesProperty` from `@codaco/shared-consts` — not the literal `_uid`/`attributes` strings if the test file's existing style imports them.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @codaco/interview exec vitest run e2e/host/src/testHooks.test.ts`
Expected: FAIL — createInterview takes 2 arguments.

- [ ] **Step 3: Implement the seeded createInterview**

Replace `createInterview` in `e2e/host/src/testHooks.ts`:

```ts
export type SessionSeed = {
  network?: SessionPayload['network'];
  currentStep?: number;
  stageMetadata?: SessionPayload['stageMetadata'];
};

export function createInterview(
  protocolId: string,
  participantId: string,
  seed?: SessionSeed,
): string {
  const id = uuid();
  // This session is the initial payload Shell mounts with. After mount,
  // Shell owns its state in Redux — getNetworkState reads from that live
  // store, not from this snapshot.
  const session: SessionPayload = {
    id,
    startTime: new Date().toISOString(),
    finishTime: null,
    exportTime: null,
    lastUpdated: new Date().toISOString(),
    network: seed?.network ?? createInitialNetwork(),
    currentStep: seed?.currentStep ?? 0,
    ...(seed?.stageMetadata != null
      ? { stageMetadata: seed.stageMetadata }
      : {}),
  };
  state.interviews.set(id, { protocolId, participantId, session });
  persistState();
  notifySubscribers();
  return id;
}
```

Update `e2e/fixtures/window-test.d.ts` to the new signature (import or inline the `SessionSeed` shape — the d.ts previously duplicated shapes; follow its existing style).

- [ ] **Step 4: Implement installPayload + extended fixture createInterview**

Add to `ProtocolFixture` (`e2e/fixtures/protocol-fixture.ts`), reusing the class's existing `assetDir`/`assetServerUrl`/`installedProtocolIds` plumbing:

```ts
  /**
   * Install a SyntheticInterview-built payload (Task 2 adapter output).
   * Mirrors install(): copies asset files under e2e/.assets/<protocolId>/,
   * registers the protocol and asset URLs via window.__test.
   */
  async installPayload(
    result: SyntheticPayloadResult,
  ): Promise<{ protocolId: string }> {
    const protocolId = result.protocol.id;
    const protocolAssetDir = path.join(this.assetDir, protocolId);
    await fs.mkdir(protocolAssetDir, { recursive: true });

    for (const file of result.assetFiles) {
      const destPath = path.join(protocolAssetDir, file.source);
      await fs.mkdir(path.dirname(destPath), { recursive: true });
      await fs.copyFile(file.localPath, destPath);
    }

    await this.page.evaluate(
      (p: ProtocolPayload) => window.__test.installProtocol(p),
      result.protocol,
    );

    for (const file of result.assetFiles) {
      const resolvedUrl = `${this.assetServerUrl}/${protocolId}/${file.source}`;
      await this.page.evaluate(
        ([id, url]: [string, string]) => window.__test.setAssetUrl(id, url),
        [file.assetId, resolvedUrl] as [string, string],
      );
    }

    this.installedProtocolIds.push(protocolId);
    return { protocolId };
  }
```

Extend the existing `createInterview` with an optional third parameter passed through `page.evaluate` to the hook:

```ts
  async createInterview(
    protocolId: string,
    participantIdentifier?: string,
    session?: SessionSeed,
  ): Promise<string> {
    const participantId =
      participantIdentifier ?? `e2e-participant-${Date.now()}`;
    return this.page.evaluate(
      ([pid, partId, seed]: [string, string, SessionSeed | undefined]) =>
        window.__test.createInterview(pid, partId, seed),
      [protocolId, participantId, session] as [
        string,
        string,
        SessionSeed | undefined,
      ],
    );
  }
```

Import `SyntheticPayloadResult` from `../helpers/synthetic-payload.js` and `SessionSeed` from the host testHooks types (re-declare in `window-test.d.ts` if importing across the host boundary is awkward — the d.ts already does this for other shapes).

- [ ] **Step 5: Run unit tests + typecheck; verify silos suite still typechecks**

Run: `pnpm --filter @codaco/interview exec vitest run e2e/host/src/testHooks.test.ts` — Expected: PASS.
Run: `pnpm typecheck` — Expected: clean (existing 2-arg `createInterview` call sites still compile because the third param is optional).

- [ ] **Step 6: Fix the stale comment and commit**

In `specs/silos-protocol.spec.ts:15-18`, replace the `restoreSnapshot()` mention with `window.__test.reset()` (comment-only change).

```bash
git add packages/interview/e2e packages/interview/specs 2>/dev/null; git add packages/interview
git commit -m "feat(interview-e2e): seeded createInterview and installPayload fixture"
```

---

### Task 4: Matrix test fixture (per-test isolation, auto snapshot prefix, aria capture)

**Files:**

- Create: `e2e/fixtures/matrix-test.ts`
- Create: `e2e/fixtures/capture.ts` (shared capture logic extracted from `interview-test.ts`)
- Modify: `e2e/fixtures/interview-test.ts` (consume the extracted helper; behavior unchanged)

**Interfaces:**

- Consumes: `InterviewFixture`, `StageFixture`, `ProtocolFixture`, `installMapboxMocks` (existing); `createCaptureInterview` (extracted here).
- Produces (scenario specs rely on these):
  - `matrixTest` — a Playwright test object with PER-TEST `page`/`context` (no shared worker page), fixtures `{ interview: InterviewFixture, stage: StageFixture, protocol: ProtocolFixture, ariaSnapshot: (label: 'initial' | 'final') => Promise<void> }`.
  - Auto-derived snapshot prefix: `interview.snapshotPrefix` is set from `test.info().titlePath` (slugified `<file>-<test-title>`), so pixel AND aria snapshot names can never collide across files.
  - `ariaSnapshot(label)` asserts `page.locator('main[data-theme-interview]')` against `toMatchAriaSnapshot({ name: `${slug}-${label}.aria.yml` })`.

- [ ] **Step 1: Extract the capture helper**

Move the `captureInterview` fixture body (the `VISUAL_STYLES` constant, entrance-settle `waitForFunction`, and `toHaveScreenshot` call — `e2e/fixtures/interview-test.ts:14-35,150-219`) into:

```ts
// e2e/fixtures/capture.ts
import { expect, type Locator, type Page } from '@playwright/test';

export type CaptureInterviewOptions = { mask?: Locator[]; fullPage?: boolean };
export type CaptureInterviewFn = (
  name: string,
  options?: CaptureInterviewOptions,
) => Promise<void>;

export const VISUAL_STYLES = `/* moved verbatim from interview-test.ts */`;

export function createCaptureInterview(
  page: Page,
  opts: { enabled: boolean },
): CaptureInterviewFn {
  let stylesInjected = false;
  return async (name, options = {}) => {
    if (!opts.enabled) return;
    if (!stylesInjected) {
      await page.addStyleTag({ content: VISUAL_STYLES });
      stylesInjected = true;
    }
    // ... entrance-settle waitForFunction moved verbatim ...
    await expect.soft(page).toHaveScreenshot(`${name}.png`, {
      fullPage: options.fullPage ?? false,
      mask: options.mask,
    });
  };
}
```

Move the code verbatim (including the `MIN_PENDING_AREA` settle logic and its comments); `interview-test.ts`'s fixture becomes `use(createCaptureInterview(page, { enabled: !!process.env.CI }))`.

- [ ] **Step 2: Verify legacy suite still passes typecheck and a smoke run**

Run: `pnpm typecheck`
Expected: clean.
Run: `pnpm --filter @codaco/interview test:e2e:headed -- --project=chromium --grep "Stage 0"`
Expected: the silos Stage 0 test passes (build the host first if the script requires it — see `package.json` `test:e2e:headed`).

- [ ] **Step 3: Write the matrix fixture**

```ts
// e2e/fixtures/matrix-test.ts
import { expect } from '@playwright/test';

import { createCaptureInterview } from './capture.js';
import { InterviewFixture } from './interview-fixture.js';
import { installMapboxMocks } from './mapbox-mocks.js';
import { ProtocolFixture } from './protocol-fixture.js';
import { StageFixture } from './stage-fixture.js';
import { test as baseTest } from './test.js';

type MatrixFixtures = {
  interview: InterviewFixture;
  stage: StageFixture;
  protocol: ProtocolFixture;
  snapshotSlug: string;
  ariaSnapshot: (label: 'initial' | 'final') => Promise<void>;
};

function slugify(parts: string[]): string {
  return parts
    .join('-')
    .toLowerCase()
    .replace(/\.spec\.ts$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Matrix tests get a fresh page per test (Playwright's default fixtures —
 * deliberately NOT the worker-shared page interview-test.ts uses) so
 * fullyParallel workers cannot clobber each other's sessionStorage state.
 */
export const matrixTest = baseTest.extend<MatrixFixtures>({
  page: async ({ page }, use) => {
    await installMapboxMocks(page);
    await page.goto('/');
    await page.waitForFunction(() => typeof window.__test !== 'undefined', {
      timeout: 30_000,
    });
    await page.evaluate(() => window.__test.reset());
    await use(page);
  },

  snapshotSlug: async ({}, use, testInfo) => {
    await use(slugify(testInfo.titlePath));
  },

  protocol: async ({ page }, use) => {
    const assetUrl = process.env.E2E_ASSET_URL ?? 'http://localhost:4200';
    const protocol = new ProtocolFixture(page, assetUrl);
    await use(protocol);
    await protocol.cleanup();
  },

  interview: async ({ page, snapshotSlug }, use) => {
    const interview = new InterviewFixture(page);
    interview.snapshotPrefix = snapshotSlug;
    interview.setCaptureFn(
      createCaptureInterview(page, { enabled: !!process.env.CI }),
    );
    await use(interview);
  },

  stage: async ({ page }, use) => {
    await use(new StageFixture(page));
  },

  ariaSnapshot: async ({ page, snapshotSlug }, use) => {
    await use(async (label) => {
      await expect(
        page.locator('main[data-theme-interview]'),
      ).toMatchAriaSnapshot({ name: `${snapshotSlug}-${label}.aria.yml` });
    });
  },
});

export { expect };
```

Note `page` here is Playwright's built-in per-test page — the override only prepares it. Mapbox mocks are installed for every matrix test for uniformity (they're route interceptions; near-zero cost off the Geospatial stage).

- [ ] **Step 4: Typecheck and commit**

Run: `pnpm typecheck` — Expected: clean.

```bash
git add packages/interview/e2e/fixtures
git commit -m "feat(interview-e2e): per-test matrix fixture with aria snapshots and auto prefixes"
```

---

### Task 5: Playwright project split + workers

**Files:**

- Modify: `e2e/playwright.config.ts`
- Modify: `e2e/helpers/assetServer.ts:107-114` (guard `cleanup()`)

**Interfaces:**

- Produces (CI and all scenario tasks rely on these project names):
  - Projects `chromium-legacy` / `firefox-legacy` / `webkit-legacy`: `testMatch: /silos-protocol\.spec\.ts/`, `fullyParallel: false`, snapshots stay in `visual-snapshots/` under the OLD project names (`chromium`, `firefox`, `webkit`) so the 336 committed PNGs don't move.
  - Projects `chromium-matrix` (all matrix specs) and `firefox-matrix` / `webkit-matrix` (`grep: /@smoke/`): `fullyParallel: true`, aria snapshots under `e2e/aria-snapshots/<browser>/`.
  - Projects `chromium-visual` / `firefox-visual` / `webkit-visual`: `testMatch: /visual\.spec\.ts/`, pixel snapshots under `visual-snapshots/<browser>-matrix/`.
  - `workers`: `process.env.PW_WORKERS ? Number(process.env.PW_WORKERS) : '50%'`.

- [ ] **Step 1: Rewrite the projects/workers section**

Replace the `projects` array and `workers`/`fullyParallel` lines of `e2e/playwright.config.ts` (keep webServer, expect, use, reporter as-is):

```ts
  fullyParallel: false, // per-project below; legacy stays serial
  workers: process.env.PW_WORKERS ? Number(process.env.PW_WORKERS) : '50%',

  projects: [
    // Legacy: the silos serial chain. Keeps its original snapshot dirs.
    {
      name: 'chromium-legacy',
      use: devices['Desktop Chrome'],
      testMatch: /silos-protocol\.spec\.ts/,
      fullyParallel: false,
      snapshotPathTemplate: '{snapshotDir}/chromium/{arg}{ext}',
    },
    {
      name: 'firefox-legacy',
      use: devices['Desktop Firefox'],
      testMatch: /silos-protocol\.spec\.ts/,
      fullyParallel: false,
      snapshotPathTemplate: '{snapshotDir}/firefox/{arg}{ext}',
    },
    {
      name: 'webkit-legacy',
      use: devices['Desktop Safari'],
      testMatch: /silos-protocol\.spec\.ts/,
      fullyParallel: false,
      snapshotPathTemplate: '{snapshotDir}/webkit/{arg}{ext}',
    },
    // Matrix: functional + aria. Fully parallel, per-test isolation.
    {
      name: 'chromium-matrix',
      use: devices['Desktop Chrome'],
      testMatch: /specs\/matrix\/(?!visual).*\.spec\.ts/,
      fullyParallel: true,
      snapshotPathTemplate: './aria-snapshots/chromium/{arg}{ext}',
    },
    {
      name: 'firefox-matrix',
      use: devices['Desktop Firefox'],
      testMatch: /specs\/matrix\/(?!visual).*\.spec\.ts/,
      grep: /@smoke/,
      fullyParallel: true,
      snapshotPathTemplate: './aria-snapshots/firefox/{arg}{ext}',
    },
    {
      name: 'webkit-matrix',
      use: devices['Desktop Safari'],
      testMatch: /specs\/matrix\/(?!visual).*\.spec\.ts/,
      grep: /@smoke/,
      fullyParallel: true,
      snapshotPathTemplate: './aria-snapshots/webkit/{arg}{ext}',
    },
    // Visual: pixel snapshots of visual-flagged scenarios, all browsers.
    {
      name: 'chromium-visual',
      use: devices['Desktop Chrome'],
      testMatch: /specs\/matrix\/visual\.spec\.ts/,
      fullyParallel: true,
      snapshotPathTemplate: '{snapshotDir}/chromium-matrix/{arg}{ext}',
    },
    {
      name: 'firefox-visual',
      use: devices['Desktop Firefox'],
      testMatch: /specs\/matrix\/visual\.spec\.ts/,
      fullyParallel: true,
      snapshotPathTemplate: '{snapshotDir}/firefox-matrix/{arg}{ext}',
    },
    {
      name: 'webkit-visual',
      use: devices['Desktop Safari'],
      testMatch: /specs\/matrix\/visual\.spec\.ts/,
      fullyParallel: true,
      snapshotPathTemplate: '{snapshotDir}/webkit-matrix/{arg}{ext}',
    },
  ],
```

If TypeScript rejects per-project `snapshotPathTemplate`/`fullyParallel`, they are valid project options in Playwright 1.61 — check `@playwright/test` types; `grep` on a project is standard.

- [ ] **Step 2: Guard AssetServer.cleanup**

`AssetServer.cleanup()` recursively deletes the whole shared `e2e/.assets/` dir and is currently dead code — lethal under parallel workers if ever wired into teardown. Replace its body:

```ts
  /**
   * Intentionally disabled: .assets/ is shared by all parallel workers, so a
   * recursive delete here would destroy other workers' in-flight fixtures.
   * Per-protocol cleanup lives in ProtocolFixture.uninstall().
   */
  cleanup(): never {
    throw new Error(
      'AssetServer.cleanup() must not be used: e2e/.assets is shared across parallel workers.',
    );
  }
```

- [ ] **Step 3: Verify legacy suite is unaffected**

Run: `pnpm --filter @codaco/interview test:e2e:headed -- --project=chromium-legacy --grep "Stage 0"`
Expected: PASS, and the snapshot it compares against resolves to the EXISTING `visual-snapshots/chromium/stage-0.png` (no new baseline written — if Playwright reports a missing snapshot, the `snapshotPathTemplate` override is wrong).

Run: `git status --porcelain packages/interview/e2e/visual-snapshots` — Expected: empty (no baselines moved/rewritten).

- [ ] **Step 4: Commit**

```bash
git add packages/interview/e2e/playwright.config.ts packages/interview/e2e/helpers/assetServer.ts
git commit -m "feat(interview-e2e): legacy/matrix/visual project split with tunable workers"
```

---

### Task 6: Scenario registry, runner, coverage manifest + Information exemplar

**Files:**

- Create: `e2e/matrix/types.ts`
- Create: `e2e/matrix/run-scenario.ts`
- Create: `e2e/matrix/option-inventory.ts`
- Create: `e2e/matrix/information.scenarios.ts`
- Create: `e2e/specs/matrix/information.spec.ts`
- Create: `e2e/matrix/coverage-manifest.test.ts`
- Modify: the interview package's vitest config (`vitest.config.ts` / `vitest.workspace` — locate the `units` project) to include `e2e/**/*.test.ts`

**Interfaces:**

- Consumes: `matrixTest`/`expect` (Task 4), `buildSyntheticPayload` (Task 2), fixture `protocol.installPayload`/`createInterview` (Task 3).
- Produces (EVERY interface task 7–25 conforms to these exact types):

```ts
// e2e/matrix/types.ts
import type { Locator, Page } from '@playwright/test';

import type { SyntheticInterview } from '@codaco/protocol-utilities';

import type { InterviewFixture } from '../fixtures/interview-fixture.js';
import type { ProtocolFixture } from '../fixtures/protocol-fixture.js';
import type { StageFixture } from '../fixtures/stage-fixture.js';
import type { SyntheticAssetSpec } from '../helpers/synthetic-payload.js';

export type ScenarioContext = {
  page: Page;
  interview: InterviewFixture;
  stage: StageFixture;
  protocol: ProtocolFixture;
};

export type ScenarioDefinition = {
  /** kebab-case, unique within the interface file */
  id: string;
  /** option keys from option-inventory.ts this scenario claims */
  covers: readonly string[];
  /** include in the firefox/webkit smoke subset */
  smoke?: true;
  /** include in the pixel visual suite (representative or pixels-only option) */
  visual?: true;
  /** chromium-only functional cells (e.g. Geospatial map visuals) */
  chromiumOnly?: true;
  /** mark test.slow() (e.g. Geospatial, crypto-heavy Anonymisation) */
  slow?: true;
  /** returns a fully-configured builder */
  build: () => SyntheticInterview;
  /** asset files to register + copy (Task 2 convention) */
  assets?: SyntheticAssetSpec[];
  /** start step (default 0) */
  currentStep?: number;
  /** install synth.getNetwork() as the starting network (default false) */
  seedNetwork?: boolean;
  /** seeded stage metadata (e.g. NarrativePedigree source-stage state) */
  stageMetadata?: unknown;
  /** extra pixel-capture masks (visual suite only, e.g. EncryptedBackground) */
  captureMask?: (page: Page) => Locator[];
  /** interactions + functional assertions; aria snapshots wrap this */
  run: (ctx: ScenarioContext) => Promise<void>;
};

export type InterfaceScenarios = {
  interfaceType: string;
  scenarios: readonly ScenarioDefinition[];
};
```

- `defineScenarioTests(suite: InterfaceScenarios): void` from `run-scenario.ts` — call once per spec file.
- `runScenarioBody(scenario, ctx, opts: { pixel: boolean })` — also used by the visual suite (Task 27).
- `OPTION_INVENTORY: Record<string, readonly string[]>` from `option-inventory.ts` — interface type → option keys.

- [ ] **Step 1: Write `types.ts`** (exactly as above).

- [ ] **Step 2: Write the runner**

```ts
// e2e/matrix/run-scenario.ts
import { buildSyntheticPayload } from '../helpers/synthetic-payload.js';
import { expect, matrixTest } from '../fixtures/matrix-test.js';
import type {
  InterfaceScenarios,
  ScenarioContext,
  ScenarioDefinition,
} from './types.js';

export async function installScenario(
  scenario: ScenarioDefinition,
  ctx: ScenarioContext,
): Promise<void> {
  const synth = scenario.build();
  const result = buildSyntheticPayload(synth, {
    protocolName: `matrix-${scenario.id}`,
    assets: scenario.assets,
    currentStep: scenario.currentStep,
    seedNetwork: scenario.seedNetwork,
    stageMetadata: scenario.stageMetadata,
  });
  const { protocolId } = await ctx.protocol.installPayload(result);
  const interviewId = await ctx.protocol.createInterview(
    protocolId,
    `matrix-${scenario.id}`,
    {
      network: result.session.network,
      currentStep: result.session.currentStep,
      ...(result.session.stageMetadata != null
        ? { stageMetadata: result.session.stageMetadata }
        : {}),
    },
  );
  ctx.interview.interviewId = interviewId;
  await ctx.interview.goto(scenario.currentStep ?? 0);
}

export function defineScenarioTests(suite: InterfaceScenarios): void {
  for (const scenario of suite.scenarios) {
    const tags = scenario.smoke ? ' @smoke' : '';
    matrixTest(
      `${suite.interfaceType}: ${scenario.id}${tags}`,
      async ({ page, interview, stage, protocol, ariaSnapshot }) => {
        if (scenario.chromiumOnly) {
          matrixTest.skip(
            !matrixTest.info().project.name.startsWith('chromium'),
            'chromium-only scenario',
          );
        }
        if (scenario.slow) matrixTest.slow();
        const ctx: ScenarioContext = { page, interview, stage, protocol };
        await installScenario(scenario, ctx);
        await ariaSnapshot('initial');
        await scenario.run(ctx);
        await ariaSnapshot('final');
      },
    );
  }
}

export { expect };
```

- [ ] **Step 3: Write the Information exemplar registry (COMPLETE — this is the pattern every interface task copies)**

```ts
// e2e/matrix/information.scenarios.ts
import { expect } from '../fixtures/matrix-test.js';
import { SyntheticInterview } from '@codaco/protocol-utilities';

import type { InterfaceScenarios } from './types.js';

const DEV_PROTOCOL_ASSETS = '../../../development-protocol/assets' as const; // resolve with path.resolve(import.meta.dirname, ...) in the actual file

export const informationScenarios: InterfaceScenarios = {
  interfaceType: 'Information',
  scenarios: [
    {
      id: 'text-item-markdown',
      covers: [
        'title',
        'items[].type=text',
        'items[].size',
        'label',
        'interviewScript',
      ],
      smoke: true,
      visual: true,
      build: () => {
        const synth = new SyntheticInterview();
        synth.addInformationStage({
          label: 'Menu-only label',
          title: 'Welcome to the study',
          items: [
            {
              id: 'item-1',
              type: 'text',
              content: '## Subheading\n\nA paragraph with **bold** text.',
              size: 'MEDIUM',
            },
          ],
        });
        return synth;
      },
      run: async ({ page, interview }) => {
        await expect(
          page.getByRole('heading', { name: 'Welcome to the study' }),
        ).toBeVisible();
        // Markdown renders as elements, not literal syntax
        await expect(
          page.getByRole('heading', { name: 'Subheading' }),
        ).toBeVisible();
        await expect(page.locator('strong', { hasText: 'bold' })).toBeVisible();
        // Dead-config absence assertions: label/interviewScript never render
        await expect(page.getByText('Menu-only label')).toHaveCount(0);
        // Information stages are immediately navigable
        await expect(interview.nextButton).toBeEnabled();
      },
    },
    {
      id: 'image-asset',
      covers: ['items[].type=asset(image)'],
      build: () => {
        const synth = new SyntheticInterview();
        synth.addAsset({
          id: 'img-1',
          name: 'quadrant',
          type: 'image',
          source: 'quadrant.png',
        });
        synth.addInformationStage({
          title: 'Image stage',
          items: [
            { id: 'item-1', type: 'asset', content: 'img-1', size: 'LARGE' },
          ],
        });
        return synth;
      },
      assets: [
        {
          assetId: 'img-1',
          name: 'quadrant',
          type: 'image',
          source: 'quadrant.png',
          localPath: `${DEV_PROTOCOL_ASSETS}/quadrant.png`,
        },
      ],
      run: async ({ page }) => {
        const img = page.locator('main img[src*="quadrant.png"]');
        await expect(img).toBeVisible();
        // Asset actually loaded from the asset server (not a broken image)
        await expect
          .poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth))
          .toBeGreaterThan(0);
      },
    },
    // ... audio, video, missing-asset fallback, size-band scenarios follow the
    // same shape — Task 7's authoring convention: one entry per bundle row.
  ],
};
```

Adjust `addInformationStage`'s exact input shape to the builder's real API (check `packages/protocol-utilities/src/SyntheticInterview.ts` — it exists; the dive file `dive-Information.json` documents the stage schema fields). Complete ALL 9 Information bundles from the dive file's assertions list, not just the two shown here.

- [ ] **Step 4: Write the spec file**

```ts
// e2e/specs/matrix/information.spec.ts
import { informationScenarios } from '../../matrix/information.scenarios.js';
import { defineScenarioTests } from '../../matrix/run-scenario.js';

defineScenarioTests(informationScenarios);
```

- [ ] **Step 5: Write the coverage-manifest test + option inventory**

`e2e/matrix/option-inventory.ts` — seed with Information only (interface tasks append their own entries):

```ts
/**
 * Canonical per-interface option-key inventory for the e2e matrix.
 * Keys are free-form but stable; the coverage test (a) checks every key here
 * is claimed by >=1 scenario, and (b) walks each stage schema's TOP-LEVEL
 * Zod keys to catch schema options missing from this inventory entirely.
 * Cross-cutting keys (skipLogic, filter) are claimed by the shared suites.
 */
export const OPTION_INVENTORY: Record<string, readonly string[]> = {
  Information: [
    'title',
    'items[].type=text',
    'items[].type=asset(image)',
    'items[].type=asset(audio)',
    'items[].type=asset(video)',
    'items[].size',
    'label',
    'interviewScript',
    'skipLogic',
  ],
};
```

```ts
// e2e/matrix/coverage-manifest.test.ts
import { describe, expect, it } from 'vitest';

import { informationScenarios } from './information.scenarios.js';
import { OPTION_INVENTORY } from './option-inventory.js';
import type { InterfaceScenarios } from './types.js';
import { sharedSuiteClaims } from './shared-claims.js';

// Interface tasks append their registry import here as they land.
const ALL_SUITES: InterfaceScenarios[] = [informationScenarios];

describe('e2e matrix coverage manifest', () => {
  it('every inventoried option key is claimed by at least one scenario', () => {
    const claimed = new Set<string>(
      ALL_SUITES.flatMap((s) =>
        s.scenarios.flatMap((sc) =>
          sc.covers.map((key) => `${s.interfaceType}:${key}`),
        ),
      ),
    );
    for (const claim of sharedSuiteClaims) claimed.add(claim);

    const missing: string[] = [];
    for (const [iface, keys] of Object.entries(OPTION_INVENTORY)) {
      // Only enforce interfaces whose registry has landed
      if (
        !ALL_SUITES.some((s) => s.interfaceType === iface) &&
        !sharedSuiteClaims.some((c) => c.startsWith(`${iface}:`))
      )
        continue;
      for (const key of keys) {
        if (!claimed.has(`${iface}:${key}`)) missing.push(`${iface}:${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('scenario ids are unique within each interface', () => {
    for (const suite of ALL_SUITES) {
      const ids = suite.scenarios.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
```

Also create `e2e/matrix/shared-claims.ts` exporting `export const sharedSuiteClaims: readonly string[] = ['Information:skipLogic'];` — Task 26 (shared suites) extends it with every interface's `skipLogic`/`filter` claims, each backed by a REAL generated wiring scenario (see Task 26; claims without a backing scenario are forbidden). Add a third `it` that imports the stage schemas from `@codaco/protocol-validation` and asserts every top-level Zod key of each landed interface's stage schema — AND every key of its `prompts` array-element schema, when the stage has one — appears in that interface's inventory (implementation detail: `Object.keys(schema.shape)` after unwrapping `ZodEffects`/`ZodOptional`; for prompts, unwrap the `ZodArray` element; skip base keys `id`/`type`; if individual stage schemas aren't exported, walk the `StageSchema` discriminated union's options and match on the `type` literal; nested non-prompt sub-options stay manual per the spec).

- [ ] **Step 6: Wire e2e tests into vitest and run everything**

Add `e2e/**/*.test.ts` to the `units` project include in the interview package's vitest config (keep the storybook project untouched). Then:

Run: `pnpm --filter @codaco/interview exec vitest run e2e/matrix` — Expected: PASS.
Run (needs built host — `test:e2e:headed` builds it): `pnpm --filter @codaco/interview test:e2e:headed -- --project=chromium-matrix --grep "Information"` — Expected: all Information scenarios pass; first run writes `e2e/aria-snapshots/chromium/*.aria.yml` files (commit them).

- [ ] **Step 7: Commit**

```bash
git add packages/interview/e2e
git commit -m "feat(interview-e2e): scenario registry, runner, coverage manifest, Information matrix"
```

---

### Task 7: NameGeneratorQuickAdd matrix scenarios

**Files:**

- Create: `packages/interview/e2e/matrix/name-generator-quick-add.scenarios.ts`
- Create: `packages/interview/e2e/specs/matrix/name-generator-quick-add.spec.ts`
- Modify: `packages/interview/e2e/matrix/option-inventory.ts` (add the `NameGeneratorQuickAdd` entry)
- Modify: `packages/interview/e2e/matrix/coverage-manifest.test.ts` (append the registry import + push onto `ALL_SUITES`)
- No changes to `packages/interview/e2e/fixtures/stage-fixture.ts` — `QuickAddFixture`, `NodePanelFixture`, and `StageFixture.deleteNode`/`getNode`/`getPrompt` already cover every interaction this task needs.

**Interfaces:**

- Consumes: `ScenarioDefinition`/`InterfaceScenarios`/`defineScenarioTests` (Task 6), `SyntheticInterview` (Task 1), Task 1 (`prompts[].additionalAttributes` + encrypted variable support — hoisted there; this task adds no builder code), seeded interviews via `currentStep`/`seedNetwork` (Task 3), `SyntheticAssetSpec` (Task 2), `StageFixture.quickAdd` (`addNode`, `isDisabled`), `StageFixture.nodePanel` (`panel`, `getNode`, `dragNodeToMainList`), `StageFixture.getPrompt`, `StageFixture.getNode`, `StageFixture.deleteNode` (all pre-existing in `e2e/fixtures/stage-fixture.ts`).
- Produces: `nameGeneratorQuickAddScenarios: InterfaceScenarios` (`interfaceType: 'NameGeneratorQuickAdd'`) — consumed by `coverage-manifest.test.ts`'s `ALL_SUITES` and by the visual suite (Task 27) via the shared `run-scenario.ts` runner (any scenario here with `visual: true` is picked up automatically once that suite iterates all registries).
- NodePanel fixture: this task uses the CURRENT single-panel NodePanelFixture API; Task 8 reshapes it to a multi-panel title-keyed API and owns updating this file's call sites in that same commit.

**Option inventory entry** (add to `packages/interview/e2e/matrix/option-inventory.ts`; `panels[].filter` and `skipLogic` are listed but intentionally never claimed by a scenario in this file — they belong to the shared cross-cutting suite, Task 26, which must add `'NameGeneratorQuickAdd:skipLogic'` and `'NameGeneratorQuickAdd:panels[].filter'` to `sharedSuiteClaims` in `e2e/matrix/shared-claims.ts`):

```ts
  NameGeneratorQuickAdd: [
    'label',
    'interviewScript',
    'skipLogic',
    'subject.type',
    'quickAdd',
    'behaviours.minNodes',
    'behaviours.maxNodes',
    'behaviours.maxNodes-panel-drag-gap',
    'panels[].id',
    'panels[].title',
    'panels[].dataSource=existing',
    'panels[].dataSource=assetId',
    'panels[].filter',
    'prompts[].id',
    'prompts[].text',
    'prompts[].additionalAttributes',
    'codebook.node.color',
    'codebook.node.icon',
    'codebook.node.shape',
    'codebook.variables.quickAdd.encrypted',
  ],
```

**Scenario table**

| id                                            | covers                                                                             | flags             | protocol config                                                                                                                                                                                                                                                                             | interaction                                                                                                                                                                                                              | functional assertions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `quick-add-core-flow`                         | `quickAdd`                                                                         | `smoke`, `visual` | Person node type (auto-seeded `name` text var reused as `quickAdd`), 1 prompt, no panels/behaviours                                                                                                                                                                                         | Click `quick-add-toggle`; type `Alice` in `quick-add-input`, press Enter; repeat with `Bob`; then press Enter with empty input                                                                                           | `getNetworkState().nodes` has 2 nodes, `type===personTypeId`, `attributes[nameVar.id]` is `'Alice'`/`'Bob'`, `promptIDs===[promptId]`; `stage.getNode('Alice')`/`stage.getNode('Bob')` visible with `role=option`; input value is `''` after each Enter; on the empty-Enter attempt a tooltip containing `/must enter a value/i` is visible and node count stays at 2                                                                                                                                                                                                                                                                                                                                                            |
| `prompts-and-label-dead-config`               | `prompts[].text`, `prompts[].id`, `label`, `interviewScript`                       | —                 | 2 prompts: `'Who do you *trust*?'` and `'Anyone else?'`; `label: 'My QuickAdd'`, `interviewScript: 'SECRET-SCRIPT'`                                                                                                                                                                         | Assert first prompt's markdown renders; add `'Carol'`; click `nextButton` (advances prompt, not stage, since `isLastPrompt` is false — `useInterviewNavigation.ts:184-185`); wait for the second prompt's text to appear | `stage.getPrompt()` renders an `<em>` inside for `*trust*`; `document.body.innerText` never contains `'SECRET-SCRIPT'` (dead-by-design); after advancing, `stage.getNode('Carol')` is NOT visible (prompt-scoped `node-list`) and `stage.getPrompt('Anyone else?')` is visible; `getNetworkState()` node's `promptIDs` is `[prompt1Id]` only; opening the stages menu shows `'My QuickAdd'` (not the stage type name)                                                                                                                                                                                                                                                                                                            |
| `prompt-additional-attributes-existing-panel` | `prompts[].additionalAttributes`, `panels[].dataSource=existing`, `panels[].id`    | —                 | See full code below                                                                                                                                                                                                                                                                         | See full code below                                                                                                                                                                                                      | See full code below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `node-limits-and-panel-drag-gap`              | `behaviours.minNodes`, `behaviours.maxNodes`, `behaviours.maxNodes-panel-drag-gap` | —                 | 1 prompt, `behaviours: {minNodes: 1, maxNodes: 1}`, one `existing` panel; a prior sibling `NameGeneratorQuickAdd` "Setup" stage (`initialNodes: {count: 1, promptIndex: 0}`) seeds 1 same-type node with its own promptID so the panel isn't empty; `currentStep` = index of the test stage | Click `interview.nextButton` with 0 nodes on the test stage; assert blocked; `stage.quickAdd.addNode('Alice')`; assert success toast + disabled toggle; `stage.nodePanel.dragNodeToMainList(<setup node label>)`         | First click: a destructive toast matching `/must create at least/i` containing `'1'` is visible, and `stage.getNode('Alice')` does NOT yet exist (nothing created), same stage still showing (no `step=` URL change); after `addNode('Alice')`: a success toast `/completed this task/i` is visible, `interview.nextButtonHasPulse()` is `true`, `stage.quickAdd.isDisabled()` is `true`; after the panel drag: `getNetworkState().nodes` filtered to this stage's subject type has length 2 (the drop succeeded despite `maxNodes: 1` — **documents the known gap**: `NodePanel.tsx:21`'s `disableDragging` prop is declared but never read, and `NameGenerator.tsx:171-190`'s `handleDropNode` has no `maxNodesReached` guard) |
| `external-panels-load-error-titles`           | `panels[].dataSource=assetId`, `panels[].title`                                    | `visual`          | See full code below                                                                                                                                                                                                                                                                         | See full code below                                                                                                                                                                                                      | See full code below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `subject-type-scoping`                        | `subject.type`                                                                     | —                 | See full code below                                                                                                                                                                                                                                                                         | See full code below                                                                                                                                                                                                      | See full code below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `codebook-styling-and-node-deletion`          | `codebook.node.color`, `codebook.node.icon`, `codebook.node.shape`                 | `visual`          | Person node type, `color: 'node-color-seq-3'`, `icon: 'add-a-place'`, `shape: {default: 'circle', dynamic: {variable: boolVar.id, type: 'discrete', map: [{value: true, shape: 'square'}]}}`; 1 prompt with `additionalAttributes: [{variable: boolVar.id, value: true}]`                   | Click `quick-add-toggle` (opens, previewing the to-be-created node's shape); read `[data-toggle-circle]` computed style; add `'Dana'`; then `stage.deleteNode('Dana')`                                                   | While open, `page.locator('[data-toggle-circle]')`'s computed `backgroundColor` equals the resolved `var(--node-3)` value (read via `getComputedStyle` and compare against the same var read from `:root`) and the element's class list contains `'rounded'` (square preview, `QuickAddField.tsx:270`); after `deleteNode`, `getNetworkState().nodes` no longer contains `'Dana'` and `stage.getNode('Dana')` is hidden (full delete via NodeBin, not prompt removal)                                                                                                                                                                                                                                                            |
| `encrypted-quick-add-variable`                | `codebook.variables.quickAdd.encrypted`                                            | `slow`            | See full code below                                                                                                                                                                                                                                                                         | See full code below                                                                                                                                                                                                      | See full code below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

**Fully-coded scenarios**

```ts
// packages/interview/e2e/matrix/name-generator-quick-add.scenarios.ts
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SyntheticInterview } from '@codaco/protocol-utilities';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  entitySecureAttributesMeta,
} from '@codaco/shared-consts';

import { expect } from '../fixtures/matrix-test.js';
import type { InterfaceScenarios } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEV_PROTOCOL_ASSETS = path.resolve(
  __dirname,
  '../../../development-protocol/assets',
);

export const nameGeneratorQuickAddScenarios: InterfaceScenarios = {
  interfaceType: 'NameGeneratorQuickAdd',
  scenarios: [
    {
      id: 'quick-add-core-flow',
      covers: ['quickAdd'],
      smoke: true,
      visual: true,
      build: () => {
        const synth = new SyntheticInterview();
        const person = synth.addNodeType({ name: 'Person' });
        const nameVar = person.addVariable({ type: 'text', name: 'name' });
        const stage = synth.addStage('NameGeneratorQuickAdd', {
          label: 'Add contacts',
          subject: { entity: 'node', type: person.id },
          quickAdd: nameVar.id,
        });
        stage.addPrompt({ text: 'Who do you know?' });
        return synth;
      },
      run: async ({ page, stage, protocol, interview }) => {
        await stage.quickAdd.addNode('Alice');
        await stage.quickAdd.addNode('Bob');

        await expect(stage.getNode('Alice')).toBeVisible();
        await expect(stage.getNode('Bob')).toBeVisible();

        const network = await protocol.getNetworkState(interview.interviewId);
        expect(network.nodes).toHaveLength(2);
        const labels = network.nodes.map(
          (n) => n[entityAttributesProperty][Object.keys(n[entityAttributesProperty])[0]!],
        );
        expect(labels.sort()).toEqual(['Alice', 'Bob']);
        for (const node of network.nodes) {
          expect(node.promptIDs).toEqual([expect.any(String)]);
        }

        // Empty-submit validation: opening the input and pressing Enter with
        // nothing typed must not create a node and must surface the tooltip.
        const toggle = page.getByTestId('quick-add-toggle');
        const input = page.getByTestId('quick-add-input');
        if ((await toggle.getAttribute('aria-pressed')) !== 'true') {
          await toggle.click();
        }
        await input.fill('');
        await input.press('Enter');
        await expect(
          page.getByText(/must enter a value before pressing enter/i),
        ).toBeVisible();
        const afterEmpty = await protocol.getNetworkState(
          interview.interviewId,
        );
        expect(afterEmpty.nodes).toHaveLength(2);
      },
    },

    {
      id: 'prompts-and-label-dead-config',
      covers: ['prompts[].text', 'prompts[].id', 'label', 'interviewScript'],
      build: () => {
        const synth = new SyntheticInterview();
        const person = synth.addNodeType({ name: 'Person' });
        const nameVar = person.addVariable({ type: 'text', name: 'name' });
        const stage = synth.addStage('NameGeneratorQuickAdd', {
          label: 'My QuickAdd',
          interviewScript: 'SECRET-SCRIPT',
          subject: { entity: 'node', type: person.id },
          quickAdd: nameVar.id,
        });
        stage.addPrompt({ text: 'Who do you *trust*?' });
        stage.addPrompt({ text: 'Anyone else?' });
        return synth;
      },
      run: async ({ page, stage, protocol, interview }) => {
        await expect(stage.getPrompt().locator('em')).toHaveText('trust');
        await expect(page.getByText('SECRET-SCRIPT')).toHaveCount(0);

        await stage.quickAdd.addNode('Carol');
        await expect(stage.getNode('Carol')).toBeVisible();

        await interview.nextButton.click();
        await expect(stage.getPrompt('Anyone else?')).toBeVisible();
        await expect(stage.getNode('Carol')).not.toBeVisible();

        const network = await protocol.getNetworkState(interview.interviewId);
        expect(network.nodes).toHaveLength(1);
        expect(network.nodes[0]?.promptIDs).toHaveLength(1);

        // label is menu-only; interviewScript is never rendered anywhere.
        await page.getByRole('button', { name: /stages|menu/i }).click();
        await expect(page.getByText('My QuickAdd')).toBeVisible();
        await expect(page.getByText('SECRET-SCRIPT')).toHaveCount(0);
      },
    },

    {
      id: 'prompt-additional-attributes-existing-panel',
      covers: [
        'prompts[].additionalAttributes',
        'panels[].dataSource=existing',
        'panels[].id',
      ],
      build: () => {
        const synth = new SyntheticInterview();
        const person = synth.addNodeType({ name: 'Person' });
        const nameVar = person.addVariable({ type: 'text', name: 'name' });
        const closeTie = person.addVariable({
          type: 'boolean',
          name: 'closeTie',
        });
        const estranged = person.addVariable({
          type: 'boolean',
          name: 'estranged',
        });
        const stage = synth.addStage('NameGeneratorQuickAdd', {
          label: 'Alters',
          subject: { entity: 'node', type: person.id },
          quickAdd: nameVar.id,
        });
        stage.addPrompt({
          text: 'People close to you',
          additionalAttributes: [
            { variable: closeTie.id, value: true },
            { variable: estranged.id, value: false },
          ],
        });
        stage.addPrompt({
          text: 'People from your childhood',
          additionalAttributes: [{ variable: closeTie.id, value: true }],
        });
        stage.addPanel({ title: 'Already added', dataSource: 'existing' });
        return synth;
      },
      run: async ({ page, stage, protocol, interview }) => {
        // Prompt 1: additionalAttributes applied at creation (true AND false
        // must both be written, not the false one omitted).
        await stage.quickAdd.addNode('Alice');
        let network = await protocol.getNetworkState(interview.interviewId);
        const attrIds = Object.keys(network.nodes[0]![entityAttributesProperty]);
        const closeTieId = attrIds.find(
          (id) => network.nodes[0]![entityAttributesProperty][id] !== 'Alice',
        );
        expect(network.nodes[0]![entityAttributesProperty]).toMatchObject(
          Object.fromEntries(
            Object.entries(network.nodes[0]![entityAttributesProperty]).filter(
              ([, v]) => typeof v === 'boolean',
            ),
          ),
        );
        const boolEntries = Object.entries(
          network.nodes[0]![entityAttributesProperty],
        ).filter(([, v]) => typeof v === 'boolean');
        expect(boolEntries).toContainEqual([expect.any(String), true]);
        expect(boolEntries).toContainEqual([expect.any(String), false]);
        void closeTieId;

        // Advance to prompt 2 (same stage — nextButton advances the prompt,
        // not the stage, while isLastPrompt is false).
        await interview.nextButton.click();
        await expect(stage.getPrompt('People from your childhood')).toBeVisible();
        await expect(stage.nodePanel.getNode('Alice')).toBeVisible();
        await expect(stage.getNode('Alice')).not.toBeVisible();

        // Drop from the "existing" panel into the main list: node gains
        // prompt 2's promptID and its additionalAttributes.
        await stage.nodePanel.dragNodeToMainList('Alice');
        network = await protocol.getNetworkState(interview.interviewId);
        expect(network.nodes).toHaveLength(1);
        expect(network.nodes[0]?.promptIDs).toHaveLength(2);
        const boolAfterDrop = Object.values(
          network.nodes[0]![entityAttributesProperty],
        ).filter((v) => typeof v === 'boolean');
        expect(boolAfterDrop.every((v) => v === true)).toBe(true);

        // Drag the node back out into the panel: promptIDs shrinks back to
        // 1 and the attribute set by prompt 2 alone is cleared (session.ts
        // re-resolves additionalAttributes from the node's remaining
        // prompts; prompt 1 doesn't set the same boolean value here, so it
        // is cleared to null rather than reverting).
        const nodeInList = stage.getNode('Alice');
        await nodeInList.evaluate((el) => {
          if (el instanceof HTMLElement) el.focus();
        });
        await nodeInList.press('Control+d');
        let found = false;
        for (let i = 0; i < 20; i++) {
          await page.keyboard.press('ArrowRight');
          const announcement = await page.evaluate(() => {
            const els = document.querySelectorAll(
              'body > div[role="status"][aria-live="polite"]',
            );
            for (const el of els) {
              const text = el.textContent?.trim() ?? '';
              if (text.includes('Drop target')) return text;
            }
            return '';
          });
          if (announcement.includes('Already added')) {
            found = true;
            break;
          }
        }
        expect(found).toBe(true);
        await page.keyboard.press('Enter');

        await expect(stage.getNode('Alice')).not.toBeVisible();
        await expect(stage.nodePanel.getNode('Alice')).toBeVisible();
        network = await protocol.getNetworkState(interview.interviewId);
        expect(network.nodes[0]?.promptIDs).toHaveLength(1);
      },
    },

    {
      id: 'node-limits-and-panel-drag-gap',
      covers: [
        'behaviours.minNodes',
        'behaviours.maxNodes',
        'behaviours.maxNodes-panel-drag-gap',
      ],
      currentStep: 1,
      build: () => {
        const synth = new SyntheticInterview();
        const person = synth.addNodeType({ name: 'Person' });
        const nameVar = person.addVariable({ type: 'text', name: 'name' });
        const setup = synth.addStage('NameGeneratorQuickAdd', {
          label: 'Setup',
          subject: { entity: 'node', type: person.id },
          quickAdd: nameVar.id,
          initialNodes: { count: 1, promptIndex: 0 },
        });
        setup.addPrompt({ text: 'Setup prompt' });
        const stage = synth.addStage('NameGeneratorQuickAdd', {
          label: 'Limited',
          subject: { entity: 'node', type: person.id },
          quickAdd: nameVar.id,
          behaviours: { minNodes: 1, maxNodes: 1 },
        });
        stage.addPrompt({ text: 'Add exactly one person' });
        stage.addPanel({ title: 'Prior contacts', dataSource: 'existing' });
        return synth;
      },
      run: async ({ page, stage, protocol, interview }) => {
        await interview.nextButton.click();
        await expect(
          page.getByText(/must create at least/i).filter({ hasText: '1' }),
        ).toBeVisible();
        let network = await protocol.getNetworkState(interview.interviewId);
        expect(network.nodes.filter((n) => n.promptIDs?.length)).toHaveLength(
          0,
        );

        await stage.quickAdd.addNode('Alice');
        await expect(page.getByText(/completed this task/i)).toBeVisible();
        expect(await interview.nextButtonHasPulse()).toBe(true);
        expect(await stage.quickAdd.isDisabled()).toBe(true);

        // Known gap: NodePanel's disableDragging prop is declared but never
        // read (NodePanel.tsx:21) and handleDropNode has no maxNodesReached
        // guard (NameGenerator.tsx:171-190), so a panel drop still succeeds
        // even though maxNodes: 1 was already reached via quick-add.
        const setupNodeName = await stage.nodePanel
          .panel.getByRole('option')
          .first()
          .textContent();
        await stage.nodePanel.dragNodeToMainList(setupNodeName!.trim());

        network = await protocol.getNetworkState(interview.interviewId);
        expect(network.nodes).toHaveLength(2);
      },
    },

    {
      id: 'external-panels-load-error-titles',
      covers: ['panels[].dataSource=assetId', 'panels[].title'],
      visual: true,
      build: () => {
        const synth = new SyntheticInterview();
        const person = synth.addNodeType({ name: 'Person' });
        const nameVar = person.addVariable({ type: 'text', name: 'name' });
        synth.addAsset({
          id: 'previous-interview',
          name: 'previousInterview.json',
          type: 'network',
          source: 'previousInterview.json',
        });
        const stage = synth.addStage('NameGeneratorQuickAdd', {
          label: 'Import contacts',
          subject: { entity: 'node', type: person.id },
          quickAdd: nameVar.id,
        });
        stage.addPrompt({ text: 'Add people from previous rounds' });
        stage.addPanel({
          title: 'Previous interview',
          dataSource: 'previous-interview',
        });
        stage.addPanel({
          title: 'Missing import',
          dataSource: 'never-registered',
        });
        return synth;
      },
      assets: [
        {
          assetId: 'previous-interview',
          name: 'previousInterview.json',
          type: 'network',
          source: 'previousInterview.json',
          localPath: path.join(
            DEV_PROTOCOL_ASSETS,
            'previousInterview.json',
          ),
        },
      ],
      run: async ({ page, stage, protocol, interview }) => {
        const panels = page.getByTestId('node-panel');
        await expect(panels).toHaveCount(2);
        await expect(
          panels.filter({ hasText: 'Previous interview' }),
        ).toBeVisible();
        await expect(
          panels.filter({ hasText: 'Missing import' }),
        ).toBeVisible();

        // Loaded panel: 'Barry' comes through under the literal `name` key
        // in previousInterview.json (no UUID variable remap needed).
        const loadedPanel = panels.filter({ hasText: 'Previous interview' });
        await expect(loadedPanel.getByRole('option', { name: 'Barry' })).toBeVisible();

        // Error panel: unresolved asset id renders the error copy, and the
        // rest of the interface remains usable.
        const errorPanel = panels.filter({ hasText: 'Missing import' });
        await expect(errorPanel.getByText('Something went wrong')).toBeVisible();
        await expect(
          errorPanel.getByText('External data could not be loaded.'),
        ).toBeVisible();

        await stage.nodePanel
          .panel.filter({ hasText: 'Previous interview' })
          .getByRole('option', { name: 'Barry' })
          .waitFor({ state: 'visible' });
        const dropTarget = page.getByTestId('node-list');
        const barry = loadedPanel.getByRole('option', { name: 'Barry' });
        await barry.evaluate((el) => {
          if (el instanceof HTMLElement) el.focus();
        });
        await barry.press('Control+d');
        await page.keyboard.press('ArrowRight');
        await page.keyboard.press('Enter');
        await expect(dropTarget.getByRole('option', { name: 'Barry' })).toBeVisible();

        const network = await protocol.getNetworkState(interview.interviewId);
        expect(
          network.nodes.some(
            (n) =>
              Object.values(n[entityAttributesProperty]).includes('Barry'),
          ),
        ).toBe(true);

        await expect(stage.quickAdd.isDisabled()).resolves.toBe(false);
      },
    },

    {
      id: 'subject-type-scoping',
      covers: ['subject.type'],
      currentStep: 1,
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        const place = synth.addNodeType({ name: 'Place' });
        const placeName = place.addVariable({ type: 'text', name: 'name' });
        const person = synth.addNodeType({ name: 'Person' });
        const personName = person.addVariable({ type: 'text', name: 'name' });

        const setup = synth.addStage('NameGeneratorQuickAdd', {
          label: 'Setup places',
          subject: { entity: 'node', type: place.id },
          quickAdd: placeName.id,
          initialNodes: { count: 2 }, // no promptIndex: not tied to any prompt
        });
        setup.addPrompt({ text: 'Setup' });

        const stage = synth.addStage('NameGeneratorQuickAdd', {
          label: 'People',
          subject: { entity: 'node', type: person.id },
          quickAdd: personName.id,
          behaviours: { minNodes: 1 },
        });
        stage.addPrompt({ text: 'Add the people you know' });
        stage.addPanel({ title: 'Already added', dataSource: 'existing' });
        return synth;
      },
      run: async ({ page, stage, protocol, interview }) => {
        // 2 Place nodes exist but don't satisfy minNodes (Person-scoped) and
        // don't appear in the existing-panel (Person-scoped).
        await expect(stage.nodePanel.panel.getByRole('option')).toHaveCount(0);
        await interview.nextButton.click();
        await expect(page.getByText(/must create at least/i)).toBeVisible();

        await stage.quickAdd.addNode('Priya');
        const network = await protocol.getNetworkState(interview.interviewId);
        const person = network.nodes.find(
          (n) =>
            Object.values(n[entityAttributesProperty]).includes('Priya'),
        );
        expect(person).toBeDefined();
        expect(network.nodes).toHaveLength(3); // 2 Place + 1 Person
        expect(network.nodes.filter((n) => n.type === person!.type)).toHaveLength(
          1,
        );

        await interview.nextButton.click();
        await expect(interview.nextButton).not.toHaveText(/must create/i);
      },
    },

    {
      id: 'codebook-styling-and-node-deletion',
      covers: ['codebook.node.color', 'codebook.node.icon', 'codebook.node.shape'],
      visual: true,
      build: () => {
        const synth = new SyntheticInterview();
        const person = synth.addNodeType({
          name: 'Place-like Person',
          color: 'node-color-seq-3',
          icon: 'add-a-place',
        });
        const nameVar = person.addVariable({ type: 'text', name: 'name' });
        const isSquare = person.addVariable({
          type: 'boolean',
          name: 'isSquare',
        });
        person.setShape({
          default: 'circle',
          dynamic: {
            variable: isSquare.id,
            type: 'discrete',
            map: [{ value: true, shape: 'square' }],
          },
        });
        const stage = synth.addStage('NameGeneratorQuickAdd', {
          label: 'Styled contacts',
          subject: { entity: 'node', type: person.id },
          quickAdd: nameVar.id,
        });
        stage.addPrompt({
          text: 'Add a contact',
          additionalAttributes: [{ variable: isSquare.id, value: true }],
        });
        return synth;
      },
      run: async ({ page, stage, protocol, interview }) => {
        await page.getByTestId('quick-add-toggle').click();
        const circle = page.locator('[data-toggle-circle]');
        await expect(circle).toHaveClass(/rounded/);

        const [circleColor, expectedColor] = await circle.evaluate((el) => [
          getComputedStyle(el).backgroundColor,
          getComputedStyle(document.documentElement)
            .getPropertyValue('--node-3')
            .trim(),
        ]);
        // backgroundColor resolves to an rgb() string; compare against the
        // same var re-parsed the same way by assigning it to a probe element.
        const resolvedVarColor = await page.evaluate((varValue) => {
          const probe = document.createElement('div');
          probe.style.backgroundColor = varValue;
          document.body.appendChild(probe);
          const rgb = getComputedStyle(probe).backgroundColor;
          probe.remove();
          return rgb;
        }, expectedColor);
        expect(circleColor).toBe(resolvedVarColor);

        await page.getByTestId('quick-add-input').fill('Dana');
        await page.getByTestId('quick-add-input').press('Enter');
        await expect(stage.getNode('Dana')).toBeVisible();

        await stage.deleteNode('Dana');
        const network = await protocol.getNetworkState(interview.interviewId);
        expect(
          network.nodes.some((n) =>
            Object.values(n[entityAttributesProperty]).includes('Dana'),
          ),
        ).toBe(false);
      },
    },

    {
      id: 'encrypted-quick-add-variable',
      covers: ['codebook.variables.quickAdd.encrypted'],
      slow: true,
      build: () => {
        const synth = new SyntheticInterview();
        const person = synth.addNodeType({ name: 'Person' });
        const nameVar = person.addVariable({
          type: 'text',
          name: 'name',
          encrypted: true,
        });
        synth.setExperiments({ encryptedVariables: true });
        const stage = synth.addStage('NameGeneratorQuickAdd', {
          label: 'Confidential contacts',
          subject: { entity: 'node', type: person.id },
          quickAdd: nameVar.id,
        });
        stage.addPrompt({ text: 'Add a person (this will be encrypted)' });
        return synth;
      },
      run: async ({ page, stage, protocol, interview }) => {
        // Before a passphrase is set, quick-add is disabled.
        expect(await stage.quickAdd.isDisabled()).toBe(true);

        const lockButton = page.getByRole('button').filter({ hasText: '🔑' });
        await expect(lockButton).toBeVisible();
        await lockButton.click();

        await page.getByLabel('Passphrase').fill('correct horse battery');
        await page.getByRole('button', { name: 'Submit passphrase' }).click();
        await expect(lockButton).not.toBeVisible();

        expect(await stage.quickAdd.isDisabled()).toBe(false);
        await stage.quickAdd.addNode('Alice');
        await expect(stage.getNode('Alice')).toBeVisible();

        const network = await protocol.getNetworkState(interview.interviewId);
        expect(network.nodes).toHaveLength(1);
        const node = network.nodes[0]!;
        const attrValues = Object.values(node[entityAttributesProperty]);
        // Ciphertext is a number[], never the plaintext string.
        expect(attrValues.some((v) => Array.isArray(v))).toBe(true);
        expect(attrValues).not.toContain('Alice');
        expect(node[entitySecureAttributesMeta]).toBeTruthy();

        // The rendered label still shows the decrypted value (the passphrase
        // is held live in the store for the rest of the session).
        await expect(stage.getNode('Alice')).toBeVisible();
      },
    },
```

`entityPrimaryKeyProperty` is imported for parity with other matrix files even though this file's assertions read attributes/promptIDs only — drop the import if `oxlint`'s unused-import rule flags it after assembly.

- [ ] **Step 1: Assemble the registry file**

Combine the `build()`/`run()` bodies above (in the order given) into `packages/interview/e2e/matrix/name-generator-quick-add.scenarios.ts`, exporting `nameGeneratorQuickAddScenarios: InterfaceScenarios` per the `informationScenarios` exemplar's shape (single `export const`, `interfaceType: 'NameGeneratorQuickAdd'`, `scenarios: [...]`).

- [ ] **Step 2: Write the spec file**

```ts
// packages/interview/e2e/specs/matrix/name-generator-quick-add.spec.ts
import { nameGeneratorQuickAddScenarios } from '../../matrix/name-generator-quick-add.scenarios.js';
import { defineScenarioTests } from '../../matrix/run-scenario.js';

defineScenarioTests(nameGeneratorQuickAddScenarios);
```

- [ ] **Step 3: Wire the coverage manifest**

In `packages/interview/e2e/matrix/coverage-manifest.test.ts`, add:

```ts
import { nameGeneratorQuickAddScenarios } from './name-generator-quick-add.scenarios.js';
```

and push `nameGeneratorQuickAddScenarios` onto the `ALL_SUITES` array. Add the `NameGeneratorQuickAdd` entry (above) to `packages/interview/e2e/matrix/option-inventory.ts`'s `OPTION_INVENTORY`.

- [ ] **Step 4: Run the coverage manifest**

Run: `pnpm --filter @codaco/interview exec vitest run e2e/matrix`
Expected: PASS — every `NameGeneratorQuickAdd:*` inventory key except `skipLogic`/`panels[].filter` is claimed by a scenario in this file; those two remain unclaimed until Task 26 lands (the manifest test only enforces interfaces whose registry has landed AND aren't already covered by `sharedSuiteClaims`, so this file alone will fail the "every inventoried option key is claimed" check until Task 26's `sharedSuiteClaims` addition exists — if Task 26 hasn't landed yet when this task runs, temporarily drop `skipLogic`/`panels[].filter` from this interface's `OPTION_INVENTORY` entry and re-add them when Task 26 lands, OR land this task after Task 26).

- [ ] **Step 5: Run the scenarios**

Run: `pnpm --filter @codaco/interview test:e2e:headed -- --project=chromium-matrix --grep "NameGeneratorQuickAdd"`
Expected: PASS; first run writes `e2e/aria-snapshots/chromium/*.aria.yml` for each scenario's `initial`/`final` snapshots — review and commit them.

- [ ] **Step 6: Typecheck and commit**

Run: `pnpm typecheck` then `pnpm knip` — Expected: clean.

```bash
git add packages/interview/e2e
git commit -m "test(interview-e2e): NameGeneratorQuickAdd configuration matrix"
```

### Task 8: NameGenerator matrix scenarios

**Files:**

- Create: `e2e/matrix/name-generator.scenarios.ts`
- Create: `e2e/specs/matrix/name-generator.spec.ts`
- Modify: `e2e/matrix/option-inventory.ts` (add the `NameGenerator` entry)
- Modify: `e2e/matrix/coverage-manifest.test.ts` (append `import { nameGeneratorScenarios } from './name-generator.scenarios.js';` and add it to `ALL_SUITES`) and `e2e/matrix/all-scenarios.ts` if it exists by the time this task lands (append the same import/registration)
- Modify: `e2e/fixtures/stage-fixture.ts` (extend `NodePanelFixture` to support multiple panels-by-title and round-trip drag; see "Stage fixture helpers" below)

**Interfaces:**

- Consumes: `ScenarioDefinition`/`InterfaceScenarios`/`defineScenarioTests` (Task 6), `SyntheticInterview` builder incl. Task 1's `AddFormFieldOpts.hint`/`.showValidationHints`/`.parameters` and `addPanel({title, dataSource, filter})` (Task 1), Task 1 (`prompts[].additionalAttributes` + encrypted variable support — hoisted there; this task adds no builder code), seeded interviews via `currentStep`/`seedNetwork` (Task 3), `StageFixture.form` (`FormFixture`, existing), `StageFixture.nameGenerator` (`NameGeneratorFixture`, existing), `StageFixture.nodePanel` (extended `NodePanelFixture`, this task), `StageFixture.deleteNode` (existing, for `NodeBin`).
- Produces: `nameGeneratorScenarios: InterfaceScenarios` (`interfaceType: 'NameGenerator'`). Extends `StageFixture.nodePanel` with multi-panel-by-title methods other future tasks (e.g. a `NameGeneratorRoster` or cross-cutting filter task) may reuse: `getPanel(title)`, `getNode(panelTitle, label)`, `getNodeCount(panelTitle)`, `getErrorState(panelTitle)`, `isPanelMinimized(panelTitle)`, `dragNodeToMainList(panelTitle, label)`, `dragNodeFromMainListToPanel(label, panelTitle)`.

**Stage fixture helpers**

The existing `NodePanelFixture` (stage-fixture.ts:1039-1093) assumes exactly one panel (`getByTestId('node-panel')` with no disambiguation) and only supports a one-way panel→main-list drag with a blind single `ArrowRight` press. `NameGenerator` protocols can have 0-2 panels sharing the same `data-testid="node-panel"` (`src/interfaces/NameGenerator/components/NodePanel.tsx:100-105`, `Panel.tsx:84`), each carrying its title as an accessible heading inside a toggle button (`Panel.tsx:86-94`: `<button><Heading>{title}</Heading></button>`), and the round-trip scenarios need to drag a node the _other_ direction (main list → panel) and land on a specific panel by title, not just "the first drop target". Replace the class with:

```ts
// e2e/fixtures/stage-fixture.ts — replace the existing NodePanelFixture class
/**
 * Node Panel fixture for side panel interactions.
 *
 * Panels are disambiguated by their title (the accessible name of the
 * toggle-button heading each panel renders — Panel.tsx:86-94), since a
 * NameGenerator stage can configure 0-2 panels that all share
 * data-testid="node-panel" (NodePanel.tsx:100-105).
 */
class NodePanelFixture {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Get a specific panel by its configured title.
   */
  getPanel(title: string): Locator {
    return this.page
      .getByTestId('node-panel')
      .filter({ has: this.page.getByRole('button', { name: title }) });
  }

  /**
   * Get a node within a specific panel by its label.
   */
  getNode(panelTitle: string, label: string): Locator {
    return this.getPanel(panelTitle).getByRole('option', { name: label });
  }

  /**
   * Count of nodes currently rendered in a panel.
   */
  async getNodeCount(panelTitle: string): Promise<number> {
    return this.getPanel(panelTitle).getByRole('option').count();
  }

  /**
   * External-data panels render "Something went wrong" / "External data
   * could not be loaded." instead of a node list when the asset fails to
   * load or the asset id is unknown (NodePanel.tsx:108-116).
   */
  getErrorState(panelTitle: string): Locator {
    return this.getPanel(panelTitle).getByText(
      'External data could not be loaded.',
    );
  }

  /**
   * Panels minimize (opacity-0, no pointer events) when empty and nothing
   * compatible is being dragged (Panel.tsx: minimize && 'border-b-0 opacity-0').
   */
  async isPanelMinimized(panelTitle: string): Promise<boolean> {
    const className = await this.getPanel(panelTitle).getAttribute('class');
    return (className ?? '').includes('opacity-0');
  }

  /**
   * Drag a node from a named panel to the main node list using keyboard DnD.
   * The main list's drop-target announcement name is "Added Nodes"
   * (NameGenerator.tsx:288 announcedName="Added Nodes").
   */
  async dragNodeToMainList(panelTitle: string, label: string): Promise<void> {
    const nodeInPanel = this.getNode(panelTitle, label);
    const dropTarget = this.page.getByTestId('node-list');

    await expect(nodeInPanel).toBeVisible();
    await expect(dropTarget).toBeVisible();

    await navigateDndToTarget(this.page, nodeInPanel, 'Added Nodes');

    await expect(
      this.page.getByTestId('node-list').getByRole('option', { name: label }),
    ).toBeVisible();
  }

  /**
   * Drag a node from the main list back into a named panel using keyboard
   * DnD. The panel's drop-target announcement name is its configured title
   * (NodePanel.tsx:126 announcedName={panelConfig.title}).
   */
  async dragNodeFromMainListToPanel(
    label: string,
    panelTitle: string,
  ): Promise<void> {
    const nodeInMainList = this.page
      .getByTestId('node-list')
      .getByRole('option', { name: label });
    await expect(nodeInMainList).toBeVisible();

    await navigateDndToTarget(this.page, nodeInMainList, panelTitle);

    await expect(
      this.page.getByTestId('node-list').getByRole('option', { name: label }),
    ).not.toBeVisible();
  }
}
```

`navigateDndToTarget` is the existing module-private helper already declared at the top of `stage-fixture.ts` (lines 35-70) — no new import needed, it stays in scope for the rewritten class in the same file. This is a breaking rename of the public surface (`panel` getter and single-arg `getNode`/`dragNodeToMainList` are removed) — per the "no backwards-compatibility shims" convention, do not keep old aliases; grep both `e2e/specs` and `e2e/matrix` for `nodePanel\.` to confirm all callers before deleting (`grep -rn "nodePanel\." packages/interview/e2e/specs packages/interview/e2e/matrix`) — Task 7's `NameGeneratorQuickAdd` matrix registry (`e2e/matrix/name-generator-quick-add.scenarios.ts`) uses the old `.panel` getter and single-arg `getNode`/`dragNodeToMainList`, so it is a real caller, not just specs.

- [ ] **Step 1: Rewrite `NodePanelFixture` in `e2e/fixtures/stage-fixture.ts`** — code above. Run `grep -rn "nodePanel\." packages/interview/e2e/specs packages/interview/e2e/matrix` first; update every call site the grep finds in the same commit.
- [ ] **Step 1a: Update `NameGeneratorQuickAdd` matrix call sites** — in `e2e/matrix/name-generator-quick-add.scenarios.ts` (Task 7), migrate every use of the old single-panel API (`.panel`, single-arg `getNode(label)`, single-arg `dragNodeToMainList(label)`) to the new multi-panel API (`getPanel(title)`, `getNode(panelTitle, label)`, `dragNodeToMainList(panelTitle, label)`), in this same commit.

**Option inventory entry**

```ts
// e2e/matrix/option-inventory.ts — add alongside Information
NameGenerator: [
  'type',
  'subject',
  'form',
  'form.title',
  'form.fields[].variable',
  'form.fields[].prompt',
  'form.fields[].hint',
  'form.fields[].showValidationHints',
  'form.fields[].id', // dead: Architect reorder-keying only, never read at runtime
  'codebook: variable.component',
  'codebook: variable.validation',
  'codebook: variable.parameters',
  'codebook: variable.encrypted', // claimed end-to-end by the Anonymisation task's passphrase-flow suite, not here — see notes below
  'codebook: node.icon / node.color / node.shape',
  'prompts',
  'prompts[].id',
  'prompts[].text',
  'prompts[].additionalAttributes',
  'behaviours',
  'behaviours.minNodes',
  'behaviours.maxNodes',
  'panels',
  'panels[].id',
  'panels[].title',
  'panels[].dataSource=existing',
  'panels[].dataSource=asset(external)',
  'panels[].filter', // NameGenerator-specific dataSource-dependent filtering IS exercised here (see scenarios 9-10); if Task 26's shared cross-cutting suite separately claims a generic 'filter' key, that is additive, not a substitute — do not remove this claim
  'label',
  'interviewScript',
  'skipLogic', // claimed by the shared cross-cutting suite (Task 26) — no scenario here
],
```

**Scenario table**

| id                                          | covers                                                                                                                                                                                                                                                                                 | flags             | protocol config                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | interaction                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | functional assertions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `add-node-basic-form`                       | `type`, `subject`, `form`, `form.title`, `form.fields[].variable`, `form.fields[].prompt`, `form.fields[].hint`, `form.fields[].showValidationHints`, `form.fields[].id`, `codebook: variable.validation`, `codebook: node.icon / node.color / node.shape`, `label`, `interviewScript` | `smoke`, `visual` | Person node type (`icon:'add-a-person'`, `color:'node-color-seq-3'`, `shape:{default:'square'}`); Organisation node type (never used, proves scoping); `name` var (`text`, `validation:{required:true,minLength:2}`); addStage `NameGenerator` with `label:'My NG stage'`, `interviewScript:'Ask the participant to name people they discuss things with.'`, `form:{title:'Add a friend'}`, one prompt; `addFormField({variable:nameVar.id, prompt:'What is their name?', hint:'First name is fine', showValidationHints:true})`                                                                                                            | `stage.nameGenerator.openAddForm()`; assert dialog title 'Add a friend'; assert label + hint text visible; `stage.form.fillText(nameVar.id,'A')`, assert `stage.form.getFieldError(nameVar.id)` visible (minLength unmet) and validation-hint checklist shows unmet; `stage.form.fillText(nameVar.id,'Al')`; `stage.nameGenerator.submitForm()`; open stages menu (`page.getByRole('button',{name:'Go to a stage'}).click()`)                                                                                                                                                                           | `protocol.getNetworkState` gains 1 node, `type===personType.id`, `attributes[nameVar.id]==='Al'`; `stage.getNode('Al')` visible with class matching `/outline-node-3/` (color-seq-3) and `/rounded(?!-full)/`-style square radius, not `rounded-full`; Organisation node never appears (`page.getByRole('option',{name:/./}).count()===1`); neither `'My NG stage'` nor the interviewScript text appears inside `main[data-theme-interview]` before opening the menu; after opening the menu, `page.getByText('My NG stage')` IS visible; interviewScript text is NOT visible anywhere (menu included) |
| `node-edit-and-unique-validation`           | `form.fields[].variable`, `codebook: variable.validation`                                                                                                                                                                                                                              | —                 | Person node type; `name` var (`text`, `validation:{required:true,unique:true}`); one-field form, one prompt                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Add 'Bob' via form; click `stage.getNode('Bob')`; assert dialog input has value 'Bob' (`page.getByRole('dialog').getByRole('textbox')` `toHaveValue('Bob')`); open add dialog again, `stage.form.fillText(nameVar.id,'Bob')`, submit                                                                                                                                                                                                                                                                                                                                                                    | First add: network has 1 node named 'Bob'. Second add attempt: dialog stays open, `stage.form.getFieldError(nameVar.id)` visible (uniqueness), network still 1 node. Then click Bob himself, resubmit 'Bob' unchanged: dialog closes, network still 1 node, same `_uid` (currentEntityId exemption)                                                                                                                                                                                                                                                                                                    |
| `number-validation-coercion-and-delete`     | `codebook: variable.validation`                                                                                                                                                                                                                                                        | —                 | Person node type; `age` var (`type:'number'`, `component:'Number'`, `validation:{minValue:0,maxValue:120}`); one-field form                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `stage.nameGenerator.openAddForm()`; `stage.form.fillNumber('age','200')`; submit (blocked); `stage.form.getFieldError('age')` visible; `stage.form.fillNumber('age','30')`; submit (succeeds); then `stage.deleteNode(...)` on the created node via bin drag                                                                                                                                                                                                                                                                                                                                           | First submit: dialog stays open, network 0 nodes. Second: network 1 node, `attributes.age===30` with `typeof attributes.age==='number'` (not `'30'`/string). After `NodeBin` drag-drop: network back to 0 nodes (`deleteNode`, `NameGenerator.tsx:331-339`), main list empty                                                                                                                                                                                                                                                                                                                           |
| `all-field-components-and-parameters`       | `codebook: variable.component`, `codebook: variable.parameters`                                                                                                                                                                                                                        | `slow`            | Person node type with 12 variables/fields: Text, TextArea, Number, RadioGroup (ordinal, default 5 options — triggers no column layout), LikertScale (ordinal, 5 options), CheckboxGroup (categorical, 7 options — triggers `useColumns`), ToggleButtonGroup (categorical, default 4 options), Boolean, Toggle, VisualAnalogScale (`validation:{minValue:0,maxValue:100}`, `parameters:{minLabel:'Not at all',maxLabel:'Extremely'}`), DatePicker (`parameters:{type:'year'}`), RelativeDatePicker (`parameters:{anchor:'2026-07-13',before:30,after:0}`)                                                                                    | Open dialog; `stage.form.fillText`/`fillText` (textarea via same helper: input,textarea selector already covers it)/`fillNumber`/`selectRadio`/`selectLikert`/`selectCheckbox`/`selectToggleButton`/`selectRadio` (Boolean renders `role=radio` Yes/No)/click Toggle's `role=switch`/VAS via `selectLikert`-style slider interaction (use `field.getByRole('slider')` + `press('ArrowRight')` to move off default)/`fillDate` (year picker, `input[type=date]`)/`fillDate` (relative picker, `input[type=date]` within its range); submit                                                               | Store: text/textarea are strings; number field numeric; ordinal (Radio/Likert) values numeric per `DEFAULT_ORDINAL_OPTIONS`; categorical (CheckboxGroup/ToggleButtonGroup) values are **arrays** (`Array.isArray(attributes[...])===true`), boolean fields are `true`/`false` booleans; datetime fields are ISO date strings; VAS field within `[0,100]`; the CheckboxGroup field (7 options) has a rendered field container whose option list includes a wrapping/columns class (implementation detail: assert 7 checkbox options are all visible, i.e. no overflow-hidden truncation)                |
| `multi-prompt-navigation-and-scoping`       | `prompts`, `prompts[].id`, `prompts[].text`                                                                                                                                                                                                                                            | —                 | Person node type; NameGenerator with 2 prompts: `text:'Who do you talk to about important matters?'`, `text:'Who do you turn to for help?'`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Add 'Carol' on prompt 1 (`stage.nameGenerator`); assert `stage.getPrompt(text)` visibility for prompt 1 (Pips, `@codaco/fresco-ui/Pips`, is display-only — `Prompts.tsx:69-74` — it renders no click handler); then click `interview.nextButton` (`page.getByTestId('next-button')`, `interview-fixture.ts:168-170`) directly — NOT `interview.next()`, whose URL-wait would hang since this click advances the prompt, not the stage (`useInterviewNavigation.ts:184-187`: `moveForward` dispatches `updatePrompt(promptIndex + 1)` and returns early when `!isLastPrompt`, without calling `setStep`) | Before advance: `stage.getPrompt('Who do you talk to about important matters?')` visible, aria-live text (`role="status"`, `Prompts.tsx:64-66`) is prompt 1's text, `stage.getNode('Carol')` visible (main list 1 option). After advance: aria-live text is prompt 2's text, main list has 0 options (Carol is prompt-scoped out, `getNetworkNodesForPrompt`), `protocol.getNetworkState` still has Carol with `promptIDs` containing only prompt-1's id; stage does NOT advance — `interview.getCurrentStep()` is unchanged (no `setStep` call on this path)                                          |
| `prompt-additional-attributes`              | `prompts[].additionalAttributes`                                                                                                                                                                                                                                                       | —                 | Person node type; `closeFriend` var (`boolean`, hidden — not on form); NameGenerator form with only `name` field; prompt 1 `additionalAttributes:[{variable: closeFriendVar.id, value:true}]`; prompt 2 no additionalAttributes                                                                                                                                                                                                                                                                                                                                                                                                             | Add 'Dana' on prompt 1; advance to prompt 2; add 'Eve'                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `protocol.getNetworkState`: node named 'Dana' has `attributes[closeFriendVar.id]===true`; node named 'Eve' has the attribute unset/`undefined`                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `min-nodes-behaviour`                       | `behaviours`, `behaviours.minNodes`                                                                                                                                                                                                                                                    | —                 | Person node type; `behaviours:{minNodes:2}`; 1 prompt, 1-field form                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `interview.next()` (attempt to advance with 0 nodes); assert destructive toast text contains 'must create at least' and '2'; assert stage index unchanged; add 2 nodes; `interview.next()` again                                                                                                                                                                                                                                                                                                                                                                                                        | First click: toast visible, `page.url()`/current-stage indicator unchanged (still on the NameGenerator stage — e.g. re-open stages menu and confirm the same stage is marked current, or assert `interview.nextButton` click did not navigate by checking a NameGenerator-only locator like `node-list` is still present). Second click: stage advances (a locator unique to the _next_ stage becomes visible, or `node-list` for this stage disappears)                                                                                                                                               |
| `max-nodes-behaviour`                       | `behaviours.maxNodes`                                                                                                                                                                                                                                                                  | `visual`          | Person node type; `behaviours:{maxNodes:2}`; 1 prompt, 1-field form                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Add 2 nodes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Add button (`page.getByRole('button',{name:'Add a person'})`) has `disabled` attribute and its circle element (`[data-toggle-circle]`) has class `saturate-0`; success toast text contains 'You have completed this task'; `interview.nextButton` gains `animate-pulse-glow` class; clicking the disabled add button does not open a dialog (`page.getByRole('dialog')` stays hidden)                                                                                                                                                                                                                  |
| `existing-panel-round-trip-and-edge-filter` | `panels`, `panels[].id`, `panels[].title`, `panels[].dataSource=existing`, `panels[].filter`                                                                                                                                                                                           | `visual`          | Setup `NameGeneratorQuickAdd` stage (label `'Setup'`, subject Person, `initialNodes:{count:3, promptIndex:0}`, 1 prompt) so 3 nodes are seeded with `promptIDs=[setupPromptId]`; then `NameGenerator` stage with 1 prompt and one panel `{title:'Previous interview', dataSource:'existing', filter:{join:'AND', rules:[{type:'edge', options:{type: colleagueEdgeType.id, operator:'EXISTS'}}]}}`; add a `colleague` edge type; seed one edge (via `addEdges`) between two of the three setup nodes so the edge-filter passes for exactly those 2; `currentStep:1` (index of the NameGenerator stage), `seedNetwork:true`                  | `stage.nodePanel.getNodeCount('Previous interview')` (expect 2, filtered by edge EXISTS, not 3); `stage.nodePanel.dragNodeToMainList('Previous interview', <one of the 2 filtered node labels>)`; then `stage.nodePanel.dragNodeFromMainListToPanel(<label>, 'Previous interview')`                                                                                                                                                                                                                                                                                                                     | Panel shows exactly 2 options pre-drag (edge-aware filtering, `selectors/name-generator.ts:113`); after drag-in: panel count 1, main list 1, `getNetworkState` shows that node's `promptIDs.length===2` (its original setup prompt + this stage's prompt), no new node created (same `_uid`, total node count still 3); after drag back: panel count 2, main list 0, node still exists with `promptIDs.length===1` again (`removeNodeFromPrompt`, not deleted)                                                                                                                                         |
| `external-panel-filtered-round-trip`        | `panels[].dataSource=asset(external)`, `panels[].filter`                                                                                                                                                                                                                               | —                 | Person node type with `name` (text) and `isColleague` (boolean) variables; `NameGenerator` stage, 1 prompt, one panel `{title:'Contacts file', dataSource: contactsAssetId, filter:{join:'AND', rules:[{type:'node', options:{attribute:isColleagueVar.id, operator:'EXACTLY', value:true}}]}}`; `assets: [{assetId: contactsAssetId, name:'contacts', type:'network', source:'contacts.json', localPath: <scratchpad-authored fixture file, 10 nodes, 4 with isColleague:true>}]`, and `synth.addAsset({id: contactsAssetId, name:'contacts', type:'network', source:'contacts.json'})` so the codebook/asset-manifest reference validates | `stage.nodePanel.getNodeCount('Contacts file')` (expect 4, not 10); `stage.nodePanel.dragNodeToMainList('Contacts file', 'Alice')` (one of the 4 seeded as colleague); `stage.nodePanel.dragNodeFromMainListToPanel('Alice', 'Contacts file')`                                                                                                                                                                                                                                                                                                                                                          | Panel shows 4 filtered options; after drag-in: `getNetworkState` gains a new node with `attributes[nameVar.id]==='Alice'`, `attributes[isColleagueVar.id]===true`, `promptIDs.length===1`; panel count 3 (Alice no longer offered); after drag back: node is fully **deleted** (`deleteNode`, contrast with the existing-panel case), network node count back to baseline, panel count 4 again                                                                                                                                                                                                         |
| `external-panel-error-state`                | `panels[].dataSource=asset(external)` (error path)                                                                                                                                                                                                                                     | —                 | `NameGenerator` stage, one panel `{title:'Broken source', dataSource:'unknown-asset-id'}` — an id never registered via `synth.addAsset`/the scenario's `assets` array                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | none beyond landing on the stage                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `stage.nodePanel.getErrorState('Broken source')` visible with heading 'Something went wrong' (`NodePanel.tsx:112-116`); no console error dialog/crash — `page.getByTestId('node-list')` (main list) is still present and functional (add-button still opens a dialog)                                                                                                                                                                                                                                                                                                                                  |

**Fully-coded scenarios**

```ts
// e2e/matrix/name-generator.scenarios.ts (excerpt — 3 most complex scenarios)
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SyntheticInterview } from '@codaco/protocol-utilities';

import { expect } from '../fixtures/matrix-test.js';
import type { InterfaceScenarios } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.resolve(__dirname, '../helpers/fixtures');

export const nameGeneratorScenarios: InterfaceScenarios = {
  interfaceType: 'NameGenerator',
  scenarios: [
    {
      id: 'add-node-basic-form',
      covers: [
        'type',
        'subject',
        'form',
        'form.title',
        'form.fields[].variable',
        'form.fields[].prompt',
        'form.fields[].hint',
        'form.fields[].showValidationHints',
        'form.fields[].id',
        'codebook: variable.validation',
        'codebook: node.icon / node.color / node.shape',
        'label',
        'interviewScript',
      ],
      smoke: true,
      visual: true,
      build: () => {
        const synth = new SyntheticInterview();
        const person = synth.addNodeType({
          name: 'Person',
          icon: 'add-a-person',
          color: 'node-color-seq-3',
          shape: { default: 'square' },
        });
        synth.addNodeType({ name: 'Organisation' }); // never used by this stage
        const nameVar = person.addVariable({
          name: 'name',
          type: 'text',
          component: 'Text',
          validation: { required: true, minLength: 2 },
        });

        const stage = synth.addStage('NameGenerator', {
          label: 'My NG stage',
          subject: { entity: 'node', type: person.id },
          form: { title: 'Add a friend' },
        });
        stage.addFormField({
          variable: nameVar.id,
          prompt: 'What is their name?',
          hint: 'First name is fine',
          showValidationHints: true,
        });
        stage.addPrompt({ text: 'Who do you spend free time with?' });
        return synth;
      },
      run: async ({ page, interview, stage }) => {
        await stage.nameGenerator.openAddForm();
        await expect(
          page.getByRole('dialog', { name: 'Add a friend' }),
        ).toBeVisible();
        await expect(page.getByText('What is their name?')).toBeVisible();
        await expect(page.getByText('First name is fine')).toBeVisible();

        // Below minLength: field error visible, dialog stays open on submit.
        await stage.form.fillText('name', 'A');
        await page.getByRole('button', { name: 'Finished' }).click();
        await expect(stage.form.getFieldError('name')).toBeVisible();
        await expect(page.getByRole('dialog')).toBeVisible();

        // Meets minLength: submit succeeds.
        await stage.form.fillText('name', 'Al');
        await stage.nameGenerator.submitForm();

        const node = stage.getNode('Al');
        await expect(node).toBeVisible();
        await expect(node).toHaveClass(/outline-node-3/);
        await expect(node).not.toHaveClass(/rounded-full/);

        // Only one node exists; Organisation is never offered as a subject.
        await expect(
          page.getByTestId('node-list').getByRole('option'),
        ).toHaveCount(1);

        // Dead/menu-only config: neither string renders in the stage body.
        await expect(page.getByText('My NG stage')).toHaveCount(0);
        await expect(
          page.getByText('Who do you spend free time with?', { exact: false }),
        ).not.toContainText('My NG stage');

        // label DOES render in the stages menu; interviewScript renders nowhere.
        await page.getByRole('button', { name: 'Go to a stage' }).click();
        await expect(page.getByText('My NG stage')).toBeVisible();
      },
    },

    {
      id: 'existing-panel-round-trip-and-edge-filter',
      covers: [
        'panels',
        'panels[].id',
        'panels[].title',
        'panels[].dataSource=existing',
        'panels[].filter',
      ],
      visual: true,
      currentStep: 1,
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        const person = synth.addNodeType({ name: 'Person' });
        const colleague = synth.addEdgeType({ name: 'Colleague' });

        const setup = synth.addStage('NameGeneratorQuickAdd', {
          label: 'Setup',
          subject: { entity: 'node', type: person.id },
          initialNodes: { count: 3, promptIndex: 0 },
        });
        setup.addPrompt({ text: 'Setup prompt' });

        // One edge between the first two setup nodes so the panel's edge
        // EXISTS filter passes for exactly 2 of the 3 seeded nodes.
        synth.addEdges([[0, 1]], colleague.id);

        const ng = synth.addStage('NameGenerator', {
          subject: { entity: 'node', type: person.id },
          form: { title: 'Add a person' },
        });
        ng.addFormField({ component: 'Text', prompt: 'Name' });
        ng.addPrompt({ text: 'Who is on your team?' });
        ng.addPanel({
          title: 'Previous interview',
          dataSource: 'existing',
          filter: {
            join: 'AND',
            rules: [
              {
                type: 'edge',
                options: { type: colleague.id, operator: 'EXISTS' },
              },
            ],
          },
        });

        return synth;
      },
      run: async ({ stage, protocol, interview }) => {
        await expect
          .poll(() => stage.nodePanel.getNodeCount('Previous interview'))
          .toBe(2);

        // Grab one of the two filtered-in nodes by reading the panel's DOM,
        // rather than hardcoding a faker-generated name.
        const panelNode = stage.nodePanel
          .getPanel('Previous interview')
          .getByRole('option')
          .first();
        const label = (await panelNode.textContent())!.trim();

        const before = await protocol.getNetworkState(interview.interviewId);
        const totalNodesBefore = before!.nodes.length;

        await stage.nodePanel.dragNodeToMainList('Previous interview', label);
        await expect
          .poll(() => stage.nodePanel.getNodeCount('Previous interview'))
          .toBe(1);
        await expect(stage.getNode(label)).toBeVisible();

        const afterDragIn = await protocol.getNetworkState(
          interview.interviewId,
        );
        expect(afterDragIn!.nodes.length).toBe(totalNodesBefore); // no new node
        const movedNode = afterDragIn!.nodes.find(
          (n) => n.attributes && Object.values(n.attributes).includes(label),
        );
        expect(movedNode?.promptIDs).toHaveLength(2);

        await stage.nodePanel.dragNodeFromMainListToPanel(
          label,
          'Previous interview',
        );
        await expect
          .poll(() => stage.nodePanel.getNodeCount('Previous interview'))
          .toBe(2);

        const afterDragBack = await protocol.getNetworkState(
          interview.interviewId,
        );
        expect(afterDragBack!.nodes.length).toBe(totalNodesBefore);
        const restoredNode = afterDragBack!.nodes.find(
          (n) => n.attributes && Object.values(n.attributes).includes(label),
        );
        expect(restoredNode?.promptIDs).toHaveLength(1);
      },
    },

    {
      id: 'external-panel-filtered-round-trip',
      covers: ['panels[].dataSource=asset(external)', 'panels[].filter'],
      build: () => {
        const synth = new SyntheticInterview();
        const person = synth.addNodeType({ name: 'Person' });
        const nameVar = person.addVariable({ name: 'name', type: 'text' });
        const isColleagueVar = person.addVariable({
          id: 'is-colleague',
          name: 'isColleague',
          type: 'boolean',
        });

        const assetId = 'contacts-network';
        synth.addAsset({
          id: assetId,
          name: 'contacts',
          type: 'network',
          source: 'contacts.json',
        });

        const ng = synth.addStage('NameGenerator', {
          subject: { entity: 'node', type: person.id },
          form: { title: 'Add a person' },
        });
        ng.addFormField({ variable: nameVar.id, prompt: 'Name' });
        ng.addPrompt({ text: 'Who from your contacts do you see most?' });
        ng.addPanel({
          title: 'Contacts file',
          dataSource: assetId,
          filter: {
            join: 'AND',
            rules: [
              {
                type: 'node',
                options: {
                  attribute: isColleagueVar.id,
                  operator: 'EXACTLY',
                  value: true,
                },
              },
            ],
          },
        });

        return synth;
      },
      assets: [
        {
          assetId: 'contacts-network',
          name: 'contacts',
          type: 'network',
          source: 'contacts.json',
          localPath: path.join(FIXTURES_DIR, 'contacts-network.json'),
        },
      ],
      run: async ({ stage, protocol, interview }) => {
        await expect
          .poll(() => stage.nodePanel.getNodeCount('Contacts file'))
          .toBe(4);

        const before = await protocol.getNetworkState(interview.interviewId);
        const totalNodesBefore = before!.nodes.length;

        await stage.nodePanel.dragNodeToMainList('Contacts file', 'Alice');
        await expect
          .poll(() => stage.nodePanel.getNodeCount('Contacts file'))
          .toBe(3);

        const afterDragIn = await protocol.getNetworkState(
          interview.interviewId,
        );
        expect(afterDragIn!.nodes.length).toBe(totalNodesBefore + 1);
        const alice = afterDragIn!.nodes.find(
          (n) => n.attributes?.[Object.keys(n.attributes)[0]!] === 'Alice',
        );
        expect(alice).toBeDefined();

        await stage.nodePanel.dragNodeFromMainListToPanel(
          'Alice',
          'Contacts file',
        );
        await expect
          .poll(() => stage.nodePanel.getNodeCount('Contacts file'))
          .toBe(4);

        // External drop-back deletes (contrast with the existing-panel case).
        const afterDragBack = await protocol.getNetworkState(
          interview.interviewId,
        );
        expect(afterDragBack!.nodes.length).toBe(totalNodesBefore);
      },
    },

    // ... remaining 8 scenarios follow the Scenario table rows above; each is
    // a single ScenarioDefinition object of the same shape.
  ],
};
```

`contacts-network.json` (create alongside other e2e fixtures, e.g. `e2e/helpers/fixtures/contacts-network.json`) must contain 10 node entries under `{"nodes":[...]}`, each shaped `{"attributes":{"name":"<Name>","isColleague":<bool>}}` (attribute keys may be the codebook variable _names_ — `loadExternalData.ts`'s `makeVariableUUIDReplacer` maps them to the variable ids via `getParentKeyByNameValue`), with exactly 4 entries having `"isColleague": true` and one of those named `"Alice"`.

- [ ] **Step 1: Add `prompts[].additionalAttributes` to the builder** (code in Files section above) — `pnpm --filter @codaco/protocol-utilities typecheck` clean.
- [ ] **Step 2: Rewrite `NodePanelFixture`** in `e2e/fixtures/stage-fixture.ts` (code above), after grepping both `e2e/specs` and `e2e/matrix` for `nodePanel\.` and updating every call site found — including Task 7's `NameGeneratorQuickAdd` matrix registry (`e2e/matrix/name-generator-quick-add.scenarios.ts`), which uses `.panel` / single-arg `getNode` / single-arg `dragNodeToMainList` — in this same commit.
- [ ] **Step 3: Author `contacts-network.json`** fixture (10 nodes, 4 `isColleague:true`, one named `Alice`) under `e2e/helpers/fixtures/`.
- [ ] **Step 4: Write the registry + inventory entry + spec file** — `e2e/matrix/name-generator.scenarios.ts` (11 scenarios per the table, 3 fully coded above), `e2e/matrix/option-inventory.ts` NameGenerator entry, `e2e/specs/matrix/name-generator.spec.ts` (`defineScenarioTests(nameGeneratorScenarios)`), and register the suite in `e2e/matrix/coverage-manifest.test.ts`'s `ALL_SUITES` (and `all-scenarios.ts` if it exists by now).
- [ ] **Step 5: Run the coverage manifest**: `pnpm --filter @codaco/interview exec vitest run e2e/matrix` — Expected: PASS (every `NameGenerator` inventory key, including `codebook: variable.encrypted` and `skipLogic`, is claimed either here or by the Anonymisation/shared-cross-cutting suites — if those tasks haven't landed yet, temporarily this test will report those two keys missing; that is expected and resolves once those tasks land, not a regression to chase in this task).
- [ ] **Step 6: Run the scenarios**: `pnpm --filter @codaco/interview test:e2e:headed -- --project=chromium-matrix --grep "NameGenerator"` — Expected: PASS; commit new `.aria.yml` baselines.
- [ ] **Step 7: Typecheck + commit**:
  ```bash
  pnpm typecheck
  git add packages/interview/e2e
  git commit -m "test(interview-e2e): NameGenerator configuration matrix"
  ```

### Task 9: NameGeneratorRoster matrix scenarios

**Files:**

- Create: `e2e/matrix/name-generator-roster.scenarios.ts`
- Create: `e2e/specs/matrix/name-generator-roster.spec.ts`
- Create: `e2e/fixtures/data/roster-small.json` (6-row JSON roster, reused by 7 scenarios)
- Create: `e2e/fixtures/data/roster-coercion.csv` (4-row CSV with mixed digit-length ages, proves numeric coercion)
- Modify: `e2e/matrix/option-inventory.ts` (add the `NameGeneratorRoster` entry)
- Modify: `e2e/matrix/coverage-manifest.test.ts` (append `nameGeneratorRosterScenarios` to `ALL_SUITES`)
- Modify: `e2e/fixtures/stage-fixture.ts` (implement the empty `NameGeneratorRosterFixture` placeholder at `stage-fixture.ts:1171-1177`)

**Interfaces:**

- Consumes: `ScenarioDefinition`/`InterfaceScenarios`/`defineScenarioTests` (Task 6), `matrixTest`/`ariaSnapshot` (Task 4), `SyntheticAssetSpec` + asset-copy convention (Task 2/6), seeded interviews via `currentStep`/`seedNetwork` (Task 3), `OPTION_INVENTORY` (Task 6), Task 1's `AddPromptInput.additionalAttributes?: { variable: string; value: boolean }[]` (threaded through the shared `resolvePrompt`) and `AddVariableInput.encrypted?: boolean` / `VariableEntry.encrypted?: boolean` (accepted by `addVariableToNodeType`, including its dedupe branch, and emitted by `buildCodebook`'s node variable loop) (Task 1).
- Produces:
  - `nameGeneratorRosterScenarios: InterfaceScenarios` (13 scenarios).
  - `StageFixture.nameGeneratorRoster: NameGeneratorRosterFixture` — fully implemented (see below); consumed only by this suite, but the class/its locators are also the reference pattern for any future roster-shaped Collection interface (none currently planned).

---

## Stage fixture helpers

Replace the placeholder class at `packages/interview/e2e/fixtures/stage-fixture.ts:1171-1177`. Uses the file's existing module-scope `navigateDndToTarget(page, sourceLocator, targetText, maxSteps?)` helper (`stage-fixture.ts:20-70`), which already focuses the source element, sends `Control+d`, presses `ArrowRight` until the DnD live-region announcement contains `targetText`, then presses `Enter` — do not press `Enter` again after calling it.

Locator provenance:

- Source listbox accessible name `'Available Roster Nodes'` — `useDragAndDrop({ announcedName: 'Available Roster Nodes', ... })`, `NameGeneratorRoster.tsx:286`.
- Destination listbox accessible name `'Added Nodes'` — `<NodeList announcedName="Added Nodes" .../>`, `NameGeneratorRoster.tsx:429`.
- Card = the option itself, `aria-label` = card title — `DataCard.tsx:64-73` (`<article aria-label={label}>`), spread with Collection's `role="option"`/`aria-disabled` item props (`fresco-ui/collection/hooks/useSelectableItem.ts:184`, `aria-disabled: isDisabled ? true : undefined`).
- Search box accessible name `'Filter'`, results text `/\d+ results?/` — `CollectionFilterInput` inside `NameGeneratorRoster.tsx:384` (confirmed via `NameGeneratorRoster.stories.tsx:393,404` interaction tests).
- Sort button accessible name `'Sort by {label}'`, `aria-pressed` — `CollectionSortButton`, rendered `NameGeneratorRoster.tsx:389-401` (confirmed via `NameGeneratorRoster.stories.tsx:325`).
- Drop-here-to-remove overlay text `'Drop here to remove'` — `<DropOverlay message="Drop here to remove" />`, `NameGeneratorRoster.tsx:411-417`.
- Empty-search-state text `'Nothing matched your search term.'` — `NameGeneratorRoster.tsx:375`.

```ts
/**
 * Fixture for NameGeneratorRoster stages: a searchable/sortable/filterable
 * roster (left "Available to add" panel) that participants keyboard-drag
 * into a per-prompt Added-Nodes list (right panel). Pointer drag is
 * unreliable in WebKit (setPointerCapture) so all movement goes through the
 * file's `navigateDndToTarget` keyboard-DnD helper.
 */
class NameGeneratorRosterFixture {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /** Left "Available to add" panel (NameGeneratorRoster.tsx:352,377). */
  get sourceListbox(): Locator {
    return this.page.getByRole('listbox', { name: 'Available Roster Nodes' });
  }

  /** Right per-prompt NodeList (NameGeneratorRoster.tsx:422-430). */
  get addedListbox(): Locator {
    return this.page.getByRole('listbox', { name: 'Added Nodes' });
  }

  getRosterNode(label: string): Locator {
    return this.sourceListbox.getByRole('option', { name: label });
  }

  getAddedNode(label: string): Locator {
    return this.addedListbox.getByRole('option', { name: label });
  }

  /**
   * Keyboard-drag a card from the source roster into the Added Nodes list.
   * `navigateDndToTarget` presses Enter once the drop-target announcement
   * matches — do not press it again here.
   */
  async addNode(label: string): Promise<void> {
    const source = this.getRosterNode(label);
    await expect(source).toBeVisible();
    await navigateDndToTarget(this.page, source, 'Added Nodes');
    await expect(this.getAddedNode(label)).toBeVisible();
  }

  /**
   * Keyboard-drag an added node back over the source panel to remove it.
   * The source panel accepts drops from ANY added node (NameGeneratorRoster.tsx:288)
   * and re-shows the card in the source listbox under its original label.
   */
  async removeNode(label: string): Promise<void> {
    const added = this.getAddedNode(label);
    await expect(added).toBeVisible();
    await navigateDndToTarget(this.page, added, 'Available Roster Nodes');
    await expect(this.getRosterNode(label)).toBeVisible();
  }

  /** The "Drop here to remove" overlay shown over the source panel mid-drag
   *  of an added node (NameGeneratorRoster.tsx:409-417). Only visible while a
   *  drag from the Added Nodes list is in flight — see the
   *  `roster-remove-node-round-trip` scenario for how to catch it mid-drag. */
  get dropOverlay(): Locator {
    return this.page.getByText('Drop here to remove');
  }

  get filterInput(): Locator {
    return this.page.getByRole('searchbox', { name: 'Filter' });
  }

  async search(query: string): Promise<void> {
    await this.filterInput.fill(query);
  }

  async clearSearch(): Promise<void> {
    await this.filterInput.fill('');
  }

  /** The "N results" badge CollectionFilterInput renders once a query is active. */
  get resultsBadge(): Locator {
    return this.page.getByText(/^\d+ results?$/);
  }

  get emptyState(): Locator {
    return this.page.getByText('Nothing matched your search term.');
  }

  sortButton(label: string): Locator {
    return this.page.getByRole('button', {
      name: new RegExp(`^Sort by ${label}`),
    });
  }

  async sort(label: string): Promise<void> {
    await this.sortButton(label).click();
  }

  /**
   * Accessible names (card titles) of every card CURRENTLY MOUNTED in the
   * source listbox, in DOM order. The Collection is virtualized, so for
   * large rosters this only reflects the visible + overscan window — only
   * rely on this for small (<= ~10 row) fixtures where every row mounts.
   */
  async sourceLabels(): Promise<string[]> {
    const options = await this.sourceListbox.getByRole('option').all();
    const labels: string[] = [];
    for (const option of options) {
      labels.push((await option.getAttribute('aria-label')) ?? '');
    }
    return labels;
  }
}
```

Wire it into the `StageFixture` constructor exactly as the placeholder already is (no change needed to the constructor line — it already does `this.nameGeneratorRoster = new NameGeneratorRosterFixture(page);`).

---

## Fixture data files

`packages/interview/e2e/fixtures/data/roster-small.json` — deliberately non-alphabetical insertion order (Cara, Amy, Finn, Ben, Drew, Elle) so file-order, name-desc, and `'*'`-desc sorts each produce a distinct sequence; two rows have an empty `location` (proves the DataCard `'—'` empty-value formatter); `closeness` values are chosen so hierarchy order (very-close > close > not-close) differs from alphabetical order:

```json
{
  "nodes": [
    {
      "attributes": {
        "name": "Cara Chen",
        "age": 40,
        "location": "Denver",
        "closeness": "very-close"
      }
    },
    {
      "attributes": {
        "name": "Amy Adams",
        "age": 30,
        "location": "Boston",
        "closeness": "close"
      }
    },
    {
      "attributes": {
        "name": "Finn Frost",
        "age": 18,
        "location": "",
        "closeness": "very-close"
      }
    },
    {
      "attributes": {
        "name": "Ben Brown",
        "age": 25,
        "location": "",
        "closeness": "not-close"
      }
    },
    {
      "attributes": {
        "name": "Drew Diaz",
        "age": 22,
        "location": "Boston",
        "closeness": "close"
      }
    },
    {
      "attributes": {
        "name": "Elle Evans",
        "age": 55,
        "location": "Reno",
        "closeness": "not-close"
      }
    }
  ]
}
```

`packages/interview/e2e/fixtures/data/roster-coercion.csv` — mixed digit-length ages so numeric vs. lexical-string sort produce different orders (lexical would read `"10" < "11" < "2" < "9"`; numeric reads `2 < 9 < 10 < 11`):

```csv
name,age,location
Ivy Nine,9,Salem
Jax Ten,10,Salem
Kim Eleven,11,Salem
Leo Two,2,Salem
```

The CSV scenario also reuses the existing `packages/development-protocol/assets/previousInterview.csv` (`name,nickname,age`, 98 data rows, verified on disk) for the general "does a CSV `dataSource` load and let you add a node" proof — its ages are all two-digit, so it cannot prove numeric coercion by itself, which is why `roster-coercion.csv` exists as a second, dedicated fixture.

---

## Option inventory entry

```ts
// e2e/matrix/option-inventory.ts — add alongside the Information entry
NameGeneratorRoster: [
  'type',
  'id',
  'label',
  'interviewScript',
  'skipLogic', // claimed by the shared cross-cutting suite (Task 26)
  'subject',
  'dataSource',
  'dataSource=csv',
  'dataSource=error',
  'cardOptions',
  'cardOptions.additionalProperties',
  'sortOptions',
  'sortOptions.sortOrder',
  'sortOptions.sortOrder=*',
  'sortOptions.sortableProperties',
  'searchOptions',
  'searchOptions.fuzziness',
  'searchOptions.matchProperties',
  'searchOptions.matchProperties=empty',
  'behaviours',
  'behaviours.minNodes',
  'behaviours.maxNodes',
  'prompts',
  'prompts[].id',
  'prompts[].text',
  'prompts[].additionalAttributes',
  'remove-node-round-trip',
  'encrypted-variable-passphrase-gate',
  'label-fallback-heuristic',
],
```

Add `'NameGeneratorRoster:skipLogic'` to `sharedSuiteClaims` in `e2e/matrix/shared-claims.ts` (that file's initial seed only has `'Information:skipLogic'` — every interface task appends its own).

---

## Scenario table

All 13 scenarios live in one `nameGeneratorRosterScenarios.scenarios` array. `personType` below always means `synth.addNodeType({ name: 'Person' })`; capturing `personType.addVariable({ name: 'name' })` after that returns the auto-seeded "name" variable's ref (dedupe) without creating a duplicate — needed wherever a scenario must know the name variable's UUID for assertions.

| id                                                | covers                                                                                                                                                  | flags             | protocol config                                                                                                                                                                                                                                                                                                                                                                      | interaction                                                                                                                                                                                 | functional assertions                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `roster-add-basic-json`                           | type, id, label, interviewScript, subject, dataSource, cardOptions, cardOptions.additionalProperties, prompts, prompts[].id, prompts[].text, behaviours | `smoke`, `visual` | `roster-small.json`; `cardOptions.additionalProperties: [{label:'Age',variable:'age'},{label:'Location',variable:'location'}]`; stage `label`/`interviewScript` set to distinctive non-participant strings; no `behaviours`                                                                                                                                                          | keyboard-add `'Cara Chen'`                                                                                                                                                                  | 6 options in source listbox; Cara's card `dd` values `'40'`/`'Denver'`; Ben Brown's `location` dd is `'—'`; `label`/`interviewScript` strings absent from the page; `nextButton` enabled with no `behaviours` set; after add, `getNetworkState().nodes[0]` has `type===personType.id`, `attributes[ageVar.id]===40`, `attributes[locationVar.id]==='Denver'`, `promptIDs` length 1 |
| `roster-csv-source-and-numeric-coercion`          | dataSource=csv, sortOptions, sortOptions.sortableProperties                                                                                             | —                 | 2 stages: Stage A `dataSource: 'csvRosterGeneral'` → `previousInterview.csv`, `searchOptions:{fuzziness:0.1, matchProperties:['name']}`; Stage B `dataSource: 'csvRosterCoercion'` → `roster-coercion.csv`, `sortOptions.sortableProperties:[{label:'Age',variable:'age'}]`                                                                                                          | Stage A: search `'Charles'`, add the single match, `interview.next()`; Stage B: click `'Sort by Age'`                                                                                       | Stage A: results badge visible, added node visible; Stage B: `sourceLabels()` equals `['Leo Two','Ivy Nine','Jax Ten','Kim Eleven']` (numeric, not `10,11,2,9` lexical) and the button's `aria-pressed==='true'`                                                                                                                                                                   |
| `roster-dataSource-missing-asset-error`           | dataSource=error                                                                                                                                        | —                 | stage `dataSource: 'does-not-exist'` (never registered in the asset manifest); JSON node type otherwise identical to scenario 1                                                                                                                                                                                                                                                      | none — assert on load                                                                                                                                                                       | `heading('Something went wrong')` and text `'External data could not be loaded.'` visible; `getNetworkState().nodes` is `[]`                                                                                                                                                                                                                                                       |
| `roster-sort-order-omitted-desc-and-insertion`    | sortOptions.sortOrder, sortOptions.sortOrder=\*                                                                                                         | —                 | 3 stages, all `dataSource:'jsonRoster'` (`roster-small.json`): Stage 1 no `sortOptions`; Stage 2 `sortOptions.sortOrder:[{property:'name',direction:'desc'}]`; Stage 3 `sortOptions.sortOrder:[{property:'*',direction:'desc'}]`; `personType` has an ordinal `closeness` var too (unused here, kept for schema parity is NOT needed — omit it; only `age`/`location`/`name` needed) | `interview.next()` between stages                                                                                                                                                           | Stage 1 `sourceLabels()` = file order `['Cara Chen','Amy Adams','Finn Frost','Ben Brown','Drew Diaz','Elle Evans']`; Stage 2 = `['Finn Frost','Elle Evans','Drew Diaz','Cara Chen','Ben Brown','Amy Adams']`; Stage 3 = `['Elle Evans','Drew Diaz','Ben Brown','Finn Frost','Amy Adams','Cara Chen']`                                                                              |
| `roster-sortable-properties-ordinal-hierarchy`    | sortOptions.sortableProperties                                                                                                                          | —                 | `roster-small.json`; `closeness` ordinal var with `options:[{value:'very-close',label:'Very close'},{value:'close',label:'Close'},{value:'not-close',label:'Not close'}]` (hierarchy order ≠ alphabetical); `sortOptions.sortableProperties:[{label:'Closeness',variable:'closeness'},{label:'Name',variable:'name'}]`                                                               | click `'Sort by Closeness'` twice                                                                                                                                                           | after 1st click: button `aria-pressed==='true'` and accessible name matches `/\(ascending\)/`; first two `sourceLabels()` are `{'Cara Chen','Finn Frost'}` (both `very-close`), NOT alphabetically-first `'Amy Adams'`; after 2nd click (`descending`): last two labels are the `very-close` pair                                                                                  |
| `roster-search-presence-and-fuzziness`            | searchOptions, searchOptions.fuzziness                                                                                                                  | —                 | 2 stages on `roster-small.json`: Stage A `searchOptions:{fuzziness:0.4, matchProperties:['name','location']}`; Stage B no `searchOptions`                                                                                                                                                                                                                                            | Stage A: type `'Cara Chen'`; Stage B: none                                                                                                                                                  | Stage A: results badge count `>0` and `<6`, first `sourceLabels()[0]==='Cara Chen'`; Stage B: `stage.nameGeneratorRoster.filterInput` has count 0 (no searchbox rendered at all)                                                                                                                                                                                                   |
| `roster-search-matchProperties-scoping-and-empty` | searchOptions.matchProperties, searchOptions.matchProperties=empty                                                                                      | —                 | 2 stages on `roster-small.json`: Stage A `matchProperties:['location']`; Stage B `matchProperties:[]`                                                                                                                                                                                                                                                                                | Stage A: type `'Drew'` (exists only in the `name` column); Stage B: type `'Cara'`                                                                                                           | Stage A: `emptyState` visible (0 results — proves search is scoped to `location` only); Stage B: searchbox still renders (`filterInput` visible) but `emptyState` is ALSO visible for a query that matches a real name — proves empty `matchProperties` yields zero filter keys                                                                                                    |
| `roster-behaviours-min-nodes`                     | behaviours.minNodes                                                                                                                                     | —                 | `behaviours:{minNodes:2}`, single prompt, `roster-small.json`                                                                                                                                                                                                                                                                                                                        | add 1 node, click `interview.nextButton`; add a 2nd node, click again                                                                                                                       | after 1st click: destructive toast text `/You must create at least\s*2\s*items? before you can continue\./` visible, `stage.getPrompt()` for the roster stage still visible (no navigation); after 2nd click: roster panel (`'Available to add'` heading) no longer visible — navigation advanced                                                                                  |
| `roster-behaviours-max-nodes`                     | behaviours.maxNodes                                                                                                                                     | `visual`          | `behaviours:{maxNodes:2}`, `roster-small.json`                                                                                                                                                                                                                                                                                                                                       | add 2 nodes                                                                                                                                                                                 | success toast text `'You have completed this task. Click the next arrow to continue.'` visible; every remaining source option has `aria-disabled="true"`; remove 1 node → toast disappears and remaining options no longer have `aria-disabled`                                                                                                                                    |
| `roster-multiple-prompts-additional-attributes`   | prompts, prompts[].text, prompts[].additionalAttributes                                                                                                 | —                 | 2 prompts on `roster-small.json`; prompt 1 `additionalAttributes:[{variable: verifiedVar.id, value:true}]`; prompt 2 none                                                                                                                                                                                                                                                            | add `'Cara Chen'` under prompt 1, `interview.next()`, add `'Amy Adams'` under prompt 2                                                                                                      | `[data-active]` pip count `===2`; on prompt 2 the Added-Nodes listbox has 0 options AND Cara's card is absent from the source listbox too (network-wide exclusion, `getRosterNode('Cara Chen')` count 0); `getNetworkState()`: Cara's node has `attributes[verifiedVar.id]===true`, Amy's has that key `undefined`; the two nodes' `promptIDs` are unequal 1-element arrays        |
| `roster-remove-node-round-trip`                   | remove-node-round-trip                                                                                                                                  | —                 | single stage, `roster-small.json`, no `behaviours`                                                                                                                                                                                                                                                                                                                                   | add `'Cara Chen'`; manually replay the first 2 steps of `removeNode` (focus + `Control+d` + one `ArrowRight`, WITHOUT pressing Enter yet) to catch the overlay mid-drag, then press `Enter` | mid-drag: `stage.nameGeneratorRoster.dropOverlay` (`'Drop here to remove'`) visible; after drop: `getNetworkState().nodes` is `[]`; `getRosterNode('Cara Chen')` visible again in the source listbox with its original `aria-label`                                                                                                                                                |
| `roster-encrypted-variable-passphrase-gate`       | encrypted-variable-passphrase-gate                                                                                                                      | —                 | `roster-small.json`; the auto-seeded `name` variable redeclared with `encrypted: true`                                                                                                                                                                                                                                                                                               | click the 🔑 passphrase button, fill + submit a passphrase, then add `'Cara Chen'`                                                                                                          | before passphrase: first source option has `aria-disabled="true"`; after passphrase submit + dialog closes: no `aria-disabled` on cards; after add: `getNetworkState().nodes[0][entitySecureAttributesMeta]` is defined and `attributes[nameVar.id] !== 'Cara Chen'` (encrypted, not plaintext)                                                                                    |
| `roster-label-fallback-heuristic`                 | label-fallback-heuristic                                                                                                                                | —                 | inline `data:application/json;base64,...` roster (mirrors `NameGeneratorRoster.stories.tsx`'s `PreviewExportUuidMismatch`): 2 rows keyed by codebook-absent UUIDs (`'Alice Smith'`,`'Bob Jones'`) + 1 row with empty `attributes`                                                                                                                                                    | none — assert on load                                                                                                                                                                       | `sourceLabels()` includes `'Alice Smith'` and `'Bob Jones'` (first-usable-value heuristic, not the `_uid` hash); the empty-attributes row's card `aria-label` is `'Unnamed Person 3'`                                                                                                                                                                                              |

---

## Fully-coded scenarios

### 1. `roster-add-basic-json` (the suite's only `smoke` scenario)

```ts
import path from 'node:path';

import { entityAttributesProperty } from '@codaco/shared-consts';

let basicJsonPersonTypeId = '';
let basicJsonAgeVarId = '';
let basicJsonLocationVarId = '';

// inside nameGeneratorRosterScenarios.scenarios:
{
  id: 'roster-add-basic-json',
  covers: [
    'type',
    'id',
    'label',
    'interviewScript',
    'subject',
    'dataSource',
    'cardOptions',
    'cardOptions.additionalProperties',
    'prompts',
    'prompts[].id',
    'prompts[].text',
    'behaviours',
  ],
  smoke: true,
  visual: true,
  build: () => {
    const synth = new SyntheticInterview();
    const personType = synth.addNodeType({ name: 'Person' });
    const ageVar = personType.addVariable({ name: 'age', type: 'number' });
    const locationVar = personType.addVariable({
      name: 'location',
      type: 'text',
    });
    basicJsonPersonTypeId = personType.id;
    basicJsonAgeVarId = ageVar.id;
    basicJsonLocationVarId = locationVar.id;

    synth.addAsset({
      id: 'jsonRosterBasic',
      name: 'JSON Roster',
      type: 'network',
      source: 'roster-small.json',
    });

    const stage = synth.addStage('NameGeneratorRoster', {
      label: 'Add Roster Contacts Basic Smoke Stage',
      interviewScript: 'Smoke-test interview script marker text',
      subject: { entity: 'node', type: personType.id },
      dataSource: 'jsonRosterBasic',
      cardOptions: {
        additionalProperties: [
          { label: 'Age', variable: 'age' },
          { label: 'Location', variable: 'location' },
        ],
      },
    });
    stage.addPrompt({ text: 'Please add anyone you recognise.' });

    return synth;
  },
  assets: [
    {
      assetId: 'jsonRosterBasic',
      name: 'JSON Roster',
      type: 'network',
      source: 'roster-small.json',
      localPath: path.resolve(
        import.meta.dirname,
        '../fixtures/data/roster-small.json',
      ),
    },
  ],
  run: async ({ page, stage, interview, protocol }) => {
    await expect(
      stage.nameGeneratorRoster.sourceListbox.getByRole('option'),
    ).toHaveCount(6);

    const caraCard = stage.nameGeneratorRoster.getRosterNode('Cara Chen');
    await expect(caraCard.getByText('40', { exact: true })).toBeVisible();
    await expect(caraCard.getByText('Denver', { exact: true })).toBeVisible();

    // Ben Brown's location is '' in roster-small.json — DataCard's
    // formatValue renders empty/undefined values as '—' (DataCard.tsx:18).
    const benCard = stage.nameGeneratorRoster.getRosterNode('Ben Brown');
    await expect(benCard.getByText('—', { exact: true })).toBeVisible();

    // Stage label/interviewScript are authoring/navigation metadata, never
    // rendered as participant-visible copy.
    await expect(
      page.getByText('Add Roster Contacts Basic Smoke Stage', {
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      page.getByText('Smoke-test interview script marker text', {
        exact: true,
      }),
    ).toHaveCount(0);

    await expect(interview.nextButton).toBeEnabled();

    await stage.nameGeneratorRoster.addNode('Cara Chen');

    const state = await protocol.getNetworkState(interview.interviewId!);
    const cara = state!.nodes[0]!;
    expect(cara.type).toBe(basicJsonPersonTypeId);
    expect(cara[entityAttributesProperty][basicJsonAgeVarId]).toBe(40);
    expect(cara[entityAttributesProperty][basicJsonLocationVarId]).toBe(
      'Denver',
    );
    expect(cara.promptIDs).toHaveLength(1);
  },
},
```

### 2. `roster-csv-source-and-numeric-coercion`

```ts
import path from 'node:path';

import {
  entityAttributesProperty,
} from '@codaco/shared-consts';

// inside nameGeneratorRosterScenarios.scenarios:
{
  id: 'roster-csv-source-and-numeric-coercion',
  covers: ['dataSource=csv', 'sortOptions', 'sortOptions.sortableProperties'],
  build: () => {
    const synth = new SyntheticInterview();

    // Stage A: general CSV load + add, using the shared development-protocol
    // fixture (previousInterview.csv: name,nickname,age — 98 data rows, all
    // two-digit ages, so it CANNOT prove numeric coercion by itself; that is
    // what Stage B's dedicated fixture is for).
    const personTypeA = synth.addNodeType({ name: 'Person' });
    personTypeA.addVariable({ name: 'nickname', type: 'text' });
    personTypeA.addVariable({ name: 'age', type: 'number' });
    synth.addAsset({
      id: 'csvRosterGeneral',
      name: 'Previous Interview CSV',
      type: 'network',
      source: 'previousInterview.csv',
    });
    const stageA = synth.addStage('NameGeneratorRoster', {
      label: 'CSV general load',
      subject: { entity: 'node', type: personTypeA.id },
      dataSource: 'csvRosterGeneral',
      searchOptions: { fuzziness: 0.1, matchProperties: ['name'] },
    });
    stageA.addPrompt({ text: 'Stage A: pick a person from the CSV roster.' });

    // Stage B: dedicated coercion-proof CSV with mixed digit-length ages.
    const personTypeB = synth.addNodeType({ name: 'PersonB' });
    personTypeB.addVariable({ name: 'age', type: 'number' });
    personTypeB.addVariable({ name: 'location', type: 'text' });
    synth.addAsset({
      id: 'csvRosterCoercion',
      name: 'Coercion CSV',
      type: 'network',
      source: 'roster-coercion.csv',
    });
    const stageB = synth.addStage('NameGeneratorRoster', {
      label: 'CSV coercion',
      subject: { entity: 'node', type: personTypeB.id },
      dataSource: 'csvRosterCoercion',
      sortOptions: {
        sortableProperties: [{ label: 'Age', variable: 'age' }],
      },
    });
    stageB.addPrompt({
      text: 'Stage B: sort by age proves numeric coercion.',
    });

    return synth;
  },
  assets: [
    {
      assetId: 'csvRosterGeneral',
      name: 'Previous Interview CSV',
      type: 'network',
      source: 'previousInterview.csv',
      localPath: path.resolve(
        import.meta.dirname,
        '../../../development-protocol/assets/previousInterview.csv',
      ),
    },
    {
      assetId: 'csvRosterCoercion',
      name: 'Coercion CSV',
      type: 'network',
      source: 'roster-coercion.csv',
      localPath: path.resolve(
        import.meta.dirname,
        '../fixtures/data/roster-coercion.csv',
      ),
    },
  ],
  run: async ({ page, stage, interview }) => {
    // Stage A: narrow the 98-row CSV to one match via search, then add it —
    // avoids asserting exact counts against a virtualized list.
    await stage.nameGeneratorRoster.search('Charles');
    await expect(stage.nameGeneratorRoster.resultsBadge).toBeVisible();
    await stage.nameGeneratorRoster.addNode('Charles');
    await expect(stage.nameGeneratorRoster.getAddedNode('Charles')).toBeVisible();

    await interview.next();

    // Stage B: sort by Age. If the CSV strings "9"/"10"/"11"/"2" were
    // compared lexically instead of numerically, the order would read
    // 10, 11, 2, 9.
    await expect(stage.getPrompt(/Stage B/)).toBeVisible();
    await stage.nameGeneratorRoster.sort('Age');
    await expect
      .poll(() => stage.nameGeneratorRoster.sourceLabels())
      .toEqual(['Leo Two', 'Ivy Nine', 'Jax Ten', 'Kim Eleven']);

    await expect(stage.nameGeneratorRoster.sortButton('Age')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  },
},
```

### 3. `roster-multiple-prompts-additional-attributes`

```ts
{
  id: 'roster-multiple-prompts-additional-attributes',
  covers: ['prompts', 'prompts[].text', 'prompts[].additionalAttributes'],
  build: () => {
    const synth = new SyntheticInterview();
    const personType = synth.addNodeType({ name: 'Person' });
    // Dedupes to the auto-seeded "name" text variable — captures its id for
    // assertions below without creating a duplicate variable.
    const nameVar = personType.addVariable({ name: 'name' });
    const verifiedVar = personType.addVariable({
      name: 'verified',
      type: 'boolean',
    });
    synth.addAsset({
      id: 'jsonRoster',
      name: 'JSON Roster',
      type: 'network',
      source: 'roster-small.json',
    });

    const stage = synth.addStage('NameGeneratorRoster', {
      label: 'Multi-prompt roster',
      subject: { entity: 'node', type: personType.id },
      dataSource: 'jsonRoster',
    });
    stage.addPrompt({
      text: 'Prompt 1 of 2: people you have met in person.',
      additionalAttributes: [{ variable: verifiedVar.id, value: true }],
    });
    stage.addPrompt({ text: 'Prompt 2 of 2: people you only know online.' });

    return synth;
  },
  assets: [
    {
      assetId: 'jsonRoster',
      name: 'JSON Roster',
      type: 'network',
      source: 'roster-small.json',
      localPath: path.resolve(
        import.meta.dirname,
        '../fixtures/data/roster-small.json',
      ),
    },
  ],
  run: async ({ page, stage, interview, protocol }) => {
    await expect(stage.getPrompt(/Prompt 1 of 2/)).toBeVisible();
    // Pips: total pip count === prompt count, aria-hidden so read via CSS.
    await expect(page.locator('[data-active]')).toHaveCount(2);

    await stage.nameGeneratorRoster.addNode('Cara Chen');
    await interview.next();

    await expect(stage.getPrompt(/Prompt 2 of 2/)).toBeVisible();
    // Per-prompt NodeList is empty on prompt 2 (promptIDs filter)...
    await expect(
      stage.nameGeneratorRoster.addedListbox.getByRole('option'),
    ).toHaveCount(0);
    // ...while the network-wide source panel STILL excludes the node added
    // under prompt 1 — an asymmetric behaviour worth an explicit seam test.
    await expect(
      stage.nameGeneratorRoster.getRosterNode('Cara Chen'),
    ).toHaveCount(0);

    await stage.nameGeneratorRoster.addNode('Amy Adams');

    const state = await protocol.getNetworkState(interview.interviewId!);
    const cara = state!.nodes.find(
      (n) => n[entityAttributesProperty][nameVar.id] === 'Cara Chen',
    );
    const amy = state!.nodes.find(
      (n) => n[entityAttributesProperty][nameVar.id] === 'Amy Adams',
    );
    expect(cara?.[entityAttributesProperty][verifiedVar.id]).toBe(true);
    expect(cara?.promptIDs).toHaveLength(1);
    expect(amy?.[entityAttributesProperty][verifiedVar.id]).toBeUndefined();
    expect(amy?.promptIDs).toHaveLength(1);
    expect(cara?.promptIDs).not.toEqual(amy?.promptIDs);
  },
},
```

### 4. `roster-encrypted-variable-passphrase-gate`

```ts
import {
  entityAttributesProperty,
  entitySecureAttributesMeta,
} from '@codaco/shared-consts';

let encryptedNameVarId = '';

{
  id: 'roster-encrypted-variable-passphrase-gate',
  covers: ['encrypted-variable-passphrase-gate'],
  build: () => {
    const synth = new SyntheticInterview();
    const personType = synth.addNodeType({ name: 'Person' });
    // Redeclaring the auto-seeded "name" variable with encrypted:true mutates
    // its existing codebook entry — see the addVariableToNodeType diff above.
    const nameVar = personType.addVariable({
      name: 'name',
      type: 'text',
      encrypted: true,
    });
    encryptedNameVarId = nameVar.id;
    synth.addAsset({
      id: 'jsonRoster',
      name: 'JSON Roster',
      type: 'network',
      source: 'roster-small.json',
    });

    const stage = synth.addStage('NameGeneratorRoster', {
      label: 'Encrypted names',
      subject: { entity: 'node', type: personType.id },
      dataSource: 'jsonRoster',
    });
    stage.addPrompt({ text: 'Please add anyone you recognise.' });

    return synth;
  },
  assets: [
    {
      assetId: 'jsonRoster',
      name: 'JSON Roster',
      type: 'network',
      source: 'roster-small.json',
      localPath: path.resolve(
        import.meta.dirname,
        '../fixtures/data/roster-small.json',
      ),
    },
  ],
  run: async ({ page, stage, interview, protocol }) => {
    // Cards are disabled until a passphrase is provided
    // (NameGeneratorRoster.tsx:254-267, `disabled` includes `!passphrase && useEncryption`).
    await expect(
      stage.nameGeneratorRoster.sourceListbox.getByRole('option').first(),
    ).toHaveAttribute('aria-disabled', 'true');

    const lockButton = page.getByRole('button', { name: '🔑' });
    await expect(lockButton).toBeVisible();
    await lockButton.click();

    await page.getByLabel('Passphrase').fill('correct horse battery staple');
    await page.getByRole('button', { name: 'Submit passphrase' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();

    await expect(
      stage.nameGeneratorRoster.sourceListbox.getByRole('option').first(),
    ).not.toHaveAttribute('aria-disabled', 'true');

    await stage.nameGeneratorRoster.addNode('Cara Chen');

    const state = await protocol.getNetworkState(interview.interviewId!);
    const node = state!.nodes[0]!;
    expect(node[entitySecureAttributesMeta]).toBeDefined();
    // The plaintext name must NOT be present in the stored attribute once
    // encrypted (session.ts:211-224 replaces it with encryptedAttributes).
    expect(node[entityAttributesProperty][encryptedNameVarId]).not.toBe(
      'Cara Chen',
    );
  },
},
```

This module-scoped `let` pattern (declared above the object literal, reassigned in `build()`, read in `run()`) is the correct approach any time a scenario's assertions need a codebook ref that `build()` creates — apply the same pattern to `roster-multiple-prompts-additional-attributes` above (its code block shows the refs captured via ordinary local `const`s only for prose brevity; in the real file that scenario is its own object literal and must hoist `nameVar`/`verifiedVar` to a `let` above it, exactly as shown here — `roster-add-basic-json` above already does this correctly).

---

Remaining scenarios (`roster-dataSource-missing-asset-error`, `roster-sort-order-omitted-desc-and-insertion`, `roster-sortable-properties-ordinal-hierarchy`, `roster-search-presence-and-fuzziness`, `roster-search-matchProperties-scoping-and-empty`, `roster-behaviours-min-nodes`, `roster-behaviours-max-nodes`, `roster-remove-node-round-trip`, `roster-label-fallback-heuristic`) are implemented 1:1 from their table rows.

- [ ] **Step 1: Write the stage-fixture helpers**

Replace the `NameGeneratorRosterFixture` placeholder body in `packages/interview/e2e/fixtures/stage-fixture.ts` with the class shown above. No constructor/field wiring changes needed elsewhere in the file.

- [ ] **Step 2: Add the fixture data files**

Create `packages/interview/e2e/fixtures/data/roster-small.json` and `packages/interview/e2e/fixtures/data/roster-coercion.csv` with the exact contents given above.

- [ ] **Step 3: Write the registry + inventory entry + spec file**

Write `e2e/matrix/name-generator-roster.scenarios.ts` (13 scenarios per the table, following the Information exemplar's shape — `import { SyntheticInterview } from '@codaco/protocol-utilities'`, `import { expect } from '../fixtures/matrix-test.js'`, `import type { InterfaceScenarios } from './types.js'`), `e2e/specs/matrix/name-generator-roster.spec.ts` (two lines, mirrors Information's), add the `NameGeneratorRoster` entry to `e2e/matrix/option-inventory.ts`, append `nameGeneratorRosterScenarios` to `ALL_SUITES` in `e2e/matrix/coverage-manifest.test.ts`, and add `'NameGeneratorRoster:skipLogic'` to `e2e/matrix/shared-claims.ts`.

- [ ] **Step 4: Run the coverage manifest**: `pnpm --filter @codaco/interview exec vitest run e2e/matrix` — Expected: PASS (all 29 `NameGeneratorRoster` inventory keys claimed, 13 unique scenario ids).

- [ ] **Step 5: Run the scenarios**: `pnpm --filter @codaco/interview test:e2e:headed -- --project=chromium-matrix --grep "NameGeneratorRoster"` — Expected: PASS; commit the new `e2e/aria-snapshots/chromium/*.aria.yml` baselines for all 13 scenarios plus the 2 visual-flagged pixel baselines under `chromium-visual`.

- [ ] **Step 6: Typecheck and commit**

Run: `pnpm typecheck` then `pnpm knip` — Expected: clean.

```bash
git add packages/interview/e2e
git commit -m "test(interview-e2e): NameGeneratorRoster configuration matrix"
```

### Task 10: EgoForm matrix scenarios

**Files:**

- Create: `e2e/matrix/ego-form.scenarios.ts`
- Create: `e2e/specs/matrix/ego-form.spec.ts`
- Modify: `e2e/matrix/option-inventory.ts` (add the `EgoForm` entry — full code below)
- Modify: `e2e/matrix/coverage-manifest.test.ts` (append `import { egoFormScenarios } from './ego-form.scenarios.js';` and add `egoFormScenarios` to the `ALL_SUITES` array) / `e2e/matrix/all-scenarios.ts` if it exists by the time this task runs (append the same import+push)
- Modify (dependency gap, see callout below): `packages/protocol-utilities/src/SyntheticInterview.ts` — add `setEgoAttribute`, **only if** it is not already present from an earlier task (Task 1/2/3). Check first; do not duplicate.

No stage-fixture work is assigned to this task — every interaction is expressed with raw `page` locators plus the already-existing `interview.nextButton` / `interview.next()` / `interview.nextButtonHasPulse()` (`e2e/fixtures/interview-fixture.ts:168-206`) and `protocol.getNetworkState()` / `protocol.waitForEgoAttribute()` (`e2e/fixtures/protocol-fixture.ts:196-199,230-251`).

**Interfaces:**

- Consumes: `ScenarioDefinition`/`InterfaceScenarios`/`defineScenarioTests` (Task 6), `AddFormFieldOpts` extended with `hint`/`showValidationHints`/`parameters`/`options` on `EgoFormHandle.addFormField` (Task 1 — see dependency callout below), seeded interviews (Task 3), `matrixTest`/`ariaSnapshot` (Task 4).
- **Builder dependency gap found while researching this task** (not covered by any task's stated scope): `SyntheticInterview.getNetwork()` currently hard-codes `ego: { [entityAttributesProperty]: {} }` (`packages/protocol-utilities/src/SyntheticInterview.ts:1525-1529`) and there is no `setEgoAttribute` method (only `setNodeAttribute`/`setEdgeAttribute` exist, lines 1753-1780). The pre-population scenario below needs one. Add, mirroring `setNodeAttribute` exactly:

  ```ts
  // packages/protocol-utilities/src/SyntheticInterview.ts
  private egoExplicitAttributes: Record<string, unknown> = {};

  /**
   * Set an explicit ego attribute value, applied by getNetwork() below.
   * Mirrors setNodeAttribute/setEdgeAttribute for the ego entity, which has
   * no array of instances to index into.
   */
  setEgoAttribute(variableId: string, value: unknown): void {
    this.egoExplicitAttributes[variableId] = value;
  }
  ```

  and in `getNetwork()` (line ~1525-1529) change:

  ```ts
      ego: {
        [entityPrimaryKeyProperty]: `ego-${this.seed}`,
        [entityAttributesProperty]: { ...this.egoExplicitAttributes },
      },
  ```

  Run `pnpm --filter @codaco/protocol-utilities typecheck` after this edit before continuing. If a later-numbered task in this plan (Task 1/2/3) already added equivalent ego-seeding support by the time Task 10 executes, skip this step entirely — do not add a second mechanism.

- Produces: `egoFormScenarios: InterfaceScenarios`.

**Option inventory entry**

```ts
// e2e/matrix/option-inventory.ts (add this entry to OPTION_INVENTORY)
  EgoForm: [
    'introductionPanel.title',
    'introductionPanel.text',
    'form.fields-ordering-and-prompt',
    'form.fields[].hint',
    'form.fields[].showValidationHints',
    'form.fields[].id', // dead: Architect reorder key only, ignored at runtime
    'component=Text',
    'component=TextArea',
    'component=Number',
    'component=VisualAnalogScale',
    'component=Boolean',
    'component=Toggle',
    'component=RadioGroup',
    'component=LikertScale',
    'component=CheckboxGroup',
    'component=ToggleButtonGroup',
    'component=DatePicker',
    'DatePicker.parameters(type/min/max)',
    'component=RelativeDatePicker',
    'RelativeDatePicker.parameters(anchor/before/after)-range-validation',
    'egoVariable.readOnly', // dead: Architect editors only
    'egoVariable.name-fallback-label', // dead: prompt is required, name fallback unreachable
    'RadioGroup-auto-columns->6-options',
    'Boolean-custom-options',
    'Boolean-options[].negative', // dead: Boolean.tsx never reads it
    'validation.required',
    'validation.requiredAcceptsNull', // dead: declared, consumed nowhere
    'validation.minLength/maxLength',
    'validation.minValue/maxValue',
    'validation.minSelected/maxSelected',
    'validation.sameAs',
    'validation.differentFrom',
    'validation.greaterThanVariable-family',
    'showValidationHints-summary',
    'pre-population-from-ego-attributes',
    'backwards-nav-discard-and-autosubmit',
    'ready-for-next-pulse',
    'scroll-nudge-15s-inactivity',
    'label', // dead: author-facing only, never rendered
    'interviewScript', // dead: author-facing only, never rendered
    'skipLogic', // claimed by the shared cross-cutting suite (Task 26) — do NOT add a scenario
  ],
```

**Builder-level negative notes (NOT e2e scenarios — schema-rejected on ego, per task instructions):**

- `validation.unique` on an ego variable is rejected by `EgoVariablesSchema`'s `rejectEgoUnique` (`packages/protocol-validation/src/schemas/8/variables/variable.ts:330-345,377-381`). Not added to `OPTION_INVENTORY` at all — there is no valid EgoForm protocol to build. If a protocol-validation unit test wants to assert this, it belongs in that package's own test suite (`schema.safeParse({...unique:true...}).success === false`), not in this e2e matrix.
- `egoVariable.encrypted` is rejected the same way (`rejectEncrypted('Ego')`, same file lines 314-326,377-381). Same treatment — excluded from the inventory, not an e2e scenario.

**Scenario table**

| id                                     | covers                                                                                                                                         | flags               | protocol config                                                                                                                                                                                                                                                            | interaction                                                                                                                       | functional assertions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `intro-panel-and-field-structure`      | introductionPanel.title, introductionPanel.text, form.fields-ordering-and-prompt, form.fields[].hint, form.fields[].id, label, interviewScript | `smoke`, `visual`   | `synth.addStage('EgoForm', { label: 'INTERNAL LABEL', interviewScript: 'SCRIPT TEXT', introductionPanel: { title: 'About You', text: '## Section\n- item one' } })`; 3 fields: Text prompt `'Name?'` hint `'Legal name'`, Number prompt `'Age?'`, Toggle prompt `'Alone?'` | none (assert on mount)                                                                                                            | `getByRole('heading',{level:1,name:'About You'})` visible; `getByRole('heading',{name:'Section'})` + `getByRole('listitem',{name:'item one'})` visible (real elements, not `##`/`-` text) (EgoForm.tsx:215-218); field container order via `page.locator('div.group')` text content equals `['Name?','Age?','Alone?']` in DOM order (BaseField.tsx:62-83); hint text `'Legal name'` visible inside the first container (BaseField.tsx:84-89); `getByText('INTERNAL LABEL')` and `getByText('SCRIPT TEXT')` both `toHaveCount(0)` (base.ts:10-17 intent)                                                                                    |
| `field-mega-all-components`            | component=Text..RelativeDatePicker (12 keys), DatePicker.parameters, egoVariable.readOnly, egoVariable.name-fallback-label                     | `visual`            | One EgoForm stage, 12 `addFormField` calls, one per component (see fully-coded scenario below)                                                                                                                                                                             | fill/select every field, click Next                                                                                               | `protocol.getNetworkState()` ego attributes match each typed/selected value exactly (types: string/number/boolean/string-or-number/array per component); code comment documents `readOnly`/name-fallback as dead, unexercised by design                                                                                                                                                                                                                                                                                                                                                                                                    |
| `options-configuration`                | RadioGroup-auto-columns->6-options, Boolean-custom-options, Boolean-options[].negative                                                         | —                   | One EgoForm stage: RadioGroup ordinal field with 7 options; Boolean field `options:[{label:'Sure',value:true},{label:'Nope',value:false,negative:true}]`                                                                                                                   | click 4th radio option; click `'Nope'` Boolean card; Next                                                                         | RadioGroup options container has the columns class (`useColumns` triggers at >6 per `useProtocolForm.tsx:268-276`) — assert via `page.locator('div.group',{hasText:'...'}).locator('[class*=grid-cols]')` or simply assert 7 `role=radio` elements render and DOM doesn't error; ego attrs: radio value === 4th option value (not array); boolean === false; `data-value="true"`/`"false"` present on the two Boolean cards (Boolean.tsx:221); no visual/DOM difference attributable to `negative` — documented via comment, no separate assertion needed since `BooleanOption` type has no `negative` field to render (Boolean.tsx:20-23) |
| `required-validation-and-pulse`        | validation.required, ready-for-next-pulse, validation.requiredAcceptsNull                                                                      | —                   | 3 fields: required Text `'Name?'`, optional Number `'Age?'`, optional Toggle `'Alone?'`                                                                                                                                                                                    | assert pulse false; click Next with all empty (blocked); fill required field; assert pulse true; click Next (advances)            | `interview.nextButtonHasPulse()` is `false` before fill; after empty-submit attempt, `getCurrentStep` (via URL) unchanged, an error message renders on the Text field's container, and focus moves to its control (`focusFirstError`, EgoForm.tsx:160-165); after filling, `nextButtonHasPulse()` is `true`; after Next, URL step increments and ego attribute persists; `requiredAcceptsNull` claimed via code comment — no schema key exists to attach it to a variable, so it cannot be exercised, only documented (validation.ts:7)                                                                                                    |
| `length-validation`                    | validation.minLength/maxLength                                                                                                                 | —                   | Text field `validation:{minLength:3,maxLength:5}`                                                                                                                                                                                                                          | type `'ab'`, Next (blocked); clear, type `'abcdef'`, Next (blocked); clear, type `'abcd'`, Next (advances)                        | each blocked attempt shows a length error in the field's error region and step does not change; final ego attribute === `'abcd'`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `numeric-range-validation`             | validation.minValue/maxValue                                                                                                                   | —                   | Number field `validation:{minValue:0,maxValue:120}`                                                                                                                                                                                                                        | type `'150'`, Next (blocked); clear, type `'35'`, Next (advances)                                                                 | blocked attempt shows a max error, step unchanged; final ego attribute === `35` (number, not string)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `selection-count-validation`           | validation.minSelected/maxSelected                                                                                                             | —                   | CheckboxGroup categorical field, 4 options, `validation:{minSelected:1,maxSelected:2}`                                                                                                                                                                                     | select 0, Next (blocked); select 3rd box (3 selected), Next (blocked); uncheck one (2 selected), Next (advances)                  | both blocked attempts show a selection-count error, step unchanged; final ego attribute deep-equals the 2 remaining option values as an array                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `cross-field-equality-validation`      | validation.sameAs, validation.differentFrom                                                                                                    | —                   | 3 text fields via explicit `addEgoVariable` + `addFormField({variable: ref.id, ...})`: `email` (required), `emailConfirm` (`validation:{sameAs: emailVar.id}`), `nickname` (`validation:{differentFrom: emailVar.id}`)                                                     | type mismatched confirm + nickname equal to email, Next (blocked); fix confirm to match, fix nickname to differ, Next (advances)  | blocked attempt shows both a `sameAs` error on confirm and a `differentFrom` error on nickname (useProtocolForm.tsx:233-236); step unchanged; after fixing, all three ego attributes persist with their final values                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `cross-field-comparison-validation`    | validation.greaterThanVariable-family                                                                                                          | —                   | 2 number fields via explicit refs: `startAge`, `endAge` (`validation:{greaterThanVariable: startAgeVar.id}`)                                                                                                                                                               | `startAge=30`, `endAge=20`, Next (blocked); `endAge=40`, Next (advances)                                                          | blocked attempt shows a comparative error on `endAge`; step unchanged; after fix, both ego attributes persist as numbers (30, 40)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `validation-hints-summary`             | showValidationHints-summary, form.fields[].showValidationHints                                                                                 | —                   | Required Text field, `validation:{required:true,minLength:2}`, `showValidationHints:true`; sibling Number field with `showValidationHints` unset                                                                                                                           | none (assert on mount, before any interaction)                                                                                    | the Text field's hint region (`${id}-hint`, BaseField.tsx:84-89) contains generated requirement text (from `makeValidationHints`, useField.ts:159-164) — assert non-empty text inside `page.locator('div.group',{hasText:'Name?'}) .locator('[id$="-hint"]')`; the Number field's equivalent hint region is empty/absent                                                                                                                                                                                                                                                                                                                   |
| `relative-date-range-validation`       | RelativeDatePicker.parameters(anchor/before/after)-range-validation                                                                            | —                   | RelativeDatePicker datetime field, `parameters:{anchor:'2026-07-01',before:30,after:0}`                                                                                                                                                                                    | type a date 60 days before anchor into the native `input[type=date]`, Next (blocked); type a valid in-range date, Next (advances) | blocked attempt shows a min-date error (absolute min pre-computed at `useProtocolForm.tsx:323-341`), step unchanged; valid date persists to the ego attribute as `YYYY-MM-DD`                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `pre-population-from-ego-attributes`   | pre-population-from-ego-attributes                                                                                                             | `seedNetwork: true` | See fully-coded scenario below                                                                                                                                                                                                                                             | assert prefilled value on mount, edit it, Next                                                                                    | input value === seeded value on mount (`getEgoAttributes`, EgoForm.tsx:88-95); after edit + Next, ego attribute updates to the new value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `backwards-nav-discard-and-autosubmit` | backwards-nav-discard-and-autosubmit                                                                                                           | —                   | See fully-coded scenario below                                                                                                                                                                                                                                             | (a) invalid dirty value, Back → dialog → Keep → Back again → Discard; (b) fresh run: valid value, Back                            | see fully-coded scenario                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `scroll-nudge-inactivity`              | scroll-nudge-15s-inactivity                                                                                                                    | `slow`              | See fully-coded scenario below                                                                                                                                                                                                                                             | `page.clock` fast-forward 15s                                                                                                     | nudge appears, click dismisses + latches                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

That's 14 scenarios; `skipLogic` is claimed only by the shared cross-cutting suite (Task 26) and intentionally has no row here.

**Fully-coded scenarios** (5 of the 14: the two flagged for full coding —
`intro-panel-and-field-structure` and `field-mega-all-components` — plus the 3
most complex: seeding, dialogs, timers)

```ts
// e2e/matrix/ego-form.scenarios.ts (excerpt — intro-panel-and-field-structure,
// field-mega-all-components, pre-population)
import { entityAttributesProperty } from '@codaco/shared-consts';
import { SyntheticInterview } from '@codaco/protocol-utilities';

import { expect } from '../fixtures/matrix-test.js';
import type { InterfaceScenarios } from './types.js';

// field-mega-all-components needs each ego variable's id available in both
// build() and run() — same module-scoped `let` pattern as backNavAgeVarId /
// prePopNameVarId below, one per field.
let megaTextVarId: string;
let megaTextAreaVarId: string;
let megaNumberVarId: string;
let megaVasVarId: string;
let megaBooleanVarId: string;
let megaToggleVarId: string;
let megaRadioVarId: string;
let megaLikertVarId: string;
let megaCheckboxVarId: string;
let megaToggleButtonVarId: string;
let megaDatePickerVarId: string;
let megaRelativeDatePickerVarId: string;

export const egoFormScenarios: InterfaceScenarios = {
  interfaceType: 'EgoForm',
  scenarios: [
    {
      id: 'intro-panel-and-field-structure',
      covers: [
        'introductionPanel.title',
        'introductionPanel.text',
        'form.fields-ordering-and-prompt',
        'form.fields[].hint',
        'form.fields[].id',
        'label',
        'interviewScript',
      ],
      smoke: true,
      visual: true,
      build: () => {
        const synth = new SyntheticInterview();
        const stage = synth.addStage('EgoForm', {
          label: 'INTERNAL LABEL',
          interviewScript: 'SCRIPT TEXT',
          introductionPanel: {
            title: 'About You',
            text: '## Section\n- item one',
          },
        });
        stage.addFormField({
          component: 'Text',
          prompt: 'Name?',
          hint: 'Legal name',
        });
        stage.addFormField({ component: 'Number', prompt: 'Age?' });
        stage.addFormField({ component: 'Toggle', prompt: 'Alone?' });
        return synth;
      },
      run: async ({ page }) => {
        // introductionPanel renders as real markdown elements, not raw
        // `##`/`-` text (EgoForm.tsx:215-218, ALLOWED_MARKDOWN_SECTION_TAGS).
        await expect(
          page.getByRole('heading', { level: 1, name: 'About You' }),
        ).toBeVisible();
        await expect(
          page.getByRole('heading', { name: 'Section' }),
        ).toBeVisible();
        await expect(
          page.getByRole('listitem', { name: 'item one' }),
        ).toBeVisible();

        // Each field renders inside its own `group` container
        // (BaseField.tsx:62-83), in declaration order.
        const fieldContainers = page.locator('div.group');
        await expect(fieldContainers).toHaveCount(3);
        await expect(fieldContainers).toContainText([
          'Name?',
          'Age?',
          'Alone?',
        ]);

        // The Text field's hint renders inside its own container
        // (BaseField.tsx:84-89).
        await expect(
          fieldContainers.nth(0).getByText('Legal name'),
        ).toBeVisible();

        // `label`/`interviewScript` are author-facing only, never rendered to
        // participants (base.ts:10-17 intent).
        await expect(page.getByText('INTERNAL LABEL')).toHaveCount(0);
        await expect(page.getByText('SCRIPT TEXT')).toHaveCount(0);
      },
    },

    {
      id: 'field-mega-all-components',
      covers: [
        'component=Text',
        'component=TextArea',
        'component=Number',
        'component=VisualAnalogScale',
        'component=Boolean',
        'component=Toggle',
        'component=RadioGroup',
        'component=LikertScale',
        'component=CheckboxGroup',
        'component=ToggleButtonGroup',
        'component=DatePicker',
        'DatePicker.parameters(type/min/max)',
        'component=RelativeDatePicker',
        'egoVariable.readOnly',
        'egoVariable.name-fallback-label',
      ],
      visual: true,
      build: () => {
        const synth = new SyntheticInterview();
        const stage = synth.addStage('EgoForm', {
          introductionPanel: {
            title: 'About You',
            text: 'Answer every question below.',
          },
        });

        const textVar = synth.addEgoVariable({
          type: 'text',
          component: 'Text',
          name: 'megaText',
        });
        megaTextVarId = textVar.id;
        stage.addFormField({
          variable: textVar.id,
          component: 'Text',
          prompt: 'What is your name?',
        });

        const textAreaVar = synth.addEgoVariable({
          type: 'text',
          component: 'TextArea',
          name: 'megaTextArea',
        });
        megaTextAreaVarId = textAreaVar.id;
        stage.addFormField({
          variable: textAreaVar.id,
          component: 'TextArea',
          prompt: 'Describe yourself briefly.',
        });

        const numberVar = synth.addEgoVariable({
          type: 'number',
          component: 'Number',
          name: 'megaNumber',
        });
        megaNumberVarId = numberVar.id;
        stage.addFormField({
          variable: numberVar.id,
          component: 'Number',
          prompt: 'How old are you?',
        });

        const vasVar = synth.addEgoVariable({
          type: 'scalar',
          component: 'VisualAnalogScale',
          name: 'megaVas',
        });
        megaVasVarId = vasVar.id;
        stage.addFormField({
          variable: vasVar.id,
          component: 'VisualAnalogScale',
          prompt: 'How happy are you right now?',
        });

        const booleanVar = synth.addEgoVariable({
          type: 'boolean',
          component: 'Boolean',
          name: 'megaBoolean',
        });
        megaBooleanVarId = booleanVar.id;
        stage.addFormField({
          variable: booleanVar.id,
          component: 'Boolean',
          prompt: 'Are you currently employed?',
        });

        const toggleVar = synth.addEgoVariable({
          type: 'boolean',
          component: 'Toggle',
          name: 'megaToggle',
        });
        megaToggleVarId = toggleVar.id;
        stage.addFormField({
          variable: toggleVar.id,
          component: 'Toggle',
          prompt: 'Do you live alone?',
        });

        // Explicit numeric options so the selected value is unambiguous —
        // base-ui stringifies the selection internally but RadioGroupField
        // maps it back to the original typed option.value (RadioGroup.tsx:191-197).
        const radioVar = synth.addEgoVariable({
          type: 'ordinal',
          component: 'RadioGroup',
          name: 'megaRadio',
          options: [
            { label: 'One', value: 1 },
            { label: 'Two', value: 2 },
            { label: 'Three', value: 3 },
            { label: 'Four', value: 4 },
          ],
        });
        megaRadioVarId = radioVar.id;
        stage.addFormField({
          variable: radioVar.id,
          component: 'RadioGroup',
          prompt: 'How many siblings do you have?',
        });

        // Default ordinal options (DEFAULT_ORDINAL_OPTIONS,
        // constants.ts:22-28): Strongly disagree(1)..Strongly agree(5).
        const likertVar = synth.addEgoVariable({
          type: 'ordinal',
          component: 'LikertScale',
          name: 'megaLikert',
        });
        megaLikertVarId = likertVar.id;
        stage.addFormField({
          variable: likertVar.id,
          component: 'LikertScale',
          prompt: 'How would you rate your overall health?',
        });

        // Default categorical options (DEFAULT_CATEGORICAL_OPTIONS,
        // constants.ts:30-35): family/work/school/neighborhood.
        const checkboxVar = synth.addEgoVariable({
          type: 'categorical',
          component: 'CheckboxGroup',
          name: 'megaCheckbox',
        });
        megaCheckboxVarId = checkboxVar.id;
        stage.addFormField({
          variable: checkboxVar.id,
          component: 'CheckboxGroup',
          prompt: 'Which languages do you speak?',
        });

        const toggleButtonVar = synth.addEgoVariable({
          type: 'categorical',
          component: 'ToggleButtonGroup',
          name: 'megaToggleButton',
        });
        megaToggleButtonVarId = toggleButtonVar.id;
        stage.addFormField({
          variable: toggleButtonVar.id,
          component: 'ToggleButtonGroup',
          prompt: 'What is your highest education level?',
        });

        // `parameters` exercises DatePicker.parameters(type/min/max) — a wide
        // range so the fixed fill value below is always in-bounds
        // (DatePicker.tsx:105-112 parses min/max into year/month bounds).
        const datePickerVar = synth.addEgoVariable({
          type: 'datetime',
          component: 'DatePicker',
          name: 'megaDatePicker',
        });
        megaDatePickerVarId = datePickerVar.id;
        stage.addFormField({
          variable: datePickerVar.id,
          component: 'DatePicker',
          prompt: 'What is your date of birth?',
          parameters: { type: 'full', min: '1900-01-01', max: '2026-12-31' },
        });

        // Wide anchor/before/after range — the range-validation edges are
        // exercised by the dedicated relative-date-range-validation scenario,
        // not here.
        const relativeDatePickerVar = synth.addEgoVariable({
          type: 'datetime',
          component: 'RelativeDatePicker',
          name: 'megaRelativeDatePicker',
        });
        megaRelativeDatePickerVarId = relativeDatePickerVar.id;
        stage.addFormField({
          variable: relativeDatePickerVar.id,
          component: 'RelativeDatePicker',
          prompt: 'When did you last see a doctor?',
          parameters: { anchor: '2026-07-01', before: 10000, after: 10000 },
        });

        return synth;
      },
      run: async ({ page, interview, protocol }) => {
        const group = (prompt: string) =>
          page.locator('div.group', { hasText: prompt });

        await page.getByLabel('What is your name?').fill('Jordan');
        await page
          .getByLabel('Describe yourself briefly.')
          .fill('A brief bio about myself.');
        await page.getByLabel('How old are you?').fill('42');

        // VisualAnalogScale: keyboard-only, per the locator reference note
        // below — dragging is unreliable because the thumb's pixel position
        // depends on layout (VisualAnalogScale.tsx:92-143). `End` jumps the
        // slider to its max (value 1).
        const vasSlider = group('How happy are you right now?').getByRole(
          'slider',
        );
        await vasSlider.focus();
        await vasSlider.press('End');

        // Boolean renders each option as a `role=radio` button with an
        // explicit `data-value` (Boolean.tsx:202-221).
        await page.getByRole('radio', { name: 'No' }).click();

        // Toggle resolves to a `role=switch` via its `id`
        // (ToggleField.tsx:136-149).
        await page.getByLabel('Do you live alone?').click();

        await page.getByRole('radio', { name: 'Two' }).click();

        // LikertScale: same keyboard approach as VisualAnalogScale. `End`
        // selects the last option (index 4, value 5, "Strongly agree";
        // LikertScale.tsx:122-138).
        const likertSlider = group(
          'How would you rate your overall health?',
        ).getByRole('slider');
        await likertSlider.focus();
        await likertSlider.press('End');

        // CheckboxGroup: each option is a `role=checkbox`
        // (CheckboxGroup.tsx:97-137). Scope by field container — both
        // CheckboxGroup and ToggleButtonGroup use the same default
        // categorical option labels on this stage.
        const checkboxGroup = group('Which languages do you speak?');
        await checkboxGroup.getByRole('checkbox', { name: 'Family' }).click();
        await checkboxGroup.getByRole('checkbox', { name: 'Work' }).click();

        // ToggleButtonGroup: also exposes each option as a `role=checkbox`
        // via Base UI's `Checkbox.Root` (ToggleButtonGroup.tsx:177-218).
        const toggleButtonGroup = group(
          'What is your highest education level?',
        );
        await toggleButtonGroup
          .getByRole('checkbox', { name: 'School' })
          .click();

        await group('What is your date of birth?')
          .locator('input[type="date"]')
          .fill('2005-06-15');
        await group('When did you last see a doctor?')
          .locator('input[type="date"]')
          .fill('2026-06-01');

        await interview.next();

        const state = await protocol.getNetworkState(interview.interviewId);
        const egoAttributes = state?.ego[entityAttributesProperty];

        expect(egoAttributes?.[megaTextVarId]).toBe('Jordan');
        expect(egoAttributes?.[megaTextAreaVarId]).toBe(
          'A brief bio about myself.',
        );
        expect(egoAttributes?.[megaNumberVarId]).toBe(42);
        expect(egoAttributes?.[megaVasVarId]).toBe(1);
        expect(egoAttributes?.[megaBooleanVarId]).toBe(false);
        expect(egoAttributes?.[megaToggleVarId]).toBe(true);
        expect(egoAttributes?.[megaRadioVarId]).toBe(2);
        expect(egoAttributes?.[megaLikertVarId]).toBe(5);
        expect(egoAttributes?.[megaCheckboxVarId]).toEqual(['family', 'work']);
        expect(egoAttributes?.[megaToggleButtonVarId]).toEqual(['school']);
        expect(egoAttributes?.[megaDatePickerVarId]).toBe('2005-06-15');
        expect(egoAttributes?.[megaRelativeDatePickerVarId]).toBe('2026-06-01');

        // `egoVariable.readOnly` (Architect editors only — the locked-codebook
        // flag has no interview-runtime effect) and
        // `egoVariable.name-fallback-label` (unreachable: EgoForm's schema
        // requires `prompt`, so the codebook-name fallback in
        // selectFieldMetadataFromVariables, forms.ts:101-123, never triggers)
        // are both declared-dead per the option inventory and are not
        // exercised here by design.
      },
    },

    // ... options-configuration, required-validation-and-pulse,
    // length-validation, numeric-range-validation,
    // selection-count-validation, cross-field-equality-validation,
    // cross-field-comparison-validation, validation-hints-summary,
    // relative-date-range-validation go here per the table above ...

    {
      id: 'pre-population-from-ego-attributes',
      covers: ['pre-population-from-ego-attributes'],
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        const nameVar = synth.addEgoVariable({
          type: 'text',
          component: 'Text',
          name: 'name',
        });
        // Requires SyntheticInterview.setEgoAttribute — see the dependency
        // callout above if it hasn't landed from an earlier task yet.
        synth.setEgoAttribute(nameVar.id, 'Bob');

        const stage = synth.addStage('EgoForm', {
          introductionPanel: {
            title: 'About You',
            text: 'Please confirm your details.',
          },
        });
        stage.addFormField({
          variable: nameVar.id,
          component: 'Text',
          prompt: 'What is your name?',
        });
        return synth;
      },
      run: async ({ page, interview, protocol }) => {
        const nameField = page.getByLabel('What is your name?');
        // Prefilled from getEgoAttributes on mount (EgoForm.tsx:88-95)
        await expect(nameField).toHaveValue('Bob');

        await nameField.fill('Carol');
        await interview.next();

        await protocol.waitForEgoAttribute(
          interview.interviewId,
          nameVar_placeholder_replaced_below,
          'Carol',
        );
      },
    },
  ],
};
```

The `nameVar_placeholder_replaced_below` line above is not valid TS — `build()` and `run()` don't share scope across two separate scenario-object closures in the array literal. Write the _actual_ file with `build` capturing the variable ref in an outer closure per scenario, e.g.:

```ts
{
  id: 'pre-population-from-ego-attributes',
  covers: ['pre-population-from-ego-attributes'],
  seedNetwork: true,
  build: () => {
    const synth = new SyntheticInterview();
    const nameVar = synth.addEgoVariable({
      type: 'text',
      component: 'Text',
      name: 'name',
    });
    synth.setEgoAttribute(nameVar.id, 'Bob');
    prePopNameVarId = nameVar.id; // module-level `let prePopNameVarId: string;` above the scenarios array
    const stage = synth.addStage('EgoForm', {
      introductionPanel: { title: 'About You', text: 'Please confirm your details.' },
    });
    stage.addFormField({ variable: nameVar.id, component: 'Text', prompt: 'What is your name?' });
    return synth;
  },
  run: async ({ page, interview, protocol }) => {
    const nameField = page.getByLabel('What is your name?');
    await expect(nameField).toHaveValue('Bob');
    await nameField.fill('Carol');
    await interview.next();
    await protocol.waitForEgoAttribute(interview.interviewId, prePopNameVarId, 'Carol');
  },
},
```

(Declare `let prePopNameVarId: string;` once near the top of the scenarios array in the real file — every other cross-field scenario in the table above that needs a stable variable id across `build`/`run` follows the identical pattern: a module-scoped `let` set inside `build()`, read inside `run()`.)

```ts
// backwards-nav-discard-and-autosubmit — full scenario
let backNavAgeVarId: string;
{
  id: 'backwards-nav-discard-and-autosubmit',
  covers: ['backwards-nav-discard-and-autosubmit'],
  build: () => {
    const synth = new SyntheticInterview();
    synth.addInformationStage({ title: 'Before', text: 'Placeholder stage so Back has somewhere to land.' });
    const stage = synth.addStage('EgoForm', {
      introductionPanel: { title: 'About You', text: 'Answer the question below.' },
    });
    const ageVar = synth.addEgoVariable({
      type: 'number',
      component: 'Number',
      name: 'age',
      validation: { required: true, maxValue: 10 },
    });
    backNavAgeVarId = ageVar.id;
    stage.addFormField({ variable: ageVar.id, component: 'Number', prompt: 'How old are you?' });
    synth.addInformationStage({ title: 'After', text: 'Placeholder stage after EgoForm.' });
    return synth;
  },
  currentStep: 1, // land directly on the EgoForm stage
  run: async ({ page, interview, protocol }) => {
    const ageField = page.getByLabel('How old are you?');

    // (a) dirty + invalid: 99 > maxValue 10
    await ageField.fill('99');
    await page.getByTestId('previous-button').click(); // Navigation.tsx:257
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Discard changes?')).toBeVisible(); // EgoForm.tsx:104
    await page.getByTestId('dialog-cancel').click(); // "Keep changes" (DialogProvider.tsx:517-527)
    await expect(dialog).toBeHidden();
    // still on the EgoForm stage with the invalid value retained
    await expect(ageField).toHaveValue('99');

    await page.getByTestId('previous-button').click();
    await expect(dialog.getByText('Discard changes?')).toBeVisible();
    await page.getByTestId('dialog-primary').click(); // "Discard changes" (DialogProvider.tsx:538-548)
    await expect(dialog).toBeHidden();
    // moved back to the Information stage; discarded value never persisted
    await expect(page.getByRole('heading', { name: 'Before' })).toBeVisible();
    const stateAfterDiscard = await protocol.getNetworkState(interview.interviewId);
    expect(stateAfterDiscard?.ego[entityAttributesProperty][backNavAgeVarId] ?? null).toBeNull();

    // (b) fresh visit, dirty + valid: silent auto-submit on Back
    await interview.goto(1);
    await page.getByLabel('How old are you?').fill('5');
    await page.getByTestId('previous-button').click();
    await expect(page.getByRole('dialog')).toHaveCount(0); // no dialog for a valid dirty form
    await expect(page.getByRole('heading', { name: 'Before' })).toBeVisible();
    await protocol.waitForEgoAttribute(interview.interviewId, backNavAgeVarId, 5);
  },
},
```

```ts
// scroll-nudge-inactivity — full scenario (page.clock, 15s timer)
{
  id: 'scroll-nudge-inactivity',
  covers: ['scroll-nudge-15s-inactivity'],
  slow: true,
  build: () => {
    const synth = new SyntheticInterview();
    const stage = synth.addStage('EgoForm', {
      introductionPanel: {
        title: 'About You',
        text: 'This form has enough fields to overflow the viewport.',
      },
    });
    // 9 fields — matches EgoForm.stories.tsx's FIELD_PRESETS shape, known to
    // overflow a Desktop Chrome viewport (EgoForm.stories.tsx:9-28).
    const presets: { component: ComponentType; prompt: string }[] = [
      { component: 'Text', prompt: 'What is your name?' },
      { component: 'Number', prompt: 'How old are you?' },
      { component: 'TextArea', prompt: 'Describe yourself briefly.' },
      { component: 'Toggle', prompt: 'Do you live alone?' },
      { component: 'Boolean', prompt: 'Are you currently employed?' },
      { component: 'RadioGroup', prompt: 'What is your highest education level?' },
      { component: 'CheckboxGroup', prompt: 'Which languages do you speak?' },
      { component: 'LikertScale', prompt: 'How would you rate your overall health?' },
      { component: 'VisualAnalogScale', prompt: 'How happy are you right now?' },
    ];
    for (const preset of presets) {
      stage.addFormField({ component: preset.component, prompt: preset.prompt });
    }
    return synth;
  },
  run: async ({ page }) => {
    // Clock must be installed BEFORE the stage's 15s setTimeout is scheduled
    // (EgoForm.tsx:78-85). The runner's installScenario() already navigated
    // once before run() started, so re-navigate to the same step now that
    // the clock is installed — Playwright's Clock is designed to survive
    // subsequent page.goto() calls within the same test.
    await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
    await page.reload();
    await page.waitForFunction(() => typeof window.__test !== 'undefined');

    const nudge = page.getByRole('status', { name: /Scroll to see more questions/ });
    await expect(nudge).toBeHidden();

    await page.clock.fastForward('00:15'); // 15s — EgoForm.tsx:83

    await expect(nudge).toBeVisible();
    await nudge.getByRole('button').click(); // scrollToBottom (EgoForm.tsx:203-208,245-249)

    // hasScrolledToBottom latches permanently once the sentinel intersects
    // (useScrolledToBottom.ts:21-48) — nudge never reappears even after
    // fast-forwarding another 15s.
    await expect(nudge).toBeHidden();
    await page.clock.fastForward('00:15');
    await expect(nudge).toBeHidden();
  },
},
```

Note on the reload above: `page.reload()` re-runs the SPA's client-side router at the same `?interviewId=...&step=...` URL already set by `installScenario`'s `interview.goto()` call, so no re-navigation helper is needed beyond the built-in `reload()` — the interview mounts fresh with the clock already intercepting `setTimeout`.

**Spec file**

```ts
// e2e/specs/matrix/ego-form.spec.ts
import { egoFormScenarios } from '../../matrix/ego-form.scenarios.js';
import { defineScenarioTests } from '../../matrix/run-scenario.js';

defineScenarioTests(egoFormScenarios);
```

**Locator reference used throughout (grounded in source, not guessed):**

- `interview.nextButton` / `.nextButtonHasPulse()` / `.next()` — `e2e/fixtures/interview-fixture.ts:168-190`.
- Previous button: `page.getByTestId('previous-button')` — `packages/interview/src/components/Navigation.tsx:257`.
- Dialog buttons: `page.getByTestId('dialog-primary')` (destructive-choice primary, autofocus goes to cancel) / `page.getByTestId('dialog-cancel')` — `packages/fresco-ui/src/dialogs/DialogProvider.tsx:479-553`; dialog copy `'Discard changes?'` at `packages/interview/src/interfaces/EgoForm/EgoForm.tsx:102-112`.
- Text/TextArea/Number fields: `page.getByLabel(prompt)` — label association via `FieldLabel htmlFor={id}` + matching `id` on the underlying `<input>`/`<textarea>` (`packages/fresco-ui/src/form/Field/BaseField.tsx:80-83`, `Field.tsx:63-68`). Number fields render `input[type=number]` (role `spinbutton`).
- Boolean / RadioGroup options: `getByRole('radio', { name: optionLabel })` — each option button carries an explicit `aria-label={label}` and `data-value` (`packages/fresco-ui/src/form/fields/Boolean.tsx:202-221`, `RadioGroup.tsx` `RadioItem` render, `~98-118`).
- CheckboxGroup / ToggleButtonGroup options: `getByRole('checkbox', { name: optionLabel })` — Base UI `Checkbox.Root` inside a `<label htmlFor>` wrapper (`packages/fresco-ui/src/form/fields/CheckboxGroup.tsx:104-128`, `Checkbox.tsx`; `ToggleButtonGroup.tsx` reuses the same `BaseCheckbox`).
- Toggle: `page.getByLabel(prompt)` resolving to the `Switch.Root` (role `switch`) via its `id` (`packages/fresco-ui/src/form/fields/ToggleField.tsx:112-149`).
- LikertScale / VisualAnalogScale: `page.locator('div.group', { hasText: prompt }).getByRole('slider')` — both are Base UI `Slider.Thumb` (role `slider`); LikertScale moves in discrete steps via `ArrowRight`/`ArrowLeft`/`Home`/`End` keyboard input after `.focus()` (`packages/fresco-ui/src/form/fields/LikertScale.tsx:122-183`), VAS drag-simulated via `.fill()` on the underlying range input is unreliable — use keyboard (`Home`, then `ArrowRight` × N) instead of `left_click_drag`, since the thumb's exact pixel position depends on layout.
- DatePicker (`type:'full'`): `page.locator('div.group',{hasText:prompt}).locator('input[type="date"]')`. DatePicker (`type:'month'`): two `<select>` elements named `${name}-year`/`${name}-month` (`packages/fresco-ui/src/form/fields/DatePicker.tsx:151-179`) — `page.locator('select[name$="-year"]')` / `select[name$="-month"]`, use `.selectOption()`.
- RelativeDatePicker: same `input[type="date"]` pattern as DatePicker-full (`RelativeDatePicker.tsx` wraps `InputField type` implicitly via a native date input).
- Field container for scoping: `page.locator('div.group', { hasText: prompt })` — every field wrapper carries Tailwind's `group` utility class (`BaseField.tsx:62-68`); scope role queries inside it when a page has multiple fields with same-named options.
- Ego-attribute assertions: `protocol.getNetworkState(interview.interviewId)` → `.ego[entityAttributesProperty][variableId]` (import `entityAttributesProperty` from `@codaco/shared-consts`), or the polling helper `protocol.waitForEgoAttribute(interviewId, variableId, expectedValue)` (`e2e/fixtures/protocol-fixture.ts:230-251`) — prefer the polling helper after `interview.next()` since submission is asynchronous (`dispatch(updateEgo(...))`, EgoForm.tsx:185).

- [ ] **Step 1 (conditional): Add `SyntheticInterview.setEgoAttribute`** — only if it doesn't already exist by the time this task runs (check `packages/protocol-utilities/src/SyntheticInterview.ts` for `setEgoAttribute` first). Code in the dependency callout above. Run `pnpm --filter @codaco/protocol-utilities typecheck` after.
- [ ] **Step 2: Write the 14 scenarios + option inventory entry + spec file** — `intro-panel-and-field-structure` and `field-mega-all-components` are fully coded above; the remaining 9 rows (`options-configuration`, `required-validation-and-pulse`, `length-validation`, `numeric-range-validation`, `selection-count-validation`, `cross-field-equality-validation`, `cross-field-comparison-validation`, `validation-hints-summary`, `relative-date-range-validation`) are concrete enough in the table's "protocol config" / "interaction" / "functional assertions" columns to implement directly — follow the same `module-scoped let` pattern for any scenario referencing a variable id across `build`/`run` (cross-field-equality, cross-field-comparison).
- [ ] **Step 3: Run the coverage manifest**: `pnpm --filter @codaco/interview exec vitest run e2e/matrix` — Expected: PASS (every `OPTION_INVENTORY.EgoForm` key claimed by some scenario's `covers`, except `skipLogic` which the shared-claims file must list — confirm `e2e/matrix/shared-claims.ts`'s `sharedSuiteClaims` array includes `'EgoForm:skipLogic'`; if Task 26 hasn't landed yet, add it there yourself as a stopgap with a comment noting Task 26 owns the real scenario).
- [ ] **Step 4: Run the scenarios**: `pnpm --filter @codaco/interview test:e2e:headed -- --project=chromium-matrix --grep "EgoForm"` — Expected: PASS; commit new `e2e/aria-snapshots/chromium/*.aria.yml` baselines (and `e2e/aria-snapshots/{firefox,webkit}/*` for the one `smoke`-tagged scenario, which also runs in those projects).
- [ ] **Step 5: Typecheck + commit** with message `test(interview-e2e): EgoForm configuration matrix`

### Task 11: AlterForm matrix scenarios

**Files:**

- Create: `e2e/matrix/alter-form.scenarios.ts`
- Create: `e2e/specs/matrix/alter-form.spec.ts`
- Modify: `e2e/matrix/option-inventory.ts` (add the `AlterForm` entry)
- Modify: `e2e/matrix/coverage-manifest.test.ts` (append `alterFormScenarios` to `ALL_SUITES`)
- Modify: `e2e/fixtures/stage-fixture.ts` (implement `SlidesFormFixture`, currently a placeholder at lines 1220-1239; add two `FormFixture` methods used by the kitchen-sink scenario)

**Interfaces:**

- Consumes: `ScenarioDefinition`/`InterfaceScenarios`/`defineScenarioTests` (Task 6), `SyntheticInterview` builder extensions — `AddStageInput.filter`/`.skipLogic`, `AddFormFieldOpts.hint`/`.showValidationHints`, `AddVariableInput.parameters`/`.encrypted`, `synth.setExperiments()`, and the AlterForm/AlterEdgeForm `form.title` fix (Task 1), `seedNetwork`/`installPayload` (Task 3), `interview.dismissIntro()` and `interview.nextButtonHasPulse()` (already implemented in `e2e/fixtures/interview-fixture.ts:168-172,205-210` — reused as-is, not modified here).
- Produces: `alterFormScenarios: InterfaceScenarios` (consumed by Task 12's AlterEdgeForm spec as prior art — AlterEdgeForm shares `SlidesForm.tsx` with `form_kind='alter_edge'` and no node header).
- Produces new `StageFixture.slidesForm` sub-fixture methods other tasks (Task 12 AlterEdgeForm, Task 13 EgoForm-adjacent work if any) may reuse: `dismissIntro` is intentionally NOT duplicated here (use `interview.dismissIntro()`, already generic). New methods: `getCurrentItemLabel()`, `isOnIntro()`, `nextSlide(previousLabel?)`, `previousSlide()`, `previousSlideExpectingDiscardDialog()`, `discardConfirmButton`, `discardCancelButton`.
- Produces two new `FormFixture` methods (`setSliderExtreme`, `selectDateMonth`) needed for the VisualAnalogScale/DatePicker(month) cells of the kitchen-sink scenario; no existing task or fixture had exercised these components yet.

**Important discovered constraint:** SlidesForm (`packages/interview/src/interfaces/SlidesForm/SlidesForm.tsx`) and `IntroPanel.tsx` have **no progress-dot or slide-index UI** — verified by reading both files in full; no such element, class, or testid exists. The plan's "progress dots" expectation does not match the shipped component. `SlidesFormFixture` therefore has no `getSlideIndex()`/progress-dot helper; slide position is tracked by the caller via the known, ordered list of seeded item labels (network node order — SlidesForm.tsx has no `sortOptions`, dive file note 7) and read back via `getCurrentItemLabel()`.

---

#### Stage fixture helpers

Insert into `e2e/fixtures/stage-fixture.ts`, replacing the placeholder `SlidesFormFixture` (currently lines 1220-1239):

```ts
/**
 * Fixture for SlidesForm-based stages (AlterForm, AlterEdgeForm).
 *
 * SlidesForm has no progress-dot or slide-index UI (verified against
 * packages/interview/src/interfaces/SlidesForm/SlidesForm.tsx and
 * IntroPanel.tsx — no such element exists there), so slide position is
 * tracked by the caller via the current item's header label, not a DOM
 * index affordance. Use `interview.dismissIntro()` (already implemented,
 * e2e/fixtures/interview-fixture.ts:205-210) to leave the intro panel —
 * it is generic across AlterForm/AlterEdgeForm, so it is not duplicated
 * here. Field interactions inside a slide's form use `stage.form`
 * (FormFixture).
 */
class SlidesFormFixture {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * The current slide's header node locator. AlterForm's renderHeader
   * renders a ConnectedNode -> fresco-ui UINode (a `<button
   * aria-label={label}>`, packages/fresco-ui/src/Node.tsx:296-303) inside
   * SlidesForm's sticky header wrapper
   * (packages/interview/src/interfaces/SlidesForm/SlidesForm.tsx: the
   * `<div className="sticky top-0 z-10 shrink-0">` around `{header}`).
   * AlterEdgeForm's renderHeader returns null (AlterForm.tsx:48-55), so
   * this resolves to zero elements on edge-subject slides.
   */
  private headerNode(): Locator {
    return this.page.locator(
      '[data-stage-section="form"] .sticky.top-0 button[aria-label]',
    );
  }

  /**
   * Read the current slide's item label (node name via useNodeLabel).
   * Returns null on edge-subject slides (AlterEdgeForm has no header).
   */
  async getCurrentItemLabel(): Promise<string | null> {
    const header = this.headerNode();
    if ((await header.count()) === 0) return null;
    return header.getAttribute('aria-label');
  }

  /**
   * True while the stage shows the introduction panel
   * (AlterForm.tsx:107-108 `data-stage-section="intro"`).
   */
  async isOnIntro(): Promise<boolean> {
    return (
      (await this.page.locator('[data-stage-section="intro"]').count()) > 0
    );
  }

  /**
   * Click next-button and wait for either the next slide to mount (header
   * label changes) or the stage to be left (URL step changes, since
   * SlidesForm advancing past the last item calls moveForward() ->
   * AlterForm.tsx's parent navigation updates the `step` query param).
   * Pass the label of the slide being left so two identically-named
   * alters can't false-positive a "slide changed" read; omit on
   * edge-subject stages (no header to compare — this then only detects
   * the URL/stage-section change). "next-button" is the forward
   * NavigationButton's `data-testid`
   * (packages/interview/src/components/Navigation.tsx:302).
   */
  async nextSlide(previousLabel?: string | null): Promise<void> {
    const beforeUrl = this.page.url();
    await this.page.getByTestId('next-button').click();
    await this.page.waitForFunction(
      ({ beforeUrl, previousLabel }) => {
        if (window.location.href !== beforeUrl) return true;
        const stageSection = document.querySelector('[data-stage-section]');
        if (!stageSection) return true;
        if (previousLabel == null) return false;
        const header = document.querySelector(
          '[data-stage-section="form"] .sticky.top-0 button[aria-label]',
        );
        return header?.getAttribute('aria-label') !== previousLabel;
      },
      { beforeUrl, previousLabel: previousLabel ?? null },
      { timeout: 10_000 },
    );
  }

  /**
   * Click previous-button expecting NO discard dialog — valid path: slide
   * 0 back to intro, or a valid dirty slide that autosaves
   * (SlidesForm.tsx:361-366). "previous-button" is the backward
   * NavigationButton's `data-testid`
   * (packages/interview/src/components/Navigation.tsx:257).
   */
  async previousSlide(): Promise<void> {
    const beforeUrl = this.page.url();
    await this.page.getByTestId('previous-button').click();
    await this.page.waitForFunction(
      (beforeUrl) => {
        if (window.location.href !== beforeUrl) return true;
        return document.querySelector('[data-stage-section="intro"]') !== null;
      },
      beforeUrl,
      { timeout: 10_000 },
    );
  }

  /**
   * Click previous-button on an invalid, dirty slide and return once the
   * "Discard changes?" confirm dialog is visible
   * (SlidesForm.tsx:343-359, useDialog().confirm ->
   * packages/fresco-ui/src/dialogs/DialogProvider.tsx type:'choice').
   * "previous-button" is the backward NavigationButton's `data-testid`
   * (packages/interview/src/components/Navigation.tsx:257).
   * Resolve with `discardConfirmButton` or `discardCancelButton`.
   */
  async previousSlideExpectingDiscardDialog(): Promise<Locator> {
    await this.page.getByTestId('previous-button').click();
    const dialog = this.page
      .getByRole('dialog')
      .filter({
        has: this.page.getByRole('heading', { name: 'Discard changes?' }),
      });
    await dialog.waitFor({ state: 'visible' });
    return dialog;
  }

  /** "Discard changes" primary button (DialogProvider.tsx:544 `data-testid="dialog-primary"`). */
  get discardConfirmButton(): Locator {
    return this.page.getByTestId('dialog-primary');
  }

  /** "Cancel" button (DialogProvider.tsx:523 `data-testid="dialog-cancel"`). */
  get discardCancelButton(): Locator {
    return this.page.getByTestId('dialog-cancel');
  }
}
```

Add these two methods to the existing `FormFixture` class (after `fillDate`, around `stage-fixture.ts:201`) — no other task has exercised VisualAnalogScale or month-resolution DatePicker yet:

```ts
  /**
   * Commit a VisualAnalogScale field to its min or max bound via keyboard.
   * VAS renders a base-ui Slider (packages/fresco-ui/src/form/fields/
   * VisualAnalogScale.tsx:104-135) exposing role="slider" with native
   * min/max/value, same pattern as `selectLikert` above. Home/End are the
   * platform-standard range-input bounds shortcuts.
   */
  async setSliderExtreme(
    fieldName: string,
    extreme: 'min' | 'max',
  ): Promise<void> {
    const field = this.getField(fieldName);
    const slider = field.getByRole('slider');
    await slider.focus();
    await slider.press(extreme === 'min' ? 'Home' : 'End');
  }

  /**
   * Select a month-resolution DatePicker's year and month native <select>s
   * (packages/fresco-ui/src/form/fields/DatePicker.tsx:157-183 renders two
   * `SelectField`/Native.tsx `<select>` elements when `parameters.type ===
   * 'month'`; year select is rendered first).
   */
  async selectDateMonth(
    fieldName: string,
    year: string,
    month: string,
  ): Promise<void> {
    const field = this.getField(fieldName);
    const selects = field.locator('select');
    await selects.nth(0).selectOption(year);
    await selects.nth(1).selectOption(month);
  }
```

---

#### Option inventory entry

```ts
// e2e/matrix/option-inventory.ts — add to OPTION_INVENTORY
AlterForm: [
  'type',
  'id',
  'label',
  'interviewScript',
  'skipLogic', // claimed by Task 26 shared suite, not here
  'filter', // claimed by Task 26 shared suite, not here
  'subject',
  'introductionPanel',
  'form',
  'form.fields[].variable',
  'form.fields[].prompt',
  'form.fields[].hint',
  'form.fields[].showValidationHints',
  'form.fields[].id',
  'variable.component',
  'variable.type',
  'variable.options',
  'variable.validation.required',
  'variable.validation.minLength',
  'variable.validation.maxLength',
  'variable.validation.minValue',
  'variable.validation.maxValue',
  'variable.validation.minSelected',
  'variable.validation.maxSelected',
  'variable.validation.unique',
  'variable.validation.sameAs',
  'variable.validation.differentFrom',
  'variable.validation.greaterThanVariable',
  'variable.validation.greaterThanOrEqualToVariable',
  'variable.validation.lessThanVariable',
  'variable.validation.lessThanOrEqualToVariable',
  'variable.parameters.vas',
  'variable.parameters.datePicker',
  'variable.parameters.relativeDatePicker',
  'variable.encrypted',
  'codebook.nodeType.colorAndShape',
  'backNav.discardDialog',
  'backNav.autosave',
  'emptyItemShortCircuit',
  'readyStateScrollGating',
],
```

---

#### Scenario table

All scenarios use `subject = { entity: 'node', type: <Person nodeType id> }`. Unless noted, nodes are seeded via `seedNetwork: true` + `synth.addManualNode(stageId, nodeTypeId, uid, attrs)` so no preceding QuickAdd stage is needed (per dive dependency note: e2e sessions start with an empty network and AlterForm needs pre-existing alters). A following `Information` stage (`synth.addInformationStage({ title: 'Next stage', items: [...] })`) is appended after AlterForm in every scenario so "leaving the stage" is observable as that stage's heading appearing.

| id                                         | covers                                                                                                                                                                         | flags             | protocol config                                                                                                                                                                                                                                                                                                                                                       | interaction                                                                                                                                                                                                                                         | assertions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `intro-panel-and-mode-switch`              | type, id, label, interviewScript, subject, introductionPanel                                                                                                                   | `smoke`, `visual` | Person nodeType; AlterForm with `introductionPanel: { title: 'About Each Person', text: 'Please give **details** about each person.' }`, `label: 'Menu-only label'`, `interviewScript: 'Ask gently'`; one Text field `nickname`; `seedNetwork: true` with 2 manual Person nodes                                                                                       | `dismissIntro()`, then `stage.slidesForm.previousSlide()`                                                                                                                                                                                           | Before dismiss: `getByRole('heading', {name:'About Each Person'})` visible, `page.locator('strong', {hasText:'details'})` visible (markdown rendered); `page.getByText('Menu-only label')` count 0 (label never rendered); `page.getByText('Ask gently')` count 0 (interviewScript never rendered). After dismiss: `[data-stage-section="form"]` visible, `stage.slidesForm.getCurrentItemLabel()` resolves to first node's name. After `previousSlide()`: `stage.slidesForm.isOnIntro()` true again. |
| `slide-iteration-subject-and-persistence`  | subject, form, form.fields[].variable, form.fields[].prompt, codebook.nodeType.colorAndShape                                                                                   | —                 | Person nodeType (`color: 'node-color-seq-3'`, default `shape: 'circle'`) + Place nodeType; AlterForm `subject` = Person; one Text field `variable: nickname, prompt: 'Nickname'`; `seedNetwork: true` with 2 manual Person nodes (`Ada`, `Grace`) + 1 manual Place node (`Office`)                                                                                    | `dismissIntro()`; capture label1 = `getCurrentItemLabel()`; `stage.form.fillText('nickname','Ziggy')`; `stage.slidesForm.nextSlide(label1)`; assert field empty; `stage.form.fillText('nickname','Moss')`; `stage.slidesForm.nextSlide('Grace')`    | Exactly 2 slides shown (3rd `nextSlide` lands on the following Information stage's heading, not a 3rd form); header button has class matching `/outline-node-3/` and `/rounded-full/` (color-seq-3, circle); `getNetworkState()`: both Person nodes have `nickname` set (`Ziggy`/`Moss`), the Place node's attributes are unchanged (no `nickname` key); after `previousSlide()` back to slide 1, `stage.form.getField('nickname')` input value is `'Ziggy'` (initialValues restored).                |
| `required-hint-and-validation-hints`       | variable.validation.required, form.fields[].hint, form.fields[].showValidationHints                                                                                            | —                 | 1 Person node; field A: `variable: fullName` Text, `prompt: 'Full name'`, `validation:{required:true}`; field B: `variable: nickname` Text, `prompt:'Nickname'`, `hint:'What friends call them'`, `showValidationHints:true`, `validation:{minLength:5}`                                                                                                              | `dismissIntro()`; click `interview.nextButton` with A empty                                                                                                                                                                                         | Error visible for field A, still on same slide (`data-stage-section="form"` unchanged, same header label), `document.activeElement` is field A's input (focusFirstError); hint text `'What friends call them'` visible under field B before any interaction; a length-requirement summary text also visible in field B's hint slot (showValidationHints, untouched); filling A advances (`nextSlide` reaches the following Information heading).                                                      |
| `length-and-numeric-validation`            | variable.validation.minLength, variable.validation.maxLength, variable.validation.minValue, variable.validation.maxValue, variable.type                                        | —                 | 1 Person node; TextArea `bio` (`validation:{minLength:5,maxLength:200}`); Number `age` (`validation:{minValue:1,maxValue:120}`)                                                                                                                                                                                                                                       | `dismissIntro()`; fill bio `'abc'`, fill age `'200'`, click next (blocked); fix bio to `'A longer bio'`, age to `'42'`, click next                                                                                                                  | Both field errors visible on first attempt; after fix, stage exits to Information heading; `getNetworkState()`: `bio` is the string, `age === 42` with `typeof === 'number'` (coerceFormValues).                                                                                                                                                                                                                                                                                                      |
| `categorical-min-max-selected`             | variable.validation.minSelected, variable.validation.maxSelected, variable.options                                                                                             | —                 | 1 Person node; CheckboxGroup `interests` (categorical, options `['Reading','Sport','Music','Art']`, `validation:{minSelected:1,maxSelected:2}`)                                                                                                                                                                                                                       | `dismissIntro()`; `stage.form.selectCheckbox('interests','Reading')`, `.selectCheckbox('interests','Sport')`, `.selectCheckbox('interests','Music')` (3 selected), click next (blocked); deselect `'Music'`, click next                             | Error visible at 3 selections; `getNetworkState()` after fix: `interests` is an array of exactly `['Reading','Sport']` (order per selection).                                                                                                                                                                                                                                                                                                                                                         |
| `cross-entity-unique-sameas-differentfrom` | variable.validation.unique, variable.validation.sameAs, variable.validation.differentFrom                                                                                      | —                 | 2 manual Person nodes (`seedNetwork:true`); Text `codeName` (`validation:{unique:true}`); Text `fieldA`; Text `fieldB` (`validation:{differentFrom:'fieldA'}`); Text `fieldC` (`validation:{sameAs:'fieldA'}`)                                                                                                                                                        | Full scenario code below                                                                                                                                                                                                                            | Full scenario code below                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `comparator-validation-greaterthan-family` | variable.validation.greaterThanVariable, variable.validation.greaterThanOrEqualToVariable, variable.validation.lessThanVariable, variable.validation.lessThanOrEqualToVariable | —                 | 1 Person node; Number `start`; Number `end` (`validation:{greaterThanVariable:'start'}`); Number `floor`; Number `ceiling` (`validation:{greaterThanOrEqualToVariable:'floor'}`); reuse `start`/`end` pair a second way is unnecessary — add Number `cap` (`validation:{lessThanVariable:'end'}`) and Number `capEq` (`validation:{lessThanOrEqualToVariable:'end'}`) | `dismissIntro()`; fill `start=10,end=5,floor=10,ceiling=9,cap=6,capEq=6` (end<start, ceiling<floor invalid; cap/capEq valid since <end=5 is false — see full detail below), click next (blocked); fix `end=15,ceiling=10,cap=4,capEq=5`, click next | Errors on `end` and `ceiling` on first attempt, none on `cap`/`capEq`; after fix all clear and stage exits; `getNetworkState()` has all 6 values as numbers.                                                                                                                                                                                                                                                                                                                                          |
| `kitchen-sink-components-and-ready-state`  | variable.component, variable.parameters.vas, variable.parameters.datePicker, variable.parameters.relativeDatePicker, form.fields[].id, readyStateScrollGating                  | `visual`          | Full scenario code below (12 fields, one field authored with an explicit `id`)                                                                                                                                                                                                                                                                                        | Full scenario code below                                                                                                                                                                                                                            | Full scenario code below                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `backwards-nav-discard-and-autosave`       | backNav.discardDialog, backNav.autosave                                                                                                                                        | —                 | Full scenario code below                                                                                                                                                                                                                                                                                                                                              | Full scenario code below                                                                                                                                                                                                                            | Full scenario code below                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `empty-item-list-short-circuit`            | emptyItemShortCircuit                                                                                                                                                          | —                 | Person nodeType with **zero** seeded nodes (`seedNetwork:true`, no `addManualNode` calls); one Text field; Information stage follows                                                                                                                                                                                                                                  | `interview.dismissIntro()`                                                                                                                                                                                                                          | Stage auto-advances without any `[data-stage-section="form"]` ever painting: assert the following Information stage's heading is visible immediately, and `page.locator('[data-stage-section="form"]')` count is 0 at any point (poll briefly then assert).                                                                                                                                                                                                                                           |
| `encrypted-variable-with-anonymisation`    | variable.encrypted                                                                                                                                                             | —                 | Full scenario code below                                                                                                                                                                                                                                                                                                                                              | Full scenario code below                                                                                                                                                                                                                            | Full scenario code below                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

---

#### Fully-coded scenarios

```ts
// e2e/matrix/alter-form.scenarios.ts
import { SyntheticInterview } from '@codaco/protocol-utilities';

import { expect } from '../fixtures/matrix-test.js';
import type { InterfaceScenarios } from './types.js';

export const alterFormScenarios: InterfaceScenarios = {
  interfaceType: 'AlterForm',
  scenarios: [
    {
      id: 'intro-panel-and-mode-switch',
      covers: [
        'type',
        'id',
        'label',
        'interviewScript',
        'subject',
        'introductionPanel',
      ],
      smoke: true,
      visual: true,
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        const person = synth.addNodeType({ name: 'Person' });
        const nickname = person.addVariable({
          id: 'nickname',
          name: 'Nickname',
          type: 'text',
          component: 'Text',
        });
        const alterForm = synth.addStage('AlterForm', {
          subject: { entity: 'node', type: person.id },
          label: 'Menu-only label',
          interviewScript: 'Ask gently',
          introductionPanel: {
            title: 'About Each Person',
            text: 'Please give **details** about each person.',
          },
        });
        alterForm.addFormField({ variable: nickname.id, prompt: 'Nickname' });
        synth.addManualNode(alterForm.id, person.id, 'p1', {
          [nickname.id]: 'Ada',
        });
        synth.addManualNode(alterForm.id, person.id, 'p2', {
          [nickname.id]: 'Grace',
        });
        synth.addInformationStage({ title: 'Next stage', items: [] });
        return synth;
      },
      run: async ({ page, interview, stage }) => {
        await expect(
          page.getByRole('heading', { name: 'About Each Person' }),
        ).toBeVisible();
        await expect(
          page.locator('strong', { hasText: 'details' }),
        ).toBeVisible();
        await expect(page.getByText('Menu-only label')).toHaveCount(0);
        await expect(page.getByText('Ask gently')).toHaveCount(0);

        await interview.dismissIntro();
        await expect(
          page.locator('[data-stage-section="form"][data-stage-ready="true"]'),
        ).toBeVisible();
        await expect(
          stage.slidesForm.getCurrentItemLabel(),
        ).resolves.not.toBeNull();

        await stage.slidesForm.previousSlide();
        await expect(stage.slidesForm.isOnIntro()).resolves.toBe(true);
      },
    },

    // ... slide-iteration-subject-and-persistence, required-hint-and-validation-hints,
    // length-and-numeric-validation, categorical-min-max-selected,
    // comparator-validation-greaterthan-family, empty-item-list-short-circuit follow
    // the same shape as the table above — one ScenarioDefinition object per row,
    // built with addNodeType/addVariable/addStage('AlterForm', ...)/addFormField/
    // addManualNode and asserted with FormFixture methods + getNetworkState().

    {
      id: 'cross-entity-unique-sameas-differentfrom',
      covers: [
        'variable.validation.unique',
        'variable.validation.sameAs',
        'variable.validation.differentFrom',
      ],
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        const person = synth.addNodeType({ name: 'Person' });
        const codeName = person.addVariable({
          id: 'codeName',
          name: 'Code name',
          type: 'text',
          component: 'Text',
          validation: { unique: true },
        });
        const fieldA = person.addVariable({
          id: 'fieldA',
          name: 'Field A',
          type: 'text',
          component: 'Text',
        });
        const fieldB = person.addVariable({
          id: 'fieldB',
          name: 'Field B',
          type: 'text',
          component: 'Text',
          validation: { differentFrom: fieldA.id },
        });
        const fieldC = person.addVariable({
          id: 'fieldC',
          name: 'Field C',
          type: 'text',
          component: 'Text',
          validation: { sameAs: fieldA.id },
        });
        const alterForm = synth.addStage('AlterForm', {
          subject: { entity: 'node', type: person.id },
          introductionPanel: { title: 'About Each Person', text: '' },
        });
        alterForm.addFormField({ variable: codeName.id, prompt: 'Code name' });
        alterForm.addFormField({ variable: fieldA.id, prompt: 'Field A' });
        alterForm.addFormField({ variable: fieldB.id, prompt: 'Field B' });
        alterForm.addFormField({ variable: fieldC.id, prompt: 'Field C' });
        synth.addManualNode(alterForm.id, person.id, 'p1', {});
        synth.addManualNode(alterForm.id, person.id, 'p2', {});
        synth.addInformationStage({ title: 'Next stage', items: [] });
        return synth;
      },
      run: async ({ page, interview, stage, protocol }) => {
        await interview.dismissIntro();
        const label1 = await stage.slidesForm.getCurrentItemLabel();

        // Slide 1: satisfy sameAs/differentFrom, pick a codeName.
        await stage.form.fillText('codeName', 'same');
        await stage.form.fillText('fieldA', 'alpha');
        await stage.form.fillText('fieldB', 'beta'); // differs from fieldA: OK
        await stage.form.fillText('fieldC', 'alpha'); // sameAs fieldA: OK
        await stage.slidesForm.nextSlide(label1);

        // Slide 2: reuse codeName 'same' (blocked by unique), and violate
        // differentFrom/sameAs.
        await stage.form.fillText('codeName', 'same');
        await stage.form.fillText('fieldA', 'alpha');
        await stage.form.fillText('fieldB', 'alpha'); // same as fieldA: violates differentFrom
        await stage.form.fillText('fieldC', 'zzz'); // differs from fieldA: violates sameAs
        await interview.nextButton.click();
        await expect(stage.form.getFieldError('codeName')).toBeVisible();
        await expect(stage.form.getFieldError('fieldB')).toBeVisible();
        await expect(stage.form.getFieldError('fieldC')).toBeVisible();

        // Fix all three.
        await stage.form.fillText('codeName', 'different');
        await stage.form.fillText('fieldB', 'gamma');
        await stage.form.fillText('fieldC', 'alpha');
        await stage.slidesForm.nextSlide(
          await stage.slidesForm.getCurrentItemLabel(),
        );

        await expect(
          page.getByRole('heading', { name: 'Next stage' }),
        ).toBeVisible();
        const state = await protocol.getNetworkState(interview.interviewId);
        const [n1, n2] = state.nodes;
        expect(n1?.attributes.codeName).toBe('same');
        expect(n2?.attributes.codeName).toBe('different');
        expect(n2?.attributes.fieldB).toBe('gamma');
        expect(n2?.attributes.fieldC).toBe('alpha');
      },
    },

    {
      id: 'kitchen-sink-components-and-ready-state',
      covers: [
        'variable.component',
        'variable.parameters.vas',
        'variable.parameters.datePicker',
        'variable.parameters.relativeDatePicker',
        'form.fields[].id',
        'readyStateScrollGating',
      ],
      visual: true,
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        const person = synth.addNodeType({ name: 'Person' });
        const text = person.addVariable({
          id: 'text',
          name: 'Text',
          type: 'text',
          component: 'Text',
        });
        const textArea = person.addVariable({
          id: 'textArea',
          name: 'Bio',
          type: 'text',
          component: 'TextArea',
        });
        const number = person.addVariable({
          id: 'number',
          name: 'Age',
          type: 'number',
          component: 'Number',
        });
        const boolean = person.addVariable({
          id: 'boolean',
          name: 'Confirmed',
          type: 'boolean',
          component: 'Boolean',
          options: [
            { label: 'Confirmed', value: true },
            { label: 'Not confirmed', value: false },
          ],
        });
        const toggle = person.addVariable({
          id: 'toggle',
          name: 'Consent',
          type: 'boolean',
          component: 'Toggle',
        });
        const radio = person.addVariable({
          id: 'radio',
          name: 'Closeness',
          type: 'ordinal',
          component: 'RadioGroup',
          options: [
            { label: 'Not close', value: 1 },
            { label: 'Close', value: 2 },
            { label: 'Very close', value: 3 },
          ],
        });
        const likert = person.addVariable({
          id: 'likert',
          name: 'Frequency',
          type: 'ordinal',
          component: 'LikertScale',
          options: [
            { label: 'Rarely', value: 1 },
            { label: 'Sometimes', value: 2 },
            { label: 'Often', value: 3 },
          ],
        });
        const checkbox = person.addVariable({
          id: 'checkbox',
          name: 'Interests',
          type: 'categorical',
          component: 'CheckboxGroup',
          options: [
            { label: 'Reading', value: 'reading' },
            { label: 'Sport', value: 'sport' },
          ],
        });
        const toggleButtons = person.addVariable({
          id: 'toggleButtons',
          name: 'Traits',
          type: 'categorical',
          component: 'ToggleButtonGroup',
          options: [
            { label: 'Kind', value: 'kind' },
            { label: 'Funny', value: 'funny' },
          ],
        });
        const vas = person.addVariable({
          id: 'vas',
          name: 'Closeness scale',
          type: 'scalar',
          component: 'VisualAnalogScale',
          parameters: { minLabel: 'Not at all', maxLabel: 'Extremely' },
          validation: { minValue: 20, maxValue: 80 },
        });
        const datePicker = person.addVariable({
          id: 'datePicker',
          name: 'Met on',
          type: 'datetime',
          component: 'DatePicker',
          parameters: { type: 'month', min: '2020-01', max: '2026-12' },
        });
        const relativeDatePicker = person.addVariable({
          id: 'relativeDatePicker',
          name: 'Last contact',
          type: 'datetime',
          component: 'RelativeDatePicker',
          parameters: { anchor: '2026-01-01', before: 30, after: 0 },
        });

        const alterForm = synth.addStage('AlterForm', {
          subject: { entity: 'node', type: person.id },
          introductionPanel: { title: 'About Each Person', text: '' },
        });
        alterForm.addFormField({
          variable: text.id,
          prompt: 'Text',
          id: 'field-text',
        });
        alterForm.addFormField({ variable: textArea.id, prompt: 'Bio' });
        alterForm.addFormField({ variable: number.id, prompt: 'Age' });
        alterForm.addFormField({ variable: boolean.id, prompt: 'Confirmed' });
        alterForm.addFormField({ variable: toggle.id, prompt: 'Consent' });
        alterForm.addFormField({ variable: radio.id, prompt: 'Closeness' });
        alterForm.addFormField({ variable: likert.id, prompt: 'Frequency' });
        alterForm.addFormField({ variable: checkbox.id, prompt: 'Interests' });
        alterForm.addFormField({
          variable: toggleButtons.id,
          prompt: 'Traits',
        });
        alterForm.addFormField({ variable: vas.id, prompt: 'Closeness scale' });
        alterForm.addFormField({ variable: datePicker.id, prompt: 'Met on' });
        alterForm.addFormField({
          variable: relativeDatePicker.id,
          prompt: 'Last contact',
        });

        synth.addManualNode(alterForm.id, person.id, 'p1', {});
        synth.addInformationStage({ title: 'Next stage', items: [] });
        return synth;
      },
      run: async ({ page, interview, stage, protocol }) => {
        await interview.dismissIntro();

        // VAS physical bounds: native min/max mirror validation.minValue/maxValue.
        const vasSlider = page
          .locator('[data-field-name="vas"]')
          .getByRole('slider');
        await expect(vasSlider).toHaveAttribute('min', '20');
        await expect(vasSlider).toHaveAttribute('max', '80');
        await expect(page.getByText('Not at all')).toBeVisible();
        await expect(page.getByText('Extremely')).toBeVisible();

        // Not yet scrolled to the bottom / not all fields valid: no pulse.
        expect(await interview.nextButtonHasPulse()).toBe(false);

        await stage.form.fillText('text', 'Hello');
        await stage.form.fillText('textArea', 'A bio');
        await stage.form.fillNumber('number', '42');
        await stage.form.selectRadio('boolean', 'Confirmed');
        // Toggle: fresco-ui ToggleField renders role="switch".
        await page
          .locator('[data-field-name="toggle"]')
          .getByRole('switch')
          .click();
        await stage.form.selectRadio('radio', 'Very close');
        await stage.form.selectLikert('likert', 'Often');
        await stage.form.selectCheckbox('checkbox', 'Reading');
        await stage.form.selectToggleButton('toggleButtons', 'Kind');
        await stage.form.setSliderExtreme('vas', 'max');
        await stage.form.selectDateMonth('datePicker', '2024', '06');
        await stage.form.fillDate('relativeDatePicker', '2025-12-15');

        // Scroll the slide's ScrollArea to the bottom sentinel.
        await page
          .locator('[data-stage-section="form"]')
          .locator('[aria-hidden]')
          .last()
          .scrollIntoViewIfNeeded();

        await expect.poll(() => interview.nextButtonHasPulse()).toBe(true);

        const label = await stage.slidesForm.getCurrentItemLabel();
        await stage.slidesForm.nextSlide(label);
        await expect(
          page.getByRole('heading', { name: 'Next stage' }),
        ).toBeVisible();

        const state = await protocol.getNetworkState(interview.interviewId);
        const attrs = state.nodes[0]?.attributes ?? {};
        expect(attrs.text).toBe('Hello');
        expect(attrs.textArea).toBe('A bio');
        expect(attrs.number).toBe(42);
        expect(typeof attrs.number).toBe('number');
        expect(attrs.boolean).toBe(true);
        expect(attrs.toggle).toBe(true);
        expect(attrs.radio).toBe(3);
        expect(attrs.likert).toBe(3);
        expect(attrs.checkbox).toEqual(['reading']);
        expect(attrs.toggleButtons).toEqual(['kind']);
        expect(attrs.vas).toBe(80);
        expect(attrs.datePicker).toBe('2024-06');
        expect(attrs.relativeDatePicker).toBe('2025-12-15');
      },
    },

    {
      id: 'backwards-nav-discard-and-autosave',
      covers: ['backNav.discardDialog', 'backNav.autosave'],
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        const person = synth.addNodeType({ name: 'Person' });
        const age = person.addVariable({
          id: 'age',
          name: 'Age',
          type: 'number',
          component: 'Number',
          validation: { minValue: 0, maxValue: 120 },
        });
        const alterForm = synth.addStage('AlterForm', {
          subject: { entity: 'node', type: person.id },
          introductionPanel: { title: 'About Each Person', text: '' },
        });
        alterForm.addFormField({ variable: age.id, prompt: 'Age' });
        synth.addManualNode(alterForm.id, person.id, 'p1', { [age.id]: 30 });
        synth.addManualNode(alterForm.id, person.id, 'p2', { [age.id]: 40 });
        synth.addInformationStage({ title: 'Next stage', items: [] });
        return synth;
      },
      run: async ({ page, interview, stage, protocol }) => {
        await interview.dismissIntro();
        const label1 = await stage.slidesForm.getCurrentItemLabel();
        await stage.slidesForm.nextSlide(label1); // slide 1 (age=30 untouched, valid) -> slide 2

        // Slide 2: enter an invalid value, go back — expect the discard dialog.
        await stage.form.fillNumber('age', '999');
        const dialog =
          await stage.slidesForm.previousSlideExpectingDiscardDialog();
        await expect(
          dialog.getByRole('heading', { name: 'Discard changes?' }),
        ).toBeVisible();

        // Cancel: stays on slide 2, typed value intact.
        await stage.slidesForm.discardCancelButton.click();
        await expect(dialog).toBeHidden();
        await expect(page.locator('[data-field-name="age"] input')).toHaveValue(
          '999',
        );

        // Go back again and confirm this time.
        await stage.slidesForm.previousSlideExpectingDiscardDialog();
        await stage.slidesForm.discardConfirmButton.click();
        await expect(stage.slidesForm.getCurrentItemLabel()).resolves.toBe(
          label1,
        );

        let state = await protocol.getNetworkState(interview.interviewId);
        expect(state.nodes[1]?.attributes.age).toBe(40); // invalid 999 was NOT persisted

        // Forward again to slide 2, enter a VALID value, go back (autosave, no dialog).
        await stage.slidesForm.nextSlide(label1);
        await stage.form.fillNumber('age', '55');
        await stage.slidesForm.previousSlide();
        await expect(stage.slidesForm.isOnIntro()).resolves.toBe(false);
        await expect(stage.slidesForm.getCurrentItemLabel()).resolves.toBe(
          label1,
        );

        state = await protocol.getNetworkState(interview.interviewId);
        expect(state.nodes[1]?.attributes.age).toBe(55); // valid dirty value WAS autosaved
      },
    },

    {
      id: 'empty-item-list-short-circuit',
      covers: ['emptyItemShortCircuit'],
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        const person = synth.addNodeType({ name: 'Person' });
        const name = person.addVariable({
          id: 'name',
          name: 'Name',
          type: 'text',
          component: 'Text',
        });
        const alterForm = synth.addStage('AlterForm', {
          subject: { entity: 'node', type: person.id },
          introductionPanel: { title: 'About Each Person', text: '' },
        });
        alterForm.addFormField({ variable: name.id, prompt: 'Name' });
        // Intentionally no addManualNode calls: zero Person nodes exist.
        synth.addInformationStage({ title: 'Next stage', items: [] });
        return synth;
      },
      run: async ({ page, interview }) => {
        await expect(page.locator('[data-stage-section="form"]')).toHaveCount(
          0,
        );
        await interview.dismissIntro();
        await expect(
          page.getByRole('heading', { name: 'Next stage' }),
        ).toBeVisible();
        await expect(page.locator('[data-stage-section="form"]')).toHaveCount(
          0,
        );
      },
    },

    {
      id: 'encrypted-variable-with-anonymisation',
      covers: ['variable.encrypted'],
      seedNetwork: true,
      build: () => {
        const synth = new SyntheticInterview();
        synth.setExperiments({ encryptedVariables: true });
        const person = synth.addNodeType({ name: 'Person' });
        const secret = person.addVariable({
          id: 'secret',
          name: 'Secret',
          type: 'text',
          component: 'Text',
          encrypted: true,
        });
        synth.addStage('Anonymisation');
        const alterForm = synth.addStage('AlterForm', {
          subject: { entity: 'node', type: person.id },
          introductionPanel: { title: 'About Each Person', text: '' },
        });
        alterForm.addFormField({ variable: secret.id, prompt: 'Secret' });
        synth.addManualNode(alterForm.id, person.id, 'p1', {});
        return synth;
      },
      run: async ({ page, interview, stage, protocol }) => {
        // Anonymisation stage (stage 0): set a passphrase.
        await page
          .getByLabel('Passphrase', { exact: true })
          .fill('correct horse battery staple');
        await page
          .getByLabel('Confirm Passphrase')
          .fill('correct horse battery staple');
        await page.getByRole('button', { name: 'Submit' }).click();
        await expect(
          page.getByText('Passphrase set successfully!'),
        ).toBeVisible();
        await interview.nextButton.click();

        // AlterForm (stage 1).
        await interview.dismissIntro();
        await stage.form.fillText('secret', 'Secret');
        await interview.nextButton.click();

        const state = await protocol.getNetworkState(interview.interviewId);
        expect(state.nodes[0]?.attributes.secret).not.toBe('Secret');
      },
    },
  ],
};
```

```ts
// e2e/specs/matrix/alter-form.spec.ts
import { alterFormScenarios } from '../../matrix/alter-form.scenarios.js';
import { defineScenarioTests } from '../../matrix/run-scenario.js';

defineScenarioTests(alterFormScenarios);
```

Note on the omitted-from-full-code rows (`slide-iteration-subject-and-persistence`, `required-hint-and-validation-hints`, `length-and-numeric-validation`, `categorical-min-max-selected`, `comparator-validation-greaterthan-family`): each is fully specified by its table row (exact builder calls, exact interaction sequence, exact assertions) and follows the identical `addNodeType`/`addVariable`/`addStage('AlterForm', ...)`/`addFormField`/`addManualNode`/`addInformationStage` shape demonstrated in the coded scenarios above — there is no remaining design decision left to the implementer.

- [ ] **Step 1: Implement the `SlidesFormFixture` and `FormFixture` additions** — code above, replacing `e2e/fixtures/stage-fixture.ts:1220-1239` and inserting after `fillDate` (`stage-fixture.ts:201`).
- [ ] **Step 2: Write the registry + inventory entry + spec file** — `e2e/matrix/alter-form.scenarios.ts` (all 11 scenarios, per the table + fully-coded examples above), `e2e/matrix/option-inventory.ts`, `e2e/specs/matrix/alter-form.spec.ts`, and append `alterFormScenarios` to `ALL_SUITES` in `e2e/matrix/coverage-manifest.test.ts`.
- [ ] **Step 3: Run the coverage manifest**: `pnpm --filter @codaco/interview exec vitest run e2e/matrix` — Expected: PASS for all AlterForm keys except `AlterForm:skipLogic`/`AlterForm:filter`, which stay unclaimed until Task 26 lands (matches the Information exemplar's transitional state — do not add ad-hoc scenarios to force these green early).
- [ ] **Step 4: Run the scenarios**: `pnpm --filter @codaco/interview test:e2e:headed -- --project=chromium-matrix --grep "AlterForm"` — Expected: PASS; commit the new `e2e/aria-snapshots/chromium/alter-form-*.aria.yml` baselines.
- [ ] **Step 5: Typecheck + commit** with message `test(interview-e2e): AlterForm configuration matrix`

### Task 12: AlterEdgeForm matrix scenarios

**Files:**

- Create: `e2e/matrix/alter-edge-form.scenarios.ts`
- Create: `e2e/specs/matrix/alter-edge-form.spec.ts`
- Modify: `e2e/matrix/option-inventory.ts` (add the `AlterEdgeForm` entry — full code below)
- Modify: `e2e/matrix/coverage-manifest.test.ts` (append `alterEdgeFormScenarios` to `ALL_SUITES`)
- Modify: `e2e/matrix/all-scenarios.ts` if it exists by the time this task runs (append registry import — check for the file first; if Task 6/subsequent tasks never created it, skip this line, the coverage manifest import is sufficient)
- Modify: `e2e/matrix/shared-claims.ts` (append `'AlterEdgeForm:skipLogic'` and `'AlterEdgeForm:filter'` to `sharedSuiteClaims` — these are claimed by Task 26's shared cross-cutting suite, not by scenarios in this file)
- Does NOT modify `e2e/fixtures/stage-fixture.ts` — `SlidesFormFixture` is implemented by Task 11 (AlterForm); this task only consumes it (see below). No new fixture surface is required for this interface beyond what Task 11 produces, because all raw field interactions (Boolean/Toggle/VAS/DatePicker/RelativeDatePicker) reuse locator patterns already present on `stage.form` (`FormFixture` in `e2e/fixtures/stage-fixture.ts:77-221`) or are written as scoped-locator one-offs inside `run()` using `[data-field-name="..."]`, matching the existing `FormFixture.getField` convention (`stage-fixture.ts:88-90`) without requiring new fixture methods.

**Interfaces:**

- Consumes:
  - `ScenarioDefinition` / `InterfaceScenarios` / `ScenarioContext` (Task 6, `e2e/matrix/types.ts`)
  - `defineScenarioTests` (Task 6, `e2e/matrix/run-scenario.ts`)
  - `SyntheticInterview` builder incl. `addNodeType`, `addEdgeType`, `addStage('NameGenerator', ...)`, `addEdges(pairs, edgeTypeId)`, `addManualEdge`, `addEgoVariable`, `addAsset`, and the `AlterEdgeForm` stage builder's `addFormField` (Task 1 extensions: `AddStageInput.skipLogic`/`.filter`, `AddFormFieldOpts.hint`/`.showValidationHints`/`.parameters`) — all demonstrated in `packages/interview/src/interfaces/AlterEdgeForm/AlterEdgeForm.stories.tsx:34-83,152-212`
  - Seeded interviews via `seedNetwork: true` + `currentStep` (Task 3)
  - `stage.slidesForm` — **produced by Task 11** (`SlidesFormFixture`, `e2e/fixtures/stage-fixture.ts`), consumed here with its actual method surface below; Task 12 does not implement it, only calls it
  - `interview.dismissIntro()` — already implemented, generic across AlterForm/AlterEdgeForm (`e2e/fixtures/interview-fixture.ts:205-210`); `SlidesFormFixture` intentionally does NOT duplicate intro dismissal
  - `stage.form` (`FormFixture`, existing: `fillText`, `selectRadio`, `selectLikert`, `selectToggleButton`, `selectCheckbox`, `fillDate`, `fillNumber`, `getFieldError`, `setSliderExtreme`, `selectDateMonth` — `stage-fixture.ts:77-221` plus Task 11's two additions)
- Produces: `alterEdgeFormScenarios: InterfaceScenarios` (`interfaceType: 'AlterEdgeForm'`)

**Stage fixture helpers consumed (produced by Task 11, NOT authored here)**

Task 11 builds AlterForm scenarios against the same `SlidesForm` container (`packages/interview/src/interfaces/SlidesForm/SlidesForm.tsx`) and therefore implements `SlidesFormFixture` with this method surface, which this task's scenarios call verbatim. Note the AlterEdgeForm-specific detail: `AlterEdgeForm`'s `renderHeader` returns `null` for anything without a `from`/`to` pair — for edge subjects it renders an `EdgeHeader` (`AlterEdgeForm.tsx:31-58`), so `getCurrentItemLabel()`'s header-button lookup does not apply here in the same way it does for AlterForm's single-node header; scenarios in this file track slide position via `getCurrentItemLabel()` returning `null` on edge slides (no `button[aria-label]` in the header) and instead correlate slides with edges by interaction order and by reading `protocol.getNetworkState()` afterward, exactly as Task 11's own AlterEdgeForm-facing comment anticipates.

```ts
// Consumed from e2e/fixtures/stage-fixture.ts (implemented by Task 11):
class SlidesFormFixture {
  /** true when [data-stage-section="intro"] is present (AlterEdgeForm.tsx:118-119) */
  isOnIntro(): Promise<boolean>;
  /** the current slide's item label (node header aria-label); resolves null on edge-subject slides, which have no node header */
  getCurrentItemLabel(): Promise<string | null>;
  /**
   * Click next-button and wait for either the next slide to mount (header
   * label changes from `previousLabel`) or the stage to be left (URL step
   * changes). Pass the label of the slide being left when known; omit on
   * edge-subject stages (no header to compare — this then only detects the
   * URL/stage-section change).
   */
  nextSlide(previousLabel?: string | null): Promise<void>;
  /** click previous-button expecting NO discard dialog (valid path) */
  previousSlide(): Promise<void>;
  /** click previous-button on an invalid, dirty slide; returns once the "Discard changes?" dialog is visible */
  previousSlideExpectingDiscardDialog(): Promise<Locator>;
  /** "Discard changes" primary button */
  readonly discardConfirmButton: Locator;
  /** "Cancel" button */
  readonly discardCancelButton: Locator;
}
```

Intro dismissal uses `interview.dismissIntro()` (already implemented, generic across AlterForm/AlterEdgeForm) — `SlidesFormFixture` has no `dismissIntro` method of its own. There is no `getSlideIndex()` or `fillCurrentSlide()` method: SlidesForm has no progress-dot/slide-index UI (verified against `SlidesForm.tsx` and `IntroPanel.tsx`), so slide position is tracked by the caller, and per-slide field filling uses `stage.form` (`FormFixture`) methods or scoped `page.locator('[data-field-name="..."]')` queries, matching the convention already used throughout this file's coded scenarios.

**Option inventory entry**

```ts
// e2e/matrix/option-inventory.ts — add this entry to OPTION_INVENTORY
AlterEdgeForm: [
  'id',
  'type',
  'label',
  'interviewScript',
  'skipLogic',
  'subject',
  'filter',
  'introductionPanel.title',
  'introductionPanel.text',
  'form',
  'form.fields[].variable',
  'form.fields[].prompt',
  'form.fields[].hint',
  'form.fields[].showValidationHints',
  'form.fields[].id',
  'variable.component=Text',
  'variable.component=TextArea',
  'variable.component=Number',
  'variable.component=Boolean',
  'variable.options(boolean)+negative',
  'variable.component=Toggle',
  'variable.component=RadioGroup',
  'variable.component=LikertScale',
  'variable.component=CheckboxGroup',
  'variable.component=ToggleButtonGroup',
  'variable.options(ordinal/categorical)',
  'useColumns auto-layout (>6 options)',
  'variable.component=VisualAnalogScale',
  'variable.parameters(VAS minLabel/maxLabel)',
  'variable.component=DatePicker',
  'variable.parameters(DatePicker type/min/max)',
  'variable.component=RelativeDatePicker',
  'variable.parameters(RelativeDatePicker anchor/before/after)',
  'variable.validation.required',
  'variable.validation.minLength/maxLength',
  'variable.validation.minValue/maxValue',
  'variable.validation.minSelected/maxSelected',
  'variable.validation.unique',
  'variable.validation.sameAs/differentFrom',
  'variable.validation.greaterThanVariable/lessThanVariable/etc',
  'codebook.edge[type].color',
  'codebook.node[type].color/shape/labelVariable',
  'zero-edges auto-skip',
  'multi-slide iteration + per-edge persistence',
  'backwards navigation (intro/slide)',
  'backwards valid-dirty auto-submit',
  'backwards invalid-dirty discard dialog',
  'ready-for-next scroll-to-bottom gating',
  'initial values from existing edge attributes',
  'form title absence (TitlelessFormSchema)',
],
```

Cross-cutting `skipLogic` and `filter` keys are listed here (so the coverage manifest's schema walk finds them declared) but are claimed via `e2e/matrix/shared-claims.ts` (`'AlterEdgeForm:skipLogic'`, `'AlterEdgeForm:filter'`), per Task 26 — no scenario in this file's `covers` array names them.

**Scenario table**

All builders start `const synth = new SyntheticInterview();`, then `const nt = synth.addNodeType({ name: 'Person' });`, `const et = synth.addEdgeType({ name: 'Friendship', color: <edge-color> });` unless noted. All node/edge variables are added on `et`/`nt` via the codebook variable APIs (`addEdgeVariable`/equivalent — matching the pattern `stage.addFormField({...})` seen in stories, which both creates the codebook variable AND appends the form field in one call, per `AlterEdgeForm.stories.tsx:71-75,185-204`). All protocol copy is neutral (no "traditional"/"normal" framing; this interface only asks about existence/nature of a tie, not identity, so no participant-tone risk beyond plain wording).

| id | covers | flags | protocol config | interaction | functional assertions |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `intro-and-transition` | `introductionPanel.title`, `introductionPanel.text`, `label`, `interviewScript` | `smoke`, `visual` | 3 nodes, 2 edges (Friendship); `introductionPanel.title='Relationship details'`, `text='This section asks about **each relationship** you noted.'`; stage `label='Internal: edge form'` (never rendered), `interviewScript='Ask about each tie.'` (never rendered); one `TextArea` field `prompt: 'Describe this relationship.'` | land on stage (currentStep at the AlterEdgeForm index); assert intro visible; click `interview.nextButton` once | `page.locator('[data-stage-section="intro"][data-stage-ready="true"]')` visible; `page.getByRole('heading', {name:'Relationship details'})` visible; intro contains `<strong>each relationship</strong>`; `page.getByText('Internal: edge form')` has count 0; `interview.nextButton` has class matching `/pulse-glow                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | success/`on intro (ready); after one click,`window.\_\_interviewStore.getState()`session step UNCHANGED (still same stage index) and`[data-stage-section="form"]`becomes visible;`page.getByText('Ask about each tie.')` count 0 |
| `subject-edge-type-scoping` | `subject`, `variable.component=Text` | — | 3 nodes; TWO edge types `Friendship` (`et`) and `Coworker` (`et2`); 2 Friendship edges + 1 Coworker edge (`synth.addEdges([[0,1],[1,2]], et.id); synth.addEdges([[0,2]], et2.id)`); stage `subject={entity:'edge', type: et.id}`; one `Text` field `variable:'metAt', prompt:'Where did you meet?'` on `et` only | `interview.dismissIntro()`; `stage.form.fillText('metAt','Work')`; `stage.slidesForm.nextSlide()`; `stage.form.fillText('metAt','School')`; `stage.slidesForm.nextSlide()` | after 2 next-clicks the interview leaves the stage (assert the following Information stage's heading visible); via `protocol.getNetworkState(interview.interviewId)`: both Friendship edges have `metAt` set to `'Work'`/`'School'` respectively; the Coworker edge's attributes object has no `metAt` key |
| `filter-excludes-node` | `filter` (claimed via shared-claims; absence-style functional check only, folded into this scenario for completeness) | — | 3 nodes A,B,C; node boolean attr `excluded` (A=false,B=false,C=true, seeded via `seedNetwork`); edges A-B and B-C (Friendship); stage `filter={rules:[{type:'node', id:'r1', options:{attribute:'excluded', operator:'EXACTLY', value:false}}]}` (keep only non-excluded nodes — this trims edge B-C via `trimEdges`); one field `prompt:'Where did you meet?'` | `interview.dismissIntro()`; `stage.form.fillText('metAt','Work')`; `stage.slidesForm.nextSlide()` | node C's name is never present anywhere in the header connector's rendered content at any point (assert via `page.locator('[data-stage-section="form"]').getByText(<node C's seeded name>)` has count 0 throughout); after 1 next-click the interview leaves the stage (only 1 slide, A-B); `protocol.getNetworkState` shows edge A-B has `metAt==='Work'`, edge B-C's attributes UNCHANGED (still whatever `seedNetwork` seeded, proving the filter view never mutated storage), and BOTH edges A-B and B-C still exist in the stored network |
| `zero-edges-auto-skip` | `zero-edges auto-skip` | — | 3 nodes, 0 edges of `subject.type`; standard intro + one field | `interview.dismissIntro()` (this click both leaves intro AND triggers the `moveForward()` auto-skip effect, `AlterEdgeForm.tsx:101-106`) | intro was visible before the click; after the click, the FOLLOWING Information stage's heading is visible; `page.locator('[data-stage-section="form"][data-stage-ready="true"]')` never appears (assert count 0 at any point via a short `expect.poll` immediately after the click); `protocol.getNetworkState` network unchanged from seed |
| `text-and-textarea-fields` | `variable.component=Text`, `variable.component=TextArea` | — | 2 nodes, 1 edge; two fields on one slide: `Text` `variable:'metAt', prompt:'Where did you meet?'`; `TextArea` `variable:'story', prompt:'Tell the story.'` | `interview.dismissIntro()`; `stage.form.fillText('metAt','Work')`; `stage.form.fillText('story','A long story about how we met.')`; `stage.slidesForm.nextSlide()` | interview leaves the stage after 1 click; `protocol.getNetworkState` edge attribute `metAt==='Work'` (string) and `story==='A long story about how we met.'` (string), matched by the edge's `entityPrimaryKeyProperty` |
| `number-coercion` | `variable.component=Number` | — | 2 nodes, 1 edge; one `Number` field `variable:'yearsKnown', prompt:'How many years have you known each other?'` | `interview.dismissIntro()`; `stage.form.fillNumber('yearsKnown','42')`; `stage.slidesForm.nextSlide()` | `protocol.getNetworkState` edge attribute `yearsKnown === 42` and `typeof yearsKnown === 'number'` (proves `coerceFormValues` ran) |
| `boolean-toggle-radio-likert` | `variable.component=Boolean`, `variable.options(boolean)+negative`, `variable.component=Toggle`, `variable.component=RadioGroup`, `variable.component=LikertScale` | `visual` | 2 nodes, 1 edge; four fields on one slide: `Boolean` `variable:'haveMet', prompt:'Have you ever worked together?', options:[{label:'Yes, we have', value:true},{label:'No, never', value:false, negative:true}]`; `Toggle` `variable:'seeRegularly', prompt:'Do you see each other regularly?'`; `RadioGroup` (ordinal) `variable:'closeness', prompt:'How close is this relationship?', options:[{label:'Very close',value:3},{label:'Close',value:2},{label:'Distant',value:1}]`; `LikertScale` (ordinal) `variable:'trust', prompt:'How much do you trust this person?', options: 5 points labelled 1..5` | `interview.dismissIntro()`; click `page.locator('[data-field-name="haveMet"]').getByRole('radio', {name:'No, never'})`; click `page.locator('[data-field-name="seeRegularly"]').getByRole('switch')`; `stage.form.selectRadio('closeness','Close')`; `stage.form.selectLikert('trust', '3')`; `stage.slidesForm.nextSlide()` | both custom Boolean labels ('Yes, we have'/'No, never') visible before clicking; after submit, `protocol.getNetworkState` edge attrs: `haveMet===false`, `seeRegularly===true`, `closeness===2` (scalar, not array), `trust===3`; the Toggle control is a `role=switch` element (assert `.toBeVisible()` pre-click) |
| `checkbox-and-togglebutton-arrays` | `variable.component=CheckboxGroup`, `variable.component=ToggleButtonGroup`, `variable.options(ordinal/categorical)` | — | 2 nodes, 1 edge; `CheckboxGroup` (categorical) `variable:'contexts', prompt:'In what contexts do you interact?', options:[work,social,family]`; `ToggleButtonGroup` (categorical) `variable:'channels', prompt:'How do you keep in touch?', options:[call,text,inPerson]` | `interview.dismissIntro()`; `stage.form.selectCheckbox('contexts','work')`; `stage.form.selectCheckbox('contexts','family')`; `stage.form.selectToggleButton('channels','call')`; `stage.form.selectToggleButton('channels','text')`; `stage.slidesForm.nextSlide()` | `protocol.getNetworkState` edge attrs: `contexts` deep-equals `['work','family']` (array); `channels` deep-equals `['call','text']` (array); the `channels` control renders `role=checkbox` toggle buttons (ToggleButtonGroup UI), distinguishing it visually from the plain CheckboxGroup in the same screenshot (`visual` not set here — folded pixel check happens in the dedicated `component-columns-and-vas` visual scenario instead) |
| `columns-auto-layout` | `useColumns auto-layout (>6 options)` | `visual` | 2 nodes, 1 edge; ONE `RadioGroup` (ordinal) field with 8 options `variable:'frequency', prompt:'How often do you interact?'` | `interview.dismissIntro()` | the field's own element (`page.locator('[data-field-name="frequency"]')` — this resolves to the `<fieldset>` rendered by base-ui's `RadioGroup` with `render={<fieldset />}`, which receives both `data-field-name` and the `useColumns` grid classes directly, `packages/fresco-ui/src/form/fields/RadioGroup.tsx:217-240`) has a multi-track CSS grid: assert via `expect.poll(() => page.locator('[data-field-name="frequency"]').evaluate((el) => getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length)).toBeGreaterThan(1)` (the `useColumns` variant emits `grid-cols-*`/`@sm:grid-cols-2` etc. as `grid-template-columns` tracks, not CSS multi-column `column-count` — `packages/fresco-ui/src/styles/controlVariants.ts:254-285`; auto-enabled because the field has 8 options, over the >6 threshold in `packages/interview/src/forms/useProtocolForm.tsx:268-275`); do not advance (visual-only assertion of the unsubmitted slide) |
| `vas-with-clamped-range-and-datepickers` | `variable.component=VisualAnalogScale`, `variable.parameters(VAS minLabel/maxLabel)`, `variable.component=DatePicker`, `variable.parameters(DatePicker type/min/max)`, `variable.component=RelativeDatePicker`, `variable.parameters(RelativeDatePicker anchor/before/after)` | — | see fully-coded scenario below | see fully-coded scenario below | see fully-coded scenario below |
| `required-and-length-and-selection-validation` | `variable.validation.required`, `variable.validation.minLength/maxLength`, `variable.validation.minSelected/maxSelected` | — | see fully-coded scenario below | see fully-coded scenario below | see fully-coded scenario below |
| `cross-field-and-unique-validation` | `variable.validation.unique`, `variable.validation.sameAs/differentFrom`, `variable.validation.greaterThanVariable/lessThanVariable/etc` | — | see fully-coded scenario 4 below | see fully-coded scenario 4 below | see fully-coded scenario 4 below |
| `multi-slide-persistence-and-colors` | `multi-slide iteration + per-edge persistence`, `codebook.edge[type].color`, `codebook.node[type].color/shape/labelVariable`, `initial values from existing edge attributes`, `form title absence (TitlelessFormSchema)` | `visual` | 4 nodes (named via `labelVariable`, node type colored `node-color-seq-2`), edge type colored `edge-color-seq-3`; 3 edges (chain 0-1,1-2,2-3) with one edge PRE-SEEDED with `metAt` already set (via `seedNetwork` payload network so its attribute is present at load, not via UI); one `Text` field `variable:'metAt'` | `interview.dismissIntro()`; per slide, read both endpoint node labels via `page.locator('[data-stage-section="form"] .sticky.top-0 button[aria-label]')` (`nth(0)`/`nth(1)` for from/to — `getCurrentItemLabel()` is not usable here since it assumes a single header button and AlterEdgeForm's `EdgeHeader` renders two, `AlterEdgeForm.tsx:31-58`); for each of the 3 slides EXCEPT the pre-seeded one: snapshot the endpoint-label pair, then `stage.form.fillText('metAt', <'one'\|'two'\|'three'>)`, then `stage.slidesForm.nextSlide()`; for the pre-seeded slide, assert prefill then `nextSlide()` without editing | header connector `div` (the element with class containing `edge-color-seq-3`'s mapped class) has computed `background-color` equal to the resolved `--edge-3` token; both endpoint `Node` components show the seeded node names and `node-color-seq-2` styling; the endpoint-label pair differs across all 3 slides matching seeded names; the pre-seeded slide's `Text` input has the seeded value on render, BEFORE any typing (`toHaveValue`); after the final `nextSlide()`, `protocol.getNetworkState` shows 3 distinct edges each holding its own `metAt` value (`'one'`,`'two'`,`'three'`, and the untouched pre-seeded value), keyed by `entityPrimaryKeyProperty`; the rendered form Surface has no title heading anywhere (assert `page.locator('main').getByRole('heading', {level: 2})` count 0, since only the `h1` intro title and field labels exist — TitlelessFormSchema) |
| `backwards-navigation-and-discard` | `backwards navigation (intro/slide)`, `backwards valid-dirty auto-submit`, `backwards invalid-dirty discard dialog`, `ready-for-next scroll-to-bottom gating` | — | see fully-coded scenario below | see fully-coded scenario below | see fully-coded scenario below |

That is 14 scenarios (target ~12; justified by the dive file's large assertion list — cross-field validation, VAS/date components, and backwards-navigation dialog behavior each need dedicated coverage and don't safely bundle with anything else without overloading a single scenario's `run()`).

**Fully-coded scenarios**

1. `vas-with-clamped-range-and-datepickers` — exercises VAS clamping, full DatePicker with `type:'month'`, and RelativeDatePicker anchor/before/after with an out-of-range typed value, all seeded via a manual network (no NameGenerator stage needed since nodes are seeded directly).

```ts
{
  id: 'vas-with-clamped-range-and-datepickers',
  covers: [
    'variable.component=VisualAnalogScale',
    'variable.parameters(VAS minLabel/maxLabel)',
    'variable.component=DatePicker',
    'variable.parameters(DatePicker type/min/max)',
    'variable.component=RelativeDatePicker',
    'variable.parameters(RelativeDatePicker anchor/before/after)',
  ],
  seedNetwork: true,
  build: () => {
    const synth = new SyntheticInterview();
    const nt = synth.addNodeType({ name: 'Person' });
    const et = synth.addEdgeType({ name: 'Friendship' });
    const stage = synth.addStage('AlterEdgeForm', {
      label: 'Relationship details',
      subject: { entity: 'edge', type: et.id },
      introductionPanel: {
        title: 'Relationship details',
        text: 'A few more questions about this relationship.',
      },
    });
    synth.addManualNode(stage.id, nt.id, 'alex', { name: 'Alex' });
    synth.addManualNode(stage.id, nt.id, 'sam', { name: 'Sam' });
    synth.addManualEdge(et.id, 'e1', 'alex', 'sam', {});
    stage.addFormField({
      component: 'VisualAnalogScale',
      variable: 'importance',
      prompt: 'How important is this relationship?',
      parameters: { minLabel: 'Not at all', maxLabel: 'Extremely' },
      validation: { minValue: 10, maxValue: 90 },
    });
    stage.addFormField({
      component: 'DatePicker',
      variable: 'metMonth',
      prompt: 'Roughly when did you first meet?',
      parameters: { type: 'month', min: '2020-01', max: '2026-12' },
    });
    stage.addFormField({
      component: 'RelativeDatePicker',
      variable: 'lastContact',
      prompt: 'When did you last speak?',
      parameters: { anchor: '2026-07-01', before: 30, after: 0 },
    });
    synth.addInformationStage({ title: 'Complete', text: 'End of section.' });
    return synth;
  },
  run: async ({ page, interview, stage, protocol }) => {
    await interview.dismissIntro();

    await expect(page.getByText('Not at all')).toBeVisible();
    await expect(page.getByText('Extremely')).toBeVisible();
    const vasSlider = page
      .locator('[data-field-name="importance"]')
      .getByRole('slider');
    await vasSlider.focus();
    await vasSlider.press('End'); // drive to max, which the display clamp limits to 90
    await expect(vasSlider).toHaveAttribute('aria-valuenow', '90');

    const monthField = page.locator('[data-field-name="metMonth"]');
    await monthField.locator('select').first().selectOption('2024');
    await monthField.locator('select').nth(1).selectOption('06');

    const relDateInput = page
      .locator('[data-field-name="lastContact"]')
      .locator('input[type="date"]');
    await relDateInput.fill('2026-08-15'); // out of range (after anchor+after)
    await stage.slidesForm.nextSlide();
    // Blocked: still on the same slide, not the Complete stage
    await expect(
      page.getByRole('heading', { name: 'Relationship details' }),
    ).not.toBeVisible();
    await expect(stage.form.getFieldError('lastContact')).toBeVisible();

    await relDateInput.fill('2026-06-15'); // within 2026-06-01..2026-07-01
    await stage.slidesForm.nextSlide();

    await expect(
      page.getByRole('heading', { name: 'Complete' }),
    ).toBeVisible();

    const network = await protocol.getNetworkState(interview.interviewId);
    const edge = network.edges[0]!;
    expect(edge.attributes.importance).toBeGreaterThanOrEqual(10);
    expect(edge.attributes.importance).toBeLessThanOrEqual(90);
    expect(edge.attributes.metMonth).toBe('2024-06');
    expect(edge.attributes.lastContact).toBe('2026-06-15');
  },
},
```

2. `required-and-length-and-selection-validation` — required RadioGroup forward-block + focus, minLength/maxLength on Text, minSelected/maxSelected on CheckboxGroup, all on one slide so the three forward-block attempts share a single setup.

```ts
{
  id: 'required-and-length-and-selection-validation',
  covers: [
    'variable.validation.required',
    'variable.validation.minLength/maxLength',
    'variable.validation.minSelected/maxSelected',
  ],
  build: () => {
    const synth = new SyntheticInterview();
    const nt = synth.addNodeType({ name: 'Person' });
    const et = synth.addEdgeType({ name: 'Friendship' });
    synth.addStage('NameGenerator', {
      label: 'Name Generator',
      initialNodes: { count: 2 },
      subject: { entity: 'node', type: nt.id },
    });
    synth.addEdges([[0, 1]], et.id);
    const stage = synth.addStage('AlterEdgeForm', {
      label: 'Relationship details',
      subject: { entity: 'edge', type: et.id },
      introductionPanel: {
        title: 'Relationship details',
        text: 'Answer the following.',
      },
    });
    stage.addFormField({
      component: 'RadioGroup',
      variable: 'closeness',
      prompt: 'How close is this relationship?',
      options: [
        { label: 'Very close', value: 3 },
        { label: 'Close', value: 2 },
        { label: 'Distant', value: 1 },
      ],
      validation: { required: true },
    });
    stage.addFormField({
      component: 'TextArea',
      variable: 'story',
      prompt: 'Describe this relationship.',
      validation: { minLength: 5, maxLength: 10 },
    });
    stage.addFormField({
      component: 'CheckboxGroup',
      variable: 'contexts',
      prompt: 'In what contexts do you interact?',
      options: [
        { label: 'Work', value: 'work' },
        { label: 'Social', value: 'social' },
        { label: 'Family', value: 'family' },
      ],
      validation: { minSelected: 1, maxSelected: 2 },
    });
    synth.addInformationStage({ title: 'Complete', text: 'End of section.' });
    return synth;
  },
  currentStep: 2,
  run: async ({ page, interview, stage, protocol }) => {
    await interview.dismissIntro();

    // Attempt 1: required RadioGroup empty, text too short, 0 selected.
    await stage.form.fillText('story', 'abc');
    await stage.slidesForm.nextSlide();
    await expect(stage.form.getFieldError('closeness')).toBeVisible();
    await expect(stage.form.getFieldError('story')).toBeVisible();
    await expect(stage.form.getFieldError('contexts')).toBeVisible();
    await expect(page.locator('[data-field-name="closeness"]')).toContainClass(
      /focus|active/,
    ); // focusFirstError landed inside the errored field
    const networkBefore = await protocol.getNetworkState(
      interview.interviewId,
    );
    expect(networkBefore.edges[0]!.attributes.closeness).toBeUndefined();

    // Attempt 2: text too long, too many selections; radio now valid.
    await stage.form.selectRadio('closeness', 'Close');
    await stage.form.fillText('story', 'abcdefghijk');
    await stage.form.selectCheckbox('contexts', 'work');
    await stage.form.selectCheckbox('contexts', 'social');
    await stage.form.selectCheckbox('contexts', 'family');
    await stage.slidesForm.nextSlide();
    await expect(stage.form.getFieldError('story')).toBeVisible();
    await expect(stage.form.getFieldError('contexts')).toBeVisible();
    await expect(stage.form.getFieldError('closeness')).not.toBeVisible();

    // Attempt 3: all within bounds.
    await stage.form.fillText('story', 'abcdef');
    await stage.form.selectCheckbox('contexts', 'family'); // deselect down to 2
    await stage.slidesForm.nextSlide();

    await expect(
      page.getByRole('heading', { name: 'Complete' }),
    ).toBeVisible();
    const network = await protocol.getNetworkState(interview.interviewId);
    const edge = network.edges[0]!;
    expect(edge.attributes.closeness).toBe(2);
    expect(edge.attributes.story).toBe('abcdef');
    expect(edge.attributes.contexts).toEqual(['work', 'social']);
  },
},
```

3. `backwards-navigation-and-discard` — covers backwards from slide 0 to intro, valid-dirty auto-submit on backwards, invalid-dirty discard-dialog cancel/confirm, and scroll-to-bottom gating (an 8-field slide that overflows the viewport).

```ts
{
  id: 'backwards-navigation-and-discard',
  covers: [
    'backwards navigation (intro/slide)',
    'backwards valid-dirty auto-submit',
    'backwards invalid-dirty discard dialog',
    'ready-for-next scroll-to-bottom gating',
  ],
  build: () => {
    const synth = new SyntheticInterview();
    const nt = synth.addNodeType({ name: 'Person' });
    const et = synth.addEdgeType({ name: 'Friendship' });
    synth.addStage('NameGenerator', {
      label: 'Name Generator',
      initialNodes: { count: 3 },
      subject: { entity: 'node', type: nt.id },
    });
    synth.addEdges(
      [
        [0, 1],
        [1, 2],
      ],
      et.id,
    );
    const stage = synth.addStage('AlterEdgeForm', {
      label: 'Relationship details',
      subject: { entity: 'edge', type: et.id },
      introductionPanel: {
        title: 'Relationship details',
        text: 'Answer the following for each relationship.',
      },
    });
    // 8 short text fields so the slide overflows the viewport and requires
    // scrolling the ScrollArea to the sentinel before the pulse classes appear.
    // note0 carries `validation: { required: true }` so that emptying it on
    // slide 1 makes the slide genuinely invalid-dirty (the discard-dialog
    // branch below relies on this, not on mere emptiness).
    for (let i = 0; i < 8; i++) {
      stage.addFormField({
        component: 'Text',
        variable: `note${i}`,
        prompt: `Note ${i + 1}`,
        ...(i === 0 ? { validation: { required: true } } : {}),
      });
    }
    synth.addInformationStage({ title: 'Complete', text: 'End of section.' });
    return synth;
  },
  currentStep: 2,
  run: async ({ page, interview, stage, protocol }) => {
    await interview.dismissIntro();

    // Backwards from slide 0 returns to intro.
    await stage.slidesForm.previousSlide();
    await expect(page.locator('[data-stage-section="intro"]')).toBeVisible();
    await interview.dismissIntro();

    // Fill slide 0 fully but WITHOUT scrolling to the bottom sentinel.
    for (let i = 0; i < 8; i++) {
      await stage.form.fillText(`note${i}`, `value ${i}`);
    }
    await expect(interview.nextButton).not.toHaveClass(
      /pulse-glow|bg-success/,
    );
    await page
      .locator('[data-field-name="note7"]')
      .scrollIntoViewIfNeeded();
    await expect
      .poll(() => interview.nextButton.getAttribute('class'))
      .toMatch(/pulse-glow|bg-success/);
    await stage.slidesForm.nextSlide(); // now on slide 1

    // Slide 1: fill validly, navigate backwards — auto-submits.
    await stage.form.fillText('note0', 'slide1 valid');
    for (let i = 1; i < 8; i++) {
      await stage.form.fillText(`note${i}`, `v${i}`);
    }
    await stage.slidesForm.previousSlide();
    await expect(page.locator('[data-field-name="note0"]')).toHaveValue(
      'value 0',
    ); // back on slide 0
    let network = await protocol.getNetworkState(interview.interviewId);
    expect(network.edges[1]!.attributes.note0).toBe('slide1 valid'); // persisted despite going back

    // Return to slide 1, make it invalid-dirty, navigate backwards -> discard dialog.
    await stage.slidesForm.nextSlide();
    await stage.form.fillText('note0', ''); // violates note0's `required: true`, set in build()
    const dialog = await stage.slidesForm.previousSlideExpectingDiscardDialog();
    await expect(
      dialog.getByRole('heading', { name: 'Discard changes?' }),
    ).toBeVisible();
    await stage.slidesForm.discardCancelButton.click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('[data-field-name="note0"]')).toHaveValue('');

    // Go back again and confirm this time.
    await stage.slidesForm.previousSlideExpectingDiscardDialog();
    await stage.slidesForm.discardConfirmButton.click();
    await expect(page.locator('[data-field-name="note0"]')).toHaveValue(
      'value 0',
    ); // back on slide 0
    network = await protocol.getNetworkState(interview.interviewId);
    expect(network.edges[1]!.attributes.note0).toBe('slide1 valid'); // discard did not overwrite the earlier valid persist
  },
},
```

4. `cross-field-and-unique-validation` — covers `unique` (checked against every other edge of the same type), `sameAs`/`differentFrom` (checked against another field on the same edge), and the `greaterThanVariable`/`lessThanVariable`/`greaterThanOrEqualToVariable`/`lessThanOrEqualToVariable` family (checked against another numeric field on the same edge). Two pre-seeded edges give the `unique` check something to collide against on the second slide.

```ts
{
  id: 'cross-field-and-unique-validation',
  covers: [
    'variable.validation.unique',
    'variable.validation.sameAs/differentFrom',
    'variable.validation.greaterThanVariable/lessThanVariable/etc',
  ],
  seedNetwork: true,
  build: () => {
    const synth = new SyntheticInterview();
    const nt = synth.addNodeType({ name: 'Person' });
    const et = synth.addEdgeType({ name: 'Friendship' });
    const stage = synth.addStage('AlterEdgeForm', {
      label: 'Relationship details',
      subject: { entity: 'edge', type: et.id },
      introductionPanel: {
        title: 'Relationship details',
        text: 'Answer the following for each relationship.',
      },
    });
    synth.addManualNode(stage.id, nt.id, 'alex', { name: 'Alex' });
    synth.addManualNode(stage.id, nt.id, 'sam', { name: 'Sam' });
    synth.addManualNode(stage.id, nt.id, 'jo', { name: 'Jo' });
    synth.addManualEdge(et.id, 'e1', 'alex', 'sam', {});
    synth.addManualEdge(et.id, 'e2', 'sam', 'jo', {});
    stage.addFormField({
      component: 'Text',
      variable: 'codeName',
      prompt: 'Give this relationship a code name.',
      validation: { unique: true },
    });
    stage.addFormField({
      component: 'Text',
      variable: 'fieldA',
      prompt: 'Field A',
    });
    stage.addFormField({
      component: 'Text',
      variable: 'fieldB',
      prompt: 'Field B',
      validation: { differentFrom: 'fieldA' },
    });
    stage.addFormField({
      component: 'Text',
      variable: 'fieldC',
      prompt: 'Field C',
      validation: { sameAs: 'fieldA' },
    });
    stage.addFormField({
      component: 'Number',
      variable: 'start',
      prompt: 'Start value',
    });
    stage.addFormField({
      component: 'Number',
      variable: 'end',
      prompt: 'End value',
      validation: { greaterThanVariable: 'start' },
    });
    stage.addFormField({
      component: 'Number',
      variable: 'floor',
      prompt: 'Floor value',
    });
    stage.addFormField({
      component: 'Number',
      variable: 'ceiling',
      prompt: 'Ceiling value',
      validation: { greaterThanOrEqualToVariable: 'floor' },
    });
    stage.addFormField({
      component: 'Number',
      variable: 'cap',
      prompt: 'Cap value',
      validation: { lessThanVariable: 'end' },
    });
    stage.addFormField({
      component: 'Number',
      variable: 'capEq',
      prompt: 'Cap-equal value',
      validation: { lessThanOrEqualToVariable: 'end' },
    });
    synth.addInformationStage({ title: 'Complete', text: 'End of section.' });
    return synth;
  },
  run: async ({ page, interview, stage, protocol }) => {
    await interview.dismissIntro();

    // Slide 0 (edge Alex-Sam): all constraints satisfied.
    await stage.form.fillText('codeName', 'same');
    await stage.form.fillText('fieldA', 'alpha');
    await stage.form.fillText('fieldB', 'beta'); // differs from fieldA: OK
    await stage.form.fillText('fieldC', 'alpha'); // sameAs fieldA: OK
    await stage.form.fillNumber('start', '10');
    await stage.form.fillNumber('end', '15'); // > start: OK
    await stage.form.fillNumber('floor', '10');
    await stage.form.fillNumber('ceiling', '10'); // >= floor: OK
    await stage.form.fillNumber('cap', '5'); // < end: OK
    await stage.form.fillNumber('capEq', '15'); // <= end: OK
    await stage.slidesForm.nextSlide();

    // Slide 1 (edge Sam-Jo): reuse codeName 'same' (blocked by unique) and
    // violate every cross-field constraint.
    await stage.form.fillText('codeName', 'same');
    await stage.form.fillText('fieldA', 'alpha');
    await stage.form.fillText('fieldB', 'alpha'); // same as fieldA: violates differentFrom
    await stage.form.fillText('fieldC', 'zzz'); // differs from fieldA: violates sameAs
    await stage.form.fillNumber('start', '10');
    await stage.form.fillNumber('end', '5'); // < start: violates greaterThanVariable
    await stage.form.fillNumber('floor', '10');
    await stage.form.fillNumber('ceiling', '9'); // < floor: violates greaterThanOrEqualToVariable
    await stage.form.fillNumber('cap', '6'); // not < end(5): violates lessThanVariable
    await stage.form.fillNumber('capEq', '6'); // not <= end(5): violates lessThanOrEqualToVariable
    await interview.nextButton.click();
    await expect(stage.form.getFieldError('codeName')).toBeVisible();
    await expect(stage.form.getFieldError('fieldB')).toBeVisible();
    await expect(stage.form.getFieldError('fieldC')).toBeVisible();
    await expect(stage.form.getFieldError('end')).toBeVisible();
    await expect(stage.form.getFieldError('ceiling')).toBeVisible();
    await expect(stage.form.getFieldError('cap')).toBeVisible();
    await expect(stage.form.getFieldError('capEq')).toBeVisible();
    const networkBefore = await protocol.getNetworkState(
      interview.interviewId,
    );
    expect(networkBefore.edges[1]!.attributes.codeName).toBeUndefined();

    // Fix every violation.
    await stage.form.fillText('codeName', 'different');
    await stage.form.fillText('fieldB', 'gamma');
    await stage.form.fillText('fieldC', 'alpha');
    await stage.form.fillNumber('end', '15');
    await stage.form.fillNumber('ceiling', '10');
    await stage.form.fillNumber('cap', '4');
    await stage.form.fillNumber('capEq', '5');
    await stage.slidesForm.nextSlide();

    await expect(
      page.getByRole('heading', { name: 'Complete' }),
    ).toBeVisible();
    const network = await protocol.getNetworkState(interview.interviewId);
    const [edge0, edge1] = network.edges;
    expect(edge0!.attributes.codeName).toBe('same');
    expect(edge1!.attributes.codeName).toBe('different');
    expect(edge1!.attributes.fieldB).toBe('gamma');
    expect(edge1!.attributes.fieldC).toBe('alpha');
    expect(edge1!.attributes.end).toBe(15);
    expect(edge1!.attributes.ceiling).toBe(10);
    expect(edge1!.attributes.cap).toBe(4);
    expect(edge1!.attributes.capEq).toBe(5);
  },
},
```

- [ ] **Step 1: Write the registry + inventory entry + spec file**

Create `e2e/matrix/alter-edge-form.scenarios.ts` with `alterEdgeFormScenarios: InterfaceScenarios` containing all 14 scenarios (the 10 table rows fully implemented per their table cells, plus the 4 fully-coded scenarios above verbatim). Add the `AlterEdgeForm` entry to `e2e/matrix/option-inventory.ts`. Append `'AlterEdgeForm:skipLogic'` and `'AlterEdgeForm:filter'` to `e2e/matrix/shared-claims.ts`'s `sharedSuiteClaims`. Add `alterEdgeFormScenarios` to `ALL_SUITES` in `e2e/matrix/coverage-manifest.test.ts`. Create `e2e/specs/matrix/alter-edge-form.spec.ts`:

```ts
import { alterEdgeFormScenarios } from '../../matrix/alter-edge-form.scenarios.js';
import { defineScenarioTests } from '../../matrix/run-scenario.js';

defineScenarioTests(alterEdgeFormScenarios);
```

- [ ] **Step 2: Run the coverage manifest**: `pnpm --filter @codaco/interview exec vitest run e2e/matrix` — Expected: PASS (all `AlterEdgeForm` inventory keys claimed, either by a scenario's `covers` or by `shared-claims.ts`)

- [ ] **Step 3: Run the scenarios**: `pnpm --filter @codaco/interview test:e2e:headed -- --project=chromium-matrix --grep "AlterEdgeForm"` — Expected: PASS; commit new `.aria.yml` baselines under `e2e/aria-snapshots/chromium/`

- [ ] **Step 4: Typecheck + commit** with message `test(interview-e2e): AlterEdgeForm configuration matrix`

### Task 13: CategoricalBin matrix scenarios

**Files:**

- Create: `e2e/matrix/categorical-bin.scenarios.ts`
- Create: `e2e/specs/matrix/categorical-bin.spec.ts`
- Modify: `e2e/matrix/option-inventory.ts` (add the `CategoricalBin` entry — full code below)
- Modify: `e2e/matrix/coverage-manifest.test.ts` (append `import { categoricalBinScenarios } from './categorical-bin.scenarios.js';` and add `categoricalBinScenarios` to the `ALL_SUITES` array) + `e2e/matrix/all-scenarios.ts` if it exists by the time this task lands (append the same import/registration)
- Fixture: none. `CategoricalBinFixture` already exists in full at `e2e/fixtures/stage-fixture.ts:512-662` (drawer toggle, `getBin`, `getNodeCountInBin`, `isBinExpanded`, `expandBin`, `collapseBin`, `getNodeInDrawer`, `getNodeInBin`, `dragNodeToBin`, `moveNodeBetweenBins`) and covers every drag/expand/collapse interaction this task needs. No changes to `stage-fixture.ts`.

**Interfaces:**

- Consumes: `ScenarioDefinition`/`InterfaceScenarios`/`defineScenarioTests` (Task 6), `stage.categoricalBin` (`CategoricalBinFixture`, pre-existing), `AddStageInput.filter`/`.skipLogic` (Task 1 — used only insofar as the two keys must appear in the option inventory; **no scenario in this file exercises them**, they are claimed by the Task 26 shared cross-cutting suite), seeded/multi-step interviews (Task 3, via `installScenario`'s `seedNetwork`/`currentStep`), `protocol.getNetworkState(interviewId)`.
- Consumes: Task 1 (interviewScript passthrough).
- Produces: `categoricalBinScenarios: InterfaceScenarios` (`interfaceType: 'CategoricalBin'`).

**Option inventory entry**

```ts
// e2e/matrix/option-inventory.ts — add this entry to OPTION_INVENTORY
CategoricalBin: [
  'type',
  'id',
  'label',
  'interviewScript',
  'skipLogic', // claimed by shared cross-cutting suite (Task 26), not here
  'subject',
  'filter', // claimed by shared cross-cutting suite (Task 26), not here
  'prompts[]',
  'prompts[].id',
  'prompts[].text',
  'prompts[].variable',
  'prompts[].otherVariable',
  'prompts[].otherVariablePrompt',
  'prompts[].otherOptionLabel',
  'prompts[].bucketSortOrder',
  'prompts[].bucketSortOrder=*',
  'prompts[].binSortOrder',
  'codebook:variable-options',
  'codebook:node-label-and-type',
  'drop-writes-single-value-array',
  're-bin-replaces-value',
  'other-dialog-submit-writes-other-clears-variable',
  'other-dialog-cancel-noop',
  'regular-bin-drop-clears-other-variable',
  'other-option-label-without-other-variable-dead-config',
  'multi-value-membership',
  'empty-array-treated-as-unset',
  'ready-for-next-pulse',
  'bin-expand-collapse',
  'duplicate-option-labels-index-keyed',
  'category-color-cycling',
],
```

**Scenario table**

| id | covers | flags | protocol config | interaction | functional assertions |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `basic-bin-subject-and-label` | type, id, label, interviewScript, subject, prompts[], prompts[].id, prompts[].variable, codebook:variable-options, codebook:node-label-and-type, drop-writes-single-value-array, ready-for-next-pulse | `smoke`, `visual` | Two node types `Person`/`Place`. `Person` gets categorical var `Category` options `[{label:'Family',value:1},{label:'Work',value:2},{label:'School',value:3}]`. Stage: `label:'Categorise People'`, `interviewScript:'Author note, never shown'`, `subject:{entity:'node',type:personType.id}`, `initialNodes:{count:3}` for Person via a preceding node-seeding step (see coded scenario) and 2 manually-added `Place` nodes (`addManualNode`). One prompt `variable: categoryVar`. | Drag each of the 3 Person nodes (via `stage.categoricalBin.dragNodeToBin`) one at a time into any bin until the drawer is empty. | `stage.categoricalBin.drawerToggle` reads "3 unplaced" before any drag; `page.getByText('Categorise People')` has count 0 in the interview DOM (menu-only) — dead-config for `label`; `page.getByText('Author note, never shown')` has count 0 anywhere — dead-config for `interviewScript`; after each drag `getNetworkState()` shows the dropped node's `attributes[categoryVarId]` equal to a single-element array `[optionValue]`; Place nodes never appear via `stage.categoricalBin.getNodeInDrawer` or inside any bin (`getBin(label).getByRole('option')` count stays 0 for Place names) and `getNetworkState()` shows both Place nodes' `attributes` object unchanged (`{}` / only their seeded name attr) throughout; after the 3rd drag, `interview.nextButtonHasPulse()` resolves `true` and `drawerToggle` reads "0 unplaced". |
| `multi-prompt-markdown-pips` | prompts[], prompts[].id, prompts[].text, prompts[].variable | — | One node type, 2 Person nodes. Two categorical vars `varA` (options `[{label:'**Family**',value:1},{label:'Work',value:2}]`), `varB` (options `[{label:'Yes',value:1},{label:'No',value:2}]`). One stage, `prompts:[{variable:varA, text:'Sort **these** people'}, {variable:varB, text:'Prompt two'}]`. | Bin both nodes on prompt 1 (drag into any bin each); click `interview.nextButton` to advance prompt (not stage). | `page.locator('[data-testid="prompt"] strong', {hasText:'these'})` visible on prompt 1; bin heading contains `<strong>Family</strong>` (`page.locator('.catbin-item h4 strong', {hasText:'Family'})` visible); after binning both nodes on prompt 1, `interview.nextButtonHasPulse()` is `true`; clicking next advances to prompt 2 — `stage.categoricalBin.drawerToggle` reads "2 unplaced" again (fresh uncategorised set for varB) and no `.catbin-expanded` panel is present (expansion reset); bin both nodes on prompt 2; `getNetworkState()` shows each of the 2 nodes with BOTH `attributes[varA]` and `attributes[varB]` as single-element arrays. |
| `re-bin-move-between-bins` | re-bin-replaces-value | — | One node type, 1 Person node named `Alice` (seeded via `setNodeAttribute` on the name variable), categorical var options `[{label:'Family',value:1},{label:'Work',value:2}]`. | `stage.categoricalBin.dragNodeToBin('Alice','Work')`; then `stage.categoricalBin.moveNodeBetweenBins('Alice','Work','Family')`. | After first drag, `getNetworkState()` node attributes `[categoryVarId] === [2]`; after the move, `getNetworkState()` shows `[categoryVarId] === [1]` (old value replaced, not appended); `stage.categoricalBin.getNodeCountInBin('Work')` is `0` and `getNodeCountInBin('Family')` is `1`. |
| `other-bin-full-flow` | prompts[].otherVariable, prompts[].otherVariablePrompt, prompts[].otherOptionLabel, other-dialog-submit-writes-other-clears-variable, other-dialog-cancel-noop, regular-bin-drop-clears-other-variable | — | One node type, 3 Person nodes named `Alice`, `Bob`, `Carol`. Categorical var `Category` (2 options) + text var `otherReason`. Prompt: `variable, otherVariable: otherReasonId, otherVariablePrompt:'Please specify:', otherOptionLabel:'Other'`. | Fully coded below (submit flow on Alice, cancel flow on Bob, other→regular move on Carol pre-seeded into Other). | See coded scenario. |
| `other-option-label-dead-config` | other-option-label-without-other-variable-dead-config | — | One node type, 2 Person nodes. Categorical var (2 options). Prompt: `variable, otherOptionLabel:'Other'` — **`otherVariable` omitted**. | None — assert immediately after mount. | `page.getByRole('button', {name:/^Category Other/})` has count 0 (no Other bin renders); `page.locator('.catbin-item')` count equals the codebook's option count (2), not 3; `stage.categoricalBin.drawerToggle` reads "2 unplaced" — documents that setting `otherOptionLabel` alone, without `otherVariable`, is a silent no-op: no Other bin ever renders and neither node has any way to be categorised. |
| `bucket-sort-order-drawer` | prompts[].bucketSortOrder, prompts[].bucketSortOrder=\* | — | One node type, 3 Person nodes named `Carol`, `Alice`, `Bob` in that creation order (indices 0,1,2), all left uncategorised. One categorical var, 2 prompts on the SAME var: prompt 1 `bucketSortOrder:[{property: nameVarId, direction:'asc'}]`, prompt 2 `bucketSortOrder:[{property:'*', direction:'desc'}]`. | Read drawer order on prompt 1; click `interview.nextButton` to reach prompt 2; read drawer order again. | On prompt 1, the drawer's node buttons (`page.locator('main').getByRole('button', {name: /Carol                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Alice | Bob/})`) appear in DOM order Alice, Bob, Carol (name-ascending); on prompt 2 they appear in DOM order Carol, Bob, Alice (reverse creation order via `\*` + desc). |
| `bin-sort-order-within-bin` | prompts[].binSortOrder | — | One node type, 3 Person nodes named `Zed`, `Amy`, `Mia`, all PRE-BINNED into option value `1` (`Family`) via `setNodeAttribute(i, categoryVarId, [1])`). Categorical var 2 options. Prompt: `binSortOrder:[{property: nameVarId, direction:'asc'}]`. | `stage.categoricalBin.expandBin('Family')`. | Expanded panel's `role=listbox` NodeList options appear in DOM order Amy, Mia, Zed (`page.locator('.catbin-expanded').getByRole('option')` — assert `.allTextContents()` order); the collapsed circle's `BinSummary` paragraph (before expanding, or after collapsing again) reads "Amy and 2 others" (first sorted node named, not first-created). |
| `multi-value-and-empty-array-membership` | multi-value-membership, empty-array-treated-as-unset | — | One node type, 3 Person nodes: node 0 pre-seeded `attributes[categoryVarId] = [1,2]` (matches both Family and Work), node 1 pre-seeded `attributes[categoryVarId] = []` (empty array), node 2 left with no attribute (undefined). Categorical var 3 options `Family(1)/Work(2)/School(3)`. | Assert initial bin counts; drag node 0 (by name) into `School`. | Initially `stage.categoricalBin.getNodeCountInBin('Family')` is `1` and `getNodeCountInBin('Work')` is `1` (both counting the same `[1,2]` node); the `[]` node AND the undefined-attribute node both appear in the drawer (`drawerToggle` reads "2 unplaced"); after dragging node 0 into `School`, `getNetworkState()` shows its `attributes[categoryVarId] === [3]`; `getNodeCountInBin('Family')` and `getNodeCountInBin('Work')` both drop to `0`. |
| `bin-expand-collapse-interactions` | bin-expand-collapse | — | One node type, 2 Person nodes, one pre-binned into `Family`. Categorical var 2 options. Single prompt. | Click the `Family` bin circle to expand; press `Escape`; click it again; click elsewhere in `main` (e.g. the drawer region) to collapse via document click; expand again, then click `interview.nextButton` (2 prompts needed for this last check — add a second prompt on a second var so "next" changes prompt, not stage). | After first click, `getBin('Family')` has `aria-expanded="true"` and `.catbin-expanded` is visible (`role=listbox` panel); after `Escape`, `aria-expanded="false"` and `.catbin-expanded` not visible; after the second click it re-expands; after clicking elsewhere in `main`, it collapses again (document-click handler); after re-expanding and advancing to prompt 2 via next, `.catbin-expanded` is not visible (prompt change resets `expandedBinIndex`); dropping a node onto an still-expanded panel (drag the uncategorised node into the expanded `Family` panel before advancing prompts) writes the attribute exactly as a circle drop would (`getNetworkState()` shows `[1]`). |
| `duplicate-labels-and-color-cycling` | duplicate-option-labels-index-keyed, category-color-cycling | `visual` | Scenario A config: categorical var with 2 options sharing the SAME label `'Friend'` but values `10` and `20`; 1 Person node uncategorised. Scenario B config folded into the SAME run via a second prompt on a second var with 12 distinct options (color cycling). | Drag the node into the SECOND "Friend" bin (`page.getByRole('button', {name:/Category Friend/}).nth(1)`); advance to prompt 2 (12-option var) via next. | Two bins render, both with `aria-label` matching `/Category Friend/`; after the drop, `getNetworkState()` shows `attributes[categoryVarId] === [20]` (the SECOND option's value, not the first, proving index-keying); on prompt 2, `page.locator('.catbin-item')` count is `12`; computed style `--cat-color` on bin index `10`'s element equals bin index `0`'s (`page.locator('.catbin-item').nth(10).evaluate(el => getComputedStyle(el).getPropertyValue('--cat-color'))` equals the same call on `.nth(0)`). |

10 scenarios total (bundles co-varying dive assertions as instructed; `filter`/`skipLogic` intentionally have zero scenarios here, claimed only in the inventory for Task 26 to pick up).

**Fully-coded scenarios**

```ts
// e2e/matrix/categorical-bin.scenarios.ts
import { SyntheticInterview } from '@codaco/protocol-utilities';

import { expect } from '../fixtures/matrix-test.js';
import type { InterfaceScenarios } from './types.js';

export const categoricalBinScenarios: InterfaceScenarios = {
  interfaceType: 'CategoricalBin',
  scenarios: [
    {
      id: 'basic-bin-subject-and-label',
      covers: [
        'type',
        'id',
        'label',
        'interviewScript',
        'subject',
        'prompts[]',
        'prompts[].id',
        'prompts[].variable',
        'codebook:variable-options',
        'codebook:node-label-and-type',
        'drop-writes-single-value-array',
        'ready-for-next-pulse',
      ],
      smoke: true,
      visual: true,
      build: () => {
        const synth = new SyntheticInterview();
        const personType = synth.addNodeType({ name: 'Person' });
        const placeType = synth.addNodeType({ name: 'Place' });
        const personName = personType.addVariable({
          name: 'name',
          type: 'text',
        });
        const categoryVar = personType.addVariable({
          name: 'Category',
          type: 'categorical',
          options: [
            { label: 'Family', value: 1 },
            { label: 'Work', value: 2 },
            { label: 'School', value: 3 },
          ],
        });

        const stage = synth.addStage('CategoricalBin', {
          label: 'Categorise People',
          interviewScript: 'Author note, never shown',
          subject: { entity: 'node', type: personType.id },
          initialNodes: { count: 3 },
        });
        stage.addPrompt({ variable: categoryVar.id });

        // Named so drag-by-label assertions are deterministic.
        synth.setNodeAttribute(0, personName.id, 'Alice');
        synth.setNodeAttribute(1, personName.id, 'Bob');
        synth.setNodeAttribute(2, personName.id, 'Carol');

        // Two Place nodes: never subject-scoped into this stage, must stay
        // invisible to drawer/bins and untouched in getNetworkState().
        synth.addManualNode(stage.id, placeType.id, 'place-1', {});
        synth.addManualNode(stage.id, placeType.id, 'place-2', {});

        return synth;
      },
      run: async ({ page, interview, stage, protocol }) => {
        await expect(stage.categoricalBin.drawerToggle).toContainText(
          '3 unplaced',
        );

        // Dead config: label is menu-only, interviewScript never renders.
        await expect(page.getByText('Categorise People')).toHaveCount(0);
        await expect(page.getByText('Author note, never shown')).toHaveCount(0);

        // Place nodes never appear in the drawer or any bin.
        await expect(page.getByRole('button', { name: 'place-1' })).toHaveCount(
          0,
        );
        await expect(page.getByRole('button', { name: 'place-2' })).toHaveCount(
          0,
        );

        await stage.categoricalBin.dragNodeToBin('Alice', 'Family');
        await stage.categoricalBin.dragNodeToBin('Bob', 'Work');
        await stage.categoricalBin.dragNodeToBin('Carol', 'School');

        const state = await protocol.getNetworkState(interview.interviewId);
        const byName = (name: string) =>
          state!.nodes.find((n) =>
            Object.values(n.attributes ?? {}).includes(name),
          )!;

        expect(byName('Alice').attributes).toMatchObject({});
        // Category variable UUIDs are generated; match by option value instead.
        const categoryVarId = Object.keys(byName('Alice').attributes).find(
          (k) => Array.isArray(byName('Alice').attributes[k]),
        )!;
        expect(byName('Alice').attributes[categoryVarId]).toEqual([1]);
        expect(byName('Bob').attributes[categoryVarId]).toEqual([2]);
        expect(byName('Carol').attributes[categoryVarId]).toEqual([3]);

        // Place nodes remain empty throughout.
        const placeNodes = state!.nodes.filter((n) => n.type === 'place');
        for (const p of placeNodes) {
          expect(Object.keys(p.attributes ?? {})).toEqual(
            expect.arrayContaining([]),
          );
        }

        await expect(stage.categoricalBin.drawerToggle).toContainText(
          '0 unplaced',
        );
        expect(await interview.nextButtonHasPulse()).toBe(true);
      },
    },
    {
      id: 'other-bin-full-flow',
      covers: [
        'prompts[].otherVariable',
        'prompts[].otherVariablePrompt',
        'prompts[].otherOptionLabel',
        'other-dialog-submit-writes-other-clears-variable',
        'other-dialog-cancel-noop',
        'regular-bin-drop-clears-other-variable',
      ],
      build: () => {
        const synth = new SyntheticInterview();
        const personType = synth.addNodeType({ name: 'Person' });
        const personName = personType.addVariable({
          name: 'name',
          type: 'text',
        });
        const categoryVar = personType.addVariable({
          name: 'Category',
          type: 'categorical',
          options: [
            { label: 'Family', value: 1 },
            { label: 'Work', value: 2 },
          ],
        });
        const otherReason = personType.addVariable({
          name: 'Other Reason',
          type: 'text',
        });

        const stage = synth.addStage('CategoricalBin', {
          subject: { entity: 'node', type: personType.id },
          initialNodes: { count: 3 },
        });
        stage.addPrompt({
          variable: categoryVar.id,
          otherVariable: otherReason.id,
          otherVariablePrompt: 'Please specify:',
          otherOptionLabel: 'Other',
        });

        synth.setNodeAttribute(0, personName.id, 'Alice');
        synth.setNodeAttribute(1, personName.id, 'Bob');
        synth.setNodeAttribute(2, personName.id, 'Carol');
        // Carol starts already in the Other bin so the "move to a regular
        // bin clears otherVariable" assertion doesn't need a prior dialog.
        synth.setNodeAttribute(2, otherReason.id, 'Pre-seeded other reason');

        return synth;
      },
      run: async ({ page, interview, stage, protocol }) => {
        // --- Submit flow: Alice into Other, fills the dialog, submits.
        await stage.categoricalBin.dragNodeToBin('Alice', 'Other');

        const dialog = page.getByRole('dialog');
        await expect(dialog.getByText('Please specify:')).toBeVisible();
        await dialog.getByRole('textbox').fill('Gym buddy');
        await page.getByTestId('dialog-submit').click();
        await expect(dialog).not.toBeVisible();

        let state = await protocol.getNetworkState(interview.interviewId);
        const byName = (name: string) =>
          state!.nodes.find((n) =>
            Object.values(n.attributes ?? {}).includes(name),
          )!;
        const categoryVarId = Object.keys(byName('Bob').attributes).find(
          (k) => k !== undefined && Array.isArray(byName('Bob').attributes[k]),
        );
        const otherVarId = Object.keys(byName('Alice').attributes).find(
          (k) => byName('Alice').attributes[k] === 'Gym buddy',
        )!;
        expect(Object.keys(byName('Alice').attributes)).not.toContain(
          'Gym buddy',
        );
        expect(byName('Alice').attributes[otherVarId]).toBe('Gym buddy');
        if (categoryVarId) {
          expect(byName('Alice').attributes[categoryVarId] ?? null).toBeNull();
        }
        await expect(stage.categoricalBin.getNodeInDrawer('Alice')).toHaveCount(
          0,
        );
        expect(await stage.categoricalBin.getNodeCountInBin('Other')).toBe(2);

        // --- Cancel flow: Bob into Other, dialog cancelled, no-op.
        await stage.categoricalBin.dragNodeToBin('Bob', 'Other');
        const cancelDialog = page.getByRole('dialog');
        await expect(cancelDialog).toBeVisible();
        await page.getByTestId('dialog-cancel').click();
        await expect(cancelDialog).not.toBeVisible();

        state = await protocol.getNetworkState(interview.interviewId);
        const bobAfterCancel = state!.nodes.find((n) =>
          Object.values(n.attributes ?? {}).includes('Bob'),
        )!;
        expect(bobAfterCancel.attributes[otherVarId]).toBeUndefined();
        // Bob remains in the drawer (still uncategorised), Other bin count
        // is still 2 (Alice + pre-seeded Carol), not 3.
        await expect(stage.categoricalBin.getNodeInDrawer('Bob')).toBeVisible();
        expect(await stage.categoricalBin.getNodeCountInBin('Other')).toBe(2);

        // --- Regular-bin drop clears otherVariable: move Carol out of Other.
        await stage.categoricalBin.moveNodeBetweenBins(
          'Carol',
          'Other',
          'Family',
        );
        state = await protocol.getNetworkState(interview.interviewId);
        const carol = state!.nodes.find((n) =>
          Object.values(n.attributes ?? {}).includes('Carol'),
        )!;
        expect(carol.attributes[otherVarId]).toBeNull();
        if (categoryVarId) expect(carol.attributes[categoryVarId]).toEqual([1]);
        expect(await stage.categoricalBin.getNodeCountInBin('Other')).toBe(1);
      },
    },
    {
      id: 'multi-value-and-empty-array-membership',
      covers: ['multi-value-membership', 'empty-array-treated-as-unset'],
      build: () => {
        const synth = new SyntheticInterview();
        const personType = synth.addNodeType({ name: 'Person' });
        const personName = personType.addVariable({
          name: 'name',
          type: 'text',
        });
        const categoryVar = personType.addVariable({
          name: 'Category',
          type: 'categorical',
          options: [
            { label: 'Family', value: 1 },
            { label: 'Work', value: 2 },
            { label: 'School', value: 3 },
          ],
        });

        const stage = synth.addStage('CategoricalBin', {
          subject: { entity: 'node', type: personType.id },
          initialNodes: { count: 3 },
        });
        stage.addPrompt({ variable: categoryVar.id });

        synth.setNodeAttribute(0, personName.id, 'Multi');
        synth.setNodeAttribute(0, categoryVar.id, [1, 2]);
        synth.setNodeAttribute(1, personName.id, 'Empty');
        synth.setNodeAttribute(1, categoryVar.id, []);
        synth.setNodeAttribute(2, personName.id, 'Unset');
        // node 2: no categoryVar attribute set at all (undefined)

        return synth;
      },
      run: async ({ interview, stage, protocol }) => {
        expect(await stage.categoricalBin.getNodeCountInBin('Family')).toBe(1);
        expect(await stage.categoricalBin.getNodeCountInBin('Work')).toBe(1);
        await expect(stage.categoricalBin.drawerToggle).toContainText(
          '2 unplaced',
        );
        await expect(
          stage.categoricalBin.getNodeInDrawer('Empty'),
        ).toBeVisible();
        await expect(
          stage.categoricalBin.getNodeInDrawer('Unset'),
        ).toBeVisible();

        await stage.categoricalBin.dragNodeToBin('Multi', 'School');

        const state = await protocol.getNetworkState(interview.interviewId);
        const multi = state!.nodes.find((n) =>
          Object.values(n.attributes ?? {}).includes('Multi'),
        )!;
        const categoryVarId = Object.keys(multi.attributes).find((k) =>
          Array.isArray(multi.attributes[k]),
        )!;
        expect(multi.attributes[categoryVarId]).toEqual([3]);
        expect(await stage.categoricalBin.getNodeCountInBin('Family')).toBe(0);
        expect(await stage.categoricalBin.getNodeCountInBin('Work')).toBe(0);
      },
    },
    {
      id: 'other-option-label-dead-config',
      covers: ['other-option-label-without-other-variable-dead-config'],
      build: () => {
        const synth = new SyntheticInterview();
        const personType = synth.addNodeType({ name: 'Person' });
        const personName = personType.addVariable({
          name: 'name',
          type: 'text',
        });
        const categoryVar = personType.addVariable({
          name: 'Category',
          type: 'categorical',
          options: [
            { label: 'Family', value: 1 },
            { label: 'Work', value: 2 },
          ],
        });
        const stage = synth.addStage('CategoricalBin', {
          subject: { entity: 'node', type: personType.id },
          initialNodes: { count: 2 },
        });
        stage.addPrompt({
          variable: categoryVar.id,
          otherOptionLabel: 'Other',
          // otherVariable intentionally omitted: this is the dead config
          // under test (useCategoricalBins.ts:125 requires BOTH
          // otherVariable AND otherOptionLabel to push an Other bin) —
          // setting otherOptionLabel alone is a silent no-op.
        });

        synth.setNodeAttribute(0, personName.id, 'Alice');
        synth.setNodeAttribute(1, personName.id, 'Bob');

        return synth;
      },
      run: async ({ page, stage }) => {
        // No Other bin renders: useCategoricalBins.ts:125's
        // `if (otherVariable && otherOptionLabel)` guard is not satisfied.
        await expect(
          page.getByRole('button', { name: /^Category Other/ }),
        ).toHaveCount(0);
        // Bin count matches the codebook's 2 options, not 3.
        await expect(page.locator('.catbin-item')).toHaveCount(2);
        // otherOptionLabel alone provides no way to categorise a node:
        // both nodes remain uncategorised in the drawer.
        await expect(stage.categoricalBin.drawerToggle).toContainText(
          '2 unplaced',
        );
      },
    },
    // ... re-bin-move-between-bins, bucket-sort-order-drawer,
    // bin-sort-order-within-bin, bin-expand-collapse-interactions,
    // duplicate-labels-and-color-cycling, multi-prompt-markdown-pips:
    // build()/run() per the scenario table rows above, following the exact
    // same builder/fixture calls shown in these four (addNodeType/
    // addVariable/addStage/addPrompt/setNodeAttribute/addManualNode,
    // stage.categoricalBin.* helpers, protocol.getNetworkState).
  ],
};
```

Notes on the coded scenarios:

- `getNetworkState()`'s node attribute keys are generated UUIDs (not the builder's returned `.id` in every case — the returned `VariableRef.id` IS the UUID actually written into `attributes`, since `addVariableToNodeType` returns the same id used as the map key). Prefer asserting via the builder-returned `categoryVar.id` / `otherReason.id` directly rather than the `Object.keys(...).find(...)` fallback shown above wherever the id is already in scope from `build()`'s closure — the fallback lookups above exist only because `run()` doesn't have access to `build()`'s local variables across the two functions in this registry pattern. **Correction for the real implementation**: hoist `categoryVarId`/`otherVarId` etc. into scenario-level `let` variables captured by both `build` and `run` closures (a scenario definition is a single object literal — `build` and `run` can close over the same outer `let categoryVarId: string` declared just above the object), rather than re-deriving them from `getNetworkState()` by value-matching. This avoids the fragile `Object.keys(...).find(...)` pattern entirely and is the pattern the other 3 interface tasks should also use.
- Node `type` field in `getNetworkState()` results is the node type's id (a generated string like `node-type-42-1`), not the literal `'place'` used in the table's prose — filter Place nodes by `n.type === placeType.id` (captured from `build()`'s closure), not by a literal string.

- [ ] **Step 1: Write the registry + inventory entry + spec file**

  Write `e2e/matrix/categorical-bin.scenarios.ts` with all 10 scenarios (3 fully coded above; the remaining 7 per the scenario table, using the hoisted-variable-id pattern noted above instead of value-matching). Write `e2e/specs/matrix/categorical-bin.spec.ts`:

  ```ts
  import { categoricalBinScenarios } from '../../matrix/categorical-bin.scenarios.js';
  import { defineScenarioTests } from '../../matrix/run-scenario.js';

  defineScenarioTests(categoricalBinScenarios);
  ```

  Add the `CategoricalBin` entry to `e2e/matrix/option-inventory.ts` (code above). Append `categoricalBinScenarios` to `ALL_SUITES` in `e2e/matrix/coverage-manifest.test.ts` (and `all-scenarios.ts` if it exists yet).

- [ ] **Step 2: Run the coverage manifest**: `pnpm --filter @codaco/interview exec vitest run e2e/matrix` — Expected: PASS (every `CategoricalBin` inventory key claimed by a scenario or by `sharedSuiteClaims`; `skipLogic`/`filter` will only pass once Task 26 adds `CategoricalBin:skipLogic`/`CategoricalBin:filter` to `shared-claims.ts` — if Task 26 hasn't landed yet, this is an expected, temporary failure limited to those two keys; do not add scenarios here to work around it).

- [ ] **Step 3: Run the scenarios**: `pnpm --filter @codaco/interview test:e2e:headed -- --project=chromium-matrix --grep "CategoricalBin"` — Expected: PASS; commit new `e2e/aria-snapshots/chromium/*.aria.yml` baselines generated on first run.

- [ ] **Step 4: Typecheck + commit** with message `test(interview-e2e): CategoricalBin configuration matrix`

### Task 14: OrdinalBin matrix scenarios

**Files:**

- Create: `e2e/matrix/ordinal-bin.scenarios.ts`
- Create: `e2e/specs/matrix/ordinal-bin.spec.ts`
- Modify: `e2e/matrix/option-inventory.ts` (add the `OrdinalBin` entry — full code below)
- Modify: `e2e/matrix/coverage-manifest.test.ts` (append `import { ordinalBinScenarios } from './ordinal-bin.scenarios.js';` and add `ordinalBinScenarios` to the `ALL_SUITES` array)
- No changes to `e2e/fixtures/stage-fixture.ts` — `OrdinalBinFixture` (stage-fixture.ts:410-505) and the shared `navigateDndToTarget` keyboard-DnD helper (stage-fixture.ts:35-70) already cover every interaction this interface needs. No fixture work is assigned to this task.

**Interfaces:**

- Consumes: `ScenarioDefinition`/`InterfaceScenarios`/`defineScenarioTests` (Task 6), `SyntheticInterview` builder incl. `addStage('OrdinalBin', …)`, `.addPrompt`, `addVariableToNodeType`/node-type `addVariable`, `setNodeAttribute`, `addManualNode` (Task 1/2), seeded interviews via `currentStep`/`seedNetwork` (Task 3), `stage.ordinalBin` (`OrdinalBinFixture`, already implemented in `e2e/fixtures/stage-fixture.ts`), `interview.nextButtonHasPulse()`/`interview.nextButton`/`interview.next()` (already implemented in `e2e/fixtures/interview-fixture.ts:168-197`).
- Produces: `ordinalBinScenarios: InterfaceScenarios` (interface type `'OrdinalBin'`) for the coverage manifest and the `chromium-matrix`/`*-visual` Playwright projects to pick up.

**Option inventory entry**

```ts
// e2e/matrix/option-inventory.ts — add alongside the existing Information entry
export const OPTION_INVENTORY: Record<string, readonly string[]> = {
  Information: [
    /* ...existing... */
  ],
  OrdinalBin: [
    'type',
    'id',
    'label',
    'interviewScript',
    'skipLogic',
    'subject',
    'filter',
    'prompts',
    'prompts[].id',
    'prompts[].text',
    'prompts[].variable',
    'prompts[].bucketSortOrder',
    'prompts[].binSortOrder',
    'prompts[].color',
    'codebook.ordinalOptions',
  ],
};
```

Notes on this list: it is exactly the 16 entries of the dive file's `options` array, minus the fact that `(codebook) ordinal variable options` is renamed to the more traceable `codebook.ordinalOptions` key, used both for plain bin derivation (labels/order/count) and the negative-value "missing bin" sub-case. `skipLogic` is claimed only by the shared cross-cutting suite (Task 26) — no scenario below targets it, but it must remain listed here so the manifest's schema-key walk (which will see `skipLogic` as a top-level Zod key of `ordinalBinStage`, `packages/protocol-validation/src/schemas/8/stages/ordinal-bin.ts:9-27` + `base.ts:8-18`) doesn't flag it as missing from the inventory. `type` and `id` have no observable participant-facing effect (`type` only selects the interface via the stage registry; `id` only appears inside internal DnD list ids, `OrdinalBinItem.tsx:130`) — both are folded as trivial/absence-style claims into the `core-binning-and-bin-derivation` scenario rather than getting dedicated scenarios.

**Scenario table**

| id                                     | covers                                                                                                                      | flags             | protocol config (exact builder calls)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | interaction                                                                                                                                                                                                                                                                                                                                                                                                                                  | functional assertions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `core-binning-and-bin-derivation`      | `type`, `id`, `label`, `interviewScript`, `prompts[].id`, `prompts[].text`, `prompts[].variable`, `codebook.ordinalOptions` | `smoke`, `visual` | 1 node type `Person` (default `addNodeType()`); ordinal variable `Closeness` w/ 3 options `[{label:'Not close',value:1},{label:'Close',value:2},{label:'**Very** close',value:3}]` added via `nodeType.addVariable({name:'Closeness', type:'ordinal', options:[...]})`; `stage = synth.addStage('OrdinalBin', {label:'Rate Closeness', interviewScript:'Read this prompt aloud before starting.', subject:{entity:'node', type:nodeType.id}})`; `stage.addPrompt({text:'How close are you to *these* people?', variable: closenessVar.id})`; seed 3 manual nodes (Alice/Bob/Carol) via `addManualNode(stage.id, nodeType.id, uid, {[nameVar.id]: name, [closenessVar.id]: null})` | `stage.ordinalBin.dragNodeToBin('Alice', 'Very close')` via keyboard DnD                                                                                                                                                                                                                                                                                                                                                                     | Bin count = 3, headings in authored order incl. `<strong>Very</strong>` inside the `ordinal-bin-2` heading (`RenderMarkdown`, `OrdinalBinItem.tsx:168`); `stage.ordinalBin.isNodeInBin('Alice','Very close')` true; drawer reads `2 unplaced`; `getNetworkState` shows Alice's `closenessVar.id` attribute `=== 3`; prompt text renders an `<em>these</em>`; `page.getByText('Rate Closeness')` has count 0 in the stage region and `page.getByText('Read this prompt aloud')` has count 0 anywhere in the DOM (dead-config absence for `label`/`interviewScript`) |
| `rebinning-noop-and-drawer-no-unplace` | `prompts[].variable`                                                                                                        | —                 | Same 3-option Closeness protocol; seed Bob pre-assigned `value: 1` (in bin `Not close`), Carol unplaced (`null`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `stage.ordinalBin.moveNodeBetweenBins('Bob','Not close','Very close')`, assert network flips 1→3; drag Bob onto `Very close` again (same bin) via `navigateDndToTarget`; during a fresh `Control+d` pickup of Carol from the drawer, poll all DnD announcements while arrowing through targets and assert none contains `'Drawer'`                                                                                                           | After first move, `getNetworkState` Bob attribute `=== 3`; second same-bin drop leaves attribute `=== 3` and node still visible only in `Very close` (no duplicate/DOM move, guarded no-op per `OrdinalBinItem.tsx:97-99`); announcement scan never includes `'Drawer'` as a drop target (`NodeDrawer` mounted without `dropTarget`, `OrdinalBin.tsx:80`)                                                                                                                                                                                                          |
| `unplaced-out-of-range-and-readiness`  | `prompts[].variable`                                                                                                        | —                 | Same protocol; seed Dana `value: null`, Erin `value: 99` (out of the 1/2/3 option range)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `stage.ordinalBin.getUnplacedCount()` before any drop; `stage.ordinalBin.dragNodeToBin('Dana','Close')`; `stage.ordinalBin.dragNodeToBin('Erin','Not close')`                                                                                                                                                                                                                                                                                | Before drops: `getUnplacedCount() === 2` and both Dana and Erin render in the drawer, neither in any bin (`isUnplaced`, `useOrdinalBins.ts:31-37`); before the final drop `await interview.nextButtonHasPulse()` is `false`; after both drops `getUnplacedCount() === 0` and `await interview.nextButtonHasPulse()` is `true` (`Navigation.tsx:291-292`)                                                                                                                                                                                                           |
| `missing-value-bin`                    | `codebook.ordinalOptions`                                                                                                   | `visual`          | New ordinal variable `Availability` with options `[{label:'N/A',value:-1},{label:'Low',value:1},{label:'Medium',value:2},{label:'High',value:3}]`; second prompt on the same stage `stage.addPrompt({text:'Rate availability', variable: availabilityVar.id})`; seed Frank unplaced                                                                                                                                                                                                                                                                                                                                                                                               | Navigate to prompt 2 (`interview.next()` from prompt 1, or seed `currentStep` directly at this stage with the prompt-2 index reachable via one `Next` press since prompts render within the same stage); `stage.ordinalBin.dragNodeToBin('Frank','N/A')`                                                                                                                                                                                     | `getNetworkState` Frank's `availabilityVar.id` `=== -1`; the `N/A` bin's accent element (`ordinal-bin-0` in this option order) has class `bg-surface-2` (not the `color-mix` gradient class) while the `Low`/`Medium`/`High` bins' accent elements do NOT have `bg-surface-2` (`OrdinalBinItem.tsx:142-153`); node renders inside the `N/A` bin's `listbox`                                                                                                                                                                                                        |
| `multi-prompt-pips-navigation`         | `prompts`                                                                                                                   | —                 | 2 prompts on 2 different ordinal variables of the same subject: prompt 1 → `Closeness` (3 options, as above), prompt 2 → `Availability` (3 options, no N/A); seed 1 node `Gina` unplaced on both variables                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `stage.ordinalBin.dragNodeToBin('Gina','Very close')` on prompt 1; assert 2 pip dots with the first active; `interview.next()` (advances the prompt, not the stage); assert prompt text now shows the availability prompt and bins now show the availability labels; assert Gina renders unplaced again (her `Availability` value is still null even though `Closeness` is set); `interview.next()` again (last prompt → advances the stage) | Pips: `page.locator('[data-testid=prompt]')` text changes between the two prompt strings; `getNetworkState` shows BOTH `closenessVar.id === 3` and `availabilityVar.id` still `null` after the prompt switch; after placing Gina on prompt 2 and pressing Next, the stage advances (assert via the next stage's content becoming visible)                                                                                                                                                                                                                          |
| `prompt-color-variants`                | `prompts[].color`                                                                                                           | `visual`          | 3 prompts on the same `Closeness` variable (re-using `variable: closenessVar.id` across prompts is valid — each prompt is an independent binning pass over the same attribute): prompt 1 `color: undefined` (omitted), prompt 2 `color: 'ord-color-seq-1'`, prompt 3 `color: 'ord-color-seq-5'`                                                                                                                                                                                                                                                                                                                                                                                   | Navigate prompt 1 → 2 → 3 via `interview.next()` (twice), reading a bin's accent element computed style at each stop                                                                                                                                                                                                                                                                                                                         | `getComputedStyle` (via `page.evaluate`) of an `ordinal-bin-0` accent `div` resolves `--prompt-color` to `var(--ord-1)` (or its computed color) on BOTH prompt 1 (default branch, `OrdinalBinItem.tsx:62`) and prompt 2 (explicit `ord-color-seq-1`) — i.e. they resolve to the identical computed background color; on prompt 3 the computed background differs from prompts 1/2 (resolves `var(--ord-5)`)                                                                                                                                                        |
| `sort-orders-bucket-and-bin`           | `prompts[].bucketSortOrder`, `prompts[].binSortOrder`                                                                       | —                 | Prompt 1 on `Closeness`: `bucketSortOrder: [{property: nameVar.id, direction:'desc'}]`; seed 4 unplaced nodes in creation order Dana, Alice, Carol, Bob (only `name` set, `Closeness` null). Prompt 2, second stage prompt on the same variable: `binSortOrder: [{property: nameVar.id, direction:'asc'}]`, no `bucketSortOrder`; seed (via the SAME network, since it's the same subject/stage) 3 additional nodes Zed, Ann, Mia all pre-assigned `Closeness: 2` (bin `Close`)                                                                                                                                                                                                   | On prompt 1: read the drawer's node buttons in DOM order (no drag needed); advance to prompt 2 via `interview.next()`; read the `Close` bin's `listbox` option order                                                                                                                                                                                                                                                                         | Prompt 1 drawer order: `Dana, Carol, Bob, Alice` (string `desc` sort on `name`, `createSorter.ts:409-450`); prompt 2 `Close` bin (`ordinal-bin-1`) option order: `Ann, Mia, Zed` (asc name sort within the bin, `useSortedNodeList` via `OrdinalBinItem.tsx:128`); assert via `stage.ordinalBin.getBinNodeList('Close').getByRole('option').allTextContents()`                                                                                                                                                                                                     |
| `subject-and-filter-scoping`           | `subject`, `filter`                                                                                                         | —                 | 2 node types `Person` and `Place`; `Person` gets `Closeness` (ordinal, 3 options) + a boolean `eligible` variable (`nodeType.addVariable({name:'eligible', type:'boolean'})`); seed 4 Person nodes (2 with `eligible: true`, 2 with `eligible: false`, all `Closeness: null`) and 2 Place nodes (irrelevant type, `Closeness` attribute doesn't even apply to them); `stage = synth.addStage('OrdinalBin', {subject:{entity:'node', type:personType.id}, filter:{rules:[{type:'node', id:'r1', options:{attribute: eligibleVar.id, operator:'EXACTLY', value:true}}]}})`                                                                                                          | `stage.ordinalBin.getUnplacedCount()`; drag both eligible Persons into any bin                                                                                                                                                                                                                                                                                                                                                               | `getUnplacedCount() === 2` (only the 2 eligible Person nodes are drawn — Place nodes never counted, ineligible Persons filtered out before subject-type filtering per `selectors/session.ts:264-291,469-482`); after placing both, `await interview.nextButtonHasPulse()` is `true` even though the 2 ineligible Person nodes and both Place nodes remain unplaced-in-principle; `getNetworkState` shows the 2 filtered-out Person nodes' `Closeness` attribute still `null` and both Place nodes untouched                                                        |
| `portrait-layout`                      | _(no inventory key — responsive layout, not a schema option; not required by the coverage manifest)_                        | `chromiumOnly`    | Same 3-option `Closeness` protocol as `core-binning-and-bin-derivation`; seed 1 unplaced node `Hana`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `page.setViewportSize({width: 500, height: 900})` before interacting; `stage.ordinalBin.dragNodeToBin('Hana','Close')`                                                                                                                                                                                                                                                                                                                       | Node list within `ordinal-bin-1` reports `aria-orientation="horizontal"` (or the `orientation` prop threaded to `NodeList`/base list component) once in portrait, vs `vertical` at the default desktop viewport (assert via a second instantiation at 1280x800 in the same `run`, or trust the `initial`/`final` aria snapshots taken automatically by the runner to diff the two orientations); drag-drop still writes the value (`getNetworkState` Hana's `Closeness === 2`)                                                                                     |

**Fully-coded scenarios**

```ts
// e2e/matrix/ordinal-bin.scenarios.ts
import { SyntheticInterview } from '@codaco/protocol-utilities';
import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
} from '@codaco/shared-consts';

import { expect } from '../fixtures/matrix-test.js';
import type { InterfaceScenarios } from './types.js';

export const ordinalBinScenarios: InterfaceScenarios = {
  interfaceType: 'OrdinalBin',
  scenarios: [
    (() => {
      // Shared across build()/run() via closure: both variable ids are
      // generated inside build() and read back inside run() to look up
      // network attributes (entityAttributesProperty is keyed by variable
      // UUID, never by the human-readable variable name).
      let nameVarId = '';
      let closenessVarId = '';
      const aliceUid = 'n-Alice';
      return {
        id: 'core-binning-and-bin-derivation',
        covers: [
          'type',
          'id',
          'label',
          'interviewScript',
          'prompts[].id',
          'prompts[].text',
          'prompts[].variable',
          'codebook.ordinalOptions',
        ],
        smoke: true,
        visual: true,
        build: () => {
          const synth = new SyntheticInterview();
          const person = synth.addNodeType({ name: 'Person' });
          const nameVar = person.addVariable({ name: 'name', type: 'text' });
          const closeness = person.addVariable({
            name: 'Closeness',
            type: 'ordinal',
            options: [
              { label: 'Not close', value: 1 },
              { label: 'Close', value: 2 },
              { label: '**Very** close', value: 3 },
            ],
          });
          nameVarId = nameVar.id;
          closenessVarId = closeness.id;
          const stage = synth.addStage('OrdinalBin', {
            label: 'Rate Closeness',
            interviewScript: 'Read this prompt aloud before starting.',
            subject: { entity: 'node', type: person.id },
          });
          stage.addPrompt({
            text: 'How close are you to *these* people?',
            variable: closeness.id,
          });
          for (const name of ['Alice', 'Bob', 'Carol']) {
            synth.addManualNode(stage.id, person.id, `n-${name}`, {
              [nameVar.id]: name,
              [closeness.id]: null,
            });
          }
          return synth;
        },
        seedNetwork: true,
        run: async ({ page, interview, stage, protocol }) => {
          // Bins derived from codebook options: count, order, markdown label
          const bins = page.locator('[data-testid^="ordinal-bin-"]');
          await expect(bins).toHaveCount(3);
          await expect(
            page.getByRole('heading', { level: 4, name: 'Not close' }),
          ).toBeVisible();
          await expect(
            page
              .locator('[data-testid="ordinal-bin-2"]')
              .locator('strong', { hasText: 'Very' }),
          ).toBeVisible();

          // Prompt text markdown
          await expect(page.locator('[data-testid="prompt"] em')).toHaveText(
            'these',
          );

          // Core drag + network write
          await stage.ordinalBin.dragNodeToBin('Alice', 'Very close');
          expect(
            await stage.ordinalBin.isNodeInBin('Alice', 'Very close'),
          ).toBe(true);
          expect(await stage.ordinalBin.getUnplacedCount()).toBe(2);

          const network = await protocol.getNetworkState(interview.interviewId);
          const alice = network?.nodes.find(
            (n) => n[entityPrimaryKeyProperty] === aliceUid,
          );
          expect(alice?.[entityAttributesProperty][nameVarId]).toBe('Alice');
          expect(alice?.[entityAttributesProperty][closenessVarId]).toBe(3);

          // Dead config: label/interviewScript never render in the stage region
          await expect(page.getByText('Rate Closeness')).toHaveCount(0);
          await expect(
            page.getByText('Read this prompt aloud before starting.'),
          ).toHaveCount(0);
        },
      };
    })(),
    (() => {
      // Shared across build()/run() via closure: the two ordinal variable ids
      // are generated inside build() and read back inside run() for network
      // attribute assertions.
      let closenessVarId = '';
      let availabilityVarId = '';
      return {
        id: 'multi-prompt-pips-navigation',
        covers: ['prompts'],
        build: () => {
          const synth = new SyntheticInterview();
          const person = synth.addNodeType({ name: 'Person' });
          const nameVar = person.addVariable({ name: 'name', type: 'text' });
          const closeness = person.addVariable({
            name: 'Closeness',
            type: 'ordinal',
            options: [
              { label: 'Not close', value: 1 },
              { label: 'Close', value: 2 },
              { label: 'Very close', value: 3 },
            ],
          });
          const availability = person.addVariable({
            name: 'Availability',
            type: 'ordinal',
            options: [
              { label: 'Low', value: 1 },
              { label: 'Medium', value: 2 },
              { label: 'High', value: 3 },
            ],
          });
          closenessVarId = closeness.id;
          availabilityVarId = availability.id;
          const stage = synth.addStage('OrdinalBin', {
            subject: { entity: 'node', type: person.id },
          });
          stage.addPrompt({ text: 'Rate closeness', variable: closeness.id });
          stage.addPrompt({
            text: 'Rate availability',
            variable: availability.id,
          });
          synth.addManualNode(stage.id, person.id, 'n-gina', {
            [nameVar.id]: 'Gina',
            [closeness.id]: null,
            [availability.id]: null,
          });
          return synth;
        },
        seedNetwork: true,
        run: async ({ page, interview, stage, protocol }) => {
          await expect(page.locator('[data-testid="prompt"]')).toHaveText(
            'Rate closeness',
          );
          await stage.ordinalBin.dragNodeToBin('Gina', 'Very close');

          await interview.next(); // advances prompt, not stage
          await expect(page.locator('[data-testid="prompt"]')).toHaveText(
            'Rate availability',
          );
          // Bins re-rendered for the new variable's options
          await expect(
            page.getByRole('heading', { level: 4, name: 'Low' }),
          ).toBeVisible();
          // Gina is unplaced again: her Availability attribute is still null
          expect(await stage.ordinalBin.getUnplacedCount()).toBe(1);

          let network = await protocol.getNetworkState(interview.interviewId);
          let gina = network?.nodes.find(
            (n) => n[entityAttributesProperty]['name'] === 'Gina',
          );
          expect(gina?.[entityAttributesProperty][closenessVarId]).toBe(3);
          expect(
            gina?.[entityAttributesProperty][availabilityVarId],
          ).toBeNull();

          await stage.ordinalBin.dragNodeToBin('Gina', 'High');
          await interview.next(); // last prompt: advances the stage
          network = await protocol.getNetworkState(interview.interviewId);
          gina = network?.nodes.find(
            (n) => n[entityAttributesProperty]['name'] === 'Gina',
          );
          expect(gina?.[entityAttributesProperty][closenessVarId]).toBe(3);
          expect(gina?.[entityAttributesProperty][availabilityVarId]).toBe(3);
        },
      };
    })(),
    (() => {
      // Shared across build()/run() via closure: the Availability variable id
      // is generated inside build() and read back inside run() for the
      // network attribute assertion.
      let availabilityVarId = '';
      return {
        id: 'missing-value-bin',
        covers: ['codebook.ordinalOptions'],
        visual: true,
        build: () => {
          const synth = new SyntheticInterview();
          const person = synth.addNodeType({ name: 'Person' });
          const nameVar = person.addVariable({ name: 'name', type: 'text' });
          const closeness = person.addVariable({
            name: 'Closeness',
            type: 'ordinal',
            options: [
              { label: 'Not close', value: 1 },
              { label: 'Close', value: 2 },
              { label: 'Very close', value: 3 },
            ],
          });
          const availability = person.addVariable({
            name: 'Availability',
            type: 'ordinal',
            options: [
              { label: 'N/A', value: -1 },
              { label: 'Low', value: 1 },
              { label: 'Medium', value: 2 },
              { label: 'High', value: 3 },
            ],
          });
          availabilityVarId = availability.id;
          const stage = synth.addStage('OrdinalBin', {
            subject: { entity: 'node', type: person.id },
          });
          stage.addPrompt({ text: 'Rate closeness', variable: closeness.id });
          stage.addPrompt({
            text: 'Rate availability',
            variable: availability.id,
          });
          synth.addManualNode(stage.id, person.id, 'n-frank', {
            [nameVar.id]: 'Frank',
            [closeness.id]: null,
            [availability.id]: null,
          });
          return synth;
        },
        seedNetwork: true,
        run: async ({ page, interview, stage, protocol }) => {
          // Advance from prompt 1 (Closeness) to prompt 2 (Availability),
          // whose options include the negative-value "N/A" bin.
          await interview.next();
          await expect(page.locator('[data-testid="prompt"]')).toHaveText(
            'Rate availability',
          );

          // Bins render in authored option order, so the N/A bin (value -1)
          // is ordinal-bin-0 (useOrdinalBins.ts:55-70 maps ordinalOptions in
          // array order). Its accent element gets the flat bg-surface-2
          // class instead of the color-mix gradient (OrdinalBinItem.tsx:
          // 142-148 `missingValue ? 'bg-surface-2' : 'bg-[color-mix(...)]'`,
          // with `missingValue` from `isMissingValue` at OrdinalBinItem.tsx:
          // 45-48).
          const naAccent = page
            .locator('[data-testid="ordinal-bin-0"] > div')
            .first();
          await expect(naAccent).toHaveClass(/bg-surface-2/);
          const lowAccent = page
            .locator('[data-testid="ordinal-bin-1"] > div')
            .first();
          await expect(lowAccent).not.toHaveClass(/bg-surface-2/);
          const mediumAccent = page
            .locator('[data-testid="ordinal-bin-2"] > div')
            .first();
          await expect(mediumAccent).not.toHaveClass(/bg-surface-2/);
          const highAccent = page
            .locator('[data-testid="ordinal-bin-3"] > div')
            .first();
          await expect(highAccent).not.toHaveClass(/bg-surface-2/);

          await stage.ordinalBin.dragNodeToBin('Frank', 'N/A');
          expect(await stage.ordinalBin.isNodeInBin('Frank', 'N/A')).toBe(true);

          const network = await protocol.getNetworkState(interview.interviewId);
          const frank = network?.nodes.find(
            (n) => n[entityAttributesProperty]['name'] === 'Frank',
          );
          expect(frank?.[entityAttributesProperty][availabilityVarId]).toBe(-1);
        },
      };
    })(),
    (() => {
      return {
        id: 'prompt-color-variants',
        covers: ['prompts[].color'],
        visual: true,
        build: () => {
          const synth = new SyntheticInterview();
          const person = synth.addNodeType({ name: 'Person' });
          const nameVar = person.addVariable({ name: 'name', type: 'text' });
          const closeness = person.addVariable({
            name: 'Closeness',
            type: 'ordinal',
            options: [
              { label: 'Not close', value: 1 },
              { label: 'Close', value: 2 },
              { label: 'Very close', value: 3 },
            ],
          });
          const stage = synth.addStage('OrdinalBin', {
            subject: { entity: 'node', type: person.id },
          });
          // Prompt 1 omits `color`. SyntheticInterview's resolveOrdinalBinPrompt
          // (SyntheticInterview.ts:1337-1346) auto-assigns
          // `opts?.color ?? ORDINAL_COLORS[colorIndex]`, and for the first
          // OrdinalBin prompt on a freshly-constructed builder that resolves
          // to ORDINAL_COLORS[0] === 'ord-color-seq-1' (constants.ts:53-54)
          // — the same value prompt 2 sets explicitly. This still exercises
          // the equivalence the scenario cares about (an unset `color` on
          // the wire renders identically to explicit `ord-color-seq-1`),
          // even though the builder itself never emits a literal `undefined`
          // for the first prompt it authors.
          stage.addPrompt({ text: 'Prompt one', variable: closeness.id });
          stage.addPrompt({
            text: 'Prompt two',
            variable: closeness.id,
            color: 'ord-color-seq-1',
          });
          stage.addPrompt({
            text: 'Prompt three',
            variable: closeness.id,
            color: 'ord-color-seq-5',
          });
          // Prompt 4: `color` is schema-valid (prompts.ts:67 `color:
          // z.string().optional()`) but not one of the ten values
          // getPromptColorClass switches on (OrdinalBinItem.tsx:50-63).
          // None of its `cx()` branches match, and since the value is
          // truthy the `!color` default branch is also skipped, so no
          // `[--prompt-color:...]` utility class is applied at all --
          // confirming an unvalidated color string silently no-ops rather
          // than throwing or falling back to a default.
          stage.addPrompt({
            text: 'Prompt four',
            variable: closeness.id,
            color: 'not-a-real-color',
          });
          synth.addManualNode(stage.id, person.id, 'n-ivy', {
            [nameVar.id]: 'Ivy',
          });
          return synth;
        },
        seedNetwork: true,
        run: async ({ page, interview }) => {
          const accent = page
            .locator('[data-testid="ordinal-bin-0"] > div')
            .first();
          const readPromptColor = () =>
            accent.evaluate((el) =>
              getComputedStyle(el).getPropertyValue('--prompt-color').trim(),
            );

          const promptOneColor = await readPromptColor();
          expect(promptOneColor).toBe('var(--ord-1)');

          await interview.next();
          const promptTwoColor = await readPromptColor();
          expect(promptTwoColor).toBe('var(--ord-1)');
          expect(promptTwoColor).toBe(promptOneColor);

          await interview.next();
          const promptThreeColor = await readPromptColor();
          expect(promptThreeColor).toBe('var(--ord-5)');
          expect(promptThreeColor).not.toBe(promptOneColor);

          await interview.next();
          const promptFourColor = await readPromptColor();
          expect(promptFourColor).toBe('');
        },
      };
    })(),
    (() => {
      let closenessVarId = '';
      const graceUid = 'n-ineligible-1';
      return {
        id: 'subject-and-filter-scoping',
        covers: ['subject', 'filter'],
        build: () => {
          const synth = new SyntheticInterview();
          const person = synth.addNodeType({ name: 'Person' });
          const place = synth.addNodeType({ name: 'Place' });
          const personName = person.addVariable({ name: 'name', type: 'text' });
          const placeName = place.addVariable({ name: 'name', type: 'text' });
          const closeness = person.addVariable({
            name: 'Closeness',
            type: 'ordinal',
            options: [
              { label: 'Not close', value: 1 },
              { label: 'Close', value: 2 },
              { label: 'Very close', value: 3 },
            ],
          });
          closenessVarId = closeness.id;
          const eligible = person.addVariable({
            name: 'eligible',
            type: 'boolean',
          });
          const stage = synth.addStage('OrdinalBin', {
            subject: { entity: 'node', type: person.id },
            filter: {
              rules: [
                {
                  type: 'node',
                  id: 'eligible-only',
                  options: {
                    attribute: eligible.id,
                    operator: 'EXACTLY',
                    value: true,
                  },
                },
              ],
            },
          });
          stage.addPrompt({ text: 'Rate closeness', variable: closeness.id });

          synth.addManualNode(stage.id, person.id, 'n-eligible-1', {
            [personName.id]: 'Eve',
            [closeness.id]: null,
            [eligible.id]: true,
          });
          synth.addManualNode(stage.id, person.id, 'n-eligible-2', {
            [personName.id]: 'Frank',
            [closeness.id]: null,
            [eligible.id]: true,
          });
          synth.addManualNode(stage.id, person.id, graceUid, {
            [personName.id]: 'Grace',
            [closeness.id]: null,
            [eligible.id]: false,
          });
          synth.addManualNode(stage.id, person.id, 'n-ineligible-2', {
            [personName.id]: 'Heidi',
            [closeness.id]: null,
            [eligible.id]: false,
          });
          synth.addManualNode(stage.id, place.id, 'n-place-1', {
            [placeName.id]: 'Library',
          });
          synth.addManualNode(stage.id, place.id, 'n-place-2', {
            [placeName.id]: 'Park',
          });
          return synth;
        },
        seedNetwork: true,
        run: async ({ interview, stage, protocol }) => {
          expect(await stage.ordinalBin.getUnplacedCount()).toBe(2);

          await stage.ordinalBin.dragNodeToBin('Eve', 'Close');
          await stage.ordinalBin.dragNodeToBin('Frank', 'Very close');

          expect(await interview.nextButtonHasPulse()).toBe(true);

          const network = await protocol.getNetworkState(interview.interviewId);
          const grace = network?.nodes.find(
            (n) => n[entityPrimaryKeyProperty] === graceUid,
          );
          expect(grace?.[entityAttributesProperty][closenessVarId]).toBeNull();
          // All 6 seeded nodes (4 Person + 2 Place) survive in the shared
          // network — the stage filter/subject only affect what renders and
          // what blocks readiness, never what's persisted.
          expect(network?.nodes).toHaveLength(6);
        },
      };
    })(),
  ],
};
```

The five scenarios above (`core-binning-and-bin-derivation`, `missing-value-bin`, `prompt-color-variants`, `multi-prompt-pips-navigation`, `subject-and-filter-scoping`) show the full builder+assertion shape, including how variable ids generated inside `build()` are threaded to `run()` via a per-scenario closure (an IIFE returning the `ScenarioDefinition` object) rather than any placeholder value. The remaining four scenarios (`rebinning-noop-and-drawer-no-unplace`, `unplaced-out-of-range-and-readiness`, `sort-orders-bucket-and-bin`, `portrait-layout`) follow the same shape and are fully specified — protocol config, interaction, and assertions — in the Scenario table above; each is directly implementable from its row without consulting any other document.

**Spec file**

```ts
// e2e/specs/matrix/ordinal-bin.spec.ts
import { ordinalBinScenarios } from '../../matrix/ordinal-bin.scenarios.js';
import { defineScenarioTests } from '../../matrix/run-scenario.js';

defineScenarioTests(ordinalBinScenarios);
```

- [ ] **Step 1: Write the registry, inventory entry, and spec file** — `e2e/matrix/ordinal-bin.scenarios.ts` (9 scenarios per the table above, 5 fully coded), `e2e/matrix/option-inventory.ts` (`OrdinalBin` entry), `e2e/specs/matrix/ordinal-bin.spec.ts`. Import and append `ordinalBinScenarios` into `ALL_SUITES` in `e2e/matrix/coverage-manifest.test.ts`.
- [ ] **Step 2: Run the coverage manifest**: `pnpm --filter @codaco/interview exec vitest run e2e/matrix` — Expected: PASS (all `OrdinalBin` inventory keys claimed by >=1 scenario; `skipLogic` satisfied once Task 26's shared-suite claim for `OrdinalBin:skipLogic` lands in `shared-claims.ts` — until then, temporarily add `'OrdinalBin:skipLogic'` to `sharedSuiteClaims` locally to unblock this task's own manifest run, or coordinate merge order with Task 26).
- [ ] **Step 3: Run the scenarios**: `pnpm --filter @codaco/interview test:e2e:headed -- --project=chromium-matrix --grep "OrdinalBin"` — Expected: PASS; commit the newly written `e2e/aria-snapshots/chromium/ordinal-bin-*.aria.yml` baselines. Then `pnpm --filter @codaco/interview test:e2e:headed -- --project=chromium-visual --grep "OrdinalBin"` — Expected: PASS; commit the 3 new `visual-snapshots/chromium-matrix/*.png` baselines, one each for the 3 `visual`-flagged scenarios (`core-binning-and-bin-derivation`, `missing-value-bin`, `prompt-color-variants`) — `portrait-layout` is `chromiumOnly` but not `visual`, so it produces no pixel baseline.
- [ ] **Step 4: Typecheck + commit** with message `test(interview-e2e): OrdinalBin configuration matrix`

### Task 15: DyadCensus matrix scenarios

**Files:**

- Create: `e2e/matrix/dyad-census.scenarios.ts`
- Create: `e2e/specs/matrix/dyad-census.spec.ts`
- Modify: `e2e/matrix/option-inventory.ts` (add the `DyadCensus` entry — full code below)
- Modify: `e2e/matrix/coverage-manifest.test.ts` (append `dyadCensusScenarios` to `ALL_SUITES`) and `e2e/matrix/all-scenarios.ts` if it exists by the time this task lands (append the same import/registration)
- Modify: `e2e/fixtures/stage-fixture.ts` (replace the placeholder `DyadCensusFixture` class with real locators/methods)
- Modify: `e2e/fixtures/window-test.d.ts` (add `__interviewStore` typing — DyadCensus per-prompt answers live in Redux `session.stageMetadata`, not in `window.__test.getNetworkState()`, so scenarios must read the store directly)

**Interfaces:**

- Consumes: `ScenarioDefinition`/`InterfaceScenarios`/`defineScenarioTests` (Task 6), `AddStageInput`/`AddDyadCensusPromptInput` builder API (existing) + `filter`/`skipLogic` extensions (Task 1, unused by this file's scenarios but present in the inventory), seeded interviews via `protocol.installPayload`/`createInterview(..., { network, currentStep, stageMetadata })` (Task 3), `matrixTest`/`ariaSnapshot` (Task 4).
- Produces: `dyadCensusScenarios: InterfaceScenarios` (`interfaceType: 'DyadCensus'`); `StageFixture.dyadCensus` — a real `DyadCensusFixture` with the methods below, consumed by this spec and available to any other task that needs to drive a DyadCensus stage; `window.__interviewStore` typing consumed by any future stage-metadata-reading scenario (TieStrengthCensus, OneToManyDyadCensus placeholders will want the same pattern).

### Stage fixture helpers

Real locators, cited against the source read for this task:

- Radio buttons: `role="radio"`, `data-value="true"|"false"`, `aria-checked` — `packages/fresco-ui/src/form/fields/Boolean.tsx:213-219` (role/data-value), the accessible name comes from the rendered `<span>{option.label}</span>` at `Boolean.tsx:248-250` (labels are literally `'Yes'`/`'No'`, set in `DyadCensus.tsx:329-331`).
- Prompt text container: `data-testid="prompt"` — `packages/interview/src/components/Prompts/Prompt.tsx:33`.
- Pips (multi-prompt indicator): `aria-hidden="true"` container, each dot has `data-active={isActive}` — `packages/fresco-ui/src/Pips.tsx:36,46-52`. No `data-testid`; select via `[data-active]`.
- Intro panel heading: `Heading level="h1"` (renders as an `h1`) — `packages/interview/src/interfaces/SlidesForm/IntroPanel.tsx:22-24`.
- Pair node buttons: `ConnectedNode` → fresco-ui `Node`, a native `<button>` with visible label text (`labelWithEllipsis` span) — `packages/interview/src/components/ConnectedNode.tsx:47-77`, `packages/fresco-ui/src/Node.tsx:289` (label span), `packages/fresco-ui/src/Node.tsx:295-376` (button element). The two buttons for the current pair sit inside the pair container `className="flex w-md items-center"` — `packages/interview/src/components/Pair.tsx:66`.
- sr-only pair label: `<span id={labelId} className="sr-only">{fromLabel} and {toLabel}</span>` — `Pair.tsx:78-82` (only rendered when the caller passes `labelId`, which `DyadCensus.tsx:305` does).
- Edge connector div: the `motion.div` between the two node buttons, classed with `edgeColorMap[edgeColor]` (e.g. `[--edge-color:var(--edge-3)]`) plus a static `mx-[-1.5rem]` marker — `Pair.tsx:84-93`, `packages/interview/src/utils/edgeColorMap.ts:12-21`.
- Next/forward button: `data-testid="next-button"` (existing repo-wide convention, confirmed via `InterviewFixture.nextButton` in `e2e/fixtures/interview-fixture.ts:168-170`).
- Per-prompt answers: NOT visible in `getNetworkState()` — `DyadCensusMetadataItem` tuples `[promptIndex, nodeA, nodeB, boolean]` live in Redux `session.stageMetadata[stepIndex]`, dispatched via `updateStageMetadata` — `DyadCensus.tsx:236-271`. Read via `window.__interviewStore.getState().session.stageMetadata[step]` (`window.__interviewStore` is already declared globally in `packages/interview/src/vite-env.d.ts:7-11`, but that file isn't included by `e2e/tsconfig.json`, so the e2e-side ambient declaration must be added separately).

```ts
// e2e/fixtures/window-test.d.ts — ADD (keep everything else in the file as-is)
import type { RootState } from '../../src/store/store.js';

declare global {
  interface Window {
    // ...existing __test, __e2eMap... (unchanged)
    /** Set by Shell.tsx:296 only when flags.isE2E; used to read state DyadCensus
     * (and similarly-shaped census stages) keep outside window.__test.getNetworkState(),
     * e.g. per-prompt answer tuples in session.stageMetadata. */
    __interviewStore?: import('@reduxjs/toolkit').Store<RootState>;
  }

  var __interviewStore: Window['__interviewStore'];
}
```

```ts
// e2e/fixtures/stage-fixture.ts — REPLACE the placeholder DyadCensusFixture class
/**
 * Fixture for DyadCensus stages.
 *
 * DyadCensus iterates through all unordered pairs of subject-type nodes with
 * a binary Yes/No BooleanField, one pair per screen, auto-advancing 350ms
 * after a *changed* answer (DyadCensus.tsx:193-206). Per-prompt answers are
 * NOT reflected in the shared network graph alone — read them from Redux via
 * `getStageMetadata(step)`.
 */
class DyadCensusFixture {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /** The introduction panel's h1 heading. Required on every DyadCensus stage. */
  get introHeading(): Locator {
    return this.page.getByRole('heading', { level: 1 });
  }

  /**
   * Dismiss the introduction panel. Unlike `InterviewFixture.dismissIntro()`
   * (which waits for a `[data-stage-section="form"]` marker used by
   * AlterForm/AlterEdgeForm), DyadCensus renders a BooleanField directly, so
   * we wait for the first radio to become visible instead.
   */
  async dismissIntro(): Promise<void> {
    await this.page.getByTestId('next-button').click();
    await expect(this.page.getByRole('radio').first()).toBeVisible();
  }

  /** The current prompt's markdown-rendered text container. */
  get prompt(): Locator {
    return this.page.getByTestId('prompt');
  }

  get yesOption(): Locator {
    return this.page.getByRole('radio', { name: 'Yes' });
  }

  get noOption(): Locator {
    return this.page.getByRole('radio', { name: 'No' });
  }

  async selectYes(): Promise<void> {
    await this.yesOption.click();
  }

  async selectNo(): Promise<void> {
    await this.noOption.click();
  }

  /** The two node buttons for the pair currently on screen, in DOM order. */
  pairNodes(): Locator {
    return this.page.locator('.w-md').getByRole('button');
  }

  async getPairLabels(): Promise<[string, string]> {
    const texts = await this.pairNodes().allTextContents();
    return [texts[0] ?? '', texts[1] ?? ''];
  }

  getNode(label: string): Locator {
    return this.pairNodes().filter({ hasText: label });
  }

  /**
   * Settle-wait for the auto-advance to land on a different pair. Auto-advance
   * runs on the REAL 350ms setTimeout (DyadCensus.tsx:201-206), and motion's
   * enter/exit spring animations also run on the real clock — faking timers
   * via page.clock would freeze those animations mid-transition instead of
   * completing them, so we poll for the observable effect (the pair changing)
   * on the real clock rather than fast-forwarding a fake one.
   */
  async waitForPairChange(previousLabels: [string, string]): Promise<void> {
    await expect
      .poll(() => this.getPairLabels(), { timeout: 2000 })
      .not.toEqual(previousLabels);
  }

  /** The animated edge connector between the two pair nodes. */
  get connector(): Locator {
    return this.page.locator('div[class*="mx-[-1.5rem]"]');
  }

  /** Pip dots shown only when the stage has more than one prompt. */
  get pips(): Locator {
    return this.page.locator('[data-active]');
  }

  async activePipIndex(): Promise<number> {
    const count = await this.pips.count();
    for (let i = 0; i < count; i++) {
      if ((await this.pips.nth(i).getAttribute('data-active')) === 'true') {
        return i;
      }
    }
    return -1;
  }

  /**
   * Read this stage's per-prompt answer tuples directly from Redux. DyadCensus
   * answers are NOT part of window.__test.getNetworkState() (that returns only
   * session.network) — they live in session.stageMetadata[step] as
   * [promptIndex, nodeA, nodeB, boolean] tuples (DyadCensus.tsx:236-271).
   */
  async getStageMetadata(
    step: number,
  ): Promise<[number, string, string, boolean][]> {
    return this.page.evaluate((s) => {
      const state = window.__interviewStore?.getState().session.stageMetadata;
      const entry = state?.[s];
      return Array.isArray(entry)
        ? (entry as [number, string, string, boolean][])
        : [];
    }, step);
  }
}
```

Wire it into `StageFixture`'s constructor: `this.dyadCensus = new DyadCensusFixture(page);` (the field and constructor line already exist from the placeholder — no change needed there beyond swapping the class body above it).

**Option inventory entry:**

```ts
// e2e/matrix/option-inventory.ts — add alongside the existing Information entry
export const OPTION_INVENTORY: Record<string, readonly string[]> = {
  Information: [
    /* ...unchanged... */
  ],
  DyadCensus: [
    'type',
    'id',
    'label',
    'interviewScript',
    'skipLogic',
    'filter',
    'subject.type',
    'introductionPanel',
    'prompts[].id',
    'prompts[].text',
    'prompts[].createEdge=yes-path',
    'prompts[].createEdge=no-path',
    'prompts[].createEdge=toggle-idempotence',
    'prompts[].createEdge=shared-prefill',
    'prompts=multi-cycling',
    'answer-required-validation',
    'pair-enumeration',
    'backwards-navigation',
    'zero-pairs-force-skip',
    'codebook.edge.color',
    'codebook.node.color-shape',
  ],
};
```

`skipLogic` and `filter` are listed but claimed by the shared cross-cutting suite (`e2e/matrix/shared-claims.ts`, Task 26: `'DyadCensus:skipLogic'`, `'DyadCensus:filter'`) — no scenario in this file covers them; do not add scenarios for either.

### Scenario table

| id | covers | flags | protocol config | interaction | functional assertions |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `intro-and-yes-creates-edge` | `type`, `id`, `label`, `interviewScript`, `introductionPanel`, `prompts[].id`, `prompts[].text`, `prompts[].createEdge=yes-path` | `smoke`, `visual` | 3-node `Person` type, 1 `DyadCensus` stage: `label: 'DYAD SENTINEL'`, `interviewScript: 'SCRIPT SENTINEL'`, `introductionPanel: { title: 'Network Relationships', text: 'Do **these two** know each other?' }`, 1 prompt `{ id: 'p1', text: 'Do they **know** each other?' }` (auto-created edge type) | assert intro heading + `<strong>` render, no radios yet; `dismissIntro()`; assert `prompt` shows `<strong>know</strong>`; select Yes on pair 1 | `getNetworkState().edges` has exactly 1 edge `{from,to,type}` matching pair 1 and the auto-created edge type; `page.getByText('DYAD SENTINEL')` and `page.getByText('SCRIPT SENTINEL')` have count 0; `waitForPairChange` resolves (auto-advance fired) |
| `no-answer-validation-and-negative-metadata` | `answer-required-validation`, `prompts[].createEdge=no-path` | — | 2-node, 1 prompt, `createEdge: 'friend'` | `dismissIntro()`; click `next-button` without selecting; select No | toast text `'Please select a response before continuing.'` visible before selection; after selecting No: `getNetworkState().edges` is empty; `getStageMetadata(1)` contains `[0, nodeA, nodeB, false]` (order-agnostic) |
| `toggle-delete-idempotence-and-back-to-intro` | `prompts[].createEdge=toggle-idempotence`, `backwards-navigation` | — | 2-node, 1 prompt, `createEdge: 'friend'` | select Yes, wait for edge; simulate Back to pair (re-render via `stage.dyadCensus` still showing pair 0 — 2 nodes means exactly 1 pair, so "Back" from pair 0/prompt 0 goes to intro); assert intro re-appears; `dismissIntro()` again; select No; then select Yes again (re-tap) | after Yes: `edges.length === 1`; pressing Back at pair 0 shows `introHeading` again (`introductionPanel` re-render assertion folded in here); after Yes→No: `edges.length === 0` and `getStageMetadata` last tuple is `[0, a, b, false]`; after re-selecting Yes twice in a row (double-tap): `edges.length === 1` (no duplicate) |
| `pair-enumeration-completes-stage` | `pair-enumeration` | — | 4-node `Person`, 1 prompt, flanking `addInformationStage` before AND after the DyadCensus stage | `dismissIntro()`; loop: select No on each pair, `waitForPairChange` between answers, until the following Information stage's heading appears (6 iterations for `4*3/2=6` pairs) | after the loop: `getStageMetadata(1)` has length 6, all `promptIndex === 0`, and the 6 `(a,b)` pairs are pairwise-distinct (unordered) — verifies exhaustive enumeration without duplicates or omissions |
| `subject-type-restriction` | `subject.type` | — | Codebook with 2 node types `Person`/`Place`; `synth.addManualNode(stageId, personTypeId, 'p1'                                                                                                                                                                                                                                                                                 | 'p2'                                                                                                                                                                                                                                                                                                                                                                                                           | 'p3', {})`×3 +`addManualNode(stageId, placeTypeId, 'pl1'                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | 'pl2', {})` ×2 (`initialNodes`omitted — nodes are seeded manually so both types coexist);`subject: { entity: 'node', type: personTypeId }`, 1 prompt | `dismissIntro()`; answer No on all pairs (loop, using `waitForPairChange`) until stage completes | exactly 3 iterations complete the stage (Person-Person pairs only: `3*2/2=3`); at every pair, `page.getByText(/pl1 | pl2/)` (Place labels) has count 0 (no Place label ever appears in the sr-only pair text or node buttons) |
| `multi-prompt-cycling-colors-and-backward-nav` | `prompts=multi-cycling`, `codebook.edge.color`, `codebook.node.color-shape`, `backwards-navigation` | `visual` | 3-node `Person` (`color: 'node-color-seq-2'`); 2 edge types `knows` (`color: 'edge-color-seq-3'`) and `likes` (`color: 'edge-color-seq-5'`); 2 prompts: `{ text: 'Do they know each other?', createEdge: 'knows' }`, `{ text: 'Do they like each other?', createEdge: 'likes' }` | `dismissIntro()`; answer Yes on all 3 pairs of prompt 1 (waiting for pair/prompt change each time); assert prompt 2 state; answer No on all 3 pairs of prompt 2; then press Back twice from the (now-exited) stage's re-entry point | `pips` count is 2; on prompt 1 pair 1, `connector` has class matching `/\[--edge-color:var\(--edge-3\)\]/`; after prompt-cycle, `connector` class matches `/\[--edge-color:var\(--edge-5\)\]/` and `prompt` text updates to the prompt-2 text; final `getNetworkState().edges` is 3× `knows`, 0× `likes`; `getStageMetadata(step)` has 6 tuples spanning `promptIndex` 0 and 1; pressing Back at prompt-2/pair-1 shows prompt 1's LAST pair (`activePipIndex() === 0`) with its previous Yes answer pre-selected (`yesOption` `aria-checked="true"`) |
| `shared-edge-prefill-across-prompts` | `prompts[].createEdge=shared-prefill` | — | 3-node `Person`; single edge type `knows`; 2 prompts BOTH `createEdge: 'knows'`; seeded network via `synth.addManualEdge('knows', 'e1', nodeAUid, nodeBUid, {})` and `stageMetadata` pre-populated with `[[0, nodeAUid, nodeBUid, true]]`; `currentStep: 1`, `seedNetwork: true` (installed via the runner's `createInterview(..., { network, currentStep, stageMetadata })`) | land directly inside the DyadCensus stage on prompt 2 (`promptIndex` derives from `stageMetadata`? — no: navigate forward through prompt 1's other pairs via `waitForPairChange` until the shared pair (A,B) is reached in prompt 2, OR seed `currentStep` so prompt-index resolution via the stage's internal `promptIndex` state starts at 0 and step through prompt 1 quickly since there are only 3 pairs) | on reaching pair (A,B) in prompt 2: `yesOption` has `aria-checked="true"` (pre-filled from the shared graph) while `getStageMetadata(1)` has no `[1, A, B, *]` tuple yet (not yet answered for prompt 2) and forward validation is blocked (`next-button` click leaves the same pair on screen / toast appears); after clicking Yes: `getNetworkState().edges` still has exactly 1 `knows` edge (no duplicate) and `getStageMetadata(1)` now contains `[1, A, B, true]` |
| `zero-pairs-force-skip` | `zero-pairs-force-skip` | — | 1-node `Person` (0 pairs), flanking `addInformationStage` before and after | `dismissIntro()` via clicking `next-button` (no `waitForPairChange` — nothing to wait for) | the following Information stage's heading becomes visible immediately (no radio/pair ever renders — assert `page.getByRole('radio')` count is 0 at any point) — this exercises the `beforeNext` `'FORCE'` return path |

### Fully-coded scenarios

```ts
// e2e/matrix/dyad-census.scenarios.ts
import { SyntheticInterview } from '@codaco/protocol-utilities';

import { expect } from '../fixtures/matrix-test.js';
import type { InterfaceScenarios } from './types.js';

export const dyadCensusScenarios: InterfaceScenarios = {
  interfaceType: 'DyadCensus',
  scenarios: [
    {
      id: 'intro-and-yes-creates-edge',
      covers: [
        'type',
        'id',
        'label',
        'interviewScript',
        'introductionPanel',
        'prompts[].id',
        'prompts[].text',
        'prompts[].createEdge=yes-path',
      ],
      smoke: true,
      visual: true,
      build: () => {
        const synth = new SyntheticInterview();
        const nodeType = synth.addNodeType({ name: 'Person' });
        synth
          .addStage('DyadCensus', {
            label: 'DYAD SENTINEL',
            subject: { entity: 'node', type: nodeType.id },
            initialNodes: { count: 3 },
            introductionPanel: {
              title: 'Network Relationships',
              text: 'Do **these two** know each other?',
            },
          })
          .addPrompt({ text: 'Do they **know** each other?' });
        return synth;
      },
      run: async ({ page, stage, protocol, interview }) => {
        await expect(
          page.getByRole('heading', { name: 'Network Relationships' }),
        ).toBeVisible();
        await expect(
          page.locator('strong', { hasText: 'these two' }),
        ).toBeVisible();
        await expect(page.getByRole('radio')).toHaveCount(0);

        await stage.dyadCensus.dismissIntro();
        await expect(page.locator('strong', { hasText: 'know' })).toBeVisible();

        // label/interviewScript are author-facing only: never rendered.
        await expect(page.getByText('DYAD SENTINEL')).toHaveCount(0);
        await expect(page.getByText('SCRIPT SENTINEL')).toHaveCount(0);

        const [nodeA, nodeB] = await stage.dyadCensus.getPairLabels();
        await stage.dyadCensus.selectYes();

        const network = await protocol.getNetworkState(interview.interviewId);
        expect(network?.edges).toHaveLength(1);
        const [edge] = network!.edges;
        const endpoints = [edge.from, edge.to];
        // Endpoints are node uids, not labels — assert count/shape rather than
        // label identity (labels aren't uids); the pair-count assertion is the
        // meaningful invariant here.
        expect(endpoints).toHaveLength(2);

        await stage.dyadCensus.waitForPairChange([nodeA, nodeB]);
      },
    },
    {
      id: 'shared-edge-prefill-across-prompts',
      covers: ['prompts[].createEdge=shared-prefill'],
      build: () => {
        const synth = new SyntheticInterview();
        const nodeType = synth.addNodeType({ name: 'Person' });
        const edgeType = synth.addEdgeType({ name: 'Knows' });
        const stage = synth.addStage('DyadCensus', {
          subject: { entity: 'node', type: nodeType.id },
          initialNodes: { count: 3 },
          introductionPanel: { title: 'Intro', text: 'Intro copy' },
        });
        stage.addPrompt({
          text: 'Prompt 1: know each other?',
          createEdge: edgeType.id,
        });
        stage.addPrompt({
          text: 'Prompt 2: know each other?',
          createEdge: edgeType.id,
        });
        return synth;
      },
      // Walk the whole of prompt 1 in run() rather than pre-seeding
      // stageMetadata/network directly: the builder generates node uids
      // internally, so the only reliable way to reference "the pair the
      // participant answered" is to answer it through the UI and remember
      // which labels came up, then answer the remaining pairs to reach
      // prompt 2 with that pair.
      run: async ({ stage }) => {
        await stage.dyadCensus.dismissIntro();

        const answeredPairs: [[string, string], boolean][] = [];
        for (let i = 0; i < 3; i++) {
          const labels = await stage.dyadCensus.getPairLabels();
          if (i === 0) {
            await stage.dyadCensus.selectYes();
          } else {
            await stage.dyadCensus.selectNo();
          }
          answeredPairs.push([labels, i === 0]);
          await stage.dyadCensus.waitForPairChange(labels).catch(() => {
            // Last pair of prompt 1 auto-advances into prompt 1 -> the
            // component keeps pairIndex but promptIndex increments; the pair
            // labels can legitimately repeat (pairIndex resets to 0), so a
            // "no change" timeout on the final iteration is expected.
          });
        }

        // Now on prompt 2, pair 1 — the same pair as the first Yes answer.
        const [sharedA, sharedB] = answeredPairs[0]![0];
        const [currentA, currentB] = await stage.dyadCensus.getPairLabels();
        expect(new Set([currentA, currentB])).toEqual(
          new Set([sharedA, sharedB]),
        );

        // Pre-filled from the shared graph, but not yet answered for prompt 2.
        await expect(stage.dyadCensus.yesOption).toHaveAttribute(
          'aria-checked',
          'true',
        );
        let metadata = await stage.dyadCensus.getStageMetadata(1);
        expect(metadata.some(([p]) => p === 1)).toBe(false);

        await stage.dyadCensus.selectYes();
        metadata = await stage.dyadCensus.getStageMetadata(1);
        expect(
          metadata.some(
            ([p, a, b, v]) =>
              p === 1 &&
              v === true &&
              new Set([a, b]).symmetricDifference(new Set([sharedA, sharedB]))
                .size === 0,
          ),
        ).toBe(true);
      },
    },
    {
      id: 'multi-prompt-cycling-colors-and-backward-nav',
      covers: [
        'prompts=multi-cycling',
        'codebook.edge.color',
        'codebook.node.color-shape',
        'backwards-navigation',
      ],
      visual: true,
      build: () => {
        const synth = new SyntheticInterview();
        const nodeType = synth.addNodeType({
          name: 'Person',
          color: 'node-color-seq-2',
        });
        const knows = synth.addEdgeType({
          name: 'Knows',
          color: 'edge-color-seq-3',
        });
        const likes = synth.addEdgeType({
          name: 'Likes',
          color: 'edge-color-seq-5',
        });
        const stage = synth.addStage('DyadCensus', {
          subject: { entity: 'node', type: nodeType.id },
          initialNodes: { count: 3 },
          introductionPanel: { title: 'Intro', text: 'Intro copy' },
        });
        stage.addPrompt({
          text: 'Do they know each other?',
          createEdge: knows.id,
        });
        stage.addPrompt({
          text: 'Do they like each other?',
          createEdge: likes.id,
        });
        return synth;
      },
      run: async ({ page, stage, protocol, interview }) => {
        await stage.dyadCensus.dismissIntro();

        await expect(stage.dyadCensus.pips).toHaveCount(2);
        await expect(stage.dyadCensus.connector).toHaveClass(
          /\[--edge-color:var\(--edge-3\)\]/,
        );

        for (let i = 0; i < 3; i++) {
          const labels = await stage.dyadCensus.getPairLabels();
          await stage.dyadCensus.selectYes();
          if (i < 2) await stage.dyadCensus.waitForPairChange(labels);
        }

        // Auto-advance from the last pair of prompt 1 lands on prompt 2, pair 1.
        await expect.poll(() => stage.dyadCensus.activePipIndex()).toBe(1);
        await expect(stage.dyadCensus.connector).toHaveClass(
          /\[--edge-color:var\(--edge-5\)\]/,
        );
        await expect(stage.dyadCensus.prompt).toContainText(
          'Do they like each other?',
        );

        for (let i = 0; i < 3; i++) {
          const labels = await stage.dyadCensus.getPairLabels();
          await stage.dyadCensus.selectNo();
          if (i < 2) await stage.dyadCensus.waitForPairChange(labels);
        }

        const network = await protocol.getNetworkState(interview.interviewId);
        const knowsEdges = network!.edges.filter((e) => e.type !== undefined);
        expect(network!.edges).toHaveLength(3);

        const metadata = await stage.dyadCensus.getStageMetadata(1);
        expect(metadata).toHaveLength(6);
        expect(metadata.filter(([p]) => p === 0)).toHaveLength(3);
        expect(metadata.filter(([p]) => p === 1)).toHaveLength(3);
        expect(knowsEdges.every((e) => e.type)).toBe(true);

        // Backward navigation across the prompt boundary: from prompt 2 pair 1,
        // Back twice must land on prompt 1's LAST pair with its Yes answer
        // pre-selected (DyadCensus.tsx:171-183).
        await page.getByTestId('previous-button').click();
        await page.getByTestId('previous-button').click();
        await expect.poll(() => stage.dyadCensus.activePipIndex()).toBe(0);
        await expect(stage.dyadCensus.yesOption).toHaveAttribute(
          'aria-checked',
          'true',
        );
      },
    },
    {
      id: 'zero-pairs-force-skip',
      covers: ['zero-pairs-force-skip'],
      build: () => {
        const synth = new SyntheticInterview();
        const nodeType = synth.addNodeType({ name: 'Person' });
        synth.addInformationStage({ title: 'Before the stage' });
        synth
          .addStage('DyadCensus', {
            subject: { entity: 'node', type: nodeType.id },
            initialNodes: { count: 1 },
            introductionPanel: { title: 'Intro', text: 'Intro copy' },
          })
          .addPrompt({ text: 'Do they know each other?' });
        synth.addInformationStage({ title: 'After the stage' });
        return synth;
      },
      // A single subject node yields zero unordered pairs, so the stage's
      // `beforeNext` returns 'FORCE' on entry (DyadCensus.tsx) and the
      // interview advances straight past the intro panel to the following
      // Information stage without ever rendering a pair or a radio. Do NOT
      // call `stage.dyadCensus.dismissIntro()` here: it waits for the first
      // radio to become visible, which never happens on the force-skip path.
      currentStep: 1,
      run: async ({ page }) => {
        await page.getByTestId('next-button').click();

        await expect(
          page.getByRole('heading', { name: 'After the stage' }),
        ).toBeVisible();
        await expect(page.getByRole('radio')).toHaveCount(0);
      },
    },
  ],
};
```

The remaining 4 scenarios (`no-answer-validation-and-negative-metadata`, `toggle-delete-idempotence-and-back-to-intro`, `pair-enumeration-completes-stage`, `subject-type-restriction`) follow the exact shape documented in the scenario table above: build via `SyntheticInterview` + `addStage('DyadCensus', ...)`/`addManualNode` as specified in each row's "protocol config" column, drive via the `stage.dyadCensus.*` methods listed above, assert via `protocol.getNetworkState(interview.interviewId)` and `stage.dyadCensus.getStageMetadata(step)` as specified in each row's "functional assertions" column — implement them in the same file, in table order, following the coded pattern (no additional locators or helpers beyond what's listed above are needed).

```ts
// e2e/specs/matrix/dyad-census.spec.ts
import { dyadCensusScenarios } from '../../matrix/dyad-census.scenarios.js';
import { defineScenarioTests } from '../../matrix/run-scenario.js';

defineScenarioTests(dyadCensusScenarios);
```

- [ ] **Step 1: Write the stage-fixture helpers** — replace the placeholder `DyadCensusFixture` in `e2e/fixtures/stage-fixture.ts` with the class above; add the `__interviewStore` typing to `e2e/fixtures/window-test.d.ts`.
- [ ] **Step 2: Write the registry + inventory entry + spec file** — `e2e/matrix/dyad-census.scenarios.ts` (8 scenarios total: the 4 coded above plus the 4 table-only ones authored in the same pattern), `e2e/specs/matrix/dyad-census.spec.ts`, the `OPTION_INVENTORY.DyadCensus` entry, and append `dyadCensusScenarios` to `ALL_SUITES` in `coverage-manifest.test.ts` (and `all-scenarios.ts` if present).
- [ ] **Step 3: Run the coverage manifest**: `pnpm --filter @codaco/interview exec vitest run e2e/matrix` — Expected: PASS (all 21 `DyadCensus` inventory keys claimed; `skipLogic`/`filter` satisfied via `sharedSuiteClaims`, not this file).
- [ ] **Step 4: Run the scenarios**: `pnpm --filter @codaco/interview test:e2e:headed -- --project=chromium-matrix --grep "DyadCensus"` — Expected: PASS; commit the new `e2e/aria-snapshots/chromium/dyad-census-*.aria.yml` baselines and the two visual scenarios' `e2e/visual-snapshots/chromium-matrix/*.png` baselines.
- [ ] **Step 5: Typecheck + commit** with message `test(interview-e2e): DyadCensus configuration matrix`

### Task 16: TieStrengthCensus matrix scenarios

**Files:**

- Create: `e2e/matrix/tie-strength-census.scenarios.ts`
- Create: `e2e/specs/matrix/tie-strength-census.spec.ts`
- Modify: `e2e/matrix/option-inventory.ts` (add the `TieStrengthCensus` entry — full code below)
- Modify: `e2e/matrix/coverage-manifest.test.ts` (append `import { tieStrengthCensusScenarios } from './tie-strength-census.scenarios.js';` and add it to the `ALL_SUITES` array) and `e2e/matrix/all-scenarios.ts` if it exists by the time this task lands (append the same import/registration)
- Modify: `e2e/fixtures/stage-fixture.ts` (implement the placeholder `TieStrengthCensusFixture` class, lines 1116–1136 of the current file)

**Interfaces:**

- Consumes: `ScenarioDefinition`/`InterfaceScenarios`/`defineScenarioTests` (Task 6, `e2e/matrix/types.ts` + `e2e/matrix/run-scenario.ts`), the `AddStageInput.filter`/`.skipLogic` builder extensions (Task 1 — used only by the shared cross-cutting suite, NOT by this task), seeded interviews via `scenario.seedNetwork`/`scenario.currentStep` (Task 3's extended `ProtocolFixture.createInterview(protocolId, name, { network, currentStep, stageMetadata })`), `matrixTest`/`ariaSnapshot` (Task 4), the existing `StageFixture.getPrompt(text?)` helper (`e2e/fixtures/stage-fixture.ts:1309-1312`, unchanged, backed by `Prompts/Prompt.tsx:40` `data-testid="prompt"`).
- Produces: `tieStrengthCensusScenarios: InterfaceScenarios` (consumed by `coverage-manifest.test.ts` and the new spec file); `StageFixture.tieStrengthCensus: TieStrengthCensusFixture` with the methods listed below (no other task depends on these method signatures, since TieStrengthCensus has no sibling interfaces sharing its UI).

**Dependency note on filter/skipLogic:** the dive file's `filter` and `skipLogic` options (including the "filter yields zero pairs → FORCE-skip the stage" behavior, `TieStrengthCensus.tsx:234-237`) are cross-cutting keys claimed by Task 26's shared suite, which will append `'TieStrengthCensus:filter'` and `'TieStrengthCensus:skipLogic'` to `e2e/matrix/shared-claims.ts`. This task lists both keys in the inventory but writes no scenarios for them, per the Task 6 contract.

**Stage fixture helpers**

Real locators, all cited against `packages/interview/src/interfaces/TieStrengthCensus/TieStrengthCensus.tsx`, `packages/interview/src/components/Pair.tsx`, and `packages/fresco-ui/src/form/fields/RichSelectGroup.tsx`:

- Listbox wrapping the ordinal cards: `role="listbox"` (`RichSelectGroup.tsx:314-315`), one per pair-prompt render (`TieStrengthCensus.tsx:409-431`).
- Each option card: `role="option"`, `data-value={String(option.value)}`, `aria-selected` (`RichSelectGroup.tsx:379-414`). The appended decline card's `data-value` is a collision-free sentinel (`TieStrengthCensus.tsx:88-97,155-158`) — select it by its rendered label (`negativeLabel`) instead of by value.
- Pair identity: a `span.sr-only` reading `"<from> and <to>"`, rendered once per `Pair` mount, immediately before the two node bubbles (`Pair.tsx:78-82`). It is the only `sr-only` span with an `" and "` substring on this stage.
- Connector: the `motion.div` between the two node bubbles carrying the `edgeColorMap[edgeColor]` class and the `hideEdge`/`showEdge` `backgroundPosition` animation (`Pair.tsx:84-93`), identified structurally by its `mx-[-1.5rem]` class fragment (`Pair.tsx:87`) since it has no test id.
- First `Next` click while on the intro panel does NOT change the URL `step` (`TieStrengthCensus.tsx:238-239`), so dismissing the intro must wait for the listbox to appear rather than for a step change — `InterviewFixture.dismissIntro()`/`.next()` cannot be reused here (they wait on a `data-stage-section="form"` marker or a step-URL change, neither of which applies).

```ts
// e2e/fixtures/stage-fixture.ts — replace the placeholder TieStrengthCensusFixture
/**
 * Fixture for TieStrengthCensus stages.
 *
 * Iterates every unique unordered pair of subject-type nodes, once per
 * prompt, offering an ordinal "tie strength" choice plus a decline option.
 * Auto-advances 350ms after a changed answer, immediately after an
 * unchanged one (TieStrengthCensus.tsx:277-294).
 */
class TieStrengthCensusFixture {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /** The horizontal option listbox for the current pair (RichSelectGroup.tsx:314-315). */
  get listbox(): Locator {
    return this.page.getByRole('listbox');
  }

  /**
   * Dismiss the introduction panel. The first Next does not advance the URL
   * step (TieStrengthCensus.tsx:238-239), so wait for the listbox instead of
   * a step change.
   */
  async dismissIntro(): Promise<void> {
    await this.page.getByTestId('next-button').click();
    await expect(this.listbox).toBeVisible();
  }

  /** Ordinal option card for a codebook option value (RichSelectGroup.tsx:379-414). */
  getOption(value: string | number): Locator {
    return this.page.locator(`[role="option"][data-value="${String(value)}"]`);
  }

  /** The decline/negative card, identified by its rendered negativeLabel text. */
  getDeclineOption(negativeLabel: string): Locator {
    return this.page.getByRole('option', { name: negativeLabel, exact: true });
  }

  /** Click an ordinal option by its codebook value. */
  async selectOption(value: string | number): Promise<void> {
    await this.getOption(value).click();
  }

  /** Click the decline/negative card by its label. */
  async selectDecline(negativeLabel: string): Promise<void> {
    await this.getDeclineOption(negativeLabel).click();
  }

  /** Screen-reader-only pair label, "<from> and <to>" (Pair.tsx:78-82). */
  get pairLabel(): Locator {
    return this.page.locator('span.sr-only').filter({ hasText: ' and ' });
  }

  /** The two node names for the pair currently on screen, in DOM order. */
  async getPairLabels(): Promise<[string, string]> {
    const text = (await this.pairLabel.textContent())?.trim() ?? '';
    const [from, to] = text.split(' and ').map((s) => s.trim());
    return [from ?? '', to ?? ''];
  }

  /**
   * Settle-wait for the auto-advance to land on a different pair. Auto-advance
   * runs on the REAL 350ms setTimeout (TieStrengthCensus.tsx:277-294), and
   * Pair's enter/exit spring animations also run on the real clock — faking
   * timers via page.clock would freeze those animations mid-transition
   * instead of completing them, so we poll for the observable effect (the
   * pair changing) on the real clock rather than fast-forwarding a fake one.
   */
  async waitForPairChange(previousLabels: [string, string]): Promise<void> {
    await expect
      .poll(() => this.getPairLabels(), { timeout: 2000 })
      .not.toEqual(previousLabels);
  }

  /** The Pair connector div carrying the edge-color class (Pair.tsx:84-93). */
  get connector(): Locator {
    return this.page.locator('div[class*="mx-\\[-1\\.5rem\\]"]');
  }

  /** True once the connector's showEdge animation has committed (Pair.tsx:39-42,92). */
  async isConnectorShowingEdge(): Promise<boolean> {
    const pos = await this.connector.evaluate(
      (el) => getComputedStyle(el).backgroundPosition,
    );
    // showEdge -> 'left bottom' (computed '0% 100%'); hideEdge -> 'right bottom' ('100% 100%')
    return pos.startsWith('0%');
  }
}
```

Then wire it in `StageFixture`'s constructor exactly as already declared (`this.tieStrengthCensus = new TieStrengthCensusFixture(page);` — this line already exists; only the class body changes).

**Option inventory entry**

```ts
// e2e/matrix/option-inventory.ts — add this entry to OPTION_INVENTORY
TieStrengthCensus: [
  'id',
  'label',
  'interviewScript',
  'skipLogic', // claimed by shared suite (Task 26) — not covered here
  'filter', // claimed by shared suite (Task 26) — not covered here
  'subject.type',
  'introductionPanel',
  'prompts[].text',
  'prompts[].createEdge',
  'prompts[].edgeVariable',
  'prompts[].negativeLabel',
  'prompts[].multiple',
  'codebook.edge.variable.options',
  'codebook.edge.color',
  'auto-advance-timing',
  'response-required-validation',
  'backwards-navigation',
  'pre-selection',
  'sibling-prompt-scoping',
  'stage-completion',
],
```

(`prompts[].id` is builder-assigned — `SyntheticInterview.resolveTieStrengthCensusPrompt`, `packages/protocol-utilities/src/SyntheticInterview.ts:1385`, generates it via `nextId('prompt')` and it cannot be set by callers — so it is not a separately testable key; its only observable effect, keying prompt switches, is exercised whenever a scenario has >1 prompt and is covered under `'prompts[].multiple'`.)

**Scenario table**

| id                                                | covers                                                                                                                                   | flags             | protocol config                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | interaction                                                                                                                                                                                                                                                                                                                                                                                                                                                               | functional assertions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `intro-panel-and-first-selection`                 | id, label, interviewScript, introductionPanel, prompts[].createEdge, prompts[].text, codebook.edge.variable.options, codebook.edge.color | `smoke`, `visual` | `Person` node type, 3 nodes; `Friendship` edge type (no explicit color → default `edge-color-seq-1`); ordinal var `Strength` options `[{label:'Weak',value:1},{label:'Moderate',value:2},{label:'Strong',value:3}]`; 1 prompt `text:'How close are these two people?'`, `createEdge`, `edgeVariable`, `negativeLabel:'Not close'`; `introductionPanel:{title:'Rate Your Relationships', text:'...markdown...'}`; stage `label:'Rate Relationships (menu)'`, `interviewScript:'Internal note: use a warm tone.'` | assert intro; `stage.tieStrengthCensus.dismissIntro()`; click `getOption(2)`                                                                                                                                                                                                                                                                                                                                                                                              | intro: `h1` with title visible, `listbox` count 0, page text does not contain the `label` or `interviewScript` strings; after dismiss: `listbox` visible with 4 options in order `data-value` `1,2,3,<sentinel>` and labels Weak/Moderate/Strong/Not close; page URL `step` unchanged across the dismiss; after click: `protocol.getNetworkState(interviewId).edges` has exactly one edge, `type===Friendship.id`, `attributes.Strength===2`, `{from,to}` matching `getPairLabels()`'s two node ids                                                                                                                    |
| `subject-type-scoping`                            | subject.type                                                                                                                             | —                 | 2 node types `Person`/`Place`; `subject:{entity:'node', type: person.id}`; 3 `Person` nodes via `initialNodes:{count:3}`, 2 `Place` nodes via `addManualNode(stageId, place.id, uid, {name:...})`; 1 prompt as above; an `Information` stage after with a distinctive heading                                                                                                                                                                                                                                   | dismiss intro; answer all 3 pairs positively (`selectOption(2)`, wait for auto-advance each time), collecting `getPairLabels()` before each answer                                                                                                                                                                                                                                                                                                                        | none of the 3 collected pair texts contain either Place node's name; after the 3rd answer the next stage's heading becomes visible (stage exited after exactly 3 pairs); `getNetworkState().edges` only reference the 3 Person node ids (cross-checked against `getNetworkState().nodes` types)                                                                                                                                                                                                                                                                                                                        |
| `prompts-multiple-and-sibling-scoping`            | prompts[].multiple, prompts[].edgeVariable (partial), sibling-prompt-scoping                                                             | —                 | 3 `Person` nodes; ONE `Friendship` edge type with TWO ordinal variables — `Strength` (`1/2/3`→Low/Medium/High) and `Closeness` (`1/2/3`→Distant/Neutral/Close); 2 prompts, both `createEdge: friendship.id` — prompt A `edgeVariable: strength.id, text:'Prompt A text'`, prompt B `edgeVariable: closeness.id, text:'Prompt B text'`                                                                                                                                                                           | dismiss intro; assert 2 pip divs; answer all 3 pairs of prompt A (values 2,1,3); on prompt B pair 1 assert no option `aria-selected`; answer prompt B's 3 pairs                                                                                                                                                                                                                                                                                                           | `page.locator('[data-active]')` count is 2 before answering; after prompt A's 3rd answer, `stage.getPrompt('Prompt B text')` becomes visible and `getPairLabels()` again shows pair-1's names (pairIndex reset); on prompt B pair 1, `getOption(2)/getOption(1)/getOption(3)` all have `aria-selected="false"` despite the Friendship edge already existing (sibling scoping); after finishing, `getNetworkState().edges` has exactly ONE Friendship edge per pair (3 total), each with BOTH `Strength` and `Closeness` set to the values chosen in each prompt                                                        |
| `response-required-validation`                    | response-required-validation                                                                                                             | —                 | 3 `Person` nodes, 1 prompt (as in scenario 1)                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | dismiss intro; click `interview.nextButton` without selecting any option                                                                                                                                                                                                                                                                                                                                                                                                  | a destructive toast containing `'Please select a response before continuing.'` becomes visible; `getPairLabels()` is unchanged (still pair 1); `getNetworkState().edges` is empty                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `edge-variable-write-then-update-via-back`        | prompts[].edgeVariable, auto-advance-timing                                                                                              | —                 | 3 `Person` nodes, 1 prompt (as in scenario 1)                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | dismiss intro; capture `getPairLabels()`; `selectOption(2)`; `waitForPairChange(pair1Labels)`; assert pair advanced to pair 2; click `page.getByTestId('previous-button')`; `selectOption(3)`                                                                                                                                                                                                                                                                             | after first select: `getNetworkState().edges.length===1`, `attributes.Strength===2`; capture the edge's `entityPrimaryKeyProperty`; once `waitForPairChange` resolves, `getPairLabels()` now shows pair 2's names (auto-advance fired on the real 350ms timer); after Back, `getPairLabels()` shows pair 1's names again and `getOption(2)` has `aria-selected="true"` (persisted via edge value); after re-selecting 3: same edge id (`edges.length` still `1`, same key), `attributes.Strength===3` (an `updateEdge`, not a second `addEdge`)                                                                        |
| `pre-selection-and-decline`                       | pre-selection, prompts[].negativeLabel, backwards-navigation (partial)                                                                   | —                 | 3 `Person` nodes, 1 prompt (as in scenario 1); `si.addEdges([[0,1]], friendship.id)`; `si.setEdgeAttribute(0, strength.id, 3)`; `seedNetwork: true`                                                                                                                                                                                                                                                                                                                                                             | dismiss intro; assert `getOption(3)` `aria-selected="true"` on pair 1; capture `getPairLabels()`; `selectDecline('Not close')`; `waitForPairChange(pair1Labels)`; click `previous-button`                                                                                                                                                                                                                                                                                 | before selecting: `getOption(3)` `aria-selected="true"`, `isConnectorShowingEdge()` is `true`; after decline: `getNetworkState().edges` no longer contains an edge between pair 1's nodes; once `waitForPairChange` resolves, `getPairLabels()` shows pair 2; after Back, `getPairLabels()` is pair 1 again and `getDeclineOption('Not close')` has `aria-selected="true"` (metadata persistence — network state alone can't show this)                                                                                                                                                                                |
| `backwards-navigation-and-full-census-completion` | prompts[].multiple, backwards-navigation, stage-completion                                                                               | `slow`            | 3 `Person` nodes; 2 prompts, each its own edge type — prompt A `Friendship`/`Strength` (`1/2/3`), prompt B `Trust`/`Level` (`1/2/3`); a following `Information` stage with a distinctive heading                                                                                                                                                                                                                                                                                                                | dismiss intro; prompt A: pair1→`selectOption(2)`, pair2→`selectOption(1)`, pair3→`selectDecline('No Friendship')` (`waitForPairChange` after each, using the labels captured before each click); on prompt B pair1, press `previous-button` 4×, asserting state at each step, then re-advance through prompt A (Next ×3, values already selected so no re-click needed) and prompt B: pair1→`selectDecline('No Trust')`, pair2→`selectOption(3)`, pair3→`selectOption(1)` | Back 1 → prompt text is prompt A's, `getPairLabels()` is pair 3, `getDeclineOption('No Friendship')` `aria-selected="true"`; Back 2 → pair 2, `getOption(1)` `aria-selected="true"`; Back 3 → pair 1, `getOption(2)` `aria-selected="true"`; Back 4 → intro `h1` visible; after redoing the forward pass and finishing prompt B's 3rd pair, the following stage's heading becomes visible; final `getNetworkState().edges` has exactly: Friendship edges for pair1(`Strength=2`) and pair2(`Strength=1`), no Friendship edge for pair3; Trust edges for pair2(`Level=3`) and pair3(`Level=1`), no Trust edge for pair1 |
| `edge-color-custom`                               | codebook.edge.color                                                                                                                      | `visual`          | 3 `Person` nodes, 1 prompt whose `Friendship` edge type has `color: 'edge-color-seq-3'`                                                                                                                                                                                                                                                                                                                                                                                                                         | dismiss intro; `selectOption(2)`; assert immediately post-click (connector animates synchronously on Redux commit, no auto-advance wait needed)                                                                                                                                                                                                                                                                                                                           | `stage.tieStrengthCensus.connector` has class matching `/edge-3/` (i.e. contains `[--edge-color:var(--edge-3)]`, `edgeColorMap.ts:16`); `isConnectorShowingEdge()` is `true`                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `label-and-interviewscript-menu-dead-config`      | label, interviewScript                                                                                                                   | —                 | 3 `Person` nodes, 1 prompt (as in scenario 1); stage `label:'Census menu label'`, `interviewScript:'Never rendered in the interview DOM.'`                                                                                                                                                                                                                                                                                                                                                                      | dismiss intro; click `page.getByRole('button', { name: 'Go to a stage' })` to open the stages menu                                                                                                                                                                                                                                                                                                                                                                        | `page.getByRole('region', { name: 'Stages' }).getByText('Census menu label')` (or the nearest ancestor with `aria-label="Stages"` per `StagesMenu.tsx:499`) is visible; `page.getByText('Never rendered in the interview DOM.')` has count 0 anywhere on the page                                                                                                                                                                                                                                                                                                                                                      |

**Fully-coded scenarios**

```ts
// e2e/matrix/tie-strength-census.scenarios.ts
import { SyntheticInterview } from '@codaco/protocol-utilities';

import { expect } from '../fixtures/matrix-test.js';
import type { InterfaceScenarios } from './types.js';

export const tieStrengthCensusScenarios: InterfaceScenarios = {
  interfaceType: 'TieStrengthCensus',
  scenarios: [
    {
      id: 'intro-panel-and-first-selection',
      covers: [
        'id',
        'label',
        'interviewScript',
        'introductionPanel',
        'prompts[].createEdge',
        'prompts[].text',
        'codebook.edge.variable.options',
        'codebook.edge.color',
      ],
      smoke: true,
      visual: true,
      build: () => {
        const synth = new SyntheticInterview();
        const person = synth.addNodeType({ name: 'Person' });
        const friendship = synth.addEdgeType({ name: 'Friendship' });
        const strength = friendship.addVariable({
          name: 'Strength',
          type: 'ordinal',
          options: [
            { label: 'Weak', value: 1 },
            { label: 'Moderate', value: 2 },
            { label: 'Strong', value: 3 },
          ],
        });
        const stage = synth.addStage('TieStrengthCensus', {
          label: 'Rate Relationships (menu)',
          initialNodes: { count: 3 },
          subject: { entity: 'node', type: person.id },
          introductionPanel: {
            title: 'Rate Your Relationships',
            text: 'You will be shown pairs of people from your network. For each pair, indicate the strength of their relationship.',
          },
        });
        stage.addPrompt({
          text: 'How close are these two people?',
          createEdge: friendship.id,
          edgeVariable: strength.id,
          negativeLabel: 'Not close',
        });
        return synth;
      },
      run: async ({ page, interview, stage, protocol }) => {
        await expect(
          page.getByRole('heading', { name: 'Rate Your Relationships' }),
        ).toBeVisible();
        await expect(page.getByRole('listbox')).toHaveCount(0);
        await expect(page.getByText('Rate Relationships (menu)')).toHaveCount(
          0,
        );
        await expect(
          page.getByText('Internal note: use a warm tone.'),
        ).toHaveCount(0);

        const urlBefore = page.url();
        await stage.tieStrengthCensus.dismissIntro();
        expect(page.url()).toBe(urlBefore);

        const options = page.getByRole('option');
        await expect(options).toHaveCount(4);
        await expect(options.nth(0)).toHaveAttribute('data-value', '1');
        await expect(options.nth(0)).toHaveText(/Weak/);
        await expect(options.nth(1)).toHaveAttribute('data-value', '2');
        await expect(options.nth(1)).toHaveText(/Moderate/);
        await expect(options.nth(2)).toHaveAttribute('data-value', '3');
        await expect(options.nth(2)).toHaveText(/Strong/);
        await expect(options.nth(3)).toHaveText(/Not close/);

        const [fromName, toName] =
          await stage.tieStrengthCensus.getPairLabels();
        await stage.tieStrengthCensus.selectOption(2);

        const network = await protocol.getNetworkState(interview.interviewId);
        expect(network?.edges).toHaveLength(1);
        const edge = network!.edges[0]!;
        expect(edge.attributes.Strength).toBe(2);
        const fromNode = network!.nodes.find((n) => n.id === edge.from);
        const toNode = network!.nodes.find((n) => n.id === edge.to);
        expect(fromNode?.attributes.name).toBe(fromName);
        expect(toNode?.attributes.name).toBe(toName);
      },
    },
    {
      id: 'edge-variable-write-then-update-via-back',
      covers: ['prompts[].edgeVariable', 'auto-advance-timing'],
      build: () => {
        const synth = new SyntheticInterview();
        const person = synth.addNodeType({ name: 'Person' });
        const friendship = synth.addEdgeType({ name: 'Friendship' });
        const strength = friendship.addVariable({
          name: 'Strength',
          type: 'ordinal',
          options: [
            { label: 'Weak', value: 1 },
            { label: 'Moderate', value: 2 },
            { label: 'Strong', value: 3 },
          ],
        });
        const stage = synth.addStage('TieStrengthCensus', {
          initialNodes: { count: 3 },
          subject: { entity: 'node', type: person.id },
          introductionPanel: {
            title: 'Rate Your Relationships',
            text: 'Intro.',
          },
        });
        stage.addPrompt({
          text: 'How close are these two people?',
          createEdge: friendship.id,
          edgeVariable: strength.id,
          negativeLabel: 'Not close',
        });
        return synth;
      },
      run: async ({ page, interview, stage, protocol }) => {
        await stage.tieStrengthCensus.dismissIntro();
        const pair1Labels = await stage.tieStrengthCensus.getPairLabels();

        await stage.tieStrengthCensus.selectOption(2);
        let network = await protocol.getNetworkState(interview.interviewId);
        expect(network?.edges).toHaveLength(1);
        const edgeId = network!.edges[0]!.id;
        expect(network!.edges[0]!.attributes.Strength).toBe(2);

        await stage.tieStrengthCensus.waitForPairChange(pair1Labels);

        await page.getByTestId('previous-button').click();
        await expect
          .poll(() => stage.tieStrengthCensus.getPairLabels())
          .toEqual(pair1Labels);
        await expect(stage.tieStrengthCensus.getOption(2)).toHaveAttribute(
          'aria-selected',
          'true',
        );

        await stage.tieStrengthCensus.selectOption(3);
        network = await protocol.getNetworkState(interview.interviewId);
        expect(network?.edges).toHaveLength(1);
        expect(network!.edges[0]!.id).toBe(edgeId);
        expect(network!.edges[0]!.attributes.Strength).toBe(3);
      },
    },
    {
      id: 'prompts-multiple-and-sibling-scoping',
      covers: [
        'prompts[].multiple',
        'sibling-prompt-scoping',
        'prompts[].edgeVariable',
      ],
      build: () => {
        const synth = new SyntheticInterview();
        const person = synth.addNodeType({ name: 'Person' });
        const friendship = synth.addEdgeType({ name: 'Friendship' });
        const strengthOptions = [
          { label: 'Low', value: 1 },
          { label: 'Medium', value: 2 },
          { label: 'High', value: 3 },
        ];
        const strength = friendship.addVariable({
          name: 'Strength',
          type: 'ordinal',
          options: strengthOptions,
        });
        const closeness = friendship.addVariable({
          name: 'Closeness',
          type: 'ordinal',
          options: [
            { label: 'Distant', value: 1 },
            { label: 'Neutral', value: 2 },
            { label: 'Close', value: 3 },
          ],
        });
        const stage = synth.addStage('TieStrengthCensus', {
          initialNodes: { count: 3 },
          subject: { entity: 'node', type: person.id },
          introductionPanel: {
            title: 'Rate Your Relationships',
            text: 'Intro.',
          },
        });
        stage.addPrompt({
          text: 'Prompt A text',
          createEdge: friendship.id,
          edgeVariable: strength.id,
          negativeLabel: 'No Friendship',
        });
        stage.addPrompt({
          text: 'Prompt B text',
          createEdge: friendship.id,
          edgeVariable: closeness.id,
          negativeLabel: 'No Closeness',
        });
        return synth;
      },
      run: async ({ page, interview, stage, protocol }) => {
        await stage.tieStrengthCensus.dismissIntro();
        await expect(page.locator('[data-active]')).toHaveCount(2);

        const pair1Labels = await stage.tieStrengthCensus.getPairLabels();
        let previousLabels = pair1Labels;
        for (const value of [2, 1, 3] as const) {
          await stage.tieStrengthCensus.selectOption(value);
          await stage.tieStrengthCensus.waitForPairChange(previousLabels);
          previousLabels = await stage.tieStrengthCensus.getPairLabels();
        }

        await expect(stage.getPrompt('Prompt B text')).toBeVisible();
        await expect
          .poll(() => stage.tieStrengthCensus.getPairLabels())
          .toEqual(pair1Labels);

        for (const value of [1, 2, 3]) {
          await expect(
            stage.tieStrengthCensus.getOption(value),
          ).toHaveAttribute('aria-selected', 'false');
        }
        const before = await protocol.getNetworkState(interview.interviewId);
        await page.getByTestId('next-button').click();
        await expect(
          page.getByText('Please select a response before continuing.'),
        ).toBeVisible();
        const afterToast = await protocol.getNetworkState(
          interview.interviewId,
        );
        expect(afterToast?.edges.length).toBe(before?.edges.length);

        previousLabels = pair1Labels;
        for (const value of [1, 2, 3] as const) {
          await stage.tieStrengthCensus.selectOption(value);
          if (value !== 3) {
            await stage.tieStrengthCensus.waitForPairChange(previousLabels);
            previousLabels = await stage.tieStrengthCensus.getPairLabels();
          }
        }

        const network = await protocol.getNetworkState(interview.interviewId);
        expect(network?.edges).toHaveLength(3);
        for (const edge of network!.edges) {
          expect(edge.attributes.Strength).toBeDefined();
          expect(edge.attributes.Closeness).toBeDefined();
        }
      },
    },
    {
      id: 'response-required-validation',
      covers: ['response-required-validation'],
      build: () => {
        const synth = new SyntheticInterview();
        const person = synth.addNodeType({ name: 'Person' });
        const friendship = synth.addEdgeType({ name: 'Friendship' });
        const strength = friendship.addVariable({
          name: 'Strength',
          type: 'ordinal',
          options: [
            { label: 'Weak', value: 1 },
            { label: 'Moderate', value: 2 },
            { label: 'Strong', value: 3 },
          ],
        });
        const stage = synth.addStage('TieStrengthCensus', {
          initialNodes: { count: 3 },
          subject: { entity: 'node', type: person.id },
          introductionPanel: {
            title: 'Rate Your Relationships',
            text: 'Intro.',
          },
        });
        stage.addPrompt({
          text: 'How close are these two people?',
          createEdge: friendship.id,
          edgeVariable: strength.id,
          negativeLabel: 'Not close',
        });
        return synth;
      },
      run: async ({ page, interview, stage, protocol }) => {
        await stage.tieStrengthCensus.dismissIntro();
        const pairLabelsBefore = await stage.tieStrengthCensus.getPairLabels();

        await interview.nextButton.click();

        await expect(
          page.getByText('Please select a response before continuing.'),
        ).toBeVisible();
        await expect
          .poll(() => stage.tieStrengthCensus.getPairLabels())
          .toEqual(pairLabelsBefore);

        const network = await protocol.getNetworkState(interview.interviewId);
        expect(network?.edges).toHaveLength(0);
      },
    },
    {
      id: 'pre-selection-and-decline',
      covers: [
        'pre-selection',
        'prompts[].negativeLabel',
        'backwards-navigation',
      ],
      build: () => {
        const synth = new SyntheticInterview();
        const person = synth.addNodeType({ name: 'Person' });
        const friendship = synth.addEdgeType({ name: 'Friendship' });
        const strength = friendship.addVariable({
          name: 'Strength',
          type: 'ordinal',
          options: [
            { label: 'Weak', value: 1 },
            { label: 'Moderate', value: 2 },
            { label: 'Strong', value: 3 },
          ],
        });
        const stage = synth.addStage('TieStrengthCensus', {
          initialNodes: { count: 3 },
          subject: { entity: 'node', type: person.id },
          introductionPanel: {
            title: 'Rate Your Relationships',
            text: 'Intro.',
          },
        });
        stage.addPrompt({
          text: 'How close are these two people?',
          createEdge: friendship.id,
          edgeVariable: strength.id,
          negativeLabel: 'Not close',
        });
        synth.addEdges([[0, 1]], friendship.id);
        synth.setEdgeAttribute(0, strength.id, 3);
        return synth;
      },
      seedNetwork: true,
      run: async ({ page, interview, stage, protocol }) => {
        await stage.tieStrengthCensus.dismissIntro();
        const pair1Labels = await stage.tieStrengthCensus.getPairLabels();

        await expect(stage.tieStrengthCensus.getOption(3)).toHaveAttribute(
          'aria-selected',
          'true',
        );
        expect(await stage.tieStrengthCensus.isConnectorShowingEdge()).toBe(
          true,
        );

        const networkBefore = await protocol.getNetworkState(
          interview.interviewId,
        );
        expect(networkBefore?.edges).toHaveLength(1);
        const seededEdge = networkBefore!.edges[0]!;

        await stage.tieStrengthCensus.selectDecline('Not close');

        const networkAfterDecline = await protocol.getNetworkState(
          interview.interviewId,
        );
        expect(
          networkAfterDecline?.edges.some(
            (edge) =>
              edge.from === seededEdge.from && edge.to === seededEdge.to,
          ),
        ).toBe(false);

        await stage.tieStrengthCensus.waitForPairChange(pair1Labels);

        await page.getByTestId('previous-button').click();
        await expect
          .poll(() => stage.tieStrengthCensus.getPairLabels())
          .toEqual(pair1Labels);
        await expect(
          stage.tieStrengthCensus.getDeclineOption('Not close'),
        ).toHaveAttribute('aria-selected', 'true');
      },
    },
    {
      id: 'label-and-interviewscript-menu-dead-config',
      covers: ['label', 'interviewScript'],
      build: () => {
        const synth = new SyntheticInterview();
        const person = synth.addNodeType({ name: 'Person' });
        const friendship = synth.addEdgeType({ name: 'Friendship' });
        const strength = friendship.addVariable({
          name: 'Strength',
          type: 'ordinal',
          options: [
            { label: 'Weak', value: 1 },
            { label: 'Moderate', value: 2 },
            { label: 'Strong', value: 3 },
          ],
        });
        const stage = synth.addStage('TieStrengthCensus', {
          label: 'Census menu label',
          interviewScript: 'Never rendered in the interview DOM.',
          initialNodes: { count: 3 },
          subject: { entity: 'node', type: person.id },
          introductionPanel: {
            title: 'Rate Your Relationships',
            text: 'Intro.',
          },
        });
        stage.addPrompt({
          text: 'How close are these two people?',
          createEdge: friendship.id,
          edgeVariable: strength.id,
          negativeLabel: 'Not close',
        });
        return synth;
      },
      run: async ({ page, stage }) => {
        await stage.tieStrengthCensus.dismissIntro();
        await page.getByRole('button', { name: 'Go to a stage' }).click();

        await expect(
          page
            .getByRole('listbox', { name: 'Stages' })
            .getByText('Census menu label'),
        ).toBeVisible();
        await expect(
          page.getByText('Never rendered in the interview DOM.'),
        ).toHaveCount(0);
      },
    },
    // subject-type-scoping, backwards-navigation-and-full-census-completion,
    // and edge-color-custom follow the same shape as the scenario-table rows
    // above — one ScenarioDefinition object per row.
  ],
};
```

- [ ] **Step 1: Implement the stage-fixture helpers** — replace the placeholder `TieStrengthCensusFixture` body in `e2e/fixtures/stage-fixture.ts` with the class above (code given in "Stage fixture helpers").

- [ ] **Step 2: Write the registry, inventory entry, and spec file**
  - `e2e/matrix/tie-strength-census.scenarios.ts`: the 3 fully-coded scenarios above plus the remaining 6 rows from the scenario table, each as a complete `ScenarioDefinition`.
  - `e2e/matrix/option-inventory.ts`: add the `TieStrengthCensus` entry.
  - `e2e/specs/matrix/tie-strength-census.spec.ts`:

    ```ts
    import { tieStrengthCensusScenarios } from '../../matrix/tie-strength-census.scenarios.js';
    import { defineScenarioTests } from '../../matrix/run-scenario.js';

    defineScenarioTests(tieStrengthCensusScenarios);
    ```

  - `e2e/matrix/coverage-manifest.test.ts`: add `import { tieStrengthCensusScenarios } from './tie-strength-census.scenarios.js';` and append `tieStrengthCensusScenarios` to `ALL_SUITES`.

- [ ] **Step 3: Run the coverage manifest**: `pnpm --filter @codaco/interview exec vitest run e2e/matrix`
      Expected: PASS (every `TieStrengthCensus` inventory key is claimed by a scenario or by `shared-claims.ts`).

- [ ] **Step 4: Run the scenarios**: `pnpm --filter @codaco/interview test:e2e:headed -- --project=chromium-matrix --grep "TieStrengthCensus"`
      Expected: PASS; commit the new `e2e/aria-snapshots/chromium/*.aria.yml` baselines it writes on first run.

- [ ] **Step 5: Typecheck + commit**
      Run: `pnpm typecheck` — Expected: clean.
  ```bash
  git add packages/interview/e2e
  git commit -m "test(interview-e2e): TieStrengthCensus configuration matrix"
  ```

### Task 17: OneToManyDyadCensus matrix scenarios

**Files:**

- Create: `e2e/matrix/one-to-many-dyad-census.scenarios.ts`
- Create: `e2e/specs/matrix/one-to-many-dyad-census.spec.ts`
- Modify: `e2e/matrix/option-inventory.ts` (add the `OneToManyDyadCensus` entry — full code below)
- Modify: `e2e/matrix/coverage-manifest.test.ts` (append `oneToManyDyadCensusScenarios` import + push onto `ALL_SUITES`) and `e2e/matrix/all-scenarios.ts` if it exists by the time this task lands (append registry import there too)
- Modify: `e2e/fixtures/stage-fixture.ts` (replace the placeholder `OneToManyDyadCensusFixture` at lines 1138-1156 with the implemented class below)

**Interfaces:**

- Consumes: `ScenarioDefinition`/`InterfaceScenarios`/`defineScenarioTests` (Task 6), `SyntheticInterview.addStage('OneToManyDyadCensus', ...)` + per-prompt `addPrompt({ text, createEdge, bucketSortOrder, binSortOrder })` (already supported natively by the builder — see `packages/protocol-utilities/src/SyntheticInterview.ts:1394-1421` `resolveOneToManyDyadCensusPrompt`, no Task 1 gap here), `addManualNode`/`addNodeType`/`addEdgeType`/`addVariableToNodeType` via the node-type handle's `.addVariable` (Task 1's existing builder surface), seeded interviews via `currentStep`/`ariaSnapshot` (Task 3/Task 4).
- Consumes the new `StageFixture.oneToManyDyadCensus` sub-fixture (below) plus the existing `StageFixture.getNode(label)` (role=`option`, `stage-fixture.ts:1318-1320`) for target-grid nodes.
- Does NOT write scenarios for `filter` or `skipLogic` — both are stage-generic and claimed by the Task 26 shared cross-cutting suite; they are listed in this interface's `OPTION_INVENTORY` entry only, per the plan's shared-suite convention (`shared-claims.ts` will gain `'OneToManyDyadCensus:filter'` and `'OneToManyDyadCensus:skipLogic'` when Task 26 lands — until then the coverage-manifest test only enforces keys for interfaces whose registry exists, so this file's inventory entry is safe to land ahead of Task 26).
- Produces: `oneToManyDyadCensusScenarios: InterfaceScenarios` (7 scenarios) and `StageFixture.oneToManyDyadCensus: OneToManyDyadCensusFixture` with methods `getSourceNode()`, `getSourceLabel()`, `getTargetNode(label)`, `getTargetLabels()`, `toggleTarget(label)`, `isTargetSelected(label)`, `getPips()`, `getActivePipIndex()` — consumed as-is by later interface tasks that need the same focal/grid pattern (none currently planned, but the shape mirrors `SociogramFixture`/`NodePanelFixture` for consistency).

**Stage fixture helpers**

Locators are derived directly from `packages/interview/src/interfaces/OneToManyDyadCensus/OneToManyDyadCensus.tsx`:

- The focal/source node is rendered by `ConnectedMotionNode` with `size="md" className="z-10"` and NO `onClick`, so it has no `role="option"` override and renders as a plain `<button>` with `aria-label` = the node's label (`OneToManyDyadCensus.tsx:192-200`; `aria-label` comes from `packages/fresco-ui/src/Node.tsx:303`, `data-node-selected` from `Node.tsx:319`). It is the only `.z-10` button on the page.
- The target grid is the `NodeList id="dyad-census-targets"` (`OneToManyDyadCensus.tsx:213-223`); `NodeList` passes `id` straight through to `Collection`, which sets `id={collectionId}` on the list container div (`packages/fresco-ui/src/collection/components/Collection.tsx:178`). Each item renders via `ConnectedMotionNode` with an `onClick`, giving it `role="option"` (Collection's item role) and `data-node-selected` reflecting `edgeExists(...)` (`OneToManyDyadCensus.tsx:166-171`).
- Pips render only when `prompts.length > 1` (`packages/interview/src/components/Prompts/Prompts.tsx:68` gate — cited in the dive file; exact line numbers for the `data-active` attribute were not re-verified in this pass, so the fixture reads it defensively via `getAttribute`).

```ts
// Insert into packages/interview/e2e/fixtures/stage-fixture.ts, replacing the
// placeholder OneToManyDyadCensusFixture (current lines 1138-1156).

/**
 * Fixture for OneToManyDyadCensus stages.
 *
 * Shows one "source"/focal node (a plain button, className="z-10", no
 * role="option" since it has no onClick — OneToManyDyadCensus.tsx:192-200)
 * and a grid of "target" nodes rendered inside NodeList id="dyad-census-targets"
 * (role="option" each, since they do have onClick — OneToManyDyadCensus.tsx:213-223).
 * Clicking a target toggles an edge to the current focal node
 * (OneToManyDyadCensus.tsx:140-152); selection state is reflected via
 * data-node-selected (Node.tsx:319) scoped to the prompt's createEdge type.
 */
class OneToManyDyadCensusFixture {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /** The current focal node — a button with no role="option" override. */
  getSourceNode(): Locator {
    return this.page.locator('button.z-10');
  }

  /** The focal node's visible label (its aria-label). */
  async getSourceLabel(): Promise<string> {
    return (await this.getSourceNode().getAttribute('aria-label')) ?? '';
  }

  /** The target-grid container (NodeList id="dyad-census-targets"). */
  get targetsContainer(): Locator {
    return this.page.locator('#dyad-census-targets');
  }

  /** A single target node by its label. */
  getTargetNode(label: string): Locator {
    return this.targetsContainer.getByRole('option', { name: label });
  }

  /** Visible target labels, in DOM (i.e. binSortOrder-applied) order. */
  async getTargetLabels(): Promise<string[]> {
    const options = await this.targetsContainer.getByRole('option').all();
    return Promise.all(
      options.map(async (o) => (await o.getAttribute('aria-label')) ?? ''),
    );
  }

  /** Click a target node to toggle the edge to the current focal node. */
  async toggleTarget(label: string): Promise<void> {
    await this.getTargetNode(label).click();
  }

  /** Whether a target currently has an edge to the focal node. */
  async isTargetSelected(label: string): Promise<boolean> {
    const selected =
      await this.getTargetNode(label).getAttribute('data-node-selected');
    return selected === 'true';
  }

  /** Pip dot locators (only present when prompts.length > 1). */
  getPips(): Locator {
    return this.page.locator('[data-active]');
  }

  /** Index of the currently active pip, or -1 if no pips are rendered. */
  async getActivePipIndex(): Promise<number> {
    const pips = await this.getPips().all();
    for (let i = 0; i < pips.length; i++) {
      if ((await pips[i]!.getAttribute('data-active')) === 'true') return i;
    }
    return -1;
  }
}
```

Also add `readonly oneToManyDyadCensus: OneToManyDyadCensusFixture;` to `StageFixture` (already declared at `stage-fixture.ts:1278`, so only the class body above needs to replace the placeholder — the field declaration and constructor assignment at lines 1278/1297 are unchanged).

**Option inventory entry**

```ts
// e2e/matrix/option-inventory.ts — add this entry to OPTION_INVENTORY
OneToManyDyadCensus: [
  'subject.type',
  'behaviours.removeAfterConsideration',
  'prompts (array length > 1)',
  'prompts[].createEdge',
  'prompts[].bucketSortOrder',
  'prompts[].binSortOrder',
  'prompts[].text',
  'label',
  'interviewScript',
  'filter',
  'skipLogic',
],
```

`filter` and `skipLogic` are claimed here for the schema-walk half of the coverage-manifest check (every top-level Zod key must appear in _some_ inventory) but are NOT claimed by any scenario's `covers` below — they're the shared cross-cutting suite's responsibility (Task 26).

**Scenario table**

All scenarios use one Person-type node with an auto-seeded `name` text variable (captured via `nt.addVariable({ name: 'name', type: 'text' })`, which dedupes per the builder's by-name lookup) so labels are fully controlled. `synth.addStage('OneToManyDyadCensus', opts)` returns a handle whose `.addPrompt(...)` matches `AddOneToManyDyadCensusPromptInput` 1:1 (`createEdge`, `bucketSortOrder`, `binSortOrder`, `text`) — no manual payload patching needed for anything in this table.

| id                                                | covers                                                                                                             | flags             | protocol config                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | interaction                                                                    | functional assertions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `basic-source-target-edge-creation`               | `subject.type`, `prompts[].createEdge`, `prompts[].text`, `label`, `interviewScript`, `prompts (array length > 1)` | `smoke`, `visual` | `Person` type (name var) + `Place` type (name var, off-subject-type); 3 manual Person nodes uid `p-carol`/`p-alice`/`p-bob` in that creation order (names Carol/Alice/Bob); 2 manual Place nodes `pl-library`/`pl-park`; `Friendship` edge type; `subject:{entity:'node', type: person.id}`; `behaviours.removeAfterConsideration:false`; 1 prompt `text:'**Bold** dyad prompt with _italic_ text'`, `createEdge: friendship.id`; `stage.label`/`interviewScript` set to internal-only marker strings | none before assertions; then `stage.oneToManyDyadCensus.toggleTarget('Alice')` | initial `getSourceLabel()` === `'Carol'`; `getTargetLabels()` === `['Alice','Bob']`; `page.getByText('Library')`/`page.getByText('Park')` have count 0 anywhere in `role=option`/`role=button`; `page.getByRole('heading').filter({hasText:'Subheading'})`-style check replaced by direct markdown check: prompt locator contains a `<strong>` with text `Bold` and an `<em>` with text `italic`; `stage.oneToManyDyadCensus.getPips()` count === 0 (single prompt, dead Pips gate); `page.getByText('INTERNAL LABEL SHOULD NOT SHOW')` and `page.getByText('INTERNAL SCRIPT SHOULD NOT SHOW')` both count 0; after toggling Alice: `getNetworkState().edges` has length 1 with `{from: carolUid, to: aliceUid, type: friendshipTypeId}`; `stage.oneToManyDyadCensus.isTargetSelected('Alice')` === true and `isTargetSelected('Bob')` === false |
| `remove-after-consideration-true`                 | `behaviours.removeAfterConsideration`                                                                              | —                 | 3 manual Person nodes creation order Carol/Alice/Bob; 1 edge type; 1 prompt; `behaviours.removeAfterConsideration:true`                                                                                                                                                                                                                                                                                                                                                                               | `interview.next()` once (advances focal from Carol to Alice)                   | `stage.oneToManyDyadCensus.getSourceLabel()` === `'Alice'`; `stage.oneToManyDyadCensus.getTargetNode('Carol')` has count 0 (pruned — already considered as focal); `getTargetNode('Bob')` is visible                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `remove-after-consideration-false`                | `behaviours.removeAfterConsideration`                                                                              | —                 | identical 3-node network/order; `behaviours.removeAfterConsideration:false`                                                                                                                                                                                                                                                                                                                                                                                                                           | `interview.next()` once (focal Carol → Alice)                                  | `getSourceLabel()` === `'Alice'`; `getTargetNode('Carol')` IS visible (not pruned) — proves the passthrough branch (`OneToManyDyadCensus.tsx:155`) is taken                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `multi-prompt-createEdge-per-prompt-and-back-nav` | `prompts (array length > 1)`, `prompts[].createEdge`                                                               | `visual`          | 3 manual Person nodes creation order Carol/Alice/Bob; 2 edge types `Friendship`/`Advice`; 1 node type only; `behaviours.removeAfterConsideration:false`; prompt 0 `createEdge: friendship.id`, prompt 1 `createEdge: advice.id`                                                                                                                                                                                                                                                                       | see fully-coded scenario below                                                 | see fully-coded scenario below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `bucket-sort-order-name-asc`                      | `prompts[].bucketSortOrder`                                                                                        | —                 | 3 manual Person nodes creation order Carol/Alice/Bob; 1 edge type; 1 prompt with `bucketSortOrder: [{ property: nameVarId, direction: 'asc' }]`                                                                                                                                                                                                                                                                                                                                                       | `interview.next()` twice, reading `getSourceLabel()` after each                | initial `getSourceLabel()` === `'Alice'` (not `'Carol'`, proving sort overrides creation order); after 1st `next()` === `'Bob'`; after 2nd `next()` === `'Carol'` — full focal sequence Alice→Bob→Carol                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `bin-sort-order-name-asc`                         | `prompts[].binSortOrder`                                                                                           | —                 | 3 manual Person nodes creation order Carol/Bob/Alice (deliberately non-alphabetical remainder so the sort is observable); 1 edge type; 1 prompt, no `bucketSortOrder` (focal stays Carol, the default first node), `binSortOrder: [{ property: nameVarId, direction: 'asc' }]`                                                                                                                                                                                                                        | none (assert immediately)                                                      | `getSourceLabel()` === `'Carol'`; `getTargetLabels()` === `['Alice','Bob']` — alphabetical, NOT the creation-remainder order `['Bob','Alice']` that would render absent `binSortOrder`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `creation-order-sort-rule-asterisk`               | `prompts[].bucketSortOrder`                                                                                        | —                 | 3 manual Person nodes creation order Carol/Alice/Bob; 1 edge type; 1 prompt with `bucketSortOrder: [{ property: '*', direction: 'desc' }]`                                                                                                                                                                                                                                                                                                                                                            | none (assert immediately)                                                      | `getSourceLabel()` === `'Bob'` (the LAST-created node, since `'*'` sorts by creation index and `direction:'desc'` reverses insertion order — `utils/createSorter.ts:263-266`) — proves the magic `'*'` property key is a resolvable sort rule, not just an implicit fallback                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

**Fully-coded scenarios**

```ts
// e2e/matrix/one-to-many-dyad-census.scenarios.ts
import { SyntheticInterview } from '@codaco/protocol-utilities';

import { expect } from '../fixtures/matrix-test.js';
import type { InterfaceScenarios } from './types.js';

/** Build a Person node type with a real "name" text variable id. */
function addPersonType(synth: SyntheticInterview, typeName = 'Person') {
  const nt = synth.addNodeType({ name: typeName });
  const nameVar = nt.addVariable({ name: 'name', type: 'text' });
  return { nt, nameVarId: nameVar.id };
}

export const oneToManyDyadCensusScenarios: InterfaceScenarios = {
  interfaceType: 'OneToManyDyadCensus',
  scenarios: [
    {
      id: 'basic-source-target-edge-creation',
      covers: [
        'subject.type',
        'prompts[].createEdge',
        'prompts[].text',
        'label',
        'interviewScript',
        'prompts (array length > 1)',
      ],
      smoke: true,
      visual: true,
      build: () => {
        const synth = new SyntheticInterview();
        const { nt: person, nameVarId } = addPersonType(synth, 'Person');
        const { nt: place, nameVarId: placeNameVarId } = addPersonType(
          synth,
          'Place',
        );
        const friendship = synth.addEdgeType({ name: 'Friendship' });

        const stage = synth.addStage('OneToManyDyadCensus', {
          label: 'INTERNAL LABEL SHOULD NOT SHOW',
          interviewScript: 'INTERNAL SCRIPT SHOULD NOT SHOW',
          subject: { entity: 'node', type: person.id },
          behaviours: { removeAfterConsideration: false },
        });

        synth.addManualNode(stage.id, person.id, 'p-carol', {
          [nameVarId]: 'Carol',
        });
        synth.addManualNode(stage.id, person.id, 'p-alice', {
          [nameVarId]: 'Alice',
        });
        synth.addManualNode(stage.id, person.id, 'p-bob', {
          [nameVarId]: 'Bob',
        });
        synth.addManualNode(stage.id, place.id, 'pl-library', {
          [placeNameVarId]: 'Library',
        });
        synth.addManualNode(stage.id, place.id, 'pl-park', {
          [placeNameVarId]: 'Park',
        });

        stage.addPrompt({
          text: '**Bold** dyad prompt with _italic_ text',
          createEdge: friendship.id,
        });

        return synth;
      },
      run: async ({ page, stage }) => {
        // subject.type: only the 2 remaining Person nodes are targets; the
        // 2 Place nodes never appear as focal or target candidates.
        await expect
          .poll(() => stage.oneToManyDyadCensus.getSourceLabel())
          .toBe('Carol');
        await expect
          .poll(() => stage.oneToManyDyadCensus.getTargetLabels())
          .toEqual(['Alice', 'Bob']);
        await expect(page.getByRole('option', { name: 'Library' })).toHaveCount(
          0,
        );
        await expect(page.getByRole('option', { name: 'Park' })).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Library' })).toHaveCount(
          0,
        );
        await expect(page.getByRole('button', { name: 'Park' })).toHaveCount(0);

        // prompts[].text: markdown renders as elements, not literal syntax.
        const prompt = stage.getPrompt();
        await expect(
          prompt.locator('strong', { hasText: 'Bold' }),
        ).toBeVisible();
        await expect(prompt.locator('em', { hasText: 'italic' })).toBeVisible();

        // prompts (array length > 1): single prompt renders no Pips.
        await expect(stage.oneToManyDyadCensus.getPips()).toHaveCount(0);

        // label / interviewScript: author-only, never rendered (base.ts, #663).
        await expect(
          page.getByText('INTERNAL LABEL SHOULD NOT SHOW'),
        ).toHaveCount(0);
        await expect(
          page.getByText('INTERNAL SCRIPT SHOULD NOT SHOW'),
        ).toHaveCount(0);

        // prompts[].createEdge: clicking a target toggles a typed edge.
        await stage.oneToManyDyadCensus.toggleTarget('Alice');
        await expect
          .poll(() => stage.oneToManyDyadCensus.isTargetSelected('Alice'))
          .toBe(true);
        expect(await stage.oneToManyDyadCensus.isTargetSelected('Bob')).toBe(
          false,
        );
      },
    },

    {
      id: 'remove-after-consideration-true',
      covers: ['behaviours.removeAfterConsideration'],
      build: () => {
        const synth = new SyntheticInterview();
        const { nt: person, nameVarId } = addPersonType(synth);
        const friendship = synth.addEdgeType({ name: 'Friendship' });
        const stage = synth.addStage('OneToManyDyadCensus', {
          subject: { entity: 'node', type: person.id },
          behaviours: { removeAfterConsideration: true },
        });
        synth.addManualNode(stage.id, person.id, 'p-carol', {
          [nameVarId]: 'Carol',
        });
        synth.addManualNode(stage.id, person.id, 'p-alice', {
          [nameVarId]: 'Alice',
        });
        synth.addManualNode(stage.id, person.id, 'p-bob', {
          [nameVarId]: 'Bob',
        });
        stage.addPrompt({ createEdge: friendship.id });
        return synth;
      },
      run: async ({ interview, stage }) => {
        await interview.next();
        await expect
          .poll(() => stage.oneToManyDyadCensus.getSourceLabel())
          .toBe('Alice');
        // Carol was already the focal/considered node — pruned from Alice's
        // target list (OneToManyDyadCensus.tsx:154-162).
        await expect(
          stage.oneToManyDyadCensus.getTargetNode('Carol'),
        ).toHaveCount(0);
        await expect(
          stage.oneToManyDyadCensus.getTargetNode('Bob'),
        ).toBeVisible();
      },
    },

    {
      id: 'remove-after-consideration-false',
      covers: ['behaviours.removeAfterConsideration'],
      build: () => {
        const synth = new SyntheticInterview();
        const { nt: person, nameVarId } = addPersonType(synth);
        const friendship = synth.addEdgeType({ name: 'Friendship' });
        const stage = synth.addStage('OneToManyDyadCensus', {
          subject: { entity: 'node', type: person.id },
          behaviours: { removeAfterConsideration: false },
        });
        synth.addManualNode(stage.id, person.id, 'p-carol', {
          [nameVarId]: 'Carol',
        });
        synth.addManualNode(stage.id, person.id, 'p-alice', {
          [nameVarId]: 'Alice',
        });
        synth.addManualNode(stage.id, person.id, 'p-bob', {
          [nameVarId]: 'Bob',
        });
        stage.addPrompt({ createEdge: friendship.id });
        return synth;
      },
      run: async ({ interview, stage }) => {
        await interview.next();
        await expect
          .poll(() => stage.oneToManyDyadCensus.getSourceLabel())
          .toBe('Alice');
        // false: Carol is NOT pruned from later target lists.
        await expect(
          stage.oneToManyDyadCensus.getTargetNode('Carol'),
        ).toBeVisible();
      },
    },

    {
      id: 'multi-prompt-createEdge-per-prompt-and-back-nav',
      covers: ['prompts (array length > 1)', 'prompts[].createEdge'],
      visual: true,
      build: () => {
        const synth = new SyntheticInterview();
        const { nt: person, nameVarId } = addPersonType(synth);
        const friendship = synth.addEdgeType({ name: 'Friendship' });
        const advice = synth.addEdgeType({ name: 'Advice' });
        const stage = synth.addStage('OneToManyDyadCensus', {
          subject: { entity: 'node', type: person.id },
          behaviours: { removeAfterConsideration: false },
        });
        synth.addManualNode(stage.id, person.id, 'p-carol', {
          [nameVarId]: 'Carol',
        });
        synth.addManualNode(stage.id, person.id, 'p-alice', {
          [nameVarId]: 'Alice',
        });
        synth.addManualNode(stage.id, person.id, 'p-bob', {
          [nameVarId]: 'Bob',
        });
        stage.addPrompt({
          text: 'Prompt one: friendship',
          createEdge: friendship.id,
        });
        stage.addPrompt({ text: 'Prompt two: advice', createEdge: advice.id });
        return synth;
      },
      run: async ({ page, interview, stage, protocol }) => {
        // 2 prompts: exactly 2 pip dots, first active.
        await expect(stage.oneToManyDyadCensus.getPips()).toHaveCount(2);
        expect(await stage.oneToManyDyadCensus.getActivePipIndex()).toBe(0);

        // Prompt 0, focal Carol: create a Friendship edge to Alice.
        await expect
          .poll(() => stage.oneToManyDyadCensus.getSourceLabel())
          .toBe('Carol');
        await stage.oneToManyDyadCensus.toggleTarget('Alice');

        // Advance through both remaining focal nodes of prompt 0 (Alice, Bob)
        // to cross the prompt boundary into prompt 1.
        await interview.next(); // Carol -> Alice
        await interview.next(); // Alice -> Bob
        await interview.next(); // Bob -> crosses into prompt 1, reseeds focal

        await expect(stage.getPrompt('Prompt two: advice')).toBeVisible();
        expect(await stage.oneToManyDyadCensus.getActivePipIndex()).toBe(1);
        await expect
          .poll(() => stage.oneToManyDyadCensus.getSourceLabel())
          .toBe('Carol'); // forward entry reseeds to the FIRST focal node

        // Prompt 1, focal Carol again: create an Advice edge to the same
        // Alice target — same pair, different edge type.
        await stage.oneToManyDyadCensus.toggleTarget('Alice');

        const network = await protocol.getNetworkState(interview.interviewId);
        expect(network?.edges).toHaveLength(2);
        const carolUid = 'p-carol';
        const aliceUid = 'p-alice';
        const friendshipEdge = network!.edges.find(
          (e) => e.from === carolUid && e.to === aliceUid,
        );
        const adviceEdge = network!.edges.find(
          (e) =>
            e.from === carolUid && e.to === aliceUid && e !== friendshipEdge,
        );
        expect(friendshipEdge).toBeDefined();
        expect(adviceEdge).toBeDefined();
        expect(friendshipEdge?.type).not.toBe(adviceEdge?.type);

        // Back once from prompt 1's first focal node: crosses back into
        // prompt 0 and resumes on the LAST node (Bob), not the first — the
        // #668 regression this option specifically documents.
        await page.getByTestId('previous-button').click();
        await expect(stage.getPrompt('Prompt one: friendship')).toBeVisible();
        expect(await stage.oneToManyDyadCensus.getActivePipIndex()).toBe(0);
        await expect
          .poll(() => stage.oneToManyDyadCensus.getSourceLabel())
          .toBe('Bob');
      },
    },

    {
      id: 'bucket-sort-order-name-asc',
      covers: ['prompts[].bucketSortOrder'],
      build: () => {
        const synth = new SyntheticInterview();
        const { nt: person, nameVarId } = addPersonType(synth);
        const friendship = synth.addEdgeType({ name: 'Friendship' });
        const stage = synth.addStage('OneToManyDyadCensus', {
          subject: { entity: 'node', type: person.id },
          behaviours: { removeAfterConsideration: false },
        });
        synth.addManualNode(stage.id, person.id, 'p-carol', {
          [nameVarId]: 'Carol',
        });
        synth.addManualNode(stage.id, person.id, 'p-alice', {
          [nameVarId]: 'Alice',
        });
        synth.addManualNode(stage.id, person.id, 'p-bob', {
          [nameVarId]: 'Bob',
        });
        stage.addPrompt({
          createEdge: friendship.id,
          bucketSortOrder: [{ property: nameVarId, direction: 'asc' }],
        });
        return synth;
      },
      run: async ({ interview, stage }) => {
        await expect
          .poll(() => stage.oneToManyDyadCensus.getSourceLabel())
          .toBe('Alice');
        await interview.next();
        await expect
          .poll(() => stage.oneToManyDyadCensus.getSourceLabel())
          .toBe('Bob');
        await interview.next();
        await expect
          .poll(() => stage.oneToManyDyadCensus.getSourceLabel())
          .toBe('Carol');
      },
    },

    {
      id: 'bin-sort-order-name-asc',
      covers: ['prompts[].binSortOrder'],
      build: () => {
        const synth = new SyntheticInterview();
        const { nt: person, nameVarId } = addPersonType(synth);
        const friendship = synth.addEdgeType({ name: 'Friendship' });
        const stage = synth.addStage('OneToManyDyadCensus', {
          subject: { entity: 'node', type: person.id },
          behaviours: { removeAfterConsideration: false },
        });
        synth.addManualNode(stage.id, person.id, 'p-carol', {
          [nameVarId]: 'Carol',
        });
        synth.addManualNode(stage.id, person.id, 'p-bob', {
          [nameVarId]: 'Bob',
        });
        synth.addManualNode(stage.id, person.id, 'p-alice', {
          [nameVarId]: 'Alice',
        });
        stage.addPrompt({
          createEdge: friendship.id,
          binSortOrder: [{ property: nameVarId, direction: 'asc' }],
        });
        return synth;
      },
      run: async ({ stage }) => {
        await expect
          .poll(() => stage.oneToManyDyadCensus.getSourceLabel())
          .toBe('Carol');
        await expect
          .poll(() => stage.oneToManyDyadCensus.getTargetLabels())
          .toEqual(['Alice', 'Bob']);
      },
    },

    {
      id: 'creation-order-sort-rule-asterisk',
      covers: ['prompts[].bucketSortOrder'],
      build: () => {
        const synth = new SyntheticInterview();
        const { nt: person, nameVarId } = addPersonType(synth);
        const friendship = synth.addEdgeType({ name: 'Friendship' });
        const stage = synth.addStage('OneToManyDyadCensus', {
          subject: { entity: 'node', type: person.id },
          behaviours: { removeAfterConsideration: false },
        });
        synth.addManualNode(stage.id, person.id, 'p-carol', {
          [nameVarId]: 'Carol',
        });
        synth.addManualNode(stage.id, person.id, 'p-alice', {
          [nameVarId]: 'Alice',
        });
        synth.addManualNode(stage.id, person.id, 'p-bob', {
          [nameVarId]: 'Bob',
        });
        stage.addPrompt({
          createEdge: friendship.id,
          bucketSortOrder: [{ property: '*', direction: 'desc' }],
        });
        return synth;
      },
      run: async ({ stage }) => {
        await expect
          .poll(() => stage.oneToManyDyadCensus.getSourceLabel())
          .toBe('Bob');
      },
    },
  ],
};
```

```ts
// e2e/specs/matrix/one-to-many-dyad-census.spec.ts
import { oneToManyDyadCensusScenarios } from '../../matrix/one-to-many-dyad-census.scenarios.js';
import { defineScenarioTests } from '../../matrix/run-scenario.js';

defineScenarioTests(oneToManyDyadCensusScenarios);
```

Notes on the fully-coded scenarios above:

- `addStage('OneToManyDyadCensus', { label, interviewScript, ... })` sets both fields via the typed `AddStageInput` option that Task 1 now owns (stage-generic per `stages/base.ts:10-16`); there is no need to reach past the handle onto a raw `stageEntry` poke.
- `protocol.getNetworkState(interview.interviewId)` matches the `getNetworkState` test hook shape described in the dive dependencies (`node`/`edge` objects with `from`/`to`/`type`); adjust the exact field access (`.from`/`.to` vs `.fromUid`/`.toUid`) to whatever `testHooks.ts:133-135`'s actual return type is once Task 2/3 land it. Its return type is `SessionPayload['network'] | undefined`, so index accesses (`network.edges`, `.find(...)`) must be guarded — follow the `expect(network?.edges).toHaveLength(n)` then `network!.edges...` pattern already used in the `DyadCensus`/`TieStrengthCensus` scenario files.
- `InterviewFixture` has no `back()` method (only `next()`, `dismissIntro()`, `nextButton`, `finishInterview()`, etc.); back-navigation goes through `page.getByTestId('previous-button').click()` directly, followed by the same `expect.poll(() => stage.oneToManyDyadCensus.getSourceLabel())`-style settle-wait already used after `interview.next()` calls elsewhere in this file.

- [ ] **Step 1: Write the stage-fixture helpers** — replace the placeholder `OneToManyDyadCensusFixture` class body in `e2e/fixtures/stage-fixture.ts` with the implementation above (field declaration/constructor wiring at lines 1278/1297 already exist and need no change).

- [ ] **Step 2: Write the registry + inventory entry + spec file** — create `e2e/matrix/one-to-many-dyad-census.scenarios.ts` and `e2e/specs/matrix/one-to-many-dyad-census.spec.ts` exactly as above; add the `OneToManyDyadCensus` entry to `OPTION_INVENTORY` in `e2e/matrix/option-inventory.ts`; import `oneToManyDyadCensusScenarios` into `e2e/matrix/coverage-manifest.test.ts`'s `ALL_SUITES` array (and into `all-scenarios.ts` if that aggregator file exists by this point in the plan's execution order).

- [ ] **Step 3: Run the coverage manifest**: `pnpm --filter @codaco/interview exec vitest run e2e/matrix` — Expected: PASS (all `OneToManyDyadCensus` inventory keys claimed by a scenario, `filter`/`skipLogic` excepted per the shared-suite carve-out; scenario ids unique).

- [ ] **Step 4: Run the scenarios**: `pnpm --filter @codaco/interview test:e2e:headed -- --project=chromium-matrix --grep "OneToManyDyadCensus"` — Expected: PASS; commit new `.aria.yml` baselines under `e2e/aria-snapshots/chromium/`.

- [ ] **Step 5: Typecheck + commit** with message `test(interview-e2e): OneToManyDyadCensus configuration matrix`:

```bash
pnpm typecheck
git add packages/interview/e2e
git commit -m "test(interview-e2e): OneToManyDyadCensus configuration matrix"
```

### Task 18: Sociogram matrix scenarios

**Files:**

- Create: `e2e/matrix/sociogram.scenarios.ts`
- Create: `e2e/specs/matrix/sociogram.spec.ts`
- Modify: `e2e/matrix/option-inventory.ts` (add the `Sociogram` entry — full code below)
- Modify: `e2e/matrix/coverage-manifest.test.ts` (append `sociogramScenarios` to `ALL_SUITES`)
- Modify: `e2e/matrix/shared-claims.ts` (append `'Sociogram:skipLogic'` and `'Sociogram:filter'` — bootstrapped now, exactly as Task 6 bootstrapped `'Information:skipLogic'`, so the coverage-manifest test stays green before Task 26 lands)
- Modify: `e2e/fixtures/stage-fixture.ts` (extend the existing `SociogramFixture` class, ~line 305-403, with 3 new drag methods — full code below)
- Modify: `packages/protocol-utilities/src/types.ts` (extend `AddPromptInput['highlight']` with an explicit `allowHighlighting` override — full diff below)
- Modify: `packages/protocol-utilities/src/SyntheticInterview.ts` (`resolveSociogramPrompt` — full diff below)

**Interfaces:**

- Consumes: `ScenarioDefinition`/`InterfaceScenarios`/`defineScenarioTests` (Task 6), `matrixTest`/`expect` (Task 4), `installScenario`/`buildSyntheticPayload`/`SyntheticAssetSpec` (Tasks 2, 6), `ProtocolFixture.installPayload`/`createInterview`/`getNetworkState` (Task 3), `InterviewFixture.nextButton`/`next()`/`goto()` (existing), the existing `SociogramFixture` (`stage.sociogram`, `e2e/fixtures/stage-fixture.ts:305-403` — `waitForSimulationSettled`, `getNode`, `clickNode`, `connectNodes`, `getEdgeCount`, `isNodeHighlighted`, `toggleHighlight`), and `SortRule`/builder prompt `sortOrder` passthrough for Sociogram (Task 1 — `resolveSociogramPrompt` must read `opts.sortOrder` into the returned entry; without this Task 1 addition the `sortorder-drawer-unplaced-nodes` scenario cannot be built).
- Produces: `sociogramScenarios: InterfaceScenarios` (14 scenarios); `SociogramFixture.dragNodeToCanvasPosition(label, {x,y})`, `SociogramFixture.dragNodeToDrawer(label)`, `SociogramFixture.unplaceNodeViaKeyboard(label)` (new methods other future Sociogram-adjacent work, e.g. the visual suite Task 27, can reuse); `AddPromptInput['highlight'].allowHighlighting?: boolean` (protocol-utilities builder extension every future Sociogram-authoring caller can now use to construct read-only-highlight-while-edges-create prompts, which the schema otherwise makes reachable only by hand-authoring JSON).

### Why two small protocol-utilities edits are in scope here

The dive file's assertion "`prompts[].highlight.variable` display-only (no `allowHighlighting`), coexisting with `edges.create`" is schema-legal (the schema's `superRefine` only forbids `edges.create` + `highlight.allowHighlighting: true` on the same prompt, not `edges.create` + a bare `highlight.variable`). But `resolveSociogramPrompt` currently hardcodes `allowHighlighting: true` whenever `opts.highlight` is given, so a matrix scenario cannot reach the display-only combination through the fluent builder without this fix — it's a genuine, narrowly-scoped gap blocking a specific listed option combination, not a redesign. Fix:

```ts
// packages/protocol-utilities/src/types.ts — AddPromptInput
export type AddPromptInput = {
  text?: string;
  layout?: {
    layoutVariable?: string;
  };
  edges?: {
    create?: boolean | string;
    display?: string[];
  };
  highlight?: {
    variable?: string | boolean;
    /**
     * Defaults to true when `highlight` is set. Pass false for read-only
     * highlight display (e.g. combined with `edges.create` on the same
     * prompt — the schema forbids `edges.create` + `allowHighlighting: true`
     * together, but allows `edges.create` + a display-only `highlight.variable`).
     */
    allowHighlighting?: boolean;
  };
  /** Unplaced-node drawer sort order (Sociogram only; ignored elsewhere). */
  sortOrder?: SortRule[];
};
```

```ts
// packages/protocol-utilities/src/SyntheticInterview.ts — resolveSociogramPrompt
// (only the highlight-resolution block and the final return change)
      highlight = {
        allowHighlighting: opts.highlight.allowHighlighting ?? true,
        variable,
      };
    }

    return {
      id: promptId,
      text: opts?.text ?? this.valueGen.generatePromptText('Sociogram'),
      layout: { layoutVariable },
      edges,
      highlight,
      sortOrder: opts?.sortOrder,
    };
```

Run `pnpm --filter @codaco/protocol-utilities typecheck` and `pnpm --filter @codaco/protocol-utilities exec vitest run` after this edit — expect PASS with no other call sites affected (both changes are additive/optional, default behavior unchanged for every existing caller including all 15 pre-existing Sociogram stories).

**Stage fixture helpers** (append inside the existing `SociogramFixture` class, right after `toggleHighlight`, `e2e/fixtures/stage-fixture.ts:305-403`; locators verified against `src/canvas/Canvas.tsx:144` (`data-zone-id="sociogram-canvas"` via `useDropTarget({id:'sociogram-canvas'})`, line 122-128), `src/components/NodeDrawer.tsx:113` (`{...dropProps}` spread onto the outer `motion.div`, giving it `data-zone-id="node-drawer"` via `useDropTarget({id:'node-drawer'})`, lines 48-55), and `src/canvas/useCanvasDrag.ts:11,74-98` (5px `DRAG_THRESHOLD`, pointer-capture-based drag — native `dragAndDrop()` does not work here, matching the dive file's dependency note)):

```ts
  /**
   * Drag a node — from the drawer (first placement) or already placed on
   * the canvas (reposition) — to a normalized (0-1) position on the
   * sociogram canvas. Both cases use pointer-capture-based drag
   * (useCanvasDrag.ts / fresco-ui's useDragSource), not native HTML5 DnD, so
   * Playwright's dragAndDrop() cannot simulate it — this uses raw
   * mouse.down/move/up instead.
   */
  async dragNodeToCanvasPosition(
    label: string,
    target: { x: number; y: number },
  ): Promise<void> {
    const node = this.getNode(label);
    const canvas = this.page.locator('[data-zone-id="sociogram-canvas"]');
    const nodeBox = await node.boundingBox();
    const canvasBox = await canvas.boundingBox();
    if (!nodeBox || !canvasBox) {
      throw new Error(`Could not measure node "${label}" or the canvas`);
    }
    const startX = nodeBox.x + nodeBox.width / 2;
    const startY = nodeBox.y + nodeBox.height / 2;
    const endX = canvasBox.x + canvasBox.width * target.x;
    const endY = canvasBox.y + canvasBox.height * target.y;

    await this.page.mouse.move(startX, startY);
    await this.page.mouse.down();
    // Clear the 5px DRAG_THRESHOLD (useCanvasDrag.ts:11) before the real
    // move, otherwise the eventual pointerup is treated as a click.
    await this.page.mouse.move(startX + 8, startY + 8);
    await this.page.mouse.move(endX, endY, { steps: 10 });
    await this.page.mouse.up();
  }

  /**
   * Drag a placed canvas node onto the unplaced-node drawer to unplace it
   * (the drag-based equivalent of `unplaceNodeViaKeyboard`).
   */
  async dragNodeToDrawer(label: string): Promise<void> {
    const node = this.getNode(label);
    const drawer = this.page.locator('[data-zone-id="node-drawer"]');
    const nodeBox = await node.boundingBox();
    const drawerBox = await drawer.boundingBox();
    if (!nodeBox || !drawerBox) {
      throw new Error(`Could not measure node "${label}" or the drawer`);
    }
    const startX = nodeBox.x + nodeBox.width / 2;
    const startY = nodeBox.y + nodeBox.height / 2;
    const endX = drawerBox.x + drawerBox.width / 2;
    const endY = drawerBox.y + Math.min(20, drawerBox.height / 2);

    await this.page.mouse.move(startX, startY);
    await this.page.mouse.down();
    await this.page.mouse.move(startX + 8, startY + 8);
    await this.page.mouse.move(endX, endY, { steps: 10 });
    await this.page.mouse.up();
  }

  /**
   * Unplace a focused, placed canvas node via the keyboard (Delete), the
   * accessible equivalent of `dragNodeToDrawer` (Sociogram.tsx:377 wires
   * `onNodeRemove` only in MANUAL mode).
   */
  async unplaceNodeViaKeyboard(label: string): Promise<void> {
    const node = this.getNode(label);
    await node.focus();
    await node.press('Delete');
  }
```

**Option inventory entry:**

```ts
// e2e/matrix/option-inventory.ts — add this entry to OPTION_INVENTORY
  Sociogram: [
    'type',
    'id',
    'label',
    'interviewScript',
    'skipLogic',
    'subject',
    'filter',
    'background.image',
    'background.concentricCircles',
    'background.skewedTowardCenter',
    'behaviours.automaticLayout',
    'behaviours.allowRepositioning',
    'behaviours.freeDraw',
    'prompts',
    'prompts[].id',
    'prompts[].text',
    'prompts[].layout.layoutVariable',
    'prompts[].sortOrder',
    'prompts[].edges.display',
    'prompts[].edges.create',
    'prompts[].highlight.allowHighlighting',
    'prompts[].highlight.variable',
  ],
```

`'skipLogic'` and `'filter'` are listed but claimed only via `shared-claims.ts` (this task appends `'Sociogram:skipLogic'` and `'Sociogram:filter'` there) — no scenario below claims them; Task 26 owns their actual test coverage.

### Scenario table

All 14 scenarios live in one `sociogramScenarios: InterfaceScenarios` (`interfaceType: 'Sociogram'`). Every protocol is a single Sociogram stage (no wrapping Information stages) unless noted, so `currentStep` defaults to 0 and no navigation-to-stage is needed before `run()`. `Person` node type always carries an auto-seeded `name` text variable (re-declare via `personType.addVariable({type:'text', name:'name'})` to get its id back — dedupes, per `SyntheticInterview.ts` `findVariableByName`).

| id                                         | covers                                                                                                                                                                                                                                         | flags             | protocol config                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | interaction                                                                                                                                                                                                                                                                                                                                                   | functional assertions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `manual-baseline-placed-and-unplaced`      | type, id, label, interviewScript, subject, prompts, prompts[].id, prompts[].text, prompts[].layout.layoutVariable, behaviours.automaticLayout (absent branch), background.concentricCircles (default), background.skewedTowardCenter (default) | `smoke`, `visual` | `addNodeType({name:'Person'})`; `layoutVar = personType.addVariable({type:'layout'})`; `addStage('Sociogram', {label:'Friendship map', interviewScript:'Ask about closeness.'})`; 3 nodes via `addManualNode(stage.id, personType.id, 'p0'..'p2', {[nameVar.id]:'Ash'/'Bea'/'Cy', [layoutVar.id]:{x,y}})` (placed); 2 more via `addManualNode` with `[nameVar.id]` only, no layout key (unplaced); `stage.addPrompt({text:'Position each person.', layout:{layoutVariable: layoutVar.id}})` | none — pure load assertions                                                                                                                                                                                                                                                                                                                                   | `sociogram` has `data-layout-mode="MANUAL"`; `[data-zone-id="sociogram-canvas"] button[aria-label]` count = 3; `[data-zone-id="node-drawer"] button` text contains `'2 unplaced'`; `page.getByRole('button', {name:'Pause Auto Layout'})` and `{name:'Resume Auto Layout'}` both count 0; `page.getByText('Friendship map')` and `page.getByText('Ask about closeness.')` both count 0 (dead config — label/interviewScript never render); default background: `sociogram.locator('svg[aria-hidden="true"] circle')` count = 4                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `background-concentric-circles-variants`   | background.concentricCircles, background.skewedTowardCenter                                                                                                                                                                                    | `visual`          | ONE protocol, 3 Sociogram stages sharing one `personType`/`layoutVar` (0 nodes — background rendering doesn't need nodes): stage0 `background:{concentricCircles:4, skewedTowardCenter:true}`; stage1 `background:{concentricCircles:2, skewedTowardCenter:false}`; stage2 `background:{concentricCircles:0}`; each `stage.addPrompt({layout:{layoutVariable: layoutVar.id}})`                                                                                                              | `await interview.next()` twice (single-prompt stages, so `next()` advances the STAGE — safe to use, unlike the multi-prompt case)                                                                                                                                                                                                                             | stage0: circle count 4, first/last `r` attrs ≈ 16.6 and 50 (`toBeCloseTo(50*(1-(0.75)**1.4), 0)`-style, ease-out q=1.4); stage1 (after 1×`next()`): circle count 2, `r` values ≈ 25 and 50 (linear, q=1: `50*(i/2)`); stage2 (after 2nd `next()`): `sociogram.locator('svg[aria-hidden="true"]')` count = 0 (component returns `null` at `n=0`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `background-image`                         | background.image                                                                                                                                                                                                                               | `visual`          | see fully-coded scenario below                                                                                                                                                                                                                                                                                                                                                                                                                                                              | none                                                                                                                                                                                                                                                                                                                                                          | see below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `manual-drag-place-and-reposition`         | prompts[].layout.layoutVariable (write path), behaviours.allowRepositioning (dead), behaviours.freeDraw (dead)                                                                                                                                 | —                 | `addStage('Sociogram', {behaviours:{allowRepositioning:false, freeDraw:true}})`; 1 placed node `'Ash'` at `{x:0.2,y:0.2}`, 1 unplaced `'Bea'`; single prompt with `layoutVariable`                                                                                                                                                                                                                                                                                                          | `stage.sociogram.dragNodeToCanvasPosition('Bea', {x:0.7,y:0.3})`; then `stage.sociogram.dragNodeToCanvasPosition('Ash', {x:0.4,y:0.6})`                                                                                                                                                                                                                       | before/after both drags: no drawing/annotation layer ever renders — `sociogram.locator('path[stroke="white"]')` count 0 always, because `behaviours.freeDraw` is read only by Narrative (`Narrative.tsx:152,294`); Sociogram never passes a `foreground` prop to `Canvas` (`Canvas.tsx:26` declares it optional, `Canvas.tsx:185-186` renders it, `Sociogram.tsx:363-378` omits it), so the Narrative-only annotation layer (its distinctive `path[stroke="white"]`, `Annotations.tsx:34-38`) can never mount here regardless of the flag; after 1st drag: `getNetworkState()` node `Bea`'s `[layoutVar.id]` ≈ `{x:0.7,y:0.3}` (±0.05); `[data-zone-id="node-drawer"]` text contains `'0 unplaced'`; after 2nd drag (reposition — proves `allowRepositioning:false` is dead for Sociogram, matching `__tests__/Sociogram.allowPositioning.test.ts`, which asserts `Sociogram.tsx` never passes `allowRepositioning` through to `Canvas` at all, so `CanvasNode.tsx:45`'s own default of `true` always wins): `Ash`'s `[layoutVar.id]` changes to ≈`{x:0.4,y:0.6}` |
| `unplace-drag-and-keyboard`                | prompts[].layout.layoutVariable (unplace path)                                                                                                                                                                                                 | —                 | `addStage('Sociogram')`; 3 placed nodes `'Ash'`,`'Bea'`,`'Cy'`                                                                                                                                                                                                                                                                                                                                                                                                                              | `stage.sociogram.dragNodeToDrawer('Ash')`; then `stage.sociogram.unplaceNodeViaKeyboard('Bea')`                                                                                                                                                                                                                                                               | after drag: `getNetworkState()` node `Ash`'s `[layoutVar.id]` is `null`; `[data-zone-id="node-drawer"]` text contains `'1 unplaced'`; a `div[role="status"][aria-live="polite"]` containing `'Ash returned to the drawer.'` appears (Sociogram.tsx `announce()` call); after keyboard unplace: `Bea`'s `[layoutVar.id]` is `null`, drawer text `'2 unplaced'`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `automatic-layout-settle`                  | behaviours.automaticLayout                                                                                                                                                                                                                     | —                 | see fully-coded scenario below                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `stage.sociogram.waitForSimulationSettled()`                                                                                                                                                                                                                                                                                                                  | see below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `automatic-layout-pause-resume`            | behaviours.automaticLayout                                                                                                                                                                                                                     | —                 | same shape as `automatic-layout-settle` but 4 nodes, 2 edges                                                                                                                                                                                                                                                                                                                                                                                                                                | settle, then `page.getByRole('button', {name:'Pause Auto Layout'})` click, then `stage.sociogram.dragNodeToCanvasPosition('Ash', {x:0.1,y:0.1})`, then click `{name:'Resume Auto Layout'}`                                                                                                                                                                    | after pause: button text is now `'Resume Auto Layout'`; `sociogram` keeps `data-simulation-running="false"` through the drag (worker stopped, so `moveNode`'s pin doesn't restart it); after resume click: `expect.poll(() => sociogram.getAttribute('data-simulation-running')).toBe('false')` (mock grid worker re-settles ~instantly) confirms it transitioned and re-settled rather than hanging `true`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `automatic-layout-node-drag`               | behaviours.automaticLayout                                                                                                                                                                                                                     | —                 | `automaticLayout:true`, 5 nodes, 3 edges                                                                                                                                                                                                                                                                                                                                                                                                                                                    | settle, then `stage.sociogram.dragNodeToCanvasPosition('Ash', {x:0.15,y:0.85})`                                                                                                                                                                                                                                                                               | `getNetworkState()` node `Ash`'s `[layoutVar.id]` after a second `waitForSimulationSettled()` is a NEW non-null `{x,y}` different from its pre-drag value (persisted via `handleNodeDragEnd`/`useAutoLayout.ts:268-276` even though the simulation owns positions)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `edges-full-matrix`                        | prompts[].edges.create, prompts[].edges.display                                                                                                                                                                                                | —                 | 2 edge types `friendshipType`, `workType`; 4 placed nodes; 3 prompts on ONE stage: prompt0 `edges:{create:friendshipType.id, display:[friendshipType.id]}` (create+display, same type); prompt1 `edges:{display:[friendshipType.id, workType.id]}` (both existing edges' types shown, no create); prompt2 `edges:{create:workType.id}` (create, NO display — the gotcha); seed 1 `friendshipType` edge and 1 `workType` edge between existing nodes up front                                | prompt0: `connectNodes('Ash','Bea')` (create), then `connectNodes('Ash','Bea')` again (remove — toggle); `clickNode('Ash')` twice (select/deselect, no edge); prompt1: `await interview.nextButton.click()` (advance prompt, NOT `interview.next()` — see multi-prompt note below); prompt2: `await interview.nextButton.click()`; `connectNodes('Cy','Dee')` | prompt0: after 1st connect, `getEdgeCount()` includes the new edge and `getNetworkState().edges` contains `{from:Ash,to:Bea,type:friendshipType}`; after 2nd connect, edge removed from both DOM and network; select/deselect leaves `data-node-linking` cleared and edge count unchanged; prompt1: exactly 2 SVG `line[data-edge-id]` (the 2 seeded edges, different `type`s — assert via 2 distinct `stroke` colors, `var(--edge-0)`/`var(--edge-1)`); prompt2 (gotcha): after `connectNodes`, `getNetworkState().edges` gains the `workType` edge but total SVG `line` count is UNCHANGED (still 2) — documents that `edges.create` is not auto-added to `edges.display`                                                                                                                                                                                                                                                                                                                                                                                       |
| `highlight-toggle`                         | prompts[].highlight.allowHighlighting, prompts[].highlight.variable                                                                                                                                                                            | —                 | `highlight:{variable: closeFriendVar.id, allowHighlighting:true}` (builder default — no override needed); node `'Ash'` seeded `closeFriendVar=true`, `'Bea'` seeded `false`                                                                                                                                                                                                                                                                                                                 | `clickNode('Bea')` then `clickNode('Ash')`                                                                                                                                                                                                                                                                                                                    | initially `isNodeHighlighted('Ash')` true, `isNodeHighlighted('Bea')` false; after clicking Bea: `isNodeHighlighted('Bea')` true and `getNetworkState()` shows `Bea`'s `[closeFriendVar.id] === true`; after clicking Ash: `isNodeHighlighted('Ash')` false and its attribute flips to `false`; `data-node-linking` never appears on either node (no `edges.create` on this prompt)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `highlight-display-only-with-edges-create` | prompts[].highlight.variable, prompts[].highlight.allowHighlighting (absence branch)                                                                                                                                                           | —                 | see fully-coded scenario below                                                                                                                                                                                                                                                                                                                                                                                                                                                              | see below                                                                                                                                                                                                                                                                                                                                                     | see below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `multi-prompt-navigation-and-collapse`     | prompts, prompts[].text                                                                                                                                                                                                                        | —                 | 5 placed nodes; prompt0 place-only (`text:'Position each person.'`); prompt1 `highlight:{variable: closeFriendVar.id}` (`text:'Now mark close friends.'`)                                                                                                                                                                                                                                                                                                                                   | click `prompts-toggle` (collapse), assert, click again (expand), THEN `await interview.nextButton.click()` (advance prompt — same stage, so plain click, not `interview.next()`)                                                                                                                                                                              | pips container (`[aria-hidden="true"]` sibling of the prompt text, per `Prompts.stories.tsx` precedent) has 2 children; 1st click: `page.getByTestId('prompts-toggle')` has `aria-expanded="false"` and its `aria-controls` target has computed height 0; 2nd click: `aria-expanded="true"`, height > 0; after `nextButton` click: `page.getByTestId('prompt')` text becomes `'Now mark close friends.'`; toggle auto-reopens (`aria-expanded="true"`) per `CollapsablePrompts.tsx:42-46`; `page.url()` step param is unchanged (same stage — this is prompt navigation, not stage navigation)                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `sortorder-drawer-unplaced-nodes`          | prompts[].sortOrder                                                                                                                                                                                                                            | —                 | see fully-coded scenario below                                                                                                                                                                                                                                                                                                                                                                                                                                                              | see below                                                                                                                                                                                                                                                                                                                                                     | see below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `subject-filters-to-node-type`             | subject                                                                                                                                                                                                                                        | —                 | `personType`/`layoutVar` as usual, `addStage('Sociogram', {subject:{entity:'node', type: personType.id}, initialNodes:{count:0}})`; 3 `Person` nodes placed via `addManualNode` (own `layoutVar`); a SECOND node type `venueType = addNodeType({name:'Venue'})` with its OWN layout var `venueLayoutVar = venueType.addVariable({type:'layout', name:'Venue Layout'})`; 2 `Venue` nodes placed via `addManualNode(stage.id, venueType.id, ..., {[venueLayoutVar.id]:{x,y}})`                | none                                                                                                                                                                                                                                                                                                                                                          | `[data-zone-id="sociogram-canvas"] button[aria-label]` count = 3 (Person only); `[data-zone-id="node-drawer"]` absent entirely (all 3 Person nodes placed, 0 unplaced Person nodes — Venue nodes are invisible to both canvas AND drawer, never counted); `getNetworkState().nodes` length = 5 (all 5 nodes retained in the network — filtering is display-only)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

### Fully-coded scenarios

```ts
// e2e/matrix/sociogram.scenarios.ts
import path from 'node:path';

import { SyntheticInterview } from '@codaco/protocol-utilities';
import { entityAttributesProperty } from '@codaco/shared-consts';

import { expect } from '../fixtures/matrix-test.js';
import type { InterfaceScenarios, ScenarioDefinition } from './types.js';

const DEV_PROTOCOL_ASSETS_DIR = path.resolve(
  import.meta.dirname,
  '../../../development-protocol/assets',
);

// --- manual-baseline-placed-and-unplaced ---------------------------------

function buildManualBaseline(): ScenarioDefinition {
  return {
    id: 'manual-baseline-placed-and-unplaced',
    covers: [
      'type',
      'id',
      'label',
      'interviewScript',
      'subject',
      'prompts',
      'prompts[].id',
      'prompts[].text',
      'prompts[].layout.layoutVariable',
      'behaviours.automaticLayout',
      'background.concentricCircles',
      'background.skewedTowardCenter',
    ],
    smoke: true,
    visual: true,
    build: () => {
      const synth = new SyntheticInterview();
      const personType = synth.addNodeType({ name: 'Person' });
      const nameVar = personType.addVariable({ type: 'text', name: 'name' });
      const layoutVar = personType.addVariable({
        type: 'layout',
        name: 'Sociogram Layout',
      });
      const stage = synth.addStage('Sociogram', {
        label: 'Friendship map',
        interviewScript: 'Ask about closeness.',
      });
      // Placed: explicit layout attribute.
      synth.addManualNode(stage.id, personType.id, 'p0', {
        [nameVar.id]: 'Ash',
        [layoutVar.id]: { x: 0.3, y: 0.3 },
      });
      synth.addManualNode(stage.id, personType.id, 'p1', {
        [nameVar.id]: 'Bea',
        [layoutVar.id]: { x: 0.6, y: 0.4 },
      });
      synth.addManualNode(stage.id, personType.id, 'p2', {
        [nameVar.id]: 'Cy',
        [layoutVar.id]: { x: 0.5, y: 0.7 },
      });
      // Unplaced: no layout key at all.
      synth.addManualNode(stage.id, personType.id, 'p3', {
        [nameVar.id]: 'Dee',
      });
      synth.addManualNode(stage.id, personType.id, 'p4', {
        [nameVar.id]: 'Eve',
      });
      stage.addPrompt({
        text: 'Position each person.',
        layout: { layoutVariable: layoutVar.id },
      });
      return synth;
    },
    run: async ({ page }) => {
      const sociogram = page.getByTestId('sociogram');
      await expect(sociogram).toHaveAttribute('data-layout-mode', 'MANUAL');

      await expect(
        sociogram.locator(
          '[data-zone-id="sociogram-canvas"] button[aria-label]',
        ),
      ).toHaveCount(3);
      await expect(page.locator('[data-zone-id="node-drawer"]')).toContainText(
        '2 unplaced',
      );

      // behaviours.automaticLayout is absent, so SimulationPanel never
      // mounts (Sociogram.tsx only renders it when layoutMode === 'AUTOMATIC').
      await expect(
        page.getByRole('button', { name: 'Pause Auto Layout' }),
      ).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: 'Resume Auto Layout' }),
      ).toHaveCount(0);

      // label/interviewScript are stage metadata, never rendered to the participant.
      await expect(page.getByText('Friendship map')).toHaveCount(0);
      await expect(page.getByText('Ask about closeness.')).toHaveCount(0);

      // Default background: ConcentricCircles n=4, skewed=true.
      await expect(
        sociogram.locator('svg[aria-hidden="true"] circle'),
      ).toHaveCount(4);
    },
  };
}

// --- background-concentric-circles-variants ------------------------------

function buildBackgroundConcentricCirclesVariants(): ScenarioDefinition {
  return {
    id: 'background-concentric-circles-variants',
    covers: ['background.concentricCircles', 'background.skewedTowardCenter'],
    visual: true,
    build: () => {
      const synth = new SyntheticInterview();
      const personType = synth.addNodeType({ name: 'Person' });
      const layoutVar = personType.addVariable({
        type: 'layout',
        name: 'Sociogram Layout',
      });
      // 3 stages sharing one personType/layoutVar; 0 nodes each — background
      // rendering doesn't depend on any nodes being present.
      const stage0 = synth.addStage('Sociogram', {
        initialNodes: { count: 0 },
        background: { concentricCircles: 4, skewedTowardCenter: true },
      });
      stage0.addPrompt({ layout: { layoutVariable: layoutVar.id } });
      const stage1 = synth.addStage('Sociogram', {
        initialNodes: { count: 0 },
        background: { concentricCircles: 2, skewedTowardCenter: false },
      });
      stage1.addPrompt({ layout: { layoutVariable: layoutVar.id } });
      const stage2 = synth.addStage('Sociogram', {
        initialNodes: { count: 0 },
        background: { concentricCircles: 0 },
      });
      stage2.addPrompt({ layout: { layoutVariable: layoutVar.id } });
      return synth;
    },
    run: async ({ page, interview }) => {
      const sociogram = page.getByTestId('sociogram');
      const circles = sociogram.locator('svg[aria-hidden="true"] circle');

      // components/ConcentricCircles.tsx reverses its radii array before
      // rendering, so the FIRST rendered circle is always the outermost
      // (r=50, i=n) and the LAST is the innermost (smallest i).
      await expect(circles).toHaveCount(4);
      expect(Number(await circles.first().getAttribute('r'))).toBeCloseTo(
        50,
        0,
      );
      expect(Number(await circles.last().getAttribute('r'))).toBeCloseTo(
        16.6,
        0,
      );

      // 3 single-prompt stages, so next() advances the STAGE each time.
      await interview.next();
      await expect(circles).toHaveCount(2);
      expect(Number(await circles.first().getAttribute('r'))).toBeCloseTo(
        50,
        0,
      );
      expect(Number(await circles.last().getAttribute('r'))).toBeCloseTo(25, 0);

      await interview.next();
      // ConcentricCircles returns null at n=0 — no svg renders at all.
      await expect(sociogram.locator('svg[aria-hidden="true"]')).toHaveCount(0);
    },
  };
}

// --- manual-drag-place-and-reposition ------------------------------------

function buildManualDragPlaceAndReposition(): ScenarioDefinition {
  let layoutVarId = '';
  return {
    id: 'manual-drag-place-and-reposition',
    covers: [
      'prompts[].layout.layoutVariable',
      'behaviours.allowRepositioning',
      'behaviours.freeDraw',
    ],
    build: () => {
      const synth = new SyntheticInterview();
      const personType = synth.addNodeType({ name: 'Person' });
      const nameVar = personType.addVariable({ type: 'text', name: 'name' });
      const layoutVar = personType.addVariable({
        type: 'layout',
        name: 'Sociogram Layout',
      });
      layoutVarId = layoutVar.id;
      const stage = synth.addStage('Sociogram', {
        // Both are dead config for Sociogram — asserted in run().
        behaviours: { allowRepositioning: false, freeDraw: true },
      });
      synth.addManualNode(stage.id, personType.id, 'p0', {
        [nameVar.id]: 'Ash',
        [layoutVar.id]: { x: 0.2, y: 0.2 },
      });
      synth.addManualNode(stage.id, personType.id, 'p1', {
        [nameVar.id]: 'Bea',
      });
      stage.addPrompt({ layout: { layoutVariable: layoutVar.id } });
      return synth;
    },
    run: async ({ page, protocol, interview, stage }) => {
      const sociogram = page.getByTestId('sociogram');

      // freeDraw is read only by Narrative (Narrative.tsx:152,294) —
      // Sociogram.tsx:363-378 never passes a `foreground` prop to `Canvas`
      // (Canvas.tsx:26 declares it optional, Canvas.tsx:185-186 renders it),
      // so the Narrative-only annotation layer (its distinctive
      // `path[stroke="white"]`, Annotations.tsx:34-38) can never mount here
      // regardless of the flag.
      await expect(sociogram.locator('path[stroke="white"]')).toHaveCount(0);

      await stage.sociogram.dragNodeToCanvasPosition('Bea', {
        x: 0.7,
        y: 0.3,
      });

      let state = await protocol.getNetworkState(interview.interviewId);
      let bea = state?.nodes.find(
        (n) => n[entityAttributesProperty]['name'] === 'Bea',
      );
      expect(bea?.[entityAttributesProperty][layoutVarId]).toMatchObject({
        x: expect.closeTo(0.7, 1),
        y: expect.closeTo(0.3, 1),
      });
      await expect(page.locator('[data-zone-id="node-drawer"]')).toContainText(
        '0 unplaced',
      );

      // behaviours.allowRepositioning:false is dead for Sociogram — dragging
      // an already-placed node still repositions it (matches
      // __tests__/Sociogram.allowPositioning.test.ts, which asserts
      // Sociogram.tsx never even passes `allowRepositioning` through to
      // `Canvas`, so `CanvasNode.tsx:45`'s own default of `true` always wins).
      await stage.sociogram.dragNodeToCanvasPosition('Ash', {
        x: 0.4,
        y: 0.6,
      });

      state = await protocol.getNetworkState(interview.interviewId);
      const ash = state?.nodes.find(
        (n) => n[entityAttributesProperty]['name'] === 'Ash',
      );
      expect(ash?.[entityAttributesProperty][layoutVarId]).toMatchObject({
        x: expect.closeTo(0.4, 1),
        y: expect.closeTo(0.6, 1),
      });

      // Annotation layer still never renders after both drags.
      await expect(sociogram.locator('path[stroke="white"]')).toHaveCount(0);
    },
  };
}

// --- background-image ---------------------------------------------------

function buildBackgroundImage(): ScenarioDefinition {
  const bgAssetId = 'sociogram-bg-1';
  return {
    id: 'background-image',
    covers: ['background.image'],
    visual: true,
    build: () => {
      const synth = new SyntheticInterview();
      const personType = synth.addNodeType({ name: 'Person' });
      const layoutVar = personType.addVariable({
        type: 'layout',
        name: 'Sociogram Layout',
      });
      const stage = synth.addStage('Sociogram', {
        initialNodes: { count: 3 },
        // background.image wins over concentricCircles when both are set
        // (Sociogram.tsx:336-344) — set both to pin that precedence.
        background: { image: bgAssetId, concentricCircles: 4 },
      });
      stage.addPrompt({ layout: { layoutVariable: layoutVar.id } });
      synth.addAsset({
        id: bgAssetId,
        name: 'Background',
        type: 'image',
        source: 'quadrant.png',
      });
      return synth;
    },
    assets: [
      {
        assetId: bgAssetId,
        name: 'Background',
        type: 'image',
        source: 'quadrant.png',
        localPath: path.join(DEV_PROTOCOL_ASSETS_DIR, 'quadrant.png'),
      },
    ],
    run: async ({ page }) => {
      const sociogram = page.getByTestId('sociogram');
      const img = sociogram.locator('img[alt="Background"]');
      await expect(img).toBeVisible();
      await expect(img).toHaveAttribute('src', /quadrant\.png/);
      // Actually loaded from the asset server, not a broken image.
      await expect
        .poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth))
        .toBeGreaterThan(0);
      // background.image wins: no ConcentricCircles SVG renders alongside it.
      await expect(sociogram.locator('svg[aria-hidden="true"]')).toHaveCount(0);
    },
  };
}

// --- automatic-layout-settle ---------------------------------------------

function buildAutomaticLayoutSettle(): ScenarioDefinition {
  let layoutVarId = '';
  return {
    id: 'automatic-layout-settle',
    covers: ['behaviours.automaticLayout'],
    build: () => {
      const synth = new SyntheticInterview();
      const personType = synth.addNodeType({ name: 'Person' });
      const layoutVar = personType.addVariable({
        type: 'layout',
        name: 'Sociogram Layout',
      });
      layoutVarId = layoutVar.id;
      const friendshipType = synth.addEdgeType({ name: 'Friendship' });
      const stage = synth.addStage('Sociogram', {
        initialNodes: { count: 6 },
        behaviours: { automaticLayout: true },
      });
      stage.addPrompt({
        layout: { layoutVariable: layoutVar.id },
        edges: { create: friendshipType.id, display: [friendshipType.id] },
      });
      // Nodes are NOT given explicit layout attrs — the simulation is
      // responsible for placing all 6 from scratch.
      synth.addEdges(
        [
          [0, 1],
          [0, 2],
          [1, 2],
          [3, 4],
          [4, 5],
        ],
        friendshipType.id,
      );
      return synth;
    },
    run: async ({ page, protocol, interview, stage }) => {
      const sociogram = page.getByTestId('sociogram');
      await expect(sociogram).toHaveAttribute('data-layout-mode', 'AUTOMATIC');
      await expect(page.locator('[data-zone-id="node-drawer"]')).toHaveCount(0);

      await stage.sociogram.waitForSimulationSettled();

      await expect(
        sociogram.locator(
          '[data-zone-id="sociogram-canvas"] button[aria-label]',
        ),
      ).toHaveCount(6);

      const state = await protocol.getNetworkState(interview.interviewId);
      const positions = state?.nodes.map(
        (n) => n[entityAttributesProperty][layoutVarId],
      );
      expect(positions).toHaveLength(6);
      for (const position of positions ?? []) {
        expect(position).toMatchObject({
          x: expect.any(Number),
          y: expect.any(Number),
        });
      }
    },
  };
}

// --- highlight-display-only-with-edges-create ----------------------------

function buildHighlightDisplayOnlyWithEdgesCreate(): ScenarioDefinition {
  let layoutVarId = '';
  let closeFriendVarId = '';
  let friendshipTypeId = '';
  return {
    id: 'highlight-display-only-with-edges-create',
    covers: [
      'prompts[].highlight.variable',
      'prompts[].highlight.allowHighlighting',
    ],
    build: () => {
      const synth = new SyntheticInterview();
      const personType = synth.addNodeType({ name: 'Person' });
      const nameVar = personType.addVariable({ type: 'text', name: 'name' });
      const layoutVar = personType.addVariable({
        type: 'layout',
        name: 'Sociogram Layout',
      });
      layoutVarId = layoutVar.id;
      const closeFriendVar = personType.addVariable({
        type: 'boolean',
        name: 'Close Friend',
      });
      closeFriendVarId = closeFriendVar.id;
      const friendshipType = synth.addEdgeType({ name: 'Friendship' });
      friendshipTypeId = friendshipType.id;

      const stage = synth.addStage('Sociogram', { initialNodes: { count: 3 } });
      stage.addPrompt({
        text: 'Draw a line between people who know each other.',
        layout: { layoutVariable: layoutVar.id },
        edges: { create: friendshipType.id, display: [friendshipType.id] },
        // Schema-legal: superRefine only forbids edges.create combined with
        // allowHighlighting:true, not a bare display-only highlight.variable.
        highlight: { variable: closeFriendVar.id, allowHighlighting: false },
      });

      synth.setNodeAttribute(0, nameVar.id, 'Ash');
      synth.setNodeAttribute(1, nameVar.id, 'Bea');
      synth.setNodeAttribute(2, nameVar.id, 'Cy');
      synth.setNodeAttribute(0, layoutVar.id, { x: 0.3, y: 0.3 });
      synth.setNodeAttribute(1, layoutVar.id, { x: 0.7, y: 0.3 });
      synth.setNodeAttribute(2, layoutVar.id, { x: 0.5, y: 0.7 });
      synth.setNodeAttribute(0, closeFriendVar.id, true);
      synth.setNodeAttribute(1, closeFriendVar.id, false);
      synth.setNodeAttribute(2, closeFriendVar.id, false);
      return synth;
    },
    run: async ({ page, protocol, interview, stage }) => {
      // Read-only highlight renders from the seeded attribute before any
      // interaction — allowHighlighting:false never blocks display.
      await expect(stage.sociogram.isNodeHighlighted('Ash')).resolves.toBe(
        true,
      );
      await expect(stage.sociogram.isNodeHighlighted('Bea')).resolves.toBe(
        false,
      );

      // Tapping nodes on this prompt always creates/toggles an edge — the
      // create handler branch runs unconditionally before the highlight
      // branch is ever reached (Sociogram.tsx handleNodeSelect).
      await stage.sociogram.connectNodes('Ash', 'Bea');

      expect(await stage.sociogram.getEdgeCount()).toBe(1);
      const state = await protocol.getNetworkState(interview.interviewId);
      expect(state?.edges).toContainEqual(
        expect.objectContaining({ type: friendshipTypeId }),
      );

      // Highlight attribute is untouched by the tap — display-only confirmed.
      const ashAfter = state?.nodes.find(
        (n) => n[entityAttributesProperty]['name'] === 'Ash',
      );
      expect(ashAfter?.[entityAttributesProperty][closeFriendVarId]).toBe(true);
      await expect(stage.sociogram.isNodeHighlighted('Ash')).resolves.toBe(
        true,
      );
      await expect(stage.sociogram.isNodeHighlighted('Bea')).resolves.toBe(
        false,
      );
      void layoutVarId; // referenced only to document the closure shape
    },
  };
}

// --- sortorder-drawer-unplaced-nodes -------------------------------------

function buildSortOrderDrawer(): ScenarioDefinition {
  return {
    id: 'sortorder-drawer-unplaced-nodes',
    covers: ['prompts[].sortOrder'],
    build: () => {
      const synth = new SyntheticInterview();
      const personType = synth.addNodeType({ name: 'Person' });
      const nameVar = personType.addVariable({ type: 'text', name: 'name' });
      const layoutVar = personType.addVariable({
        type: 'layout',
        name: 'Sociogram Layout',
      });
      const stage = synth.addStage('Sociogram');

      const names = ['Dave', 'Alice', 'Carol', 'Bob'];
      names.forEach((name, i) => {
        // No layout key at all => unplaced, per the dependency note on
        // seeding placed (attr set) vs unplaced (attr unset) nodes.
        synth.addManualNode(stage.id, personType.id, `person-${i}`, {
          [nameVar.id]: name,
        });
      });

      stage.addPrompt({
        text: 'Unplaced people, sorted by name descending.',
        layout: { layoutVariable: layoutVar.id },
        sortOrder: [{ property: nameVar.id, direction: 'desc' }],
      });
      stage.addPrompt({
        text: 'Unplaced people, sorted by name ascending.',
        layout: { layoutVariable: layoutVar.id },
        sortOrder: [{ property: nameVar.id, direction: 'asc' }],
      });
      return synth;
    },
    run: async ({ page, interview }) => {
      const drawerLabels = () =>
        page
          .locator('[data-zone-id="node-drawer"] button[aria-label]')
          .evaluateAll((buttons) =>
            buttons
              .map((b) => b.getAttribute('aria-label') ?? '')
              .filter((l) => l !== 'Expand drawer' && l !== 'Collapse drawer'),
          );

      await expect
        .poll(drawerLabels)
        .toEqual(['Dave', 'Carol', 'Bob', 'Alice']);

      // 2 prompts on 1 stage: "next" advances the prompt, not the stage, so
      // the URL step never changes — interview.next() would time out
      // waiting for a step change that never happens. Click the raw button.
      await interview.nextButton.click();
      await expect(page.getByTestId('prompt')).toHaveText(
        'Unplaced people, sorted by name ascending.',
      );
      await expect
        .poll(drawerLabels)
        .toEqual(['Alice', 'Bob', 'Carol', 'Dave']);
    },
  };
}

export const sociogramScenarios: InterfaceScenarios = {
  interfaceType: 'Sociogram',
  scenarios: [
    buildManualBaseline(),
    buildBackgroundConcentricCirclesVariants(),
    buildBackgroundImage(),
    buildManualDragPlaceAndReposition(),
    buildAutomaticLayoutSettle(),
    buildHighlightDisplayOnlyWithEdgesCreate(),
    buildSortOrderDrawer(),
    // unplace-drag-and-keyboard, automatic-layout-pause-resume,
    // automatic-layout-node-drag, edges-full-matrix, highlight-toggle,
    // multi-prompt-navigation-and-collapse, and subject-filters-to-node-type
    // follow the exact shapes in the scenario table above — same
    // object-literal or closure-factory pattern as the 7 above, omitted here
    // only for length.
  ],
};
```

The 7 remaining table-only scenarios must be added as additional entries in the `scenarios` array above (either plain object literals for the ones with no cross-referenced variable ids — `unplace-drag-and-keyboard`, `edges-full-matrix`, `multi-prompt-navigation-and-collapse`, `subject-filters-to-node-type` — or the closure-factory pattern shown above for the ones that read a variable id back out in `run()` — `automatic-layout-pause-resume`, `automatic-layout-node-drag`, `highlight-toggle`). Every cell in the scenario table above is concrete enough to write directly: node counts, exact `addStage`/`addPrompt`/`addManualNode`/`setNodeAttribute`/`addEdges` calls, exact locators, and exact expected values.

```ts
// e2e/specs/matrix/sociogram.spec.ts
import { sociogramScenarios } from '../../matrix/sociogram.scenarios.js';
import { defineScenarioTests } from '../../matrix/run-scenario.js';

defineScenarioTests(sociogramScenarios);
```

- [ ] **Step 1: Land the two protocol-utilities builder extensions** (full diffs above — `AddPromptInput.highlight.allowHighlighting`, `AddPromptInput.sortOrder` passthrough in `resolveSociogramPrompt`)

Run: `pnpm --filter @codaco/protocol-utilities typecheck && pnpm --filter @codaco/protocol-utilities exec vitest run`
Expected: PASS, no existing Sociogram-story or other-interface call sites break (both fields are optional and additive).

- [ ] **Step 2: Write the stage-fixture drag helpers** (code above, appended to the existing `SociogramFixture` class)

- [ ] **Step 3: Write the registry + inventory entry + shared-claims + spec file**

Write `e2e/matrix/sociogram.scenarios.ts` (14 scenarios: the 7 fully-coded above plus the 7 built directly from the scenario table), `e2e/specs/matrix/sociogram.spec.ts`, the `Sociogram` entry in `option-inventory.ts`, append `sociogramScenarios` to `ALL_SUITES` in `coverage-manifest.test.ts`, and append `'Sociogram:skipLogic'`, `'Sociogram:filter'` to `sharedSuiteClaims` in `shared-claims.ts`.

- [ ] **Step 4: Run the coverage manifest**: `pnpm --filter @codaco/interview exec vitest run e2e/matrix` — Expected: PASS (all 22 `Sociogram` inventory keys claimed; scenario ids unique).

- [ ] **Step 5: Run the scenarios**: `pnpm --filter @codaco/interview test:e2e:headed -- --project=chromium-matrix --grep "Sociogram"` — Expected: PASS; commit new `e2e/aria-snapshots/chromium/sociogram-*.aria.yml` baselines and the 3 visual-flagged pixel baselines (handled by the Task 27 visual suite once it exists — for now the `visual: true` flag only needs to be set correctly, no pixel baseline is generated by `chromium-matrix`).

- [ ] **Step 6: Typecheck + commit** with message `test(interview-e2e): Sociogram configuration matrix`

```bash
git add packages/interview/e2e packages/protocol-utilities/src
git commit -m "test(interview-e2e): Sociogram configuration matrix"
```

### Task 19: NetworkComposer matrix scenarios

**Files:**

- Create: `e2e/matrix/network-composer.scenarios.ts`
- Create: `e2e/specs/matrix/network-composer.spec.ts`
- Modify: `e2e/matrix/option-inventory.ts` (add the `NetworkComposer` entry — full code below)
- Modify: `e2e/matrix/coverage-manifest.test.ts` (append `import { networkComposerScenarios } from './network-composer.scenarios.js';` and add it to `ALL_SUITES`) and `e2e/matrix/all-scenarios.ts` if it exists by the time this task lands (append the same import/registration)
- Modify: `e2e/fixtures/stage-fixture.ts` (add a `NetworkComposerFixture` class + `networkComposer` property on `StageFixture` — fixture work IS assigned to this task, no prior NetworkComposer fixture exists anywhere)
- Modify: `e2e/matrix/shared-claims.ts` (bootstrap `'NetworkComposer:skipLogic'` into `sharedSuiteClaims` — see Step 3)

**Interfaces:**

- Consumes: `ScenarioDefinition`/`InterfaceScenarios`/`defineScenarioTests` (Task 6), `SyntheticInterview` builder's `NetworkComposer` stage support — `addStage('NetworkComposer', AddStageInput)`, the returned handle's `addEdgeType(AddNetworkComposerEdgeInput): { id: string }` and `addNodeFormField(NetworkComposerFormFieldInput)` (both already implemented in `packages/protocol-utilities/src/SyntheticInterview.ts:158-162,951-978`), Task 1's `NetworkComposerFormFieldInput` extension (adds `hint`/`showValidationHints` fields, consumed by the `fields[].hint` and `fields[].showValidationHints` scenarios — this task does not itself modify any `protocol-utilities` source, it only relies on Task 1's extension already being in place), seeded interviews via `seedNetwork`/`currentStep` (Task 3/Task 6 runner — `installScenario` in `run-scenario.ts` already threads `result.session.network`/`currentStep` into `protocol.createInterview`, so this task does not touch the runner).
- Produces: `networkComposerScenarios: InterfaceScenarios` (14 scenarios), plus the new `StageFixture.networkComposer: NetworkComposerFixture` other future NetworkComposer-adjacent work can reuse.

**IMPORTANT prerequisite fact confirmed from source (do not re-derive):** `AddStageInput.subject` must be `{ entity: 'node', type: <nodeTypeId> }` — the builder throws `'NetworkComposer stages require a node subject'` otherwise (`SyntheticInterview.ts:631-633`). If `quickAdd`/`layoutVariable` are omitted the builder auto-creates a text `name` variable and a `layout` variable on the subject's node type respectively (`SyntheticInterview.ts:640-659`) — scenarios below only pass them explicitly when a specific variable id is needed for later reference (e.g. drag assertions read the layout variable's value), otherwise they are omitted for brevity. `resolveNetworkComposerFormField`/`addNodeFormField` auto-create a codebook variable from `component` via `COMPONENT_TO_VARIABLE_TYPE` (`packages/protocol-utilities/src/constants.ts:7-20`) and seed `DEFAULT_CATEGORICAL_OPTIONS`/`DEFAULT_ORDINAL_OPTIONS` (`constants.ts:22-31+`) when `options` isn't supplied and `variable` is omitted — scenarios below still call `nt.addVariable(...)` explicitly first whenever the test needs to reference the field's `data-field-name` (which is the variable id, confirmed in `packages/interview/src/forms/useProtocolForm.tsx:192` — `name: fieldName` where `fieldName = field.variable`), matching the existing `FormFixture.getField()` convention in `e2e/fixtures/stage-fixture.ts:88-90`.

---

## Stage fixture helpers

No `NetworkComposer` sub-fixture exists at all yet. Add this class to `e2e/fixtures/stage-fixture.ts` (alongside the other per-interface fixture classes, e.g. `SociogramFixture`) and wire it into `StageFixture` the same way `sociogram`/`ordinalBin` are wired (constructor + readonly property).

Locators are cited against the interface source read for this task:

- Toolbar buttons are icon-only, so `Button`'s `aria-label` is the segment's `label` and there is no visible text (`packages/fresco-ui/src/SegmentedToolbar/SegmentedToolbar.tsx:196-219` `segmentButton` — `aria-label={labelVisible ? undefined : content.label}`, and every NetworkComposer segment has an icon per `packages/interview/src/interfaces/NetworkComposer/ToolPalette.tsx:122-218`). Segment labels: `Select`, `Add node`, `Draw edge`, `Groups`, `Automatic layout`, `Undo`, `Redo` (`ToolPalette.tsx:126,136,152,173,196,205,213`).
- Add-node popover input: `aria-label="${entityLabel} name"` (`AddNodeInput.tsx:41`); it stays open after Enter so repeated names can be typed (`AddNodeInput.tsx:26-33`).
- Node buttons: `button[aria-label="<quickAdd value>"]` with boolean attributes `data-node-selected`, `data-node-linking` (`packages/fresco-ui/src/Node.tsx:294-320`, confirmed present/absent via presence of the attribute, not `"true"`/`"false"` strings — `data-node-selected={selected || undefined}`).
- Edge lines: `svg line[data-edge-id]`, with a separate invisible wider hit-line layered on top for click targeting (`packages/interview/src/canvas/EdgeLayer.tsx:51-83`) — clicking must land on the line's rendered pixel position (computed from node positions), so the fixture clicks at the midpoint between the two endpoint nodes' bounding boxes rather than trying to hit the thin/invisible SVG line directly via Playwright's element click.
- Drawer/inspector: `[data-testid="inspector-panel"]` (`Inspector.tsx:115`); "No attributes to edit" empty state and a `Delete` button always render (`Inspector.tsx:148-163`).
- Canvas root for pointer gestures: `role="application"` div (`ComposerCanvas.tsx:219-228`); drag threshold is 5px (`ComposerCanvas.tsx:42`) so every synthetic drag/lasso below moves at least 10px before treating movement as intentional.
- Root: `[data-testid="network-composer"][data-layout-mode="AUTOMATIC"|"MANUAL"]` (`NetworkComposer.tsx:556-563`).
- Groups popover options and the bottom-of-canvas "Add all to X" selection-bar buttons are plain `<button>`s with their visible label text (`GroupPicker.tsx:36-58`, `NetworkComposer.tsx:580-597`) — locate by role `button` + name.
- Concentric-circles background: `svg[aria-hidden="true"] > circle.canvas-radar__range` (`packages/interview/src/components/ConcentricCircles.tsx:24-48`); `n=0` renders no `<svg>` at all (`ConcentricCircles.tsx:18-20`).

```ts
// Added to e2e/fixtures/stage-fixture.ts

/**
 * NetworkComposer fixture: single-screen free-form network canvas.
 * Toolbar buttons are icon-only (aria-label only, no visible text) — see
 * packages/interview/src/interfaces/NetworkComposer/ToolPalette.tsx:122-218.
 */
class NetworkComposerFixture {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  get root(): Locator {
    return this.page.getByTestId('network-composer');
  }

  /** 'AUTOMATIC' | 'MANUAL' — NetworkComposer.tsx:556-563. */
  async layoutMode(): Promise<string | null> {
    return this.root.getAttribute('data-layout-mode');
  }

  get canvas(): Locator {
    return this.root.getByRole('application');
  }

  get selectToolButton(): Locator {
    return this.page.getByRole('button', { name: 'Select', exact: true });
  }

  get addNodeToolButton(): Locator {
    return this.page.getByRole('button', { name: 'Add node', exact: true });
  }

  get drawEdgeToolButton(): Locator {
    return this.page.getByRole('button', { name: 'Draw edge', exact: true });
  }

  get groupsToolButton(): Locator {
    return this.page.getByRole('button', { name: 'Groups', exact: true });
  }

  get automaticLayoutToggle(): Locator {
    return this.page.getByRole('button', {
      name: 'Automatic layout',
      exact: true,
    });
  }

  get undoButton(): Locator {
    return this.page.getByRole('button', { name: 'Undo', exact: true });
  }

  get redoButton(): Locator {
    return this.page.getByRole('button', { name: 'Redo', exact: true });
  }

  get inspectorPanel(): Locator {
    return this.page.getByTestId('inspector-panel');
  }

  get drawerDeleteButton(): Locator {
    return this.page.getByRole('button', { name: 'Delete', exact: true });
  }

  /**
   * Add a node by name via the Add-node popover. Opens the popover if not
   * already open; the popover stays open afterwards so repeated calls work
   * (AddNodeInput.tsx:26-33).
   */
  async addNode(entityLabel: string, name: string): Promise<void> {
    const pressed = await this.addNodeToolButton.getAttribute('aria-pressed');
    if (pressed !== 'true') {
      await this.addNodeToolButton.click();
    }
    const input = this.page.getByLabel(`${entityLabel} name`);
    await input.waitFor({ state: 'visible' });
    await input.fill(name);
    await input.press('Enter');
    await this.getNode(name).waitFor({ state: 'visible' });
  }

  /** Node button by its quickAdd-variable name (Node.tsx:294-320). */
  getNode(name: string): Locator {
    return this.page.getByRole('button', { name, exact: true });
  }

  async selectTool(): Promise<void> {
    await this.selectToolButton.click();
  }

  /** Tap a node in whatever tool is currently active. */
  async tapNode(name: string, modifiers?: 'Shift' | 'Meta'): Promise<void> {
    const node = this.getNode(name);
    if (modifiers) {
      await node.click({ modifiers: [modifiers] });
    } else {
      await node.click();
    }
  }

  /** Tap empty canvas background — clears selection (NetworkComposer.tsx:233-238). */
  async tapBackground(): Promise<void> {
    const box = await this.canvas.boundingBox();
    if (!box) throw new Error('Canvas not visible');
    await this.page.mouse.click(
      box.x + box.width * 0.5,
      box.y + box.height * 0.95,
    );
  }

  /**
   * Drag a node to a normalized (0..1) canvas-relative position. Uses raw
   * mouse events (not Playwright's locator.dragTo) so intermediate pointermove
   * events fire — CanvasNode's drag handler needs them to track live position.
   */
  async dragNodeTo(name: string, to: { x: number; y: number }): Promise<void> {
    const node = this.getNode(name);
    const nodeBox = await node.boundingBox();
    const canvasBox = await this.canvas.boundingBox();
    if (!nodeBox || !canvasBox) throw new Error('Node or canvas not visible');
    const startX = nodeBox.x + nodeBox.width / 2;
    const startY = nodeBox.y + nodeBox.height / 2;
    const endX = canvasBox.x + canvasBox.width * to.x;
    const endY = canvasBox.y + canvasBox.height * to.y;
    await this.page.mouse.move(startX, startY);
    await this.page.mouse.down();
    await this.page.mouse.move(startX + 15, startY + 15);
    await this.page.mouse.move(endX, endY, { steps: 10 });
    await this.page.mouse.up();
  }

  /**
   * Draw (or toggle-remove) a lasso selection over the given normalized
   * canvas-relative points by dragging from empty background. Requires the
   * Groups tool active, or the select tool with a convexHullVariable
   * configured (ComposerCanvas.tsx:140-150).
   */
  async lassoSelect(points: { x: number; y: number }[]): Promise<void> {
    const canvasBox = await this.canvas.boundingBox();
    if (!canvasBox) throw new Error('Canvas not visible');
    const abs = points.map((p) => ({
      x: canvasBox.x + canvasBox.width * p.x,
      y: canvasBox.y + canvasBox.height * p.y,
    }));
    const first = abs[0]!;
    await this.page.mouse.move(first.x, first.y);
    await this.page.mouse.down();
    for (const point of abs.slice(1)) {
      await this.page.mouse.move(point.x, point.y, { steps: 5 });
    }
    await this.page.mouse.up();
  }

  /** Open the Groups popover and pick an option by its codebook label. */
  async pickGroup(optionLabel: string): Promise<void> {
    const pressed = await this.groupsToolButton.getAttribute('aria-pressed');
    if (pressed !== 'true') {
      await this.groupsToolButton.click();
    }
    await this.page
      .getByRole('button', { name: optionLabel, exact: true })
      .click();
  }

  /** Open the Draw-edge menu and pick an edge type by its codebook label. */
  async selectEdgeType(label: string): Promise<void> {
    await this.drawEdgeToolButton.click();
    await this.page.getByRole('menuitemradio', { name: label }).click();
  }

  /**
   * Click the rendered edge line between two nodes (by their names) — the
   * line renders at the two nodes' live canvas positions
   * (EdgeLayer.tsx:104-116), so the fixture clicks at their midpoint rather
   * than targeting the (largely invisible) SVG line element directly.
   */
  async clickEdgeBetween(nameA: string, nameB: string): Promise<void> {
    const boxA = await this.getNode(nameA).boundingBox();
    const boxB = await this.getNode(nameB).boundingBox();
    if (!boxA || !boxB) throw new Error('Endpoint node(s) not visible');
    const midX = (boxA.x + boxA.width / 2 + boxB.x + boxB.width / 2) / 2;
    const midY = (boxA.y + boxA.height / 2 + boxB.y + boxB.height / 2) / 2;
    await this.page.mouse.click(midX, midY);
  }

  /** Selection-bar "Add all to X" button (2+ nodes selected — NetworkComposer.tsx:577-599). */
  getSelectionBarButton(label: string): Locator {
    return this.page.getByRole('button', { name: `Add all to ${label}` });
  }

  async toggleAutomaticLayout(): Promise<void> {
    await this.automaticLayoutToggle.click();
  }

  async undo(): Promise<void> {
    await this.undoButton.click();
  }

  async redo(): Promise<void> {
    await this.redoButton.click();
  }

  async undoViaKeyboard(): Promise<void> {
    await this.root.focus();
    await this.page.keyboard.press('ControlOrMeta+z');
  }

  async redoViaKeyboard(): Promise<void> {
    await this.root.focus();
    await this.page.keyboard.press('ControlOrMeta+Shift+z');
  }

  async deleteSelection(): Promise<void> {
    await this.root.focus();
    await this.page.keyboard.press('Delete');
  }

  /** Concentric-circles background (ConcentricCircles.tsx:24-48). */
  get backgroundCircles(): Locator {
    return this.root.locator(
      'svg[aria-hidden="true"] > circle.canvas-radar__range',
    );
  }

  /** Attribute-form field container, keyed by the codebook variable id — the
   * same `data-field-name` convention FormFixture uses (stage-fixture.ts:88-90). */
  getField(variableId: string): Locator {
    return this.inspectorPanel.locator(`[data-field-name="${variableId}"]`);
  }
}
```

Add `readonly networkComposer: NetworkComposerFixture;` to `StageFixture` and instantiate it in the constructor alongside the other fixtures (`this.networkComposer = new NetworkComposerFixture(page);`).

---

## Option inventory entry

```ts
// Appended to e2e/matrix/option-inventory.ts
NetworkComposer: [
  'type',
  'id',
  'label',
  'interviewScript',
  'skipLogic', // claimed by the shared cross-cutting suite (Task 26), not here
  'subject',
  'quickAdd',
  'layoutVariable',
  'nodeForm.present',
  'nodeForm.absent',
  'convexHullVariable.tapToggle',
  'convexHullVariable.lasso',
  'convexHullVariable.unset',
  'background.image', // dead config
  'background.concentricCircles',
  'background.skewedTowardCenter',
  'behaviours.automaticLayout',
  'behaviours.automaticLayout.absent',
  'edges[]',
  'edges[].absent',
  'edges[].multipleTypes',
  'edges[].form',
  'fields[].component',
  'fields[].component.overridesCodebook',
  'fields[].parameters',
  'fields[].label',
  'fields[].hint',
  'fields[].showValidationHints',
  'codebook.validationGatesAutosave',
  'codebook.nodeEdgeColorAndName',
  'hullVariable.categoricalOptions',
  'implicit.undoRedo',
  'implicit.deleteMultiSelect',
  'implicit.drawerDeselect',
],
```

---

## Scenario table

14 scenarios. All builds use `new SyntheticInterview(seed)` with a distinct seed per scenario (arbitrary distinct integers) and always end with `si.addInformationStage({ title: 'Complete' })` after the NetworkComposer stage so `interview.next()`/navigation-based scenarios have somewhere to go. `currentStep` always points at the NetworkComposer stage's index (1 when there is a single leading Information/none — see each row).

| id                                              | covers                                                                                                             | flags                            | protocol config                                                                                                                                                                                                                                                                                                                       | interaction                                                                                                                                                                                                                                                                                                                                                                                       | functional assertions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `subject-quickadd-grid-defaults`                | `type`,`subject`,`quickAdd`,`layoutVariable`,`behaviours.automaticLayout.absent`,`label`,`interviewScript`         | `smoke`,`visual`                 | Two node types: `Person` (subject) with `quickAdd`=name var, `layoutVariable`; `Place` (not subject). `label:'SECRET-LABEL'`, `interviewScript:'SECRET-SCRIPT'`. `currentStep:0`, no `initialNodes`.                                                                                                                                  | Add "Alice" and "Bob" via `stage.networkComposer.addNode('Person', ...)` twice in a row (popover stays open).                                                                                                                                                                                                                                                                                     | `protocol.getNetworkState` gains 2 nodes with `type===personTypeId`, `attributes[quickAddVar]` = 'Alice'/'Bob'; each lands on successive grid cells `{x:0.12,y:0.12}` then `{x:0.22,y:0.12}` (`gridPlacement.ts:6-13,37-57`) — read via `attributes[layoutVar]`; `stage.networkComposer.root` has `data-layout-mode="MANUAL"`; `getByText('SECRET-LABEL')`/`getByText('SECRET-SCRIPT')` have count 0; `stage.networkComposer.getNode('Alice')` visible, no Place node rendered (only 2 node buttons total).                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `node-drag-updates-layout-variable`             | `layoutVariable` (redundant claim, functional depth)                                                               | —                                | Same builder as above minus the two secrets; `initialNodes` not used — add one node "Carol" via popover.                                                                                                                                                                                                                              | `dragNodeTo('Carol', { x: 0.6, y: 0.6 })`.                                                                                                                                                                                                                                                                                                                                                        | `attributes[layoutVar]` on Carol's node updates to approximately `{x:0.6,y:0.6}` (assert within 0.05 — canvas rounding); node button's inline `left`/`top` style tracks the new position.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `nodeform-present-autosave-undo-deselect`       | `nodeForm.present`,`implicit.drawerDeselect`                                                                       | —                                | `Person` subject with an explicit `Age` number variable (`nt.addVariable({type:'number', name:'Age'})`), `nodeForm:{fields:[{variable: ageVar.id, component:'Number', label:'Age'}]}`. One node "Dev" added via popover.                                                                                                              | Select `Dev` (select tool tap) → `stage.networkComposer.getField(ageVar.id)` locator, fill Number input (role `spinbutton`) with `30`, then `expect.poll` the persisted network state until it reflects the write (past the 400ms autosave debounce, `Inspector.tsx:32`). Then tap canvas background.                                                                                             | `getNetworkState()` node `attributes[ageVar]===30` (number, not string — `Inspector.tsx:105-112` coerceValues) — asserted via the `expect.poll` above, not a fixed sleep. Re-select Dev, press `ControlOrMeta+z` — attribute reverts to `undefined`/absent. Background tap: `getNode('Dev')` loses `data-node-selected`, `inspectorPanel` is not visible.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `nodeform-absent-edges-absent-convexhull-unset` | `nodeForm.absent`,`edges[].absent`,`convexHullVariable.unset`                                                      | —                                | `Person` subject, no `nodeForm`, no edge types, no `convexHullVariable`. Two nodes "Eve"/"Frank" added via popover.                                                                                                                                                                                                                   | Select `Eve` → assert empty state + Delete button, click Delete. Then: assert no "Groups"/"Draw edge" toolbar buttons exist; drag from empty background (`lassoSelect` with 3 points) — no dashed polygon appears; shift-click `Frank` then... only one node left so also add a third node "Gina" first, then shift-click Frank+Gina.                                                             | `stage.networkComposer.inspectorPanel` shows text `'No attributes to edit'`; clicking Delete removes Eve from `getNetworkState().nodes` and closes the drawer. `page.getByRole('button', {name:'Draw edge'})` count 0; `page.getByRole('button', {name:'Groups'})` count 0; after the lasso attempt, `root.locator('svg polygon')` count 0; after shift-clicking Frank+Gina, `page.getByRole('button', {name: /Add all to/})` count 0.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `convexhull-tap-toggle-groups-popover`          | `convexHullVariable.tapToggle`,`hullVariable.categoricalOptions`                                                   | —                                | `Person` subject with categorical `Community` variable, options `[{value:'school',label:'School'},{value:'work',label:'Work'},{value:'family',label:'Family'}]`, `convexHullVariable: community.id`. One node "Hank".                                                                                                                 | `pickGroup('School')`, `tapNode('Hank')`, wait for attribute, then `tapNode('Hank')` again.                                                                                                                                                                                                                                                                                                       | After first tap `getNetworkState()` node `attributes[communityVar]` deep-equals `['school']` (array, per the categorical-attributes-always-arrays convention) and `root.locator('svg path')` (ConvexHullLayer) count is 1; after second tap the value is `[]` and the hull `<path>` count is 0; while the group tool is active with `School` (option index 0) selected, `groupsToolButton`'s class list contains the literal Tailwind v4 arbitrary-value class `bg-(--cat-1)` — the button adopts `GROUP_BG_CLASS[activeGroupIndex + 1]`, a literal (non-generated) string so Tailwind extracts it at build time, `packages/interview/src/interfaces/NetworkComposer/ToolPalette.tsx:64-76,111-121`; assert via `await expect(composer.groupsToolButton).toHaveClass(/bg-\(--cat-1\)/)`.                                                                                                                                                    |
| `convexhull-lasso-bulk-add`                     | `convexHullVariable.lasso`                                                                                         | —                                | Same `Community` categorical setup as above; three nodes "Ida","Jack","Kim" (Ida/Jack placed close together via two `addNode` calls, Kim far away — grid placement already spaces them enough for a lasso around the first two only).                                                                                                 | `selectTool()`; `lassoSelect` a polygon around Ida+Jack's grid cells only (e.g. `[{x:0.05,y:0.05},{x:0.3,y:0.05},{x:0.3,y:0.25},{x:0.05,y:0.25}]`); click `getSelectionBarButton('Work')`.                                                                                                                                                                                                        | During the drag, `root.locator('svg polygon')` is visible (poll mid-drag by splitting the helper call — call `page.mouse.down`/`move` directly in the scenario rather than the all-in-one `lassoSelect` helper for this one assertion, then `up`). After release, `getNode('Ida')`/`getNode('Kim')`... only Ida+Jack have `data-node-selected`; `getSelectionBarButton('School')`,`getSelectionBarButton('Work')`,`getSelectionBarButton('Family')` all visible (one per option). After clicking "Add all to Work", both Ida and Jack's `attributes[communityVar]` arrays contain `'work'`; Kim's does not; selection is retained (`data-node-selected` still present on Ida/Jack).                                                                                                                                                                                                                                                         |
| `background-custom-concentric-skew-dead-image`  | `background.concentricCircles`,`background.skewedTowardCenter`,`background.image`                                  | `visual` (see fully-coded below) | `Person` subject, `background:{concentricCircles:6, skewedTowardCenter:false, image: <installed image asset id>}`. Register the asset via `synth.addAsset({id:'bg-1', name:'bg', type:'image', source:'quadrant.png'})` and the scenario's `assets` field.                                                                            | None (pure render check) — also click `addNodeToolButton` afterward to prove the background layer doesn't intercept pointer events.                                                                                                                                                                                                                                                               | `backgroundCircles` count === 6; each circle's `r` attribute equals the linear (unskewed, `q=1`) values from `computeRadii(6,1)` — `50*(1-(1-i/6)**1)` for `i=1..6` reversed, i.e. approximately `[8.33,16.67,25,33.33,41.67,50]` (assert with a small numeric tolerance); `background.image` is dead config for this interface — `NetworkComposer.tsx:479-482` destructures only `concentricCircles`/`skewedTowardCenter` off `stage.background` and never reads `.image` (contrast `Sociogram.tsx:70-71,336-342`, which resolves `background.image` via `useAssetUrl` and renders `<img alt="Background" src={backgroundImage}>` when set) — assert the absence explicitly: `await expect(composer.root.locator('img')).toHaveCount(0)` and `await expect(composer.root.getByAltText('Background')).toHaveCount(0)`; after clicking Add-node the popover still opens (background is `pointer-events-none`, `ComposerCanvas.tsx:229-235`). |
| `background-zero-concentric-circles`            | `background.concentricCircles`                                                                                     | —                                | `Person` subject, `background:{concentricCircles:0}`.                                                                                                                                                                                                                                                                                 | None.                                                                                                                                                                                                                                                                                                                                                                                             | `root.locator('svg[aria-hidden="true"]')` count is 0 (n=0 → component returns null, `ConcentricCircles.tsx:18-20`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `automatic-layout-toggle-persistence`           | `id`,`behaviours.automaticLayout`                                                                                  | — (see fully-coded below)        | `Person` subject, `layoutVariable` explicit, `behaviours:{automaticLayout:true}`, one edge type, `initialNodes:{count:4}` + `initialEdges` via `si.addEdges(...)`, `seedNetwork:true`.                                                                                                                                                | Toggle automatic layout off; `interview.next()`; navigate back via `interview.goto(currentStep)`.                                                                                                                                                                                                                                                                                                 | See fully-coded scenario below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `edges-draw-toggle-cancel`                      | `edges[]`                                                                                                          | —                                | `Person` subject, one edge type `Friendship`. Two nodes "Leo","Mia" added via popover.                                                                                                                                                                                                                                                | `selectEdgeType('Friendship')`; `tapNode('Leo')` (arm); `tapNode('Leo')` again (cancel); `tapNode('Leo')` (re-arm); `tapNode('Mia')` (complete); `tapNode('Leo')` then `tapNode('Mia')` again (toggle-remove).                                                                                                                                                                                    | After first arm, `getNode('Leo')` has `data-node-linking`; after cancel it's gone; after Leo→Mia, `getNetworkState().edges` contains one edge `{from:leoId,to:miaId,type:friendshipId}` and `root.locator('svg line[data-edge-id]')` count is 1; after the repeat toggle, `edges` array is empty again and the line count is 0.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `edges-multiple-types-form-and-delete`          | `edges[].multipleTypes`,`edges[].form`,`codebook.nodeEdgeColorAndName`                                             | —                                | `Person` subject; two edge types `Friendship` (no form) and `Advice` (form with a `Toggle` field `Reciprocated?`, explicit boolean variable so its id is known), distinct codebook colors (builder default sequencing already gives them `edge-color-seq-1`/`-2`). Two nodes "Nia","Omar".                                            | Draw Friendship Nia→Omar; draw Advice Nia→Omar; `selectTool()`; `clickEdgeBetween('Nia','Omar')` (selects whichever edge renders on top — assert by matching the drawer title to the Advice codebook name, retry `clickEdgeBetween` if the Friendship edge was hit first, since both occupy the same coordinates); flip the `Reciprocated?` Toggle field; wait 500ms; click `drawerDeleteButton`. | `getNetworkState().edges` has 2 entries with distinct `type` ids between the same pair; `root.locator('svg line[data-edge-id]')` count is 2, and their `stroke` (read via `getAttribute('stroke')`, resolves to `var(--edge-1)`/`var(--edge-2)`) differ; once the Advice edge is selected, `inspectorPanel` is visible and titled with the Advice codebook name; after the toggle flip, the Advice edge's `attributes[reciprocatedVar]===true`; after Delete, `getNetworkState().edges` drops to 1 entry (Friendship only).                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `fields-component-full-matrix`                  | `fields[].component`,`fields[].component.overridesCodebook`,`fields[].parameters`,`fields[].label`,`fields[].hint` | `slow` (see fully-coded below)   | `Person` subject with one explicit variable per of the 12 `ComponentType`s + one field overriding its codebook component + one field with parameters + one omitting `label` (fallback to codebook name) + one with `hint`.                                                                                                            | Select one seeded node; set every field once.                                                                                                                                                                                                                                                                                                                                                     | See fully-coded scenario below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `validation-hints-and-autosave-gating`          | `fields[].showValidationHints`,`codebook.validationGatesAutosave`                                                  | —                                | `Person` subject: (a) a `Text` variable with codebook `validation:{required:true, minLength:3}` and field `showValidationHints:true`; (b) a sibling `Text` field on a second variable with the same validation but `showValidationHints` omitted; (c) a `Number` variable with codebook `validation:{minValue:10}`. One node "Priya". | Select Priya. Focus field (a)'s input, type `1` char, blur. Fill field (c) with `5`, `expect.poll` the network state to observe the invalid value is never persisted, then fill it with `12` and `expect.poll` until the persisted value updates.                                                                                                                                                 | Field (a)'s validation-hint list — a plain `<ul>` rendered by `makeValidationHints`/`UnorderedList` inside `BaseField`'s `Hint` wrapper, alongside the field's label, within its `[data-field-name]` container (`packages/fresco-ui/src/form/validation/helpers.tsx:212-218` returns `<UnorderedList>`; `UnorderedList` renders a bare `<ul>` with no role override, `packages/fresco-ui/src/typography/UnorderedList.tsx:10-14`; wired in via `BaseField.tsx:84-89`) — assert via `.getByRole('list')`, visible. Field (b)'s (`showValidationHints` omitted) `.getByRole('list')` has count 0. After `5`, `getNetworkState()` node's `attributes[numberVar]` is still `undefined` (invalid value never persisted, asserted via `expect.poll`, not a fixed sleep); after `12`, it becomes `12` (again via `expect.poll`).                                                                                                                   |
| `undo-redo-toolbar-and-keyboard`                | `implicit.undoRedo`                                                                                                | — (see fully-coded below)        | `Person` subject, `Community` categorical hull variable, one edge type. Two nodes "Quinn","Rita" pre-added via popover.                                                                                                                                                                                                               | Add a node, draw an edge, toggle a group membership, drag a node; undo x4 (toolbar buttons); redo x4 (toolbar buttons); repeat the same 4 actions and undo x4 via keyboard instead.                                                                                                                                                                                                               | See fully-coded scenario below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `multi-delete-coalesced-undo`                   | `implicit.deleteMultiSelect`                                                                                       | —                                | `Person` subject, one edge type. Three nodes "Sam","Tia","Uma" with an edge Sam↔Tia drawn.                                                                                                                                                                                                                                            | `selectTool()`; shift-click `Sam` then `Tia` (multi-select); `deleteSelection()` (Delete key); `undoViaKeyboard()` once.                                                                                                                                                                                                                                                                          | After delete, `getNetworkState().nodes` drops from 3 to 1 (Uma only) and `.edges` drops to 0 (incident edge removed with its node); after the single undo, both Sam and Tia AND the Sam↔Tia edge are all restored (one coalesced undo entry, not three) — assert `nodes.length===3` and `edges.length===1` immediately after the one undo call, not requiring further undos.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

That's 14 scenarios. `smoke` appears exactly once (`subject-quickadd-grid-defaults`). `visual` appears twice (`subject-quickadd-grid-defaults` — the representative config — and `background-custom-concentric-skew-dead-image` — the only scenario whose sole observable effect beyond the representative one is pixels: circle geometry/skew).

---

## Fully-coded scenarios

### 1. `automatic-layout-toggle-persistence`

```ts
{
  id: 'automatic-layout-toggle-persistence',
  covers: ['id', 'behaviours.automaticLayout'],
  seedNetwork: true,
  build: () => {
    const synth = new SyntheticInterview(190);
    const nt = synth.addNodeType({ name: 'Person' });
    const quickAdd = nt.addVariable({ type: 'text', name: 'name' });
    const layoutVar = nt.addVariable({ type: 'layout', name: 'Composer Layout' });
    const friendship = synth.addEdgeType({ name: 'Friendship' });
    const stage = synth.addStage('NetworkComposer', {
      subject: { entity: 'node', type: nt.id },
      quickAdd: quickAdd.id,
      layoutVariable: layoutVar.id,
      initialNodes: { count: 4 },
      initialEdges: [
        [0, 1],
        [1, 2],
        [2, 3],
      ],
      behaviours: { automaticLayout: true },
    });
    stage.addEdgeType({ type: friendship.id });
    synth.addInformationStage({ title: 'Complete' });
    return synth;
  },
  run: async ({ page, interview, stage }) => {
    const composer = stage.networkComposer;

    // Loaded with automaticLayout:true — root reflects AUTOMATIC and the
    // toolbar toggle is pressed. Under isE2E the mock grid worker settles
    // positions synchronously (NetworkComposer.tsx:193, useAutoLayout.ts:249),
    // so no polling for simulation convergence is needed.
    await expect(composer.root).toHaveAttribute('data-layout-mode', 'AUTOMATIC');
    await expect(composer.automaticLayoutToggle).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // Toggle off — this writes updateStageMetadata (NetworkComposer.tsx:377-387),
    // which from now on wins over the stage's `behaviours.automaticLayout`
    // default (NetworkComposer.tsx:75-79).
    await composer.toggleAutomaticLayout();
    await expect(composer.root).toHaveAttribute('data-layout-mode', 'MANUAL');
    await expect(composer.automaticLayoutToggle).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    // Navigate away and back — metadata persistence must survive remount.
    const currentStep = await page.evaluate(
      () => window.__interviewStore?.getState().session.currentStep,
    );
    await interview.next();
    await interview.goto(currentStep as number);

    const composerAfterReturn = stage.networkComposer;
    await expect(composerAfterReturn.root).toHaveAttribute(
      'data-layout-mode',
      'MANUAL',
    );
    await expect(composerAfterReturn.automaticLayoutToggle).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  },
},
```

### 2. `fields-component-full-matrix`

```ts
{
  id: 'fields-component-full-matrix',
  covers: [
    'fields[].component',
    'fields[].component.overridesCodebook',
    'fields[].parameters',
    'fields[].label',
    'fields[].hint',
  ],
  slow: true,
  seedNetwork: true,
  build: () => {
    const synth = new SyntheticInterview(191);
    const nt = synth.addNodeType({ name: 'Person' });
    const quickAdd = nt.addVariable({ type: 'text', name: 'name' });
    const layoutVar = nt.addVariable({ type: 'layout', name: 'Composer Layout' });

    const fullNameVar = nt.addVariable({ type: 'text', name: 'Full name' });
    const bioVar = nt.addVariable({ type: 'text', name: 'Bio' });
    const ageVar = nt.addVariable({ type: 'number', name: 'Age' });
    const closenessVar = nt.addVariable({
      type: 'ordinal',
      name: 'Closeness',
      options: [
        { value: 1, label: 'Not close' },
        { value: 2, label: 'Somewhat close' },
        { value: 3, label: 'Very close' },
      ],
    });
    const keepInTouchVar = nt.addVariable({
      type: 'categorical',
      name: 'How do you keep in touch?',
      options: [
        { value: 'call', label: 'Phone call' },
        { value: 'text', label: 'Text message' },
        { value: 'inperson', label: 'In person' },
      ],
    });
    const livesTogetherVar = nt.addVariable({
      type: 'boolean',
      name: 'Lives together?',
    });
    const seenRecentlyVar = nt.addVariable({
      type: 'boolean',
      name: 'Seen in the last month?',
    });
    const communityVar = nt.addVariable({
      type: 'categorical',
      name: 'Community',
      options: [
        { value: 'school', label: 'School' },
        { value: 'work', label: 'Work' },
      ],
    });
    const closenessScoreVar = nt.addVariable({
      type: 'scalar',
      name: 'Closeness score',
    });
    const talkFrequencyVar = nt.addVariable({
      type: 'ordinal',
      name: 'How often do you talk?',
      options: [
        { value: 1, label: 'Rarely' },
        { value: 2, label: 'Sometimes' },
        { value: 3, label: 'Often' },
      ],
    });
    const metDateVar = nt.addVariable({ type: 'datetime', name: 'Date met' });
    const lastContactVar = nt.addVariable({
      type: 'datetime',
      name: 'Last contact',
    });
    // Declared as Text in the codebook, but the stage field below overrides it
    // to render as TextArea (selectors/forms.ts:105-110 — stage field wins).
    const occupationVar = nt.addVariable({ type: 'text', name: 'Occupation' });

    const stage = synth.addStage('NetworkComposer', {
      subject: { entity: 'node', type: nt.id },
      quickAdd: quickAdd.id,
      layoutVariable: layoutVar.id,
      initialNodes: { count: 1 },
    });

    stage.addNodeFormField({
      variable: fullNameVar.id,
      component: 'Text',
      label: 'How old?', // deliberately mismatched label vs. variable name,
      // to prove the stage's `label` wins over the codebook name.
    });
    stage.addNodeFormField({ variable: bioVar.id, component: 'TextArea' });
    stage.addNodeFormField({
      variable: ageVar.id,
      component: 'Number',
      hint: 'In whole years',
    });
    stage.addNodeFormField({ variable: closenessVar.id, component: 'RadioGroup' });
    stage.addNodeFormField({
      variable: keepInTouchVar.id,
      component: 'CheckboxGroup',
    });
    stage.addNodeFormField({
      variable: livesTogetherVar.id,
      component: 'Boolean',
    });
    stage.addNodeFormField({ variable: seenRecentlyVar.id, component: 'Toggle' });
    stage.addNodeFormField({
      variable: communityVar.id,
      component: 'ToggleButtonGroup',
    });
    stage.addNodeFormField({
      variable: closenessScoreVar.id,
      component: 'VisualAnalogScale',
      parameters: { minLabel: 'Not at all', maxLabel: 'Completely' },
    });
    stage.addNodeFormField({
      variable: talkFrequencyVar.id,
      component: 'LikertScale',
    });
    stage.addNodeFormField({ variable: metDateVar.id, component: 'DatePicker' });
    stage.addNodeFormField({
      variable: lastContactVar.id,
      component: 'RelativeDatePicker',
      parameters: { before: 30, after: 0 },
    });
    // omitted `label` — falls back to the codebook variable's own name.
    stage.addNodeFormField({
      variable: occupationVar.id,
      component: 'TextArea',
    });

    synth.addInformationStage({ title: 'Complete' });
    return synth;
  },
  run: async ({ page, stage, protocol, interview }) => {
    const composer = stage.networkComposer;
    const seededState = await protocol.getNetworkState(interview.interviewId);
    const seededNode = seededState?.nodes[0];
    const nodeName = seededNode?.[entityAttributesProperty][quickAdd.id];
    if (typeof nodeName !== 'string') {
      throw new Error('Seeded node is missing its quickAdd name attribute');
    }
    await composer.getNode(nodeName).click();

    // Label fallback + custom label.
    await expect(composer.getField(fullNameVar.id)).toContainText('How old?');
    await expect(composer.getField(occupationVar.id)).toContainText(
      'Occupation',
    );
    // Hint text.
    await expect(composer.getField(ageVar.id)).toContainText(
      'In whole years',
    );

    await composer.getField(fullNameVar.id).getByRole('textbox').fill('Alex');
    await composer
      .getField(bioVar.id)
      .getByRole('textbox')
      .fill('Met at university');
    await composer.getField(ageVar.id).getByRole('spinbutton').fill('34');
    await composer
      .getField(closenessVar.id)
      .getByRole('radio', { name: 'Very close' })
      .click();
    await composer
      .getField(keepInTouchVar.id)
      .getByRole('checkbox', { name: 'Text message' })
      .click();
    await composer
      .getField(livesTogetherVar.id)
      .getByRole('checkbox')
      .click();
    await composer.getField(seenRecentlyVar.id).getByRole('switch').click();
    await composer
      .getField(communityVar.id)
      .getByRole('checkbox', { name: 'Work' })
      .click();
    // VAS: focus the slider and use arrow keys to move off its default.
    await composer.getField(closenessScoreVar.id).getByRole('slider').focus();
    await page.keyboard.press('ArrowRight');
    await expect(
      composer.getField(closenessScoreVar.id).getByText('Not at all'),
    ).toBeVisible();
    await expect(
      composer.getField(closenessScoreVar.id).getByText('Completely'),
    ).toBeVisible();
    await composer
      .getField(talkFrequencyVar.id)
      .getByRole('slider')
      .focus();
    await page.keyboard.press('Home');
    await composer
      .getField(metDateVar.id)
      .locator('input[type="date"]')
      .fill('2020-05-01');
    // RelativeDatePicker renders a numeric offset input per its parameters;
    // set it to a value within the configured before/after window.
    await composer
      .getField(lastContactVar.id)
      .getByRole('spinbutton')
      .fill('10');
    await composer.getField(occupationVar.id).getByRole('textbox').fill('Teacher');

    // Codebook Text → stage TextArea override renders a <textarea>, not <input>.
    await expect(
      composer.getField(occupationVar.id).locator('textarea'),
    ).toBeVisible();

    // expect.poll past the 400ms autosave debounce (Inspector.tsx:32) instead
    // of a fixed sleep — poll until the last-written field (Teacher) lands.
    await expect
      .poll(async () => {
        const s = await protocol.getNetworkState(interview.interviewId);
        return s?.nodes[0]?.[entityAttributesProperty][occupationVar.id];
      })
      .toBe('Teacher');

    const state = await protocol.getNetworkState(interview.interviewId);
    const attrs = state?.nodes[0]?.[entityAttributesProperty];
    expect(attrs?.[fullNameVar.id]).toBe('Alex');
    expect(attrs?.[bioVar.id]).toBe('Met at university');
    expect(attrs?.[ageVar.id]).toBe(34); // coerced to number
    expect(attrs?.[closenessVar.id]).toBe(3);
    expect(attrs?.[keepInTouchVar.id]).toEqual(['text']); // array
    expect(attrs?.[livesTogetherVar.id]).toBe(true);
    expect(attrs?.[seenRecentlyVar.id]).toBe(true);
    expect(attrs?.[communityVar.id]).toEqual(['work']);
    expect(typeof attrs?.[closenessScoreVar.id]).toBe('number');
    expect(typeof attrs?.[talkFrequencyVar.id]).toBe('number');
    expect(attrs?.[metDateVar.id]).toBe('2020-05-01');
    expect(typeof attrs?.[lastContactVar.id]).toBe('string'); // resolved date string
    expect(attrs?.[occupationVar.id]).toBe('Teacher');
  },
},
```

`entityAttributesProperty` (imported from `@codaco/shared-consts`, value `'attributes'`) keys every `NcNode`'s attribute record (`packages/shared-consts/src/network.ts:29-36`); `SessionPayload`/`getNetworkState`'s network shape is the same `NcNetwork` (`packages/interview/src/contract/types.ts:43` — `SessionPayload = SessionState`, whose `network` field is the `NcNetwork` the reducer/`getNetworkState` return), so `node[entityAttributesProperty][variableId]` is the real (non-cast) accessor, matching the convention already used elsewhere in this suite (see `plan-09-NameGeneratorRoster.md`, `plan-18-Sociogram.md`).

### 3. `undo-redo-toolbar-and-keyboard`

```ts
{
  id: 'undo-redo-toolbar-and-keyboard',
  covers: ['implicit.undoRedo'],
  build: () => {
    const synth = new SyntheticInterview(192);
    const nt = synth.addNodeType({ name: 'Person' });
    const quickAdd = nt.addVariable({ type: 'text', name: 'name' });
    const layoutVar = nt.addVariable({ type: 'layout', name: 'Composer Layout' });
    const community = nt.addVariable({
      type: 'categorical',
      name: 'Community',
      options: [
        { value: 'school', label: 'School' },
        { value: 'work', label: 'Work' },
      ],
    });
    const friendship = synth.addEdgeType({ name: 'Friendship' });
    const stage = synth.addStage('NetworkComposer', {
      subject: { entity: 'node', type: nt.id },
      quickAdd: quickAdd.id,
      layoutVariable: layoutVar.id,
      convexHullVariable: community.id,
    });
    stage.addEdgeType({ type: friendship.id });
    synth.addInformationStage({ title: 'Complete' });
    return synth;
  },
  run: async ({ page, stage, protocol, interview }) => {
    const composer = stage.networkComposer;

    // Seed two nodes to act on (outside the undo stack under test).
    await composer.addNode('Person', 'Quinn');
    await composer.addNode('Person', 'Rita');

    const countNodes = async () =>
      (await protocol.getNetworkState(interview.interviewId))?.nodes.length ?? 0;
    const countEdges = async () =>
      (await protocol.getNetworkState(interview.interviewId))?.edges.length ?? 0;
    const baselineNodes = await countNodes();

    // 1) Add a node.
    await composer.addNode('Person', 'Sam');
    await expect.poll(countNodes).toBe(baselineNodes + 1);

    // 2) Draw an edge Quinn->Rita.
    await composer.selectEdgeType('Friendship');
    await composer.tapNode('Quinn');
    await composer.tapNode('Rita');
    await expect.poll(countEdges).toBe(1);

    // 3) Toggle a group membership on Quinn.
    await composer.pickGroup('School');
    await composer.tapNode('Quinn');
    await expect
      .poll(async () => {
        const s = await protocol.getNetworkState(interview.interviewId);
        const quinn = s?.nodes.find(
          (n) => n[entityAttributesProperty][quickAdd.id] === 'Quinn',
        );
        return quinn?.[entityAttributesProperty]?.[community.id];
      })
      .toEqual(['school']);

    // 4) Move a node.
    await composer.selectTool();
    await composer.dragNodeTo('Sam', { x: 0.7, y: 0.7 });

    // Undo x4 via toolbar, LIFO: move restored, group cleared, edge removed,
    // node removed.
    await composer.undo();
    await composer.undo();
    await expect.poll(countEdges).toBe(0);
    await composer.undo();
    await expect.poll(countNodes).toBe(baselineNodes);
    await expect(composer.undoButton).toBeDisabled();

    // Redo x4 via toolbar replays them back.
    await composer.redo();
    await composer.redo();
    await composer.redo();
    await composer.redo();
    await expect.poll(countNodes).toBe(baselineNodes + 1);
    await expect.poll(countEdges).toBe(1);
    await expect(composer.redoButton).toBeDisabled();

    // Undo the same stack via keyboard instead, confirming parity.
    await composer.undoViaKeyboard();
    await composer.undoViaKeyboard();
    await composer.undoViaKeyboard();
    await composer.undoViaKeyboard();
    await expect.poll(countNodes).toBe(baselineNodes);
    await expect(composer.undoButton).toBeDisabled();
  },
},
```

### 4. `background-custom-concentric-skew-dead-image`

```ts
{
  id: 'background-custom-concentric-skew-dead-image',
  covers: [
    'background.concentricCircles',
    'background.skewedTowardCenter',
    'background.image',
  ],
  visual: true,
  assets: [
    {
      assetId: 'bg-1',
      name: 'bg',
      type: 'image',
      source: 'quadrant.png',
      localPath: path.resolve(
        import.meta.dirname,
        '../../../development-protocol/assets/quadrant.png',
      ),
    },
  ],
  build: () => {
    const synth = new SyntheticInterview(193);
    const nt = synth.addNodeType({ name: 'Person' });
    const quickAdd = nt.addVariable({ type: 'text', name: 'name' });
    const layoutVar = nt.addVariable({ type: 'layout', name: 'Composer Layout' });
    synth.addAsset({
      id: 'bg-1',
      name: 'bg',
      type: 'image',
      source: 'quadrant.png',
    });
    synth.addStage('NetworkComposer', {
      subject: { entity: 'node', type: nt.id },
      quickAdd: quickAdd.id,
      layoutVariable: layoutVar.id,
      background: {
        concentricCircles: 6,
        skewedTowardCenter: false,
        image: 'bg-1',
      },
    });
    synth.addInformationStage({ title: 'Complete' });
    return synth;
  },
  run: async ({ stage }) => {
    const composer = stage.networkComposer;

    // 6 unskewed (q=1) rings — computeRadii(6, 1) = 50*(1-(1-i/6)**1)
    // reversed, i=1..6 (ConcentricCircles.tsx:4-7,22).
    const expectedRadii = [1, 2, 3, 4, 5, 6]
      .map((i) => 50 * (1 - (1 - i / 6) ** 1))
      .reverse();
    await expect(composer.backgroundCircles).toHaveCount(6);
    const radii = await composer.backgroundCircles.evaluateAll((circles) =>
      circles.map((c) => Number(c.getAttribute('r'))),
    );
    radii.forEach((r, i) => {
      expect(r).toBeCloseTo(expectedRadii[i]!, 1);
    });

    // background.image is dead config for NetworkComposer: NetworkComposer.tsx:479-482
    // destructures only concentricCircles/skewedTowardCenter off stage.background
    // and never reads `.image` — contrast Sociogram.tsx:70-71,336-342, which
    // resolves background.image via useAssetUrl and renders an <img alt="Background">
    // when set. Assert its absence explicitly rather than merely not checking for it.
    await expect(composer.root.locator('img')).toHaveCount(0);
    await expect(composer.root.getByAltText('Background')).toHaveCount(0);

    // The background layer must not intercept pointer events — the add-node
    // popover still opens on top of it (ComposerCanvas.tsx:229-235, pointer-events-none).
    await composer.addNodeToolButton.click();
    await expect(composer.addNodeToolButton).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  },
},
```

---

- [ ] **Step 1: Write the stage-fixture helpers** — add `NetworkComposerFixture` and wire `StageFixture.networkComposer` per the code above.
- [ ] **Step 2: Write the registry + inventory entry + spec file**

```ts
// e2e/specs/matrix/network-composer.spec.ts
import { networkComposerScenarios } from '../../matrix/network-composer.scenarios.js';
import { defineScenarioTests } from '../../matrix/run-scenario.js';

defineScenarioTests(networkComposerScenarios);
```

Write `e2e/matrix/network-composer.scenarios.ts` exporting `networkComposerScenarios: InterfaceScenarios` with `interfaceType: 'NetworkComposer'` and the 14 scenarios (table + 4 fully-coded above; the remaining 10 rows expand directly into `ScenarioDefinition` objects following the same shape). The file needs `import path from 'node:path';` (used by the `background-custom-concentric-skew-dead-image` scenario's `assets` entry, matching the convention in `e2e/matrix/network-generator-roster.scenarios.ts`) and `import { entityAttributesProperty } from '@codaco/shared-consts';` (used by `fields-component-full-matrix`'s and `undo-redo-toolbar-and-keyboard`'s network-state assertions, matching the convention in `plan-09-NameGeneratorRoster.md`/`plan-18-Sociogram.md`). Append the entry to `option-inventory.ts` and register the suite in `coverage-manifest.test.ts`'s `ALL_SUITES` (and `all-scenarios.ts` if present).

Also bootstrap the cross-cutting claim this task doesn't itself cover: in `e2e/matrix/shared-claims.ts`, add `'NetworkComposer:skipLogic'` to `sharedSuiteClaims` (following Task 18's pattern of pre-registering a suite's cross-cutting keys there ahead of the shared suite that will eventually exercise them in Task 26). The `NetworkComposer` inventory entry above lists only `skipLogic` as claimed elsewhere (no `filter`/`edges[].filter` key is present in the inventory list for this interface), so no other key needs bootstrapping here.

- [ ] **Step 3: Run the coverage manifest**: `pnpm --filter @codaco/interview exec vitest run e2e/matrix` — Expected: PASS (all `NetworkComposer` inventory keys claimed; `skipLogic` is satisfied by this task's `sharedSuiteClaims` bootstrap above — Task 26's shared cross-cutting suite will later add the real test coverage for `NetworkComposer:skipLogic`, but the manifest test only checks that the key is _claimed_, so bootstrapping it into `sharedSuiteClaims` now is sufficient for this step to pass).
- [ ] **Step 4: Run the scenarios**: `pnpm --filter @codaco/interview test:e2e:headed -- --project=chromium-matrix --grep "NetworkComposer"` — Expected: PASS; commit new `.aria.yml` baselines under `e2e/aria-snapshots/chromium/`.
- [ ] **Step 5: Typecheck + commit** with message `test(interview-e2e): NetworkComposer configuration matrix`

### Task 20: Narrative matrix scenarios

**Files:**

- Create: `e2e/matrix/narrative.scenarios.ts`
- Create: `e2e/specs/matrix/narrative.spec.ts`
- Modify: `e2e/matrix/option-inventory.ts` (add the `Narrative` entry — full code below)
- Modify: `e2e/matrix/coverage-manifest.test.ts` (append `narrativeScenarios` to `ALL_SUITES`) and `e2e/matrix/all-scenarios.ts` if it exists by the time this task lands (append the same import/registration)
- Modify: `e2e/fixtures/stage-fixture.ts` (replace the `NarrativeFixture` placeholder at `stage-fixture.ts:1192-1198` with the implementation below)
- Modify: `e2e/matrix/shared-claims.ts` (temporarily add `'Narrative:skipLogic'` per Step 3, if Task 26 hasn't landed yet; remove once it does)

**Interfaces:**

- Consumes: `ScenarioDefinition`/`InterfaceScenarios`/`defineScenarioTests` (Task 6), `SyntheticInterview` builder incl. `addStage('Narrative', …)`/`.addPreset(...)`/`setNodeAttribute`/`addManualNode`/`addEdges` (Task 1 + existing protocol-utilities API), seeded interviews via `installScenario`/`currentStep` (Task 3/6). Consumes the new `StageFixture.narrative: NarrativeFixture` sub-fixture (implemented by this task, no other task depends on it).
- Produces: `narrativeScenarios: InterfaceScenarios` (`interfaceType: 'Narrative'`); `StageFixture.narrative` with the concrete API below (no other landed task currently consumes it, but it establishes the pattern for any future Narrative-adjacent work).

## Stage fixture helpers

Replace the whole `NarrativeFixture` placeholder class (`e2e/fixtures/stage-fixture.ts:1192-1198`) with:

```ts
/**
 * Narrative fixture — read-only network visualization stage.
 *
 * Nodes are buttons whose aria-label starts with the node's name (fresco-ui
 * Node.tsx:303 `aria-label={ariaLabel ?? label}`, mirrored by CanvasNode.tsx
 * for the shared Canvas (renders the same fresco-ui `Node`, CanvasNode.tsx:89-96).
 * Edges are `<line data-edge-id>` (EdgeLayer.tsx:43-49).
 * Convex hulls are `<polygon fill="var(--cat-N)">` (ConvexHullLayer.tsx:136-144).
 * The preset toolbar and behaviours toolbar are fresco-ui SegmentedToolbar
 * instances — segments are real `<button>`s named by their `label`
 * (PresetSwitcher.tsx:208-232, BehavioursPanel.tsx:42-83). The preset toolbar's drag
 * handle is a real `<button aria-label="Drag to reposition">` that also
 * supports arrow-key nudging (8px/press) — prefer that over pointer-drag
 * simulation (fresco-ui SegmentedToolbar.tsx:523-565, NUDGE_STEP=8 at :480).
 */
class NarrativeFixture {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /** [data-testid="narrative"] (Narrative.tsx:303-304). */
  root(): Locator {
    return this.page.getByTestId('narrative');
  }

  /**
   * Wait for the (mocked, identity-echo under e2e) auto-layout simulation to
   * settle. Only meaningful when behaviours.automaticLayout is true.
   */
  async waitForSimulationSettled(): Promise<void> {
    await expect(this.root()).toHaveAttribute(
      'data-simulation-running',
      'false',
      { timeout: 15000 },
    );
  }

  /** A canvas node button, matched by its name prefix (Node.tsx:303). */
  getNode(label: string): Locator {
    return this.page.getByRole('button', { name: new RegExp(`^${label}`) });
  }

  async isNodeHighlighted(label: string): Promise<boolean> {
    const attr = await this.getNode(label).getAttribute(
      'data-node-highlighted',
    );
    return attr === 'true';
  }

  /** svg line[data-edge-id] count (EdgeLayer.tsx:41-49). */
  getEdgeLines(): Locator {
    return this.page.locator('svg line[data-edge-id]');
  }

  async getEdgeCount(): Promise<number> {
    return this.getEdgeLines().count();
  }

  /** svg polygon rendered by ConvexHullLayer (one per group value, :136-144). */
  getHullPolygons(): Locator {
    return this.page.locator('svg polygon[fill^="var(--cat-"]');
  }

  /** circle.canvas-radar__range rendered by ConcentricCircles.tsx:24-34. */
  getBackgroundCircles(): Locator {
    return this.page.locator('circle.canvas-radar__range');
  }

  /** Preset toolbar centre button — also the legend Popover trigger (PresetSwitcher.tsx:218-222). */
  getPresetLabelButton(label: string | RegExp): Locator {
    return this.page.getByRole('button', { name: label });
  }

  async goToNextPreset(): Promise<void> {
    await this.page.getByRole('button', { name: 'Next preset' }).click();
  }

  async goToPreviousPreset(): Promise<void> {
    await this.page.getByRole('button', { name: 'Previous preset' }).click();
  }

  isNextPresetDisabled(): Promise<boolean> {
    return this.page.getByRole('button', { name: 'Next preset' }).isDisabled();
  }

  isPreviousPresetDisabled(): Promise<boolean> {
    return this.page
      .getByRole('button', { name: 'Previous preset' })
      .isDisabled();
  }

  /** Legend accordion trigger — 'Attributes' | 'Links' | 'Groups' (PresetSwitcher.tsx:257-329). */
  getAccordionTrigger(section: 'Attributes' | 'Links' | 'Groups'): Locator {
    return this.page.getByRole('button', { name: section });
  }

  async toggleAccordionSection(
    section: 'Attributes' | 'Links' | 'Groups',
  ): Promise<void> {
    await this.getAccordionTrigger(section).click();
  }

  /** Highlight radio items inside the open 'Attributes' section. */
  getHighlightRadio(variableLabel: string): Locator {
    return this.page.getByRole('radio', { name: variableLabel });
  }

  async selectHighlightRadio(variableLabel: string): Promise<void> {
    await this.getHighlightRadio(variableLabel).click();
  }

  /** Nudge the preset toolbar's drag handle N times in a direction (8px/press). */
  async nudgeToolbar(
    direction: 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown',
    times: number,
  ): Promise<void> {
    const handle = this.page.getByRole('button', {
      name: 'Drag to reposition',
    });
    await handle.focus();
    await this.page.keyboard.press(direction, { delay: 10 });
    for (let i = 1; i < times; i++) {
      await this.page.keyboard.press(direction, { delay: 10 });
    }
  }

  // --- Behaviours panel (BehavioursPanel.tsx) ---

  async toggleAutomaticLayout(): Promise<void> {
    await this.page
      .getByRole('button', {
        name: /Pause automatic layout|Resume automatic layout/,
      })
      .click();
  }

  isAutomaticLayoutPaused(): Promise<boolean> {
    return this.page
      .getByRole('button', { name: 'Resume automatic layout' })
      .isVisible();
  }

  async toggleDrawing(): Promise<void> {
    await this.page
      .getByRole('button', { name: /Enable drawing|Disable drawing/ })
      .click();
  }

  async toggleFreeze(): Promise<void> {
    await this.page
      .getByRole('button', { name: /Freeze annotations|Unfreeze annotations/ })
      .click();
  }

  async resetAnnotations(): Promise<void> {
    await this.page.getByRole('button', { name: 'Reset annotations' }).click();
  }

  /** svg path elements drawn by Annotations.tsx:29-48 (stroke="white"). */
  getAnnotationPaths(): Locator {
    return this.page.locator('svg path[stroke="white"]');
  }

  /**
   * Draw a stroke across the canvas as a sequence of relative (0..1) points,
   * mapped onto the narrative root's bounding box, dispatched as a real
   * pointer down/move/up sequence (Annotations.tsx:73-121 pointer handlers).
   */
  async drawStroke(points: { x: number; y: number }[]): Promise<void> {
    const box = await this.root().boundingBox();
    if (!box) throw new Error('Narrative root has no bounding box');
    const abs = (p: { x: number; y: number }) => ({
      x: box.x + p.x * box.width,
      y: box.y + p.y * box.height,
    });
    const first = abs(points[0]!);
    await this.page.mouse.move(first.x, first.y);
    await this.page.mouse.down();
    for (const p of points.slice(1)) {
      const a = abs(p);
      await this.page.mouse.move(a.x, a.y, { steps: 4 });
    }
    await this.page.mouse.up();
  }

  /**
   * Drag a canvas node by a pixel delta (requires
   * behaviours.allowRepositioning: true — CanvasNode.tsx:77 passes
   * `disabled: disabled || !allowRepositioning` into `useCanvasDrag`, whose
   * `onPointerDown` bails out on `disabled` at useCanvasDrag.ts:76).
   */
  async dragNodeBy(label: string, dx: number, dy: number): Promise<void> {
    const node = this.getNode(label);
    const box = await node.boundingBox();
    if (!box) throw new Error(`Node "${label}" has no bounding box`);
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    await this.page.mouse.move(startX, startY);
    await this.page.mouse.down();
    await this.page.mouse.move(startX + dx / 2, startY + dy / 2, {
      steps: 3,
    });
    await this.page.mouse.move(startX + dx, startY + dy, { steps: 3 });
    await this.page.mouse.up();
  }
}
```

Register it exactly as the placeholder already does (`this.narrative = new NarrativeFixture(page);` in `StageFixture`'s constructor — unchanged, only the class body above changes).

## Option inventory entry

```ts
// e2e/matrix/option-inventory.ts — add this entry to OPTION_INVENTORY
Narrative: [
  'label',
  'interviewScript',
  'subject',
  'presets',
  'presets[].id',
  'presets[].label',
  'presets[].layoutVariable',
  'presets[].groupVariable',
  'presets[].edges',
  'presets[].edges.display',
  'presets[].highlight',
  'background',
  'background.concentricCircles',
  'background.skewedTowardCenter',
  'behaviours',
  'behaviours.automaticLayout',
  'behaviours.allowRepositioning',
  'behaviours.freeDraw',
  'filter',
  'skipLogic',
],
```

`skipLogic` is claimed by the shared cross-cutting suite (Task 26) — do not write a Narrative scenario for it, just leave the key here per the contract.

## Scenario table

| id | covers | flags | protocol config | interaction | functional assertions |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `layout-variable-node-inclusion-and-defaults` | `presets`, `presets[].label`, `presets[].layoutVariable`, `presets[].edges` (dead/absent), `behaviours` (dead/absent), `label`, `interviewScript` | `smoke`, `visual` | 1 Narrative stage, `label: 'SECRET-LABEL-XYZ'`, `interviewScript: 'SECRET-SCRIPT-XYZ'`, no `behaviours`; 1 preset `{ label: 'Social View', layoutVariable: layoutVar.id }` (no edges/group/highlight); 4 manual nodes named Alice/Bob/Cara/Dana via `addManualNode`, layout var set to `{x:0.25,y:0.25}`/`{x:0.5,y:0.5}`/`{x:0.75,y:0.75}`/`null` (Dana) | open stage; read node button styles; click preset centre button twice | exactly 3 `stage.narrative.getNode(...)` visible (Alice/Bob/Cara), `getNode('Dana')` has count 0; each visible node's `style` has `left`/`top` matching the authored `%`; `stage.narrative.getPresetLabelButton('Social View')` visible; legend popover content visible on mount (an accordion trigger absent since no edges/group/highlight — assert `getAccordionTrigger` all 3 have count 0, proving the empty-preset dead-config case); clicking centre button closes popover (accordion region hidden), clicking again reopens; `page.getByText('SECRET-LABEL-XYZ')` and `getByText('SECRET-SCRIPT-XYZ')` count 0; no BehavioursPanel button exists (`getByRole('button',{name:/Pause automatic layout | Enable drawing/})`count 0);`getNetworkState()`before/after`run()` deep-equal |
| `multiple-presets-switch-resets-toggles` | `presets` (multiple), `presets[].id` (validation-only, documented not asserted), `presets[].edges.display`, `presets[].highlight`, `presets[].groupVariable` | — | 3 presets on 1 stage: preset0 `{label:'View A', layoutVariable:layoutVar1.id, edges:{display:[friendshipEt.id]}, highlight:[closeVar.id]}`; preset1 `{label:'View B', layoutVariable:layoutVar2.id, groupVariable: communityVar.id}`; preset2 same as preset0 layout but `label:'View C'`; 3 manual nodes with both layout vars set to distinct coords per preset, `closeVar` true/false/true, `communityVar` set on all 3 | close Links section (`toggleAccordionSection('Links')`), select highlight radio index 1 (`selectHighlightRadio(<2nd var label>)`), click Next preset, click Next preset again (now index 2 out of range guard), click Previous preset back to 0 | at index 0: `isPreviousPresetDisabled()` true; after 2x Next: `isNextPresetDisabled()` true at index 2; node `left`/`top` styles after switching to preset1 match preset1's authored coords (layoutVar2); after returning to preset0 (index 0) via 2x Previous, the 'Links' accordion trigger is present again (`accordionValue` reset — Narrative.tsx:92-110) and the first highlight radio (`highlightIndex` 0) is the one checked, not the previously-selected one; `getPresetLabelButton('View A')`/`'View B'`/`'View C'` each visible only while their preset is active |
| `edges-display-and-links-legend` | `presets[].edges.display` | — | 2 edge types Friendship/Professional; 4 manual nodes with layout set; 3 Friendship edges + 2 Professional edges via `addEdges`; 2 presets: preset0 `edges:{display:[friendshipEt.id]}`, preset1 `edges:{display:[professionalEt.id]}` | open stage; assert edge count; go to Next preset; assert edge count changed; toggle Links section closed | preset0: `getEdgeCount()` === 3; Links legend lists exactly 'Friendship' with a swatch (`page.locator('div',{hasText:'Friendship'})` inside popover — check via accordion panel text); after Next preset: `getEdgeCount()` === 2, legend now lists 'Professional' only; after `toggleAccordionSection('Links')`: `getEdgeCount()` === 0 |
| `convex-hulls-groups-multi-membership-and-extras` | `presets[].groupVariable` | `visual` | categorical `Community` {family,work}; 7 manual nodes: 3×family, 2×work, 1×`['family','work']`, 1×`'imported'` (not in codebook options — set via `setNodeAttribute` bypassing the options list), 1×`null`; all with layout set; 1 preset with `groupVariable: communityVar.id` | open stage | `getHullPolygons()` count === 3 with `visibility="visible"`; polygon fills are `var(--cat-1)` (family), `var(--cat-2)` (work), `var(--cat-3)` (imported, appended after known options); Groups legend (inside opened popover) lists 3 entries in that order incl. 'imported' last; `toggleAccordionSection('Groups')` removes `getHullPolygons()` entirely (count 0) |
| `highlight-multi-attribute-radio` | `presets[].highlight` | — | 2 boolean vars 'Close Friend' (true on nodes 0,2) and 'Trusted' (true on node 1, false/null elsewhere); 3 manual nodes Alice/Bob/Cara with layout set; 1 preset `highlight:[closeVar.id, trustedVar.id]` | open stage; select 'Trusted' radio; toggle 'Attributes' section closed | initially `isNodeHighlighted('Alice')` and `isNodeHighlighted('Cara')` true, `isNodeHighlighted('Bob')` false; after selecting 'Trusted': only `isNodeHighlighted('Bob')` true, Alice/Cara false; after closing Attributes section: all 3 false (`showHighlightedNodes=false`) |
| `allow-repositioning-readonly-invariant` (fully coded below) | `behaviours.allowRepositioning` | — | `behaviours:{allowRepositioning:true}`; 1 node 'Alice' with layout `{x:0.3,y:0.3}` | drag Alice by (+150,+100); capture `getNetworkState()` before/after | Alice's `boundingBox` moved by ~the drag delta; `getNetworkState()` node attribute for the layout var is deep-equal before/after (persist:false, Narrative.tsx:315) |
| `allow-repositioning-omitted-blocks-drag` (fully coded below) | `behaviours.allowRepositioning` | — | no `behaviours` key at all (defaults apply); 1 node 'Alice' with layout `{x:0.3,y:0.3}` | drag Alice by (+150,+100) | `boundingBox` unchanged (Narrative.tsx:151 reads `get(stage, 'behaviours.allowRepositioning', false)`, defaulting to `false` when omitted, then passes it into CanvasNode at Narrative.tsx:316; CanvasNode.tsx:77 forwards `disabled: disabled \|\| !allowRepositioning` into `useCanvasDrag`, whose `onPointerDown` bails out on `disabled` at useCanvasDrag.ts:76) |
| `automatic-layout-identity-mock-pause-resume` (fully coded below) | `behaviours.automaticLayout`, `behaviours` (dead/absent counter-case) | — | `behaviours:{automaticLayout:true}`; 6 manual nodes with distinct layout coords | `waitForSimulationSettled()`; read node positions; `toggleAutomaticLayout()` twice | `data-simulation-running` reaches `'false'`; node `left`/`top` equal authored seeds (identity mock, useAutoLayout.ts:125); behaviours button reads 'Pause automatic layout' initially, 'Resume automatic layout' after 1 click, 'Pause automatic layout' after 2nd click |
| `free-draw-annotate-fade-freeze-reset` (fully coded below) | `behaviours.freeDraw` | — | `behaviours:{freeDraw:true}`; 2 nodes with layout set | assert no annotation svg pre-enable; `toggleDrawing()`; `drawStroke([...])`; assert path; `toggleFreeze()`; `drawStroke([...])`; `resetAnnotations()` | before enabling: `getAnnotationPaths()` count 0 (no foreground layer mounted, Narrative.tsx:293-296); after stroke 1 + pointerup: 1 path exists then (after a poll) its `opacity` style animates toward `0`; after Freeze + stroke 2: that path's opacity stays `1` (`expect.poll` over a short window, never `waitForTimeout`); after Reset: `getAnnotationPaths()` count 0; `getNetworkState()` unchanged throughout |
| `concentric-circles-background-variants` | `background`, `background.concentricCircles`, `background.skewedTowardCenter` | `visual` | 3 Narrative stages in one protocol (sequential via `interview.next()`): stage0 no `background` key; stage1 `background:{concentricCircles:6, skewedTowardCenter:false}`; stage2 `background:{concentricCircles:0}`; each stage has 1 trivial preset+node so it renders | goto step 0; assert circles; `interview.next()`; assert circles; `interview.next()`; assert circles | stage0: `getBackgroundCircles()` count === 4 (component default, ConcentricCircles.tsx:14-17); stage1: count === 6, and sorted `r` attribute deltas are equal (evenly spaced, q=1); stage2: count === 0 |
| `filter-stage-level-display-scoping` | `filter` | — | 5 manual nodes with layout set and a `status` text/categorical attribute, 3 `'active'` + 2 `'inactive'`; stage `filter:{join:'AND', rules:[{type:'node', options:{type: nodeTypeId, attribute:'status', operator:'EXACTLY', value:'active'}}]}`; 1 preset | open stage | exactly 3 node buttons render on canvas; `getNetworkState()` still contains all 5 nodes (filter is display-only, session.ts:277-291) |
| `subject-codebook-lookup-and-cross-type-leak` | `subject` | — | 2 node types Person/Place; `subject:{entity:'node', type: personType.id}`; Person has layout+highlight ('Close Friend')+group ('Community') vars; a Place node is given the SAME layout-variable id (forced via `addVariableToNodeType(placeType.id, {type:'layout', id: personLayoutVar.id})`) and a value, so it is NOT the subject type but shares the attribute id | open stage; open legend popover (already open) | Attributes radio label reads 'Close Friend' (sourced from Person's codebook, PresetSwitcher.tsx via `getSubjectType`); Groups legend labels come from Person's Community options; the Place node's canvas button IS present (documents the known wiring quirk: `getNetworkNodes` is unscoped, layoutVariable presence — not `subject` — gates rendering, Narrative.tsx:33,174-180) |

## Fully-coded scenarios

```ts
// e2e/matrix/narrative.scenarios.ts
import path from 'node:path';

import { SyntheticInterview } from '@codaco/protocol-utilities';

import { expect } from '../fixtures/matrix-test.js';
import type { InterfaceScenarios, ScenarioDefinition } from './types.js';

function buildBaseNarrative() {
  const synth = new SyntheticInterview();
  const person = synth.addNodeType({ name: 'Person' });
  const nameVar = person.addVariable({ type: 'text', name: 'name' });
  const layoutVar = person.addVariable({
    type: 'layout',
    name: 'Narrative Layout',
  });
  return { synth, person, nameVar, layoutVar };
}

const allowRepositioningTrue: ScenarioDefinition = {
  id: 'allow-repositioning-readonly-invariant',
  covers: ['behaviours.allowRepositioning'],
  build: () => {
    const { synth, person, nameVar, layoutVar } = buildBaseNarrative();
    const stage = synth.addStage('Narrative', {
      subject: { entity: 'node', type: person.id },
      behaviours: { allowRepositioning: true },
    });
    stage.addPreset({ layoutVariable: layoutVar.id });
    synth.addManualNode(stage.id, person.id, 'node-alice', {
      [nameVar.id]: 'Alice',
      [layoutVar.id]: { x: 0.3, y: 0.3 },
    });
    return synth;
  },
  run: async ({ page, stage }) => {
    const before = await page.evaluate(() => window.__test.getNetworkState());
    const node = stage.narrative.getNode('Alice');
    const boxBefore = await node.boundingBox();
    if (!boxBefore) throw new Error('Alice has no bounding box');

    await stage.narrative.dragNodeBy('Alice', 150, 100);

    const boxAfter = await node.boundingBox();
    if (!boxAfter) throw new Error('Alice lost its bounding box after drag');
    expect(boxAfter.x - boxBefore.x).toBeGreaterThan(80);
    expect(boxAfter.y - boxBefore.y).toBeGreaterThan(50);

    const after = await page.evaluate(() => window.__test.getNetworkState());
    expect(after).toEqual(before);
  },
};

const allowRepositioningFalse: ScenarioDefinition = {
  id: 'allow-repositioning-omitted-blocks-drag',
  covers: ['behaviours.allowRepositioning'],
  build: () => {
    const { synth, person, nameVar, layoutVar } = buildBaseNarrative();
    const stage = synth.addStage('Narrative', {
      subject: { entity: 'node', type: person.id },
    });
    stage.addPreset({ layoutVariable: layoutVar.id });
    synth.addManualNode(stage.id, person.id, 'node-alice', {
      [nameVar.id]: 'Alice',
      [layoutVar.id]: { x: 0.3, y: 0.3 },
    });
    return synth;
  },
  run: async ({ stage }) => {
    const node = stage.narrative.getNode('Alice');
    const boxBefore = await node.boundingBox();
    if (!boxBefore) throw new Error('Alice has no bounding box');

    await stage.narrative.dragNodeBy('Alice', 150, 100);

    const boxAfter = await node.boundingBox();
    if (!boxAfter) throw new Error('Alice lost its bounding box after drag');
    expect(boxAfter.x).toBeCloseTo(boxBefore.x, 0);
    expect(boxAfter.y).toBeCloseTo(boxBefore.y, 0);
  },
};

const automaticLayoutPauseResume: ScenarioDefinition = {
  id: 'automatic-layout-identity-mock-pause-resume',
  covers: ['behaviours.automaticLayout', 'behaviours'],
  build: () => {
    const { synth, person, nameVar, layoutVar } = buildBaseNarrative();
    const stage = synth.addStage('Narrative', {
      subject: { entity: 'node', type: person.id },
      behaviours: { automaticLayout: true },
    });
    stage.addPreset({ layoutVariable: layoutVar.id });
    const coords = [
      { x: 0.2, y: 0.2 },
      { x: 0.4, y: 0.2 },
      { x: 0.6, y: 0.2 },
      { x: 0.2, y: 0.6 },
      { x: 0.4, y: 0.6 },
      { x: 0.6, y: 0.6 },
    ];
    coords.forEach((coord, i) => {
      synth.addManualNode(stage.id, person.id, `node-${i}`, {
        [nameVar.id]: `Node${i}`,
        [layoutVar.id]: coord,
      });
    });
    return synth;
  },
  run: async ({ stage }) => {
    await stage.narrative.waitForSimulationSettled();

    const node0 = stage.narrative.getNode('Node0');
    await expect(node0).toHaveCSS('left', '20%');
    await expect(node0).toHaveCSS('top', '20%');

    await expect(
      stage.narrative.root().getByRole('button', {
        name: 'Pause automatic layout',
      }),
    ).toBeVisible();

    await stage.narrative.toggleAutomaticLayout();
    await expect(
      stage.narrative.root().getByRole('button', {
        name: 'Resume automatic layout',
      }),
    ).toBeVisible();

    await stage.narrative.toggleAutomaticLayout();
    await expect(
      stage.narrative.root().getByRole('button', {
        name: 'Pause automatic layout',
      }),
    ).toBeVisible();
  },
};

const freeDrawAnnotate: ScenarioDefinition = {
  id: 'free-draw-annotate-fade-freeze-reset',
  covers: ['behaviours.freeDraw'],
  build: () => {
    const { synth, person, nameVar, layoutVar } = buildBaseNarrative();
    const stage = synth.addStage('Narrative', {
      subject: { entity: 'node', type: person.id },
      behaviours: { freeDraw: true },
    });
    stage.addPreset({ layoutVariable: layoutVar.id });
    synth.addManualNode(stage.id, person.id, 'node-alice', {
      [nameVar.id]: 'Alice',
      [layoutVar.id]: { x: 0.2, y: 0.2 },
    });
    synth.addManualNode(stage.id, person.id, 'node-bob', {
      [nameVar.id]: 'Bob',
      [layoutVar.id]: { x: 0.8, y: 0.8 },
    });
    return synth;
  },
  run: async ({ page, stage }) => {
    const before = await page.evaluate(() => window.__test.getNetworkState());

    // No annotation layer mounted until drawing is explicitly enabled.
    await expect(stage.narrative.getAnnotationPaths()).toHaveCount(0);

    await stage.narrative.toggleDrawing();
    await stage.narrative.drawStroke([
      { x: 0.1, y: 0.1 },
      { x: 0.3, y: 0.3 },
      { x: 0.5, y: 0.2 },
    ]);
    await expect(stage.narrative.getAnnotationPaths()).toHaveCount(1);

    // Unfrozen: the stroke fades toward opacity 0 after pointerup.
    await expect
      .poll(
        async () =>
          stage.narrative
            .getAnnotationPaths()
            .first()
            .evaluate((el) => Number(getComputedStyle(el).opacity)),
        { timeout: 10000 },
      )
      .toBeLessThan(1);

    await stage.narrative.toggleFreeze();
    await stage.narrative.drawStroke([
      { x: 0.6, y: 0.6 },
      { x: 0.7, y: 0.5 },
    ]);
    await expect(stage.narrative.getAnnotationPaths()).toHaveCount(2);

    const frozenOpacity = await stage.narrative
      .getAnnotationPaths()
      .nth(1)
      .evaluate((el) => Number(getComputedStyle(el).opacity));
    expect(frozenOpacity).toBe(1);

    await stage.narrative.resetAnnotations();
    await expect(stage.narrative.getAnnotationPaths()).toHaveCount(0);

    const after = await page.evaluate(() => window.__test.getNetworkState());
    expect(after).toEqual(before);
  },
};

export const narrativeScenarios: InterfaceScenarios = {
  interfaceType: 'Narrative',
  scenarios: [
    {
      id: 'layout-variable-node-inclusion-and-defaults',
      covers: [
        'presets',
        'presets[].label',
        'presets[].layoutVariable',
        'presets[].edges',
        'behaviours',
        'label',
        'interviewScript',
      ],
      smoke: true,
      visual: true,
      build: () => {
        const { synth, person, nameVar, layoutVar } = buildBaseNarrative();
        const stage = synth.addStage('Narrative', {
          subject: { entity: 'node', type: person.id },
          label: 'SECRET-LABEL-XYZ',
          interviewScript: 'SECRET-SCRIPT-XYZ',
        });
        stage.addPreset({ label: 'Social View', layoutVariable: layoutVar.id });
        synth.addManualNode(stage.id, person.id, 'node-alice', {
          [nameVar.id]: 'Alice',
          [layoutVar.id]: { x: 0.25, y: 0.25 },
        });
        synth.addManualNode(stage.id, person.id, 'node-bob', {
          [nameVar.id]: 'Bob',
          [layoutVar.id]: { x: 0.5, y: 0.5 },
        });
        synth.addManualNode(stage.id, person.id, 'node-cara', {
          [nameVar.id]: 'Cara',
          [layoutVar.id]: { x: 0.75, y: 0.75 },
        });
        synth.addManualNode(stage.id, person.id, 'node-dana', {
          [nameVar.id]: 'Dana',
          [layoutVar.id]: null,
        });
        return synth;
      },
      run: async ({ page, stage }) => {
        const before = await page.evaluate(() =>
          window.__test.getNetworkState(),
        );

        await expect(stage.narrative.getNode('Alice')).toBeVisible();
        await expect(stage.narrative.getNode('Bob')).toBeVisible();
        await expect(stage.narrative.getNode('Cara')).toBeVisible();
        await expect(stage.narrative.getNode('Dana')).toHaveCount(0);

        await expect(stage.narrative.getNode('Alice')).toHaveCSS('left', '25%');
        await expect(stage.narrative.getNode('Bob')).toHaveCSS('left', '50%');
        await expect(stage.narrative.getNode('Cara')).toHaveCSS('left', '75%');

        await expect(
          stage.narrative.getPresetLabelButton('Social View'),
        ).toBeVisible();

        // Empty preset (no edges/group/highlight): no accordion sections at all.
        await expect(
          stage.narrative.getAccordionTrigger('Attributes'),
        ).toHaveCount(0);
        await expect(stage.narrative.getAccordionTrigger('Links')).toHaveCount(
          0,
        );
        await expect(stage.narrative.getAccordionTrigger('Groups')).toHaveCount(
          0,
        );

        // No behaviours configured: BehavioursPanel does not render.
        await expect(
          page.getByRole('button', {
            name: /Pause automatic layout|Enable drawing/,
          }),
        ).toHaveCount(0);

        await expect(page.getByText('SECRET-LABEL-XYZ')).toHaveCount(0);
        await expect(page.getByText('SECRET-SCRIPT-XYZ')).toHaveCount(0);

        const after = await page.evaluate(() =>
          window.__test.getNetworkState(),
        );
        expect(after).toEqual(before);
      },
    },
    allowRepositioningTrue,
    allowRepositioningFalse,
    automaticLayoutPauseResume,
    freeDrawAnnotate,
    // Remaining rows (multiple-presets-switch-resets-toggles,
    // edges-display-and-links-legend,
    // convex-hulls-groups-multi-membership-and-extras,
    // highlight-multi-attribute-radio,
    // concentric-circles-background-variants,
    // filter-stage-level-display-scoping,
    // subject-codebook-lookup-and-cross-type-leak) are implemented per the
    // scenario table above, following the exact builder/assertion shape of
    // the scenarios coded here.
  ],
};
```

- [ ] **Step 1: Write the stage-fixture helpers** — replace `NarrativeFixture` at `e2e/fixtures/stage-fixture.ts:1192-1198` with the class above (code included).
- [ ] **Step 2: Write the registry + inventory entry + spec file**
  - `e2e/matrix/narrative.scenarios.ts`: the 5 scenarios coded above plus the remaining 7 rows from the scenario table, each a full `ScenarioDefinition` built the same way (`buildBaseNarrative()` + `addManualNode`/`addEdges`/`setNodeAttribute` + assertions per its table row).
  - `e2e/matrix/option-inventory.ts`: add the `Narrative` entry (code above).
  - `e2e/matrix/coverage-manifest.test.ts`: add `import { narrativeScenarios } from './narrative.scenarios.js';` and append `narrativeScenarios` to `ALL_SUITES`.
  - `e2e/matrix/all-scenarios.ts` (if landed by another task by now): append the same import/registration.
  - `e2e/specs/matrix/narrative.spec.ts`:

    ```ts
    import { narrativeScenarios } from '../../matrix/narrative.scenarios.js';
    import { defineScenarioTests } from '../../matrix/run-scenario.js';

    defineScenarioTests(narrativeScenarios);
    ```

- [ ] **Step 3: Run the coverage manifest**: `pnpm --filter @codaco/interview exec vitest run e2e/matrix` — Expected: PASS (all inventory keys claimed, including `skipLogic` via the shared-suite claim already registered in `shared-claims.ts` by Task 26 — if Task 26 has not landed yet, temporarily add `'Narrative:skipLogic'` to `e2e/matrix/shared-claims.ts` and remove it once Task 26 lands).
- [ ] **Step 4: Run the scenarios**: `pnpm --filter @codaco/interview test:e2e:headed -- --project=chromium-matrix --grep "Narrative"` — Expected: PASS; commit new `.aria.yml` baselines under `e2e/aria-snapshots/chromium/`.
- [ ] **Step 5: Typecheck + commit** with message `test(interview-e2e): Narrative configuration matrix`

### Task 21: Geospatial matrix scenarios

**Files:**

- Create: `e2e/matrix/geospatial.scenarios.ts`
- Create: `e2e/specs/matrix/geospatial.spec.ts`
- Create: `e2e/fixtures/geospatial-data/two-tracts.geojson` (custom 2-feature GeoJSON fixture; content below)
- Modify: `e2e/matrix/option-inventory.ts` (add the `Geospatial` entry)
- Modify: `e2e/matrix/coverage-manifest.test.ts` (append `geospatialScenarios` import + `ALL_SUITES` entry)
- Modify: `e2e/matrix/all-scenarios.ts` if it exists by the time this task lands (append registry import — same pattern as the coverage-manifest append)
- Fixture: **NOT modified**. `GeospatialFixture` in `e2e/fixtures/stage-fixture.ts:670-953` already provides everything this task needs: `mapContainer`, `toolbar`, `zoomInButton`/`zoomOutButton`/`recenterButton`, `searchToggle`/`searchInput`/`searchClearButton`, `outsideSelectableAreasButton`/`outsideSelectableOverlay`/`deselectButton`, `waitForMapIdle()`, `waitForGeoJsonRendered()`, `waitForSearchFlyTo()`, `getZoomLevel()`, `zoomIn()`/`zoomOut()`/`recenter()`, `openSearch()`/`closeSearch()`/`isSearchOpen()`, `search()`/`getSuggestions()`/`selectSuggestion()`/`clearSearch()`, `selectOutsideSelectableAreas()`/`deselectOutsideArea()`/`isOutsideSelectableAreasSelected()`, `clickOnMap(x, y)`, `getNode(label)`. All are already stub-aware (branch internally on `data-geospatial-stub`).

**Interfaces:**

- Consumes: `ScenarioDefinition`/`InterfaceScenarios`/`defineScenarioTests` (Task 6), `SyntheticInterview` builder incl. `addVariableToNodeType`/`addStage('Geospatial', …)`/`GeospatialHandle.addPrompt` (existing) + `AddStageInput.skipLogic`/`.filter` (Task 1, referenced only for the inventory keys, never for a written scenario), seeded interviews via `currentStep`/`seedNetwork` (Task 3), `stage.geospatial` (existing fixture, unmodified), `protocol.getNetworkState(interviewId)` and `interview.nextButtonHasPulse()` (existing, `e2e/fixtures/protocol-fixture.ts:196-199`, `e2e/fixtures/interview-fixture.ts:172`).
- Produces: `geospatialScenarios: InterfaceScenarios` (`interfaceType: 'Geospatial'`, 14 scenarios).

**Interface-specific ground truth used below (file:line citations):**

- `data-testid="map-container"` + `data-map-idle` + `data-zoom-level` + `data-geospatial-stub` — `Geospatial.tsx:376-379`
- Stub click area `data-testid="geospatial-stub-click-area"`, `aria-label="Stubbed map (click to select test feature)"` — `Geospatial.tsx:384-391`
- `data-testid="map-error-overlay"`, heading "The map could not be displayed" — `Geospatial.tsx:397-413`; only renders `mapError && !useStub` (chromium-only path)
- `data-testid="outside-selectable-overlay"` + `data-testid="deselect-outside-area-button"` ("Deselect") — `Geospatial.tsx:416-439`
- `data-testid="map-toolbar"`, `map-zoom-in`/`map-zoom-out`/`map-recenter` with `aria-label` "Zoom In"/"Zoom Out"/"Recenter Map" — `Geospatial.tsx:465-506`
- `data-testid="outside-selectable-areas-button"` ("Outside Selectable Areas") — `Geospatial.tsx:531-539`
- `CollapsablePrompts … collapsible={false}` — `Geospatial.tsx:510`; no `prompts-toggle` chevron ever renders (`CollapsablePrompts.tsx:24-26`)
- `GeospatialOfflineIndicator`: `role="status"`, text `"You are offline — the map will not load until you reconnect."`, only active `while stage.type === 'Geospatial'` — `src/components/GeospatialOfflineIndicator.tsx:14-33`, wired in `Shell.tsx:149-151`
- `useMapbox.ts`: `PROTOCOL_TO_THEME_VAR` map + `DEFAULT_COLOR_VAR = '--node-1'` fallback for unmapped color names — `useMapbox.ts:25-56,227-231`; `isStageReady` composite readiness gates on geojson + (if `showTransit`) transit source — `useMapbox.ts:134-142`; style/token/center/zoom map init — `useMapbox.ts:186-205`
- `mapbox-mocks.ts` intercepts `/styles/v1/`, `mapbox-streets-v8.json` (TileJSON), search `suggest`/`retrieve` (single deterministic suggestion `"Sidetrack"`) — `e2e/fixtures/mapbox-mocks.ts:59-115`
- Existing prior-art spec (functional patterns to reuse, not to copy structure): `e2e/specs/silos-protocol.spec.ts:278-405`

**Builder wiring notes (verified against `packages/protocol-utilities/src/SyntheticInterview.ts` and `types.ts`):**

- `synth.addStage('Geospatial', { subject, initialNodes, mapOptions })` returns `GeospatialHandle = { id, stageEntry, addPrompt(opts?: { text?, variable? }) }` (`SyntheticInterview.ts:153-155`, `597-614`).
- The prompt's `variable` **must** be a `type: 'location'` codebook variable per schema logic validation (`protocol-validation/src/schemas/8/variables/variable.ts:273-274`; dive `schema.ts:483-495`). The builder's own default (when `addPrompt({})` is called with no `variable`) creates a `type: 'text'` variable (`SyntheticInterview.ts:1432-1437`) — **that default fails validation for Geospatial and must never be used here.** Every scenario explicitly creates the variable first: `const locationVar = person.addVariable({ type: 'location', name: 'Home Location' })`, then passes `variable: locationVar.id` to `addPrompt`.
- `addNodeType()` auto-seeds a `name` text variable (`SyntheticInterview.ts:242-247`) with a random id; re-declare it explicitly with `id: 'name'` to get a stable id for `setNodeAttribute` (`addVariableToNodeType` dedupes by name — `SyntheticInterview.ts:296-307`), then `synth.setNodeAttribute(nodeIndex, 'name', 'Node 1')` etc. so `stage.geospatial.getNode('Node 1')` (which matches `getByRole('button', { name: /^Node 1/ })`, `stage-fixture.ts:702-704`) resolves deterministically instead of a Faker name.
- `initialNodes: { count: N }` on the Geospatial `addStage` call generates N nodes of `subject.type` directly (`SyntheticInterview.ts:677-693`) — no upstream NameGenerator stage is required since Geospatial never creates nodes itself.
- Every scenario sets `seedNetwork: true` (installs `synth.getNetwork()` as the starting network) and `currentStep` pointing at the Geospatial stage's index, since Geospatial has no in-stage node-creation UI — nodes must already exist in the network when the stage mounts.
- Asset wiring: `synth.addAsset({ id, name, type, source })` for file assets / `{ id, name, type: 'apikey', value }` for the token, mirroring `assetSchema` (`protocol-validation/src/schemas/8/assets/assets.ts:1-40`) exactly — `id`/`name`/`type`/`source` (or `value` for apikey). Matching `assets: SyntheticAssetSpec[]` entries use `assetId` (not `id`) per the Task-6 contract.

**GeoJSON fixtures used:**

- `chicago.geojson` — already exists at `.storybook/static/storybook/chicago.geojson` (878 census-tract features, property `census_tra`; same file the Capture story uses, `Geospatial.capture.stories.tsx:26,39`). Used for scenarios that only need "some real-shaped geojson loads and clicking inside it selects a plausible value" — not exact-value assertions.
- `two-tracts.geojson` — **new**, small 2-feature fixture authored for this task so a click position deterministically maps to a _known_ `targetFeatureProperty` value (needed for the exact-value and click-outside-the-data assertions). Create at `e2e/fixtures/geospatial-data/two-tracts.geojson`:

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": { "tract_id": "tract-west" },
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [-180, -10],
            [-0.001, -10],
            [-0.001, 10],
            [-180, 10],
            [-180, -10]
          ]
        ]
      }
    },
    {
      "type": "Feature",
      "properties": { "tract_id": "tract-east" },
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [0.001, -10],
            [180, -10],
            [180, 10],
            [0.001, 10],
            [0.001, -10]
          ]
        ]
      }
    }
  ]
}
```

Paired with `mapOptions.center: [0, 0]`, `initialZoom: 2`, `targetFeatureProperty: 'tract_id'`: `clickOnMap(0.75, 0.5)` (right-of-center) always lands in `tract-east`'s polygon (screen x=0.5 is longitude 0 by construction of `center`); `clickOnMap(0.5, 0.05)` (near the very top of the viewport) always lands outside both polygons' `±10°` latitude band, hitting blank basemap regardless of exact zoom/aspect.

---

## Option inventory entry

```ts
// e2e/matrix/option-inventory.ts (append to OPTION_INVENTORY)
  Geospatial: [
    'id',
    'label',
    'interviewScript',
    'skipLogic', // claimed by the shared cross-cutting suite (Task 26)
    'subject',
    'filter', // claimed by the shared cross-cutting suite (Task 26)
    'mapOptions.tokenAssetId',
    'mapOptions.style',
    'mapOptions.center',
    'mapOptions.initialZoom',
    'mapOptions.dataSourceAssetId',
    'mapOptions.color',
    'mapOptions.color=default',
    'mapOptions.targetFeatureProperty',
    'mapOptions.showTransit',
    'mapOptions.showTransit=false',
    'mapOptions.allowSearch',
    'mapOptions.allowSearch=false',
    'prompts',
    'prompts[].id',
    'prompts[].text',
    'prompts[].variable',
    'outside-selectable-areas',
    'map-click-outside-features',
    'node-stepping-beforeNext',
    'selection-restore',
    'empty-stage-passthrough',
    'stub-mode-contract',
    'map-error-overlay',
    'offline-indicator',
    'analytics-events',
  ],
```

---

## Scenario table

All 14 scenarios set `slow: true` (per interface notes: Geospatial always waits on real/stub map idle + animation settle). Smoke = exactly scenario 1. Visual = scenarios 1, 2, 10 (representative config + the two configs whose only observable effect beyond assertions is pixels: exact-feature color highlight, and style/color/transit basemap).

| id                                             | covers                                                                                                                                    | flags                    | protocol config                                                                                                                                                                                                                                                                                                                     | interaction                                                                                                                                                                          | functional assertions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core-click-select-and-prompt-panel`           | `id`, `label`, `interviewScript`, `prompts`, `prompts[].text`, `prompts[].variable`, `mapOptions.allowSearch=false`, `stub-mode-contract` | `smoke`, `visual`        | 1 Person node type, 1 node ("Node 1"), 1 `location` var, `chicago.geojson`/`census_tra`, style `streets-v12`, color `ord-color-seq-1`, no `allowSearch`/`showTransit`, stage `label: 'Home location capture (internal)'`, `interviewScript: 'Ask about primary residence.'`, prompt text `'Where does this person currently live?'` | `waitForMapIdle()`; `clickOnMap(0.5, 0.5)`                                                                                                                                           | Prompt panel shows exact prompt text; `page.getByTestId('prompts-toggle')` has count 0 (non-collapsible); `label`/`interviewScript` strings absent from DOM; `stage.geospatial.searchToggle` absent; after click, `expect.poll(interview.nextButtonHasPulse).toBe(true)`; `getNetworkState` node's `[entityAttributesProperty][locationVar]` is a non-empty string; `mapContainer` `data-geospatial-stub` is `'true'` on firefox/webkit and absent on chromium                                        |
| `target-feature-property-and-outside-click`    | `mapOptions.targetFeatureProperty`, `mapOptions.dataSourceAssetId`, `map-click-outside-features`                                          | `chromiumOnly`, `visual` | 1 node, `two-tracts.geojson` asset, `targetFeatureProperty: 'tract_id'`, `center: [0,0]`, `initialZoom: 2`                                                                                                                                                                                                                          | `waitForGeoJsonRendered()`; `clickOnMap(0.75, 0.5)`; then `clickOnMap(0.5, 0.05)`                                                                                                    | First click: `getNetworkState` value `=== 'tract-east'` exactly; `__e2eMap.getSource('geojson-data')` loaded, `querySourceFeatures` length > 0. Second click (outside both polygons, distinct code path from the button): value updates to `'outside-selectable-areas'`; `outsideSelectableOverlay` visible                                                                                                                                                                                           |
| `outside-selectable-areas-button-and-deselect` | `outside-selectable-areas`                                                                                                                | —                        | 1 node, `chicago.geojson`                                                                                                                                                                                                                                                                                                           | `selectOutsideSelectableAreas()`; `deselectOutsideArea()`                                                                                                                            | After select: value `=== 'outside-selectable-areas'`, overlay visible, button disabled, `nextButtonHasPulse() === true`. After deselect: value `=== null`, overlay gone, button enabled, pulse `=== false`                                                                                                                                                                                                                                                                                            |
| `node-stepping-and-navigation-boundaries`      | `node-stepping-beforeNext`                                                                                                                | —                        | `[Information('Before'), Geospatial(3 nodes "Node 1/2/3", 1 prompt), Information('After')]`, `currentStep: 1`                                                                                                                                                                                                                       | select+`interview.next()` ×3 (leaves forward on the 3rd); `page.getByTestId('previous-button')` click ×2 with the stage-load settle-wait (`InterviewFixture` has no `back()` helper) | Node badge is `Node 1`→`Node 2`→`Node 3` across the three Nexts; 3rd Next lands on the "After" Information heading; first Back re-mounts Geospatial at `Node 1`; second Back lands on the "Before" Information heading; `getNetworkState` shows all 3 nodes with the location var set                                                                                                                                                                                                                 |
| `multi-prompt-cycling-and-node-cursor-reset`   | `prompts[].id` (+ re-confirms `prompts`)                                                                                                  | —                        | 2 nodes ("Node 1"/"Node 2"), 2 prompts (`Home Location`, `Work Location`), `chicago.geojson`                                                                                                                                                                                                                                        | complete prompt 1 for both nodes; complete prompt 2 for both nodes                                                                                                                   | Prompt panel text switches to prompt 2's text exactly when prompt 1 finishes; node cursor resets to `Node 1` on the prompt switch; final `getNetworkState`: both nodes have both variables set as non-empty strings                                                                                                                                                                                                                                                                                   |
| `selection-restore-on-back-navigation`         | `selection-restore`                                                                                                                       | —                        | 2 nodes, 1 prompt, `chicago.geojson`                                                                                                                                                                                                                                                                                                | select on Node 1; `interview.next()`; select (different point) on Node 2; `page.getByTestId('previous-button')` click + stage-load settle-wait                                       | Node 1's stored value is unchanged after the round trip; `nextButtonHasPulse() === true` immediately on arrival (no re-selection needed); chromium-only branch: `__e2eMap.getFilter('selection')` equals `['==', 'census_tra', <Node 1's stored value>]`                                                                                                                                                                                                                                              |
| `subject-filters-by-node-type`                 | `subject`                                                                                                                                 | —                        | Person + Venue node types; Geospatial `subject: { entity: 'node', type: person.id }`, `initialNodes: { count: 2 }`; 1 manual Venue node (`synth.addManualNode(geo.id, venue.id, 'venue-1', {})`)                                                                                                                                    | select both Person nodes in turn                                                                                                                                                     | Only 2 Nexts are needed to leave the stage (Venue never stepped); `getNode('Venue 1')` never renders; `getNetworkState`: both Person nodes have the location var set, the Venue node's attributes object has no key for it                                                                                                                                                                                                                                                                            |
| `empty-subject-passthrough`                    | `empty-stage-passthrough`                                                                                                                 | —                        | `[Geospatial(subject: Person, 0 Person nodes), Information('Done')]`, `currentStep: 0`                                                                                                                                                                                                                                              | single `interview.next()`                                                                                                                                                            | No node badge (`page.getByRole('button', { name: /^Node/ })` count 0) ever renders; the single Next lands directly on the "Done" Information heading (`beforeNext` returns `true` immediately, `Geospatial.tsx:329-332`)                                                                                                                                                                                                                                                                              |
| `zoom-controls-and-recenter`                   | `mapOptions.initialZoom`, `mapOptions.center`, `mapOptions.showTransit=false`                                                             | —                        | 1 node, `initialZoom: 10`, `chicago.geojson`, `showTransit` omitted                                                                                                                                                                                                                                                                 | `zoomIn()`; `zoomOut()`; `recenter()`                                                                                                                                                | `getZoomLevel()` starts at `10`; increases after zoom-in; decreases after zoom-out; equals exactly `10` again after recenter (`stage.geospatial` fixture methods already poll each direction); chromium-only branch: `__e2eMap.getLayoutProperty('transit-lines', 'visibility') === 'none'` (layer exists, hidden, idle never waited on it)                                                                                                                                                           |
| `map-style-color-token-and-transit`            | `mapOptions.tokenAssetId`, `mapOptions.style`, `mapOptions.color`, `mapOptions.showTransit` (true path)                                   | `chromiumOnly`, `visual` | `[Information('Before'), Geospatial(style: dark-v11, color: ord-color-seq-4, showTransit: true)]`, `currentStep: 0`                                                                                                                                                                                                                 | `interview.next()` concurrently raced against `page.waitForRequest` for both the style and TileJSON URLs, then `waitForMapIdle()`                                                    | Style request URL contains `dark-v11` and an `access_token=` query param (proves `tokenAssetId` resolved to a real token, the positive-only case per dive); TileJSON request for `mapbox.mapbox-streets-v8.json` observed; `__e2eMap.getLayoutProperty('transit-lines', 'visibility') === 'visible'`; `__e2eMap.getPaintProperty('selection', 'fill-color')` differs from the raw fallback constant `'rgb(226, 33, 91)'` (proves `ord-color-seq-4` → `--ord-4` was actually applied, not the default) |
| `color-unknown-name-falls-back`                | `mapOptions.color=default`                                                                                                                | `chromiumOnly`           | 1 node, `color: 'not-a-real-palette-color'`, `chicago.geojson`                                                                                                                                                                                                                                                                      | `waitForMapIdle()`                                                                                                                                                                   | `__e2eMap.getPaintProperty('selection', 'fill-color')` equals the hex the test independently computes from `getComputedStyle(document.documentElement).getPropertyValue('--node-1')` via the same canvas-conversion technique the app uses — i.e. the unmapped name resolved to `DEFAULT_COLOR_VAR` (`useMapbox.ts:228`), not an arbitrary/undefined color                                                                                                                                            |
| `search-flow-select-suggestion-and-ux`         | `mapOptions.allowSearch` (true path), `analytics-events`                                                                                  | —                        | 2 nodes, `allowSearch: true`, `chicago.geojson`                                                                                                                                                                                                                                                                                     | full text below                                                                                                                                                                      | see fully-coded scenario                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `map-error-overlay-webgl-failure`              | `map-error-overlay`                                                                                                                       | `chromiumOnly`           | `[Information('Before'), Geospatial(1 node, 1 prompt)]`, `currentStep: 0`                                                                                                                                                                                                                                                           | see fully-coded scenario                                                                                                                                                             | see fully-coded scenario                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `offline-indicator-geospatial-only`            | `offline-indicator`                                                                                                                       | —                        | `[Geospatial(1 node, 1 prompt), Information('Other stage')]`, `currentStep: 0`                                                                                                                                                                                                                                                      | `waitForMapIdle()`; `context.setOffline(true)`; `setOffline(false)`; `interview.next()`; `setOffline(true)` again                                                                    | Banner `role=status` with text `"You are offline — the map will not load until you reconnect."` appears while offline on the Geospatial stage and disappears on reconnect; on the following Information stage, going offline again produces **no** such banner                                                                                                                                                                                                                                        |

---

## Fully-coded scenarios

### 1. `target-feature-property-and-outside-click` (asset-heavy)

```ts
const CHICAGO_GEOJSON_PATH = path.resolve(
  import.meta.dirname,
  '../../.storybook/static/storybook/chicago.geojson',
);
const TWO_TRACTS_GEOJSON_PATH = path.resolve(
  import.meta.dirname,
  '../fixtures/geospatial-data/two-tracts.geojson',
);
const FAKE_TOKEN = 'pk.test-token-e2e';

function buildTargetFeaturePropertyScenario(): ScenarioDefinition {
  let variableId = '';

  return {
    id: 'target-feature-property-and-outside-click',
    covers: [
      'mapOptions.targetFeatureProperty',
      'mapOptions.dataSourceAssetId',
      'map-click-outside-features',
    ],
    chromiumOnly: true,
    visual: true,
    slow: true,
    build: () => {
      const synth = new SyntheticInterview();
      const person = synth.addNodeType({ name: 'Person' });
      const locationVar = person.addVariable({
        type: 'location',
        name: 'Location',
      });
      variableId = locationVar.id;

      synth.addAsset({
        id: 'mapbox-token',
        name: 'Mapbox Token',
        type: 'apikey',
        value: FAKE_TOKEN,
      });
      synth.addAsset({
        id: 'two-tracts',
        name: 'Two Test Tracts',
        type: 'geojson',
        source: 'two-tracts.geojson',
      });

      const geo = synth.addStage('Geospatial', {
        subject: { entity: 'node', type: person.id },
        initialNodes: { count: 1 },
        mapOptions: {
          tokenAssetId: 'mapbox-token',
          style: 'mapbox://styles/mapbox/streets-v12',
          center: [0, 0],
          initialZoom: 2,
          dataSourceAssetId: 'two-tracts',
          color: 'ord-color-seq-1',
          targetFeatureProperty: 'tract_id',
        },
      });
      geo.addPrompt({
        variable: locationVar.id,
        text: 'Select this person’s test tract.',
      });

      return synth;
    },
    assets: [
      {
        assetId: 'two-tracts',
        name: 'Two Test Tracts',
        type: 'geojson',
        source: 'two-tracts.geojson',
        localPath: TWO_TRACTS_GEOJSON_PATH,
      },
    ],
    currentStep: 0,
    seedNetwork: true,
    run: async ({ page, interview, stage, protocol }) => {
      await stage.geospatial.waitForGeoJsonRendered();

      // Right-of-center click (x=0.75) always lands in tract-east: center
      // is [0,0], so screen x=0.5 is longitude 0 regardless of container
      // aspect ratio.
      await stage.geospatial.clickOnMap(0.75, 0.5);
      await expect.poll(() => interview.nextButtonHasPulse()).toBe(true);

      const stateAfterClick = await protocol.getNetworkState(
        interview.interviewId,
      );
      const node = stateAfterClick!.nodes[0]!;
      expect(node[entityAttributesProperty][variableId]).toBe('tract-east');

      const sourceLoaded = await page.evaluate(() => {
        const map = window.__e2eMap;
        if (!map) return false;
        return (
          map.isSourceLoaded('geojson-data') &&
          map.querySourceFeatures('geojson-data').length > 0
        );
      });
      expect(sourceLoaded).toBe(true);

      // Click far north of both tracts' ±10° latitude band: distinct
      // code path from the "Outside Selectable Areas" button
      // (useMapbox.ts:485-494).
      await stage.geospatial.clickOnMap(0.5, 0.05);
      await expect(stage.geospatial.outsideSelectableOverlay).toBeVisible();

      const stateAfterOutsideClick = await protocol.getNetworkState(
        interview.interviewId,
      );
      expect(
        stateAfterOutsideClick!.nodes[0]![entityAttributesProperty][variableId],
      ).toBe('outside-selectable-areas');
    },
  };
}
```

### 2. `search-flow-select-suggestion-and-ux` (timers + dual-mode branching)

```ts
function buildSearchFlowScenario(): ScenarioDefinition {
  let variableId = '';

  return {
    id: 'search-flow-select-suggestion-and-ux',
    covers: ['mapOptions.allowSearch', 'analytics-events'],
    slow: true,
    build: () => {
      const synth = new SyntheticInterview();
      const person = synth.addNodeType({ name: 'Person' });
      const nameVar = person.addVariable({
        id: 'name',
        type: 'text',
        name: 'name',
      });
      const locationVar = person.addVariable({
        type: 'location',
        name: 'Location',
      });
      variableId = locationVar.id;

      synth.addAsset({
        id: 'mapbox-token',
        name: 'Mapbox Token',
        type: 'apikey',
        value: FAKE_TOKEN,
      });
      synth.addAsset({
        id: 'geojson-chicago',
        name: 'Chicago Tracts',
        type: 'geojson',
        source: 'chicago.geojson',
      });

      const geo = synth.addStage('Geospatial', {
        subject: { entity: 'node', type: person.id },
        initialNodes: { count: 2 },
        mapOptions: {
          tokenAssetId: 'mapbox-token',
          style: 'mapbox://styles/mapbox/streets-v12',
          center: [-87.6298, 41.8781],
          initialZoom: 11,
          dataSourceAssetId: 'geojson-chicago',
          color: 'ord-color-seq-1',
          targetFeatureProperty: 'census_tra',
          allowSearch: true,
        },
      });
      geo.addPrompt({
        variable: locationVar.id,
        text: 'Search for or select this person’s neighborhood.',
      });

      synth.setNodeAttribute(0, nameVar.id, 'Node 1');
      synth.setNodeAttribute(1, nameVar.id, 'Node 2');

      return synth;
    },
    assets: [
      {
        assetId: 'geojson-chicago',
        name: 'Chicago Tracts',
        type: 'geojson',
        source: 'chicago.geojson',
        localPath: CHICAGO_GEOJSON_PATH,
      },
    ],
    currentStep: 0,
    seedNetwork: true,
    run: async ({ page, interview, stage, protocol }) => {
      const pageErrors: Error[] = [];
      page.on('pageerror', (err) => pageErrors.push(err));

      await stage.geospatial.waitForMapIdle();
      const isStub =
        (await stage.geospatial.mapContainer.getAttribute(
          'data-geospatial-stub',
        )) === 'true';

      // --- Full flow: search, select a suggestion, verify camera moves
      // (real) or nothing moves (stub) but the location variable is
      // NEVER written by search itself. ---
      await stage.geospatial.search('Sidetrack');

      if (isStub) {
        // GeospatialStubSearch renders exactly 3 static suggestions and
        // never calls flyTo.
        await expect(stage.geospatial.getSuggestions()).toHaveCount(3);
        const zoomBefore = await stage.geospatial.getZoomLevel();
        await stage.geospatial.getSuggestions().first().click();
        expect(await stage.geospatial.getZoomLevel()).toBe(zoomBefore);
      } else {
        await expect(stage.geospatial.getSuggestions()).toHaveCount(1);
        await stage.geospatial.selectSuggestion('Sidetrack');
        await expect.poll(() => stage.geospatial.getZoomLevel()).toBe(14); // FLY_TO_ZOOM (useGeospatialSearch.ts:7)
        await stage.geospatial.recenter();
        const zoomAfterRecenter = await stage.geospatial.getZoomLevel();
        expect(zoomAfterRecenter).toBeCloseTo(11, 0);
      }

      const stateAfterSearch = await protocol.getNetworkState(
        interview.interviewId,
      );
      expect(
        stateAfterSearch!.nodes[0]![entityAttributesProperty][variableId],
      ).toBeUndefined();

      // --- UX: clear ---
      await stage.geospatial.search('Sidetrack');
      await stage.geospatial.clearSearch();
      await expect(stage.geospatial.searchInput).toHaveValue('');

      // --- UX: escape closes the panel and returns focus to the toggle ---
      await stage.geospatial.searchInput.fill('Sidetrack');
      await page.keyboard.press('Escape');
      await expect(stage.geospatial.searchInput).not.toBeVisible();
      expect(await stage.geospatial.isSearchOpen()).toBe(false);
      await expect(stage.geospatial.searchToggle).toBeFocused();

      // --- UX: node change resets the query/suggestions (resetKey) ---
      await stage.geospatial.openSearch();
      await stage.geospatial.searchInput.fill('Sidetrack');
      await stage.geospatial.clickOnMap(0.5, 0.5); // select Node 1 so Next is enabled
      await expect.poll(() => interview.nextButtonHasPulse()).toBe(true);
      await interview.next();
      expect(await stage.geospatial.isSearchOpen()).toBe(false);
      await expect(stage.geospatial.searchInput).not.toBeVisible();

      // Finish Node 2 so the stage can be left cleanly.
      await stage.geospatial.waitForMapIdle();
      await stage.geospatial.clickOnMap(0.5, 0.5);
      await expect.poll(() => interview.nextButtonHasPulse()).toBe(true);

      // track() calls during search/selection must not throw.
      expect(pageErrors).toEqual([]);
    },
  };
}
```

### 3. `map-error-overlay-webgl-failure` (new technique: force WebGL failure mid-session)

```ts
function buildMapErrorOverlayScenario(): ScenarioDefinition {
  return {
    id: 'map-error-overlay-webgl-failure',
    covers: ['map-error-overlay'],
    chromiumOnly: true,
    slow: true,
    build: () => {
      const synth = new SyntheticInterview();
      const person = synth.addNodeType({ name: 'Person' });
      const locationVar = person.addVariable({
        type: 'location',
        name: 'Location',
      });

      synth.addAsset({
        id: 'mapbox-token',
        name: 'Mapbox Token',
        type: 'apikey',
        value: FAKE_TOKEN,
      });
      synth.addAsset({
        id: 'geojson-chicago',
        name: 'Chicago Tracts',
        type: 'geojson',
        source: 'chicago.geojson',
      });

      synth.addInformationStage({ title: 'Before the map' });
      const geo = synth.addStage('Geospatial', {
        subject: { entity: 'node', type: person.id },
        initialNodes: { count: 1 },
        mapOptions: {
          tokenAssetId: 'mapbox-token',
          style: 'mapbox://styles/mapbox/streets-v12',
          center: [-87.6298, 41.8781],
          initialZoom: 10,
          dataSourceAssetId: 'geojson-chicago',
          color: 'ord-color-seq-1',
          targetFeatureProperty: 'census_tra',
        },
      });
      geo.addPrompt({
        variable: locationVar.id,
        text: 'Where does this person live?',
      });

      return synth;
    },
    assets: [
      {
        assetId: 'geojson-chicago',
        name: 'Chicago Tracts',
        type: 'geojson',
        source: 'chicago.geojson',
        localPath: CHICAGO_GEOJSON_PATH,
      },
    ],
    currentStep: 0,
    seedNetwork: true,
    run: async ({ page, interview, stage }) => {
      // installScenario() lands on the Information stage (currentStep 0),
      // so the Geospatial component hasn't mounted yet and mapboxgl.Map
      // hasn't requested a WebGL context. Patch canvas WebGL acquisition
      // to fail BEFORE navigating there, so `new mapboxgl.Map()` throws
      // synchronously inside the try/catch at useMapbox.ts:186-205.
      await page.evaluate(() => {
        const proto = HTMLCanvasElement.prototype;
        const original = proto.getContext;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (proto as any).getContext = function (
          this: HTMLCanvasElement,
          type: string,
          ...rest: unknown[]
        ) {
          if (
            type === 'webgl' ||
            type === 'webgl2' ||
            type === 'experimental-webgl'
          ) {
            return null;
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return (original as any).apply(this, [type, ...rest]);
        };
      });

      await interview.next(); // Information -> Geospatial; map construction fails

      await expect(stage.geospatial.mapContainer).toBeVisible();
      await expect(page.getByTestId('map-error-overlay')).toBeVisible();
      await expect(
        page.getByText('The map could not be displayed'),
      ).toBeVisible();

      // The stage did not crash to StageErrorBoundary and remains
      // navigable even though the map never initialised.
      await expect(interview.nextButton).toBeEnabled();
    },
  };
}
```

---

### 4. `core-click-select-and-prompt-panel` (the smoke/representative scenario, fully coded)

```ts
function buildCoreClickScenario(): ScenarioDefinition {
  let variableId = '';

  return {
    id: 'core-click-select-and-prompt-panel',
    covers: [
      'id',
      'label',
      'interviewScript',
      'prompts',
      'prompts[].text',
      'prompts[].variable',
      'mapOptions.allowSearch=false',
      'stub-mode-contract',
    ],
    smoke: true,
    visual: true,
    slow: true,
    build: () => {
      const synth = new SyntheticInterview();
      const person = synth.addNodeType({ name: 'Person' });
      const nameVar = person.addVariable({
        id: 'name',
        type: 'text',
        name: 'name',
      });
      const locationVar = person.addVariable({
        type: 'location',
        name: 'Location',
      });
      variableId = locationVar.id;

      synth.addAsset({
        id: 'mapbox-token',
        name: 'Mapbox Token',
        type: 'apikey',
        value: FAKE_TOKEN,
      });
      synth.addAsset({
        id: 'geojson-chicago',
        name: 'Chicago Tracts',
        type: 'geojson',
        source: 'chicago.geojson',
      });

      const geo = synth.addStage('Geospatial', {
        label: 'Home location capture (internal)',
        interviewScript: 'Ask about primary residence.',
        subject: { entity: 'node', type: person.id },
        initialNodes: { count: 1 },
        mapOptions: {
          tokenAssetId: 'mapbox-token',
          style: 'mapbox://styles/mapbox/streets-v12',
          center: [-87.6298, 41.8781],
          initialZoom: 11,
          dataSourceAssetId: 'geojson-chicago',
          color: 'ord-color-seq-1',
          targetFeatureProperty: 'census_tra',
        },
      });
      geo.addPrompt({
        variable: locationVar.id,
        text: 'Where does this person currently live?',
      });

      synth.setNodeAttribute(0, nameVar.id, 'Node 1');
      return synth;
    },
    assets: [
      {
        assetId: 'geojson-chicago',
        name: 'Chicago Tracts',
        type: 'geojson',
        source: 'chicago.geojson',
        localPath: CHICAGO_GEOJSON_PATH,
      },
    ],
    currentStep: 0,
    seedNetwork: true,
    run: async ({ page, interview, stage, protocol }) => {
      await stage.geospatial.waitForMapIdle();

      await expect(
        page.getByText('Where does this person currently live?'),
      ).toBeVisible();
      await expect(page.getByTestId('prompts-toggle')).toHaveCount(0);
      await expect(
        page.getByText('Home location capture (internal)'),
      ).toHaveCount(0);
      await expect(page.getByText('Ask about primary residence.')).toHaveCount(
        0,
      );
      await expect(stage.geospatial.searchToggle).toHaveCount(0);

      const isStub =
        (await stage.geospatial.mapContainer.getAttribute(
          'data-geospatial-stub',
        )) === 'true';
      const browserName = page.context().browser()?.browserType().name();
      expect(isStub).toBe(browserName !== 'chromium');

      await stage.geospatial.clickOnMap(0.5, 0.5);
      await expect.poll(() => interview.nextButtonHasPulse()).toBe(true);

      const state = await protocol.getNetworkState(interview.interviewId);
      const value = state!.nodes[0]![entityAttributesProperty][variableId];
      expect(typeof value).toBe('string');
      expect((value as string).length).toBeGreaterThan(0);
    },
  };
}
```

---

### 5. `zoom-controls-and-recenter` (zoom/recenter polling + chromium-only transit-hidden check)

```ts
function buildZoomControlsScenario(): ScenarioDefinition {
  return {
    id: 'zoom-controls-and-recenter',
    covers: [
      'mapOptions.initialZoom',
      'mapOptions.center',
      'mapOptions.showTransit=false',
    ],
    slow: true,
    build: () => {
      const synth = new SyntheticInterview();
      const person = synth.addNodeType({ name: 'Person' });
      const locationVar = person.addVariable({
        type: 'location',
        name: 'Location',
      });

      synth.addAsset({
        id: 'mapbox-token',
        name: 'Mapbox Token',
        type: 'apikey',
        value: FAKE_TOKEN,
      });
      synth.addAsset({
        id: 'geojson-chicago',
        name: 'Chicago Tracts',
        type: 'geojson',
        source: 'chicago.geojson',
      });

      const geo = synth.addStage('Geospatial', {
        subject: { entity: 'node', type: person.id },
        initialNodes: { count: 1 },
        mapOptions: {
          tokenAssetId: 'mapbox-token',
          style: 'mapbox://styles/mapbox/streets-v12',
          center: [-87.6298, 41.8781],
          initialZoom: 10,
          dataSourceAssetId: 'geojson-chicago',
          color: 'ord-color-seq-1',
          targetFeatureProperty: 'census_tra',
        },
      });
      geo.addPrompt({
        variable: locationVar.id,
        text: 'Where does this person currently live?',
      });

      return synth;
    },
    assets: [
      {
        assetId: 'geojson-chicago',
        name: 'Chicago Tracts',
        type: 'geojson',
        source: 'chicago.geojson',
        localPath: CHICAGO_GEOJSON_PATH,
      },
    ],
    currentStep: 0,
    seedNetwork: true,
    run: async ({ page, stage }) => {
      await stage.geospatial.waitForMapIdle();

      const initialZoom = await stage.geospatial.getZoomLevel();
      expect(initialZoom).toBe(10);

      // zoomIn()/zoomOut() poll data-zoom-level themselves (against the
      // level captured just before the click) and then wait for idle, so
      // no manual expect.poll is needed around them here.
      await stage.geospatial.zoomIn();
      const zoomAfterIn = await stage.geospatial.getZoomLevel();
      expect(zoomAfterIn).toBeGreaterThan(10);

      await stage.geospatial.zoomOut();
      const zoomAfterOut = await stage.geospatial.getZoomLevel();
      expect(zoomAfterOut).toBeLessThan(zoomAfterIn!);

      // recenter() flies back to { zoom: initialZoom, center } (Geospatial
      // passes handleResetMapZoom to onRecenter; useMapbox.ts:154-159) and
      // internally waits for idle, so polling to exactly 10 is safe here.
      await stage.geospatial.recenter();
      await expect.poll(() => stage.geospatial.getZoomLevel()).toBe(10);

      const isStub =
        (await stage.geospatial.mapContainer.getAttribute(
          'data-geospatial-stub',
        )) === 'true';
      if (!isStub) {
        // showTransit was omitted (falsy), so the transit-lines layer
        // exists but is hidden (useMapbox.ts:307/325/342 set
        // visibility: showTransit ? 'visible' : 'none').
        const transitVisibility = await page.evaluate(() =>
          window.__e2eMap?.getLayoutProperty('transit-lines', 'visibility'),
        );
        expect(transitVisibility).toBe('none');
      }
    },
  };
}
```

### 6. `offline-indicator-geospatial-only` (offline/online polling across stage boundaries)

```ts
function buildOfflineIndicatorScenario(): ScenarioDefinition {
  return {
    id: 'offline-indicator-geospatial-only',
    covers: ['offline-indicator'],
    slow: true,
    build: () => {
      const synth = new SyntheticInterview();
      const person = synth.addNodeType({ name: 'Person' });
      const locationVar = person.addVariable({
        type: 'location',
        name: 'Location',
      });

      synth.addAsset({
        id: 'mapbox-token',
        name: 'Mapbox Token',
        type: 'apikey',
        value: FAKE_TOKEN,
      });
      synth.addAsset({
        id: 'geojson-chicago',
        name: 'Chicago Tracts',
        type: 'geojson',
        source: 'chicago.geojson',
      });

      const geo = synth.addStage('Geospatial', {
        subject: { entity: 'node', type: person.id },
        initialNodes: { count: 1 },
        mapOptions: {
          tokenAssetId: 'mapbox-token',
          style: 'mapbox://styles/mapbox/streets-v12',
          center: [-87.6298, 41.8781],
          initialZoom: 11,
          dataSourceAssetId: 'geojson-chicago',
          color: 'ord-color-seq-1',
          targetFeatureProperty: 'census_tra',
        },
      });
      geo.addPrompt({
        variable: locationVar.id,
        text: 'Where does this person currently live?',
      });

      synth.addInformationStage({ title: 'Other stage' });

      return synth;
    },
    assets: [
      {
        assetId: 'geojson-chicago',
        name: 'Chicago Tracts',
        type: 'geojson',
        source: 'chicago.geojson',
        localPath: CHICAGO_GEOJSON_PATH,
      },
    ],
    currentStep: 0,
    seedNetwork: true,
    run: async ({ page, interview, stage }) => {
      await stage.geospatial.waitForMapIdle();

      const offlineBanner = page.getByRole('status', {
        name: 'You are offline — the map will not load until you reconnect.',
      });
      await expect(offlineBanner).not.toBeVisible();

      // GeospatialOfflineIndicator gates on `active={stage.type ===
      // 'Geospatial'}` (Shell.tsx:149-151) and its own `!isOnline` from
      // useOnline (GeospatialOfflineIndicator.tsx:11-12), so toggling the
      // browser context's connectivity is the correct signal to poll on
      // rather than any fixed wait.
      await page.context().setOffline(true);
      await expect.poll(() => offlineBanner.isVisible()).toBe(true);

      await page.context().setOffline(false);
      await expect.poll(() => offlineBanner.isVisible()).toBe(false);

      // Select the node so Next is enabled, then move to the following
      // Information stage where the indicator must never mount.
      await stage.geospatial.clickOnMap(0.5, 0.5);
      await expect.poll(() => interview.nextButtonHasPulse()).toBe(true);
      await interview.next();

      await expect(page.getByText('Other stage')).toBeVisible();

      await page.context().setOffline(true);
      // Confirm the browser actually observed the offline transition
      // (the 'offline' event driving useOnline) before asserting the
      // indicator's absence, rather than asserting immediately against
      // a context flag that may not have propagated to the page yet.
      await expect
        .poll(() => page.evaluate(() => !window.navigator.onLine))
        .toBe(true);
      await expect(offlineBanner).toHaveCount(0);

      await page.context().setOffline(false);
    },
  };
}
```

---

## Structure of the registry file (`e2e/matrix/geospatial.scenarios.ts`)

The file has this shape: module-level constants (`CHICAGO_GEOJSON_PATH`, `TWO_TRACTS_GEOJSON_PATH`, `FAKE_TOKEN`, each resolved as shown above), the six `buildXScenario()` factory functions coded in full above (`buildCoreClickScenario`, `buildTargetFeaturePropertyScenario`, `buildSearchFlowScenario`, `buildMapErrorOverlayScenario`, `buildZoomControlsScenario`, `buildOfflineIndicatorScenario`), eight more `buildXScenario()` factories for the remaining table rows (`outside-selectable-areas-button-and-deselect`, `node-stepping-and-navigation-boundaries`, `multi-prompt-cycling-and-node-cursor-reset`, `selection-restore-on-back-navigation`, `subject-filters-by-node-type`, `empty-subject-passthrough`, `map-style-color-token-and-transit`, `color-unknown-name-falls-back`) built the same way (a `SyntheticInterview` builder call using `addNodeType`/`addVariable({type:'location'})`/`addStage('Geospatial', …)`/`addPrompt`/`setNodeAttribute` per that row's "protocol config" column, and a `run()` implementing that row's "interaction" and "functional assertions" columns using only `stage.geospatial.*`, `interview.*`, and `protocol.getNetworkState()` — no new fixture methods), and a final `export const geospatialScenarios: InterfaceScenarios = { interfaceType: 'Geospatial', scenarios: [ buildCoreClickScenario(), buildTargetFeaturePropertyScenario(), buildOutsideSelectableAreasScenario(), buildNodeSteppingScenario(), buildMultiPromptScenario(), buildSelectionRestoreScenario(), buildSubjectFiltersScenario(), buildEmptySubjectScenario(), buildZoomControlsScenario(), buildMapStyleColorTransitScenario(), buildColorFallbackScenario(), buildSearchFlowScenario(), buildMapErrorOverlayScenario(), buildOfflineIndicatorScenario() ] };` listing all 14 in the table's order.

Every one of the 14 must be written as a complete `ScenarioDefinition` — the scenario table above gives the exact config/interaction/assertions for each; none require inventing locators, fixture methods, or asset shapes beyond what's cited in this document.

```ts
// e2e/specs/matrix/geospatial.spec.ts
import { geospatialScenarios } from '../../matrix/geospatial.scenarios.js';
import { defineScenarioTests } from '../../matrix/run-scenario.js';

defineScenarioTests(geospatialScenarios);
```

---

- [ ] **Step 1: Write the custom GeoJSON fixture**

Create `e2e/fixtures/geospatial-data/two-tracts.geojson` with the exact content shown above.

- [ ] **Step 2: Write the registry + inventory entry + spec file**

Write `e2e/matrix/geospatial.scenarios.ts` with all 14 scenarios fully coded (the 3 shown in full above, plus the 11 others per the scenario table — using the `buildXScenario()` factory pattern whenever `run()` needs a variable/asset id captured during `build()`). Append the `Geospatial` entry to `e2e/matrix/option-inventory.ts`. Write `e2e/specs/matrix/geospatial.spec.ts`. Append `geospatialScenarios` to `ALL_SUITES` in `e2e/matrix/coverage-manifest.test.ts` (and to `e2e/matrix/all-scenarios.ts` if it exists by this point).

- [ ] **Step 3: Run the coverage manifest**: `pnpm --filter @codaco/interview exec vitest run e2e/matrix`
      Expected: PASS (every `Geospatial:*` inventory key claimed by exactly one of the 14 scenarios' `covers`, except `skipLogic`/`filter` which the shared suite claims).

- [ ] **Step 4: Run the scenarios**: `pnpm --filter @codaco/interview test:e2e:headed -- --project=chromium-matrix --grep "Geospatial"`
      Expected: PASS; commit new `e2e/aria-snapshots/chromium/geospatial-*.aria.yml` baselines. Then run `--project=firefox-matrix --grep "Geospatial"` and `--project=webkit-matrix --grep "Geospatial"` — both should run only the `@smoke`-tagged `core-click-select-and-prompt-panel` scenario and PASS in stub mode; commit their `.aria.yml` baselines too.

- [ ] **Step 5: Typecheck + commit** with message `test(interview-e2e): Geospatial configuration matrix`

### Task 22: Anonymisation matrix scenarios

**Files:**

- Create: `e2e/matrix/anonymisation.scenarios.ts`
- Create: `e2e/specs/matrix/anonymisation.spec.ts`
- Modify: `e2e/matrix/option-inventory.ts` (add the `Anonymisation` entry — full code below)
- Modify: `e2e/matrix/coverage-manifest.test.ts` (append `import { anonymisationScenarios } from './anonymisation.scenarios.js';` and add `anonymisationScenarios` to the `ALL_SUITES` array) — if `e2e/matrix/all-scenarios.ts` exists by the time this task runs instead, append the same import/registration there
- Modify: `e2e/fixtures/stage-fixture.ts` (implement the placeholder `AnonymisationFixture` at lines 1200-1218; wire it into `StageFixture`, which already declares `readonly anonymisation: AnonymisationFixture` and constructs it at `this.anonymisation = new AnonymisationFixture(page)` — no signature change needed there)

**Interfaces:**

- Consumes: `ScenarioDefinition`/`defineScenarioTests`/`OPTION_INVENTORY` (Task 6), including its `captureMask?: (page: Page) => Locator[]` field, which both `visual: true` scenarios below populate so the Task 27 pixel-visual suite masks the continuously-animated `EncryptionBackground` before screenshotting; `AddStageInput.validation`, `SyntheticInterview.setExperiments({encryptedVariables})`, and `AddVariableInput.encrypted`/`VariableEntry.encrypted` on node text variables including the `addVariableToNodeType` dedupe-branch merge (Task 1 — see its "Builder wiring" step 8; this task does not touch `packages/protocol-utilities` at all); seeded interviews via `currentStep`/`seedNetwork` (Task 3); `interview.nextButton`/`nextButtonHasPulse()`/`next()`/`dismissIntro()`/`goto()`/`interviewId` and testid `previous-button` (existing `InterviewFixture`, `e2e/fixtures/interview-fixture.ts:168-175,205-209`); `quickAdd.addNode()`/`quickAdd.isDisabled()` (existing `QuickAddFixture`, `e2e/fixtures/stage-fixture.ts:226-268`); `protocol.getNetworkState(interviewId)` (`e2e/fixtures/protocol-fixture.ts:196-199`).
- Produces: `anonymisationScenarios: InterfaceScenarios`; the completed `AnonymisationFixture` (methods below) other tasks (e.g. Task 26 shared skipLogic suite) may reuse.

**Stage fixture helpers** — replace the placeholder at `e2e/fixtures/stage-fixture.ts:1200-1218`:

```ts
/**
 * Fixture for Anonymisation stages.
 *
 * Locators cite packages/interview/src/interfaces/Anonymisation/Anonymisation.tsx
 * and packages/interview/src/components/PassphrasePrompter.tsx.
 */
class AnonymisationFixture {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /** Passphrase field — Field name="passphrase" (Anonymisation.tsx:133). */
  passphraseField(): Locator {
    return this.page.locator('[data-field-name="passphrase"] input');
  }

  /** Confirm field — Field name="passphrase-2" (Anonymisation.tsx:143). */
  confirmField(): Locator {
    return this.page.locator('[data-field-name="passphrase-2"] input');
  }

  /** Fill both passphrase fields with the same value. */
  async fillPassphrase(value: string): Promise<void> {
    await this.passphraseField().fill(value);
    await this.confirmField().fill(value);
  }

  /** Fill the two fields with different values, to trigger the sameAs mismatch. */
  async fillMismatched(first: string, second: string): Promise<void> {
    await this.passphraseField().fill(first);
    await this.confirmField().fill(second);
  }

  /** Submit button — SubmitButton aria-label="Submit", text "Continue" (Anonymisation.tsx:151-159). */
  submitButton(): Locator {
    return this.page.getByRole('button', { name: 'Continue' });
  }

  async submit(): Promise<void> {
    await this.submitButton().click();
  }

  /** Success alert — Alert variant="success" (Anonymisation.tsx:112-117). */
  successAlert(): Locator {
    return this.page.getByText('Passphrase set successfully!');
  }

  /** Toggle the masked/plain state of the passphrase field — PasswordField.tsx:52-58. */
  async togglePasswordVisibility(): Promise<void> {
    await this.page.getByRole('button', { name: 'Show password' }).click();
  }

  /**
   * The 🔑/⚠️ PassphrasePrompter button in the vertical nav
   * (PassphrasePrompter.tsx:72-90). Only rendered when a passphrase is
   * required and not currently set/valid.
   */
  prompterButton(): Locator {
    return this.page.getByRole('button').filter({ hasText: /🔑|⚠️/ });
  }

  async openPrompter(): Promise<void> {
    await this.prompterButton().click();
    await this.page
      .getByRole('dialog', { name: 'Enter your Passphrase' })
      .waitFor({ state: 'visible' });
  }

  /** Passphrase overlay input — PassphrasePrompter.tsx:169-176 (name="passphrase"). */
  prompterPassphraseField(): Locator {
    return this.page.locator('[data-field-name="passphrase"] input');
  }

  async submitPrompterPassphrase(value: string): Promise<void> {
    await this.prompterPassphraseField().fill(value);
    await this.page.getByRole('button', { name: 'Submit passphrase' }).click();
  }
}
```

**Option inventory entry:**

```ts
// e2e/matrix/option-inventory.ts — append to OPTION_INVENTORY
Anonymisation: [
  'explanationText.title',
  'explanationText.body',
  'label',
  'interviewScript',
  'skipLogic',
  'validation.minLength',
  'validation.maxLength',
  'passphraseFields.required',
  'confirmField.sameAs',
  'beforeNext.gating',
  'beforeNext.backwardsAllowed',
  'passphrase.persistOnRevisit',
  'passwordField.showToggle',
  'experiments.encryptedVariables=true+encryptedVariable',
  'experiments.encryptedVariables=absent',
  'encryptedVariable.missingPassphrase.prompter',
  'encryptedVariable.wrongPassphrase.invalid',
],
```

(`skipLogic` is listed but claimed by Task 26's shared cross-cutting suite, not by any scenario below.)

**Scenario table**

| id                                      | covers                                                                                        | flags             | protocol config                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | interaction                                                                                                                                                                                                                                                                                                                                                                                                            | functional assertions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `markdown-explanation-happy-path`       | explanationText.title, explanationText.body, label, interviewScript, passwordField.showToggle | `smoke`, `visual` | Information → `addStage('Anonymisation', { label: 'Internal Label', interviewScript: 'Say hello', explanationText: { title: 'Data Anonymisation', body: '## How It Works\n\nUse a **memorable** phrase.\n\n1. Choose one\n2. Confirm it' } })` → Information                                                                                                                                                                                                                                                        | `interview.next()` past intro Information; toggle "Show password" then fill+submit passphrase `'my secret phrase'` via `stage.anonymisation`                                                                                                                                                                                                                                                                           | h1 "Data Anonymisation" visible; heading "How It Works" visible; `<strong>` "memorable" visible; ordered-list items visible (RenderMarkdown output); `page.getByText('Internal Label')` and `getByText('Say hello')` have count 0 (dead config); after toggling Show password, `stage.anonymisation.passphraseField()` has `type="text"`; after submit, `successAlert()` visible with text `'Passphrase set successfully! Click "Next" to continue.'`; `interview.nextButtonHasPulse()` is `true`; `interview.next()` advances to the closing Information stage (its heading visible)                       |
| `required-mismatch-beforeNext-gating`   | passphraseFields.required, confirmField.sameAs, beforeNext.gating                             | —                 | single `addStage('Anonymisation', { explanationText: { title: 'Protect your data', body: 'Create a passphrase.' } })`                                                                                                                                                                                                                                                                                                                                                                                               | (1) click `interview.nextButton` with both fields empty; (2) fill only `passphraseField()` with `'partial'`, click `interview.nextButton` again; (3) `fillMismatched('passphrase-A', 'passphrase-B')`, click submit                                                                                                                                                                                                    | after (1): `successAlert()` has count 0; required error text visible under both fields (`page.getByText(/required/i)` count ≥ 1); URL step unchanged (`interview.nextButton` click did not navigate — assert via `expect(page).toHaveURL(/step=0/)`, since the protocol has only one prior stage at index 0 for this scenario, so seed `currentStep: 0` directly on Anonymisation); after (2): still no success alert; after (3): a mismatch/validation error is visible on `confirmField()`'s container (`page.locator('[data-field-name="passphrase-2"]').getByText(/match/i)`), `successAlert()` count 0 |
| `min-max-length-validation`             | validation.minLength, validation.maxLength                                                    | —                 | `addStage('Anonymisation', { explanationText: {...}, validation: { minLength: 8, maxLength: 20 } })`                                                                                                                                                                                                                                                                                                                                                                                                                | fill+submit `'short'` (5 chars); fill+submit a 25-character string; fill+submit a 10-character string                                                                                                                                                                                                                                                                                                                  | after 'short': `page.getByText(/at least 8 characters/i)` visible, `successAlert()` count 0; after 25-char: `page.getByText(/fewer than 20 characters/i)` visible, `successAlert()` count 0; after 10-char: `successAlert()` visible                                                                                                                                                                                                                                                                                                                                                                        |
| `backwards-nav-and-revisit-persistence` | beforeNext.backwardsAllowed, passphrase.persistOnRevisit                                      | —                 | Information → Anonymisation → Information, `currentStep: 1`                                                                                                                                                                                                                                                                                                                                                                                                                                                         | from Anonymisation with an empty form, click `previous-button` testid; assert landed on first Information stage; `interview.next()` forward again to Anonymisation; `fillPassphrase('remember-me-1234')` and submit; `interview.next()` to the closing Information stage; click `previous-button` back to Anonymisation                                                                                                | after Back from empty form: URL step is `0` (Information heading visible); after re-forward: Anonymisation form visible again (was not skipped); after submit + forward + back: `successAlert()` is visible immediately (form is NOT re-shown) because `ui.passphrase` persisted across the revisit (Anonymisation.tsx:104-118)                                                                                                                                                                                                                                                                             |
| `encrypted-downstream-write`            | experiments.encryptedVariables=true+encryptedVariable                                         | `visual`, `slow`  | `synth.setExperiments({ encryptedVariables: true })`; `const person = synth.addNodeType()`; `person.addVariable({ name: 'name', type: 'text', encrypted: true })`; `synth.addStage('Anonymisation', { explanationText: {...} })`; `synth.addStage('NameGeneratorQuickAdd', { subject: { entity: 'node', type: person.id }, quickAdd: 'name' })` (the pre-seeded "name" var id equals the string `'name'` only if you capture it from `person.addVariable(...).id` — use that returned id, not the literal `'name'`) | `fillPassphrase('correct-horse-battery')`, submit, `interview.next()`; `stage.quickAdd.addNode('Alice')`                                                                                                                                                                                                                                                                                                               | `protocol.getNetworkState(interviewId)` → `nodes[0].attributes[nameVarId]` is an `Array` of numbers (ciphertext, not `'Alice'`); `nodes[0]._secureAttributes[nameVarId].iv` has length 12 and `.salt` has length 16; the rendered option `page.getByRole('option', { name: 'Alice' })` is visible (decrypted for display via `useNodeLabel`)                                                                                                                                                                                                                                                                |
| `encrypted-off-no-op`                   | experiments.encryptedVariables=absent                                                         | —                 | identical shape to the previous row but `synth.setExperiments` is never called (protocol installs with `experiments: null`, the builder's existing default)                                                                                                                                                                                                                                                                                                                                                         | `fillPassphrase('unused-phrase')`, submit, `interview.next()`; `stage.quickAdd.addNode('Alice')`                                                                                                                                                                                                                                                                                                                       | `protocol.getNetworkState(interviewId)` → `nodes[0].attributes[nameVarId] === 'Alice'` (plain string); `nodes[0]._secureAttributes` is `undefined` — the passphrase had zero effect                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `missing-and-wrong-passphrase-prompter` | encryptedVariable.missingPassphrase.prompter, encryptedVariable.wrongPassphrase.invalid       | `slow`            | same encrypted shape as `encrypted-downstream-write`; `currentStep: 1` seeded directly on the NameGeneratorQuickAdd stage via `seedNetwork: true` is NOT used here — the node is created live in step one of `run()` so its ciphertext is valid for the passphrase entered live                                                                                                                                                                                                                                     | (1) `fillPassphrase('first-phrase')` on Anonymisation, submit, `interview.next()`, `stage.quickAdd.addNode('Alice')`; (2) `page.reload()` then `interview.goto(1)` (full app reload → in-memory `ui.passphrase` resets to `null`, landing back on the NameGeneratorQuickAdd step with the encrypted node already in the network); (3) `stage.anonymisation.openPrompter()`, `submitPrompterPassphrase('wrong-phrase')` | after (2): `stage.quickAdd.isDisabled()` is `true`; `stage.anonymisation.prompterButton()` visible showing 🔑; after (3): `page.getByRole('option', { name: '⚠️' })` visible (decrypt failure fallback, `useNodeAttributes.tsx:92`); `stage.anonymisation.prompterButton()` now shows ⚠️; re-submitting `submitPrompterPassphrase('first-phrase')` restores `page.getByRole('option', { name: 'Alice' })`                                                                                                                                                                                                   |

**Fully-coded scenarios** (the 4 most complex — the markdown/toggle happy path, the min/max-length dual-boundary case, encrypted-write, and the missing/wrong-passphrase reload+prompter case):

```ts
// e2e/matrix/anonymisation.scenarios.ts
import { z } from 'zod';

import { SyntheticInterview } from '@codaco/protocol-utilities';
import { entityAttributesProperty } from '@codaco/shared-consts';

import { expect } from '../fixtures/matrix-test.js';
import type { InterfaceScenarios } from './types.js';

export const anonymisationScenarios: InterfaceScenarios = {
  interfaceType: 'Anonymisation',
  scenarios: [
    {
      id: 'markdown-explanation-happy-path',
      covers: [
        'explanationText.title',
        'explanationText.body',
        'label',
        'interviewScript',
        'passwordField.showToggle',
      ],
      smoke: true,
      visual: true,
      // The animated EncryptionBackground (packages/interview/src/components/
      // EncryptedBackground.tsx:368-371, rendered at Anonymisation.tsx:75)
      // never settles, so the visual suite (Task 27) must mask it out.
      captureMask: (page) => [page.locator('.transform-3d')],
      build: () => {
        const synth = new SyntheticInterview();
        synth.addInformationStage({
          title: 'Welcome',
          text: 'Before the anonymisation stage.',
        });
        synth.addStage('Anonymisation', {
          label: 'Internal Label',
          interviewScript: 'Say hello',
          explanationText: {
            title: 'Data Anonymisation',
            body: '## How It Works\n\nUse a **memorable** phrase.\n\n1. Choose one\n2. Confirm it',
          },
        });
        synth.addInformationStage({
          title: 'Thank you',
          text: 'After the anonymisation stage.',
        });
        return synth;
      },
      currentStep: 0,
      run: async ({ page, interview, stage }) => {
        await interview.next(); // dismiss the intro Information stage

        await expect(
          page.getByRole('heading', { name: 'Data Anonymisation' }),
        ).toBeVisible();
        await expect(
          page.getByRole('heading', { name: 'How It Works' }),
        ).toBeVisible();
        await expect(
          page.locator('strong', { hasText: 'memorable' }),
        ).toBeVisible();
        await expect(
          page.getByRole('listitem', { name: 'Choose one' }),
        ).toBeVisible();

        // Dead-config: label/interviewScript never render in the interview DOM.
        await expect(page.getByText('Internal Label')).toHaveCount(0);
        await expect(page.getByText('Say hello')).toHaveCount(0);

        await stage.anonymisation.togglePasswordVisibility();
        await expect(stage.anonymisation.passphraseField()).toHaveAttribute(
          'type',
          'text',
        );

        await stage.anonymisation.fillPassphrase('my secret phrase');
        await stage.anonymisation.submit();

        await expect(stage.anonymisation.successAlert()).toBeVisible();
        await expect.poll(() => interview.nextButtonHasPulse()).toBe(true);

        await interview.next();
        await expect(
          page.getByRole('heading', { name: 'Thank you' }),
        ).toBeVisible();
      },
    },
    {
      id: 'min-max-length-validation',
      covers: ['validation.minLength', 'validation.maxLength'],
      build: () => {
        const synth = new SyntheticInterview();
        synth.addStage('Anonymisation', {
          explanationText: {
            title: 'Protect your data',
            body: 'Create a passphrase between 8 and 20 characters.',
          },
          validation: { minLength: 8, maxLength: 20 },
        });
        return synth;
      },
      run: async ({ page, stage }) => {
        await stage.anonymisation.fillPassphrase('short');
        await stage.anonymisation.submit();
        await expect(
          page.getByText(/enter at least 8 characters/i),
        ).toBeVisible();
        await expect(stage.anonymisation.successAlert()).toHaveCount(0);

        await stage.anonymisation.fillPassphrase(
          'this passphrase is far too long',
        );
        await stage.anonymisation.submit();
        await expect(
          page.getByText(/enter fewer than 20 characters/i),
        ).toBeVisible();
        await expect(stage.anonymisation.successAlert()).toHaveCount(0);

        await stage.anonymisation.fillPassphrase('just right!');
        await stage.anonymisation.submit();
        await expect(stage.anonymisation.successAlert()).toBeVisible();
      },
    },
    {
      id: 'encrypted-downstream-write',
      covers: ['experiments.encryptedVariables=true+encryptedVariable'],
      visual: true,
      slow: true,
      // Same continuously-animated EncryptionBackground as the happy-path
      // scenario above (EncryptedBackground.tsx:368-371 / Anonymisation.tsx:75)
      // — mask it for the Task 27 pixel-visual suite.
      captureMask: (page) => [page.locator('.transform-3d')],
      build: () => {
        const synth = new SyntheticInterview();
        synth.setExperiments({ encryptedVariables: true });
        const person = synth.addNodeType();
        const nameVar = person.addVariable({
          name: 'name',
          type: 'text',
          encrypted: true,
        });
        synth.addStage('Anonymisation', {
          explanationText: {
            title: 'Protect your data',
            body: 'This study encrypts participant names.',
          },
        });
        synth.addStage('NameGeneratorQuickAdd', {
          subject: { entity: 'node', type: person.id },
          quickAdd: nameVar.id,
        });
        return synth;
      },
      run: async ({ page, interview, stage, protocol }) => {
        await stage.anonymisation.fillPassphrase('correct-horse-battery');
        await stage.anonymisation.submit();
        await expect(stage.anonymisation.successAlert()).toBeVisible();
        await interview.next();

        await stage.quickAdd.addNode('Alice');

        const network = await protocol.getNetworkState(interview.interviewId);
        const node = network!.nodes[0]!;
        const attrs = node[entityAttributesProperty];
        const nameVarId = Object.keys(attrs)[0]!;
        expect(Array.isArray(attrs[nameVarId])).toBe(true);
        expect(attrs[nameVarId]).not.toBe('Alice');

        // Encrypted values move into _secureAttributes (not part of NcNode's
        // public type) — narrow via schema parse instead of a type assertion.
        const SecureNodeSchema = z.object({
          _secureAttributes: z.record(
            z.string(),
            z.object({
              iv: z.array(z.number()).length(12),
              salt: z.array(z.number()).length(16),
            }),
          ),
        });
        const { _secureAttributes } = SecureNodeSchema.parse(node);
        expect(_secureAttributes[nameVarId]).toBeDefined();

        await expect(page.getByRole('option', { name: 'Alice' })).toBeVisible();
      },
    },
    {
      id: 'missing-and-wrong-passphrase-prompter',
      covers: [
        'encryptedVariable.missingPassphrase.prompter',
        'encryptedVariable.wrongPassphrase.invalid',
      ],
      slow: true,
      build: () => {
        const synth = new SyntheticInterview();
        synth.setExperiments({ encryptedVariables: true });
        const person = synth.addNodeType();
        const nameVar = person.addVariable({
          name: 'name',
          type: 'text',
          encrypted: true,
        });
        synth.addStage('Anonymisation', {
          explanationText: {
            title: 'Protect your data',
            body: 'This study encrypts participant names.',
          },
        });
        synth.addStage('NameGeneratorQuickAdd', {
          subject: { entity: 'node', type: person.id },
          quickAdd: nameVar.id,
        });
        return synth;
      },
      run: async ({ page, interview, stage }) => {
        // Step one: set a passphrase live and add a node, so the node's
        // ciphertext is valid for the passphrase entered in this run (no
        // seedNetwork — a pre-seeded node would be encrypted with no
        // passphrase the test controls).
        await stage.anonymisation.fillPassphrase('first-phrase');
        await stage.anonymisation.submit();
        await expect(stage.anonymisation.successAlert()).toBeVisible();
        await interview.next();

        await stage.quickAdd.addNode('Alice');
        await expect(page.getByRole('option', { name: 'Alice' })).toBeVisible();

        // A full reload clears the in-memory ui.passphrase (usePassphrase.tsx
        // has no persistence beyond the Redux store), landing back on the
        // NameGeneratorQuickAdd step (index 1) with the encrypted node still
        // in the shared graph but no passphrase available to decrypt it.
        await page.reload();
        await interview.goto(1);

        await expect(stage.quickAdd.isDisabled()).resolves.toBe(true);
        await expect(stage.anonymisation.prompterButton()).toBeVisible();
        await expect(stage.anonymisation.prompterButton()).toHaveText('🔑');

        await stage.anonymisation.openPrompter();
        await stage.anonymisation.submitPrompterPassphrase('wrong-phrase');

        // Decrypt failure fallback (useNodeAttributes.tsx:92) — distinct from
        // the missing-passphrase '🔒' path, which never renders here.
        await expect(page.getByRole('option', { name: '⚠️' })).toBeVisible();
        await expect(stage.anonymisation.prompterButton()).toHaveText('⚠️');

        await stage.anonymisation.openPrompter();
        await stage.anonymisation.submitPrompterPassphrase('first-phrase');

        await expect(page.getByRole('option', { name: 'Alice' })).toBeVisible();
      },
    },
    // required-mismatch-beforeNext-gating, backwards-nav-and-revisit-persistence,
    // and encrypted-off-no-op follow the table above directly — same
    // builder/fixture calls, no additional API surface.
  ],
};
```

```ts
// e2e/specs/matrix/anonymisation.spec.ts
import { anonymisationScenarios } from '../../matrix/anonymisation.scenarios.js';
import { defineScenarioTests } from '../../matrix/run-scenario.js';

defineScenarioTests(anonymisationScenarios);
```

- [ ] **Step 1: Write the stage-fixture helpers** — replace the `AnonymisationFixture` placeholder with the code in "Stage fixture helpers" above. (`encrypted` on `AddVariableInput`/`VariableEntry` and its builder wiring are Task 1's responsibility, not this task's — confirm Task 1 has landed before starting Step 2's encrypted-write/prompter scenarios.)
- [ ] **Step 2: Write the registry + inventory entry + spec file** — all 7 scenarios (4 fully coded above, 3 per the scenario table), conforming to the Task 6 exemplar.
- [ ] **Step 3: Run the coverage manifest**: `pnpm --filter @codaco/interview exec vitest run e2e/matrix` — Expected: PASS (all `Anonymisation` inventory keys claimed except `skipLogic`, which Task 26's `sharedSuiteClaims` covers).
- [ ] **Step 4: Run the scenarios**: `pnpm --filter @codaco/interview test:e2e:headed -- --project=chromium-matrix --grep "Anonymisation"` — Expected: PASS; commit new `.aria.yml` baselines. Note `slow: true` scenarios add real PBKDF2 latency (~100ms/op) — do not shorten timeouts.
- [ ] **Step 5: Typecheck + commit** with message `test(interview-e2e): Anonymisation configuration matrix`

### Task 23: FamilyPedigree matrix scenarios

**Files:**

- Create: `e2e/matrix/family-pedigree.scenarios.ts`
- Create: `e2e/specs/matrix/family-pedigree.spec.ts`
- Modify: `e2e/matrix/option-inventory.ts` (add the `FamilyPedigree` entry — full code below)
- Modify: `e2e/matrix/coverage-manifest.test.ts` (append `familyPedigreeScenarios` to `ALL_SUITES`)
- Modify: `e2e/matrix/all-scenarios.ts` if it exists yet (append registry import — otherwise skip, `coverage-manifest.test.ts` is the only aggregator today)
- Modify: `e2e/fixtures/stage-fixture.ts` (replace the empty `FamilyPedigreeFixture` placeholder, lines 1241-1259, with the implementation below)

**Interfaces:**

- Consumes: `ScenarioDefinition`/`InterfaceScenarios`/`defineScenarioTests` (Task 6, `e2e/matrix/types.ts` + `e2e/matrix/run-scenario.ts`); `AddStageInput.skipLogic`/`.filter`/`.validation` and `AddFormFieldOpts.hint`/`.showValidationHints`/`.parameters` (Task 1, `packages/protocol-utilities/src/SyntheticInterview.ts`); seeded interviews via `scenario.currentStep`/`scenario.seedNetwork` (Task 3); `matrixTest`/`ariaSnapshot` (Task 4); `OPTION_INVENTORY` (Task 6, extended here). Also directly consumes the FamilyPedigree stage builder surface already present in `SyntheticInterview.addStage('FamilyPedigree', opts)` (`packages/protocol-utilities/src/SyntheticInterview.ts:393-595`) — `nodeConfig`/`edgeConfig`/`framing`/`boundaries`/`introScreen`/`censusPrompt`/`nominationPrompts` pass through largely as-is (see "Builder API notes" below).
- Consumes (fixture): `stage.familyPedigree` (new sub-fixture implemented in this task; other tasks do not depend on it, FamilyPedigree is the only interface that uses it).
- Produces: `familyPedigreeScenarios: InterfaceScenarios` (consumed by `coverage-manifest.test.ts` and `family-pedigree.spec.ts`); `StageFixture.familyPedigree: FamilyPedigreeFixture` with the method surface below (no other task currently consumes it, but it replaces a placeholder every other interface task tree references by name only).

**Builder API notes (read before coding):**

- `addStage('FamilyPedigree', { label, subject, interviewScript, skipLogic, framing, boundaries, nodeConfig, edgeConfig, censusPrompt, nominationPrompts, introScreen })` — `subject` only needs `{ entity: 'node', type: nodeType.id }`, used to default `nodeConfig`/`edgeConfig` fields you don't override.
- `nodeConfig.form` is `FamilyPedigreeNodeConfigInput['form']` — an array of `{ variable, prompt, hint?, showValidationHints?, id? }` passed through **verbatim** (no `resolveFormField` indirection unlike `NameGenerator`/`AlterForm`) — see `SyntheticInterview.ts:526-531`. The field's rendered `component`/validation come from the underlying variable's own `addVariable({ component, validation })`, not from the form-field entry.
- `edgeConfig` — only `type` and `relationshipTypeVariable` are required; `isActiveVariable`/`isGestationalCarrierVariable`/`gameteRoleVariable` auto-generate ids when omitted (`SyntheticInterview.ts:547-561`), but every scenario below sets them explicitly so the id is known for assertions.
- Categorical attributes (`relationshipTypeVariable`, `gameteRoleVariable`, inferred `biologicalSexVariable`) are stored as **single-element arrays** (`['biological']`, `['egg']`, `['female']`); `isActiveVariable`/`isGestationalCarrierVariable` are plain booleans; `relationshipVariable` (computed node attribute) is a plain capitalized string (`'Parent'`, `'Sibling'`, `'Donor'`) — see `pedigree-layout/utils/getDisplayLabel.ts` `computeRelationshipsToEgo` (tested in `pedigree-layout/__tests__/getDisplayLabel.test.ts:658-668`).
- Role → `relationshipTypeVariable` mapping for additional/step parents: `'adoptive-parent'` → `['adoptive']`, `'step-parent'`/`'raised-me'` → `['social']` (`components/wizards/transforms/egoCellTransform.ts:103`). Partner edges → `['partner']` (`egoCellTransform.ts:277,318`). Gestational-carrier edges → `['surrogate']` (`egoCellTransform.ts:166`).
- `deriveBiologicalSex.withInferredBiologicalSex` (`deriveBiologicalSex.ts:62-84`) fills `biologicalSexVariable` on every committed node that didn't get it directly: an `egg`-role genetic-parent edge → `['female']`, `sperm` → `['male']`, an unattributed gestational-carrier edge → `['female']`, otherwise `['unknown']`.
- `censusPrompt`/`label`/`interviewScript` are stage-level strings on `AddStageInput` (from `baseStageSchema` — `label`/`interviewScript` are never rendered to the participant, `packages/protocol-validation/src/schemas/8/stages/base.ts:8-16`).
- `introScreen.items[]` — `{ id, type: 'text'|'asset', content }` — asset items store the asset id as `content` directly (no `size` field, unlike Information's items — `packages/protocol-validation/src/schemas/8/stages/family-pedigree.ts:24-33`).
- `nominationPrompts[]` — `{ id, text, variable }` (`FamilyPedigreeNominationPromptInput`); id `'scaffolding'` is reserved and rejected at parse time (not e2e-testable — see scenario 10's note).

---

### Stage fixture helpers

Replace the placeholder `FamilyPedigreeFixture` (`e2e/fixtures/stage-fixture.ts:1241-1259`) with:

```ts
/**
 * Fixture for FamilyPedigree stages: the quick-start wizard (a sequence of
 * dialogs sharing the repo's generic wizard/dialog chrome — `wizard-next`
 * (`fresco-ui/src/dialogs/useWizardState.tsx:258`) / `dialog-submit`
 * (`fresco-ui/src/dialogs/DialogProvider.tsx:585`) / `dialog-primary`
 * (`fresco-ui/src/dialogs/DialogProvider.tsx:485,544`) testids), the pedigree
 * canvas (nodes rendered as accessible buttons named by their display label —
 * `PedigreeNode.tsx:184-190` passes `ariaLabel={displayLabel}` into fresco-ui's
 * `Node`, which renders a native `<motion.button aria-label={...}>` at
 * `fresco-ui/src/Node.tsx:294-303`), the node context menu, and the floating
 * completeness checklist.
 *
 * Ported from the Storybook play-function helpers at
 * `packages/interview/src/interfaces/FamilyPedigree/familyPedigreeWizardHelpers.ts`
 * (storybook/test `userEvent`/`screen` → Playwright `Locator`s).
 */
class FamilyPedigreeFixture {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Floating button that opens the quick-start wizard.
   * Source: components/wizards/EgoCellWizard.tsx:195
   * (`data-testid="pedigree-get-started"`).
   */
  get getStartedButton(): Locator {
    return this.page.getByTestId('pedigree-get-started');
  }

  /** The currently open wizard/confirm/acknowledge dialog (shared dialog
   * chrome — fresco-ui/src/dialogs/useWizardState.tsx + DialogProvider.tsx). */
  get dialog(): Locator {
    return this.page.getByRole('dialog');
  }

  async clickGetStarted(): Promise<void> {
    await this.getStartedButton.click();
    await expect(this.dialog).toBeVisible();
  }

  /** Advance a wizard step via its primary action ("Continue"/"Finish").
   * Source: `fresco-ui/src/dialogs/useWizardState.tsx:258` (`data-testid="wizard-next"`,
   * mirrors familyPedigreeWizardHelpers.ts:37-40 `clickNext`). */
  async clickWizardNext(): Promise<void> {
    await this.dialog.getByTestId('wizard-next').click();
  }

  /** Submit a form-type dialog (the AddPerson "Add"/"Done" submitter).
   * Source: `fresco-ui/src/dialogs/DialogProvider.tsx:585` (`SubmitButton
   * data-testid="dialog-submit"`, mirrors familyPedigreeWizardHelpers.ts:43-46
   * `clickDialogSubmit`). */
  async clickDialogSubmit(): Promise<void> {
    await this.dialog.getByTestId('dialog-submit').click();
  }

  /** Confirm an acknowledge dialog (e.g. "OK" on "Pedigree is incomplete").
   * Source: `fresco-ui/src/dialogs/DialogProvider.tsx:485,544`
   * (`data-testid="dialog-primary"`, mirrors familyPedigreeWizardHelpers.ts:48-52
   * `clickDialogPrimary`). */
  async clickDialogPrimary(): Promise<void> {
    await this.dialog.getByTestId('dialog-primary').click();
  }

  private field(fieldName: string): Locator {
    // `data-field-name` is set at `fresco-ui/src/form/hooks/useField.ts:321`
    // (interface constant declared line 66), namespaced e.g. `egg-parent.gender_identity`.
    return this.dialog.locator(`[data-field-name="${fieldName}"]`);
  }

  /**
   * Fill one field inside the open dialog, located by its `data-field-name`
   * (set at `fresco-ui/src/form/hooks/useField.ts:321`, namespaced e.g.
   * `egg-parent.gender_identity`). Ported from
   * familyPedigreeWizardHelpers.ts:63-122 `setFieldInput`: booleans map to a
   * switch (`role="switch"`) or a true/false radio pair (`data-value`);
   * numbers drive a stepper via its Increase/Decrease value button; option
   * fields (radio/rich-select) match by `data-value` first, falling back to
   * accessible name (covers people-pickers whose option values are generated
   * node ids); everything else types into the text input.
   */
  async setField(
    fieldName: string,
    value: boolean | string | number,
  ): Promise<void> {
    const container = this.field(fieldName);

    if (typeof value === 'boolean') {
      const toggle = container.getByRole('switch');
      if (await toggle.count()) {
        const isChecked =
          (await toggle.getAttribute('aria-checked')) === 'true';
        if (isChecked !== value) await toggle.click();
        return;
      }
      await container
        .locator(`[role="radio"][data-value="${value ? 'true' : 'false'}"]`)
        .click();
      return;
    }

    if (typeof value === 'number') {
      const input = container.getByRole('spinbutton');
      const current = Number((await input.inputValue()) || '0');
      const diff = value - current;
      if (diff === 0) return;
      const label = diff > 0 ? 'Increase value' : 'Decrease value';
      const stepBtn = container.getByRole('button', { name: label });
      for (let i = 0; i < Math.abs(diff); i++) await stepBtn.click();
      return;
    }

    const options = container.locator('[role="radio"], [role="option"]');
    if (await options.count()) {
      const byValue = container.locator(
        `[role="radio"][data-value="${value}"], [role="option"][data-value="${value}"]`,
      );
      if (await byValue.count()) {
        await byValue.first().click();
        return;
      }
      await container.getByRole('radio', { name: value }).click();
      return;
    }

    await container.getByRole('textbox').fill(value);
  }

  /**
   * Set one cell of a partnership matrix. `focalId` is the wizard's temp id
   * for the row-owning person (e.g. `'egg-parent'`); `partnerLabel` is the
   * row's displayed label (a name, or a role fallback like "your sperm
   * parent" for unnamed people); `value` is the matrix option.
   * Ported from familyPedigreeWizardHelpers.ts:130-150 `setPartnership`.
   */
  async setPartnership(
    focalId: string,
    partnerLabel: string,
    value: 'current' | 'ex' | 'none',
  ): Promise<void> {
    const matrix = this.field(`partnerships.${focalId}`);
    const group = matrix.getByRole('radiogroup', { name: partnerLabel });
    await group.locator(`[role="radio"][data-value="${value}"]`).click();
  }

  /** Answer "About you" (EgoSexStep biological-sex question) and continue.
   * Ported from familyPedigreeWizardHelpers.ts:156-159 `selectEgoSex`. */
  async selectEgoSex(
    value: 'female' | 'male' | 'intersex' | 'unknown' = 'female',
  ): Promise<void> {
    await this.setField('biologicalSex', value);
    await this.clickWizardNext();
  }

  /** Choose a framing option (`gamete`/`gendered`) on FramingSelectionStep.
   * `FramingSelectionStep.tsx:46-48` renders `RichSelectGroupField`, whose
   * options carry `data-value={String(option.value)}` at
   * `fresco-ui/src/form/fields/RichSelectGroup.tsx:414` with `role="option"`.
   * Ported from familyPedigreeWizardHelpers.ts:162-167 `selectFraming`. */
  async selectFraming(value: 'gamete' | 'gendered'): Promise<void> {
    await this.dialog.locator(`[role="option"][data-value="${value}"]`).click();
  }

  /** Open a pedigree node's context menu by its display name (the node's
   * accessible name). `PedigreeNode.tsx:184-190` renders the fresco-ui `Node`
   * component with `ariaLabel={displayLabel}`; `Node` itself renders a native
   * `<motion.button>` with `aria-label={ariaLabel ?? label}` at
   * `fresco-ui/src/Node.tsx:294-303` (accessible role "button", `aria-pressed`
   * at line 304 for the post-finalize nomination toggle).
   * Ported from familyPedigreeWizardHelpers.ts:170-178 `openNodeContextMenu`. */
  async openNodeContextMenu(nodeName: string): Promise<void> {
    await this.page
      .getByRole('button', { name: nodeName, exact: true })
      .click();
    await expect(this.page.getByRole('menu')).toBeVisible();
  }

  /**
   * Click a node context-menu item. The menu inherits `pointer-events:none`
   * from its backdrop during the open animation (repo-wide base-ui menu
   * race), so this waits for it to clear before clicking — ported from
   * familyPedigreeWizardHelpers.ts:186-201 `clickMenuItem`.
   * Source of testids: pedigree-layout/components/NodeContextMenu.tsx:59-103.
   */
  async clickMenuItem(
    action: 'parent' | 'child' | 'partner' | 'sibling' | 'edit' | 'delete',
  ): Promise<void> {
    const item = this.page.getByTestId(`pedigree-menu-${action}`);
    await expect(item).toBeVisible();
    await expect
      .poll(() => item.evaluate((el) => getComputedStyle(el).pointerEvents))
      .not.toBe('none');
    await item.click();
  }

  /** The floating completeness-checklist widget.
   * Source: components/PedigreeChecklist.tsx:394 (`data-testid="pedigree-checklist"`). */
  get checklist(): Locator {
    return this.page.getByTestId('pedigree-checklist');
  }

  /** A single checklist item by its id (e.g. `'boundary-grandparents'`,
   * `'children'`, `'partner'`). Has `data-required`/`data-done` attributes.
   * Source: components/PedigreeChecklist.tsx:423. */
  checklistItem(id: string): Locator {
    return this.page.getByTestId(`pedigree-checklist-item-${id}`);
  }

  /** Toggle a checklist item's manually-checked-done state by clicking it. */
  async toggleChecklistItem(id: string): Promise<void> {
    await this.checklistItem(id).click();
  }

  /** The "Finalize family pedigree" button — only rendered once every
   * checklist item is done. Source: components/PedigreeChecklist.tsx:479
   * (`data-testid="pedigree-checklist-finalize"`). */
  get finalizeChecklistButton(): Locator {
    return this.page.getByTestId('pedigree-checklist-finalize');
  }

  /** A pedigree node rendered on the canvas, located by its display label
   * (its accessible name). Clicking it opens the context menu pre-finalize,
   * or toggles the active nomination attribute post-finalize during a
   * nomination step. Nodes render as accessible buttons: `PedigreeNode.tsx:184-190`
   * passes `ariaLabel={displayLabel}` into fresco-ui's `Node`, which renders a
   * `<motion.button aria-label={ariaLabel ?? label} aria-pressed={...}>` at
   * `fresco-ui/src/Node.tsx:294-304`. */
  node(name: string): Locator {
    return this.page.getByRole('button', { name, exact: true });
  }
}
```

Wire it into `StageFixture` exactly as the placeholder already does (`this.familyPedigree = new FamilyPedigreeFixture(page);` — no change needed there, only the class body above changes).

- [ ] **Step 1: Write the stage-fixture helpers** — replace `FamilyPedigreeFixture` (`e2e/fixtures/stage-fixture.ts:1241-1259`) with the code above. No other class in the file references it, so this is a self-contained edit.

---

### Option inventory entry

```ts
// e2e/matrix/option-inventory.ts — add to OPTION_INVENTORY
FamilyPedigree: [
  'label',
  'interviewScript',
  'skipLogic', // claimed by the shared cross-cutting suite (Task 26), not here
  'nodeConfig.type',
  'nodeConfig.nodeLabelVariable',
  'nodeConfig.nodeLabelVariable=unset-name-fallback',
  'nodeConfig.egoVariable',
  'nodeConfig.relationshipVariable',
  'nodeConfig.biologicalSexVariable',
  'nodeConfig.form',
  'nodeConfig.form[].hint',
  'nodeConfig.form[].showValidationHints',
  'edgeConfig.type',
  'edgeConfig.relationshipTypeVariable',
  'edgeConfig.relationshipTypeVariable=adoptive',
  'edgeConfig.relationshipTypeVariable=social',
  'edgeConfig.isActiveVariable',
  'edgeConfig.isGestationalCarrierVariable',
  'edgeConfig.isGestationalCarrierVariable=true-surrogate',
  'edgeConfig.gameteRoleVariable',
  'edgeConfig.gameteRoleVariable=donor-both',
  'framing=fixed(gamete)',
  'framing=fixed(gendered)',
  'framing=participantChoice',
  'boundaries.requireGrandparents=required',
  'boundaries.requireGrandparents=recommended',
  'boundaries.requireGrandparents=off',
  'boundaries.requireChildrenContributors=required',
  'introScreen',
  'introScreen.items[].type=text',
  'introScreen.items[].type=asset',
  'censusPrompt',
  'nominationPrompts=absent',
  'nominationPrompts[].text',
  'nominationPrompts[].variable',
  'nominationPrompts[].id', // dead for e2e — validated at protocol-parse time only
],
```

---

### Scenario table

13 scenarios (deviates slightly under the ~14 target: framing/boundaries/nomination each collapse cleanly into 3/3/1 bundles per the dive file's own assertion grouping, and `skipLogic` is explicitly excluded per the shared-suite carve-out, so there is no unbundled remainder to pad the count with).

| id                                                 | covers                                                                                                                                                                                                                                                                                                                                                           | flags             | protocol config                                                                                                                                                                                                                                                                                                                     | interaction                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | functional assertions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `smoke-nuclear-family`                             | label, interviewScript, nodeConfig.type, nodeConfig.nodeLabelVariable, nodeConfig.egoVariable, nodeConfig.biologicalSexVariable, edgeConfig.type, edgeConfig.relationshipTypeVariable, edgeConfig.gameteRoleVariable, edgeConfig.isGestationalCarrierVariable, framing=fixed(gamete), censusPrompt, nominationPrompts=absent, boundaries.requireGrandparents=off | `smoke`, `visual` | `framing:{mode:'fixed',value:'gamete'}`, `boundaries:{requireGrandparents:'off',requireChildrenContributors:'off'}`, `label:'INTERNAL: Do Not Show This'`, `interviewScript:'Long author-only note about wizard steps.'`, `censusPrompt:'Please build your family pedigree.'`, no `introScreen`, no `nominationPrompts`             | Full "NuclearFamily" wizard walk: `clickGetStarted` → `selectEgoSex()` → egg-parent (is-donor false, name Linda, gestationalCarrier true, gender_identity woman) → `clickWizardNext` → sperm-parent (is-donor false, name Robert, gender_identity man) → `clickWizardNext` → hasOtherParents false → `clickWizardNext` → `setPartnership('egg-parent','Robert','current')` → `clickWizardNext` → hasPartner false → `clickWizardNext` → `interview.nextButton.click()` → confirm dialog "Finalize" | see fully-coded scenario 1 below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `relationship-form-fields-and-active-partner-edge` | nodeConfig.relationshipVariable, nodeConfig.form, nodeConfig.form[].hint, nodeConfig.form[].showValidationHints, edgeConfig.isActiveVariable                                                                                                                                                                                                                     | —                 | fixed gamete framing, boundaries off, `nodeConfig.form: [{variable: diseaseVar.id, prompt:'Has this person been diagnosed with X?', hint:'Leave blank if unsure'}, {variable: notesVar.id, prompt:'Any additional health notes?', showValidationHints:true}]` where `notesVar` is `text`, `validation:{required:true, minLength:2}` | Same wizard walk as smoke, but on the egg-parent step also `setField('egg-parent.<diseaseVarId>', true)` and leave `notesVar` blank; `setPartnership('egg-parent','Robert','ex')` (not current)                                                                                                                                                                                                                                                                                                    | On egg-parent step (pre-`clickWizardNext`): hint text `'Leave blank if unsure'` visible under the disease field; validation-hint summary text (contains `'You must answer this question'`, from `fresco-ui/src/form/validation/functions.ts:39-43`) visible under the notes field; disease field has NO such summary text (no `showValidationHints`). After finalize: `getNetworkState()` — egg-parent node `attributes.relationshipVariable === 'Parent'`; egg-parent node `attributes[diseaseVarId] === true`; the egg-parent↔Robert edge `attributes.isActiveVariable === false`; the egg-parent→ego edge `attributes.isActiveVariable === true` (unconditional on parent-child edges) |
| `framing-participant-choice-with-intro`            | framing=participantChoice, introScreen, introScreen.items[].type=text                                                                                                                                                                                                                                                                                            | —                 | `framing:{mode:'participantChoice'}`, `introScreen:{items:[{id:'intro-text',type:'text',content:'This pedigree helps us understand your family health history.'}]}`, boundaries off                                                                                                                                                 | `clickGetStarted` → assert intro text visible → `clickWizardNext` → `selectFraming('gamete')` → `clickWizardNext` → `selectEgoSex()`                                                                                                                                                                                                                                                                                                                                                               | Intro text visible before the framing-selection step (order assertion); after choosing `gamete`, the egg-parent dialog contains text matching `/egg parent/i` (case-insensitive, `getByText` count > 0)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `framing-fixed-gendered`                           | framing=fixed(gendered)                                                                                                                                                                                                                                                                                                                                          | —                 | `framing:{mode:'fixed',value:'gendered'}`, no introScreen, boundaries off                                                                                                                                                                                                                                                           | `clickGetStarted` → assert `dialog.getByRole('option')` count is 0 (framing-selection step skipped) → `selectEgoSex()`                                                                                                                                                                                                                                                                                                                                                                             | Egg-parent dialog (now titled "Mother") contains text matching `/mother/i`, count > 0                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `intro-screen-asset-image`                         | introScreen.items[].type=asset                                                                                                                                                                                                                                                                                                                                   | `visual`          | fixed gamete framing, boundaries off, `introScreen:{items:[{id:'intro-image',type:'asset',content:'img-1'},{id:'intro-heading',type:'text',content:'# Disallowed heading\n\nAllowed paragraph.'}]}`                                                                                                                                 | `clickGetStarted` → assert image + allowlist                                                                                                                                                                                                                                                                                                                                                                                                                                                       | see fully-coded scenario 2 below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `boundaries-grandparents-required-blocked`         | boundaries.requireGrandparents=required                                                                                                                                                                                                                                                                                                                          | —                 | `boundaries:{requireGrandparents:'required',requireChildrenContributors:'off'}`, fixed gamete framing                                                                                                                                                                                                                               | Minimal wizard walk (egg-parent: is-donor false, gestationalCarrier true; sperm-parent: is-donor false; no other parents; no partnership changes; no partner)                                                                                                                                                                                                                                                                                                                                      | `stage.familyPedigree.checklist` visible; `checklistItem('boundary-grandparents')` has `data-required="true"`; `finalizeChecklistButton` has count 0 (not rendered, `allDone` false); `interview.nextButton.click()` → acknowledge dialog "Pedigree is incomplete" visible with issues text → `clickDialogPrimary()` ("Return to editing") → `getNetworkState(interviewId).nodes` has length 0 (nothing committed pre-finalize)                                                                                                                                                                                                                                                           |
| `boundaries-grandparents-recommended-nudge`        | boundaries.requireGrandparents=recommended                                                                                                                                                                                                                                                                                                                       | —                 | `boundaries:{requireGrandparents:'recommended',requireChildrenContributors:'off'}`, fixed gamete framing                                                                                                                                                                                                                            | Same minimal wizard walk as above                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `checklistItem('boundary-grandparents')` has `data-required="false"`; manually satisfy every remaining optional item by clicking `checklistItem('parent-siblings')`, `checklistItem('siblings')`, `checklistItem('partner')`, `checklistItem('children')`, `checklistItem('boundary-grandparents')` (toggles each to done) → `finalizeChecklistButton` becomes visible → click it → confirm dialog "Finalize" → click "Finalize" button by role → `getNetworkState(interviewId).nodes` has length 3 (ego + 2 parents) and no blocking dialog appeared                                                                                                                                     |
| `boundaries-children-contributors-required`        | boundaries.requireChildrenContributors=required                                                                                                                                                                                                                                                                                                                  | —                 | `boundaries:{requireGrandparents:'off',requireChildrenContributors:'required'}`, fixed gamete framing                                                                                                                                                                                                                               | Minimal wizard walk, then hasPartner true, partner name Jennifer + biologicalSex female + gender_identity woman, childrenWithPartnerCount 1, child name Daniel + biologicalSex male + gender_identity man, `clickWizardNext`                                                                                                                                                                                                                                                                       | `checklistItem('boundary-children-contributors')` has `data-required="true"` (Jennifer's own parents unrecorded); `interview.nextButton.click()` → acknowledge dialog cites the co-parent requirement → `clickDialogPrimary()`; then `toggleChecklistItem('boundary-children-contributors')` (manually satisfy) → `finalizeChecklistButton` visible → click → confirm "Finalize" → `getNetworkState(interviewId).nodes` has length 5 (ego + 2 parents + Jennifer + Daniel), no further blocking dialog                                                                                                                                                                                    |
| `adoptive-relationship-edge-styling`               | edgeConfig.relationshipTypeVariable=adoptive                                                                                                                                                                                                                                                                                                                     | `visual`          | fixed gamete framing, boundaries off                                                                                                                                                                                                                                                                                                | "AdoptedIn" wizard walk: egg-parent (is-donor false, gestationalCarrier true, no name) → sperm-parent (is-donor false, no name) → hasOtherParents true, otherParentCount 2 → additional-parent[0] role 'Adoptive parent' name James, additional-parent[1] role 'Adoptive parent' name Barbara → `setPartnership('additional-parent-0','Barbara','current')` → hasPartner false → finalize                                                                                                          | `getNetworkState()`: the James↔ego edge `attributes.relationshipTypeVariable` deep-equals `['adoptive']`; the Barbara↔ego edge likewise `['adoptive']` (both adoptive parents). Pixel treatment (`AdoptionBrackets` wrapper, `pedigree-layout/components/PedigreeNode.tsx:203-207`) is asserted only via the automatic `visual:true` pixel snapshot (Task 27), not in `run()`                                                                                                                                                                                                                                                                                                             |
| `nomination-prompts-sequential-toggle`             | nominationPrompts=present, nominationPrompts[].text, nominationPrompts[].variable, nominationPrompts[].id                                                                                                                                                                                                                                                        | —                 | fixed gamete framing, boundaries off, `nominationPrompts:[{id:'1',text:'Please nominate any family members who have been diagnosed with breast cancer.',variable:diseaseVar.id},{id:'2',text:'Please nominate any family members who have been diagnosed with type 2 diabetes.',variable:diabetesVar.id}]`                          | see fully-coded scenario 3 below                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | see fully-coded scenario 3 below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `surrogate-two-donors-gestational-carrier`         | edgeConfig.isGestationalCarrierVariable=true-surrogate, edgeConfig.gameteRoleVariable=donor-both                                                                                                                                                                                                                                                                 | —                 | fixed gamete framing, boundaries off                                                                                                                                                                                                                                                                                                | "SingleParentTwoDonors" walk: egg-parent is-donor true, gestationalCarrier false, gender_identity woman → gestational-carrier step: name Mum, gender_identity woman → sperm-parent is-donor true, gender_identity man → hasOtherParents false → no partnership changes → hasPartner false → finalize                                                                                                                                                                                               | `getNetworkState()`: egg-parent(donor)↔ego edge `attributes.gameteRoleVariable` deep-equals `['egg']`, `attributes.isGestationalCarrierVariable === false`; Mum(carrier)↔ego edge `attributes.isGestationalCarrierVariable === true`, `attributes.gameteRoleVariable` is absent or `undefined` (carrier is not a genetic parent); sperm-parent(donor)↔ego edge `attributes.gameteRoleVariable` deep-equals `['sperm']`; egg-parent node and Mum node both `attributes.biologicalSexVariable` deep-equal `['female']` (inferred — egg role and carried-pregnancy respectively)                                                                                                             |
| `blended-family-step-parent-relationship-type`     | edgeConfig.relationshipTypeVariable=social                                                                                                                                                                                                                                                                                                                       | —                 | fixed gamete framing, boundaries off                                                                                                                                                                                                                                                                                                | "BlendedFamily" walk: egg-parent Susan (is-donor false, gestationalCarrier true, woman) → sperm-parent Robert (is-donor false, man) → hasOtherParents true, otherParentCount 1 → additional-parent[0] role 'Step-parent' name Karen, gender_identity woman → `setPartnership('egg-parent','Robert','ex')`, `setPartnership('sperm-parent','Karen','current')` → hasPartner false → finalize                                                                                                        | `getNetworkState()`: Karen↔ego edge `attributes.relationshipTypeVariable` deep-equals `['social']`; Susan↔Robert edge `attributes.isActiveVariable === false` (ex); Robert↔Karen edge `attributes.relationshipTypeVariable` deep-equals `['partner']` and `attributes.isActiveVariable === true` (current)                                                                                                                                                                                                                                                                                                                                                                                |
| `single-parent-absent-second-parent`               | nodeConfig.nodeLabelVariable=unset-name-fallback                                                                                                                                                                                                                                                                                                                 | —                 | fixed gamete framing, boundaries off                                                                                                                                                                                                                                                                                                | "SingleParent" walk: egg-parent Linda (is-donor false, gestationalCarrier true, woman) → sperm-parent (is-donor false, man, NO name) → hasOtherParents false → no partnership → hasPartner false → finalize                                                                                                                                                                                                                                                                                        | `getNetworkState()`: the unnamed sperm-parent node's `attributes[nodeLabelVariable]` is `undefined` or empty string (name left blank, matching the wizard's "unknown/absent parent" path); Linda's node `attributes[nodeLabelVariable] === 'Linda'`; both parent nodes still get `type === nodeType.id` and a `relationshipVariable === 'Parent'` despite one being unnamed                                                                                                                                                                                                                                                                                                               |

---

### Fully-coded scenarios

```ts
// e2e/matrix/family-pedigree.scenarios.ts
import path from 'node:path';

import { SyntheticInterview } from '@codaco/protocol-utilities';
import { entityAttributesProperty } from '@codaco/shared-consts';

import { expect } from '../fixtures/matrix-test.js';
import type { InterfaceScenarios } from './types.js';

const DEV_PROTOCOL_ASSETS = path.resolve(
  import.meta.dirname,
  '../../../development-protocol/assets',
);

function buildBaseFamilyPedigree(si: SyntheticInterview) {
  const nodeType = si.addNodeType({
    name: 'Person',
    shape: { default: 'diamond' },
  });
  const nameVar = nodeType.addVariable({
    name: 'Name',
    type: 'text',
    component: 'Text',
  });
  const isEgoVar = nodeType.addVariable({ name: 'Is Ego', type: 'boolean' });
  const relToEgoVar = nodeType.addVariable({
    name: 'Relationship to Ego',
    type: 'text',
  });
  const bioSexVar = nodeType.addVariable({
    name: 'Biological Sex',
    type: 'text',
  });

  const edgeType = si.addEdgeType({ name: 'Family' });
  const relTypeVar = edgeType.addVariable({
    name: 'Relationship',
    type: 'categorical',
    options: [
      { label: 'Biological Parent', value: 'biological' },
      { label: 'Social Parent', value: 'social' },
      { label: 'Donor', value: 'donor' },
      { label: 'Surrogate', value: 'surrogate' },
      { label: 'Adoptive', value: 'adoptive' },
      { label: 'Partner', value: 'partner' },
    ],
  });
  const isActiveVar = edgeType.addVariable({
    name: 'Is Active',
    type: 'boolean',
  });
  const isGestCarrierVar = edgeType.addVariable({
    name: 'Is Gestational Carrier',
    type: 'boolean',
  });
  const gameteRoleVar = edgeType.addVariable({
    name: 'Gamete Role',
    type: 'categorical',
    options: [
      { label: 'Egg', value: 'egg' },
      { label: 'Sperm', value: 'sperm' },
    ],
  });

  return {
    nodeType,
    nameVar,
    isEgoVar,
    relToEgoVar,
    bioSexVar,
    edgeType,
    relTypeVar,
    isActiveVar,
    isGestCarrierVar,
    gameteRoleVar,
  };
}

export const familyPedigreeScenarios: InterfaceScenarios = {
  interfaceType: 'FamilyPedigree',
  scenarios: [
    {
      id: 'smoke-nuclear-family',
      covers: [
        'label',
        'interviewScript',
        'nodeConfig.type',
        'nodeConfig.nodeLabelVariable',
        'nodeConfig.egoVariable',
        'nodeConfig.biologicalSexVariable',
        'edgeConfig.type',
        'edgeConfig.relationshipTypeVariable',
        'edgeConfig.gameteRoleVariable',
        'edgeConfig.isGestationalCarrierVariable',
        'framing=fixed(gamete)',
        'censusPrompt',
        'nominationPrompts=absent',
        'boundaries.requireGrandparents=off',
      ],
      smoke: true,
      visual: true,
      build: () => {
        const si = new SyntheticInterview();
        const {
          nodeType,
          nameVar,
          isEgoVar,
          relToEgoVar,
          bioSexVar,
          edgeType,
          relTypeVar,
          isActiveVar,
          isGestCarrierVar,
          gameteRoleVar,
        } = buildBaseFamilyPedigree(si);

        si.addStage('FamilyPedigree', {
          label: 'INTERNAL: Do Not Show This',
          interviewScript:
            'Author-only note: walk the participant through the quick-start wizard.',
          subject: { entity: 'node', type: nodeType.id },
          framing: { mode: 'fixed', value: 'gamete' },
          boundaries: {
            requireGrandparents: 'off',
            requireChildrenContributors: 'off',
          },
          nodeConfig: {
            type: nodeType.id,
            nodeLabelVariable: nameVar.id,
            egoVariable: isEgoVar.id,
            relationshipVariable: relToEgoVar.id,
            biologicalSexVariable: bioSexVar.id,
            form: [],
          },
          edgeConfig: {
            type: edgeType.id,
            relationshipTypeVariable: relTypeVar.id,
            isActiveVariable: isActiveVar.id,
            isGestationalCarrierVariable: isGestCarrierVar.id,
            gameteRoleVariable: gameteRoleVar.id,
          },
          censusPrompt: 'Please build your family pedigree.',
        });

        return si;
      },
      run: async ({ page, interview, stage, protocol }) => {
        // censusPrompt renders at the build phase, before the wizard opens.
        await expect(
          stage.getPrompt('Please build your family pedigree.'),
        ).toBeVisible();

        // Dead config: label/interviewScript never reach the DOM.
        await expect(page.getByText('INTERNAL: Do Not Show This')).toHaveCount(
          0,
        );
        await expect(
          page.getByText('Author-only note: walk the participant through'),
        ).toHaveCount(0);

        const fp = stage.familyPedigree;
        await fp.clickGetStarted();
        await fp.selectEgoSex();

        await fp.setField('egg-parent.is-donor', false);
        await fp.setField('egg-parent.name', 'Linda');
        await fp.setField('egg-parent.gestationalCarrier', true);
        await fp.setField('egg-parent.gender_identity', 'woman');
        await fp.clickWizardNext();

        await fp.setField('sperm-parent.is-donor', false);
        await fp.setField('sperm-parent.name', 'Robert');
        await fp.setField('sperm-parent.gender_identity', 'man');
        await fp.clickWizardNext();

        await fp.setField('hasOtherParents', false);
        await fp.clickWizardNext();

        await fp.setPartnership('egg-parent', 'Robert', 'current');
        await fp.clickWizardNext();

        await fp.setField('hasPartner', false);
        await fp.clickWizardNext();

        // requireGrandparents:'off' — the boundary item never renders.
        await expect(fp.checklistItem('boundary-grandparents')).toHaveCount(0);

        await interview.nextButton.click();
        await expect(
          fp.dialog.getByText('Finalize your family pedigree?'),
        ).toBeVisible();
        await fp.dialog.getByRole('button', { name: 'Finalize' }).click();

        const network = await protocol.getNetworkState(interview.interviewId);
        expect(network.nodes.every((n) => n.type === nodeType.id)).toBe(true);
        expect(network.edges.every((e) => e.type === edgeType.id)).toBe(true);

        const linda = network.nodes.find(
          (n) => n[entityAttributesProperty][nameVar.id] === 'Linda',
        );
        expect(linda?.[entityAttributesProperty][bioSexVar.id]).toEqual([
          'female',
        ]);
        expect(linda?.[entityAttributesProperty][isEgoVar.id]).not.toBe(true);

        const ego = network.nodes.find(
          (n) => n[entityAttributesProperty][isEgoVar.id] === true,
        );
        expect(
          network.nodes.filter(
            (n) => n[entityAttributesProperty][isEgoVar.id] === true,
          ),
        ).toHaveLength(1);

        const eggEdge = network.edges.find(
          (e) => e.from === linda?.id && e.to === ego?.id,
        );
        expect(eggEdge?.[entityAttributesProperty][gameteRoleVar.id]).toEqual([
          'egg',
        ]);
        expect(eggEdge?.[entityAttributesProperty][isGestCarrierVar.id]).toBe(
          true,
        );

        const robert = network.nodes.find(
          (n) => n[entityAttributesProperty][nameVar.id] === 'Robert',
        );
        expect(robert?.[entityAttributesProperty][bioSexVar.id]).toEqual([
          'male',
        ]);
        const spermEdge = network.edges.find(
          (e) => e.from === robert?.id && e.to === ego?.id,
        );
        expect(spermEdge?.[entityAttributesProperty][gameteRoleVar.id]).toEqual(
          ['sperm'],
        );
      },
    },

    {
      id: 'intro-screen-asset-image',
      covers: ['introScreen', 'introScreen.items[].type=asset'],
      visual: true,
      build: () => {
        const si = new SyntheticInterview();
        const {
          nodeType,
          nameVar,
          isEgoVar,
          relToEgoVar,
          bioSexVar,
          edgeType,
          relTypeVar,
          isActiveVar,
          isGestCarrierVar,
          gameteRoleVar,
        } = buildBaseFamilyPedigree(si);

        si.addAsset({
          id: 'img-1',
          name: 'quadrant',
          type: 'image',
          source: 'quadrant.png',
        });

        si.addStage('FamilyPedigree', {
          subject: { entity: 'node', type: nodeType.id },
          framing: { mode: 'fixed', value: 'gamete' },
          boundaries: {
            requireGrandparents: 'off',
            requireChildrenContributors: 'off',
          },
          nodeConfig: {
            type: nodeType.id,
            nodeLabelVariable: nameVar.id,
            egoVariable: isEgoVar.id,
            relationshipVariable: relToEgoVar.id,
            biologicalSexVariable: bioSexVar.id,
            form: [],
          },
          edgeConfig: {
            type: edgeType.id,
            relationshipTypeVariable: relTypeVar.id,
            isActiveVariable: isActiveVar.id,
            isGestationalCarrierVariable: isGestCarrierVar.id,
            gameteRoleVariable: gameteRoleVar.id,
          },
          censusPrompt: 'Please build your family pedigree.',
          introScreen: {
            items: [
              { id: 'intro-image', type: 'asset', content: 'img-1' },
              {
                id: 'intro-heading',
                type: 'text',
                content: '# Disallowed heading\n\nAn allowed paragraph.',
              },
            ],
          },
        });

        return si;
      },
      assets: [
        {
          assetId: 'img-1',
          name: 'quadrant',
          type: 'image',
          source: 'quadrant.png',
          localPath: path.join(DEV_PROTOCOL_ASSETS, 'quadrant.png'),
        },
      ],
      run: async ({ page, stage }) => {
        await stage.familyPedigree.clickGetStarted();

        const img = stage.familyPedigree.dialog.locator(
          'img[src*="quadrant.png"]',
        );
        await expect(img).toBeVisible();
        await expect
          .poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth))
          .toBeGreaterThan(0);

        // h1 is not in IntroStep's INTRO_ALLOWED_TAGS (IntroStep.tsx:11-23) —
        // the markdown heading must not render as an <h1>.
        await expect(stage.familyPedigree.dialog.locator('h1')).toHaveCount(0);
        await expect(
          stage.familyPedigree.dialog.getByText('An allowed paragraph.'),
        ).toBeVisible();
      },
    },

    {
      id: 'nomination-prompts-sequential-toggle',
      covers: [
        'nominationPrompts[].text',
        'nominationPrompts[].variable',
        'nominationPrompts[].id',
      ],
      build: () => {
        const si = new SyntheticInterview();
        const {
          nodeType,
          nameVar,
          isEgoVar,
          relToEgoVar,
          bioSexVar,
          edgeType,
          relTypeVar,
          isActiveVar,
          isGestCarrierVar,
          gameteRoleVar,
        } = buildBaseFamilyPedigree(si);
        const diseaseVar = nodeType.addVariable({
          name: 'Has Disease',
          type: 'boolean',
        });
        const diabetesVar = nodeType.addVariable({
          name: 'Has Diabetes',
          type: 'boolean',
        });

        si.addStage('FamilyPedigree', {
          subject: { entity: 'node', type: nodeType.id },
          framing: { mode: 'fixed', value: 'gamete' },
          boundaries: {
            requireGrandparents: 'off',
            requireChildrenContributors: 'off',
          },
          nodeConfig: {
            type: nodeType.id,
            nodeLabelVariable: nameVar.id,
            egoVariable: isEgoVar.id,
            relationshipVariable: relToEgoVar.id,
            biologicalSexVariable: bioSexVar.id,
            form: [],
          },
          edgeConfig: {
            type: edgeType.id,
            relationshipTypeVariable: relTypeVar.id,
            isActiveVariable: isActiveVar.id,
            isGestationalCarrierVariable: isGestCarrierVar.id,
            gameteRoleVariable: gameteRoleVar.id,
          },
          censusPrompt: 'Please build your family pedigree.',
          nominationPrompts: [
            {
              id: '1',
              text: 'Please nominate any family members who have been diagnosed with breast cancer.',
              variable: diseaseVar.id,
            },
            {
              id: '2',
              text: 'Please nominate any family members who have been diagnosed with type 2 diabetes.',
              variable: diabetesVar.id,
            },
          ],
        });

        si.addInformationStage({
          title: 'Complete',
          text: 'After the main stage.',
        });

        // nominationPrompts[].id is claimed here as a dead-config assertion:
        // the reserved id 'scaffolding' collision is rejected by
        // familyPedigreeStage.safeParse at protocol-parse time
        // (packages/protocol-validation/src/schemas/8/stages/family-pedigree.ts:128-136),
        // never reachable at interview runtime, so it is covered by a
        // protocol-validation unit test, not here.

        return si;
      },
      run: async ({ page, interview, stage }) => {
        const fp = stage.familyPedigree;
        await fp.clickGetStarted();
        await fp.selectEgoSex();

        await fp.setField('egg-parent.is-donor', false);
        await fp.setField('egg-parent.name', 'Linda');
        await fp.setField('egg-parent.gestationalCarrier', true);
        await fp.setField('egg-parent.gender_identity', 'woman');
        await fp.clickWizardNext();

        await fp.setField('sperm-parent.is-donor', false);
        await fp.setField('sperm-parent.name', 'Robert');
        await fp.setField('sperm-parent.gender_identity', 'man');
        await fp.clickWizardNext();

        await fp.setField('hasOtherParents', false);
        await fp.clickWizardNext();

        await fp.setPartnership('egg-parent', 'Robert', 'current');
        await fp.clickWizardNext();

        await fp.setField('hasPartner', false);
        await fp.clickWizardNext();

        await interview.nextButton.click();
        await expect(
          fp.dialog.getByText('Finalize your family pedigree?'),
        ).toBeVisible();
        await fp.dialog.getByRole('button', { name: 'Finalize' }).click();

        // First nomination prompt (breast cancer): nominate Linda, then
        // un-nominate her (round-trip toggle).
        await expect(
          stage.getPrompt(/diagnosed with breast cancer/i),
        ).toBeVisible();
        await fp.node('Linda').click();
        await expect(fp.node('Linda')).toHaveAttribute('aria-pressed', 'true');
        await fp.node('Linda').click();
        await expect(fp.node('Linda')).toHaveAttribute('aria-pressed', 'false');
        await fp.node('Linda').click();
        await expect(fp.node('Linda')).toHaveAttribute('aria-pressed', 'true');

        // Advance to the second nomination prompt (diabetes): nominate Robert.
        await interview.nextButton.click();
        await expect(
          stage.getPrompt(/diagnosed with type 2 diabetes/i),
        ).toBeVisible();
        await fp.node('Robert').click();
        await expect(fp.node('Robert')).toHaveAttribute('aria-pressed', 'true');

        // Last prompt advances out of the stage entirely.
        await interview.nextButton.click();
        await expect(page.getByText('After the main stage.')).toBeVisible();
      },
    },

    {
      id: 'surrogate-two-donors-gestational-carrier',
      covers: [
        'edgeConfig.isGestationalCarrierVariable=true-surrogate',
        'edgeConfig.gameteRoleVariable=donor-both',
      ],
      build: () => {
        const si = new SyntheticInterview();
        const {
          nodeType,
          nameVar,
          isEgoVar,
          relToEgoVar,
          bioSexVar,
          edgeType,
          relTypeVar,
          isActiveVar,
          isGestCarrierVar,
          gameteRoleVar,
        } = buildBaseFamilyPedigree(si);

        si.addStage('FamilyPedigree', {
          subject: { entity: 'node', type: nodeType.id },
          framing: { mode: 'fixed', value: 'gamete' },
          boundaries: {
            requireGrandparents: 'off',
            requireChildrenContributors: 'off',
          },
          nodeConfig: {
            type: nodeType.id,
            nodeLabelVariable: nameVar.id,
            egoVariable: isEgoVar.id,
            relationshipVariable: relToEgoVar.id,
            biologicalSexVariable: bioSexVar.id,
            form: [],
          },
          edgeConfig: {
            type: edgeType.id,
            relationshipTypeVariable: relTypeVar.id,
            isActiveVariable: isActiveVar.id,
            isGestationalCarrierVariable: isGestCarrierVar.id,
            gameteRoleVariable: gameteRoleVar.id,
          },
          censusPrompt: 'Please build your family pedigree.',
        });

        return si;
      },
      run: async ({ interview, stage, protocol }) => {
        const fp = stage.familyPedigree;
        await fp.clickGetStarted();
        await fp.selectEgoSex();

        // Egg donor: no name given (an unnamed donor, mirroring the
        // single-parent-absent-second-parent scenario's unnamed-parent path);
        // gestationalCarrier is false because a separate carrier ("Mum")
        // carried the pregnancy.
        await fp.setField('egg-parent.is-donor', true);
        await fp.setField('egg-parent.gestationalCarrier', false);
        await fp.setField('egg-parent.gender_identity', 'woman');
        await fp.clickWizardNext();

        // GestationalCarrierStep only renders when the egg parent did not
        // carry the pregnancy (egg-parent.gestationalCarrier === false).
        await fp.setField('gestational-carrier.name', 'Mum');
        await fp.setField('gestational-carrier.gender_identity', 'woman');
        await fp.clickWizardNext();

        // Sperm donor: also unnamed.
        await fp.setField('sperm-parent.is-donor', true);
        await fp.setField('sperm-parent.gender_identity', 'man');
        await fp.clickWizardNext();

        await fp.setField('hasOtherParents', false);
        await fp.clickWizardNext();

        // No partnership changes: accept the matrix defaults.
        await fp.clickWizardNext();

        await fp.setField('hasPartner', false);
        await fp.clickWizardNext();

        await interview.nextButton.click();
        await expect(
          fp.dialog.getByText('Finalize your family pedigree?'),
        ).toBeVisible();
        await fp.dialog.getByRole('button', { name: 'Finalize' }).click();

        const network = await protocol.getNetworkState(interview.interviewId);
        const ego = network.nodes.find(
          (n) => n[entityAttributesProperty][isEgoVar.id] === true,
        );

        const eggEdge = network.edges.find(
          (e) =>
            e.to === ego?.id &&
            e[entityAttributesProperty][gameteRoleVar.id]?.[0] === 'egg',
        );
        expect(eggEdge?.[entityAttributesProperty][gameteRoleVar.id]).toEqual([
          'egg',
        ]);
        expect(eggEdge?.[entityAttributesProperty][isGestCarrierVar.id]).toBe(
          false,
        );

        const carrierEdge = network.edges.find(
          (e) =>
            e.to === ego?.id &&
            e[entityAttributesProperty][isGestCarrierVar.id] === true,
        );
        expect(
          carrierEdge?.[entityAttributesProperty][gameteRoleVar.id],
        ).toBeUndefined();

        const spermEdge = network.edges.find(
          (e) =>
            e.to === ego?.id &&
            e[entityAttributesProperty][gameteRoleVar.id]?.[0] === 'sperm',
        );
        expect(spermEdge?.[entityAttributesProperty][gameteRoleVar.id]).toEqual(
          ['sperm'],
        );

        const eggParentNode = network.nodes.find((n) => n.id === eggEdge?.from);
        const carrierNode = network.nodes.find(
          (n) => n.id === carrierEdge?.from,
        );
        expect(eggParentNode?.[entityAttributesProperty][bioSexVar.id]).toEqual(
          ['female'],
        );
        expect(carrierNode?.[entityAttributesProperty][bioSexVar.id]).toEqual([
          'female',
        ]);
      },
    },

    {
      id: 'boundaries-children-contributors-required',
      covers: ['boundaries.requireChildrenContributors=required'],
      build: () => {
        const si = new SyntheticInterview();
        const {
          nodeType,
          nameVar,
          isEgoVar,
          relToEgoVar,
          bioSexVar,
          edgeType,
          relTypeVar,
          isActiveVar,
          isGestCarrierVar,
          gameteRoleVar,
        } = buildBaseFamilyPedigree(si);

        si.addStage('FamilyPedigree', {
          subject: { entity: 'node', type: nodeType.id },
          framing: { mode: 'fixed', value: 'gamete' },
          boundaries: {
            requireGrandparents: 'off',
            requireChildrenContributors: 'required',
          },
          nodeConfig: {
            type: nodeType.id,
            nodeLabelVariable: nameVar.id,
            egoVariable: isEgoVar.id,
            relationshipVariable: relToEgoVar.id,
            biologicalSexVariable: bioSexVar.id,
            form: [],
          },
          edgeConfig: {
            type: edgeType.id,
            relationshipTypeVariable: relTypeVar.id,
            isActiveVariable: isActiveVar.id,
            isGestationalCarrierVariable: isGestCarrierVar.id,
            gameteRoleVariable: gameteRoleVar.id,
          },
          censusPrompt: 'Please build your family pedigree.',
        });

        return si;
      },
      run: async ({ interview, stage, protocol }) => {
        const fp = stage.familyPedigree;
        await fp.clickGetStarted();
        await fp.selectEgoSex();

        // Minimal wizard walk through the parent steps (no names, matching
        // the boundaries-grandparents-required-blocked scenario's minimal walk).
        await fp.setField('egg-parent.is-donor', false);
        await fp.setField('egg-parent.gestationalCarrier', true);
        await fp.clickWizardNext();

        await fp.setField('sperm-parent.is-donor', false);
        await fp.clickWizardNext();

        await fp.setField('hasOtherParents', false);
        await fp.clickWizardNext();

        // No partnership changes: accept the matrix defaults.
        await fp.clickWizardNext();

        await fp.setField('hasPartner', true);
        await fp.setField('partner.name', 'Jennifer');
        await fp.setField('partner.biologicalSex', 'female');
        await fp.setField('partner.gender_identity', 'woman');
        await fp.setField('childrenWithPartnerCount', 1);
        await fp.clickWizardNext();

        await fp.setField('childWithPartner[0].name', 'Daniel');
        await fp.setField('childWithPartner[0].biologicalSex', 'male');
        await fp.setField('childWithPartner[0].gender_identity', 'man');
        await fp.clickWizardNext();

        // Jennifer's own parents are unrecorded, so the co-parent boundary
        // is required and unmet.
        await expect(
          fp.checklistItem('boundary-children-contributors'),
        ).toHaveAttribute('data-required', 'true');

        await interview.nextButton.click();
        await expect(
          fp.dialog.getByText(/pedigree is incomplete/i),
        ).toBeVisible();
        await fp.clickDialogPrimary();

        // Manually satisfy the boundary and finalize.
        await fp.toggleChecklistItem('boundary-children-contributors');
        await expect(fp.finalizeChecklistButton).toBeVisible();
        await fp.finalizeChecklistButton.click();
        await expect(
          fp.dialog.getByText('Finalize your family pedigree?'),
        ).toBeVisible();
        await fp.dialog.getByRole('button', { name: 'Finalize' }).click();

        const network = await protocol.getNetworkState(interview.interviewId);
        expect(network.nodes).toHaveLength(5);
      },
    },

    // Remaining 8 scenarios (framing-fixed-gendered, framing-participant-choice-with-intro,
    // relationship-form-fields-and-active-partner-edge, boundaries-grandparents-required-blocked,
    // boundaries-grandparents-recommended-nudge, adoptive-relationship-edge-styling,
    // blended-family-step-parent-relationship-type, single-parent-absent-second-parent)
    // follow the scenario-table rows above 1:1: same `buildBaseFamilyPedigree` scaffold,
    // one `addStage('FamilyPedigree', {...})` per the table's "protocol config" column, and a
    // `run()` built from the table's "interaction"/"functional assertions" columns using the
    // same `stage.familyPedigree` fixture calls shown in the scenarios above.
  ],
};
```

```ts
// e2e/specs/matrix/family-pedigree.spec.ts
import { familyPedigreeScenarios } from '../../matrix/family-pedigree.scenarios.js';
import { defineScenarioTests } from '../../matrix/run-scenario.js';

defineScenarioTests(familyPedigreeScenarios);
```

- [ ] **Step 2: Write the registry + inventory entry + spec file** — write `e2e/matrix/family-pedigree.scenarios.ts` with all 13 scenarios (5 fully coded above; the other 8 built directly from the scenario table's columns, following the same `stage.familyPedigree` fixture-call shape), `e2e/specs/matrix/family-pedigree.spec.ts` as shown, and append the `FamilyPedigree` entry to `OPTION_INVENTORY` in `e2e/matrix/option-inventory.ts`. Import `familyPedigreeScenarios` into `ALL_SUITES` in `e2e/matrix/coverage-manifest.test.ts` (and into `e2e/matrix/all-scenarios.ts` if that aggregator has landed by the time this task runs).

- [ ] **Step 3: Run the coverage manifest**: `pnpm --filter @codaco/interview exec vitest run e2e/matrix` — Expected: PASS (every `FamilyPedigree` inventory key, including `skipLogic`, is claimed — `skipLogic` by Task 26's shared-suite claim, everything else by the 13 scenarios above).

- [ ] **Step 4: Run the scenarios**: `pnpm --filter @codaco/interview test:e2e:headed -- --project=chromium-matrix --grep "FamilyPedigree"` — Expected: PASS; commit new `e2e/aria-snapshots/chromium/family-pedigree-*.aria.yml` baselines (one `-initial`/`-final` pair per scenario).

- [ ] **Step 5: Typecheck + commit** with message `test(interview-e2e): FamilyPedigree configuration matrix`

### Task 24: NarrativePedigree matrix scenarios

**Files:**

- Create: `e2e/matrix/narrative-pedigree.scenarios.ts`
- Create: `e2e/specs/matrix/narrative-pedigree.spec.ts`
- Modify: `e2e/matrix/option-inventory.ts` (add the `NarrativePedigree` entry — full code below)
- Modify: `e2e/matrix/coverage-manifest.test.ts` (append `narrativePedigreeScenarios` to `ALL_SUITES`)

**Interfaces:**

- Consumes: `ScenarioDefinition`/`InterfaceScenarios`/`defineScenarioTests` (Task 6), `SyntheticInterview` builder (Task 1), seeded interviews via `ctx.protocol.createInterview`/`installPayload` (Task 3), `buildSyntheticPayload` (Task 2, imported directly by one scenario to hand-construct a schema-bypassing payload — see scenario 9 below).
- Produces: `narrativePedigreeScenarios: InterfaceScenarios` (`interfaceType: 'NarrativePedigree'`).
- This task uses the canonical `ScenarioDefinition.stageMetadata` field (Task 6) — no contract extension needed.

No new stage-fixture helper is required: NarrativePedigree is read-only and every interaction (condition-select buttons, zoom buttons, Save-snapshot, focal click) is driven directly through `page`/`interview` in each scenario's `run()` — there is no dedicated `stage.narrativePedigree` sub-fixture to author.

**Locators used (all cited against the interface source):**

- `[data-narrative-pedigree-view]` — scroll viewport root (`components/ZoomableViewport.tsx:160`)
- `[data-testid="np-zoom-content"][data-zoom-level]` — zoom state (`components/ZoomableViewport.tsx:174-175`)
- `[data-pedigree-member="true"]`, `[data-node-id]`, `[data-dimmed]` — per-person container (`components/NarrativePedigreeView.tsx:410-413`)
- `[data-notation-status=<status>]` — single-condition glyph, only rendered once a condition is selected (`components/Sticker.tsx:62-65`, consumed via `nodeMode="single"` at `components/NarrativePedigreeView.tsx:465-470`)
- `[data-question-mark]`, `[data-hatch-fill]`, `[data-vertical-line]`, `[data-filled-shape]`, `[data-status]` — glyph internals (`components/StatusMarker.tsx:113,142,185,214,287,296`)
- Condition key: `aside[aria-label="Condition key"]` (`components/ConditionPanel.tsx:59`), heading `Key` (61-65), per-disease `<button aria-pressed>` with visible text = `disease.label` (79-98), swatch `span[aria-hidden]` with inline `backgroundColor` (91-95)
- `NotationKey` rows: plain text `'Has this condition'`/`'Will develop this condition'`/`'Carries this condition'`/`'May develop this condition'`/`'May carry this condition'`/`'Not known'` (`components/NotationKey.tsx:21-30`)
- Save snapshot: `button` named `'Save snapshot'` (`components/ConditionPanel.tsx:117-126`)
- Zoom toolbar: buttons named `'Zoom out'`/`'Zoom in'`/`'Reset zoom'` (`components/ZoomableViewport.tsx:131-153`), toolbar labelled `'Zoom controls'` (passed by `NarrativePedigreeView.tsx:634`)
- Focal container: `role="button"` with `aria-label="Focus on <label>"` (or `'Focus on You'` for ego), `aria-disabled` when no condition selected (`components/NarrativePedigreeView.tsx:392-407`)
- `'Clear focus'` button (`components/NarrativePedigreeView.tsx:654-670`)
- aria-live region text: `'Showing all conditions'` / `'Showing <label>'` / `. Focused on <label>. Showing who contributes to their inheritance.` (`components/NarrativePedigreeView.tsx:584-593`)
- Misconfigured fallback: `page.getByText('This stage references a family pedigree that could not be found.')` (`components/NarrativePedigreeView.tsx:552-554`)

---

### Option inventory entry

```ts
// e2e/matrix/option-inventory.ts — append to OPTION_INVENTORY
NarrativePedigree: [
  'type',
  'id',
  'label',
  'interviewScript',
  'skipLogic',
  'sourceStageId',
  'sourceStageId.membershipScoping',
  'sourceStageId.misconfigured',
  'showAtRiskStatuses=false',
  'showAtRiskStatuses=true',
  'diseases',
  'diseases[].id',
  'diseases[].label',
  'diseases[].color',
  'diseases[].variable',
  'diseases[].inheritancePattern=autosomalDominant',
  'diseases[].inheritancePattern=autosomalRecessive',
  'diseases[].inheritancePattern=xLinkedRecessive',
  'diseases[].inheritancePattern=xLinkedDominant',
  'diseases[].inheritancePattern=yLinked',
  'diseases[].inheritancePattern=mitochondrial',
  'diseases[].inheritancePattern=multifactorial',
  'diseases[].inheritancePattern=unknown',
  'focalHighlighting',
  'focalAffordanceDisabled',
  'zoomControls',
  'saveSnapshot',
  'readOnlyInvariant',
],
```

`skipLogic` is claimed by Task 26's shared cross-cutting suite (`sharedSuiteClaims` gains `'NarrativePedigree:skipLogic'` there) — no scenario in this file targets it. There are no `filter`/prompt-level/panel/subject/form/behaviours/background keys for this interface: the schema (`narrative-pedigree.ts:9-37`) defines none.

---

### Scenario table

All scenarios seed a two-stage protocol: stage 0 = `FamilyPedigree` (the source), stage 1 = `NarrativePedigree`. `currentStep: 1`, `seedNetwork: true` unless noted. Every scenario's `Person` node type uses the same dynamic-shape codebook shown in scenario 1's full code (male→square, female→circle, other→diamond) and the same `Family` edge type (`relType` categorical `biological`/`partner`, `isActive` boolean, `isGestationalCarrier` boolean, `gameteRole` text) — this is the minimum shape `resolveSex`/`buildGeneticGraph` need (`components/NarrativePedigreeView.tsx:176-198`).

| id                                                      | covers                                                                                                                                                                            | flags                                                          | protocol config                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | interaction                                                                                                                                                                                                                                 | assertions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `default-all-conditions-happy-path`                     | type, id, label, interviewScript, sourceStageId, sourceStageId.membershipScoping, diseases                                                                                        | `smoke`, `visual`                                              | 3-person trio (mother/father/ego), 2 diseases (AD + AR, both `showAtRiskStatuses` default `false`), `interviewScript: 'Explain the pedigree to the participant.'`, stage `label: 'Inheritance Pathways'`; no `stageMetadata` (no committed membership)                                                                                                                                                                                                                                                                         | none — assert initial render only                                                                                                                                                                                                           | aside `aria-label="Condition key"` visible; 3 `[data-pedigree-member="true"]`; ego's focal container `aria-label="Focus on You"`; aria-live text `'Showing all conditions'`; no `[data-notation-status]` anywhere (plain nodes); `page.getByText('Explain the pedigree to the participant.')` has count 0 (interviewScript dead-config); `page.getByText('Inheritance Pathways')` has count 0 (label not an on-screen title)                                                                                                                                                                                                                                                                                        |
| `condition-select-toggle-color-variable-focal-disabled` | diseases[].id, diseases[].label, diseases[].color, diseases[].variable, focalAffordanceDisabled, diseases[].inheritancePattern=autosomalDominant                                  | `visual`, `chromiumOnly` (asserts a rendered background-color) | grandparent→parent→ego 3-gen chain, ONE AD disease `color: '#e53e3e'`, `label: "Huntington's Disease"`, only the grandparent's boolean var seeded `true`                                                                                                                                                                                                                                                                                                                                                                       | click the ego node BEFORE selecting a condition (assert no-op); click the AD condition's Key button; click it again to deselect                                                                                                             | Pre-select: ego focal container has `aria-disabled="true"`; clicking it sets no `[data-dimmed="false"]` change. First click: Key button `aria-pressed="true"`; grandparent `[data-node-id]` container shows `[data-notation-status="affected"][data-filled-shape]`; Key swatch `span[aria-hidden]` `background-color: rgb(229, 62, 62)` (`#e53e3e`); aria-live reads `"Showing Huntington's Disease"`. Second click: `aria-pressed="false"` again, `[data-notation-status]` count 0, aria-live back to `'Showing all conditions'`                                                                                                                                                                                   |
| `focal-highlight-clear-focus-readonly`                  | focalHighlighting, readOnlyInvariant                                                                                                                                              | —                                                              | same AD chain as above                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | read `getNetworkState()` before; select the AD condition; click the ego node to focus; click 'Clear focus'; re-select then press `Escape` inside `[data-narrative-pedigree-view]` to clear a second time; re-read `getNetworkState()` after | On focus: `'Clear focus'` button appears; the grandparent (on-lineage ancestor) has `[data-dimmed="false"]`; an unrelated seeded aunt node (added to this pedigree) has `[data-dimmed="true"]`; aria-live appends `'. Focused on You. Showing who contributes to their inheritance.'`. On 'Clear focus' click: button disappears, all members `[data-dimmed="false"]`. On Escape after re-focusing: button disappears again. Final: `getNetworkState()` nodes/edges/ego deep-equal the pre-interaction snapshot (`expect(after).toEqual(before)`)                                                                                                                                                                   |
| `at-risk-statuses-hidden`                               | showAtRiskStatuses=false, diseases[].inheritancePattern=autosomalRecessive                                                                                                        | —                                                              | cousin-union pedigree (two carrier parents both first cousins, one affected child, `showAtRiskStatuses: false`, one AR disease)                                                                                                                                                                                                                                                                                                                                                                                                | select the AR condition                                                                                                                                                                                                                     | affected child `[data-notation-status="affected"]`; both parents `[data-notation-status="obligateCarrier"][data-hatch-fill]`; NO element anywhere has `[data-notation-status="atRiskAffected"]` or `="atRiskCarrier"`; no `[data-question-mark]` in the pedigree; Key list has NO row with text `'May develop this condition'` or `'May carry this condition'`; a downstream at-risk cousin's focal container `aria-describedby` span reads `'…: Status unknown'` (via `page.locator('[id^="np-status-"]')` text content)                                                                                                                                                                                           |
| `at-risk-statuses-shown`                                | showAtRiskStatuses=true                                                                                                                                                           | `visual`                                                       | identical cousin-union pedigree, `showAtRiskStatuses: true`                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | select the AR condition                                                                                                                                                                                                                     | the same downstream at-risk cousin now has `[data-notation-status="atRiskCarrier"][data-question-mark]`; Key DOES list `'May develop this condition'` and `'May carry this condition'`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `sex-linked-and-mitochondrial-patterns`                 | diseases[].inheritancePattern=xLinkedRecessive, diseases[].inheritancePattern=xLinkedDominant, diseases[].inheritancePattern=yLinked, diseases[].inheritancePattern=mitochondrial | `slow`                                                         | one integrated pedigree with 4 diseases (XLR haemophilia via affected maternal uncle → obligate-carrier mother; XLD hypophosphataemia via affected father → all daughters; Y-linked hearing loss via paternal-line grandfather→father→son; mitochondrial myopathy via maternal-line great-grandmother), `showAtRiskStatuses: true`                                                                                                                                                                                             | select XLR, assert, deselect; select XLD, assert, deselect; select Y-linked, assert, deselect; select mitochondrial, assert                                                                                                                 | XLR: affected uncle `[data-notation-status="affected"]`; his mother `[data-notation-status="obligateCarrier"]`; focusing ego's son highlights only the maternal-line ancestors (`[data-dimmed="false"]`), paternal-line grandfather stays `[data-dimmed="true"]`. XLD: every daughter of the affected father shows `[data-notation-status]` ≠ `'unknown'`; a son of the same father shows `'unknown'`. Y-linked: only males down the paternal line carry a non-unknown status; a daughter is `'unknown'`; focusing the grandson highlights only father→son edges. Mitochondrial: focusing a maternal-line descendant highlights only the female-parent chain; a paternal-line relative stays `[data-dimmed="true"]` |
| `multifactorial-and-unknown-patterns`                   | diseases[].inheritancePattern=multifactorial, diseases[].inheritancePattern=unknown                                                                                               | —                                                              | 5-person pedigree, one `multifactorial` disease with 2 nodes seeded `true`, one `unknown`-pattern disease with 1 node seeded `true`; the other 2 nodes false for both                                                                                                                                                                                                                                                                                                                                                          | select the multifactorial condition; then select the unknown condition                                                                                                                                                                      | Multifactorial: exactly 2 `[data-notation-status="affected"]`, the other 3 members `[data-notation-status="unknown"]` — NO `obligateCarrier`/`atRiskAffected`/`atRiskCarrier` anywhere (no inference). Unknown: exactly 1 `[data-notation-status="affected"]`, the other 4 `'unknown'`                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `membership-scoping-committed`                          | sourceStageId.membershipScoping                                                                                                                                                   | —                                                              | 3-person pedigree (mother/father/ego) of node type `Person`; PLUS one extra `Person`-typed node `'outsider'` seeded via `addManualNode` with no family edges; `stageMetadata: { 0: { isNetworkCommitted: true, nodes: [{id:'mother',label:'Mother',isEgo:false},{id:'father',label:'Father',isEgo:false},{id:'ego',label:'You',isEgo:true}] } }` (stage-index-keyed, per `NarrativePedigreeView.tsx:108-114`'s `stages.findIndex`)                                                                                             | none                                                                                                                                                                                                                                        | exactly 3 `[data-pedigree-member="true"]`; `page.locator('[data-node-id="outsider"]')` has count 0 (excluded by committed membership, even though it shares the pedigree's node type)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `misconfigured-source-stage-id`                         | sourceStageId.misconfigured                                                                                                                                                       | —                                                              | `build()` returns a normally VALID 3-person pedigree (so `installScenario`'s own schema-checked install succeeds); `run()` then hand-constructs a SECOND payload via `buildSyntheticPayload` with the NarrativePedigree stage's `sourceStageId` rewritten to `'does-not-exist'` AFTER validation (bypassing `CurrentProtocolSchema`'s cross-reference check, which would reject an unresolvable `sourceStageId` at build time) and installs it directly via `window.__test.installProtocol`, reusing the same `currentStep: 1` | re-navigate to the corrupted interview                                                                                                                                                                                                      | `page.getByText('This stage references a family pedigree that could not be found.')` visible; `[data-pedigree-member="true"]` count 0                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `zoom-controls-save-snapshot-readonly`                  | zoomControls, saveSnapshot, label, readOnlyInvariant                                                                                                                              | `chromiumOnly` (download handling)                             | 3-person pedigree, one disease, stage `label: 'Inheritance Pathways'`                                                                                                                                                                                                                                                                                                                                                                                                                                                          | read `getNetworkState()` before; click `'Zoom in'` twice, then `'Zoom out'` once, then `'Reset zoom'`; select the condition; click `'Save snapshot'` and await the download                                                                 | `[data-testid="np-zoom-content"]`'s `data-zoom-level` increases above `'1'` after the two zoom-ins, decreases (but stays >1) after the single zoom-out, and returns to exactly `'1'` after Reset; the snapshot download's suggested filename matches `/^inheritance-pathways.*\.png$/i` (slug derived from `label`, per `NarrativePedigreeView.tsx:511-517`); `getNetworkState()` after equals the pre-interaction snapshot (read-only invariant, second scenario asserting it under a different interaction mix)                                                                                                                                                                                                   |

---

### Fully-coded scenarios

```ts
// e2e/matrix/narrative-pedigree.scenarios.ts
import { SyntheticInterview } from '@codaco/protocol-utilities';

import { buildSyntheticPayload } from '../helpers/synthetic-payload.js';
import { expect } from '../fixtures/matrix-test.js';
import type { InterfaceScenarios, ScenarioDefinition } from './types.js';

// Shared codebook shape every scenario needs so `resolveSex`/`buildGeneticGraph`
// can resolve sex and gamete framing (NarrativePedigreeView.tsx:176-198). Ported
// from the interface's own Storybook fixture
// (src/interfaces/NarrativePedigree/comprehensivePedigreeFixture.ts) rather than
// imported from it, so the e2e matrix doesn't depend on app-internal story data.
const NAME_VAR = 'name';
const EGO_VAR = 'isEgo';
const BIO_SEX_VAR = 'biologicalSex';
const REL_TO_EGO_VAR = 'relationshipToEgo';
const REL_TYPE_VAR = 'relType';
const IS_ACTIVE_VAR = 'isActive';
const IS_GEST_VAR = 'isGestationalCarrier';
const GAMETE_ROLE_VAR = 'gameteRole';

type PedigreeScaffold = {
  synth: SyntheticInterview;
  nodeTypeId: string;
  edgeTypeId: string;
  nameVarId: string;
  fpStageId: string;
  /** boolean node-attribute ids per disease, so callers can seed them per-person */
  addDiseaseVar: (id: string) => void;
  person: (uid: string, attrs: Record<string, unknown>) => void;
  bioEdge: (uid: string, from: string, to: string) => void;
  partnerEdge: (uid: string, a: string, b: string) => void;
};

/**
 * Builds the shared Person/Family codebook + a FamilyPedigree source stage
 * (empty census — the pedigree is entirely pre-seeded via addManualNode/Edge, no
 * participant interaction reaches it) on a fresh SyntheticInterview. Callers add
 * their own people, edges, and the NarrativePedigree stage on top.
 */
function scaffoldPedigree(diseaseVarIds: string[]): PedigreeScaffold {
  const synth = new SyntheticInterview();
  const nodeType = synth.addNodeType({
    name: 'Person',
    shape: {
      default: 'circle',
      dynamic: {
        type: 'discrete',
        variable: BIO_SEX_VAR,
        map: [
          { value: 'male', shape: 'square' },
          { value: 'female', shape: 'circle' },
          { value: 'other', shape: 'diamond' },
        ],
      },
    },
  });
  const nameVarId = nodeType.addVariable({ name: NAME_VAR, type: 'text' }).id;
  nodeType.addVariable({ id: EGO_VAR, name: EGO_VAR, type: 'boolean' });
  nodeType.addVariable({ id: BIO_SEX_VAR, name: BIO_SEX_VAR, type: 'text' });
  nodeType.addVariable({
    id: REL_TO_EGO_VAR,
    name: REL_TO_EGO_VAR,
    type: 'text',
  });
  for (const id of diseaseVarIds) {
    nodeType.addVariable({ id, name: id, type: 'boolean' });
  }

  const edgeType = synth.addEdgeType({ name: 'Family' });
  edgeType.addVariable({
    id: REL_TYPE_VAR,
    name: REL_TYPE_VAR,
    type: 'categorical',
    options: [
      { label: 'biological', value: 'biological' },
      { label: 'partner', value: 'partner' },
    ],
  });
  edgeType.addVariable({
    id: IS_ACTIVE_VAR,
    name: IS_ACTIVE_VAR,
    type: 'boolean',
  });
  edgeType.addVariable({ id: IS_GEST_VAR, name: IS_GEST_VAR, type: 'boolean' });
  edgeType.addVariable({
    id: GAMETE_ROLE_VAR,
    name: GAMETE_ROLE_VAR,
    type: 'text',
  });

  const fpStage = synth.addStage('FamilyPedigree', {
    label: 'Family Pedigree',
    framing: { mode: 'fixed', value: 'gamete' },
    boundaries: {
      requireGrandparents: 'off',
      requireChildrenContributors: 'off',
    },
    nodeConfig: {
      type: nodeType.id,
      nodeLabelVariable: nameVarId,
      egoVariable: EGO_VAR,
      relationshipVariable: REL_TO_EGO_VAR,
      biologicalSexVariable: BIO_SEX_VAR,
    },
    edgeConfig: {
      type: edgeType.id,
      relationshipTypeVariable: REL_TYPE_VAR,
      isActiveVariable: IS_ACTIVE_VAR,
      isGestationalCarrierVariable: IS_GEST_VAR,
      gameteRoleVariable: GAMETE_ROLE_VAR,
    },
    censusPrompt: 'Build the family tree.',
  });

  const boolDefaults = Object.fromEntries(
    [EGO_VAR, ...diseaseVarIds].map((v) => [v, false]),
  );

  return {
    synth,
    nodeTypeId: nodeType.id,
    edgeTypeId: edgeType.id,
    nameVarId,
    fpStageId: fpStage.id,
    addDiseaseVar: () => undefined, // vars are declared up-front via diseaseVarIds
    person: (uid, attrs) =>
      synth.addManualNode(fpStage.id, nodeType.id, uid, {
        ...boolDefaults,
        ...attrs,
      }),
    bioEdge: (uid, from, to) =>
      synth.addManualEdge(edgeType.id, uid, from, to, {
        [REL_TYPE_VAR]: ['biological'],
        [IS_ACTIVE_VAR]: true,
      }),
    partnerEdge: (uid, a, b) =>
      synth.addManualEdge(edgeType.id, uid, a, b, {
        [REL_TYPE_VAR]: ['partner'],
        [IS_ACTIVE_VAR]: true,
      }),
  };
}

const HD_VAR = 'hasHuntingtons';

function buildAdScenario(): SyntheticInterview {
  const { synth, nameVarId, fpStageId, person, bioEdge, partnerEdge } =
    scaffoldPedigree([HD_VAR]);
  person('grandparent', {
    [nameVarId]: 'George',
    [BIO_SEX_VAR]: 'male',
    [HD_VAR]: true,
  });
  person('grandparent-partner', {
    [nameVarId]: 'Nancy',
    [BIO_SEX_VAR]: 'female',
  });
  // An unrelated aunt on the OTHER side of the family — never in George's
  // descent line — so the focal scenario has a node that must stay dimmed.
  person('aunt', { [nameVarId]: 'Margaret', [BIO_SEX_VAR]: 'female' });
  person('parent', { [nameVarId]: 'Rose', [BIO_SEX_VAR]: 'female' });
  person('parent-partner', { [nameVarId]: 'David', [BIO_SEX_VAR]: 'male' });
  person('ego', {
    [nameVarId]: 'You',
    [EGO_VAR]: true,
    [BIO_SEX_VAR]: 'female',
  });
  partnerEdge('u1', 'grandparent', 'grandparent-partner');
  bioEdge('b1', 'grandparent', 'parent');
  bioEdge('b2', 'grandparent-partner', 'parent');
  bioEdge('b3', 'grandparent', 'aunt');
  bioEdge('b4', 'grandparent-partner', 'aunt');
  partnerEdge('u2', 'parent', 'parent-partner');
  bioEdge('b5', 'parent', 'ego');
  bioEdge('b6', 'parent-partner', 'ego');

  synth.addStage('NarrativePedigree', {
    label: 'Inheritance Pathways',
    sourceStageId: fpStageId,
    showAtRiskStatuses: false,
    diseases: [
      {
        id: 'hd',
        label: "Huntington's Disease",
        color: '#e53e3e',
        variable: HD_VAR,
        inheritancePattern: 'autosomalDominant',
      },
    ],
  });
  return synth;
}

export const narrativePedigreeScenarios: InterfaceScenarios = {
  interfaceType: 'NarrativePedigree',
  scenarios: [
    {
      id: 'default-all-conditions-happy-path',
      covers: [
        'type',
        'id',
        'label',
        'interviewScript',
        'sourceStageId',
        'sourceStageId.membershipScoping',
        'diseases',
      ],
      smoke: true,
      visual: true,
      currentStep: 1,
      seedNetwork: true,
      build: () => {
        const CF_VAR = 'hasCf';
        const { synth, nameVarId, fpStageId, person, bioEdge } =
          scaffoldPedigree([HD_VAR, CF_VAR]);
        person('mother', { [nameVarId]: 'Rose', [BIO_SEX_VAR]: 'female' });
        person('father', { [nameVarId]: 'David', [BIO_SEX_VAR]: 'male' });
        person('ego', {
          [nameVarId]: 'You',
          [EGO_VAR]: true,
          [BIO_SEX_VAR]: 'female',
        });
        bioEdge('b1', 'mother', 'ego');
        bioEdge('b2', 'father', 'ego');
        synth.addStage('NarrativePedigree', {
          id: 'narrative-pedigree-stage',
          label: 'Inheritance Pathways',
          interviewScript: 'Explain the pedigree to the participant.',
          sourceStageId: fpStageId,
          showAtRiskStatuses: false,
          diseases: [
            {
              id: 'hd',
              label: "Huntington's Disease",
              color: '#e53e3e',
              variable: HD_VAR,
              inheritancePattern: 'autosomalDominant',
            },
            {
              id: 'cf',
              label: 'Cystic Fibrosis',
              color: '#805ad5',
              variable: CF_VAR,
              inheritancePattern: 'autosomalRecessive',
            },
          ],
        });
        return synth;
      },
      run: async ({ page }) => {
        await expect(
          page.locator('aside[aria-label="Condition key"]'),
        ).toBeVisible();
        await expect(page.locator('[data-pedigree-member="true"]')).toHaveCount(
          3,
        );
        await expect(
          page.locator('[role="button"][aria-label="Focus on You"]'),
        ).toBeVisible();
        await expect(page.getByText('Showing all conditions')).toBeVisible();
        await expect(page.locator('[data-notation-status]')).toHaveCount(0);
        // Dead-config guards: neither string is ever rendered.
        await expect(
          page.getByText('Explain the pedigree to the participant.'),
        ).toHaveCount(0);
        await expect(page.getByText('Inheritance Pathways')).toHaveCount(0);
      },
    },
    {
      id: 'condition-select-toggle-color-variable-focal-disabled',
      covers: [
        'diseases[].id',
        'diseases[].label',
        'diseases[].color',
        'diseases[].variable',
        'focalAffordanceDisabled',
        'diseases[].inheritancePattern=autosomalDominant',
      ],
      visual: true,
      chromiumOnly: true,
      currentStep: 1,
      seedNetwork: true,
      build: buildAdScenario,
      run: async ({ page }) => {
        const egoFocal = page.locator(
          '[role="button"][aria-label="Focus on You"]',
        );
        await expect(egoFocal).toHaveAttribute('aria-disabled', 'true');
        await egoFocal.click();
        await expect(page.locator('[data-dimmed="false"]')).toHaveCount(0);

        const conditionButton = page.getByRole('button', {
          name: "Huntington's Disease",
          exact: true,
        });
        await conditionButton.click();
        await expect(conditionButton).toHaveAttribute('aria-pressed', 'true');
        await expect(
          page.locator('[data-node-id="grandparent"] [data-notation-status]'),
        ).toHaveAttribute('data-notation-status', 'affected');
        await expect(
          page.locator('[data-node-id="grandparent"] [data-filled-shape]'),
        ).toHaveCount(1);
        await expect(
          page
            .locator('aside[aria-label="Condition key"] span[aria-hidden]')
            .first(),
        ).toHaveCSS('background-color', 'rgb(229, 62, 62)');
        await expect(
          page.getByText("Showing Huntington's Disease"),
        ).toBeVisible();

        await conditionButton.click();
        await expect(conditionButton).toHaveAttribute('aria-pressed', 'false');
        await expect(page.locator('[data-notation-status]')).toHaveCount(0);
        await expect(page.getByText('Showing all conditions')).toBeVisible();
      },
    },
    {
      id: 'focal-highlight-clear-focus-readonly',
      covers: ['focalHighlighting', 'readOnlyInvariant'],
      currentStep: 1,
      seedNetwork: true,
      build: buildAdScenario,
      run: async ({ page, protocol, interview }) => {
        const before = await protocol.getNetworkState(interview.interviewId);

        await page
          .getByRole('button', { name: "Huntington's Disease", exact: true })
          .click();

        const egoFocal = page.locator(
          '[role="button"][aria-label="Focus on You"]',
        );
        await egoFocal.click();
        await expect(
          page.getByRole('button', { name: 'Clear focus' }),
        ).toBeVisible();
        await expect(
          page.locator('[data-node-id="grandparent"]'),
        ).toHaveAttribute('data-dimmed', 'false');
        await expect(page.locator('[data-node-id="aunt"]')).toHaveAttribute(
          'data-dimmed',
          'true',
        );
        await expect(
          page.getByText(
            'Focused on You. Showing who contributes to their inheritance.',
            { exact: false },
          ),
        ).toBeVisible();

        await page.getByRole('button', { name: 'Clear focus' }).click();
        await expect(
          page.getByRole('button', { name: 'Clear focus' }),
        ).toHaveCount(0);
        await expect(page.locator('[data-dimmed="true"]')).toHaveCount(0);

        await egoFocal.click();
        await page.locator('[data-narrative-pedigree-view]').press('Escape');
        await expect(
          page.getByRole('button', { name: 'Clear focus' }),
        ).toHaveCount(0);

        const after = await protocol.getNetworkState(interview.interviewId);
        expect(after).toEqual(before);
      },
    },
    {
      id: 'sex-linked-and-mitochondrial-patterns',
      covers: [
        'diseases[].inheritancePattern=xLinkedRecessive',
        'diseases[].inheritancePattern=xLinkedDominant',
        'diseases[].inheritancePattern=yLinked',
        'diseases[].inheritancePattern=mitochondrial',
      ],
      slow: true,
      currentStep: 1,
      seedNetwork: true,
      build: (): SyntheticInterview => {
        const HAEMOPHILIA_VAR = 'hasHaemophilia';
        const HYPOPHOSPHATAEMIA_VAR = 'hasHypophosphataemia';
        const HEARING_LOSS_VAR = 'hasHearingLoss';
        const MYOPATHY_VAR = 'hasMyopathy';
        const { synth, nameVarId, fpStageId, person, bioEdge, partnerEdge } =
          scaffoldPedigree([
            HAEMOPHILIA_VAR,
            HYPOPHOSPHATAEMIA_VAR,
            HEARING_LOSS_VAR,
            MYOPATHY_VAR,
          ]);

        // Paternal line: carries the Y-linked condition down grandfather→father→ego.
        person('paternal-grandfather', {
          [nameVarId]: 'Walter',
          [BIO_SEX_VAR]: 'male',
          [HEARING_LOSS_VAR]: true,
        });
        person('paternal-grandmother', {
          [nameVarId]: 'Edith',
          [BIO_SEX_VAR]: 'female',
        });
        person('father', {
          [nameVarId]: 'Gerald',
          [BIO_SEX_VAR]: 'male',
          [HYPOPHOSPHATAEMIA_VAR]: true,
        });

        // Maternal line: the mtDNA source (great-grandmother) and the X-linked
        // recessive carrier line (grandmother, obligate via two affected sons).
        person('maternal-great-grandmother', {
          [nameVarId]: 'Agnes',
          [BIO_SEX_VAR]: 'female',
          [MYOPATHY_VAR]: true,
        });
        person('maternal-great-grandfather', {
          [nameVarId]: 'Herbert',
          [BIO_SEX_VAR]: 'male',
        });
        person('maternal-grandmother', {
          [nameVarId]: 'Iris',
          [BIO_SEX_VAR]: 'female',
        });
        person('maternal-grandfather', {
          [nameVarId]: 'Frank',
          [BIO_SEX_VAR]: 'male',
        });
        person('uncle', {
          [nameVarId]: 'Alan',
          [BIO_SEX_VAR]: 'male',
          [HAEMOPHILIA_VAR]: true,
        });
        person('uncle-two', {
          [nameVarId]: 'Bruce',
          [BIO_SEX_VAR]: 'male',
          [HAEMOPHILIA_VAR]: true,
        });
        person('mother', { [nameVarId]: 'Diane', [BIO_SEX_VAR]: 'female' });

        person('ego', {
          [nameVarId]: 'You',
          [EGO_VAR]: true,
          [BIO_SEX_VAR]: 'male',
        });
        person('sister', { [nameVarId]: 'Helen', [BIO_SEX_VAR]: 'female' });

        partnerEdge('u1', 'paternal-grandfather', 'paternal-grandmother');
        partnerEdge(
          'u2',
          'maternal-great-grandmother',
          'maternal-great-grandfather',
        );
        partnerEdge('u3', 'maternal-grandmother', 'maternal-grandfather');
        partnerEdge('u4', 'father', 'mother');

        bioEdge('b1', 'paternal-grandfather', 'father');
        bioEdge('b2', 'paternal-grandmother', 'father');
        bioEdge('b3', 'maternal-great-grandmother', 'maternal-grandmother');
        bioEdge('b4', 'maternal-great-grandfather', 'maternal-grandmother');
        bioEdge('b5', 'maternal-grandmother', 'uncle');
        bioEdge('b6', 'maternal-grandfather', 'uncle');
        bioEdge('b7', 'maternal-grandmother', 'uncle-two');
        bioEdge('b8', 'maternal-grandfather', 'uncle-two');
        bioEdge('b9', 'maternal-grandmother', 'mother');
        bioEdge('b10', 'maternal-grandfather', 'mother');
        bioEdge('b11', 'father', 'ego');
        bioEdge('b12', 'mother', 'ego');
        bioEdge('b13', 'father', 'sister');
        bioEdge('b14', 'mother', 'sister');

        synth.addStage('NarrativePedigree', {
          label: 'Inheritance Pathways',
          sourceStageId: fpStageId,
          showAtRiskStatuses: true,
          diseases: [
            {
              id: 'haemophilia',
              label: 'Haemophilia',
              color: '#3182ce',
              variable: HAEMOPHILIA_VAR,
              inheritancePattern: 'xLinkedRecessive',
            },
            {
              id: 'hypophosphataemia',
              label: 'Hypophosphataemia',
              color: '#38a169',
              variable: HYPOPHOSPHATAEMIA_VAR,
              inheritancePattern: 'xLinkedDominant',
            },
            {
              id: 'hearing-loss',
              label: 'Hearing Loss',
              color: '#d69e2e',
              variable: HEARING_LOSS_VAR,
              inheritancePattern: 'yLinked',
            },
            {
              id: 'myopathy',
              label: 'Mitochondrial Myopathy',
              color: '#805ad5',
              variable: MYOPATHY_VAR,
              inheritancePattern: 'mitochondrial',
            },
          ],
        });
        return synth;
      },
      run: async ({ page }) => {
        const egoFocal = page.locator(
          '[role="button"][aria-label="Focus on You"]',
        );
        const clearFocus = page.getByRole('button', { name: 'Clear focus' });

        // X-linked recessive: the affected uncle, the obligate-carrier maternal
        // grandmother (two affected sons), and a maternal-line-only focal walk.
        const haemophiliaButton = page.getByRole('button', {
          name: 'Haemophilia',
          exact: true,
        });
        await haemophiliaButton.click();
        await expect(
          page.locator('[data-node-id="uncle"] [data-notation-status]'),
        ).toHaveAttribute('data-notation-status', 'affected');
        await expect(
          page.locator(
            '[data-node-id="maternal-grandmother"] [data-notation-status]',
          ),
        ).toHaveAttribute('data-notation-status', 'obligateCarrier');
        await egoFocal.click();
        await expect(page.locator('[data-node-id="mother"]')).toHaveAttribute(
          'data-dimmed',
          'false',
        );
        await expect(
          page.locator('[data-node-id="maternal-grandmother"]'),
        ).toHaveAttribute('data-dimmed', 'false');
        await expect(
          page.locator('[data-node-id="maternal-great-grandmother"]'),
        ).toHaveAttribute('data-dimmed', 'false');
        await expect(
          page.locator('[data-node-id="paternal-grandfather"]'),
        ).toHaveAttribute('data-dimmed', 'true');
        await clearFocus.click();
        await haemophiliaButton.click(); // deselect

        // X-linked dominant: every daughter of the affected father is non-unknown;
        // a son of the same father stays unknown.
        const hypophosphataemiaButton = page.getByRole('button', {
          name: 'Hypophosphataemia',
          exact: true,
        });
        await hypophosphataemiaButton.click();
        await expect(
          page.locator('[data-node-id="sister"] [data-notation-status]'),
        ).toHaveAttribute('data-notation-status', 'obligateAffected');
        await expect(
          page.locator('[data-node-id="ego"] [data-notation-status]'),
        ).toHaveAttribute('data-notation-status', 'unknown');
        await hypophosphataemiaButton.click(); // deselect

        // Y-linked: only males down the paternal line carry a non-unknown status;
        // a daughter is unknown; focusing the grandson highlights only the
        // paternal father→son chain.
        const hearingLossButton = page.getByRole('button', {
          name: 'Hearing Loss',
          exact: true,
        });
        await hearingLossButton.click();
        await expect(
          page.locator('[data-node-id="father"] [data-notation-status]'),
        ).toHaveAttribute('data-notation-status', 'obligateAffected');
        await expect(
          page.locator('[data-node-id="ego"] [data-notation-status]'),
        ).toHaveAttribute('data-notation-status', 'obligateAffected');
        await expect(
          page.locator('[data-node-id="sister"] [data-notation-status]'),
        ).toHaveAttribute('data-notation-status', 'unknown');
        await egoFocal.click();
        await expect(page.locator('[data-node-id="father"]')).toHaveAttribute(
          'data-dimmed',
          'false',
        );
        await expect(
          page.locator('[data-node-id="paternal-grandfather"]'),
        ).toHaveAttribute('data-dimmed', 'false');
        await expect(page.locator('[data-node-id="mother"]')).toHaveAttribute(
          'data-dimmed',
          'true',
        );
        await clearFocus.click();
        await hearingLossButton.click(); // deselect

        // Mitochondrial: focusing a maternal-line descendant highlights only the
        // female-parent (egg-cytoplasm) chain up to the great-grandmother source;
        // a paternal-line relative stays dimmed.
        const myopathyButton = page.getByRole('button', {
          name: 'Mitochondrial Myopathy',
          exact: true,
        });
        await myopathyButton.click();
        await egoFocal.click();
        await expect(page.locator('[data-node-id="mother"]')).toHaveAttribute(
          'data-dimmed',
          'false',
        );
        await expect(
          page.locator('[data-node-id="maternal-grandmother"]'),
        ).toHaveAttribute('data-dimmed', 'false');
        await expect(
          page.locator('[data-node-id="maternal-great-grandmother"]'),
        ).toHaveAttribute('data-dimmed', 'false');
        await expect(
          page.locator('[data-node-id="paternal-grandfather"]'),
        ).toHaveAttribute('data-dimmed', 'true');
      },
    },
    {
      id: 'zoom-controls-save-snapshot-readonly',
      covers: ['zoomControls', 'saveSnapshot', 'label', 'readOnlyInvariant'],
      chromiumOnly: true,
      currentStep: 1,
      seedNetwork: true,
      build: (): SyntheticInterview => {
        const { synth, nameVarId, fpStageId, person, bioEdge } =
          scaffoldPedigree([HD_VAR]);
        person('mother', { [nameVarId]: 'Rose', [BIO_SEX_VAR]: 'female' });
        person('father', { [nameVarId]: 'David', [BIO_SEX_VAR]: 'male' });
        person('ego', {
          [nameVarId]: 'You',
          [EGO_VAR]: true,
          [BIO_SEX_VAR]: 'female',
          [HD_VAR]: true,
        });
        bioEdge('b1', 'mother', 'ego');
        bioEdge('b2', 'father', 'ego');
        synth.addStage('NarrativePedigree', {
          label: 'Inheritance Pathways',
          sourceStageId: fpStageId,
          showAtRiskStatuses: false,
          diseases: [
            {
              id: 'hd',
              label: "Huntington's Disease",
              color: '#e53e3e',
              variable: HD_VAR,
              inheritancePattern: 'autosomalDominant',
            },
          ],
        });
        return synth;
      },
      run: async ({ page, protocol, interview }) => {
        const before = await protocol.getNetworkState(interview.interviewId);

        const zoomContent = page.locator('[data-testid="np-zoom-content"]');
        const zoomInButton = page.getByRole('button', { name: 'Zoom in' });
        const zoomOutButton = page.getByRole('button', { name: 'Zoom out' });
        const resetZoomButton = page.getByRole('button', {
          name: 'Reset zoom',
        });

        await zoomInButton.click();
        await zoomInButton.click();
        await expect
          .poll(async () =>
            Number(await zoomContent.getAttribute('data-zoom-level')),
          )
          .toBeGreaterThan(1);
        const zoomedInLevel = Number(
          await zoomContent.getAttribute('data-zoom-level'),
        );

        await zoomOutButton.click();
        await expect
          .poll(async () => {
            const level = Number(
              await zoomContent.getAttribute('data-zoom-level'),
            );
            return level > 1 && level < zoomedInLevel;
          })
          .toBe(true);

        await resetZoomButton.click();
        await expect(zoomContent).toHaveAttribute('data-zoom-level', '1');

        await page
          .getByRole('button', { name: "Huntington's Disease", exact: true })
          .click();

        const downloadPromise = page.waitForEvent('download');
        await page.getByRole('button', { name: 'Save snapshot' }).click();
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toMatch(
          /^inheritance-pathways.*\.png$/i,
        );

        const after = await protocol.getNetworkState(interview.interviewId);
        expect(after).toEqual(before);
      },
    },
  ],
} satisfies InterfaceScenarios;
```

The five scenarios above are the most complex (shared helper scaffold, focal/clear-focus/Escape state machine, the sex-linked/mitochondrial multi-condition walk, the zoom/snapshot/download flow, and the read-only network-state comparison across `protocol.getNetworkState`). The remaining five rows are implemented the same way — each a `ScenarioDefinition` built from `scaffoldPedigree(diseaseVarIds)` plus a small hand-seeded family, differing only in: which disease(s)/`inheritancePattern`(s) are configured, which nodes get which boolean attribute seeded `true`, and the assertions in `run()` per the table above. Two implementation notes for those rows, concrete enough to code without re-reading the dive file:

- **`membership-scoping-committed`**: add `stageMetadata: { 0: { isNetworkCommitted: true, nodes: [{ id: 'mother', label: 'Mother', isEgo: false }, { id: 'father', label: 'Father', isEgo: false }, { id: 'ego', label: 'You', isEgo: true }] } }` to the `ScenarioDefinition` (the new field this task adds), seed an extra `synth.addManualNode(fpStageId, nodeTypeId, 'outsider', { ...boolDefaults, [nameVarId]: 'Outsider', [BIO_SEX_VAR]: 'other' })` with NO edges, and assert its absence via `page.locator('[data-node-id="outsider"]')`.
- **`misconfigured-source-stage-id`**: `build()` returns a normal valid 2-parent pedigree (reuse the `default-all-conditions-happy-path` shape with one disease). In `run()`:
  ```ts
  run: async ({ page, protocol, interview }) => {
    const synth = buildAdScenario(); // valid sourceStageId internally
    const built = buildSyntheticPayload(synth, {
      protocolName: 'matrix-narrative-pedigree-misconfigured',
      currentStep: 1,
      seedNetwork: true,
    });
    const corrupted = {
      ...built.protocol,
      stages: built.protocol.stages.map((s) =>
        s.type === 'NarrativePedigree'
          ? { ...s, sourceStageId: 'does-not-exist' }
          : s,
      ),
    };
    await page.evaluate((p) => window.__test.installProtocol(p), corrupted);
    const interviewId = await protocol.createInterview(
      corrupted.id,
      'e2e-narrative-pedigree-misconfigured',
      { network: built.session.network, currentStep: 1 },
    );
    interview.interviewId = interviewId;
    await interview.goto(1);
    await expect(
      page.getByText(
        'This stage references a family pedigree that could not be found.',
      ),
    ).toBeVisible();
    await expect(page.locator('[data-pedigree-member="true"]')).toHaveCount(0);
  },
  ```
  This scenario's `build()` (used by the standard `installScenario` step that runs before `run()`) is `buildAdScenario` itself — the standard install succeeds validly, its `ariaSnapshot('initial')` captures that valid state, and `run()` then swaps in the corrupted protocol/interview before `ariaSnapshot('final')` captures the fallback. `CurrentProtocolSchema` is never asked to validate the corrupted payload because `window.__test.installProtocol` (Task 3) stores whatever `ProtocolPayload` object it is given — it performs no schema re-validation at the app boundary, which is exactly the runtime condition (a hand-edited or pre-migration protocol file) this scenario exercises.

---

- [ ] **Step 1: Write the registry + inventory entry + spec file**

  Write `e2e/matrix/narrative-pedigree.scenarios.ts` (full code above for 5 scenarios, remaining 5 per the table + notes), append the `NarrativePedigree` entry to `OPTION_INVENTORY` in `e2e/matrix/option-inventory.ts`, append `narrativePedigreeScenarios` to `ALL_SUITES` in `e2e/matrix/coverage-manifest.test.ts`, and create:

  ```ts
  // e2e/specs/matrix/narrative-pedigree.spec.ts
  import { narrativePedigreeScenarios } from '../../matrix/narrative-pedigree.scenarios.js';
  import { defineScenarioTests } from '../../matrix/run-scenario.js';

  defineScenarioTests(narrativePedigreeScenarios);
  ```

- [ ] **Step 2: Run the coverage manifest**: `pnpm --filter @codaco/interview exec vitest run e2e/matrix` — Expected: PASS (all `NarrativePedigree` inventory keys claimed; `skipLogic` claimed via `sharedSuiteClaims` once Task 26 lands — until then, temporarily add `'NarrativePedigree:skipLogic'` to `e2e/matrix/shared-claims.ts`'s placeholder array if Task 26 hasn't run yet, so this task's own manifest run is green in isolation).

- [ ] **Step 3: Run the scenarios**: `pnpm --filter @codaco/interview test:e2e:headed -- --project=chromium-matrix --grep "NarrativePedigree"` — Expected: PASS; commit new `.aria.yml` baselines under `e2e/aria-snapshots/chromium/`.

- [ ] **Step 4: Typecheck + commit** with message `test(interview-e2e): NarrativePedigree configuration matrix`

### Task 25: FinishSession matrix scenarios

**Files:**

- Create: `e2e/matrix/finish-session.scenarios.ts`
- Create: `e2e/specs/matrix/finish-session.spec.ts`
- Modify: `e2e/matrix/option-inventory.ts` (add the `FinishSession` entry — full code below)
- Modify: `e2e/matrix/coverage-manifest.test.ts` (append `finishSessionScenarios` to `ALL_SUITES`)
- Modify: `e2e/matrix/all-scenarios.ts` (append registry import/export, if it exists by the time this task lands)
- Modify: `e2e/host/src/mockCallbacks.ts` (replace the no-op `mockFinish` with an instrumented, configurable handler — REQUIRED per the dive file's dependency notes)
- Modify: `e2e/host/src/testHooks.ts` (expose the new hooks on `window.__test`)
- Modify: `e2e/host/src/App.tsx` (pass `allowStageNavigation={true}` to `Shell` — currently omitted, so the "Go to a stage" drawer never renders in the e2e host; needed for the StagesMenu-exclusion scenario)
- Modify: `e2e/fixtures/window-test.d.ts` (extend the `window.__test` type declaration)

**Interfaces:**

- Consumes: `ScenarioDefinition`/`InterfaceScenarios`/`defineScenarioTests` (Task 6), `SyntheticInterview` builder incl. `addManualNode`/`addNodeType`/`addInformationStage` (existing, `packages/protocol-utilities/src/SyntheticInterview.ts:225,725,1789`), seeded interviews via `currentStep`/`seedNetwork` (Task 3), `protocol.getNetworkState(interviewId)` (existing, `e2e/fixtures/protocol-fixture.ts:196`), `interview.nextButton`/`finishInterview()` (existing, `e2e/fixtures/interview-fixture.ts`).
- Produces: `finishSessionScenarios: InterfaceScenarios`; and, consumed by any future host-side test infra, the new `window.__test` surface:
  - `setFinishBehavior(behavior: FinishBehavior): void`
  - `resolveManualFinish(): void`
  - `rejectManualFinish(message: string): void`
  - `getFinishCalls(): { interviewId: string; aborted: boolean }[]`

No fixture (StageFixture) work is required — `interview.finishInterview()` already exists and is called by the `terminal-render-and-navigation` smoke scenario to drive the confirm flow to completion; scenarios needing finer control (cancel/pending/error/abort) drive the dialog directly via `page.getByRole('dialog')` and the `dialog-primary`/`dialog-cancel` testids instead of calling `finishInterview()`.

---

## Why a host change is unavoidable

`FinishSession` has no schema-8 stage definition (confirmed: zero hits for `FinishSession` in `packages/protocol-validation/src`). The engine appends it to every stage list (`packages/interview/src/store/modules/protocol.ts:15-19,29-32`); its entire testable surface is the `onFinish(interviewId, signal)` contract plus the generic confirm-dialog it drives (`packages/interview/src/interfaces/FinishSession.tsx:14-50` → `packages/fresco-ui/src/dialogs/DialogProvider.tsx:404-470,479-553`). The current e2e host's `mockFinish` is a silent no-op (`e2e/host/src/mockCallbacks.ts:12-17`), so pending/error/abort/call-count behavior is currently unobservable and uncontrollable. This task fixes that with a small, self-contained instrumented mock — no DB, no network, module-scoped state that resets for free every test because `matrixTest`'s per-test `page` is a fresh browsing context (fresh JS module instance) each run.

## Stage fixture helpers

None required for FinishSession. `InterviewFixture.finishInterview()` (`e2e/fixtures/interview-fixture.ts`, method `finishInterview`) is called verbatim by the `terminal-render-and-navigation` scenario to complete the confirm flow. All other scenarios interact with the dialog directly using existing Playwright locators — no new StageFixture sub-class needed.

## Host change 1: instrumented, configurable `onFinish`

Replace the body of `e2e/host/src/mockCallbacks.ts`:

```ts
// e2e/host/src/mockCallbacks.ts
import type {
  AssetRequestHandler,
  FinishHandler,
  SyncHandler,
} from '../../../src/contract/types';

// The Shell is a self-contained Redux island in the e2e host. There is no
// remote sink for sessions — Playwright reads state straight from the live
// Redux store via window.__interviewStore. So sync is a no-op.
export const mockSync: SyncHandler = async (): Promise<void> => {};

/**
 * Configurable behavior for the instrumented onFinish mock, set from
 * Playwright via window.__test.setFinishBehavior(). 'manual' is used by
 * scenarios that need to assert the dialog's pending state before deciding
 * whether to resolve or reject — no real or virtual timers involved.
 */
export type FinishBehavior =
  | { mode: 'resolve' }
  | { mode: 'reject'; message: string }
  | { mode: 'manual' }
  | { mode: 'hang-until-abort' };

export type FinishCallRecord = { interviewId: string; aborted: boolean };

let finishBehavior: FinishBehavior = { mode: 'resolve' };
const finishCalls: FinishCallRecord[] = [];
let manualResolve: (() => void) | null = null;
let manualReject: ((reason: unknown) => void) | null = null;

export function setFinishBehavior(behavior: FinishBehavior): void {
  finishBehavior = behavior;
}

/** Resolves a pending 'manual' mode call. No-op if none is pending. */
export function resolveManualFinish(): void {
  manualResolve?.();
}

/** Rejects a pending 'manual' mode call with Error(message). No-op if none is pending. */
export function rejectManualFinish(message: string): void {
  manualReject?.(new Error(message));
}

export function getFinishCalls(): FinishCallRecord[] {
  return finishCalls;
}

export const mockFinish: FinishHandler = async (
  interviewId: string,
  signal: AbortSignal,
): Promise<void> => {
  const behavior = finishBehavior;
  const call: FinishCallRecord = { interviewId, aborted: false };
  finishCalls.push(call);

  const onAbort = () => {
    call.aborted = true;
  };
  signal.addEventListener('abort', onAbort);

  try {
    if (behavior.mode === 'resolve') return;

    if (behavior.mode === 'reject') {
      throw new Error(behavior.message);
    }

    if (behavior.mode === 'manual') {
      await new Promise<void>((resolve, reject) => {
        manualResolve = resolve;
        manualReject = reject;
        signal.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
      return;
    }

    // 'hang-until-abort': never resolves on its own; only the AbortSignal
    // settles it, mirroring a real network request cancelled by the dialog.
    await new Promise<void>((_resolve, reject) => {
      signal.addEventListener('abort', () => {
        reject(new DOMException('Aborted', 'AbortError'));
      });
    });
  } finally {
    signal.removeEventListener('abort', onAbort);
    manualResolve = null;
    manualReject = null;
  }
};

export function makeMockAssetRequest(
  assetUrls: Map<string, string>,
): AssetRequestHandler {
  return async (assetId: string): Promise<string> => {
    const url = assetUrls.get(assetId);
    if (!url) throw new Error(`No URL registered for asset ${assetId}`);
    return url;
  };
}
```

## Host change 2: expose the hooks on `window.__test`

In `e2e/host/src/testHooks.ts`, add the import and extend `installTestHooks`:

```ts
// add near the top with the other imports
import {
  getFinishCalls,
  rejectManualFinish,
  resolveManualFinish,
  setFinishBehavior,
} from './mockCallbacks';
```

```ts
// inside installTestHooks(), extend the assigned object:
(globalThis as Record<string, unknown>).__test = {
  installProtocol,
  setAssetUrl,
  createInterview,
  getNetworkState,
  reset,
  setFinishBehavior,
  resolveManualFinish,
  rejectManualFinish,
  getFinishCalls,
};
```

(No change needed to `reset()` itself — `finishBehavior`/`finishCalls` live in a module scope that is torn down and reconstructed on every fresh page load, which `matrixTest`'s per-test `page` fixture already guarantees.)

## Host change 3: enable stage navigation in the host

In `e2e/host/src/App.tsx`, add the prop to the `<Shell>` element (Shell already supports it — `packages/interview/src/Shell.tsx:234,331-333` gates the StagesMenu render on `allowStageNavigation && (currentStep === undefined || onStepChange !== undefined)`, and the host always passes `onStepChange`, so this turns the drawer on for every host-driven interview):

```tsx
<Shell
  payload={payload}
  onSync={mockSync}
  onFinish={mockFinish}
  onRequestAsset={mockAssetReq}
  currentStep={currentStep}
  onStepChange={onStepChange}
  allowStageNavigation={true}
  flags={{ isE2E: true }}
  analytics={{ installationId: 'e2e', hostApp: 'e2e' }}
  disableAnalytics={true}
/>
```

## Host change 4: type the new `window.__test` surface

In `e2e/fixtures/window-test.d.ts`:

```ts
import type { ProtocolPayload, SessionPayload } from '@codaco/interview';
import type { FinishBehavior } from '../host/src/mockCallbacks.js';

declare global {
  // biome-ignore lint/style/useConsistentTypeDefinitions: declaration merging
  interface Window {
    __test: {
      installProtocol(protocol: ProtocolPayload): void;
      setAssetUrl(assetId: string, url: string): void;
      createInterview(protocolId: string, participantId?: string): string;
      getNetworkState(): SessionPayload['network'] | undefined;
      reset(): void;
      setFinishBehavior(behavior: FinishBehavior): void;
      resolveManualFinish(): void;
      rejectManualFinish(message: string): void;
      getFinishCalls(): { interviewId: string; aborted: boolean }[];
    };
    __e2eMap?: {
      getSource(id: string): unknown;
      isSourceLoaded(id: string): boolean;
      querySourceFeatures(id: string): unknown[];
      queryRenderedFeatures(options: { layers: string[] }): unknown[];
      once(event: string, fn: () => void): void;
      resize(): void;
      triggerRepaint(): void;
    };
    __restoreExpandedScrollers?: () => void;
  }

  var __test: Window['__test'];
  var __e2eMap: Window['__e2eMap'];
}
```

---

## Option inventory entry

```ts
// e2e/matrix/option-inventory.ts — add this entry to OPTION_INVENTORY
FinishSession: [
  // Synthetic, engine-appended stage — not schema-8, not protocol-authorable.
  'stage.type',
  'stage.id',
  'stage.label', // dead: DefaultFinishStage.label is set but never rendered
  'confirm-dialog.copy',
  'confirm-dialog.destructive-focus',
  'onFinish.confirm-calls-handler',
  'onFinish.cancel-path',
  'onFinish.pending-state',
  'onFinish.error-retry',
  'onFinish.abort-on-dismiss',
  'interviewId-guard', // dead: unreachable e2e, host always seeds session.id
  'terminal-navigation',
  'progress-100',
  'stagesMenu-exclusion',
  'back-navigation-network-intact',
  'analytics.interview_finished', // dead e2e: host sets disableAnalytics=true
  'skipLogic', // claimed by the shared cross-cutting suite (Task 26)
],
```

---

## Scenario table

| id                                  | covers                                                                                                         | flags             | protocol config                                                                                                                                                                                                                     | interaction                                                                                                                                                                               | functional assertions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `terminal-render-and-navigation`    | `stage.type`, `stage.id`, `stage.label`, `terminal-navigation`, `progress-100`, `analytics.interview_finished` | `smoke`, `visual` | 1 `Information` stage (`title: 'Study overview'`); `currentStep: 1` (index = stages.length)                                                                                                                                         | assert render on arrival, then `interview.finishInterview()` drives the confirm flow to completion (happy path)                                                                           | `getByRole('heading', {name:'Finish Interview'})` visible; `getByText('You have reached the end of the interview', {exact:false})` visible; `getByRole('button',{name:'Finish'})` visible; `interview.nextButton` disabled; `getByTestId('previous-button')` enabled; `getByRole('dialog')` count 0; URL contains `step=1` (progress/terminal position proxy — no host-side StepChangeMeta capture exists, so URL step is the only observable signal); dead-config note in comment: heading text is hardcoded regardless of the (unauthorable) synthetic `stage.label`/`stage.id`; after `finishInterview()`, `getByRole('dialog')` hidden and `getFinishCalls()` length 1 with `.aborted === false` |
| `confirm-dialog-and-cancel`         | `confirm-dialog.copy`, `confirm-dialog.destructive-focus`, `onFinish.cancel-path`, `interviewId-guard`         | `visual`          | same 1-stage protocol; `currentStep: 1`                                                                                                                                                                                             | click Finish → assert dialog → click `dialog-cancel` → click Finish again                                                                                                                 | dialog title `'Are you sure you want to finish the interview?'` and description `'Your responses cannot be changed after you finish the interview.'` visible; `dialog-primary` text `'Finish Interview'`; `dialog-cancel` text `'Cancel'`; `document.activeElement` is the cancel button (destructive intent autofocus) via `expect(cancelBtn).toBeFocused()`; after cancel click, dialog hidden and `getFinishCalls()` length 0; clicking Finish again reopens the dialog (component reusable; also demonstrates the `interviewId` guard doesn't block repeat opens)                                                                                                                                |
| `confirm-path-pending-resolve`      | `onFinish.confirm-calls-handler`, `onFinish.pending-state`                                                     | —                 | same 1-stage protocol; `currentStep: 1`                                                                                                                                                                                             | `setFinishBehavior({mode:'manual'})`; click Finish → `dialog-primary` → assert pending UI → `resolveManualFinish()`                                                                       | primary disabled + text `'Please wait...'` + `svg.animate-spin` visible while pending; after `resolveManualFinish()`, dialog hidden; `getFinishCalls()` length 1, `[0].interviewId === interview.interviewId`, `[0].aborted === false`                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `error-path-retry`                  | `onFinish.error-retry`                                                                                         | —                 | same 1-stage protocol; `currentStep: 1`                                                                                                                                                                                             | `setFinishBehavior({mode:'reject', message:'finish failed'})`; click Finish → `dialog-primary`; assert error + retry; `setFinishBehavior({mode:'resolve'})`; click `dialog-primary` again | after first click: dialog still visible, `getByText('finish failed')` visible inside dialog, `dialog-primary` re-enabled (not stuck disabled); after second click: dialog hidden; `getFinishCalls()` length 2                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `abort-path-dismiss-while-pending`  | `onFinish.abort-on-dismiss`                                                                                    | —                 | same 1-stage protocol; `currentStep: 1`                                                                                                                                                                                             | `setFinishBehavior({mode:'hang-until-abort'})`; click Finish → `dialog-primary` → assert pending → click `dialog-cancel`                                                                  | while pending: `dialog-primary` disabled, text `'Please wait...'`; after cancel click: dialog hidden; `getFinishCalls()` last entry `.aborted === true`; `getByText('finish failed')`/any error paragraph count 0 (AbortError swallowed, never surfaced); Finish button clickable again → dialog reopens                                                                                                                                                                                                                                                                                                                                                                                             |
| `back-navigation-preserves-network` | `back-navigation-network-intact`                                                                               | —                 | 2 `Information` stages (`'Stage One'`, `'Stage Two'`); `synth.addManualNode(stageOne.id, nodeType.id, 'seed-node-1', {name:'Seeded Participant'})`; `seedNetwork: true`; `currentStep: 2` (finish stage, index = stages.length = 2) | click `previous-button`                                                                                                                                                                   | URL becomes `step=1`; `getByRole('heading',{name:'Stage Two'})` visible (last real stage, not skipped past); `protocol.getNetworkState(interview.interviewId)` still contains exactly 1 node with `[entityAttributesProperty].name === 'Seeded Participant'` — finish stage never touched the shared graph                                                                                                                                                                                                                                                                                                                                                                                           |
| `stages-menu-excludes-finish`       | `stagesMenu-exclusion`                                                                                         | —                 | 2 `Information` stages (`'Stage One'`, `'Stage Two'`); `currentStep: 2` (finish stage)                                                                                                                                              | click `getByRole('button',{name:'Go to a stage'}).first()` to open the drawer                                                                                                             | drawer's `listbox` contains exactly 2 `option` items (`'Stage One'`, `'Stage Two'`); no option with accessible name `'Finish Interview'`; `getByRole('listbox').getByRole('option')` count === 2                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

---

## Fully-coded scenarios

```ts
// e2e/matrix/finish-session.scenarios.ts
import { entityAttributesProperty } from '@codaco/shared-consts';
import { SyntheticInterview } from '@codaco/protocol-utilities';

import { expect } from '../fixtures/matrix-test.js';
import type { InterfaceScenarios } from './types.js';

export const finishSessionScenarios: InterfaceScenarios = {
  interfaceType: 'FinishSession',
  scenarios: [
    {
      id: 'terminal-render-and-navigation',
      covers: [
        'stage.type',
        'stage.id',
        'stage.label',
        'terminal-navigation',
        'progress-100',
        'analytics.interview_finished',
      ],
      smoke: true,
      visual: true,
      build: () => {
        const synth = new SyntheticInterview();
        synth.addInformationStage({ title: 'Study overview' });
        return synth;
      },
      // currentStep 1 === protocolStages.length: the engine-appended finish
      // stage. It has no schema-8 definition — nothing here is authorable,
      // so this scenario just proves the (hardcoded) render + terminal nav.
      currentStep: 1,
      run: async ({ page, interview }) => {
        await expect(
          page.getByRole('heading', { name: 'Finish Interview' }),
        ).toBeVisible();
        await expect(
          page.getByText('You have reached the end of the interview', {
            exact: false,
          }),
        ).toBeVisible();
        await expect(
          page.getByRole('button', { name: 'Finish' }),
        ).toBeVisible();

        // Terminal navigation semantics: can't go forward, can go back.
        await expect(interview.nextButton).toBeDisabled();
        await expect(page.getByTestId('previous-button')).toBeEnabled();

        // No dialog until Finish is clicked.
        await expect(page.getByRole('dialog')).toHaveCount(0);

        // Dead config: DefaultFinishStage.label ('Finish Interview') and its
        // synthetic id are never read by this component — the heading text
        // above is a hardcoded literal in FinishSession.tsx, not stage.label.
        // progress-100 has no host-side capture in the e2e host (no
        // StepChangeMeta recorded); the URL step param is the only signal.
        await expect(page).toHaveURL(/step=1/);

        // Happy path: drive the confirm flow to completion via the shared
        // fixture helper (asserts heading, clicks Finish, confirms dialog).
        await interview.finishInterview();
        await expect(page.getByRole('dialog')).toBeHidden();

        const calls = await page.evaluate(() => window.__test.getFinishCalls());
        expect(calls).toHaveLength(1);
        expect(calls[0]?.aborted).toBe(false);
      },
    },

    {
      id: 'confirm-dialog-and-cancel',
      covers: [
        'confirm-dialog.copy',
        'confirm-dialog.destructive-focus',
        'onFinish.cancel-path',
        'interviewId-guard',
      ],
      visual: true,
      build: () => {
        const synth = new SyntheticInterview();
        synth.addInformationStage({ title: 'Study overview' });
        return synth;
      },
      currentStep: 1,
      run: async ({ page }) => {
        await page.getByRole('button', { name: 'Finish' }).click();

        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        await expect(
          dialog.getByText('Are you sure you want to finish the interview?'),
        ).toBeVisible();
        await expect(
          dialog.getByText(
            'Your responses cannot be changed after you finish the interview.',
          ),
        ).toBeVisible();

        const primary = dialog.getByTestId('dialog-primary');
        const cancel = dialog.getByTestId('dialog-cancel');
        await expect(primary).toHaveText('Finish Interview');
        await expect(cancel).toHaveText('Cancel');
        // Destructive intent autofocuses Cancel, not the primary action.
        await expect(cancel).toBeFocused();

        await cancel.click();
        await expect(dialog).toBeHidden();

        const calls = await page.evaluate(() => window.__test.getFinishCalls());
        expect(calls).toHaveLength(0);

        // Component is reusable after a cancel.
        await page.getByRole('button', { name: 'Finish' }).click();
        await expect(page.getByRole('dialog')).toBeVisible();
      },
    },

    {
      id: 'confirm-path-pending-resolve',
      covers: ['onFinish.confirm-calls-handler', 'onFinish.pending-state'],
      build: () => {
        const synth = new SyntheticInterview();
        synth.addInformationStage({ title: 'Study overview' });
        return synth;
      },
      currentStep: 1,
      run: async ({ page, interview }) => {
        await page.evaluate(() =>
          window.__test.setFinishBehavior({ mode: 'manual' }),
        );

        await page.getByRole('button', { name: 'Finish' }).click();
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();

        const primary = dialog.getByTestId('dialog-primary');
        await primary.click();

        // Pending: disabled, spinner, "Please wait..." — no fixed delay to
        // wait out, the mock hangs until we call resolveManualFinish().
        await expect(primary).toBeDisabled();
        await expect(primary).toHaveText('Please wait...');
        await expect(dialog.locator('svg.animate-spin')).toBeVisible();

        await page.evaluate(() => window.__test.resolveManualFinish());
        await expect(dialog).toBeHidden();

        const calls = await page.evaluate(() => window.__test.getFinishCalls());
        expect(calls).toHaveLength(1);
        expect(calls[0]?.interviewId).toBe(interview.interviewId);
        expect(calls[0]?.aborted).toBe(false);
      },
    },

    {
      id: 'error-path-retry',
      covers: ['onFinish.error-retry'],
      build: () => {
        const synth = new SyntheticInterview();
        synth.addInformationStage({ title: 'Study overview' });
        return synth;
      },
      currentStep: 1,
      run: async ({ page }) => {
        await page.evaluate(() =>
          window.__test.setFinishBehavior({
            mode: 'reject',
            message: 'finish failed',
          }),
        );

        await page.getByRole('button', { name: 'Finish' }).click();
        const dialog = page.getByRole('dialog');
        const primary = dialog.getByTestId('dialog-primary');
        await primary.click();

        // Rejection keeps the dialog open with the error message, primary
        // re-enabled for retry.
        await expect(dialog).toBeVisible();
        await expect(dialog.getByText('finish failed')).toBeVisible();
        await expect(primary).toBeEnabled();

        await page.evaluate(() =>
          window.__test.setFinishBehavior({ mode: 'resolve' }),
        );
        await primary.click();
        await expect(dialog).toBeHidden();

        const calls = await page.evaluate(() => window.__test.getFinishCalls());
        expect(calls).toHaveLength(2);
      },
    },

    {
      id: 'abort-path-dismiss-while-pending',
      covers: ['onFinish.abort-on-dismiss'],
      build: () => {
        const synth = new SyntheticInterview();
        synth.addInformationStage({ title: 'Study overview' });
        return synth;
      },
      currentStep: 1,
      run: async ({ page }) => {
        await page.evaluate(() =>
          window.__test.setFinishBehavior({ mode: 'hang-until-abort' }),
        );

        await page.getByRole('button', { name: 'Finish' }).click();
        const dialog = page.getByRole('dialog');
        const primary = dialog.getByTestId('dialog-primary');
        await primary.click();

        await expect(primary).toBeDisabled();
        await expect(primary).toHaveText('Please wait...');

        // Dismiss while pending — this aborts the in-flight onFinish call.
        await dialog.getByTestId('dialog-cancel').click();
        await expect(dialog).toBeHidden();

        const calls = await page.evaluate(() => window.__test.getFinishCalls());
        expect(calls).toHaveLength(1);
        expect(calls[0]?.aborted).toBe(true);

        // AbortError is swallowed — no error text ever renders anywhere.
        await expect(page.getByText('finish failed')).toHaveCount(0);
        await expect(page.locator('[class*="text-destructive"]')).toHaveCount(
          0,
        );

        // Finish stage still usable.
        await expect(
          page.getByRole('heading', { name: 'Finish Interview' }),
        ).toBeVisible();
        await page.getByRole('button', { name: 'Finish' }).click();
        await expect(page.getByRole('dialog')).toBeVisible();
      },
    },

    {
      id: 'back-navigation-preserves-network',
      covers: ['back-navigation-network-intact'],
      build: () => {
        const synth = new SyntheticInterview();
        const nodeType = synth.addNodeType();
        const nameVar = nodeType.addVariable({ name: 'name', type: 'text' });
        const stageOne = synth.addInformationStage({ title: 'Stage One' });
        synth.addInformationStage({ title: 'Stage Two' });
        // Seed a node directly into the network so this scenario doesn't
        // depend on another interface's UI (e.g. NameGeneratorQuickAdd) —
        // the only thing under test here is whether visiting the
        // engine-appended finish stage mutates the shared graph.
        synth.addManualNode(stageOne.id, nodeType.id, 'seed-node-1', {
          [nameVar.id]: 'Seeded Participant',
        });
        return synth;
      },
      seedNetwork: true,
      // 2 real stages (index 0, 1) + finish stage at index 2.
      currentStep: 2,
      run: async ({ page, interview, protocol }) => {
        await expect(
          page.getByRole('heading', { name: 'Finish Interview' }),
        ).toBeVisible();

        await page.getByTestId('previous-button').click();
        await expect(page).toHaveURL(/step=1/);
        await expect(
          page.getByRole('heading', { name: 'Stage Two' }),
        ).toBeVisible();

        const state = await protocol.getNetworkState(interview.interviewId);
        const nodes = state?.nodes ?? [];
        expect(nodes).toHaveLength(1);
        expect(
          (nodes[0]?.[entityAttributesProperty] as Record<string, unknown>)
            ?.name,
        ).toBe('Seeded Participant');
      },
    },

    {
      id: 'stages-menu-excludes-finish',
      covers: ['stagesMenu-exclusion'],
      build: () => {
        const synth = new SyntheticInterview();
        synth.addInformationStage({ title: 'Stage One' });
        synth.addInformationStage({ title: 'Stage Two' });
        return synth;
      },
      currentStep: 2,
      run: async ({ page }) => {
        await page
          .getByRole('button', { name: 'Go to a stage' })
          .first()
          .click();

        const listbox = page.getByRole('listbox');
        await expect(listbox).toBeVisible();

        const options = listbox.getByRole('option');
        await expect(options).toHaveCount(2);
        await expect(
          listbox.getByRole('option', { name: 'Finish Interview' }),
        ).toHaveCount(0);
      },
    },
  ],
};
```

```ts
// e2e/specs/matrix/finish-session.spec.ts
import { finishSessionScenarios } from '../../matrix/finish-session.scenarios.js';
import { defineScenarioTests } from '../../matrix/run-scenario.js';

defineScenarioTests(finishSessionScenarios);
```

Note on `back-navigation-preserves-network`: `addManualNode`'s node objects, per `SessionPayload['network']`, key attributes under `entityAttributesProperty` (imported from `@codaco/shared-consts`, same import already used in `e2e/fixtures/protocol-fixture.ts:13`) — categorical values are arrays but `name` here is a plain text variable, so no array-unwrapping is needed.

---

- [ ] **Step 1: Apply the host changes** — `e2e/host/src/mockCallbacks.ts` (instrumented `mockFinish` + exports), `e2e/host/src/testHooks.ts` (wire into `window.__test`), `e2e/host/src/App.tsx` (`allowStageNavigation={true}`), `e2e/fixtures/window-test.d.ts` (type additions). Code for all four is complete above — apply verbatim.

- [ ] **Step 2: Write the registry + inventory entry + spec file** — `e2e/matrix/finish-session.scenarios.ts`, `e2e/matrix/option-inventory.ts` (`FinishSession` entry), `e2e/specs/matrix/finish-session.spec.ts`, and append `finishSessionScenarios` to `ALL_SUITES` in `e2e/matrix/coverage-manifest.test.ts` (and to `e2e/matrix/all-scenarios.ts` if that registry file exists by now).

- [ ] **Step 3: Run the coverage manifest**: `pnpm --filter @codaco/interview exec vitest run e2e/matrix` — Expected: PASS (every `FinishSession` inventory key claimed by exactly one of the 7 scenarios; `skipLogic` claimed by the shared suite's manifest, not here).

- [ ] **Step 4: Run the scenarios**: `pnpm --filter @codaco/interview test:e2e:headed -- --project=chromium-matrix --grep "FinishSession"` — Expected: PASS; commit the new `.aria.yml` baselines under `e2e/aria-snapshots/chromium/`.

- [ ] **Step 5: Typecheck + commit** with message `test(interview-e2e): FinishSession configuration matrix`.

### Task 26: Shared cross-cutting suites (skipLogic + Filter operator matrices)

**Files:**

- Create: `e2e/matrix/cross-cutting.scenarios.ts`
- Create: `e2e/specs/matrix/cross-cutting.spec.ts`
- Modify: `e2e/matrix/shared-claims.ts` (claim `<Interface>:skipLogic` and `<Interface>:filter` for every interface that has those keys)
- Modify: `e2e/matrix/coverage-manifest.test.ts` (append registry import)

**Interfaces:**

- Consumes: `ScenarioDefinition`/`defineScenarioTests` (Task 6), builder `skipLogic`/`filter` (Task 1).
- Produces: `crossCuttingScenarios: InterfaceScenarios` with `interfaceType: 'CrossCutting'`; `sharedSuiteClaims` fully populated.

Scenario set (~16 scenarios; one per row):

| id                                                                                                                | what it proves                                                           | protocol shape                                                                                                                                               | functional assertion                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `skip-logic-skip-when-match`                                                                                      | `action: 'SKIP'` skips the stage when the filter matches                 | 3 stages: NameGeneratorQuickAdd (create 1 node) → Information with `skipLogic {action:'SKIP', filter: node EXISTS}` → Information terminal                   | after adding a node on stage 0, `interview.next()` lands on stage 2 (URL `step=2`); the skipped stage's heading never renders                                                                                 |
| `skip-logic-show-when-match`                                                                                      | `action: 'SHOW'` shows only when matched                                 | same but `action:'SHOW'`; run twice-in-one-test: without node → next skips to 2; reset via fresh scenario protocol with seeded node → next lands on 1        | URL assertions per branch                                                                                                                                                                                     |
| `skip-logic-operator-<op>` × EXISTS / NOT_EXISTS / EXACTLY / NOT / GREATER_THAN / LESS_THAN / INCLUDES / EXCLUDES | each Filter operator drives skip correctly                               | Information stage with `skipLogic` whose filter rule uses the operator against a seeded node attribute (seeded via `seedNetwork: true` + `setNodeAttribute`) | URL step assertion; one scenario per operator, attribute values chosen so the operator's true AND false branch are both exercised (two stages sharing the operator, one expected-skipped, one expected-shown) |
| `stage-filter-scopes-nodes`                                                                                       | stage-level `filter` hides non-matching nodes                            | Sociogram with seeded 4 nodes, 2 matching `filter`                                                                                                           | only 2 node elements render (`stage.sociogram` locator count); `getNetworkState()` still has 4                                                                                                                |
| `stage-filter-edge-rule`                                                                                          | edge-type rule in stage filter                                           | CategoricalBin, seeded nodes + 1 edge, filter `edge EXISTS`                                                                                                  | only edge-connected nodes appear in the bucket                                                                                                                                                                |
| `panel-filter`                                                                                                    | NameGenerator `panels[].filter` (claims `NameGenerator:panels[].filter`) | NameGenerator, panel `dataSource:'existing'` + attribute filter, seeded nodes on another prompt                                                              | panel lists only matching nodes                                                                                                                                                                               |

Follow the exact operator list in `packages/protocol-validation/src/schemas/8/filters/` — if it defines more operators than listed here (e.g. `CONTAINS`, options-count operators), add a scenario per operator; the coverage-manifest schema-walk in Task 6 will not catch operator omissions, so enumerate them from `FilterSchema`'s operator enum verbatim in a `const OPERATORS = [...] satisfies ...` and generate scenarios in a loop.

**Per-interface wiring scenarios (spec requirement — the shared claims must be backed by real coverage, not blanket-claimed):** in the same registry, loop-generate one `skipLogic` wiring scenario per stage type and one stage-`filter` wiring scenario per stage type that has a `filter` key in `OPTION_INVENTORY`:

```ts
// One entry per stage type: a build() that produces a minimal valid stage of
// that type (reuse each suite's simplest scenario builder via a small
// `minimalStageFactories: Record<string, () => SyntheticInterview>` map that
// each interface task exports from its scenarios file as `minimalBuild`).
const WIRED_INTERFACES = ALL_SUITES.map((s) => s.interfaceType).filter(
  (t) => t !== 'CrossCutting',
);
for (const iface of WIRED_INTERFACES) {
  scenarios.push({
    id: `skip-logic-wiring-${kebab(iface)}`,
    covers: [], // claim recorded via shared-claims.ts as `${iface}:skipLogic`
    build: () => {
      const synth = minimalBuild(iface); // stage 0: the interface under test
      // Wrap: prepend a NameGeneratorQuickAdd (stage becomes index 1) and give
      // the interface stage skipLogic {action:'SKIP', filter: node EXISTS}.
      // Patch via the stage handle returned from minimalBuild's registry.
      return withSkipLogicWrapper(synth, iface);
    },
    run: async ({ stage, interview, page }) => {
      // Create the matching node on stage 0, then next(): the interface stage
      // must be skipped — URL lands on step 2 (FinishSession terminal).
      await stage.quickAdd.addNode('Trigger');
      await interview.next();
      await expect(page).toHaveURL(/step=2/);
    },
  });
}
```

Implementation detail for `minimalBuild`: each interface's `*.scenarios.ts` exports `minimalBuild: () => SyntheticInterview` (its simplest passing configuration — typically the smoke scenario's `build`), and `withSkipLogicWrapper` prepends the trigger stage + sets `skipLogic` on the interface stage (the builder emits stages in add-order, so build the wrapper stage first in a fresh builder OR add `skipLogic` via the stage handle's stored `StageEntry`; whichever the builder supports — verify while implementing Task 1's stored-entry mutability and document the chosen mechanism in `cross-cutting.scenarios.ts`). Stage-`filter` wiring scenarios follow the same generated shape: seed 2 nodes (1 matching), assert the interface renders only the matching one via each suite's exported `countVisibleSubjects(page)` helper — interfaces where "visible subjects" is not meaningful (Information, Anonymisation, FinishSession, NarrativePedigree) are excluded and their inventories must not list a `filter` key.

- [ ] **Step 1: Write the registry** (loop-generate the operator scenarios; each `build()` seeds deterministic attributes via `setNodeAttribute`).
- [ ] **Step 2: Write the per-interface wiring scenario generators** (`minimalBuild` + `withSkipLogicWrapper` + `countVisibleSubjects` exports added to each interface's scenarios file — small additive edits, one per file).
- [ ] **Step 3: Write the spec file** (same 3-line shape as `information.spec.ts`).
- [ ] **Step 4: Populate `shared-claims.ts`**: for every interface in `OPTION_INVENTORY` that lists `skipLogic`/`filter` keys, add `'<Interface>:skipLogic'` / `'<Interface>:filter'` — each entry MUST correspond to a generated wiring scenario from Step 2; add a unit assertion in `coverage-manifest.test.ts` that every shared claim has a matching `skip-logic-wiring-*`/`stage-filter-wiring-*` scenario id.
- [ ] **Step 5: Run** `pnpm --filter @codaco/interview exec vitest run e2e/matrix` (coverage manifest passes) and `pnpm --filter @codaco/interview test:e2e:headed -- --project=chromium-matrix --grep "CrossCutting"` — Expected: PASS.
- [ ] **Step 6: Commit** — `git commit -m "feat(interview-e2e): shared skip-logic and filter operator suites"`.

---

### Task 27: Visual suite

**Files:**

- Create: `e2e/specs/matrix/visual.spec.ts`
- Create: `e2e/matrix/all-scenarios.ts` (single aggregation point: exports `ALL_SUITES: InterfaceScenarios[]`; refactor `coverage-manifest.test.ts` to import it instead of maintaining its own list)

**Interfaces:**

- Consumes: every registry (Tasks 6–26), `installScenario` (Task 6), `interview.captureInitial/captureFinal` (existing), the `*-visual` projects (Task 5).
- Produces: pixel snapshots named `<slug>-stage-<n>.png` / `-final.png` under `visual-snapshots/{chromium,firefox,webkit}-matrix/`.

- [ ] **Step 1: Write the aggregator** — `all-scenarios.ts` importing every `*.scenarios.ts` and exporting the array; update `coverage-manifest.test.ts` to consume it.
- [ ] **Step 2: Write the visual spec**

```ts
// e2e/specs/matrix/visual.spec.ts
import { ALL_SUITES } from '../../matrix/all-scenarios.js';
import { matrixTest } from '../../fixtures/matrix-test.js';
import { installScenario } from '../../matrix/run-scenario.js';
import type { ScenarioContext } from '../../matrix/types.js';

for (const suite of ALL_SUITES) {
  for (const scenario of suite.scenarios) {
    if (!scenario.visual) continue;
    matrixTest(
      `visual ${suite.interfaceType}: ${scenario.id}`,
      async ({ page, interview, stage, protocol }) => {
        if (scenario.chromiumOnly) {
          matrixTest.skip(
            !matrixTest.info().project.name.startsWith('chromium'),
            'chromium-only scenario',
          );
        }
        if (scenario.slow) matrixTest.slow();
        const ctx: ScenarioContext = { page, interview, stage, protocol };
        await installScenario(scenario, ctx);
        await interview.captureInitial();
        await scenario.run(ctx);
        await interview.captureFinal();
      },
    );
  }
}
```

Anonymisation's `visual` scenario must pass its `EncryptedBackground` locator as a mask — extend `ScenarioDefinition` with `captureMask?: (page: Page) => Locator[]` and thread it through `captureInitial`/`captureFinal`'s options if any scenario needs masking beyond the built-in video mask.

- [ ] **Step 3: Sanity-run one interface**: `pnpm --filter @codaco/interview test:e2e:headed -- --project=chromium-visual --grep "Information"` — Expected: tests pass; snapshots are only WRITTEN in the Docker update flow (captures no-op outside CI env var), so locally this validates flow, not pixels.
- [ ] **Step 4: Commit** — `git commit -m "feat(interview-e2e): pixel visual suite over visual-flagged scenarios"`.

---

### Task 28: CI wiring

**Files:**

- Modify: `.github/workflows/ci-and-release.yml` (interview-e2e job, lines ~727-769; report job ~778-842 untouched)
- Modify: `e2e/playwright.config.ts` (reporter)

**Interfaces:**

- Consumes: project names from Task 5.
- Produces: CI runs all 9 projects in the one existing job with `PW_WORKERS=4`; blob-reporter + merge support wired but shard matrix NOT enabled (spec: shards only if wall-clock exceeds the 45-min budget).

- [ ] **Step 1: Reporter**: in `playwright.config.ts`, make the reporter shard-aware:

```ts
  reporter: process.env.PW_BLOB
    ? [['blob']]
    : [
        ['line'],
        ['html', { outputFolder: './playwright-report', open: 'never' }],
        ['json', { outputFile: './test-results/results.json' }],
      ],
```

- [ ] **Step 2: Job env**: in the `interview-e2e` job step that invokes `run.sh`, export `PW_WORKERS: 4` (job `env:` block). Do not add a `strategy:` matrix. Leave triggers/required-checks untouched (spec: PR-informational).
- [ ] **Step 3: Wire the dormant merge-reports step**: add to the `interview-e2e` job, AFTER the run step, a conditional step that only activates when sharding is later enabled:

```yaml
# Dormant until a shard matrix is added (spec: enable shards only if the
# single-job wall-clock exceeds the 45-minute budget). When enabling:
# add strategy.matrix.shard, pass --shard=${{ matrix.shard }} to run.sh,
# set PW_BLOB: 1, and give this step the downloaded blob dirs.
- name: Merge sharded blob reports
  if: ${{ env.PW_BLOB == '1' }}
  run: pnpm --filter @codaco/interview exec playwright merge-reports --reporter html ./blob-report
```

- [ ] **Step 4: Document the shard escape hatch** in `e2e/README.md`'s CI section: `run.sh -- --shard=1/2` + `PW_BLOB=1` + the merge step above, and the measured-budget criterion for enabling it.
- [ ] **Step 5: Verify**: `pnpm --filter @codaco/interview exec playwright test --config e2e/playwright.config.ts --list | head -40` — Expected: tests enumerate under all 9 projects with @smoke greps applied (firefox-matrix/webkit-matrix list only smoke scenarios).
- [ ] **Step 6: Commit** — `git commit -m "ci(interview-e2e): tunable workers and blob-reporter support for the matrix suite"`.

---

### Task 29: Baselines, docs, follow-up issues, final verification

**Files:**

- Modify: `e2e/README.md` (matrix architecture section: registry pattern, aria vs pixel tiers, coverage manifest, how to add a scenario)
- Create: pixel baselines under `e2e/visual-snapshots/{chromium,firefox,webkit}-matrix/` (generated)
- Create: aria baselines under `e2e/aria-snapshots/{chromium,firefox,webkit}/` (generated)

- [ ] **Step 1: Generate aria baselines for all matrix projects**: `pnpm --filter @codaco/interview test:e2e:headed -- --project=chromium-matrix --project=firefox-matrix --project=webkit-matrix --update-snapshots` (aria snapshots are OS-independent — local regeneration is safe). Inspect a sample diff for sanity; commit.
- [ ] **Step 2: Generate pixel baselines in Docker**: `pnpm --filter @codaco/interview test:e2e:update-snapshots` — updates only `*-matrix` dirs (legacy dirs must show NO diff; verify with `git status packages/interview/e2e/visual-snapshots/{chromium,firefox,webkit}`). Review every new PNG by eye before committing.
- [ ] **Step 3: Full suite green**: `pnpm --filter @codaco/interview test:e2e` — Expected: all 9 projects pass in Docker within the runtime budget; note the wall-clock in the PR description against the 45-min CI budget.
- [ ] **Step 4: Repo gates**: `pnpm typecheck && pnpm knip && pnpm --filter @codaco/interview test` — Expected: all clean/green.
- [ ] **Step 5: Update `e2e/README.md`** with the matrix layout, the two-tier snapshot policy, aria-vs-pixel regeneration rules, and the option-inventory/coverage-manifest contract.
- [ ] **Step 6: File follow-up issues** (gh CLI): (a) the four coherence gaps pinned by matrix scenarios — silent no-op `CategoricalBin.otherOptionLabel` without `otherVariable`; unvalidated `OrdinalBin.prompts[].color`; dead `NetworkComposer.background.image`; Sociogram-ignored `behaviours.allowRepositioning`/`freeDraw` — one issue each, referencing the pinning scenario id, routed as schema+migration work per repo convention (NOT fixed in this branch); (b) promoting `interview-e2e` to a required/merge-queue check once flake rates are proven; (c) caching the in-container `pnpm install`/build (prerequisite to shard matrices).
- [ ] **Step 7: Changeset check**: builder extensions changed `@codaco/protocol-utilities` (a library) — author a patch changeset for it (library lane only; never mix with app changesets). If Task 1 added exports to `@codaco/protocol-validation`, add a separate patch changeset for that package too. The interview package e2e changes need none.
- [ ] **Step 8: Commit** — `git commit -m "test(interview-e2e): matrix baselines, docs, and changeset"`.
