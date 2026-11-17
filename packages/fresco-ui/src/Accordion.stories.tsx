import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from './Accordion';

const ITEM_VALUES = ['overview', 'details', 'metadata'] as const;

const meta = {
  title: 'Components/Accordion',
  component: Accordion,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    multiple: {
      control: 'boolean',
      description: 'Whether multiple items can be open simultaneously',
    },
    disabled: {
      control: 'boolean',
      description: 'Disables the entire accordion',
    },
    keepMounted: {
      control: 'boolean',
      description: 'Keep collapsed panels in the DOM',
    },
    loopFocus: {
      control: 'boolean',
      description: 'Loop keyboard focus when navigating with arrow keys',
    },
    defaultValue: {
      control: 'check',
      options: ITEM_VALUES,
      description: 'Items that start expanded',
    },
  },
} satisfies Meta<typeof Accordion>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    multiple: true,
    disabled: false,
    keepMounted: true,
    loopFocus: true,
    defaultValue: ['overview'],
  },
  render: (args) => (
    <Accordion
      {...args}
      key={JSON.stringify(args.defaultValue ?? [])}
      className="w-80"
    >
      <AccordionItem value="overview">
        <AccordionHeader>
          <AccordionTrigger>Overview</AccordionTrigger>
        </AccordionHeader>
        <AccordionPanel>
          <p className="text-sm">
            The accordion expands and collapses with a smooth height and opacity
            transition.
          </p>
        </AccordionPanel>
      </AccordionItem>
      <AccordionItem value="details">
        <AccordionHeader>
          <AccordionTrigger>Details</AccordionTrigger>
        </AccordionHeader>
        <AccordionPanel>
          <ul className="flex flex-col gap-2 text-sm">
            <li>
              Toggle <code>multiple</code> to allow several panels open at once.
            </li>
            <li>
              Use <code>defaultValue</code> to set the initial open items.
            </li>
            <li>
              Set <code>disabled</code> to lock all triggers.
            </li>
          </ul>
        </AccordionPanel>
      </AccordionItem>
      <AccordionItem value="metadata">
        <AccordionHeader>
          <AccordionTrigger>Metadata</AccordionTrigger>
        </AccordionHeader>
        <AccordionPanel>
          <p className="text-sm">
            Triggers inherit the heading typography. The chevron rotates
            automatically when the panel opens.
          </p>
        </AccordionPanel>
      </AccordionItem>
    </Accordion>
  ),
};

function ancestorsBelow(element: HTMLElement, boundary: HTMLElement) {
  const found: HTMLElement[] = [];
  for (
    let current = element.parentElement;
    current && current !== boundary;
    current = current.parentElement
  ) {
    found.push(current);
  }
  return found;
}

/**
 * A focusable control sits flush against the panel's edge, with margins on it.
 * Its focus ring reaches past the control, so a panel that clips at rest cuts
 * the ring off. The play function asserts the rule that prevents that: an open,
 * settled panel does not clip, and a closed one does. It reads computed styles
 * and measured boxes, because a ring's painting is not observable from a test.
 */
export const FocusRingIsNotClipped: Story = {
  args: {
    multiple: true,
    defaultValue: ['field'],
  },
  // This play reads an outline that exists only while the field matches
  // `:focus-visible`, which never matches in Chromatic's unfocused capture
  // tab. `test:storybook` is where it runs.
  parameters: { chromatic: { disableSnapshot: true } },
  render: (args) => (
    <Accordion {...args} className="w-80" data-testid="accordion">
      <AccordionItem value="field">
        <AccordionHeader>
          <AccordionTrigger>Field</AccordionTrigger>
        </AccordionHeader>
        <AccordionPanel>
          <input
            aria-label="Flush field"
            className="focusable bg-surface-1 text-own-direction mt-3 mb-3 block w-full rounded-sm px-3 py-2"
          />
        </AccordionPanel>
      </AccordionItem>
      <AccordionItem value="after">
        <AccordionHeader>
          <AccordionTrigger>After</AccordionTrigger>
        </AccordionHeader>
        <AccordionPanel>
          <p className="text-sm">Content after the field.</p>
        </AccordionPanel>
      </AccordionItem>
    </Accordion>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const accordion = canvas.getByTestId('accordion');
    const input = canvas.getByRole('textbox', { name: 'Flush field' });
    const trigger = canvas.getByRole('button', { name: 'Field' });
    const after = canvas.getByRole('button', { name: 'After' });
    const panel = input.closest<HTMLElement>('[role="region"]');
    if (!panel) throw new Error('The field is not inside an accordion panel');

    const overflowOf = (element: HTMLElement) =>
      getComputedStyle(element).overflow;

    // Open on first render: no clipping, and no wait for an animation.
    await expect(overflowOf(panel)).toBe('visible');

    // Nothing between the control and the accordion root may clip its ring.
    await userEvent.tab();
    await userEvent.tab();
    await expect(input).toHaveFocus();
    await expect(getComputedStyle(input).outlineStyle).toBe('solid');
    for (const ancestor of ancestorsBelow(input, accordion)) {
      await expect(overflowOf(ancestor)).toBe('visible');
    }

    // Settling must not move anything. Forcing the panel back to clipping and
    // measuring what follows it is the same layout the panel had a frame
    // earlier; if the margins on the control collapsed through the panel,
    // the next trigger would sit at a different height.
    const settledTop = after.getBoundingClientRect().top;
    const settledInputTop = input.getBoundingClientRect().top;
    const restingOverflow = panel.style.overflow;
    panel.style.overflow = 'hidden';
    await expect(after.getBoundingClientRect().top).toBe(settledTop);
    await expect(input.getBoundingClientRect().top).toBe(settledInputTop);
    panel.style.overflow = restingOverflow;

    // Closing clips at once; the panel does not wait for an animation to end.
    await userEvent.click(trigger);
    await waitFor(() => expect(overflowOf(panel)).toBe('hidden'));
    await expect(panel).toHaveAttribute('aria-hidden', 'true');

    // Opening again clips only until the panel has settled.
    await userEvent.click(trigger);
    await waitFor(() => expect(overflowOf(panel)).toBe('visible'));
    await expect(panel).toHaveAttribute('aria-hidden', 'false');
  },
};
