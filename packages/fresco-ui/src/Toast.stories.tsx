import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useRef } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { Button } from './Button';
import { awaitPassiveEffects } from './storybook-support/awaitPassiveEffects';
import { withToastProvider } from './storybook-support/withToastProvider';
import { type ToastVariant, useToast } from './Toast';
import Heading from './typography/Heading';
import Paragraph from './typography/Paragraph';
import { UnorderedList } from './typography/UnorderedList';

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

/**
 * Waits for `element` to come to rest, then runs `assert` against its box.
 *
 * Toasts slide in from below, and move between the stacked and expanded
 * layouts, over ~0.5s, so any single frame can transiently satisfy a position
 * check while the toast is still moving. Gate on the position being identical
 * across two invocations first: a running transition advances with wall-clock
 * time, so two reads 50ms apart only match once it has finished — or not yet
 * started, in which case the toast still sits where it started and the
 * assertions reject the premature match. Only the resting layout passes.
 */
async function waitForRestingBox(
  element: HTMLElement,
  assert: (box: DOMRect) => void,
) {
  let lastSeenTop: number | null = null;
  await waitFor(() => {
    const box = element.getBoundingClientRect();
    const settled = lastSeenTop === box.top;
    lastSeenTop = box.top;
    expect(settled).toBe(true);
    assert(box);
  });
}

/**
 * Asserts that a toast sits entirely on screen and that a click on its Close
 * control would land on that control.
 */
function expectOnScreenAndDismissible(toastRoot: HTMLElement, box: DOMRect) {
  expect(box.top).toBeGreaterThanOrEqual(0);
  expect(box.bottom).toBeLessThanOrEqual(window.innerHeight);

  // Base UI hides Toast.Close from the accessibility tree until the toast is
  // hovered or focused, so it has no ARIA role to query by until then — match
  // the label attribute instead, which reflects presence either way.
  const close = within(toastRoot).getByLabelText('Close');
  // The Close control has to be the topmost element at its own centre, or the
  // click lands on whatever covers it — including nothing at all, when the
  // point is off screen or clipped away by a scrolling ancestor.
  const closeBox = close.getBoundingClientRect();
  const atCentre = toastRoot.ownerDocument.elementFromPoint(
    closeBox.left + closeBox.width / 2,
    closeBox.top + closeBox.height / 2,
  );
  expect(close.contains(atCentre)).toBe(true);
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

    // Anchored to the bottom and growing up, overflow shows as a negative
    // top: the title and Close control leaving the top of the screen.
    await waitForRestingBox(toastRoot, (box) =>
      expectOnScreenAndDismissible(toastRoot, box),
    );

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

// Oldest first: each one is added in turn, so the first sits at the top of
// the expanded stack and the last at the front.
const STACKED_WARNINGS = [
  {
    title: 'Some interviews were not exported',
    warnings: [
      'Interview 3f9a2c could not be exported because its protocol was deleted.',
      'Interview 81bd04 has an unfinished stage, so its network may be incomplete.',
      'Two interviews used an older protocol version; their variables were mapped to the current codebook.',
    ],
  },
  {
    title: 'Some files were skipped',
    warnings: [
      'The CSV for edge type "Friendship" was empty and was left out of the archive.',
      'Ego attributes were not exported for 4 interviews that never reached the ego form.',
      'Attribute "date_met" had values that could not be parsed as dates; they were exported as text.',
    ],
  },
  {
    title: 'Large export',
    warnings: [
      'This export includes 312 interviews and may take several minutes to open in a spreadsheet application.',
      'GraphML files are included for every interview; consider exporting CSV only for faster processing.',
      'Downloads larger than 2 GB may be blocked by some browsers.',
    ],
  },
  {
    title: 'Export finished with warnings',
    warnings: [
      'Node labels were truncated to 255 characters in 6 interviews to match the GraphML schema.',
      'Interview 0c77de was still in progress when the export began; its latest stage may be missing.',
      'One interview had no participant identifier, so its file is named by interview ID instead.',
    ],
  },
];

function TallPersistentStackDemo() {
  const toast = useToast();
  // `useToast()` returns a fresh object every render, so guard with a ref
  // instead of an effect dependency on `toast` itself.
  const shown = useRef(false);

  useEffect(() => {
    if (shown.current) return;
    shown.current = true;
    for (const { title, warnings } of STACKED_WARNINGS) {
      toast.add({
        title,
        description: (
          <UnorderedList className="ms-5 mt-2">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </UnorderedList>
        ),
        timeout: 0,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <Heading level="h3" margin="none" className="text-lg">
        Tall persistent toasts
      </Heading>
      <Paragraph margin="none" className="text-sm text-current/70">
        Several multi-line warnings that never time out, like the warnings
        Fresco raises after an export. Hover over the stack, or press F6, to
        expand it. The warnings that don&apos;t fit are hidden and counted above
        the stack; dismiss one to bring the next into view.
      </Paragraph>
    </div>
  );
}

/** Every toast in the notifications region, newest (frontmost) first. */
function toastsIn(region: HTMLElement) {
  return within(region).queryAllByRole('dialog');
}

/**
 * The toasts the stack is showing. Hidden ones are `inert`, which takes them
 * out of the tab order and the accessibility tree — Testing Library's role
 * queries don't apply that rule, so it is checked here.
 */
function shownToastsIn(region: HTMLElement) {
  return toastsIn(region).filter((toast) => !toast.inert);
}

function hiddenToastsIn(region: HTMLElement) {
  return toastsIn(region).filter((toast) => toast.inert);
}

function moreNotificationsLabel(count: number) {
  return count === 1 ? '1 more notification' : `${count} more notifications`;
}

/**
 * Waits for the expanded stack to come to rest, then asserts that every toast
 * it shows — the topmost above all — is on screen and dismissible, and that
 * the indicator above it counts the hidden ones.
 */
async function expectExpandedStackOnScreen(region: HTMLElement) {
  const shown = shownToastsIn(region);
  const topmost = shown.at(-1);
  if (!topmost) throw new Error('The stack shows no toasts');
  const hiddenCount = hiddenToastsIn(region).length;

  await waitForRestingBox(topmost, (box) => {
    expectOnScreenAndDismissible(topmost, box);
    for (const toast of shown) {
      const toastBox = toast.getBoundingClientRect();
      expect(toastBox.top).toBeGreaterThanOrEqual(0);
      expect(toastBox.bottom).toBeLessThanOrEqual(window.innerHeight);
    }

    const indicator = within(region).getByText(
      moreNotificationsLabel(hiddenCount),
    );
    expect(indicator).toBeVisible();
    const indicatorBox = indicator.getBoundingClientRect();
    expect(indicatorBox.top).toBeGreaterThanOrEqual(0);
    expect(indicatorBox.bottom).toBeLessThanOrEqual(box.top);
  });
}

/**
 * Expanded, a stack of tall persistent toasts is taller than the screen.
 * Rather than let the oldest run off the top, where they could be neither
 * read nor dismissed, the stack hides the ones it has no room for (see
 * `Toaster` in `Toast.tsx`) and counts them above the topmost toast shown.
 * Dismissing a toast brings the next hidden one into view.
 */
export const TallPersistentStack: Story = {
  render: () => <TallPersistentStackDemo />,
  play: async ({ canvasElement }) => {
    const screen = within(canvasElement.ownerDocument.body);
    const region = await screen.findByRole('region', {
      name: 'Notifications',
    });

    // Every warning has to be in the DOM with its text: an empty stack, or a
    // lone short toast, fits the screen and would pass everything below.
    await waitFor(() =>
      expect(toastsIn(region)).toHaveLength(STACKED_WARNINGS.length),
    );
    for (const { title, warnings } of STACKED_WARNINGS) {
      const toast = within(region).getByRole('dialog', { name: title });
      await waitFor(() => expect(toast).toHaveTextContent(warnings[0] ?? ''));
    }

    // F6 is Base UI's own shortcut into the notifications region, and expands
    // the stack. Unlike hover or a bare `focus()`, it does so in Chromatic's
    // unfocused tab too, where `:focus-visible` never matches. Its listener
    // is attached in an effect once the first toast exists.
    await awaitPassiveEffects();
    await userEvent.keyboard('{F6}');

    // The warnings are too tall to all fit, so the oldest are hidden. If none
    // were, the stack would fit and this story wouldn't exercise the overflow
    // at all.
    await waitFor(() => {
      const hidden = hiddenToastsIn(region);
      expect(hidden.length).toBeGreaterThan(0);
      for (const toast of hidden) expect(toast).not.toBeVisible();
    });
    await expectExpandedStackOnScreen(region);

    // Dismissing the frontmost toast makes room for the newest hidden one.
    const [front] = shownToastsIn(region);
    const [nextHidden] = hiddenToastsIn(region);
    if (!front || !nextHidden)
      throw new Error('Expected shown and hidden toasts');
    const hiddenBefore = hiddenToastsIn(region).length;

    await userEvent.click(within(front).getByLabelText('Close'));
    await waitFor(() => expect(front).not.toBeInTheDocument());
    // Dismissing can move focus out of the region, which collapses the stack
    // again; F6 re-expands it.
    await userEvent.keyboard('{F6}');

    await waitFor(() => {
      expect(nextHidden.inert).toBe(false);
      expect(hiddenToastsIn(region)).toHaveLength(hiddenBefore - 1);
    });
    await expectExpandedStackOnScreen(region);
  },
};
