import { formatObjectPath } from '@codaco/fresco-ui/form/utils/objectPath';

/**
 * Where in the editor a validation problem is about.
 *
 * The protocol is checked as one document, so a problem arrives as a path
 * into it (`stages`, 2, `prompts`, 0, `text`). The editor is organised by
 * section and shows one screen's fields at a time, so the path is turned into
 * the section to open and the form field to focus.
 */
export type ProblemTarget =
  /** A screen, and the names its form may give the field, most specific first. */
  | Readonly<{ kind: 'stage'; stageId: string; fieldNames: readonly string[] }>
  /** A section of the protocol that is not a screen. */
  | Readonly<{ kind: 'section'; section: 'settings' | 'codebook' | 'assets' }>
  /** A problem about the interview as a whole, or the order of its screens. */
  | Readonly<{ kind: 'outline' }>;

/**
 * Resolves the path of a problem found in the assembled protocol.
 *
 * A stage's form holds the stage document, so the path under `stages[i]` is
 * also the name of the field: `prompts[0].text`. A path may name something
 * inside a field rather than the field (`label.en-US` is one language of the
 * `label` field), so every prefix of it is offered, longest first, and the
 * first one the form actually has is where focus goes.
 *
 * A path that names no screen of this protocol, or none at all, is about the
 * interview as a whole and is the outline's to answer for.
 */
export function locateProblem(
  path: readonly (string | number)[],
  stages: readonly Readonly<{ id: string }>[],
): ProblemTarget {
  const [section, index, ...within] = path;
  if (section === 'stages') {
    const stage = typeof index === 'number' ? stages[index] : undefined;
    if (stage === undefined) return { kind: 'outline' };
    return {
      kind: 'stage',
      stageId: stage.id,
      fieldNames: within
        .map((_, length) => formatObjectPath(within.slice(0, length + 1)))
        .toReversed(),
    };
  }
  if (section === 'codebook') return { kind: 'section', section: 'codebook' };
  if (section === 'assetManifest') {
    return { kind: 'section', section: 'assets' };
  }
  if (section === undefined) return { kind: 'outline' };
  return { kind: 'section', section: 'settings' };
}
