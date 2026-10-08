import { env } from 'node:process';

import Image from 'next/image';
import { connection } from 'next/server';
import { type ReactNode } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { getServerIntl } from '~/i18n/server';
import { getAppSetting } from '~/queries/appSettings';

const messages = defineMessages({
  imageAlt: {
    id: 'fresco.interview.smallScreenOverlay.imageAlt',
    defaultMessage: 'Illustration: the screen size is too small',
    description:
      'Alternative text for an illustration shown on a participant-facing notice, which tells the participant their screen is too small to complete the interview.',
  },
  heading: {
    id: 'fresco.interview.smallScreenOverlay.heading',
    defaultMessage: 'Screen size too small',
    description:
      'Heading of a notice shown to a participant whose screen is too small to complete the interview.',
  },
  instruction: {
    id: 'fresco.interview.smallScreenOverlay.instruction',
    defaultMessage:
      'To complete this interview, please use a device with a larger screen, or maximize your browser window.',
    description:
      'Participant-facing instruction under the "Screen size too small" heading: use a larger screen or make the browser window bigger.',
  },
  phoneNote: {
    id: 'fresco.interview.smallScreenOverlay.phoneNote',
    defaultMessage:
      '<strong>Note:</strong> it is not possible to complete this interview using a mobile phone.',
    description:
      'Participant-facing note under the screen-size instruction. The tagged lead-in word ("Note:") is shown in bold; the rest says that a mobile phone cannot be used for the interview.',
  },
});

const renderStrongChunks = (chunks: ReactNode[]) => <strong>{chunks}</strong>;

const SmallScreenOverlay = async () => {
  await connection();
  const disableSmallScreenOverlay = await getAppSetting(
    'disableSmallScreenOverlay',
  );
  if (disableSmallScreenOverlay || env.NODE_ENV === 'development') {
    return null;
  }

  const intl = await getServerIntl();

  return (
    <div className="laptop:hidden bg-background fixed inset-0 z-50 flex items-center justify-center">
      <div className="flex max-w-[72ch] flex-col items-center justify-center p-6 text-center">
        <Image
          src="/images/too-small.svg"
          width={300}
          height={300}
          alt={intl.formatMessage(messages.imageAlt)}
        />
        <Heading level="h1">{intl.formatMessage(messages.heading)}</Heading>
        <Paragraph intent="lead">
          {intl.formatMessage(messages.instruction)}
        </Paragraph>
        <Paragraph intent="smallText" className="mt-10">
          {intl.formatMessage(messages.phoneNote, {
            strong: renderStrongChunks,
          })}
        </Paragraph>
      </div>
    </div>
  );
};

export default SmallScreenOverlay;
