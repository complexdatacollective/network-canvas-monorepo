'use client';

import { useId } from 'react';

import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import RichSelectGroupField from '@codaco/fresco-ui/form/fields/RichSelectGroup';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { FramingId } from '@codaco/protocol-validation';

import { useFamilyPedigreeStore } from '../../FamilyPedigreeContext';
import { messages } from '../../messages';

type FramingConfig =
  | { mode: 'fixed'; value: FramingId }
  | { mode: 'participantChoice' };

export function shouldSkipFramingSelectionStep(
  framingConfig: FramingConfig,
): boolean {
  return framingConfig.mode !== 'participantChoice';
}

export function FramingSelectionStep() {
  const intl = useAppIntl();
  const FRAMING_OPTIONS = [
    {
      value: 'gendered' as const,
      label: intl.formatMessage(messages.framingMotherFather),
      description: intl.formatMessage(messages.framingMotherFatherDescription),
    },
    {
      value: 'gamete' as const,
      label: intl.formatMessage(messages.framingGamete),
      description: intl.formatMessage(messages.framingGameteDescription),
    },
  ];

  const framing = useFamilyPedigreeStore((s) => s.framing);
  const setFraming = useFamilyPedigreeStore((s) => s.setFraming);
  const promptId = useId();

  return (
    <>
      <Paragraph id={promptId}>
        <AppMessage message={messages.framingQuestion} />
      </Paragraph>
      <RichSelectGroupField
        aria-labelledby={promptId}
        options={FRAMING_OPTIONS}
        value={framing ?? undefined}
        onChange={(value) => {
          if (value === 'gamete' || value === 'gendered') {
            setFraming(value);
          }
        }}
      />
    </>
  );
}
