import { useCallback } from 'react';

import { useStageEditorForm } from '../form/stageEditorContext.ts';
import {
  translationText,
  withTranslation,
} from '../localization/localizedText.ts';
import { useEditingLanguage } from '../localization/ProtocolLocalization.tsx';
import type { StageFormDraft } from '../stageDocument.ts';
import { LABEL, stageNameOwnership } from './stageNameInternals.ts';

export type StandingStageNameProposal = Readonly<{
  /**
   * Whether the name on the stage right now is the one this editor proposed,
   * untouched. A question asked at the moment of calling, from an event
   * handler or a store subscription: who wrote the name is not something the
   * form re-renders for.
   */
  isStanding: () => boolean;
  /**
   * `draft` with a standing proposal taken back out of its name, so it can be
   * compared with what the protocol holds. A name nobody chose is not work
   * anybody would lose: cancelling a new stage that holds nothing else asks
   * nothing.
   *
   * Only the default-language translation goes, because that is the only one
   * a proposal writes. A translation the researcher added beside it is still
   * theirs, and still unsaved.
   */
  withoutProposal: (
    draft: StageFormDraft,
    committed: StageFormDraft,
  ) => StageFormDraft;
}>;

/**
 * Whether the name `useAutoStageName` proposed still stands.
 *
 * Read-only, and callable anywhere in the editor: unlike `useAutoStageName`,
 * which is the one writer of the proposal, this only asks after it. A host
 * that never opted into proposals gets a proposal that never stands.
 *
 * Only a stage being CREATED. An existing stage's name is the protocol's, even
 * when the researcher accepted a proposal for it: that is a rename, and
 * unsaved.
 */
export function useStandingStageNameProposal(): StandingStageNameProposal {
  const { storeApi, creation } = useStageEditorForm();
  const { localization } = useEditingLanguage();
  const isNewStage = creation !== undefined;
  const defaultLocale = localization?.defaultLocale;

  const standsIn = useCallback(
    (label: unknown) => {
      if (!isNewStage || defaultLocale === undefined) return false;
      const { isCustom, lastGenerated } = stageNameOwnership(storeApi);
      return (
        !isCustom &&
        lastGenerated !== undefined &&
        translationText(label, defaultLocale) === lastGenerated
      );
    },
    [defaultLocale, isNewStage, storeApi],
  );

  const isStanding = useCallback(
    () => standsIn(storeApi.getState().getValue(LABEL)),
    [standsIn, storeApi],
  );

  const withoutProposal = useCallback(
    (draft: StageFormDraft, committed: StageFormDraft): StageFormDraft => {
      if (defaultLocale === undefined || !standsIn(draft[LABEL])) return draft;
      return {
        ...draft,
        [LABEL]: withTranslation(
          draft[LABEL],
          defaultLocale,
          translationText(committed[LABEL], defaultLocale),
        ),
      };
    },
    [defaultLocale, standsIn],
  );

  return { isStanding, withoutProposal };
}
