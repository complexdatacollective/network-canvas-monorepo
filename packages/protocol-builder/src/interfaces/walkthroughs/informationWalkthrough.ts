import { defineMessages } from '@codaco/app-i18n/messages';
import type { Stage } from '@codaco/protocol-validation';

import {
  ITEMS_FIELD,
  pageContentMessages,
  TITLE_FIELD,
} from '../../sections/page-content/PageContentSection.tsx';
import {
  closingSteps,
  introStep,
  stageOfType,
  hasText,
} from './walkthroughCommon.ts';
import type { StageWalkthrough } from './walkthroughTypes.ts';

const messages = defineMessages({
  introTitle: {
    id: 'protocolBuilder.walkthrough.information.introTitle',
    defaultMessage: 'Setting up an Information stage',
    description:
      'Title of the first step of a guided walkthrough of the Information stage editor. Information is the name of an interface; a stage is one step of an interview.',
  },
  introBody: {
    id: 'protocolBuilder.walkthrough.information.introBody',
    defaultMessage:
      'An Information stage is a page the participant reads, with a heading and any mix of text, images, audio and video. It asks no questions. You can keep editing while this walkthrough is open.',
    description: 'Body of the first step of the Information walkthrough.',
  },
  headingTitle: {
    id: 'protocolBuilder.walkthrough.information.headingTitle',
    defaultMessage: 'Write the page heading',
    description:
      'Title of the walkthrough step about the heading at the top of the page.',
  },
  headingBody: {
    id: 'protocolBuilder.walkthrough.information.headingBody',
    defaultMessage:
      'The heading is shown in large text at the top of the page. Every Information stage needs one.',
    description:
      'Body of the walkthrough step about the heading at the top of the page.',
  },
  itemsTitle: {
    id: 'protocolBuilder.walkthrough.information.itemsTitle',
    defaultMessage: 'Add the content',
    description:
      'Title of the walkthrough step about the blocks of text and media on the page.',
  },
  itemsBody: {
    id: 'protocolBuilder.walkthrough.information.itemsBody',
    defaultMessage:
      'Add a block for each piece of text, image, audio or video, in the order the participant should see them. Drag blocks to reorder them. The page scrolls, so it can hold as many as you need.',
    description:
      'Body of the walkthrough step about the blocks of text and media on the page.',
  },
});

const information = (stage: Stage) => stageOfType(stage, 'Information');

/** The Information editor: the page heading, then its blocks. */
export const informationWalkthrough: StageWalkthrough = [
  introStep('Information', messages.introTitle, messages.introBody),
  {
    id: 'heading',
    title: messages.headingTitle,
    body: messages.headingBody,
    target: { section: pageContentMessages.pageTitle, field: TITLE_FIELD },
    done: (stage, { defaultLocale }) =>
      hasText(information(stage)?.title, defaultLocale),
  },
  {
    id: 'items',
    title: messages.itemsTitle,
    body: messages.itemsBody,
    target: { section: pageContentMessages.pageTitle, field: ITEMS_FIELD },
    done: (stage) => (information(stage)?.items?.length ?? 0) > 0,
  },
  ...closingSteps,
];
