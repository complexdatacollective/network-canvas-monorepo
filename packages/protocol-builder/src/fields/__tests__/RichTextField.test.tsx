import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import Field from '@codaco/fresco-ui/form/Field/Field';
import Form from '@codaco/fresco-ui/form/Form';

import RichTextField from '../RichTextField.tsx';

describe('RichTextField', () => {
  it('renders required semantics and the seeded markdown through the shared field', async () => {
    render(
      <Form onSubmit={() => ({ success: true })}>
        <Field
          name="prompt"
          label="Prompt text"
          component={RichTextField}
          initialValue="Who do you know?"
          required
        />
      </Form>,
    );

    const editor = await screen.findByRole('textbox', { name: 'Prompt text' });
    expect(editor).toHaveAttribute('aria-required', 'true');
    expect(editor).toHaveTextContent('Who do you know?');
  });
});
