import { permanentRedirect } from 'next/navigation';

import { defaultLocale } from '~/lib/i18n/locales';

export default function RootPage() {
  // On Netlify the locale edge function answers "/" before this page, choosing
  // the reader's language with the locale system the websites share. This
  // static fallback only serves hosts without it.
  permanentRedirect(`/${defaultLocale}`);
}
