import {
  markdownToRichTextContent,
  richTextContentToMarkdown,
} from '../../src/utils/markdownAdapter.js';

// Whole-document normalizer for the sample-protocol comparison: the built
// protocol (read back from IndexedDB) and the canonical
// `packages/protocols/sample/protocol.json` are each normalized independently
// with the SAME deterministic algorithm, then compared structurally with
// `toEqual`. Generalizes `normalize-stage.ts`: that helper's per-call id map
// can't link cross-stage references (a layout variable created on stage 16 and
// reused on stage 18 must collapse to the same placeholder in both documents),
// so this one uses a single shared order-of-first-appearance map across the
// whole document.
//
// Determinism of the placeholder numbering: JSON object key *insertion* order
// differs between the two documents (the canonical file was authored by an
// older Architect; the built one accretes keys in interaction order), so the
// id-assignment pass must not depend on it. It walks `stages` first — an
// ordered array whose non-id content is identical between the documents when
// the build is correct, anchoring every placeholder to interview order (every
// codebook/asset uuid in the sample protocol is referenced from some stage) —
// then the remaining top-level keys sorted; within objects keys are visited
// sorted, except uuid-keyed maps (codebook entities/variables, assetManifest)
// whose visit order is their children's `name` (the uuid keys themselves
// differ between documents, so sorting by key would scramble the numbering).
const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

const UUID_EXACT_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// What `new Date().toISOString()` produces — what the commit listener stamps,
// and what the schema's `z.string().datetime()` accepts.
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

// Compare two RichText-backed markdown strings by round-tripping BOTH through
// the app's own adapter (parse → serialize). Byte equality between eras is
// impossible by construction: the current serializer emits `- ` bullet
// markers, renumbers ordered lists, escapes `-`/`#`/`*`… in text runs, and
// never appends trailing newlines, while the canonical file mixes strings
// from two older serializers (`* ` bullets, `&quot;`/`&#39;` entities,
// repeated `1.` numbering, trailing `\n` artifacts). Round-tripping both
// sides through the same parser+serializer collapses exactly those
// representation differences while still failing on any real content
// difference (a missing sentence, a lost bold run, a changed list item all
// survive the round-trip as differences). Verified live by the build spike:
// typed-in canonical content parses to a document identical to the canonical
// string's parse.
const canonicalizeMarkdown = (value: unknown): unknown =>
  typeof value === 'string'
    ? richTextContentToMarkdown(markdownToRichTextContent(value))
    : value;

type Path = (string | number)[];
type PathMatcher = (path: Path) => boolean;

// Matches a concrete path against a pattern where '*' matches any single
// array index or object key.
const pathMatches =
  (...pattern: string[]): PathMatcher =>
  (path) =>
    path.length === pattern.length &&
    pattern.every(
      (part, index) => part === '*' || String(path[index]) === part,
    );

// ---------------------------------------------------------------------------
// Tolerance layer. Every entry is a source-verified divergence between what
// the CURRENT Architect editors force and the 2022-authored canonical file —
// nothing else is forgiven (real content differences still fail):
//
// 1. `lastModified` — re-stamped `new Date().toISOString()` on every accepted
//    commit (protocolValidationListener.ts).
// 2. `assetManifest[*].source` — the uploaded File.name here, an opaque
//    storage key in the canonical bundle (assetManifest.ts writes
//    `source: file.name`).
// 3. Codebook entity `color` — auto-assigned from the count of types at
//    creation; the canonical file has gaps (node-color-seq-1,2,5,7 /
//    edge-color-seq-1,6) left by types deleted and recreated during original
//    authoring, so a from-scratch build necessarily produces the dense
//    sequence. Prompt-level `color` (OrdinalBin) is NOT stripped — the
//    DialogArrayField item template's `ord-color-seq-1` matches canonical and
//    stays strictly compared.
// 4. `form.fields[*].id` — DialogArrayField's `createItem` injects `id:
//    uuid()` into every array item and `normalizeField` deliberately keeps
//    it; the canonical form fields predate that and have none.
// 5. `background.skewedTowardCenter: false` ≡ absent — the architect `Toggle`
//    mount effect force-writes `false` for every mounted toggle ("Persist the
//    explicit false default…", Toggle.tsx) and prune keeps `false`; the
//    canonical Narrative background simply lacks the key. `true` still
//    compares strictly.
// 6. `behaviours.automaticLayout: false` ≡ absent — the Narrative template
//    seeds `automaticLayout: true` (interfaceTemplates.ts) and toggling OFF
//    can only write `false`, never remove the key; the canonical stage
//    predates automatic layout.
// 7. Filter/skip-logic presence rules' `options.value: ''` ≡ absent —
//    withRuleChangeHandler unconditionally appends `value: ''` to every
//    node/edge rule and prune keeps empty strings; the canonical
//    EXISTS/NOT_EXISTS rules have no value key. Meaningful values are never
//    empty strings, so this cannot mask a real difference.
// 8. RichText-backed strings — canonicalized on both sides (see
//    `canonicalizeMarkdown`).
// 9. Empty `variables: {}` on codebook entity types ≡ absent — the type
//    editor always writes a variables map when creating a type, while the
//    canonical file omits the key for variable-less types (know/conflict
//    edges, the Classmate node). Non-empty maps still compare strictly.
// ---------------------------------------------------------------------------

type DeletionRule = {
  matches: PathMatcher;
  when?: (value: unknown) => boolean;
};

const RULE_OPTIONS_VALUE = [
  pathMatches(
    'stages',
    '*',
    'skipLogic',
    'filter',
    'rules',
    '*',
    'options',
    'value',
  ),
  pathMatches('stages', '*', 'filter', 'rules', '*', 'options', 'value'),
  pathMatches(
    'stages',
    '*',
    'panels',
    '*',
    'filter',
    'rules',
    '*',
    'options',
    'value',
  ),
];

const DELETED_PATHS: DeletionRule[] = [
  { matches: pathMatches('lastModified') },
  { matches: pathMatches('assetManifest', '*', 'source') },
  { matches: pathMatches('codebook', 'node', '*', 'color') },
  { matches: pathMatches('codebook', 'edge', '*', 'color') },
  { matches: pathMatches('stages', '*', 'form', 'fields', '*', 'id') },
  {
    matches: pathMatches('stages', '*', 'background', 'skewedTowardCenter'),
    when: (value) => value === false,
  },
  {
    matches: pathMatches('stages', '*', 'behaviours', 'automaticLayout'),
    when: (value) => value === false,
  },
  ...RULE_OPTIONS_VALUE.map((matches) => ({
    matches,
    when: (value: unknown) => value === '',
  })),
  ...(['node', 'edge'] as const).map((entity) => ({
    matches: pathMatches('codebook', entity, '*', 'variables'),
    when: (value: unknown) =>
      isRecord(value) && Object.keys(value).length === 0,
  })),
];

const RICH_TEXT_PATHS: PathMatcher[] = [
  pathMatches('stages', '*', 'introductionPanel', 'text'),
  pathMatches('stages', '*', 'prompts', '*', 'text'),
  pathMatches('stages', '*', 'prompts', '*', 'otherVariablePrompt'),
  pathMatches('stages', '*', 'prompts', '*', 'otherOptionLabel'),
  pathMatches('stages', '*', 'form', 'fields', '*', 'prompt'),
  pathMatches('stages', '*', 'form', 'fields', '*', 'hint'),
  pathMatches(
    'codebook',
    'node',
    '*',
    'variables',
    '*',
    'options',
    '*',
    'label',
  ),
  pathMatches(
    'codebook',
    'edge',
    '*',
    'variables',
    '*',
    'options',
    '*',
    'label',
  ),
  pathMatches('codebook', 'ego', 'variables', '*', 'options', '*', 'label'),
];

// Information items: only text items carry markdown (asset items' `content`
// is an asset id), so this one needs a sibling check, not just a path.
const isTextItemContent = (
  path: Path,
  parent: Record<string, unknown>,
): boolean =>
  pathMatches('stages', '*', 'items', '*', 'content')(path) &&
  parent.type === 'text';

function assignIds(input: unknown): Map<string, string> {
  const idMap = new Map<string, string>();
  let counter = 0;
  const mapId = (value: string) => {
    if (!idMap.has(value)) {
      counter += 1;
      idMap.set(value, `id-${counter}`);
    }
  };

  const visit = (value: unknown): void => {
    if (typeof value === 'string') {
      for (const match of value.matchAll(UUID_RE)) {
        mapId(match[0]);
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (!isRecord(value)) return;

    const keys = Object.keys(value);
    const allUuidNamedChildren =
      keys.length > 0 &&
      keys.every((key) => {
        if (!UUID_EXACT_RE.test(key)) return false;
        const child = value[key];
        return isRecord(child) && typeof child.name === 'string';
      });
    const ordered = allUuidNamedChildren
      ? [...keys].toSorted((a, b) => {
          const nameA = (value[a] as { name: string }).name;
          const nameB = (value[b] as { name: string }).name;
          return nameA === nameB ? a.localeCompare(b) : nameA < nameB ? -1 : 1;
        })
      : [...keys].toSorted();

    for (const key of ordered) {
      if (UUID_EXACT_RE.test(key)) mapId(key);
      visit(value[key]);
    }
  };

  if (isRecord(input) && 'stages' in input) {
    visit(input.stages);
    for (const key of Object.keys(input)
      .filter((candidate) => candidate !== 'stages')
      .toSorted()) {
      visit(input[key]);
    }
  } else {
    visit(input);
  }

  return idMap;
}

// Apply the tolerance layer (deletions + markdown canonicalization) BEFORE
// id assignment: to-be-deleted subtrees can contain uuids the other document
// lacks (the built form fields' injected `id`s, the canonical
// assetManifest's uuid-shaped `source` filenames), and counting those would
// skew the shared placeholder numbering between the two documents.
function applyTolerances(value: unknown, path: Path): unknown {
  if (Array.isArray(value)) {
    return value.map((item, index) => applyTolerances(item, [...path, index]));
  }
  if (!isRecord(value)) return value;

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    const childPath = [...path, key];
    if (
      DELETED_PATHS.some(
        (rule) => rule.matches(childPath) && (rule.when?.(child) ?? true),
      )
    ) {
      continue;
    }
    const transformed = applyTolerances(child, childPath);
    const isRichText =
      RICH_TEXT_PATHS.some((matches) => matches(childPath)) ||
      isTextItemContent(childPath, value);
    out[key] = isRichText ? canonicalizeMarkdown(transformed) : transformed;
  }
  return out;
}

function remap(value: unknown, idMap: Map<string, string>): unknown {
  if (typeof value === 'string') {
    return value.replace(UUID_RE, (match) => idMap.get(match) ?? match);
  }
  if (Array.isArray(value)) {
    return value.map((item) => remap(item, idMap));
  }
  if (!isRecord(value)) return value;

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    const mappedKey = UUID_EXACT_RE.test(key) ? (idMap.get(key) ?? key) : key;
    out[mappedKey] = remap(child, idMap);
  }
  return out;
}

export function normalizeProtocol(input: unknown): unknown {
  const stripped = applyTolerances(input, []);
  const idMap = assignIds(stripped);
  return remap(stripped, idMap);
}

// Every tolerance above deletes a field from BOTH documents, which makes the
// comparison blind to that field entirely — not just to the historical
// artifact it was meant to forgive. For a spec whose job is to be the
// regression oracle for the redux-form migration, that is the wrong trade:
// a migration that stopped writing form-field ids, or assigned every entity
// the same colour, would produce a document that is still schema-valid and
// still compares equal.
//
// So each deletion that hides a *live* value carries a compensating check
// here, asserted against the BUILT protocol on its own terms. Anything the
// canonical file cannot express (its opaque asset sources, its colour-sequence
// gaps, its per-run timestamp) is checked as an invariant of what Architect
// writes today instead.
//
// The three conditional deletions are the exception, deliberately: each fires
// only when the value IS the default it treats as equivalent to absent
// (`skewedTowardCenter: false`, `automaticLayout: false`, a rule's
// `options.value: ''`). A changed value still compares, and for those three
// "written as the default" and "not written at all" are indistinguishable to
// every consumer — so no regression survives the tolerance.
export function assertBuiltProtocolInvariants(built: unknown): void {
  const problems: string[] = [];
  if (!isRecord(built)) throw new Error('built protocol is not an object');

  // --- lastModified (deleted: re-stamped per commit, so never comparable)
  // The value cannot be compared between runs, but its PRESENCE can, and it
  // is not cosmetic: every accepted commit stamps it and `emptyProtocol()`
  // seeds none, so if the commit pipeline stopped stamping it the exported
  // protocol would carry no modification time at all — at which point the
  // printable summary's cover silently substitutes the current date and
  // misreports when the protocol was last changed.
  const { lastModified } = built;
  if (
    typeof lastModified !== 'string' ||
    !ISO_DATETIME.test(lastModified) ||
    Number.isNaN(Date.parse(lastModified))
  ) {
    problems.push(
      `lastModified ${JSON.stringify(lastModified)} is not an ISO timestamp — every accepted commit must stamp one`,
    );
  }

  // --- assetManifest[*].source (deleted: canonical uses opaque storage keys)
  // Upload writes `source: file.name` and `name: file.name` from the same
  // File, so they must agree; a source whose extension contradicts its type
  // (the '.txt for a video' case) would break export ZIP entries and preview
  // MIME types while still validating.
  const EXTENSIONS: Record<string, RegExp> = {
    image: /\.(png|svg|jpe?g|gif)$/i,
    video: /\.(mov|mp4)$/i,
    audio: /\.(mp3|aiff|m4a)$/i,
    network: /\.(csv|json)$/i,
    geojson: /\.geojson$/i,
  };
  const manifest = isRecord(built.assetManifest) ? built.assetManifest : {};
  for (const [id, entry] of Object.entries(manifest)) {
    if (!isRecord(entry)) {
      problems.push(`assetManifest[${id}] is not an object`);
      continue;
    }
    const { name, source, type } = entry;
    if (typeof source !== 'string' || source === '') {
      problems.push(`assetManifest[${id}].source is missing`);
      continue;
    }
    if (source !== name) {
      problems.push(
        `assetManifest[${id}].source ${JSON.stringify(source)} !== name ${JSON.stringify(name)} — upload derives both from File.name`,
      );
    }
    const expected = typeof type === 'string' ? EXTENSIONS[type] : undefined;
    if (expected && !expected.test(source)) {
      problems.push(
        `assetManifest[${id}].source ${JSON.stringify(source)} does not carry a ${String(type)} extension`,
      );
    }
  }

  // --- codebook.{node,edge}[*].color (deleted: canonical has authoring gaps)
  // Built from scratch, `getNextCategoryColor` assigns from the type count, so
  // N types must hold exactly seq-1..N — distinct and dense. That is what
  // catches "every new type got seq-1", which the canonical file's own gapped
  // sequence (1,2,5,7) cannot be compared against.
  const codebook = isRecord(built.codebook) ? built.codebook : {};
  for (const entity of ['node', 'edge'] as const) {
    const types = isRecord(codebook[entity]) ? codebook[entity] : {};
    // Compared as sorted sets rather than per-type values: the assertion is
    // about the palette being distinct and dense, not about which type drew
    // which colour (creation order is an implementation detail).
    const byText = (a: string, b: string) => a.localeCompare(b);
    const colors = Object.values(types).map((entry) =>
      isRecord(entry) && typeof entry.color === 'string'
        ? entry.color
        : String(entry),
    );
    const expected = colors
      .map((_, index) => `${entity}-color-seq-${index + 1}`)
      .toSorted(byText);
    const actual = colors.toSorted(byText);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      problems.push(
        `codebook.${entity} colours ${JSON.stringify(actual)} are not the dense sequence ${JSON.stringify(expected)}`,
      );
    }
  }

  // --- stages[*].form.fields[*].id (deleted: canonical predates them)
  // DialogArrayField mints these so ordered-list keying survives reorder and
  // delete. PR 2 rewrites that component, so this is precisely the regression
  // this oracle exists to catch.
  const stages = Array.isArray(built.stages) ? built.stages : [];
  const fieldIds = new Set<string>();
  for (const [index, stage] of stages.entries()) {
    if (!isRecord(stage) || !isRecord(stage.form)) continue;
    const fields = Array.isArray(stage.form.fields) ? stage.form.fields : [];
    for (const field of fields) {
      const id = isRecord(field) ? field.id : undefined;
      if (typeof id !== 'string' || id === '') {
        problems.push(`stages[${index}].form has a field with no id`);
        continue;
      }
      if (fieldIds.has(id)) {
        problems.push(`form field id ${id} is reused across forms`);
      }
      fieldIds.add(id);
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `built protocol violates invariants the comparison tolerances hide:\n- ${problems.join('\n- ')}`,
    );
  }
}

// The variables whose forced `required` the comparison is allowed to forgive:
// exactly those a CategoricalBin prompt points at with `otherVariable`. Any
// OTHER text variable that acquires `{required: true}` is a real regression
// (QuickAdd's `name`, or a form variable like `visit_purpose`), and must not
// be swallowed — see dropForcedRequiredValidation.
function collectOtherVariableIds(protocol: unknown): Set<string> {
  const ids = new Set<string>();
  const stages =
    isRecord(protocol) && Array.isArray(protocol.stages) ? protocol.stages : [];
  for (const stage of stages) {
    if (!isRecord(stage) || !Array.isArray(stage.prompts)) continue;
    for (const prompt of stage.prompts) {
      if (isRecord(prompt) && typeof prompt.otherVariable === 'string') {
        ids.add(prompt.otherVariable);
      }
    }
  }
  return ids;
}

// Tolerance (pair-aware): the CategoricalBin other-variable creation path
// hard-codes `validation: { required: true }` onto the text variables it
// creates (withVariableHandlers.tsx), and the only in-editor escape hatch —
// toggling the nested Validation section OFF inside the prompt dialog —
// poisons the saved prompt with a schema-invalid `_modified` key (verified
// live: the commit is rejected with 'Unrecognized key "_modified"'; only the
// STAGE-level `_modified` is stripped at submit). The canonical file's
// other-variables have no validation, so the forced key is dropped from the
// BUILT side — only in the exact case the plan allows: a `type: 'text'`
// variable whose validation is exactly `{required: true}` while the
// canonical counterpart has no validation key at all. Everything else still
// fails. (The QuickAdd `name` variable does NOT need this: its Validation
// section lives in the stage form, where clearing works — see
// editor-sections/quick-add.ts.)
// Scoped to the `otherVariable` targets only. A blanket "any text variable
// with exactly {required:true}" rule would also forgive a regression that
// forced `required` onto QuickAdd's `name` or a form variable like
// `visit_purpose` — schema-valid, so `validateProtocol` would not catch it
// either, and the oracle would pass while the protocol had changed.
export function dropForcedRequiredValidation(
  built: unknown,
  canonical: unknown,
): unknown {
  const forgiven = collectOtherVariableIds(built);

  // `variableId` is the id of the variable object currently being walked, and
  // it is knowable in exactly one place: a `variables` map keys its children
  // by it. `inVariablesMap` marks the step where that is true.
  const walk = (
    builtValue: unknown,
    canonicalValue: unknown,
    variableId: string | undefined,
    inVariablesMap: boolean,
  ): unknown => {
    if (Array.isArray(builtValue) && Array.isArray(canonicalValue)) {
      return builtValue.map((item, index) =>
        walk(item, canonicalValue[index], variableId, false),
      );
    }
    if (!isRecord(builtValue) || !isRecord(canonicalValue)) {
      return builtValue;
    }
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(builtValue)) {
      if (
        key === 'validation' &&
        variableId !== undefined &&
        forgiven.has(variableId) &&
        builtValue.type === 'text' &&
        !('validation' in canonicalValue) &&
        isRecord(child) &&
        Object.keys(child).length === 1 &&
        child.required === true
      ) {
        continue;
      }
      out[key] = walk(
        child,
        canonicalValue[key],
        inVariablesMap ? key : variableId,
        key === 'variables',
      );
    }
    return out;
  };
  return walk(built, canonical, undefined, false);
}
