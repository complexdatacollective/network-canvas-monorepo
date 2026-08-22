import { useCallback, useMemo } from 'react';
import { shallowEqual } from 'react-redux';

import type { Variable, VariableSynthetic } from '@codaco/protocol-validation';
import {
  asSyntheticVariableDraft,
  type SyntheticVariableDraft,
} from '~/components/Codebook/VariableSynthetic/draft';
import { variableImpliedRules } from '~/components/Codebook/VariableSynthetic/impliedRules';
import { VariableSyntheticProvider } from '~/components/Codebook/VariableSynthetic/VariableSyntheticProvider';
import {
  variableTypeSupportsSynthetic,
  VariableSyntheticSection,
} from '~/components/Codebook/VariableSynthetic/VariableSyntheticSection';
import { useAppDispatch, useAppSelector } from '~/ducks/hooks';
import { updateVariableAsync } from '~/ducks/modules/protocol/codebook';
import { getVariablesForSubjectSelector } from '~/selectors/codebook';

import type { StageWrittenVariable } from './stageWrittenVariables';

/**
 * The shared variable sub-editor, mounted inside a stage's "Synthetic data"
 * section for the attributes that stage writes (spec revision 2, item 4).
 *
 * ONE component, two homes. This is the same
 * `VariableSyntheticProvider`/`VariableSyntheticSection` pair the Codebook
 * renders — a bin's option weights authored here and authored there are the
 * same control writing the same key, not two editors kept in step.
 *
 * ## How an edit here reaches the codebook
 *
 * Not through the stage form. A stage's form values become a STAGE on save;
 * they carry no codebook, and inventing a path for one would make this the
 * only surface in the app that saves a variable through a stage.
 *
 * It goes the way the one existing stage-editor surface that edits
 * codebook-adjacent data goes — `CodebookVariableValidationSection`, which
 * writes a variable's validation rules from inside a stage: dispatch
 * `updateVariableAsync` on every accepted change, and let the stage editor's
 * codebook TRANSACTION make it transactional. `StageFormBridge` opens that
 * transaction on mount (`openStageEditorDraft`), after which
 * `routeCodebookAction` stamps every `codebook/*` action for the draft copy
 * held in `stageEditorDraft`; `getProtocol` overlays that copy, so the whole
 * UI — this editor included — reads back what was just written. Committing the
 * stage promotes the draft codebook with it in one action, and Cancel or
 * discard drops it.
 *
 * So the seam is real and already load-bearing: an edit made here is saved by
 * the stage's own save and discarded by its own Cancel, without a codebook key
 * ever appearing in the stage's form values — and the canonical protocol sees
 * nothing until the stage is committed.
 */

/** A primary written attribute the codebook still has, and can author. */
export type StageEditableVariable = StageWrittenVariable & {
  variable: SyntheticVariableDraft & { name: string };
};

/**
 * The primary written attributes that actually have something to author.
 *
 * Two are dropped: one the codebook no longer holds (a binding left behind by
 * a deleted attribute), and one whose TYPE carries no synthetic block at all —
 * asked of the sub-editor rather than listed here, so the two cannot disagree
 * about which types those are. Resolved in the owning section rather than per
 * row, because "is there anything to show?" decides whether the heading and
 * its explanation belong on screen at all.
 */
export const useStageEditableVariables = (
  written: readonly StageWrittenVariable[],
): StageEditableVariable[] => {
  const found = useAppSelector(
    (state) =>
      written.map(
        (entry) =>
          getVariablesForSubjectSelector(state, entry.subject)[
            entry.variableId
          ],
      ),
    // Element-wise, so an unrelated protocol edit does not hand this component
    // a fresh array and re-render every sub-editor under it.
    shallowEqual,
  );

  return useMemo(
    () =>
      written.flatMap((entry, index) => {
        const draft = asSyntheticVariableDraft(found[index]);
        if (draft === undefined) return [];
        if (!variableTypeSupportsSynthetic(draft.type)) return [];
        return [{ ...entry, variable: draft }];
      }),
    [written, found],
  );
};

type OneVariableProps = {
  editable: StageEditableVariable;
  protocol: unknown;
};

const OneVariable = ({ editable, protocol }: OneVariableProps) => {
  const dispatch = useAppDispatch();
  const { variableId, subject, variable } = editable;

  /**
   * What the protocol's interfaces impose on this attribute, collected from
   * the DRAFT document rather than the saved one — so a bin whose variable was
   * bound a moment ago already says "always answered", and names this stage.
   *
   * That draft changes on every edit anywhere in the stage form, so this is one
   * reference walk per edit. Deliberately not deferred or throttled: the owning
   * section already runs several whole-stage schema parses on the same cadence
   * (`stageSyntheticSupport`, `resolveStageSynthetic`), and the walk prunes to
   * the reference-bearing subtrees, so it is the smaller half of what a
   * keystroke costs here. The heavy analysis — feasibility — is the one that is
   * debounced.
   */
  const implied = useMemo(
    () => variableImpliedRules(protocol, subject, variableId),
    [protocol, subject, variableId],
  );

  const handleChange = useCallback(
    (next: VariableSynthetic | undefined) => {
      void dispatch(
        updateVariableAsync({
          variable: variableId,
          // `replaceProperties` is what makes reset a REMOVAL: the reducer
          // drops the named keys from the existing variable before merging
          // the configuration, so an empty one leaves the variable with no
          // `synthetic` key rather than with an empty block.
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion
          configuration: (next === undefined
            ? {}
            : { synthetic: next }) as Partial<Variable>,
          replaceProperties: ['synthetic'],
        }),
      );
    },
    [dispatch, variableId],
  );

  return (
    <li className="min-w-0">
      <VariableSyntheticProvider
        variable={variable}
        implied={implied}
        // Scoped by the attribute, so two of them on one stage are two sets of
        // fields and neither collides with the stage's own `synthetic.*`
        // paths.
        namePrefix={`codebook.${variableId}.synthetic`}
        // No options editor on this surface for a weight column to appear in,
        // so weights are drawn inside the section itself — exactly as the
        // Codebook's per-attribute list does it.
        optionWeightsHost="inline"
        onChange={handleChange}
      >
        {/*
          Titled by the attribute rather than by the feature: the section
          around this list is what carries the term "Synthetic data", and a
          stack of identically named disclosures would be one control to
          anyone navigating by a list of buttons.
        */}
        <VariableSyntheticSection title={variable.name} />
      </VariableSyntheticProvider>
    </li>
  );
};

export type StageVariableSyntheticProps = {
  variables: readonly StageEditableVariable[];
  /**
   * The protocol the implied rules are collected from — the draft document
   * this section already builds, so a bin whose variable was bound a moment
   * ago already implies its rule.
   */
  protocol: unknown;
};

export function StageVariableSynthetic({
  variables,
  protocol,
}: StageVariableSyntheticProps) {
  return (
    <ul className="flex list-none flex-col gap-2 p-0">
      {variables.map((editable) => (
        <OneVariable
          key={`${editable.subject.entity}:${editable.subject.type ?? ''}:${editable.variableId}`}
          editable={editable}
          protocol={protocol}
        />
      ))}
    </ul>
  );
}
