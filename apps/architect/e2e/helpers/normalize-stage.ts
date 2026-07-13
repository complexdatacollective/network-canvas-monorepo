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

  const walk = (value: unknown): unknown => {
    if (typeof value === 'string') {
      return value.replace(UUID_RE, (match) => mapId(match));
    }
    if (Array.isArray(value)) {
      return value.map(walk);
    }
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value)) {
        out[key] =
          key === 'id' && typeof val === 'string' ? mapId(val) : walk(val);
      }
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
// (oxfmt, via lint-staged) normalizes every committed text file to end with
// exactly one trailing newline, so a snapshot written without one silently
// drifts out of sync with the live-computed string the moment `git commit`
// reformats it. Appending the newline up front keeps `--update-snapshots`
// output and every later commit producing byte-identical files.
export function stageSnapshotJson(stage: unknown): string {
  return `${JSON.stringify(normalizeStage(stage), null, 2)}\n`;
}
