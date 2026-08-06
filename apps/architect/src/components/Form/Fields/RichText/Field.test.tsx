import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import Form from '@codaco/fresco-ui/form/Form';

import ArchitectField from '../../ArchitectField';
import RichTextField from './Field';

describe('RichTextField', () => {
  it('renders required semantics and the seeded markdown through the shared field', async () => {
    render(
      <Form onSubmit={() => ({ success: true })}>
        <ArchitectField
          name="prompt"
          label="Prompt text"
          component={RichTextField}
          initialValue="Who do you know?"
          validation={{ required: true }}
        />
      </Form>,
    );

    const editor = await screen.findByRole('textbox', { name: 'Prompt text' });
    expect(editor).toHaveAttribute('aria-required', 'true');
    expect(editor).toHaveTextContent('Who do you know?');
  });
});
