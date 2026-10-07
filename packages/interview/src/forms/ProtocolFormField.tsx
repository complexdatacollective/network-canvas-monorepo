'use client';

import { useState } from 'react';

import { AppMessage, useAppIntl } from '@codaco/app-i18n/react';
import Button from '@codaco/fresco-ui/Button';
import type { FieldValue } from '@codaco/fresco-ui/form/Field/types';
import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import type { ValidationContext } from '@codaco/fresco-ui/form/store/types';
import {
  presentationalTextProps,
  presentationalTextValue,
} from '@codaco/fresco-ui/PresentationalText';
import { RenderMarkdown } from '@codaco/fresco-ui/RenderMarkdown';

import { runtimeMessages } from '../i18n/runtimeMessages';
import { useResolvePresentationalText } from '../localization/ProtocolLocalizationProvider';
import ProtocolField, { type ProtocolFieldDefinition } from './ProtocolField';

type ProtocolFormFieldProps = {
  field: ProtocolFieldDefinition;
  /** Whether this question's stored answer can never be shown. */
  unavailable: boolean;
  initialValue?: FieldValue;
  autoFocus?: boolean;
  validationContext?: ValidationContext;
};

/**
 * A new answer left empty keeps the stored one, which already answered the
 * question, so the replacement is not itself required.
 */
function asReplacement(
  field: ProtocolFieldDefinition,
): ProtocolFieldDefinition {
  if (!field.validation) return field;
  return {
    ...field,
    validation: Object.fromEntries(
      Object.entries(field.validation).filter(([rule]) => rule !== 'required'),
    ),
  };
}

/**
 * One question of a protocol form. While its stored answer can never be shown,
 * the question is shown read-only as "Answer unavailable" and that answer is
 * kept as it is stored; the participant may choose to enter a new answer,
 * which replaces it once given.
 *
 * Replacing renders the same field the question renders once its new answer
 * is readable, so a form that saves as the participant types keeps the field,
 * and their focus in it, when the saved answer arrives.
 */
export default function ProtocolFormField({
  field,
  unavailable,
  initialValue,
  autoFocus,
  validationContext,
}: ProtocolFormFieldProps) {
  const intl = useAppIntl();
  const [replacing, setReplacing] = useState(false);
  const toPresentationalText = useResolvePresentationalText();
  const authoredHint =
    field.hint === undefined ? undefined : toPresentationalText(field.hint);

  if (unavailable && !replacing) {
    return (
      <UnconnectedField
        name={field.variable}
        label={toPresentationalText(field.label)}
        hint={<AppMessage message={runtimeMessages.answerUnavailableKept} />}
        component={InputField}
        value={intl.formatMessage(runtimeMessages.answerUnavailable)}
        readOnly
        suffixComponent={
          <Button
            type="button"
            size="sm"
            variant="text"
            onClick={() => setReplacing(true)}
          >
            <AppMessage message={runtimeMessages.replaceUnavailableAnswer} />
          </Button>
        }
      />
    );
  }

  if (unavailable) {
    return (
      <ProtocolField
        field={asReplacement(field)}
        hint={
          <>
            {authoredHint !== undefined && (
              <RenderMarkdown
                render={<span {...presentationalTextProps(authoredHint)} />}
              >
                {presentationalTextValue(authoredHint)}
              </RenderMarkdown>
            )}
            <p>
              <AppMessage
                message={runtimeMessages.replacingUnavailableAnswer}
              />
            </p>
          </>
        }
        autoFocus
        validationContext={validationContext}
      />
    );
  }

  return (
    <ProtocolField
      field={field}
      initialValue={initialValue}
      autoFocus={autoFocus}
      validationContext={validationContext}
    />
  );
}
