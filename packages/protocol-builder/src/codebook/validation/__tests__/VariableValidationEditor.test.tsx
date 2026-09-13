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

    await user.click(screen.getByRole('checkbox', { name: 'Minimum value' }));
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
    expect(screen.getByRole('alert')).toHaveTextContent(
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
    expect(screen.getByRole('alert')).toHaveTextContent(
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
      screen.queryByRole('checkbox', { name: 'Unique value' }),
    ).not.toBeInTheDocument();
  });

  /**
   * `aria-invalid` says the field refuses this rule map; it does not say the
   * field is stating a sentence about it. A host may mark the control invalid
   * for the outline and for `focusFirstError` and state nothing, and standing
   * the editor down for that would leave a researcher with no sentence at all.
   */
  it('keeps its verdict when the host marks it invalid but states nothing', () => {
    const { container } = render(
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

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enter a value for "Minimum value", or switch the rule off.',
    );
    expect(
      container.querySelector('[aria-invalid="true"]'),
    ).toHaveAccessibleDescription(
      'Enter a value for "Minimum value", or switch the rule off.',
    );
  });

  /**
   * And where the field IS stating one, the editor says nothing of its own —
   * but the refused control still describes the field's error region, which is
   * where the sentence a researcher reads now lives.
   */
  it('stands its verdict down for the refusal the field states, and describes it', () => {
    const { container } = render(
      <>
        <p id="host-error">The rules contradict each other.</p>
        <VariableValidationEditor
          entity="node"
          variableType="number"
          currentVariableId="age"
          allVariables={variables}
          value={{ minValue: null }}
          onChange={() => undefined}
          aria-invalid
          fieldIssue="The rules contradict each other."
          aria-describedby="host-error"
        />
      </>,
    );

    expect(screen.queryByRole('alert')).toBeNull();
    expect(
      container.querySelector('[aria-invalid="true"]'),
    ).toHaveAccessibleDescription('The rules contradict each other.');
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

    const required = screen.getByRole('checkbox', { name: 'Required answer' });
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
});
