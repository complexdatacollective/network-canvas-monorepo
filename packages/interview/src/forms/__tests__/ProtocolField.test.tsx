import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import Form from '@codaco/fresco-ui/form/Form';

import ProtocolField from '../ProtocolField';

describe('ProtocolField', () => {
  it('runs protocol validation when mounted as an isolated interactive field', async () => {
    const onSubmit = vi.fn(() => ({ success: true as const }));

    render(
      <Form onSubmit={onSubmit}>
        <ProtocolField
          name="preview-value"
          field={{
            variable: 'nickname',
            label: 'What should we call you?',
            type: 'text',
            component: 'Text',
            validation: { required: true, minLength: 4 },
          }}
        />
        <button type="submit">Check response</button>
      </Form>,
    );

    const input = screen.getByRole('textbox', {
      name: /What should we call you\?/,
    });
    fireEvent.change(input, { target: { value: 'Sam' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check response' }));

    expect(
      await screen.findByText('Too short. Enter at least 4 characters.'),
    ).toBeVisible();
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: 'Sami' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check response' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });
});
