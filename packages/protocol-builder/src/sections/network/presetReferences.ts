import { createMessageError } from '@codaco/app-i18n/messages';
import type { Variables } from '@codaco/protocol-validation';

import { unusableVariableIssue } from '../pedigree/slotWiring.ts';
import { networkCanvasMessages } from './networkCanvasMessages.ts';
import { asIdList, asNestedIdList, asText } from './rowValues.ts';

/**
 * Where a preset keeps each of the four references it stores, spelled once.
 *
 * The dialog's controls register at these paths and both gates report against
 * them, so a refusal always lands on the control holding the reference it is
 * about — which two lists of string literals, in two files, could stop being
 * true of each other without anything failing.
 */
export const PRESET_LAYOUT_FIELD = 'layoutVariable';
export const PRESET_GROUP_FIELD = 'groupVariable';
export const PRESET_HIGHLIGHT_FIELD = 'highlight';
export const PRESET_DISPLAY_EDGES_FIELD = 'edges.display';

export type PresetReferenceIssues = Readonly<Record<string, string[]>>;

/**
 * Everything one preset stores that the LIVE codebook has to still support.
 *
 * A preset is four references and a name: the attribute the nodes are
 * positioned by, the attribute they are grouped by, the attributes that make
 * one stand out, and the connection types that are drawn. Every one of them is
 * read out of the codebook at interview time, and every one of them can stop
 * meaning what it meant while this editor is open — a collaborator deletes the
 * attribute, or changes what kind of attribute it is.
 *
 * The pickers already react: they are built from the same live codebook, so a
 * reference that stops qualifying leaves the option list at once. That is not
 * enough on its own, and this is why:
 *
 * - the schema checks that a referenced attribute EXISTS, not what type it is.
 *   A layout attribute retyped to text still validates, and `syncFromNodes`
 *   then has no coordinates to restore, so every authored position is lost. A
 *   grouping attribute retyped to boolean still validates, and `getGroupKeys`
 *   discards the values, so the hulls and the legend disappear. A highlight
 *   attribute retyped to text still validates, and the runtime treats every
 *   nonempty string as "highlighted".
 * - a row nobody has opened goes through no row gate at all, so a stage whose
 *   presets were invalidated while the researcher edited a different section
 *   saved as if nothing had happened.
 *
 * So the rule is asked in both places, from here, and asked of what the preset
 * HOLDS rather than of what anybody touched. There is deliberately no
 * committed-value escape: every other rule in this package lets a reference
 * that arrived with the protocol through, because a pre-existing conflict is
 * somebody's authoring decision — an attribute that is gone, or is now a
 * different kind of thing, is not a decision anybody made, and nothing can be
 * read from it. The same order and the same seam as the pedigree's slot
 * controls and the narrative pedigree's disease rows.
 */
export function presetReferenceIssues(
  allVariables: Readonly<Variables>,
  edgeTypes: ReadonlySet<string>,
  preset: unknown,
): PresetReferenceIssues {
  if (typeof preset !== 'object' || preset === null) return {};
  const row: Record<string, unknown> = { ...preset };
  const issues: Record<string, string[]> = {};

  const add = (field: string, issue: string | undefined) => {
    if (issue === undefined) return;
    const held = issues[field];
    if (held === undefined) issues[field] = [issue];
    else held.push(issue);
  };

  add(
    PRESET_LAYOUT_FIELD,
    unusableVariableIssue(
      allVariables,
      asText(row[PRESET_LAYOUT_FIELD]),
      'layout',
    ),
  );
  add(
    PRESET_GROUP_FIELD,
    unusableVariableIssue(
      allVariables,
      asText(row[PRESET_GROUP_FIELD]),
      'categorical',
    ),
  );
  for (const variableId of asIdList(row[PRESET_HIGHLIGHT_FIELD]) ?? []) {
    add(
      PRESET_HIGHLIGHT_FIELD,
      unusableVariableIssue(allVariables, variableId, 'boolean'),
    );
  }
  for (const edgeTypeId of asNestedIdList(row.edges, 'display') ?? []) {
    if (edgeTypes.has(edgeTypeId)) continue;
    add(
      PRESET_DISPLAY_EDGES_FIELD,
      createMessageError(networkCanvasMessages.presetMissingEdgeTypeRefusal, {
        edgeTypeId,
      }),
    );
  }

  return issues;
}

/** Whether this preset holds a reference the protocol can no longer serve. */
export const presetHasUnusableReference = (
  allVariables: Readonly<Variables>,
  edgeTypes: ReadonlySet<string>,
  preset: unknown,
): boolean =>
  Object.keys(presetReferenceIssues(allVariables, edgeTypes, preset)).length >
  0;
