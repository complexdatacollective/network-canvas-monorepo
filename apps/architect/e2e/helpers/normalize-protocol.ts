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
export function dropForcedRequiredValidation(
  built: unknown,
  canonical: unknown,
): unknown {
  const walk = (builtValue: unknown, canonicalValue: unknown): unknown => {
    if (Array.isArray(builtValue) && Array.isArray(canonicalValue)) {
      return builtValue.map((item, index) => walk(item, canonicalValue[index]));
    }
    if (!isRecord(builtValue) || !isRecord(canonicalValue)) {
      return builtValue;
    }
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(builtValue)) {
      if (
        key === 'validation' &&
        builtValue.type === 'text' &&
        !('validation' in canonicalValue) &&
        isRecord(child) &&
        Object.keys(child).length === 1 &&
        child.required === true
      ) {
        continue;
      }
      out[key] = walk(child, canonicalValue[key]);
    }
    return out;
  };
  return walk(built, canonical);
}
