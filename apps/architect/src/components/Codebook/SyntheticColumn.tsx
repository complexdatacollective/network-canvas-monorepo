import { useCallback, useEffect } from 'react';

import type { Variable, VariableSynthetic } from '@codaco/protocol-validation';
import { useAppDispatch } from '~/ducks/hooks';
import { updateVariableAsync } from '~/ducks/modules/protocol/codebook';

import { codebookVariableLandingMarker } from './deepLink';
import { asSyntheticVariableDraft } from './VariableSynthetic/draft';
import type { VariableImpliedRules } from './VariableSynthetic/impliedRules';
import {
  useVariableSynthetic,
  VariableSyntheticProvider,
} from './VariableSynthetic/VariableSyntheticProvider';
import { VariableSyntheticSection } from './VariableSynthetic/VariableSyntheticSection';

/**
 * The synthetic cells of the codebook's attribute table (spec revision 2,
 * item 6: the Codebook absorbs the removed overview screen).
 *
 * One column carries BOTH the summary and the editing, because they are one
 * value: the shared sub-editor's collapsed row already states what generation
 * would produce for this attribute — resolved through the schema, so it cannot
 * disagree with the draw — and expands in place to the controls that change it.
 * A second read-only column restating that summary would be a second spelling
 * of one number, free to drift from it.
 *
 * The other column is what the summary cannot say: which of the protocol's own
 * interfaces have already decided part of the answer, in whole sentences naming
 * the stage responsible.
 */

/** What an attribute with no interface-implied rules shows. */
const NO_NOTES_LABEL = 'Nothing';

/**
 * What an attribute generation writes no value for shows instead of an empty
 * cell — a layout or location attribute, whose positions generation derives
 * rather than draws.
 */
const NOTHING_GENERATED =
  'Nothing is generated for this attribute — its values are derived rather than drawn.';

export type SyntheticNotesCellProps = {
  notes: readonly string[];
};

export function SyntheticNotesCell({ notes }: SyntheticNotesCellProps) {
  if (notes.length === 0) {
    return (
      <div className="whitespace-normal">
        <span aria-hidden className="text-muted">
          —
        </span>
        <span className="sr-only">{NO_NOTES_LABEL}</span>
      </div>
    );
  }

  return (
    <ul className="m-0 max-w-prose list-none space-y-1 p-0 whitespace-normal">
      {notes.map((note) => (
        <li key={note}>{note}</li>
      ))}
    </ul>
  );
}

/**
 * Opens this row's sub-editor because a link asked for it.
 *
 * A `?entity=…&variable=…` link is a request to work on that attribute, so it
 * arrives with the attribute's generation settings already open rather than one
 * click short of them. Mounted only while this row is the target, and its
 * effect runs once — collapsing the section afterwards is the researcher's to
 * do, and nothing re-opens it behind them.
 */
function OpenOnDeepLink() {
  const { setOpen } = useVariableSynthetic();

  useEffect(() => {
    setOpen(true);
  }, [setOpen]);

  return null;
}

/**
 * The sub-editor, or a sentence where there is nothing to edit.
 *
 * WHICH attributes have nothing is the schema's answer, not this file's:
 * `resolveVariableSynthetic` resolves no descriptor for exactly the attributes
 * generation writes no drawn value for, and the provider hands that answer down
 * as `resolved`. Listing the types here would be the same claim, restated where
 * it could drift.
 */
function SyntheticSummaryOrSection({ title }: { title: string }) {
  const { resolved } = useVariableSynthetic();

  if (resolved === undefined) {
    return <p className="text-text/70 m-0 text-sm">{NOTHING_GENERATED}</p>;
  }

  return <VariableSyntheticSection title={title} />;
}

export type SyntheticEditorCellProps = {
  entity: 'node' | 'edge' | 'ego';
  type?: string | undefined;
  variableId: string;
  /** The attribute exactly as the stored codebook holds it. */
  definition: unknown;
  /** What the protocol's interfaces impose on it. */
  implied: VariableImpliedRules;
  /** True while a `?variable=` deep link names this row. */
  targeted: boolean;
};

export function SyntheticEditorCell({
  entity,
  type,
  variableId,
  definition,
  implied,
  targeted,
}: SyntheticEditorCellProps) {
  const dispatch = useAppDispatch();
  const draft = asSyntheticVariableDraft(definition);

  /**
   * Commits the block the sub-editor proposes, exactly as the type editor
   * serialises it: `replaceProperties` drops the stored `synthetic` key before
   * the new one lands, so an emptied weight table really empties rather than
   * merging with what was there — and an `undefined` block (the reset
   * affordance) prunes away to no key at all, which is what "default" means
   * (spec governing rule 4).
   */
  const handleChange = useCallback(
    (next: VariableSynthetic | undefined) => {
      void dispatch(
        updateVariableAsync({
          entity,
          ...(type === undefined ? {} : { type }),
          variable: variableId,
          configuration: { synthetic: next } as Partial<Variable>,
          replaceProperties: ['synthetic'],
        }),
      );
    },
    [dispatch, entity, type, variableId],
  );

  // An entry the codebook holds that is not a variable at all (an imported
  // protocol can carry anything) has nothing to author and no summary to show.
  if (draft === undefined) return null;

  return (
    <div
      className="min-w-64 whitespace-normal"
      // Where a link to this attribute lands. The row it scrolls to is marked
      // on the name cell, whose first control is the rename pill — so without
      // this a link that opened these very settings put focus at the other end
      // of the table and left the researcher to find them.
      {...codebookVariableLandingMarker(
        { entity, ...(type === undefined ? {} : { type }) },
        variableId,
      )}
    >
      <VariableSyntheticProvider
        variable={draft}
        implied={implied}
        // Unique per attribute across the whole screen: the codebook lists
        // every type's attributes on one page, and two controls sharing a
        // field name would share an id.
        namePrefix={`codebook.${entity}.${type ?? ''}.${variableId}.synthetic`}
        // There is no options editor beside the table to grow a weight column,
        // so each attribute's weights are drawn inside its own section.
        optionWeightsHost="inline"
        onChange={handleChange}
      >
        {targeted && <OpenOnDeepLink />}
        {/*
          Named by the attribute rather than by the feature: a table of
          identically named disclosures is one control to anyone navigating by
          a list of buttons — the same reason `CodebookVariablesSynthetic`
          titles its list by attribute name.
        */}
        <SyntheticSummaryOrSection title={draft.name} />
      </VariableSyntheticProvider>
    </div>
  );
}
