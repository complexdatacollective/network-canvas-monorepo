'use client';

import { useState } from 'react';

import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import { Button } from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import RichSelectGroupField from '@codaco/fresco-ui/form/fields/RichSelectGroup';
import type { FramingId } from '@codaco/protocol-validation';

import { messages } from '../messages';

/**
 * Asks the participant which words to use for their family, when the stage
 * leaves the framing to them. It cannot be dismissed: the words on the
 * canvas depend on the answer.
 */
export default function FramingChoiceDialog({
  open,
  onChoose,
}: {
  open: boolean;
  onChoose: (framing: FramingId) => void;
}) {
  const intl = useAppIntl();
  const [choice, setChoice] = useState<FramingId>();

  return (
    <Dialog
      open={open}
      dismissible={false}
      title={intl.formatMessage(messages.framingChoiceTitle)}
      description={intl.formatMessage(messages.framingChoiceDescription)}
      footer={
        <Button
          color="primary"
          disabled={choice === undefined}
          onClick={() => {
            if (choice) onChoose(choice);
          }}
          data-testid="pedigree-framing-continue"
        >
          <AppMessage message={messages.framingChoiceContinue} />
        </Button>
      }
    >
      <RichSelectGroupField
        aria-label={intl.formatMessage(messages.framingChoiceTitle)}
        options={[
          {
            value: 'gendered',
            label: intl.formatMessage(messages.framingChoiceGendered),
            description: intl.formatMessage(
              messages.framingChoiceGenderedDescription,
            ),
          },
          {
            value: 'gamete',
            label: intl.formatMessage(messages.framingChoiceGamete),
            description: intl.formatMessage(
              messages.framingChoiceGameteDescription,
            ),
          },
        ]}
        value={choice}
        onChange={(value) => {
          if (value === 'gendered' || value === 'gamete') setChoice(value);
        }}
      />
    </Dialog>
  );
}
