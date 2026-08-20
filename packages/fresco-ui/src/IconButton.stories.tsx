import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Check,
  ChevronRight,
  Download,
  Edit,
  Heart,
  Info,
  Loader2,
  Mail,
  Plus,
  Search,
  Settings,
  Share,
  Star,
  Trash,
  Upload,
  X,
} from 'lucide-react';
import { type ComponentProps, Fragment } from 'react';

import { IconButton } from './Button';
import { BUTTON_VARIANTS, ICON_BUTTON_COLORS } from './button-constants';
import Heading from './typography/Heading';

const iconMap = {
  plus: <Plus />,
  x: <X />,
  check: <Check />,
  settings: <Settings />,
  download: <Download />,
  upload: <Upload />,
  trash: <Trash />,
  edit: <Edit />,
  search: <Search />,
  heart: <Heart />,
  star: <Star />,
  share: <Share />,
  mail: <Mail />,
  info: <Info />,
  chevronRight: <ChevronRight />,
};

type IconButtonStoryArgs = ComponentProps<typeof IconButton> & {
  pressed?: boolean;
  expanded?: boolean;
  busy?: boolean;
};

const renderIconButton = (args: IconButtonStoryArgs) => {
  const iconButtonArgs = { ...args };
  delete iconButtonArgs.pressed;
  delete iconButtonArgs.expanded;
  delete iconButtonArgs.busy;

  return (
    <IconButton
      {...iconButtonArgs}
      aria-pressed={args.pressed ? true : undefined}
      aria-expanded={args.expanded ? true : undefined}
      aria-busy={args.busy ? true : undefined}
      icon={
        args.busy ? <Loader2 aria-hidden className="animate-spin" /> : args.icon
      }
    />
  );
};

const meta = {
  title: 'Components/IconButton',
  component: IconButton,
  render: renderIconButton,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: `An icon-only button for compact actions. Give it exactly one accessible name with \`aria-label\` or \`aria-labelledby\`; keep that name stable when its icon or state changes.

Its semantic states are independent and may overlap:

- **Normal:** enabled with no state ARIA attributes.
- **Disabled:** use the native \`disabled\` prop to prevent activation.
- **Pressed:** use \`aria-pressed\` for an icon toggle button.
- **Expanded:** use \`aria-expanded\` when the button controls a disclosure or popup. For a menu, also use \`aria-haspopup="menu"\` and, when the popup has a stable ID, \`aria-controls\`.
- **Busy:** use \`aria-busy\` and replace or supplement the icon with visible progress feedback. Busy does not inherently mean disabled.

The story controls map these states to their native or ARIA props while allowing combinations.`,
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'outline', 'text', 'link', 'dashed', 'icon'],
    },
    color: {
      control: 'select',
      options: ICON_BUTTON_COLORS,
    },
    size: {
      control: 'select',
      options: ['xs', 'sm', 'md', 'lg', 'xl'],
    },
    disabled: {
      control: 'boolean',
      description:
        'Prevents activation. This state is independent of pressed, expanded, and busy.',
      table: { category: 'State' },
    },
    pressed: {
      control: 'boolean',
      description: 'Story control that maps the pressed state to aria-pressed.',
      table: { category: 'State' },
    },
    expanded: {
      control: 'boolean',
      description:
        'Story control that maps the expanded state to aria-expanded.',
      table: { category: 'State' },
    },
    busy: {
      control: 'boolean',
      description: 'Story control that maps the busy state to aria-busy.',
      table: { category: 'State' },
    },
    icon: {
      control: 'select',
      options: Object.keys(iconMap),
      mapping: iconMap,
    },
  },
} satisfies Meta<IconButtonStoryArgs>;

export default meta;
type Story = StoryObj<typeof IconButton>;
type ControlledStory = StoryObj<IconButtonStoryArgs>;

export const Default: ControlledStory = {
  args: {
    'icon': <Plus />,
    'aria-label': 'Add',
    'variant': 'default',
    'color': 'default',
    'size': 'md',
    'disabled': false,
    'pressed': false,
    'expanded': false,
    'busy': false,
  },
};

export const Variants: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex gap-4">
        <IconButton
          variant="default"
          icon={<Plus />}
          aria-label="Add (Default)"
        />
        <IconButton
          variant="outline"
          icon={<Plus />}
          aria-label="Add (Outline)"
        />
        <IconButton variant="text" icon={<Plus />} aria-label="Add (Text)" />
        <IconButton variant="text" icon={<Plus />} aria-label="Add (Text)" />
        <IconButton
          variant="dashed"
          icon={<Plus />}
          aria-label="Add (Dashed)"
        />
      </div>
    </div>
  ),
};

export const Colors: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-4">
        <IconButton color="default" icon={<Plus />} aria-label="Add Default" />
        <IconButton color="primary" icon={<Plus />} aria-label="Add Primary" />
        <IconButton
          color="secondary"
          icon={<Plus />}
          aria-label="Add Secondary"
        />
        <IconButton color="warning" icon={<Plus />} aria-label="Add Warning" />
        <IconButton color="info" icon={<Plus />} aria-label="Add Info" />
        <IconButton color="destructive" icon={<Trash />} aria-label="Delete" />
        <IconButton color="success" icon={<Check />} aria-label="Confirm" />
        <IconButton color="accent" icon={<Star />} aria-label="Favorite" />
      </div>
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <IconButton size="sm" icon={<Plus />} aria-label="Add (Small)" />
      <IconButton size="md" icon={<Plus />} aria-label="Add (Medium)" />
      <IconButton size="lg" icon={<Plus />} aria-label="Add (Large)" />
      <IconButton size="xl" icon={<Plus />} aria-label="Add (Extra Large)" />
    </div>
  ),
};

export const DifferentIcons: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex gap-4">
        <IconButton icon={<Plus />} aria-label="Add" />
        <IconButton icon={<Edit />} aria-label="Edit" color="primary" />
        <IconButton
          icon={<Trash />}
          aria-label="Delete"
          color="destructive"
          variant="outline"
        />
        <IconButton icon={<Search />} aria-label="Search" variant="text" />
        <IconButton icon={<Settings />} aria-label="Settings" />
      </div>
      <div className="flex gap-4">
        <IconButton icon={<Download />} aria-label="Download" color="info" />
        <IconButton icon={<Upload />} aria-label="Upload" color="success" />
        <IconButton icon={<Share />} aria-label="Share" variant="outline" />
        <IconButton icon={<Heart />} aria-label="Like" color="destructive" />
        <IconButton icon={<Star />} aria-label="Favorite" color="warning" />
      </div>
    </div>
  ),
};

export const States: ControlledStory = {
  args: {
    'aria-label': 'Favorite',
    'icon': <Star />,
    'disabled': false,
    'pressed': false,
    'expanded': false,
    'busy': false,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Disabled, pressed, expanded, and busy are independent states. Use their controls together to inspect combinations such as an expanded menu trigger that is also busy or disabled.',
      },
    },
  },
};

export const ColorVariantCombinations: Story = {
  render: () => (
    <div className="grid grid-cols-[auto_repeat(5,1fr)] gap-4">
      <span className="text-sm font-medium" />
      <span className="text-center text-xs font-medium text-current/70">
        Default
      </span>
      <span className="text-center text-xs font-medium text-current/70">
        Outline
      </span>
      <span className="text-center text-xs font-medium text-current/70">
        Text
      </span>
      <span className="text-center text-xs font-medium text-current/70">
        Dashed
      </span>
      <span className="text-center text-xs font-medium text-current/70">
        Disabled
      </span>
      {ICON_BUTTON_COLORS.map((color) => (
        <Fragment key={color}>
          <span className="text-sm font-medium capitalize">{color}:</span>
          <IconButton
            variant="default"
            color={color}
            icon={<Plus />}
            aria-label={`${color} default`}
          />
          <IconButton
            variant="outline"
            color={color}
            icon={<Plus />}
            aria-label={`${color} outline`}
          />
          <IconButton
            variant="text"
            color={color}
            icon={<Plus />}
            aria-label={`${color} text`}
          />
          <IconButton
            variant="dashed"
            color={color}
            icon={<Plus />}
            aria-label={`${color} dashed`}
          />
          <IconButton
            variant="default"
            color={color}
            icon={<Plus />}
            aria-label={`${color} disabled`}
            disabled
          />
        </Fragment>
      ))}
    </div>
  ),
};

export const SizeComparison: Story = {
  render: () => (
    <div className="flex flex-col gap-8">
      {BUTTON_VARIANTS.filter((v) => v !== 'dashed').map((variant) => (
        <div key={variant} className="flex flex-col gap-4">
          <span className="text-sm font-medium capitalize">{variant}:</span>
          <div className="flex items-end gap-4">
            <IconButton
              variant={variant}
              size="sm"
              icon={<Plus />}
              aria-label={`${variant} sm`}
            />
            <IconButton
              variant={variant}
              size="md"
              icon={<Plus />}
              aria-label={`${variant} md`}
            />
            <IconButton
              variant={variant}
              size="lg"
              icon={<Plus />}
              aria-label={`${variant} lg`}
            />
            <IconButton
              variant={variant}
              size="xl"
              icon={<Plus />}
              aria-label={`${variant} xl`}
            />
          </div>
        </div>
      ))}
    </div>
  ),
};

export const UseCases: Story = {
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <Heading level="h3" margin="none" className="mb-4 text-sm">
          Action Buttons
        </Heading>
        <div className="flex gap-2">
          <IconButton icon={<Edit />} aria-label="Edit" size="sm" />
          <IconButton
            icon={<Trash />}
            aria-label="Delete"
            color="destructive"
            variant="outline"
            size="sm"
          />
          <IconButton
            icon={<Check />}
            aria-label="Confirm"
            color="success"
            size="sm"
          />
          <IconButton
            icon={<X />}
            aria-label="Cancel"
            variant="text"
            size="sm"
          />
        </div>
      </div>

      <div>
        <Heading level="h3" margin="none" className="mb-4 text-sm">
          Toolbar
        </Heading>
        <div className="flex gap-1 rounded-lg border p-2">
          <IconButton icon={<Edit />} aria-label="Edit" variant="text" />
          <IconButton
            icon={<Download />}
            aria-label="Download"
            variant="text"
          />
          <IconButton icon={<Upload />} aria-label="Upload" variant="text" />
          <IconButton icon={<Share />} aria-label="Share" variant="text" />
          <IconButton
            icon={<Settings />}
            aria-label="Settings"
            variant="text"
          />
        </div>
      </div>

      <div>
        <Heading level="h3" margin="none" className="mb-4 text-sm">
          Floating Action Button
        </Heading>
        <IconButton
          icon={<Plus />}
          aria-label="Add"
          color="primary"
          size="lg"
        />
      </div>
    </div>
  ),
};
