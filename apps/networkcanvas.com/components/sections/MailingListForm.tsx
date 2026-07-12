'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import Button from '@codaco/fresco-ui/Button';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

export function MailingListForm() {
  const t = useTranslations('MailingList');
  const [submitted, setSubmitted] = useState(false);

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
      <input
        type="email"
        required
        placeholder={t('placeholder')}
        aria-label={t('emailLabel')}
        className="focusable bg-platinum text-cyber-grape placeholder:text-cyber-grape/40 phone-landscape:max-w-xs w-full rounded-2xl px-4 py-3 text-base"
      />
      <Button
        type="submit"
        className="bg-cyber-grape shrink-0 rounded-2xl border-transparent px-6 py-3 text-sm text-white uppercase transition-transform hover:-translate-y-0.5"
      >
        {t('submit')}
      </Button>
    </form>
  );
}
