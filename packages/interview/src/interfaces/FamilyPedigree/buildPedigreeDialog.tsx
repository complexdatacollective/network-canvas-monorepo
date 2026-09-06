'use client';

import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import type { AcknowledgeDialog } from '@codaco/fresco-ui/dialogs/DialogProvider';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import { imageUrl } from '../../utils/imageUrl.ts';
import { messages } from './messages';
import contextMenuHintUrl from './pedigree-context-menu-hint.png';

export const buildPedigreeDialog: AcknowledgeDialog = {
  type: 'acknowledge',
  title: <AppMessage message={messages.buildHelpTitle} />,
  children: <BuildPedigreeHelp />,
  actions: {
    primary: { label: <AppMessage message={messages.gotIt} />, value: true },
  },
};

function BuildPedigreeHelp() {
  const intl = useAppIntl();
  return (
    <div className="tablet-landscape:flex-row flex flex-col items-start gap-6">
      <div>
        <Paragraph intent="lead">
          <AppMessage message={messages.buildHelpLead} />
        </Paragraph>
        <Paragraph>
          <AppMessage message={messages.buildHelpMenu} />
        </Paragraph>
        <Paragraph>
          <AppMessage message={messages.buildHelpChecklist} />
        </Paragraph>
        <Paragraph>
          <AppMessage message={messages.buildHelpContinue} />
        </Paragraph>
      </div>
      <figure className="phone-landscape:flex hidden shrink-0 flex-col items-center gap-2">
        <img
          src={imageUrl(contextMenuHintUrl)}
          alt={intl.formatMessage(messages.buildHelpImage)}
          className="w-40 rounded-lg shadow-lg"
        />
        <figcaption className="text-xs">
          <AppMessage message={messages.buildHelpCaption} />
        </figcaption>
      </figure>
    </div>
  );
}
