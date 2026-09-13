import { fireEvent, within } from '@testing-library/react';
import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockPromise, mockWriteText } = vi.hoisted(() => ({
  mockPromise: vi.fn(),
  mockWriteText: vi.fn(),
}));

// The toast manager needs a Base UI provider that has nothing to do with the
// URL this component derives; stub it so the render stays about the URL.
vi.mock('@codaco/fresco-ui/Toast', () => ({
  useToast: () => ({ promise: mockPromise }),
}));

import { AnonymousRecruitmentURLButton } from '../AnonymousRecruitmentURLButton';

const PROTOCOL_ID = 'protocol-1';
const view = <AnonymousRecruitmentURLButton protocolId={PROTOCOL_ID} />;
const expectedUrl = () => `${window.location.origin}/onboard/${PROTOCOL_ID}`;

const buttonIn = (container: HTMLElement) =>
  within(container).getByRole('button');

const containers: HTMLElement[] = [];

const serverRenderInto = () => {
  const container = document.createElement('div');
  container.innerHTML = renderToString(view);
  document.body.append(container);
  containers.push(container);
  return container;
};

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: mockWriteText },
  });
  mockWriteText.mockResolvedValue(undefined);
});

afterEach(() => {
  for (const container of containers.splice(0)) {
    container.remove();
  }
});

describe('AnonymousRecruitmentURLButton', () => {
  it('renders no URL in the server markup', () => {
    // `window.location.origin` is a deployment fact the server cannot know, so
    // the button ships empty and fills in once there is a browser. Reading it
    // during the first client render would make that render disagree with this
    // markup.
    const container = serverRenderInto();

    expect(buttonIn(container)).toHaveTextContent('');
    expect(container.innerHTML).not.toContain(`/onboard/${PROTOCOL_ID}`);
  });

  it('fills in the recruitment URL after hydration, with no mismatch', async () => {
    const container = serverRenderInto();
    expect(container.innerHTML).not.toContain(`/onboard/${PROTOCOL_ID}`);

    const onRecoverableError = vi.fn();
    const root = hydrateRoot(container, view, { onRecoverableError });
    await act(async () => {});

    // React recovers from a hydration mismatch by re-rendering, so the text
    // below could read correctly while the behaviour being guarded was broken.
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(buttonIn(container)).toHaveTextContent(expectedUrl());

    await act(async () => root.unmount());
  });

  it('copies the hydrated URL', async () => {
    const container = serverRenderInto();

    const root = hydrateRoot(container, view, {
      onRecoverableError: vi.fn(),
    });
    await act(async () => {});

    await act(async () => {
      fireEvent.click(buttonIn(container));
    });

    expect(mockWriteText).toHaveBeenCalledWith(expectedUrl());
    expect(mockPromise).toHaveBeenCalledOnce();

    await act(async () => root.unmount());
  });
});
