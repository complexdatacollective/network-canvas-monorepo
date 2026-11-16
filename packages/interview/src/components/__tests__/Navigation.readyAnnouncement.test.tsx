import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';

import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';

import { InterviewI18nProvider } from '../../i18n/InterviewI18nProvider';
import { createEncryptionStore } from '../../interfaces/Anonymisation/__tests__/encryptionFixtures';
import Navigation from '../Navigation';

const READY = 'You can continue to the next step.';

type Props = ComponentProps<typeof Navigation>;

const baseProps: Props = {
  moveBackward: () => {},
  moveForward: () => {},
  pulseNext: false,
  progress: 0,
};

const renderNavigation = (props: Partial<Props>) => {
  const store = createEncryptionStore([]);
  const ui = (next: Partial<Props>) => (
    <Provider store={store}>
      <InterviewI18nProvider>
        <DialogProvider>
          <Navigation {...baseProps} {...next} />
        </DialogProvider>
      </InterviewI18nProvider>
    </Provider>
  );
  const view = render(ui(props));
  return { rerender: (next: Partial<Props>) => view.rerender(ui(next)) };
};

const nextButton = () => screen.getByRole('button', { name: 'Next Step' });
const announcer = () => screen.getByTestId('ready-to-continue-announcer');

describe('Navigation ready-to-continue announcement', () => {
  it('describes the Next button and announces once each time the stage becomes ready', () => {
    const { rerender } = renderNavigation({ pulseNext: false });

    const region = announcer();
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(nextButton()).not.toHaveAccessibleDescription();
    expect(region).toBeEmptyDOMElement();

    rerender({ pulseNext: true });
    expect(nextButton()).toHaveAccessibleName('Next Step');
    expect(nextButton()).toHaveAccessibleDescription(READY);
    expect(announcer()).toBe(region);
    expect(region).toHaveTextContent(READY);
    const firstAnnouncement = region.firstElementChild;
    expect(firstAnnouncement).not.toBeNull();

    // A render that leaves readiness unchanged must not announce again.
    rerender({ pulseNext: true, progress: 50 });
    expect(region.firstElementChild).toBe(firstAnnouncement);

    rerender({ pulseNext: false, progress: 50 });
    expect(nextButton()).not.toHaveAccessibleDescription();
    expect(region).toBeEmptyDOMElement();

    rerender({ pulseNext: true, progress: 50 });
    expect(nextButton()).toHaveAccessibleDescription(READY);
    expect(region).toHaveTextContent(READY);
    // Regaining readiness puts a new node in the region, which is what makes
    // a screen reader announce it again.
    expect(region.firstElementChild).not.toBeNull();
    expect(region.firstElementChild).not.toBe(firstAnnouncement);
    expect(firstAnnouncement?.isConnected).toBe(false);
  });
});
