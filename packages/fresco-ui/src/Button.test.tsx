import { render, screen } from '@testing-library/react';
import { Check } from 'lucide-react';
import { describe, expect, it } from 'vitest';

import Button from './Button';

describe('Button', () => {
  it('derives the raised edge from the selected button color', () => {
    render(
      <Button variant="raised" color="success">
        Open Architect
      </Button>,
    );

    expect(screen.getByRole('button', { name: 'Open Architect' })).toHaveClass(
      'bg-(--component-text)',
      'border-(--component-raised-edge)',
      'border-b-4',
      'not-disabled:hover:border-b-5',
      '[--component-text:var(--success)]',
      '[--component-raised-edge:color-mix(in_oklab,var(--component-text)_78%,var(--color-black)_22%)]',
      'not-disabled:hover:elevation-medium',
      'not-disabled:active:translate-y-1',
      'uppercase',
      'tracking-widest',
      'text-sm',
    );
  });

  it('scales the raised edge and allows the default text style', () => {
    render(
      <>
        <Button variant="raised" size="sm">
          Small
        </Button>
        <Button variant="raised" size="xl" textStyle="default">
          Extra large
        </Button>
      </>,
    );

    expect(screen.getByRole('button', { name: 'Small' })).toHaveClass(
      'border-b-3',
      'not-disabled:hover:border-b-4',
    );
    expect(screen.getByRole('button', { name: 'Extra large' })).toHaveClass(
      'border-b-6',
      'not-disabled:hover:border-b-8',
      'normal-case',
      'tracking-wide',
      'text-xl',
    );
  });

  it('reduces uppercase text by one size level', () => {
    render(
      <Button size="lg" textStyle="uppercase">
        Uppercase
      </Button>,
    );

    expect(screen.getByRole('button', { name: 'Uppercase' })).toHaveClass(
      'text-base',
      'tracking-widest',
      'uppercase',
    );
  });

  it('supports a contrast-background default-inverted variant', () => {
    render(
      <Button variant="default-inverted" color="warning">
        Install
      </Button>,
    );

    expect(screen.getByRole('button', { name: 'Install' })).toHaveClass(
      'bg-white',
      'text-(--component-text)',
      'focus:outline-warning',
    );
  });

  it('uses the NativeLink appearance for the link variant', () => {
    render(<Button variant="link">Clear selection</Button>);

    const button = screen.getByRole('button', { name: 'Clear selection' });
    const label = button.firstElementChild;

    expect(button).toHaveClass(
      'group',
      'focusable',
      'text-link',
      'font-semibold',
      'overflow-visible',
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
