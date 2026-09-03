import { render, screen } from '@testing-library/react';
import { Check } from 'lucide-react';
import { describe, expect, it } from 'vitest';

import Button, { buttonVariants, IconButton } from './Button';

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
      'ui-enabled:hover:border-b-5',
      '[--component-text:var(--success)]',
      '[--component-raised-edge:color-mix(in_oklab,var(--component-text)_78%,var(--color-black)_22%)]',
      'ui-enabled:hover:elevation-medium',
      'ui-enabled:active:translate-y-1',
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
      'ui-enabled:hover:border-b-4',
    );
    expect(screen.getByRole('button', { name: 'Extra large' })).toHaveClass(
      'border-b-6',
      'ui-enabled:hover:border-b-8',
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
      'group/link',
      'focusable',
      'text-link',
      'font-semibold',
      'overflow-visible',
    );
    expect(label).toHaveClass(
      'group-hover/link:bg-[length:100%_2px]',
      'group-focus-visible/link:bg-[length:100%_2px]',
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
    expect(button).toHaveClass('ui-disabled:[&>span]:bg-[length:0%_2px]!');
  });

  it('excludes aria-disabled buttons from hover and press styling', () => {
    render(
      <Button variant="text" aria-disabled="true">
        Unavailable action
      </Button>,
    );

    const button = screen.getByRole('button', {
      name: 'Unavailable action',
    });
    expect(button).toHaveClass(
      'ui-disabled:cursor-not-allowed',
      'ui-disabled:opacity-50',
      'ui-enabled:hover:bg-(--component-text)',
      'ui-enabled:active:translate-y-[2px]',
    );
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
      'group-hover/link:bg-[length:100%_2px]',
      'group-focus-visible/link:bg-[length:100%_2px]',
    );
  });

  it('does not add the animated label to other button variants', () => {
    render(<Button>Continue</Button>);

    const button = screen.getByRole('button', { name: 'Continue' });

    expect(button.firstElementChild).not.toHaveClass('bg-[length:0%_2px]');
    expect(button).not.toHaveClass('group/link', 'text-link');
  });

  it('styles toggle buttons from aria-pressed using selected colors', () => {
    render(
      <>
        <Button aria-pressed>Favorite</Button>
        <IconButton aria-label="Favorite icon" aria-pressed icon={<Check />} />
      </>,
    );

    const toggleButtons = [
      screen.getByRole('button', { name: 'Favorite' }),
      screen.getByRole('button', { name: 'Favorite icon' }),
    ];

    for (const toggleButton of toggleButtons) {
      expect(toggleButton).toHaveAttribute('aria-pressed', 'true');
      expect(toggleButton).toHaveClass(
        'aria-pressed:border-selected',
        'aria-pressed:bg-selected',
        'aria-pressed:text-selected-contrast',
      );
    }
  });

  it('styles disclosure buttons from aria-expanded using selected colors', () => {
    render(
      <>
        <Button aria-expanded>Options</Button>
        <IconButton aria-label="Icon options" aria-expanded icon={<Check />} />
      </>,
    );

    const disclosureButtons = [
      screen.getByRole('button', { name: 'Options' }),
      screen.getByRole('button', { name: 'Icon options' }),
    ];

    for (const disclosureButton of disclosureButtons) {
      expect(disclosureButton).toHaveAttribute('aria-expanded', 'true');
      expect(disclosureButton).toHaveClass(
        'aria-expanded:border-selected',
        'aria-expanded:bg-selected',
        'aria-expanded:text-selected-contrast',
      );
    }
  });

  // Once a control wears the selected treatment the colour is carrying state,
  // so hover must not repaint over it. The utility has to be ABSENT, not
  // merely outranked or recoloured — see the two tests after these.
  it.each([
    ['a toggle that is on', { 'aria-pressed': true }],
    ['a disclosure that is open', { 'aria-expanded': true }],
    ['a control selected by prop', { selected: true }],
  ] as const)('withholds the hover repaint from %s', (_name, selectedProps) => {
    render(
      <Button variant="text" {...selectedProps}>
        Highlight
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Highlight' });
    expect(button.className).not.toMatch(/(?:^|\s|:)hover:bg-/);
    expect(button.className).not.toMatch(/(?:^|\s|:)hover:text-/);
  });

  // The mirror image: withholding is conditional, and a compound variant keyed
  // on `selected: false` matches nothing if the variant has no default. Without
  // that default every unselected button would quietly lose its hover entirely.
  it.each([
    ['an idle control', {}],
    ['a toggle that is off', { 'aria-pressed': false }],
    ['a disclosure that is closed', { 'aria-expanded': 'false' }],
    ['a part-way toggle', { 'aria-pressed': 'mixed' }],
    ['a control deselected by prop', { selected: false }],
  ] as const)('keeps the hover repaint on %s', (_name, unselectedProps) => {
    render(
      <Button variant="text" {...unselectedProps}>
        Highlight
      </Button>,
    );

    expect(screen.getByRole('button', { name: 'Highlight' })).toHaveClass(
      'ui-enabled:hover:bg-(--component-text)',
      'ui-enabled:hover:text-(--component-bg)',
    );
  });

  // Direct `buttonVariants()` callers (ButtonLink, AutoFileDrop, ColumnHeader,
  // SiteNavigation) pass no `selected` at all.
  it('keeps the hover repaint for a bare buttonVariants() call', () => {
    expect(buttonVariants({ variant: 'text' })).toContain(
      'ui-enabled:hover:bg-(--component-text)',
    );
  });

  // `PresetSwitcher` tints its open trigger instead of taking the full-strength
  // fill, and that trigger sits open for a whole stage — so a researcher hovers
  // it constantly. Any fix that outranked the hover with a higher-specificity
  // `hover:aria-expanded:bg-selected` would blow the tint back to full.
  it('leaves a call site quieter selected treatment unopposed on hover', () => {
    render(
      <Button
        variant="text"
        aria-expanded
        className="aria-expanded:bg-selected/15"
      >
        Preset
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Preset' });
    expect(button).toHaveClass('aria-expanded:bg-selected/15');
    // Nothing hover-scoped survives to outrank it, and the default fill it
    // replaced merged away rather than lingering at equal specificity.
    expect(button.className).not.toMatch(/(?:^|\s|:)hover:bg-/);
    expect(button).not.toHaveClass('aria-expanded:bg-selected');
  });

  it('withholds the hover repaint from a selected icon button', () => {
    render(
      <>
        <IconButton
          aria-label="Pressed icon"
          variant="text"
          aria-pressed
          icon={<Check />}
        />
        <IconButton
          aria-label="Selected icon"
          variant="text"
          selected
          icon={<Check />}
        />
      </>,
    );

    for (const name of ['Pressed icon', 'Selected icon']) {
      const button = screen.getByRole('button', { name });
      expect(button.className).not.toMatch(/(?:^|\s|:)hover:bg-/);
    }

    // `IconButton` used to drop `selected` on the floor — it never reached the
    // variants — so the prop rendered no selected treatment at all. No caller
    // had noticed (the one `selected` consumer is a `Button`), but the hover
    // rule above now depends on the variant, so it has to arrive.
    expect(screen.getByRole('button', { name: 'Selected icon' })).toHaveClass(
      'bg-selected',
    );
  });

  // Regression: the interview's "next" button asks for `ui-enabled:hover:bg-success`
  // and is navigated by clicking, so the pointer is still on it when the next
  // stage renders. The variant's hover background must therefore MERGE AWAY
  // rather than coexist — `tailwind-merge` only does that while both carry the
  // same modifier chain, so any extra guard on the variant's hover (a
  // `not-aria-pressed:`, say) leaves both in place, and the guarded selector's
  // extra `:not()`s then outrank the call site's, silently repainting it. That
  // is what took the green off the "next" button under the resting pointer.
  it('lets a call site replace the hover background rather than layering over it', () => {
    render(
      <Button variant="text" className="ui-enabled:hover:bg-success">
        Next
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Next' });
    expect(button).toHaveClass('ui-enabled:hover:bg-success');
    expect(button.className).not.toMatch(
      /(?:^|:)hover:(?:[\w-]+:)*bg-\(--component-text\)/,
    );
  });

  it('renders the selected treatment from a prop, without claiming an ARIA state', () => {
    render(<Button selected>Sorted column</Button>);

    const button = screen.getByRole('button', { name: 'Sorted column' });
    expect(button).toHaveClass(
      'border-selected',
      'bg-selected',
      'text-selected-contrast',
    );
    // The whole point of the prop: a control that is visually selected but is
    // not a toggle must not announce a pressed state.
    expect(button).not.toHaveAttribute('aria-pressed');
  });

  it('lets a call site override the selected colours it did not choose', () => {
    render(
      <Button aria-pressed className="aria-pressed:bg-accent">
        Custom pressed
      </Button>,
    );

    // `!important` on the base rule made every call-site override dead code.
    expect(
      screen.getByRole('button', { name: 'Custom pressed' }),
    ).not.toHaveClass('aria-pressed:bg-selected!');
  });
});

describe('IconButton sizing', () => {
  // Shipped Safari computes width 0 for a flex item whose width would come
  // only from `aspect-ratio` × a definite height inside nested flex rows —
  // the control vanishes (empty interview nav rails, collapsed undo pills,
  // iconless rich-text toolbars). The width must therefore be stated
  // explicitly, in lockstep with heightVariants' scale.
  it.each([
    ['sm', 'h-10', 'w-10'],
    ['md', 'h-12', 'w-12'],
    ['lg', 'h-16', 'w-16'],
    ['xl', 'h-20', 'w-20'],
  ] as const)(
    'states the %s square explicitly (%s pairs with %s)',
    (size, heightClass, widthClass) => {
      render(
        <IconButton
          aria-label={`Probe ${size}`}
          icon={<Check />}
          size={size}
        />,
      );

      const button = screen.getByRole('button', { name: `Probe ${size}` });
      expect(button).toHaveClass(heightClass);
      expect(button).toHaveClass(widthClass);
    },
  );
});

describe('Button label box', () => {
  // `text-box-trim` is inert on the inline-flex button itself, so a text label
  // gets a span of its own; that box, cap height to baseline, is what centres
  // in the control.
  it('gives a text label a cap-trimmed box of its own', () => {
    render(<Button icon={<Check data-testid="icon" />}>Confirm</Button>);

    const button = screen.getByRole('button', { name: 'Confirm' });

    expect(button.children).toHaveLength(2);
    expect(button.firstElementChild).toBe(screen.getByTestId('icon'));
    expect(button.lastElementChild).toHaveClass('text-box-trim');
    expect(button.lastElementChild).toHaveTextContent('Confirm');
  });

  it('leaves a label that carries its own markup untouched', () => {
    render(
      <Button>
        <em data-testid="label">Confirm</em>
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Confirm' });

    expect(button.children).toHaveLength(1);
    expect(button.firstElementChild).toBe(screen.getByTestId('label'));
  });

  it('trims the label of a slotted child', () => {
    render(
      <Button asChild>
        <a href="#confirm">Confirm</a>
      </Button>,
    );

    const link = screen.getByRole('link', { name: 'Confirm' });

    expect(link.children).toHaveLength(1);
    expect(link.firstElementChild).toHaveClass('text-box-trim');
  });

  // The link variant paints its underline along the bottom of the label box;
  // a cap-trimmed box would run it through the descenders.
  it('keeps the link variant on its underline box instead', () => {
    render(<Button variant="link">Confirm</Button>);

    const label = screen.getByRole('button', {
      name: 'Confirm',
    }).firstElementChild;

    expect(label).not.toHaveClass('text-box-trim');
    expect(label).toHaveClass('bg-[length:0%_2px]');
  });
});
