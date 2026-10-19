import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Field from '@codaco/fresco-ui/form/Field/Field';
import InputField from '@codaco/fresco-ui/form/fields/InputField';
import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';
import Form from '@codaco/fresco-ui/form/Form';

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
      [
        'first',
        {
          opacity: [1, 0],
          transform: ['translateX(0px)', 'translateX(-40px)'],
        },
      ],
      [
        'second',
        { opacity: [0, 1], transform: ['translateX(40px)', 'translateX(0px)'] },
      ],
    ]);

    animate.mockClear();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(screen.getByTestId('second')).not.toBeVisible());
    expect(movesOf()).toEqual([
      [
        'second',
        { opacity: [1, 0], transform: ['translateX(0px)', 'translateX(40px)'] },
      ],
      [
        'first',
        {
          opacity: [0, 1],
          transform: ['translateX(-40px)', 'translateX(0px)'],
        },
      ],
    ]);
  });

  it('shows the first step without animating it', () => {
    render(<Flow />);
    expect(animate).not.toHaveBeenCalled();
  });
});

function Choice() {
  const [value, setValue] = useState<string | null>(null);
  return (
    <div role="radiogroup" aria-label="Colour" data-field-name="colour">
      {['Red', 'Blue'].map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={value === option}
          onClick={() => setValue(option)}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

function ChoiceFlow() {
  const [navigation, setNavigation] = useState<HTMLElement | null>(null);
  return (
    <TestProtocolLocalization>
      <QuestionFlow stepped navigation={navigation} finish={<span />}>
        <section data-question-step data-testid="first">
          <Choice />
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

describe('QuestionFlow moving on after a choice', () => {
  it('moves on after a first answer, but not after changing one on going back', async () => {
    const user = userEvent.setup();
    render(<ChoiceFlow />);
    await screen.findByRole('button', { name: 'Skip' });

    await user.click(screen.getByRole('radio', { name: 'Red' }));
    await waitFor(() => expect(screen.getByTestId('first')).not.toBeVisible());

    await user.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(screen.getByTestId('second')).not.toBeVisible());

    await user.click(screen.getByRole('radio', { name: 'Blue' }));
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(screen.getByTestId('second')).not.toBeVisible();
    expect(screen.getByRole('radio', { name: 'Blue' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });
});

function TwoChoiceFlow() {
  const [navigation, setNavigation] = useState<HTMLElement | null>(null);
  return (
    <TestProtocolLocalization>
      <QuestionFlow stepped navigation={navigation} finish={<span />}>
        <section data-question-step data-testid="first">
          <Choice />
          <Choice />
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

describe('QuestionFlow step button', () => {
  it('reads "Skip" while nothing in the step is answered, and "Continue" once anything is', async () => {
    const user = userEvent.setup();
    render(<TwoChoiceFlow />);
    await screen.findByRole('button', { name: 'Skip' });

    const [firstRed] = screen.getAllByRole('radio', { name: 'Red' });
    await user.click(firstRed!);

    expect(
      await screen.findByRole('button', { name: 'Continue' }),
    ).toBeVisible();
    expect(screen.getByTestId('first')).toBeVisible();
  });
});

function RequiredFlow() {
  const [navigation, setNavigation] = useState<HTMLElement | null>(null);
  return (
    <TestProtocolLocalization>
      <Form onSubmit={() => ({ success: true })}>
        <QuestionFlow stepped navigation={navigation} finish={<span />}>
          <section data-question-step data-testid="first">
            <Field
              component={RadioGroupField}
              name="colour"
              label="Colour"
              options={[
                { value: 'red', label: 'Red' },
                { value: 'blue', label: 'Blue' },
              ]}
              required
            />
          </section>
          <section data-question-step data-testid="second">
            <Field component={InputField} name="second" label="Second" />
          </section>
        </QuestionFlow>
      </Form>
      <footer ref={setNavigation} />
    </TestProtocolLocalization>
  );
}

describe('QuestionFlow with a required question left unanswered', () => {
  // jsdom lays nothing out; a question shows unless a hidden step holds it.
  beforeEach(() => {
    vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(function (
      this: Element,
    ) {
      return (this.closest('[hidden]')
        ? []
        : [new DOMRect()]) as unknown as DOMRectList;
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('keeps the step open and shows the error saving would, until it is answered', async () => {
    const user = userEvent.setup();
    render(<RequiredFlow />);
    const step = await screen.findByTestId('first');
    expect(
      screen.queryByText('You must answer this question before continuing.'),
    ).not.toBeInTheDocument();

    // The buttons render into the footer only once it has mounted.
    await user.click(await screen.findByRole('button', { name: 'Continue' }));

    expect(
      await screen.findByText(
        'You must answer this question before continuing.',
      ),
    ).toBeVisible();
    expect(step).toBeVisible();
    expect(screen.getByRole('radio', { name: 'Red' })).toHaveFocus();

    await user.click(screen.getByRole('radio', { name: 'Red' }));
    await waitFor(() =>
      expect(
        screen.queryByText('You must answer this question before continuing.'),
      ).not.toBeInTheDocument(),
    );
  });
});
