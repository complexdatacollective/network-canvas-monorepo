import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  DraftVariableValidationEditor,
  type DraftVariableValidationEditorProps,
} from '../CodebookVariableValidationEditor.tsx';

/**
 * The rules surface for an attribute that does not exist yet.
 *
 * Everything a researcher sees is the codebook surface's, and the tests for
 * that are next door. What is only true here is where a save GOES — onto the
 * row that is inventing the attribute, rather than into a codebook section
 * there is nothing in yet — and that a rule map nothing could satisfy is
 * refused before it can get there.
 */
const variables = {
  age: { name: 'age', type: 'number', component: 'Number' },
  height: { name: 'height', type: 'number', component: 'Number' },
};

const renderEditor = (
  overrides: Partial<DraftVariableValidationEditorProps> = {},
) => {
  const onSave = vi.fn();
  const props: DraftVariableValidationEditorProps = {
    openId: 'first-open',
    entity: 'node',
    variableName: 'household_size',
    variableType: 'number',
    allVariables: variables,
    value: {},
    onSave,
    ...overrides,
  };
  const view = render(<DraftVariableValidationEditor {...props} />);
  return { ...view, onSave, props };
};

describe('the rules of an attribute a row is inventing', () => {
  it('is named after the attribute being invented', () => {
    renderEditor();

    expect(
      screen.getByRole('heading', {
        name: 'Edit validation for household_size',
      }),
    ).toBeInTheDocument();
  });

  it('hands the whole rule map to the row rather than writing a codebook', async () => {
    const user = userEvent.setup();
    const { onSave } = renderEditor({ value: { required: true } });

    await user.click(screen.getByRole('checkbox', { name: 'Minimum value' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledExactlyOnceWith({
      required: true,
      minValue: 0,
    });
  });

  /**
   * A rule switched on and left without a value is kept as `null` on purpose,
   * so the researcher can finish it rather than having it quietly dropped —
   * which means the save has to be refused while it is there. Refused HERE
   * because there is no host to refuse it: the row would carry it into the
   * create, and the codebook's answer would be the schema's words about a path.
   */
  it('refuses a save while a rule is switched on with no value', async () => {
    const user = userEvent.setup();
    const { onSave } = renderEditor({ value: { minValue: null } });

    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();

    await user.click(save);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('refuses a save whose rules leave no answer a participant could give', async () => {
    const user = userEvent.setup();
    const { onSave } = renderEditor({
      value: { minValue: 10, maxValue: 2 },
    });

    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();

    await user.click(save);
    expect(onSave).not.toHaveBeenCalled();
  });

  /**
   * The save control is not the only way to submit a form: Enter inside any of
   * the rule values does it too, and reaches the handler past a disabled
   * button. So the refusal is made twice, once where the researcher can see it
   * and once where the submit actually arrives.
   */
  it('refuses the same rules submitted with Enter rather than the button', async () => {
    const user = userEvent.setup();
    const { onSave } = renderEditor({ value: { minValue: 10, maxValue: 2 } });

    await user.click(screen.getByRole('spinbutton', { name: 'Minimum value' }));
    await user.keyboard('{Enter}');

    expect(onSave).not.toHaveBeenCalled();
  });

  /** A second open is a second draft, even for the same invented attribute. */
  it('starts again from the row when it is opened afresh', async () => {
    const user = userEvent.setup();
    const { rerender, props } = renderEditor();

    await user.click(screen.getByRole('checkbox', { name: 'Required answer' }));
    expect(
      screen.getByRole('checkbox', { name: 'Required answer' }),
    ).toBeChecked();

    rerender(
      <DraftVariableValidationEditor {...props} openId="opened-again" />,
    );

    expect(
      screen.getByRole('checkbox', { name: 'Required answer' }),
    ).not.toBeChecked();
  });
});
