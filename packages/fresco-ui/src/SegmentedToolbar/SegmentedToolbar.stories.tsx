import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Bold,
  Download,
  Ellipsis,
  Grid3x3,
  Italic,
  List,
  Pencil,
  Redo2,
  Settings2,
  Snowflake,
  Star,
  Trash2,
  Underline,
  Undo2,
} from 'lucide-react';
import type { ComponentProps } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import { DropdownMenuItem } from '../DropdownMenu';
import { withTooltipProvider } from '../storybook-support/withTooltipProvider';
import {
  SegmentedToolbar,
  ToolbarButton as ToolbarButtonComponent,
  ToolbarGroup as ToolbarGroupComponent,
  ToolbarIconButton as ToolbarIconButtonComponent,
  ToolbarMenu as ToolbarMenuComponent,
  ToolbarPopover as ToolbarPopoverComponent,
  ToolbarSeparator as ToolbarSeparatorComponent,
  ToolbarToggleGroup as ToolbarToggleGroupComponent,
} from './SegmentedToolbar';

const meta = {
  title: 'Components/SegmentedToolbar',
  component: SegmentedToolbar,
  subcomponents: {
    ToolbarButton: ToolbarButtonComponent,
    ToolbarIconButton: ToolbarIconButtonComponent,
    ToolbarGroup: ToolbarGroupComponent,
    ToolbarToggleGroup: ToolbarToggleGroupComponent,
    ToolbarSeparator: ToolbarSeparatorComponent,
    ToolbarMenu: ToolbarMenuComponent,
    ToolbarPopover: ToolbarPopoverComponent,
  },
  decorators: [withTooltipProvider],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: `A composable Base UI toolbar rendered as a floating Fresco surface.

### Composition

Pass controls and groups as children. Each group needs an accessible name. Separators are explicit, so the composition visible in JSX is the composition exposed to assistive technology.

\`\`\`tsx
<SegmentedToolbar aria-label="Editing tools">
  <ToolbarGroup aria-label="History">
    <ToolbarIconButton aria-label="Undo" icon={<Undo2 />} />
    <ToolbarIconButton aria-label="Redo" icon={<Redo2 />} />
  </ToolbarGroup>
  <ToolbarSeparator />
  <ToolbarToggleGroup aria-label="View" defaultValue={['list']}>
    <ToolbarIconButton value="list" aria-label="List" icon={<List />} />
    <ToolbarIconButton value="grid" aria-label="Grid" icon={<Grid3x3 />} />
  </ToolbarToggleGroup>
</SegmentedToolbar>
\`\`\`

### Components

| Component | Purpose |
| --- | --- |
| \`SegmentedToolbar\` | Accessible toolbar root, animated surface, size/orientation context, and optional drag behavior. |
| \`ToolbarButton\` | Base UI toolbar item rendered with Fresco \`Button\`. It can also act as a toggle. |
| \`ToolbarIconButton\` | Base UI toolbar item rendered with Fresco \`IconButton\`; its \`aria-label\` is also its default tooltip. |
| \`ToolbarGroup\` | Base UI \`Toolbar.Group\`. Requires \`aria-label\`; \`disabled\` disables every child. |
| \`ToolbarToggleGroup\` | Base UI \`ToggleGroup\`. Child buttons require a unique \`value\`. |
| \`ToolbarSeparator\` | Base UI separator whose orientation follows the toolbar. |
| \`ToolbarMenu\` | Fresco \`DropdownMenu\` composed with an animated toolbar button trigger. |
| \`ToolbarPopover\` | Fresco \`Popover\` composed with an animated toolbar button trigger. |

Custom direct children must be registered with defineToolbarChild. The helper requires the component to declare a React 19 ref prop and that ref must be forwarded to one toolbar primitive.

A toolbar is one tab stop, so disabled controls stay in its roving focus by default: they expose \`aria-disabled\` instead of the native \`disabled\` attribute, keeping keyboard focus inside the toolbar when a command such as Undo disables itself. Pass \`focusableWhenDisabled={false}\` for the rare control that must be genuinely unfocusable.

### Motion

Only the documented Toolbar components may be direct children. A custom wrapper would otherwise hide Motion's popLayout ref and make its exit happen in two stages. TypeScript rejects registered components that do not declare the required ref prop, and the toolbar rejects unregistered wrappers at runtime.

The toolbar, every group, every separator, and every button participates in one isolated Motion \`LayoutGroup\`. Nested \`AnimatePresence\` boundaries use \`popLayout\`, allowing exits, entrances, sibling movement, and surface resizing to run simultaneously. Initial page render is not animated, and reduced-motion preferences make every transition immediate. Conditional children must have stable React keys when rendered from a collection.`,
      },
    },
  },
  tags: ['autodocs'],
  args: {
    'aria-label': 'Editing tools',
    'orientation': 'horizontal',
    'size': 'md',
    'draggable': false,
  },
  argTypes: {
    orientation: {
      control: 'inline-radio',
      options: ['horizontal', 'vertical'],
    },
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
    draggable: { control: 'boolean' },
    disabled: { control: 'boolean' },
  },
} satisfies Meta<typeof SegmentedToolbar>;

export default meta;
type Story = StoryObj<typeof meta>;
type ConditionalItemsArgs = ComponentProps<typeof SegmentedToolbar> & {
  showFavorite: boolean;
  showFormatting: boolean;
  showMenu: boolean;
  showPopover: boolean;
  showDisabledGroup: boolean;
};
type ConditionalItemsStory = StoryObj<ConditionalItemsArgs>;

const noop = () => {};

export const Default: Story = {
  render: (args) => (
    <SegmentedToolbar {...args}>
      <ToolbarGroupComponent aria-label="History">
        <ToolbarIconButtonComponent
          aria-label="Undo"
          icon={<Undo2 />}
          onClick={noop}
        />
        <ToolbarIconButtonComponent
          aria-label="Redo"
          icon={<Redo2 />}
          onClick={noop}
        />
      </ToolbarGroupComponent>
      <ToolbarSeparatorComponent />
      <ToolbarButtonComponent icon={<Pencil />} onClick={noop}>
        Edit
      </ToolbarButtonComponent>
      <ToolbarSeparatorComponent />
      <ToolbarToggleGroupComponent aria-label="View" defaultValue={['list']}>
        <ToolbarIconButtonComponent
          value="list"
          aria-label="List"
          icon={<List />}
        />
        <ToolbarIconButtonComponent
          value="grid"
          aria-label="Grid"
          icon={<Grid3x3 />}
        />
      </ToolbarToggleGroupComponent>
    </SegmentedToolbar>
  ),
};

/** A visible-label toolbar control rendered with Fresco Button. */
export const ToolbarButton: Story = {
  render: (args) => (
    <SegmentedToolbar {...args}>
      <ToolbarButtonComponent
        icon={<Download />}
        color="success"
        variant="default"
        onClick={noop}
      >
        Download
      </ToolbarButtonComponent>
    </SegmentedToolbar>
  ),
};

/** An icon-only Fresco IconButton with an accessible name and tooltip. */
export const ToolbarIconButton: Story = {
  render: (args) => (
    <SegmentedToolbar {...args}>
      <ToolbarIconButtonComponent
        aria-label="Delete"
        icon={<Trash2 />}
        color="destructive"
        onClick={noop}
      />
    </SegmentedToolbar>
  ),
  play: async ({ canvasElement }) => {
    const button = within(canvasElement).getByRole('button', {
      name: 'Delete',
    });
    await userEvent.hover(button);
    expect(await within(document.body).findByRole('tooltip')).toHaveTextContent(
      'Delete',
    );
  },
};

/** A named Base UI Toolbar.Group containing related commands. */
export const ToolbarGroup: Story = {
  render: (args) => (
    <SegmentedToolbar {...args}>
      <ToolbarGroupComponent aria-label="History">
        <ToolbarIconButtonComponent
          aria-label="Undo"
          icon={<Undo2 />}
          onClick={noop}
        />
        <ToolbarIconButtonComponent
          aria-label="Redo"
          icon={<Redo2 />}
          onClick={noop}
        />
      </ToolbarGroupComponent>
    </SegmentedToolbar>
  ),
  play: async ({ canvasElement }) => {
    expect(
      within(canvasElement).getByRole('group', { name: 'History' }),
    ).toBeInTheDocument();
  },
};

/** Buttons become Base UI toggles when composed inside ToolbarToggleGroup. */
export const ToolbarToggleGroup: Story = {
  render: (args) => (
    <SegmentedToolbar {...args}>
      <ToolbarToggleGroupComponent
        aria-label="Formatting"
        multiple
        defaultValue={['bold']}
      >
        <ToolbarIconButtonComponent
          value="bold"
          aria-label="Bold"
          icon={<Bold />}
        />
        <ToolbarIconButtonComponent
          value="italic"
          aria-label="Italic"
          icon={<Italic />}
        />
        <ToolbarIconButtonComponent
          value="underline"
          aria-label="Underline"
          icon={<Underline />}
        />
      </ToolbarToggleGroupComponent>
    </SegmentedToolbar>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const bold = canvas.getByRole('button', { name: 'Bold' });
    const italic = canvas.getByRole('button', { name: 'Italic' });
    expect(bold).toHaveAttribute('aria-pressed', 'true');
    expect(italic).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(italic);
    expect(italic).toHaveAttribute('aria-pressed', 'true');
    expect(bold).toHaveAttribute('aria-pressed', 'true');
  },
};

/** Separator orientation is derived from the containing toolbar. */
export const ToolbarSeparator: Story = {
  render: (args) => (
    <SegmentedToolbar {...args}>
      <ToolbarGroupComponent aria-label="History">
        <ToolbarIconButtonComponent
          aria-label="Undo"
          icon={<Undo2 />}
          onClick={noop}
        />
      </ToolbarGroupComponent>
      <ToolbarSeparatorComponent />
      <ToolbarGroupComponent aria-label="Editing">
        <ToolbarIconButtonComponent
          aria-label="Edit"
          icon={<Pencil />}
          onClick={noop}
        />
      </ToolbarGroupComponent>
    </SegmentedToolbar>
  ),
  play: async ({ canvasElement }) => {
    expect(within(canvasElement).getByRole('separator')).toHaveAttribute(
      'aria-orientation',
      'vertical',
    );
  },
};

/** A Fresco dropdown menu composed with an animated toolbar control. */
export const ToolbarMenu: Story = {
  render: (args) => (
    <SegmentedToolbar {...args}>
      <ToolbarMenuComponent
        trigger={
          <ToolbarIconButtonComponent
            aria-label="More actions"
            icon={<Ellipsis />}
          />
        }
      >
        <DropdownMenuItem onClick={noop}>Duplicate</DropdownMenuItem>
        <DropdownMenuItem onClick={noop}>Archive</DropdownMenuItem>
      </ToolbarMenuComponent>
    </SegmentedToolbar>
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole('button', { name: 'More actions' }),
    );
    expect(
      await within(document.body).findByRole('menuitem', { name: 'Duplicate' }),
    ).toBeInTheDocument();
  },
};

/** A Fresco popover composed with an animated toolbar control. */
export const ToolbarPopover: Story = {
  render: (args) => (
    <SegmentedToolbar {...args}>
      <ToolbarPopoverComponent
        trigger={
          <ToolbarIconButtonComponent
            aria-label="Canvas settings"
            icon={<Settings2 />}
          />
        }
        contentProps={{ className: 'w-64' }}
      >
        <p>Adjust how the canvas is displayed.</p>
      </ToolbarPopoverComponent>
    </SegmentedToolbar>
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole('button', { name: 'Canvas settings' }),
    );
    expect(
      await within(document.body).findByText(
        'Adjust how the canvas is displayed.',
      ),
    ).toBeInTheDocument();
  },
};

/**
 * Conditional controls, separators, and complete groups animate concurrently.
 * The surrounding surface resizes on the same spring while siblings slide to
 * their new positions rather than waiting for the exiting item. Toggle the
 * disabled group to inspect its visual treatment during the same transitions.
 */
export const ConditionalItems: ConditionalItemsStory = {
  args: {
    'aria-label': 'Conditional tools',
    'orientation': 'horizontal',
    'size': 'md',
    'draggable': false,
    'showFavorite': true,
    'showFormatting': true,
    'showMenu': true,
    'showPopover': true,
    'showDisabledGroup': true,
  },
  argTypes: {
    showFavorite: {
      control: 'boolean',
      description: 'Render the Favorite button.',
    },
    showFormatting: {
      control: 'boolean',
      description: 'Render the Formatting toggle group.',
    },
    showMenu: {
      control: 'boolean',
      description: 'Render the More actions menu.',
    },
    showPopover: {
      control: 'boolean',
      description: 'Render the Canvas settings popover.',
    },
    showDisabledGroup: {
      control: 'boolean',
      description: 'Render a disabled group of actions.',
    },
  },
  render: ({
    showFavorite,
    showFormatting,
    showMenu,
    showPopover,
    showDisabledGroup,
    ...args
  }) => (
    <SegmentedToolbar {...args}>
      <ToolbarGroupComponent aria-label="History">
        <ToolbarIconButtonComponent
          aria-label="Undo"
          icon={<Undo2 />}
          onClick={noop}
        />
        <ToolbarIconButtonComponent
          aria-label="Redo"
          icon={<Redo2 />}
          onClick={noop}
        />
        {showFavorite ? (
          <ToolbarIconButtonComponent
            key="favorite"
            aria-label="Favorite"
            icon={<Star />}
            color="warning"
            onClick={noop}
          />
        ) : null}
      </ToolbarGroupComponent>

      {showFormatting ? (
        <ToolbarSeparatorComponent key="formatting-separator" />
      ) : null}
      {showFormatting ? (
        <ToolbarToggleGroupComponent
          key="formatting"
          aria-label="Formatting"
          multiple
          defaultValue={['bold']}
        >
          <ToolbarIconButtonComponent
            value="bold"
            aria-label="Bold"
            icon={<Bold />}
          />
          <ToolbarIconButtonComponent
            value="italic"
            aria-label="Italic"
            icon={<Italic />}
          />
        </ToolbarToggleGroupComponent>
      ) : null}

      {showMenu ? <ToolbarSeparatorComponent key="menu-separator" /> : null}
      {showMenu ? (
        <ToolbarMenuComponent
          key="menu"
          trigger={
            <ToolbarIconButtonComponent
              aria-label="More actions"
              icon={<Ellipsis />}
            />
          }
        >
          <DropdownMenuItem onClick={noop}>Duplicate</DropdownMenuItem>
          <DropdownMenuItem onClick={noop}>Archive</DropdownMenuItem>
        </ToolbarMenuComponent>
      ) : null}

      {showPopover ? (
        <ToolbarSeparatorComponent key="popover-separator" />
      ) : null}
      {showPopover ? (
        <ToolbarPopoverComponent
          key="popover"
          trigger={
            <ToolbarIconButtonComponent
              aria-label="Canvas settings"
              icon={<Settings2 />}
            />
          }
          contentProps={{ className: 'w-64' }}
        >
          <p>Adjust how the canvas is displayed.</p>
        </ToolbarPopoverComponent>
      ) : null}

      {showDisabledGroup ? (
        <ToolbarSeparatorComponent key="disabled-separator" />
      ) : null}
      {showDisabledGroup ? (
        <ToolbarGroupComponent
          key="disabled"
          aria-label="Unavailable actions"
          disabled
        >
          <ToolbarButtonComponent onClick={noop}>
            Publish
          </ToolbarButtonComponent>
          <ToolbarIconButtonComponent
            aria-label="Freeze layout"
            icon={<Snowflake />}
            onClick={noop}
          />
        </ToolbarGroupComponent>
      ) : null}
    </SegmentedToolbar>
  ),
};

/** Group-level disabled state reaches every contained control. */
export const DisabledGroups: Story = {
  render: (args) => (
    <SegmentedToolbar {...args}>
      <ToolbarGroupComponent aria-label="Editing" disabled>
        <ToolbarButtonComponent onClick={noop}>Edit</ToolbarButtonComponent>
        <ToolbarIconButtonComponent
          aria-label="Freeze layout"
          icon={<Snowflake />}
          onClick={noop}
        />
      </ToolbarGroupComponent>
      <ToolbarSeparatorComponent />
      <ToolbarToggleGroupComponent
        aria-label="View"
        disabled
        defaultValue={['list']}
      >
        <ToolbarIconButtonComponent
          value="list"
          aria-label="List"
          icon={<List />}
        />
        <ToolbarIconButtonComponent
          value="grid"
          aria-label="Grid"
          icon={<Grid3x3 />}
        />
      </ToolbarToggleGroupComponent>
    </SegmentedToolbar>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    for (const name of ['Edit', 'Freeze layout', 'List', 'Grid']) {
      const control = canvas.getByRole('button', { name });
      expect(control).toHaveAttribute('aria-disabled', 'true');
      expect(getComputedStyle(control).opacity).toBe('0.5');
    }
  },
};

/**
 * Disabled controls stay in the toolbar's roving focus by default, so a
 * command that disables itself never drops keyboard focus to `<body>`.
 */
export const FocusableWhenDisabled: Story = {
  render: (args) => (
    <SegmentedToolbar {...args}>
      <ToolbarIconButtonComponent
        aria-label="Undo"
        icon={<Undo2 />}
        disabled
        onClick={noop}
      />
      <ToolbarIconButtonComponent
        aria-label="Redo"
        icon={<Redo2 />}
        onClick={noop}
      />
    </SegmentedToolbar>
  ),
  play: async ({ canvasElement }) => {
    const undo = within(canvasElement).getByRole('button', { name: 'Undo' });
    expect(undo).not.toBeDisabled();
    expect(undo).toHaveAttribute('aria-disabled', 'true');
    undo.focus();
    expect(undo).toHaveFocus();
  },
};

/**
 * `focusableWhenDisabled={false}` opts a control back into native `disabled`
 * semantics, removing it from the toolbar's roving focus entirely.
 */
export const UnfocusableWhenDisabled: Story = {
  render: (args) => (
    <SegmentedToolbar {...args}>
      <ToolbarIconButtonComponent
        aria-label="Undo"
        icon={<Undo2 />}
        disabled
        focusableWhenDisabled={false}
        onClick={noop}
      />
      <ToolbarIconButtonComponent
        aria-label="Redo"
        icon={<Redo2 />}
        onClick={noop}
      />
    </SegmentedToolbar>
  ),
  play: async ({ canvasElement }) => {
    const undo = within(canvasElement).getByRole('button', { name: 'Undo' });
    expect(undo).toBeDisabled();
    expect(undo).not.toHaveAttribute('aria-disabled');
  },
};

/** The drag handle is separate from toolbar focus and supports arrow-key nudging. */
export const Draggable: Story = {
  args: { draggable: true },
  render: (args) => (
    <SegmentedToolbar {...args}>
      <ToolbarIconButtonComponent
        aria-label="Undo"
        icon={<Undo2 />}
        onClick={noop}
      />
      <ToolbarIconButtonComponent
        aria-label="Redo"
        icon={<Redo2 />}
        onClick={noop}
      />
    </SegmentedToolbar>
  ),
};
