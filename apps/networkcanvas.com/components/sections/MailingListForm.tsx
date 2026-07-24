'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import Button from '@codaco/fresco-ui/Button';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

export function MailingListForm() {
  const t = useTranslations('MailingList');
  const [submitted, setSubmitted] = useState(false);
  const [email, setEmail] = useState('');

  if (submitted) {
    return (
      <output aria-live="polite" className="mt-6 block">
        <Paragraph margin="none" className="text-sea-green font-bold">
          {t('success')}
        </Paragraph>
      </output>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setSubmitted(true);
      }}
      className="phone-landscape:flex-row mt-6 flex flex-col gap-3"
    >
      <InputField
        type="email"
        required
        value={email}
        onChange={(value) => setEmail(value ?? '')}
        placeholder={t('placeholder')}
        aria-label={t('emailLabel')}
      />
      <Button type="submit" color="primary">
        {t('submit')}
      </Button>
    </form>
  );
}
