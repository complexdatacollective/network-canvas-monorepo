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
    // Button's hover lift and press are gated on `ui-enabled`, which a label
    // can only fail through `aria-disabled`.
    expect(screen.getByText(CHOOSE_FILE).closest('label')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });
});
