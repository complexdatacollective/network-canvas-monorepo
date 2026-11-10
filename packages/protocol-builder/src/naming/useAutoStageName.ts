import { useCallback, useEffect } from 'react';

import { useStageEditorForm } from '../form/stageEditorContext.ts';
import { useProtocolLocalization } from '../localization/ProtocolLocalization.tsx';
import { useLatest } from '../state/useLatest.ts';
import { computeAutoNameUpdate } from './computeAutoNameUpdate.ts';
import {
  forgetStageNameOwnership,
  generatedProposal,
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
  const defaultLocale = useProtocolLocalization()?.defaultLocale;
  const liveLabel = useLiveStageLabel();
  const proposal = useProposedStageLabel();
  const write = useStageNameWriter();

  // The stable blur handler reads the latest values, not the ones it closed
  // over.
  const latestLiveLabel = useLatest(liveLabel);
  const latestProposal = useLatest(proposal);

  // StrictMode tears the editor down and mounts it again at once, and the form
  // empties its values in between. A record kept across that would read the
  // emptied name as one the researcher cleared, and never propose it again.
  useEffect(() => () => forgetStageNameOwnership(storeApi), [storeApi]);

  useEffect(() => {
    // Nothing proposed into a stage this session may not write, and no
    // refusal reported for it: nobody asked for this write, and a create still
    // waiting on its acquire would meet a banner about a name nobody typed.
    // The effect re-runs when the acquire settles. Likewise before the
    // protocol's languages are known: there is no default language to name
    // the stage in yet. And when there is no proposal because Network Canvas
    // supplies no wording in the default language: nothing is written, and the
    // name is the researcher's to enter.
    if (readOnly || defaultLocale === undefined || proposal === undefined) {
      return;
    }
    const ownership = stageNameOwnership(storeApi);
    const update = computeAutoNameUpdate({
      isNewStage,
      isCustom: ownership.isCustom,
      liveLabel,
      lastGenerated: generatedProposal(ownership, defaultLocale),
      generatedLabel: proposal,
    });
    ownership.isCustom = update.nextIsCustom;
    if (update.label !== undefined) {
      write(update.label, 'proposed');
    }
  }, [
    defaultLocale,
    isNewStage,
    liveLabel,
    proposal,
    readOnly,
    storeApi,
    write,
  ]);

  const onBlur = useCallback(() => {
    if (!isNewStage || readOnly) return;
    const proposed = latestProposal();
    if (latestLiveLabel().trim() === '' && proposed !== undefined) {
      write(proposed, 'proposed');
    }
  }, [isNewStage, latestLiveLabel, latestProposal, readOnly, write]);

  return { onBlur };
}
