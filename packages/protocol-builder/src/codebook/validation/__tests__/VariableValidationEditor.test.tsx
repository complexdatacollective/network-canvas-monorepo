import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import VariableValidationEditor from '../VariableValidationEditor.tsx';

const variables = {
  age: { name: 'Age', type: 'number', component: 'Number' },
  height: { name: 'Height', type: 'number', component: 'Number' },
  nickname: { name: 'Nickname', type: 'text', component: 'Text' },
};

describe('VariableValidationEditor', () => {
  it('preserves a cleared numeric rule as an incomplete null draft', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <VariableValidationEditor
        entity="node"
        variableType="number"
        currentVariableId="age"
        allVariables={variables}
        value={{}}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole('switch', { name: 'Minimum value' }));
    expect(onChange).toHaveBeenLastCalledWith({ minValue: 0 });

    rerender(
      <VariableValidationEditor
        entity="node"
        variableType="number"
        currentVariableId="age"
        allVariables={variables}
        value={{ minValue: 0 }}
        onChange={onChange}
      />,
    );
    await user.clear(screen.getByRole('spinbutton', { name: 'Minimum value' }));
    // Typing is held as a draft, so nothing has been written yet — the box is
    // empty on screen and the rule still carries the number it had.
    expect(onChange).toHaveBeenLastCalledWith({ minValue: 0 });
    await user.tab();

    expect(onChange).toHaveBeenLastCalledWith({ minValue: null });
    rerender(
      <VariableValidationEditor
        entity="node"
        variableType="number"
        currentVariableId="age"
        allVariables={variables}
        value={{ minValue: null }}
        onChange={onChange}
      />,
    );
    expect(
      screen.getByRole('spinbutton', { name: 'Minimum value' }),
    ).toHaveAccessibleDescription(
      'Enter a value for "Minimum value", or switch the rule off.',
    );
  });

  it('reports a deleted comparison target without throwing or hiding it', () => {
    render(
      <VariableValidationEditor
        entity="node"
        variableType="number"
        currentVariableId="age"
        allVariables={variables}
        value={{ lessThanVariable: 'deleted-height' }}
        onChange={() => undefined}
      />,
    );

    const target = screen.getByRole('combobox', {
      name: 'Less than another attribute',
    });
    expect(target).toHaveValue('deleted-height');
    expect(
      screen.getByRole('option', {
        name: 'Deleted attribute (deleted-height)',
      }),
    ).toBeInTheDocument();
    expect(target).toHaveAttribute('aria-invalid', 'true');
    expect(target).toHaveAccessibleDescription(
      'The selected comparison attribute no longer exists.',
    );
  });

  it('offers only same-type comparison targets and omits unique for ego', () => {
    const { rerender } = render(
      <VariableValidationEditor
        entity="node"
        variableType="number"
        currentVariableId="age"
        allVariables={variables}
        value={{ lessThanVariable: null }}
        onChange={() => undefined}
      />,
    );

    expect(screen.getByRole('option', { name: 'Height' })).toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: 'Nickname' }),
    ).not.toBeInTheDocument();

    rerender(
      <VariableValidationEditor
        entity="ego"
        variableType="number"
        currentVariableId="age"
        allVariables={variables}
        value={{}}
        onChange={() => undefined}
      />,
    );
    expect(
      screen.queryByRole('switch', { name: 'Unique value' }),
    ).not.toBeInTheDocument();
  });

  /**
   * `aria-invalid` says the field refuses this rule map; it does not say the
   * field is stating a sentence about it. A host may mark the control invalid
   * for the outline and for `focusFirstError` and state nothing, and standing
   * the editor down for that would leave a researcher with no sentence at all.
   */
  it('names every unanswered rule as soon as the host refuses the map', () => {
    render(
      <VariableValidationEditor
        entity="node"
        variableType="number"
        currentVariableId="age"
        allVariables={variables}
        value={{ minValue: null }}
        onChange={() => undefined}
        aria-invalid
      />,
    );

    expect(
      screen.getByRole('spinbutton', { name: 'Minimum value' }),
    ).toHaveAccessibleDescription(
      'Enter a value for "Minimum value", or switch the rule off.',
    );
  });

  /**
   * And until then it says nothing: naming a rule as unanswered the instant it
   * is switched on scolds the researcher before they have been near its value
   * control.
   */
  it('says nothing about a rule switched on and not yet answered', async () => {
    const user = userEvent.setup();
    render(
      <VariableValidationEditor
        entity="node"
        variableType="number"
        currentVariableId="age"
        allVariables={variables}
        value={{ minValue: null }}
        onChange={() => undefined}
      />,
    );

    const box = screen.getByRole('spinbutton', { name: 'Minimum value' });
    expect(box).not.toHaveAccessibleDescription(
      'Enter a value for "Minimum value", or switch the rule off.',
    );

    // Leaving the box empty is the act that reveals it.
    await user.click(box);
    await user.tab();
    expect(box).toHaveAccessibleDescription(
      'Enter a value for "Minimum value", or switch the rule off.',
    );
  });

  /**
   * The editor states no verdict of its own over the whole map: each row says
   * what is wrong with itself, and the sentence about the map as a whole is
   * the mounting field's, in its own error region. The editor's root carries
   * both the refusal mark and the reference to that region, so everything that
   * finds a refused control by `aria-invalid` finds the sentence with it.
   */
  it('passes the field’s own error region through on the refused root', () => {
    const { container } = render(
      <>
        <p id="host-error">The rules contradict each other.</p>
        <VariableValidationEditor
          entity="node"
          variableType="number"
          currentVariableId="age"
          allVariables={variables}
          value={{ required: true }}
          onChange={() => undefined}
          aria-invalid
          aria-describedby="host-error"
        />
      </>,
    );

    expect(
      container.querySelector('[aria-invalid="true"]'),
    ).toHaveAccessibleDescription('The rules contradict each other.');
  });

  /**
   * Architect names a comparison rule the researcher cannot switch on, and
   * says which of the two reasons it is: nothing of the same kind to compare
   * against, or nothing that could satisfy it.
   */
  it('says why a comparison rule cannot be switched on', () => {
    render(
      <VariableValidationEditor
        entity="node"
        variableType="text"
        currentVariableId="nickname"
        allVariables={variables}
        value={{}}
        onChange={() => undefined}
      />,
    );

    expect(
      screen.getByRole('switch', { name: 'Different from another attribute' }),
    ).toHaveAccessibleDescription(
      'No other attribute of this type exists to compare against.',
    );
  });

  /** A pair of bounds nothing can satisfy is stated on the row that made it. */
  it('states a contradiction on the rule that carries it', () => {
    render(
      <VariableValidationEditor
        entity="node"
        variableType="number"
        currentVariableId="age"
        allVariables={variables}
        value={{ minValue: 10, maxValue: 2 }}
        onChange={() => undefined}
      />,
    );

    expect(
      screen.getByRole('spinbutton', { name: 'Maximum value' }),
    ).toHaveAccessibleDescription(
      'The minimum and maximum rules for Age leave no permitted answer. Adjust the bounds or the required-answer rule.',
    );
  });

  it('is fully read-only when the host cannot edit the section', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <VariableValidationEditor
        entity="node"
        variableType="number"
        currentVariableId="age"
        allVariables={variables}
        value={{ required: true }}
        onChange={onChange}
        readOnly
      />,
    );

    const required = screen.getByRole('switch', { name: 'Required answer' });
    expect(required).toBeDisabled();
    await user.click(required);
    expect(onChange).not.toHaveBeenCalled();
  });

  /**
   * Architect gives every rule value a stepper pair named for the rule it
   * moves (`components/Validations/ValidationRule.tsx:104-146`), so a screen
   * on which several rules each hold a number does not offer three buttons all
   * called "Increase value".
   */
  it('steps a rule value by one from buttons named for that rule', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <VariableValidationEditor
        entity="node"
        variableType="number"
        currentVariableId="age"
        allVariables={variables}
        value={{ minValue: 4 }}
        onChange={onChange}
      />,
    );

    await user.click(
      screen.getByRole('button', { name: 'Increase Minimum value' }),
    );
    expect(onChange).toHaveBeenLastCalledWith({ minValue: 5 });

    await user.click(
      screen.getByRole('button', { name: 'Decrease Minimum value' }),
    );
    expect(onChange).toHaveBeenLastCalledWith({ minValue: 3 });
  });

  /**
   * Typing is held until the researcher has finished with the box. Written on
   * every keystroke, raising a maximum from 5 to 40 passes through 4 — below
   * the minimum — and every intermediate reaches whatever the map is written
   * into.
   */
  it('holds typing as a draft and commits it when the box is left', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <VariableValidationEditor
        entity="node"
        variableType="number"
        currentVariableId="age"
        allVariables={variables}
        value={{ maxValue: 5 }}
        onChange={onChange}
      />,
    );

    const box = screen.getByRole('spinbutton', { name: 'Maximum value' });
    await user.clear(box);
    await user.type(box, '40');
    expect(box).toHaveValue(40);
    expect(onChange).not.toHaveBeenCalled();

    await user.tab();
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ maxValue: 40 });
  });

  it('commits the box on Enter without submitting anything around it', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onSubmit = vi.fn((event: React.FormEvent) => {
      event.preventDefault();
    });
    render(
      <form onSubmit={onSubmit}>
        <VariableValidationEditor
          entity="node"
          variableType="number"
          currentVariableId="age"
          allVariables={variables}
          value={{ maxValue: 5 }}
          onChange={onChange}
        />
      </form>,
    );

    const box = screen.getByRole('spinbutton', { name: 'Maximum value' });
    await user.clear(box);
    await user.type(box, '9{Enter}');

    expect(onChange).toHaveBeenCalledExactlyOnceWith({ maxValue: 9 });
    expect(onSubmit).not.toHaveBeenCalled();
  });
  /**
   * Typing is held in the editor rather than in the map, so a value replaced
   * from outside — a collaborator's change to the same attribute — left the
   * box showing text about a number that is no longer there, and the next
   * commit wrote that text over their change.
   */
  it('drops typing the value moved out from under', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <VariableValidationEditor
        entity="node"
        variableType="number"
        currentVariableId="age"
        allVariables={variables}
        value={{ maxValue: 5 }}
        onChange={onChange}
      />,
    );

    const box = screen.getByRole('spinbutton', { name: 'Maximum value' });
    await user.clear(box);
    await user.type(box, '40');
    expect(onChange).not.toHaveBeenCalled();

    rerender(
      <VariableValidationEditor
        entity="node"
        variableType="number"
        currentVariableId="age"
        allVariables={variables}
        value={{ maxValue: 12 }}
        onChange={onChange}
      />,
    );

    expect(
      screen.getByRole('spinbutton', { name: 'Maximum value' }),
    ).toHaveValue(12);
    // Leaving the box commits it, and then the rule is switched on: neither
    // carries the forty that was typed over the five.
    await user.click(screen.getByRole('switch', { name: 'Required answer' }));
    expect(onChange.mock.calls.map(([map]) => map)).toEqual([
      { maxValue: 12 },
      { maxValue: 12, required: true },
    ]);
  });
});
