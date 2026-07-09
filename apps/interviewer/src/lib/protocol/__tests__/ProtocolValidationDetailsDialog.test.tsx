import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  getProtocolValidationDetailsCopyText,
  ProtocolValidationDetailsDialogBody,
  ProtocolValidationDetailsDialogView,
} from '../ProtocolValidationDetailsDialog';

describe('ProtocolValidationDetailsDialog', () => {
  it('formats validation issues for copying', () => {
    const copyText = getProtocolValidationDetailsCopyText({
      message: 'Protocol failed schema validation.',
      issues: [
        {
          path: 'stages.0.label',
          message: 'Required',
        },
        {
          path: '',
          message: 'Invalid protocol.',
        },
      ],
    });

    expect(copyText).toContain('1. stages.0.label: Required');
    expect(copyText).toContain('2. protocol: Invalid protocol.');
  });

  it('renders the validation errors and support text', () => {
    render(
      <ProtocolValidationDetailsDialogBody
        message="Protocol failed schema validation."
        issues={[
          {
            path: 'codebook.node.person.variables.age.type',
            message: 'Invalid literal value, expected "number"',
          },
        ]}
      />,
    );

    expect(
      screen.getByRole('region', { name: 'Protocol validation errors' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('codebook.node.person.variables.age.type'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Invalid literal value, expected "number"'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'community forum' }),
    ).toHaveAttribute('href', 'https://community.networkcanvas.com');
    expect(
      screen.getByRole('link', { name: 'info@networkcanvas.com' }),
    ).toHaveAttribute('href', 'mailto:info@networkcanvas.com');
  });

  it('copies the validation errors from the dialog footer', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    render(
      <ProtocolValidationDetailsDialogView
        open
        onClose={() => {}}
        message="Protocol failed schema validation."
        issues={[
          {
            path: 'stages.0.label',
            message: 'Required',
          },
        ]}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Copy' }));

    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('1. stages.0.label: Required'),
    );
    expect(
      await screen.findByText('Validation errors copied to clipboard.'),
    ).toBeInTheDocument();
  });
});
