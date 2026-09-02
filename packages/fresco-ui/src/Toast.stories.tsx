import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useRef } from 'react';
import { expect, waitFor, within } from 'storybook/test';

import { Button } from './Button';
import { withToastProvider } from './storybook-support/withToastProvider';
import { type ToastVariant, useToast } from './Toast';
import Heading from './typography/Heading';
import Paragraph from './typography/Paragraph';

const meta = {
  title: 'Components/Toast',
  decorators: [withToastProvider],
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function BasicDemo() {
  const { add } = useToast();
  const countRef = useRef(0);

  const createToast = () => {
    countRef.current += 1;
    add({
      title: `Toast ${countRef.current}`,
      description: 'This is a toast notification.',
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <Heading level="h3" margin="none" className="text-lg">
        Basic Toast
      </Heading>
      <Paragraph margin="none" className="text-sm text-current/70">
        Click the button to create toasts. Hover over the stack to expand.
      </Paragraph>
      <Button onClick={createToast}>Create Toast</Button>
    </div>
  );
}

export const Default: Story = {
  render: () => <BasicDemo />,
};

function VariantsDemo() {
  const { add } = useToast();

  const createToast = (variant: ToastVariant) => {
    const messages: Record<
      ToastVariant,
      { title: string; description: string }
    > = {
      default: {
        title: 'Default Toast',
        description: 'This is a default toast notification.',
      },
      info: {
        title: 'Information',
        description: 'Here is some helpful information.',
      },
      success: {
        title: 'Success',
        description: 'The operation completed successfully.',
      },
      destructive: {
        title: 'Error',
        description: 'Something went wrong. Please try again.',
      },
    };

    add({
      ...messages[variant],
      variant,
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <Heading level="h3" margin="none" className="text-lg">
        Toast Variants
      </Heading>
      <Paragraph margin="none" className="text-sm text-current/70">
        Different visual styles for different types of notifications.
      </Paragraph>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => createToast('default')}>
          Default
        </Button>
        <Button variant="outline" onClick={() => createToast('info')}>
          Info
        </Button>
        <Button variant="outline" onClick={() => createToast('success')}>
          Success
        </Button>
        <Button variant="outline" onClick={() => createToast('destructive')}>
          Destructive
        </Button>
      </div>
    </div>
  );
}

export const Variants: Story = {
  render: () => <VariantsDemo />,
};

function MultipleToastsDemo() {
  const { add } = useToast();
  const countRef = useRef(0);

  const variants: ToastVariant[] = [
    'default',
    'info',
    'success',
    'destructive',
  ];

  const createMultipleToasts = () => {
    variants.forEach((variant, index) => {
      setTimeout(() => {
        countRef.current += 1;
        add({
          title: `${variant.charAt(0).toUpperCase() + variant.slice(1)} Toast ${countRef.current}`,
          description: `This is a ${variant} notification.`,
          variant,
        });
      }, index * 300);
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <Heading level="h3" margin="none" className="text-lg">
        Multiple Toasts
      </Heading>
      <Paragraph margin="none" className="text-sm text-current/70">
        Create multiple toasts to see how they stack. Hover over the stack to
        expand.
      </Paragraph>
      <Button onClick={createMultipleToasts}>Create Multiple Toasts</Button>
    </div>
  );
}

export const MultipleToasts: Story = {
  render: () => <MultipleToastsDemo />,
};

function LoadingDemo() {
  const { add, update } = useToast();

  const simulateExport = () => {
    const id = add({
      title: 'Exporting interviews',
      description: 'Fetching interview data...',
      timeout: 0,
      onCancel: () => {
        // eslint-disable-next-line no-console
        console.log('Export cancelled');
      },
    });

    let current = 0;
    const total = 10;
    const interval = setInterval(() => {
      current++;
      if (current <= total) {
        update(id, {
          description: `Generating files... ${String(current)} / ${String(total)}`,
        });
      } else {
        clearInterval(interval);
        update(id, {
          title: 'Export complete!',
          description: 'Your download should start automatically.',
          variant: 'success',
          timeout: 5000,
        });
      }
    }, 500);
  };

  return (
    <div className="flex flex-col gap-4">
      <Heading level="h3" margin="none" className="text-lg">
        Loading Toast (Export Progress)
      </Heading>
      <Paragraph margin="none" className="text-sm text-current/70">
        Simulates an export with progress updates, then transitions to success.
      </Paragraph>
      <Button onClick={simulateExport}>Simulate Export</Button>
    </div>
  );
}

export const Loading: Story = {
  render: () => <LoadingDemo />,
};

function toastRootFor(closeButton: HTMLElement): HTMLElement {
  const root = closeButton.closest('[data-testid="toast-viewport"] > *');
  if (!(root instanceof HTMLElement)) {
    throw new Error('Close button is not inside a toast');
  }
  return root;
}

function LongDescriptionDemo() {
  const toast = useToast();
  // `useToast()` returns a fresh object every render, so guard with a ref
  // instead of an effect dependency on `toast` itself.
  const shown = useRef(false);

  useEffect(() => {
    if (shown.current) return;
    shown.current = true;
    const description = Array.from(
      { length: 60 },
      (_, i) =>
        `Line ${i + 1} of a description long enough to overflow the toast.`,
    ).join(' ');
    toast.add({
      title: 'Long description',
      description,
      variant: 'destructive',
      timeout: 0,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

/**
 * A description long enough to overflow the toast is capped and scrolls
 * internally (see `DESCRIPTION_MAX_HEIGHT` in `Toast.tsx`), so the title and
 * Close control stay on screen and reachable regardless of how much content a
 * consumer renders — the toast viewport anchors to the bottom of the screen
 * and grows upward, so unbounded content would otherwise be clipped by the
 * browser window with no way to read or dismiss it.
 */
export const LongDescription: Story = {
  render: () => <LongDescriptionDemo />,
  play: async ({ canvasElement }) => {
    const doc = canvasElement.ownerDocument;
    const screen = within(doc.body);

    // Base UI hides Toast.Close from the accessibility tree until the toast
    // is hovered or focused, so it has no ARIA role to query by until then —
    // match the label attribute instead, which reflects presence either way.
    const close = await screen.findByLabelText('Close');
    const toastRoot = toastRootFor(close);

    // Toast.Title and Toast.Description are given `render` elements with no
    // children of their own, so Base UI supplies the title and description
    // text. Assert it actually lands in the DOM: a Base UI change to how
    // `render`-prop content is handled would otherwise silently produce an
    // empty toast that still passes every layout assertion below.
    await waitFor(() => {
      expect(toastRoot).toHaveTextContent('Long description');
      expect(toastRoot).toHaveTextContent(
        'Line 1 of a description long enough to overflow the toast.',
      );
    });

    // The toast slides in from below over ~0.5s, so any single frame can
    // transiently satisfy on-screen checks while the toast is still moving.
    // Gate on the position being identical across two invocations first: a
    // running transition advances with wall-clock time, so two reads 50ms
    // apart only match once it has finished — or not yet started, in which
    // case the toast sits fully below the viewport and the on-screen
    // assertions reject the premature match. Only the resting layout passes.
    let lastSeenTop: number | null = null;
    await waitFor(() => {
      const box = toastRoot.getBoundingClientRect();
      const settled = lastSeenTop === box.top;
      lastSeenTop = box.top;
      expect(settled).toBe(true);

      // Anchored to the bottom and growing up, overflow shows as a negative
      // top: the title and Close control leaving the top of the screen.
      expect(box.top).toBeGreaterThanOrEqual(0);
      expect(box.height).toBeLessThanOrEqual(window.innerHeight);
      // The Close control has to be on screen to be clickable at all...
      const closeBox = close.getBoundingClientRect();
      expect(closeBox.top).toBeGreaterThanOrEqual(0);
      expect(closeBox.bottom).toBeLessThanOrEqual(window.innerHeight);
      // ...and the topmost element at its own centre, or the click lands on
      // whatever covers it.
      const atCentre = doc.elementFromPoint(
        closeBox.left + closeBox.width / 2,
        closeBox.top + closeBox.height / 2,
      );
      expect(close.contains(atCentre)).toBe(true);
    });

    // The description is what `aria-describedby` points at, and is now the
    // element that scrolls internally rather than growing the toast.
    const descriptionId = toastRoot.getAttribute('aria-describedby');
    if (!descriptionId) {
      throw new Error('Toast has no aria-describedby');
    }
    const description = doc.getElementById(descriptionId);
    if (!description) {
      throw new Error('Toast description element not found');
    }
    expect(description.scrollHeight).toBeGreaterThan(description.clientHeight);
    description.scrollTop = description.scrollHeight;
    await waitFor(() => expect(description.scrollTop).toBeGreaterThan(0));

    // A scrollable region with no focusable content is unreachable by
    // keyboard unless it is in the tab order itself — `focus()` alone would
    // still pass with `tabindex="-1"`, which no amount of tabbing can reach.
    // The tab stop comes from an overflow measurement ScrollArea takes in a
    // requestAnimationFrame after mount, so it has to be polled for: every
    // wait above forces layout from JS without ever needing a paint, so under
    // a starved tab the play function can get here before that first frame
    // has run. A region stuck at `tabindex="-1"` still fails — the poll times
    // out.
    await waitFor(() => expect(description.tabIndex).toBeGreaterThanOrEqual(0));
    description.focus();
    expect(doc.activeElement).toBe(description);
  },
};
