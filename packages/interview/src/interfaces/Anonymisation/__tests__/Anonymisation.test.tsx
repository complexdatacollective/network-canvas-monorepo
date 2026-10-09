import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { NcEncryptionHeader } from '@codaco/shared-consts';

import { AnalyticsContext } from '../../../analytics/AnalyticsContext';
import type { Tracker } from '../../../analytics/tracker';
import { CurrentStepProvider } from '../../../contexts/CurrentStepContext';
import { StageMetadataProvider } from '../../../contexts/StageMetadataContext';
import useInterviewNavigation from '../../../hooks/useInterviewNavigation';
import { InterviewI18nProvider } from '../../../i18n/InterviewI18nProvider';
import type { StageProps } from '../../../types';
import { TestProtocolLocalization } from '../../__tests__/TestProtocolLocalization';
import Anonymisation from '../Anonymisation';
import { unlockEncryption } from '../unlockEncryption';
import {
  createEncryptionStore,
  encryptionFor,
  outOfBoundsHeader,
  unlockWith,
} from './encryptionFixtures';

class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

class ImmediateIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = '';
  readonly scrollMargin = '';
  readonly thresholds: readonly number[] = [];
  private callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }

  // Reported after mount, as a real observer would.
  observe(target: Element) {
    const bounds = target.getBoundingClientRect();
    queueMicrotask(() =>
      this.callback(
        [
          {
            target,
            isIntersecting: true,
            intersectionRatio: 1,
            boundingClientRect: bounds,
            intersectionRect: bounds,
            rootBounds: null,
            time: 0,
          },
        ],
        this,
      ),
    );
  }

  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', StubResizeObserver);
  vi.stubGlobal('IntersectionObserver', ImmediateIntersectionObserver);
});

afterEach(() => {
  vi.restoreAllMocks();
});

type AnonymisationStage = StageProps<'Anonymisation'>['stage'];

const VERIFY_LINE =
  'Some answers on this screen are protected by a passphrase. Keep it safe: you will need it to see or change these answers later, and it cannot be recovered if it is forgotten.';

/**
 * Holds every key derivation until released, so the check of a passphrase
 * can be observed while it is under way. Counts the derivations started.
 */
function holdKeyDerivation() {
  const derive = crypto.subtle.deriveKey.bind(crypto.subtle);
  let release = () => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const deriveKey = vi
    .spyOn(crypto.subtle, 'deriveKey')
    .mockImplementation(async (...args) => {
      await released;
      return derive(...args);
    });
  return { deriveKey, release };
}

function renderStage({
  header,
  validation,
}: {
  header?: NcEncryptionHeader;
  validation?: AnonymisationStage['validation'];
} = {}) {
  const stage: AnonymisationStage = {
    id: 'anonymisation',
    type: 'Anonymisation',
    label: { en: 'Protect your answers' },
    explanationText: {
      title: { en: 'Protect your answers' },
      body: { en: 'Some of your answers are protected by a passphrase.' },
    },
    validation,
  };
  const store = createEncryptionStore(
    [],
    [
      stage,
      {
        id: 'next-screen',
        type: 'Information',
        label: { en: 'Next screen' },
        title: { en: 'Next screen' },
        items: [],
      },
    ],
    undefined,
    { header },
  );

  const onStepChange = vi.fn();
  let moveForward: () => Promise<void> = () => Promise.resolve();

  function Harness() {
    const navigation = useInterviewNavigation(0);
    moveForward = navigation.moveForward;
    return (
      <StageMetadataProvider value={navigation.registerBeforeNext}>
        <Anonymisation
          stage={stage}
          getNavigationHelpers={() => ({
            moveForward: () => void navigation.moveForward(),
            moveBackward: () => void navigation.moveBackward(),
          })}
        />
      </StageMetadataProvider>
    );
  }

  const captureException = vi.fn<Tracker['captureException']>();
  const tracker: Tracker = { track: vi.fn(), captureException };

  const { unmount } = render(
    <AnalyticsContext.Provider value={tracker}>
      <Provider store={store}>
        <TestProtocolLocalization>
          <InterviewI18nProvider requestedLocale="en">
            <CurrentStepProvider currentStep={0} onStepChange={onStepChange}>
              <Harness />
            </CurrentStepProvider>
          </InterviewI18nProvider>
        </TestProtocolLocalization>
      </Provider>
    </AnalyticsContext.Provider>,
  );

  /** Presses Next, and resolves once the stage has decided. */
  const next = () =>
    act(async () => {
      await moveForward();
    });

  /** Presses Next, without waiting for the stage to decide. */
  const startNext = () => {
    let leaving: Promise<void> = Promise.resolve();
    act(() => {
      leaving = moveForward();
    });
    return leaving;
  };

  return {
    store,
    onStepChange,
    next,
    startNext,
    unmount,
    captureException,
    user: userEvent.setup(),
  };
}

// Each label also carries a visual required marker.
const passphraseField = () =>
  screen.findByLabelText(/^Passphrase/, { selector: 'input' });
const confirmField = () =>
  screen.queryByLabelText(/^Confirm Passphrase/, { selector: 'input' });
const submitButton = () => screen.getByRole('button', { name: 'Submit' });
const PASSPHRASE_SET = 'Passphrase set successfully! Click "Next" to continue.';
const PASSPHRASE_ACCEPTED = 'Passphrase accepted! Click "Next" to continue.';
const ALREADY_ENTERED =
  'You have already entered your passphrase. Click "Next" to continue.';
const UNAVAILABLE =
  'Answers protected by a passphrase cannot be shown or saved in this interview. Please let the person who recruited you to this study know.';

const successMessage = (text: string) => screen.findByText(text);
const anySuccessMessage = () =>
  screen.queryByText(
    (content) =>
      content === PASSPHRASE_SET ||
      content === PASSPHRASE_ACCEPTED ||
      content === ALREADY_ENTERED,
  );

async function enter(
  user: ReturnType<typeof userEvent.setup>,
  passphrase: string,
  confirmation = passphrase,
) {
  const first = await passphraseField();
  await user.clear(first);
  await user.type(first, passphrase);
  const second = confirmField();
  if (second) {
    await user.clear(second);
    await user.type(second, confirmation);
  }
  return { first, second };
}

describe('Anonymisation in an interview without a passphrase', () => {
  it('has the participant choose one of at least eight characters, confirmed, and puts it in force', async () => {
    const { store, user } = renderStage();

    expect(confirmField()).toHaveAttribute('type', 'password');
    // Kept out of the browser's password manager, as Interviewer's own
    // unlock screen keeps its passphrase.
    expect(await passphraseField()).toHaveAttribute('autocomplete', 'off');
    expect(confirmField()).toHaveAttribute('autocomplete', 'off');
    expect(screen.queryByText(VERIFY_LINE)).not.toBeInTheDocument();

    const deriveKey = vi.spyOn(crypto.subtle, 'deriveKey');
    const { first } = await enter(user, 'seven77');
    await user.click(submitButton());

    await waitFor(() => expect(first).toHaveAttribute('aria-invalid', 'true'));
    expect(first).toHaveAccessibleDescription(
      expect.stringContaining('Too short. Enter at least 8 characters.'),
    );
    expect(deriveKey).not.toHaveBeenCalled();
    expect(store.getState().session.network.encryption).toBeUndefined();

    await enter(user, 'eight888');
    await user.click(submitButton());

    expect(await successMessage(PASSPHRASE_SET)).toBeInTheDocument();
    expect(store.getState().session.network.encryption).toBeDefined();
    expect(store.getState().ui.encryptionKeyId).not.toBeNull();
    expect(store.getState().ui.FORM_IS_READY).toBe(true);
    expect(deriveKey).toHaveBeenCalledTimes(1);
  });

  it('refuses a passphrase whose confirmation does not match it', async () => {
    const { store, user } = renderStage();
    const deriveKey = vi.spyOn(crypto.subtle, 'deriveKey');

    const { second } = await enter(user, 'passphrase', 'passphrasf');
    await user.click(submitButton());

    await waitFor(() => expect(second).toHaveAttribute('aria-invalid', 'true'));
    expect(second).toHaveAccessibleDescription(
      expect.stringContaining('must be the same as'),
    );
    expect(deriveKey).not.toHaveBeenCalled();
    expect(store.getState().session.network.encryption).toBeUndefined();
  });

  it('holds the passphrase to the stage’s own minimum length when it is below the default', async () => {
    const { store, user } = renderStage({ validation: { minLength: 4 } });

    const { first } = await enter(user, 'abc');
    await user.click(submitButton());
    await waitFor(() => expect(first).toHaveAttribute('aria-invalid', 'true'));
    expect(first).toHaveAccessibleDescription(
      expect.stringContaining('Too short. Enter at least 4 characters.'),
    );

    await enter(user, 'abcd');
    await user.click(submitButton());

    expect(await successMessage(PASSPHRASE_SET)).toBeInTheDocument();
    expect(store.getState().session.network.encryption).toBeDefined();
  });

  it('holds the passphrase to the stage’s own minimum length when it is above the default', async () => {
    const { store, user } = renderStage({ validation: { minLength: 10 } });
    const deriveKey = vi.spyOn(crypto.subtle, 'deriveKey');

    const { first } = await enter(user, 'nine99999');
    await user.click(submitButton());

    await waitFor(() => expect(first).toHaveAttribute('aria-invalid', 'true'));
    expect(first).toHaveAccessibleDescription(
      expect.stringContaining('Too short. Enter at least 10 characters.'),
    );
    expect(deriveKey).not.toHaveBeenCalled();
    expect(store.getState().session.network.encryption).toBeUndefined();
  });

  it('checks the passphrase when Next is pressed, says so while it does, and moves on once it is in force', async () => {
    const { store, onStepChange, next, startNext, user } = renderStage();

    await enter(user, 'seven77');
    await next();

    const first = await passphraseField();
    await waitFor(() => expect(first).toHaveAttribute('aria-invalid', 'true'));
    expect(first).toHaveAccessibleDescription(
      expect.stringContaining('Too short. Enter at least 8 characters.'),
    );
    expect(onStepChange).not.toHaveBeenCalled();

    await enter(user, 'eight888');
    const { deriveKey, release } = holdKeyDerivation();
    const leaving = startNext();

    await waitFor(() => expect(deriveKey).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Checking your passphrase…',
      ),
    );
    expect(submitButton()).toBeDisabled();
    expect(submitButton()).toHaveAttribute('aria-busy', 'true');
    expect(onStepChange).not.toHaveBeenCalled();

    await act(async () => {
      release();
      await leaving;
    });

    expect(onStepChange).toHaveBeenCalledWith(1, expect.anything());
    expect(store.getState().session.network.encryption).toBeDefined();
    expect(deriveKey).toHaveBeenCalledTimes(1);
  });
});

describe('Anonymisation in an interview whose passphrase has been chosen', () => {
  it('asks for it once, without length rules, turns away any other even when no answer is encrypted yet, and lets the participant try again', async () => {
    const { header } = await encryptionFor('pw');
    const { store, onStepChange, next, user } = renderStage({
      header,
      validation: { minLength: 12 },
    });

    expect(await screen.findByText(VERIFY_LINE)).toBeInTheDocument();
    const field = await passphraseField();
    expect(field).toHaveAttribute('type', 'password');
    expect(field).toHaveAttribute('autocomplete', 'off');
    expect(confirmField()).not.toBeInTheDocument();
    expect(field).not.toHaveAccessibleDescription(
      expect.stringContaining('Enter at least'),
    );
    expect(store.getState().session.network.nodes).toEqual([]);

    await user.type(field, 'no');
    await user.click(submitButton());

    await waitFor(() => expect(field).toHaveAttribute('aria-invalid', 'true'));
    expect(field).toHaveAccessibleDescription(
      expect.stringContaining(
        'This passphrase does not match the one used earlier in this interview.',
      ),
    );
    expect(field).not.toHaveAccessibleDescription(
      expect.stringContaining('Too short'),
    );
    expect(store.getState().ui.encryptionKeyId).toBeNull();
    expect(store.getState().session.network.encryption).toEqual(header);

    // Turned away on Next, the participant stays here, with the field
    // focused to try again.
    act(() => submitButton().focus());
    await next();
    expect(onStepChange).not.toHaveBeenCalled();
    await waitFor(() => expect(field).toHaveFocus());
    expect(field).toBeEnabled();
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(store.getState().ui.encryptionKeyId).toBeNull();
    expect(store.getState().ui.FORM_IS_READY).toBe(false);
    expect(anySuccessMessage()).toBeNull();

    // The key is in force before the check resolves; the stage must not say
    // in between that the passphrase was entered on an earlier visit.
    const shown = new Set<string>();
    const observer = new MutationObserver(() => {
      const message = anySuccessMessage();
      if (message?.textContent) shown.add(message.textContent);
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
    });

    await user.clear(field);
    await user.type(field, 'pw');
    await user.click(submitButton());

    expect(await successMessage(PASSPHRASE_ACCEPTED)).toBeInTheDocument();
    observer.disconnect();
    expect([...shown]).toEqual([PASSPHRASE_ACCEPTED]);
    expect(store.getState().ui.encryptionKeyId).not.toBeNull();
    expect(store.getState().session.network.encryption).toEqual(header);

    await next();
    expect(onStepChange).toHaveBeenCalledWith(1, expect.anything());
  });

  it('says it is checking the passphrase, and checks it once when Next is pressed during the check', async () => {
    const { header } = await encryptionFor('pw');
    const { store, onStepChange, startNext, user } = renderStage({ header });
    const field = await passphraseField();
    const status = screen.getByRole('status');
    expect(status).toBeEmptyDOMElement();

    const { deriveKey, release } = holdKeyDerivation();
    await user.type(field, 'pw');
    await user.click(submitButton());

    await waitFor(() => expect(deriveKey).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(status).toHaveTextContent('Checking your passphrase…'),
    );
    // The same live region, mounted throughout, so the change is announced.
    // Not a paragraph: the spinner it shows is a block, which a paragraph
    // cannot hold.
    expect(screen.getByRole('status')).toBe(status);
    expect(status.closest('p')).toBeNull();
    expect(submitButton()).toBeDisabled();
    expect(submitButton()).toHaveAttribute('aria-busy', 'true');

    const leaving = startNext();
    await act(async () => {
      release();
      await leaving;
    });

    expect(await successMessage(PASSPHRASE_ACCEPTED)).toBeInTheDocument();
    expect(onStepChange).toHaveBeenCalledWith(1, expect.anything());

    // Attempts on one store run one after another, so this one settles only
    // after any the stage started; it derives the key once itself.
    await unlockEncryption(store, 'pw');
    expect(deriveKey).toHaveBeenCalledTimes(2);
  });
});

describe('Anonymisation once the passphrase is in force', () => {
  it('says it was entered earlier instead of asking for it', async () => {
    const { header } = await encryptionFor('pw');
    const { store, onStepChange, next } = renderStage({ header });
    await act(() => unlockWith(store, 'pw'));

    const success = await successMessage(ALREADY_ENTERED);
    expect(success).toBeInTheDocument();
    expect(store.getState().ui.FORM_IS_READY).toBe(true);
    expect(
      screen.queryByLabelText(/^Passphrase/, { selector: 'input' }),
    ).toBeNull();
    expect(screen.queryByText(VERIFY_LINE)).toBeNull();

    await next();
    expect(onStepChange).toHaveBeenCalledWith(1, expect.anything());
  });
});

describe('Anonymisation left while the passphrase is being checked', () => {
  it('does not mark the next stage ready once the check ends', async () => {
    const { header } = await encryptionFor('pw');
    const { store, unmount, user } = renderStage({ header });
    const field = await passphraseField();

    const { deriveKey, release } = holdKeyDerivation();
    await user.type(field, 'pw');
    await user.click(submitButton());
    await waitFor(() => expect(deriveKey).toHaveBeenCalledTimes(1));

    unmount();
    expect(store.getState().ui.FORM_IS_READY).toBe(false);

    release();
    // Attempts on one store run one after another, so this settles only once
    // the stage's own check has.
    await unlockEncryption(store, 'pw');

    expect(store.getState().ui.encryptionKeyId).not.toBeNull();
    expect(store.getState().ui.FORM_IS_READY).toBe(false);
  });
});

describe('Anonymisation in an interview whose encryption header is out of bounds', () => {
  it('says protected answers are unavailable, asks for no passphrase, reports it once, and lets the participant move on', async () => {
    const { header } = await encryptionFor('pw');
    const refused = outOfBoundsHeader(header);
    const deriveKey = vi.spyOn(crypto.subtle, 'deriveKey');
    const { store, onStepChange, next, captureException } = renderStage({
      header: refused,
    });

    expect(await screen.findByText(UNAVAILABLE)).toBeInTheDocument();
    expect(
      screen.queryByLabelText(/^Passphrase/, { selector: 'input' }),
    ).toBeNull();
    expect(screen.queryByText(VERIFY_LINE)).toBeNull();
    expect(anySuccessMessage()).toBeNull();
    expect(store.getState().ui.FORM_IS_READY).toBe(true);
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException.mock.calls[0]?.[1]).toEqual({
      feature: 'encrypted-attributes',
      reason: 'refused-header',
    });

    await next();
    expect(onStepChange).toHaveBeenCalledWith(1, expect.anything());
    expect(deriveKey).not.toHaveBeenCalled();
    expect(store.getState().session.network.encryption).toEqual(refused);
    expect(store.getState().ui.showPassphrasePrompter).toBe(false);
  });
});
