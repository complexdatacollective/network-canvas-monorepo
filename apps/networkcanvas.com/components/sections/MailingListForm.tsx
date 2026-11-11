'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@codaco/fresco-ui/Button';
import InputField from '@codaco/fresco-ui/form/fields/InputField';

const MAILCHIMP_ACTION =
  'https://networkcanvas.us14.list-manage.com/subscribe/post?u=66b037bad92d8f1f552b9097f&id=fce94667d6';
const MAILCHIMP_HONEYPOT = 'b_66b037bad92d8f1f552b9097f_fce94667d6';

export function MailingListForm() {
  const t = useTranslations('MailingList');
  const [email, setEmail] = useState('');

  return (
    <form
      action={MAILCHIMP_ACTION}
      method="post"
      target="_blank"
      className="phone-landscape:flex-row mt-6 flex flex-col gap-3"
    >
      <InputField
        type="email"
        required
        name="EMAIL"
        value={email}
        onChange={(value) => setEmail(value ?? '')}
        placeholder={t('placeholder')}
        aria-label={t('emailLabel')}
        // In a row the field takes the spare width and gives way first, so
        // the submit button keeps its whole label.
        className="phone-landscape:shrink phone-landscape:grow"
      />
      <div aria-hidden="true" className="sr-only">
        <input
          type="text"
          name={MAILCHIMP_HONEYPOT}
          tabIndex={-1}
          defaultValue=""
        />
      </div>
      <Button type="submit" color="primary" className="shrink-0">
        {t('submit')}
      </Button>
    </form>
  );
}
