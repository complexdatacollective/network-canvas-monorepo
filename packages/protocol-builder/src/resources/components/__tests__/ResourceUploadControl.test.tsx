import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import ResourceUploadControl from '../ResourceUploadControl.tsx';
import { renderInResourceContext } from './resourceContext.tsx';
import { createResourceHost } from './resourceHost.ts';

const CHOOSE_FILE = 'Choose a file from your computer';

describe('ResourceUploadControl', () => {
  it('does not look pressable while its input is disabled', async () => {
    const { client, protocolId } = createResourceHost();

    renderInResourceContext(
      client,
      protocolId,
      <ResourceUploadControl kind="image" onStaged={vi.fn()} disabled />,
    );

    const input = screen.getByLabelText(CHOOSE_FILE);
    expect(input).toBeDisabled();
    expect(input).toHaveClass('peer');

    const label = screen.getByText(CHOOSE_FILE).closest('label');
    expect(label).toBe(input.nextElementSibling);
    expect(label).not.toHaveAttribute('aria-disabled');
    expect(label).toHaveClass(
      'peer-disabled:cursor-not-allowed',
      'peer-disabled:opacity-50',
      'peer-disabled:active:translate-y-0!',
      'peer-disabled:active:elevation-low!',
    );
  });
});
