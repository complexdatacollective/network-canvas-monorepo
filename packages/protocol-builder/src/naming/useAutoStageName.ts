import { useCallback, useEffect, useRef } from 'react';

import { useStageEditorForm } from '../form/stageEditorContext.ts';
import { computeAutoNameUpdate } from './computeAutoNameUpdate.ts';
import {
  stageNameOwnership,
  useLiveStageLabel,
  useProposedStageLabel,
  useStageNameWriter,
} from './stageNameInternals.ts';

export type AutoStageName = Readonly<{
  /**
   * Hand to the name control's own blur. The half of the policy that cannot be
   * an effect: a name cleared and LEFT empty gets the proposal back, and one
   * still being typed into does not — which is an event about focus rather
   * than a value the form holds.
   */
  onBlur: () => void;
}>;

/**
 * Names a stage being created, unasked, from what it collects.
 *
 * OPT-IN, which is the point of the separate hook: writing a name nobody asked
 * for is an authoring product's decision. What stays in the package either way
 * is the protocol semantics — a name a PERSON chose is never written over.
 *
 * Only a stage being CREATED. Filling in a name an existing stage never had
 * would be this editor writing into somebody's protocol unasked.
 *
 * Call it beside the one caller of `useStageNameField`: two callers would be
 * two writers of one policy.
 */
export function useAutoStageName(): AutoStageName {
  const { storeApi, creation, readOnly } = useStageEditorForm();
  const isNewStage = creation !== undefined;
  const liveLabel = useLiveStageLabel();
  const proposal = useProposedStageLabel();
  const write = useStageNameWriter();

  // The stable blur handler reads the latest values, not the ones it closed
  // over.
  const liveLabelRef = useRef(liveLabel);
  liveLabelRef.current = liveLabel;
  const proposalRef = useRef(proposal);
  proposalRef.current = proposal;

  useEffect(() => {
    // Nothing proposed into a stage this session may not write, and no
    // refusal reported for it: nobody asked for this write, and a create still
    // waiting on its acquire would meet a banner about a name nobody typed.
    // The effect re-runs when the acquire settles.
    if (readOnly) return;
    const ownership = stageNameOwnership(storeApi);
    const update = computeAutoNameUpdate({
      isNewStage,
      isCustom: ownership.isCustom,
      liveLabel,
      lastGenerated: ownership.lastGenerated,
      generatedLabel: proposal,
    });
    ownership.isCustom = update.nextIsCustom;
    if (update.label !== undefined) {
      write(update.label, 'proposed');
    }
  }, [isNewStage, liveLabel, proposal, readOnly, storeApi, write]);

  const onBlur = useCallback(() => {
    if (!isNewStage || readOnly) return;
    if (liveLabelRef.current.trim() === '' && proposalRef.current) {
      write(proposalRef.current, 'proposed');
    }
  }, [isNewStage, readOnly, write]);

  return { onBlur };
}
