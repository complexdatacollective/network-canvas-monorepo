import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';

import { InterviewI18nProvider } from '../../../i18n/InterviewI18nProvider';
import { showPassphrasePrompter } from '../../../store/modules/ui';
import PassphraseNotice, {
  type PassphraseNoticeStatus,
} from '../PassphraseNotice';
import { createEncryptionStore } from './encryptionFixtures';

type EncryptionStore = ReturnType<typeof createEncryptionStore>;

function renderNotice(status: PassphraseNoticeStatus, store: EncryptionStore) {
  render(
    <Provider store={store}>
      <InterviewI18nProvider requestedLocale="en">
        <PassphraseNotice status={status} />
      </InterviewI18nProvider>
    </Provider>,
  );
}

describe('PassphraseNotice', () => {
  it('brings up the prompter for the passphrase it tells the participant to enter', () => {
    const store = createEncryptionStore([]);
    renderNotice('locked', store);

    expect(screen.getByRole('status')).toHaveTextContent(
      'Enter your passphrase to see and change them.',
    );
    expect(showPassphrasePrompter(store.getState())).toBe(true);
  });
});
