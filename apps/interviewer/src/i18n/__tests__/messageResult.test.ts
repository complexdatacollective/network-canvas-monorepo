import { beforeEach, describe, expect, it } from 'vitest';

import { commonMessages } from '@codaco/app-i18n/common';
import {
  createAppIntl,
  createMessageError,
  formatMessageError,
} from '@codaco/app-i18n/messages';
import { enrolWithPin } from '~/lib/auth/api';
import { interviewerCatalogs } from '~/locales/catalogs';

const spanish = createAppIntl({
  locale: 'es',
  messages: interviewerCatalogs.es,
});

beforeEach(() => localStorage.clear());

describe('localized authentication failures', () => {
  it('carries real vault validation identity through the auth API and form transport to Spanish guidance', async () => {
    const result = await enrolWithPin('123');
    expect(result.ok).toBe(false);
    expect(result.localizedMessage?.descriptor.id).toBe(
      'interviewer.vault.pinLength',
    );
    const message = result.localizedMessage ?? {
      descriptor: commonMessages.genericError,
    };
    const storedError = createMessageError(message.descriptor, message.values);
    expect(formatMessageError(storedError, spanish)).toBe(
      'El PIN debe tener exactamente 8 dígitos',
    );
    expect(localStorage.getItem('interviewer:vault')).toBeNull();
  });
});
