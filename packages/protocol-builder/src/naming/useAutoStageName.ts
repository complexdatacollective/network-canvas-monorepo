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
   * Hand to the name control's own blur.
   *
   * The other half of the policy, and the half that cannot be an effect: a
   * name cleared and left empty gets the proposal back, while a name cleared
   * and still being typed into does not — and "still being typed into" is an
   * event about focus, not a value the form holds. Without it a researcher
   * renaming a stage is fought on the keystroke that empties the box.
   *
   * `fields/StageNameField` takes it as `onBlur`; a host drawing its own
   * control passes it to whatever it draws.
   */
  onBlur: () => void;
}>;

/**
 * Names a stage being created, unasked, from what it collects.
 *
 * OPT-IN, and that is the point of it being a hook of its own. Writing a name
 * nobody asked for is an authoring product's decision — Architect wants a new
 * stage to arrive with something to recognise it by rather than an empty
 * heading to fill in first — and a host that wants researchers to name their
 * own stages simply does not call this. What stays in the package either way
 * is the part that is protocol semantics: a name a PERSON chose is never
 * written over, which this enforces and `useStageName` cannot be made to
 * violate.
 *
 * Only a stage being CREATED is named this way. A stage the interview already
 * contains was opened to be looked at, and filling in a name it never had
 * would be this editor writing into somebody's protocol unasked.
 *
 * Call it beside the one caller of `useStageNameField` — the same component
 * that draws the title. It registers nothing itself, so a second caller would
 * be two writers of one policy rather than a broken field, but it would still
 * be two.
 */
export function useAutoStageName(): AutoStageName {
  const { storeApi, creation, readOnly } = useStageEditorForm();
  const isNewStage = creation !== undefined;
  const liveLabel = useLiveStageLabel();
  const proposal = useProposedStageLabel();
  const write = useStageNameWriter();

  // Kept current each render so the stable blur handler reads the latest
  // values rather than the ones it closed over.
  const liveLabelRef = useRef(liveLabel);
  liveLabelRef.current = liveLabel;
  const proposalRef = useRef(proposal);
  proposalRef.current = proposal;

  useEffect(() => {
    // Nothing is proposed into a stage this session may not write. The
    // refusal is not reported either, because nobody asked for this write:
    // a spectator, and a create still waiting on its acquire, would both meet
    // an error banner about a name they never typed. The effect re-runs when
    // the acquire settles, and names the stage then.
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

  // Re-engage on blur: if the researcher cleared the name and tabs away while
  // it is still empty, fill the proposal back in — rather than fighting their
  // keystrokes the instant the field goes empty.
  const onBlur = useCallback(() => {
    if (!isNewStage || readOnly) return;
    if (liveLabelRef.current.trim() === '' && proposalRef.current) {
      write(proposalRef.current, 'proposed');
    }
  }, [isNewStage, readOnly, write]);

  return { onBlur };
}
