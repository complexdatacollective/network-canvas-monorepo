'use client';

import { formatMessageError } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';

import { Alert } from '../Alert';
import Paragraph from '../typography/Paragraph';
import { UnorderedList } from '../typography/UnorderedList';

type FormErrorsProps = {
  errors: string[] | null;
};

export default function FormErrors({ errors }: FormErrorsProps) {
  const intl = useAppIntl();
  if (!errors || errors.length === 0) return null;
  const messages = errors.map(
    (error) => formatMessageError(error, intl) ?? error,
  );

  return (
    <Alert variant="destructive">
      {errors.length === 1 ? (
        <Paragraph margin="none">{messages[0]}</Paragraph>
      ) : (
        <UnorderedList>
          {messages.map((error, index) => (
            <li key={index}>{error}</li>
          ))}
        </UnorderedList>
      )}
    </Alert>
  );
}
