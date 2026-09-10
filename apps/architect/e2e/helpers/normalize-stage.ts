import { format } from 'oxfmt';

// Replace generated ids with stable, position-based placeholders so a stage
// read back via `readStageJson` (Task 3) can be snapshotted deterministically
// across runs. Ids the app generates at runtime are real `uuid` v4 strings
// (`import { v4 as uuid } from 'uuid'` — ducks/modules/protocol/codebook.ts
// for variable/type ids, Form/DialogArrayField.tsx for prompt/field array
// item ids), so a plain UUID-shaped regex genuinely covers them.
//
// Every key literally named `id` is *also* remapped unconditionally (not just
// when its value happens to be UUID-shaped): a freshly-created stage's own
// `id`, and every prompt/field array item's `id`, are always real uuids in
// practice, and normalizing the key rather than only the value keeps the
// mapping stable even for a hand-authored, non-uuid id slipping through
// (e.g. from a fixture) — it still becomes a deterministic placeholder rather
// than leaking into the snapshot verbatim.
//
// The two paths share one `idMap`, so a uuid referenced both as a keyed `id`
// (e.g. a codebook variable's own id, if ever included) and as a plain string
// value elsewhere (e.g. `form.fields[].variable` pointing at that same
// variable) collapses to the same placeholder — snapshots stay internally
// consistent, not just individually stable.
const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * Switches whose absence and whose stored `false` mean the same thing.
 *
 * Architect's own editors force-wrote `false` for every toggle they mounted,
 * so a stage saved through them carried a decision the researcher never made;
 * the canonical sample protocol, and every stage saved by the protocol-builder
 * editors, simply lack the key. Each of these is a switch the interview reads
 * as off when it is not there — `behaviours.automaticLayout`
 * (`stage.behaviours?.automaticLayout ? …`), `behaviours.freeDraw`
 * (`get(stage, 'behaviours.freeDraw', false)`), and `mapOptions.showTransit`
 * and `mapOptions.allowSearch`, which the Geospatial map reads as plain
 * falsy — so the two spellings are the same stage to a participant.
 *
 * `background.skewedTowardCenter` is deliberately NOT one of them, though it
 * looks like one: `ConcentricCircles` defaults `skewed` to `true`, so an
 * absent key draws the skewed rings and a stored `false` draws even ones. The
 * canvas interfaces answer it instead, from their template
 * (`@codaco/protocol-builder`'s `interfaces/templates.ts`).
 *
 * Only `false` is dropped. A switch stored as `true` is a decision, and still
 * compares strictly.
 */
const ABSENT_WHEN_FALSE: readonly (readonly string[])[] = [
  ['behaviours', 'automaticLayout'],
  ['behaviours', 'freeDraw'],
  ['mapOptions', 'showTransit'],
  ['mapOptions', 'allowSearch'],
];

const isAbsentWhenFalse = (path: readonly string[]): boolean =>
  ABSENT_WHEN_FALSE.some(
    (candidate) =>
      candidate.length === path.length &&
      candidate.every((part, index) => part === path[index]),
  );

// Not exported: every consumer wants the snapshot-ready string produced by
// `stageSnapshotJson` below, not this intermediate object — see its comment.
function normalizeStage(input: unknown): unknown {
  let counter = 0;
  const idMap = new Map<string, string>();

  const mapId = (value: string): string => {
    const existing = idMap.get(value);
    if (existing) return existing;
    counter += 1;
    const placeholder = `id-${counter}`;
    idMap.set(value, placeholder);
    return placeholder;
  };

  const walk = (value: unknown, path: readonly string[] = []): unknown => {
    if (typeof value === 'string') {
      return value.replace(UUID_RE, (match) => mapId(match));
    }
    if (Array.isArray(value)) {
      // Array indices are not part of a path: the rules above are about a
      // named switch wherever it is stored, and a prompt's index is not
      // something a rule should have to spell out.
      return value.map((item) => walk(item, path));
    }
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      let dropped = 0;
      // Keys in one order, chosen here rather than taken from the editor.
      // A stage document is a JSON object, whose keys carry no order of their
      // own — nothing reads a protocol by key position — so the order a
      // particular form happened to assemble them in is incidental to the
      // saved stage in exactly the way a generated id is. Left alone, these
      // snapshots would fail whenever a section was written in a different
      // sequence, which is a fact about the editor and not about what it
      // saved.
      for (const key of Object.keys(value).toSorted()) {
        const val = (value as Record<string, unknown>)[key];
        const here = [...path, key];
        if (val === false && isAbsentWhenFalse(here)) {
          dropped += 1;
          continue;
        }
        const written =
          key === 'id' && typeof val === 'string'
            ? mapId(val)
            : walk(val, here);
        if (written === undefined) {
          dropped += 1;
          continue;
        }
        out[key] = written;
      }
      // A container left holding nothing BY that rule is the rule's own
      // consequence — a Sociogram whose only behaviour was its layout mode is
      // a stage with no behaviours at all — so it goes with the key. A
      // container that was already empty is content, and stays.
      if (dropped > 0 && Object.keys(out).length === 0) return undefined;
      return out;
    }
    return value;
  };

  return walk(input);
}

// `expect(value).toMatchSnapshot('foo.json')` is Playwright's *file* snapshot
// mode: the argument is written/compared as raw file bytes, so it must be a
// string — handing it `normalizeStage`'s plain object throws `TypeError:
// file.slice is not a function` deep inside Playwright's snapshot writer.
// `JSON.stringify` alone isn't enough either: the repo's pre-commit formatter
// (oxfmt, via lint-staged) reformats every committed `.json` file — not just
// appending a trailing newline (which every snapshot to date incidentally
// already needed), but also collapsing any array/object that fits within its
// print width onto a single line (verified directly: `oxfmt` turns a
// 2-space-indented `[lng, lat]` tuple like Geospatial's `mapOptions.center`
// into `[lng, lat]` on one line, while a multi-key object array like a
// `prompts` entry is left alone because it doesn't fit). No earlier spec's
// snapshot had a short primitive-array field, so this went unnoticed until
// Geospatial's `center`/`initialZoom` — the committed file drifted out of
// sync with the live-computed string the moment `git commit` ran the hook,
// exactly the same failure mode the trailing-newline fix above already
// guards against, just for a case that fix didn't cover. Running the raw
// `JSON.stringify` output through the SAME oxfmt version the pre-commit
// hook uses (rather than hand-reimplementing its print-width rules) is the
// only way to guarantee byte-identity with whatever the hook produces.
// oxfmt is a direct devDependency of @codaco/architect (so it is present in
// the filtered Docker/CI install) and exposes an in-process `format` API —
// no per-assertion process spawn, let alone a `pnpm exec` round trip (pnpm
// re-verifies the workspace on every invocation). The API is called without
// options: the repo's .oxfmtrc.json JSON-affecting options (printWidth,
// tabWidth, useTabs, endOfLine) all equal oxfmt's defaults — verified
// byte-identical against committed hook-formatted snapshots — and if that
// ever diverges, the very next CI run fails the snapshot comparison loudly
// rather than drifting silently.
async function formatWithOxfmt(raw: string): Promise<string> {
  const { code, errors } = await format('stage-snapshot.json', raw);
  if (errors.length > 0) {
    throw new Error(
      `oxfmt formatting failed: ${errors.map((e) => e.message).join('; ')}`,
    );
  }
  return code;
}

export function stageSnapshotJson(stage: unknown): Promise<string> {
  return formatWithOxfmt(JSON.stringify(normalizeStage(stage), null, 2));
}
