import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import Form from '@codaco/fresco-ui/form/Form';

import { testVariableId } from '../../__tests__/testIds';
import { TestProtocolLocalization } from '../../interfaces/__tests__/TestProtocolLocalization';
import ProtocolField, { ProtocolFieldControl } from '../ProtocolField';

describe('ProtocolField', () => {
  it('runs protocol validation when mounted as an isolated interactive field', async () => {
    const onSubmit = vi.fn(() => ({ success: true as const }));

    render(
      <TestProtocolLocalization>
        <Form onSubmit={onSubmit}>
          <ProtocolField
            name="preview-value"
            field={{
              variable: testVariableId('nickname'),
              label: { en: 'What should we call you?' },
              type: 'text',
              component: 'Text',
              validation: { required: true, minLength: 4 },
            }}
          />
          <button type="submit">Check response</button>
        </Form>
      </TestProtocolLocalization>,
    );

    const input = screen.getByRole('textbox', {
      name: /What should we call you\?/,
    });
    fireEvent.change(input, { target: { value: 'Sam' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check response' }));

    expect(
      await screen.findByText('Enter at least 4 characters.'),
    ).toBeVisible();
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: 'Sami' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check response' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });
});

describe('ProtocolFieldControl', () => {
  const options = [
    { label: { en: 'Employed' }, value: 'employed' },
    { label: { en: 'Student' }, value: 'student' },
  ];

  it('shows the control, named by the question its caller draws, without a question or hint of its own', () => {
    render(
      <TestProtocolLocalization>
        <p id="question">What is your employment status?</p>
        <ProtocolFieldControl
          labelledBy="question"
          field={{
            variable: testVariableId('status'),
            label: { en: 'Not shown' },
            hint: { en: 'Not shown either' },
            type: 'categorical',
            component: 'CheckboxGroup',
            options,
          }}
        />
      </TestProtocolLocalization>,
    );

    expect(
      screen.getByRole('group', { name: 'What is your employment status?' }),
    ).toBeVisible();
    expect(screen.getByRole('checkbox', { name: 'Employed' })).toBeVisible();
    expect(screen.queryByText('Not shown')).toBeNull();
    expect(screen.queryByText('Not shown either')).toBeNull();
  });

  it('shows the validation hints only when the field shows them, and takes an answer without a form', () => {
    const field = {
      variable: testVariableId('nickname'),
      label: { en: 'Nickname' },
      type: 'text' as const,
      component: 'Text' as const,
      validation: { minLength: 4 },
    };
    const { rerender } = render(
      <TestProtocolLocalization>
        <ProtocolFieldControl field={field} />
      </TestProtocolLocalization>,
    );
    expect(screen.queryByText(/at least 4 characters/)).toBeNull();

    rerender(
      <TestProtocolLocalization>
        <ProtocolFieldControl field={{ ...field, showValidationHints: true }} />
      </TestProtocolLocalization>,
    );
    expect(screen.getByText(/at least 4 characters/)).toBeVisible();

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Sam' } });
    expect(input).toHaveValue('Sam');
  });
});
