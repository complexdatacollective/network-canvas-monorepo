import { defineMessages } from '@codaco/app-i18n/messages';

/**
 * What the control that saves a stage says, when the host supplied none of its
 * own.
 *
 * The control itself — `saveStageAction`, the shell action slot's fallback —
 * arrives with the first family of named stage editors, which is what renders
 * it. Its WORDS are here already because the test harness needs them now: the
 * harness stands in for that control on the path that mounts sections without
 * an editor around them, and a stand-in that named itself would put a second
 * spelling of the same words into the package, and — because it would be a
 * literal — an ENGLISH one, which the locale sweeps then find on a Spanish
 * surface and report against whichever section was open.
 */
export const saveStageMessages = defineMessages({
  saveStage: {
    id: 'protocolBuilder.shell.saveStage',
    defaultMessage: 'Save stage',
    description:
      'Action that saves the step of the interview a researcher is editing. Names the stage rather than saying only "Save", because a host may show its own controls beside this one.',
  },
});
