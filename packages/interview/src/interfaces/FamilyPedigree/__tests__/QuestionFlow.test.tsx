import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TestProtocolLocalization } from '../../__tests__/TestProtocolLocalization';
import QuestionFlow from '../components/QuestionFlow';

// Every step change is animated through this hook; recording its calls says
// which way each step moves, which the page itself cannot show in jsdom.
const animate = vi.fn((_element: Element, _keyframes: object) => ({
  // oxlint-disable-next-line unicorn/no-thenable -- stands in for Motion's thenable animation handle.
  then: (resolve?: () => void) => resolve?.(),
}));
vi.mock('@codaco/fresco-ui/hooks/useSafeAnimate', () => ({
  useSafeAnimate: () => [{ current: null }, animate],
}));

function Flow() {
  const [navigation, setNavigation] = useState<HTMLElement | null>(null);
  return (
    <TestProtocolLocalization>
      <QuestionFlow stepped navigation={navigation} finish={<span />}>
        <section data-question-step data-testid="first">
          <label>
            First
            <input data-field-name="first" />
          </label>
        </section>
        <section data-question-step data-testid="second">
          <label>
            Second
            <input data-field-name="second" />
          </label>
        </section>
      </QuestionFlow>
      <footer ref={setNavigation} />
    </TestProtocolLocalization>
  );
}

const movesOf = () =>
  animate.mock.calls.map(([element, keyframes]) => [
    (element as HTMLElement).dataset.testid,
    keyframes,
  ]);

describe('QuestionFlow step animation', () => {
  beforeEach(() => animate.mockClear());

  it('moves the shown step out to the left and the next in from the right, and back the other way', async () => {
    const user = userEvent.setup();
    render(<Flow />);

    await user.click(await screen.findByRole('button', { name: 'Skip' }));
    await waitFor(() => expect(screen.getByTestId('first')).not.toBeVisible());
    expect(movesOf()).toEqual([
      ['first', { opacity: [1, 0], x: [0, -40] }],
      ['second', { opacity: [0, 1], x: [40, 0] }],
    ]);

    animate.mockClear();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(screen.getByTestId('second')).not.toBeVisible());
    expect(movesOf()).toEqual([
      ['second', { opacity: [1, 0], x: [0, 40] }],
      ['first', { opacity: [0, 1], x: [-40, 0] }],
    ]);
  });

  it('shows the first step without animating it', () => {
    render(<Flow />);
    expect(animate).not.toHaveBeenCalled();
  });
});
