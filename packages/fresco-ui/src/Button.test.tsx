import { render, screen } from '@testing-library/react';
import { Check } from 'lucide-react';
import { describe, expect, it } from 'vitest';

import Button from './Button';

describe('Button', () => {
  it('uses the NativeLink appearance for the link variant', () => {
    render(<Button variant="link">Clear selection</Button>);

    const button = screen.getByRole('button', { name: 'Clear selection' });
    const label = button.firstElementChild;

    expect(button).toHaveClass(
      'group',
      'focusable',
      'text-link',
      'font-semibold',
    );
    expect(label).toHaveClass(
      'group-hover:bg-[length:100%_2px]',
      'group-focus-visible:bg-[length:100%_2px]',
    );
  });

  it('keeps a link button icon outside the animated label', () => {
    render(
      <Button variant="link" icon={<Check data-testid="icon" />}>
        Confirm
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Confirm' });

    expect(button.children).toHaveLength(2);
    expect(button.firstElementChild).toBe(screen.getByTestId('icon'));
    expect(button.lastElementChild).toHaveTextContent('Confirm');
  });

  it('keeps the animated underline retracted for a disabled link button', () => {
    render(
      <Button variant="link" disabled>
        Disabled action
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Disabled action' });

    expect(button).toBeDisabled();
    expect(button).toHaveClass('disabled:[&>span]:bg-[length:0%_2px]!');
  });

  it('supports a slotted link without forwarding button-only attributes', () => {
    render(
      <Button
        variant="link"
        asChild
        icon={<Check data-testid="slotted-icon" />}
      >
        <a href="/docs">Documentation</a>
      </Button>,
    );

    const link = screen.getByRole('link', { name: 'Documentation' });

    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(link).not.toHaveAttribute('type');
    expect(link.firstElementChild).toBe(screen.getByTestId('slotted-icon'));
    expect(link.lastElementChild).toHaveClass(
      'group-hover:bg-[length:100%_2px]',
      'group-focus-visible:bg-[length:100%_2px]',
    );
  });

  it('does not add the animated label to other button variants', () => {
    render(<Button>Continue</Button>);

    const button = screen.getByRole('button', { name: 'Continue' });

    expect(button.firstElementChild).toBeNull();
    expect(button).not.toHaveClass('group', 'text-link');
  });
});
