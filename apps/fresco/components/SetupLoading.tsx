'use client';

import { Loader2 } from 'lucide-react';

import { commonMessages } from '@codaco/app-i18n/common';
import { AppMessage } from '@codaco/app-i18n/react';

export default function SetupLoading() {
  return (
    <span role="status">
      <Loader2
        aria-hidden="true"
        className="text-background size-10 animate-spin"
      />
      <span className="sr-only">
        <AppMessage message={commonMessages.loading} />
      </span>
    </span>
  );
}
