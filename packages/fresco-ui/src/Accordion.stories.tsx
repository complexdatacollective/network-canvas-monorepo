import type { Meta, StoryObj } from '@storybook/react-vite';

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
