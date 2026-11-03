import { defineMessages } from '@codaco/app-i18n/messages';
import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import manifest from '@codaco/interface-images/manifest';
import {
  isBlankMessage,
  type Stage,
  type StageType,
} from '@codaco/protocol-validation';

import { interviewerGuidanceSectionTitle } from '../../sections/interviewer-guidance/InterviewerGuidanceSection.tsx';
import { skipLogicSectionTitle } from '../../sections/skip-logic/SkipLogicSection.tsx';
import type {
  StageWalkthroughFrame,
  StageWalkthroughStep,
} from './walkthroughTypes.ts';

const walkthroughCommonMessages = defineMessages({
  yes: {
    id: 'protocolBuilder.walkthrough.yes',
    defaultMessage: 'Yes',
    description: 'An answer to a yes-or-no question in a stage walkthrough.',
  },
  no: {
    id: 'protocolBuilder.walkthrough.no',
    defaultMessage: 'No',
    description: 'An answer to a yes-or-no question in a stage walkthrough.',
  },
  introAlt: {
    id: 'protocolBuilder.walkthrough.introAlt',
    defaultMessage: 'An example of this stage as a participant sees it.',
    description:
      'Alternative text for the picture on the first step of a stage walkthrough: a screenshot of the kind of stage being edited, taken from a real interview.',
  },
  skipLogicTitle: {
    id: 'protocolBuilder.walkthrough.skipLogicTitle',
    defaultMessage: 'Skip the stage when it does not apply',
    description: 'Title of the walkthrough step about skip logic.',
  },
  skipLogicBody: {
    id: 'protocolBuilder.walkthrough.skipLogicBody',
    defaultMessage:
      'Switch this on to show or skip this stage depending on the answers so far — for example, only show it to participants who said they have close friends.',
    description: 'Body of the walkthrough step about skip logic.',
  },
  guidanceTitle: {
    id: 'protocolBuilder.walkthrough.guidanceTitle',
    defaultMessage: 'Add notes for interviewers',
    description: 'Title of the walkthrough step about interviewer guidance.',
  },
  guidanceBody: {
    id: 'protocolBuilder.walkthrough.guidanceBody',
    defaultMessage:
      'Switch this on to write anything the interviewer should say or do on this stage. Participants never see it.',
    description: 'Body of the walkthrough step about interviewer guidance.',
  },
  finishTitle: {
    id: 'protocolBuilder.walkthrough.finishTitle',
    defaultMessage: 'Try it out',
    description: 'Title of the last step of a stage walkthrough.',
  },
  finishBody: {
    id: 'protocolBuilder.walkthrough.finishBody',
    defaultMessage:
      'Below is what the stage has so far; pick a step to go back to it. Then use **Preview** to try the stage as a participant would.',
    description:
      'Body of the last step of a stage walkthrough. Markdown; Preview is the label of the button that opens a preview of the stage.',
  },
});

export const YES_NO = [
  { id: 'yes', label: walkthroughCommonMessages.yes },
  { id: 'no', label: walkthroughCommonMessages.no },
] as const;

/**
 * The draft as the given stage type, or undefined when it is another type —
 * which has none of that type's settings done.
 */
export function stageOfType<T extends StageType>(
  stage: Stage,
  type: T,
): Partial<Extract<Stage, { type: T }>> | undefined {
  return isStageOf(stage, type) ? stage : undefined;
}

function isStageOf<T extends StageType>(
  stage: Stage,
  type: T,
): stage is Extract<Stage, { type: T }> {
  return stage.type === type;
}

/**
 * Whether a translated text has words in any language. Lenient on purpose: a
 * check that wanted the default language could hold Next on a stage whose
 * text is written, just not in that one.
 */
export function hasText(
  translations: Readonly<Record<string, string>> | undefined,
): boolean {
  return Object.values(translations ?? {}).some(
    (message) => !isBlankMessage(message),
  );
}

/** The interface's own screenshot, as the stage-type picker shows it. */
function interfacePicture(
  type: StageType,
): readonly StageWalkthroughFrame[] | undefined {
  if (!hasPicture(type)) return undefined;
  const still = manifest[type]['16:9'];
  return [{ still, alt: walkthroughCommonMessages.introAlt }];
}

function hasPicture(type: StageType): type is keyof typeof manifest {
  return Object.hasOwn(manifest, type);
}

/** The first step: what the stage is, with a picture of it. */
export function introStep(
  type: StageType,
  title: MessageDescriptor,
  body: MessageDescriptor,
): StageWalkthroughStep {
  const visual = interfacePicture(type);
  return {
    id: 'intro',
    title,
    body,
    ...(visual === undefined ? {} : { visual }),
  };
}

export const skipLogicStep: StageWalkthroughStep = {
  id: 'skipLogic',
  title: walkthroughCommonMessages.skipLogicTitle,
  body: walkthroughCommonMessages.skipLogicBody,
  target: { section: skipLogicSectionTitle },
  optional: true,
};

export const guidanceStep: StageWalkthroughStep = {
  id: 'guidance',
  title: walkthroughCommonMessages.guidanceTitle,
  body: walkthroughCommonMessages.guidanceBody,
  target: { section: interviewerGuidanceSectionTitle },
  optional: true,
};

export const finishStep: StageWalkthroughStep = {
  id: 'finish',
  title: walkthroughCommonMessages.finishTitle,
  body: walkthroughCommonMessages.finishBody,
};

/**
 * The steps every stage ends with. A stage whose editor has no skip logic or
 * guidance section loses those steps on its own: the panel leaves out steps
 * for sections the editor is not showing.
 */
export const closingSteps: readonly StageWalkthroughStep[] = [
  skipLogicStep,
  guidanceStep,
  finishStep,
];
