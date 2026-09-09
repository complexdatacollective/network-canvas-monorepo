import { useMemo } from 'react';

import { useStageValue } from '../../form/stageFormHooks.ts';
import { asText } from './rowValues.ts';

/**
 * What THIS composer writes to its node type, and by which rules, as the
 * unsaved draft holds it.
 *
 * The package's role map is built from the authoritative protocol with the
 * edited stage excluded — its own committed picks are claims made BY the
 * pickers reading that map, and counting them would make a stage refuse to
 * re-save itself. That leaves one thing nothing accounts for: what this stage
 * writes RIGHT NOW. A composer both collects node attributes through the
 * codebook's rules (the quick-add field, and every field of its node form) and
 * writes them around those rules (the position attribute, and the grouping the
 * participant lassoes and taps), so its two kinds of writer can meet on one
 * attribute inside a single stage — which the schema's own role-conflict rule
 * refuses, and which neither the pickers nor the save gates could see.
 *
 * Only the stage's own SUBJECT is described here. A connection form writes the
 * attributes of its edge type, and nothing else on a composer touches those,
 * so an edge form's fields are neither in these sets nor judged against them.
 *
 * Read from the draft rather than from the committed stage, because that is
 * the point: an attribute the researcher bound a moment ago is a write no
 * section holds yet.
 */
export type ComposerDraftWriters = Readonly<{
  /** Collected through the codebook's own rules. */
  validated: ReadonlySet<string>;
  /** Written straight onto the node, around those rules. */
  unvalidated: ReadonlySet<string>;
}>;

const QUICK_ADD_FIELD = 'quickAdd';
const LAYOUT_VARIABLE_FIELD = 'layoutVariable';
const CONVEX_HULL_FIELD = 'convexHullVariable';
const NODE_FORM_FIELD = 'nodeForm.fields';

const formFieldVariables = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.flatMap((row) => {
        if (typeof row !== 'object' || row === null) return [];
        const variable = asText(Reflect.get(row, 'variable'));
        return variable === undefined ? [] : [variable];
      })
    : [];

export function useComposerDraftWriters(): ComposerDraftWriters {
  const quickAdd = asText(useStageValue(QUICK_ADD_FIELD));
  const layout = asText(useStageValue(LAYOUT_VARIABLE_FIELD));
  const hull = asText(useStageValue(CONVEX_HULL_FIELD));
  const nodeFormFields = useStageValue(NODE_FORM_FIELD);

  return useMemo(
    () => ({
      validated: new Set(
        [quickAdd, ...formFieldVariables(nodeFormFields)].filter(
          (variable) => variable !== undefined,
        ),
      ),
      unvalidated: new Set(
        [layout, hull].filter((variable) => variable !== undefined),
      ),
    }),
    [hull, layout, nodeFormFields, quickAdd],
  );
}
