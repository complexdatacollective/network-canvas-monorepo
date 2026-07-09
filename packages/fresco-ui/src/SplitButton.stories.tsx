import type { Meta, StoryObj } from '@storybook/react-vite';
import { Check, ChevronDown, Download, Plus, Settings } from 'lucide-react';

import { BUTTON_COLORS, BUTTON_VARIANTS } from './button-constants';
import SplitButton, { type SplitButtonProps } from './SplitButton';

const iconMap = {
  check: <Check aria-hidden="true" />,
  chevronDown: <ChevronDown aria-hidden="true" />,
  download: <Download aria-hidden="true" />,
  none: undefined,
  plus: <Plus aria-hidden="true" />,
  settings: <Settings aria-hidden="true" />,
};

type StoryIcon = keyof typeof iconMap;

type SplitButtonStoryArgs = SplitButtonProps & {
  buttonIcon: StoryIcon;
  buttonIconPosition: NonNullable<SplitButtonProps['iconPosition']>;
  popoverAlign: NonNullable<SplitButtonProps['popover']['align']>;
  popoverClassName: string;
  popoverFirstAction: string;
  popoverSecondAction: string;
  popoverShowArrow: boolean;
  popoverSide: NonNullable<SplitButtonProps['popover']['side']>;
  popoverSideOffset: number;
  popoverTitle: string;
  segmentAriaLabel: string;
  segmentChildren: string;
  segmentDisabled: boolean;
  segmentIcon: StoryIcon;
  segmentIconPosition: NonNullable<SplitButtonProps['segment']['iconPosition']>;
  segmentPosition: NonNullable<SplitButtonProps['segment']['position']>;
};

function PopoverActions({
  firstAction,
  secondAction,
  title,
}: {
  firstAction: string;
  secondAction: string;
  title: string;
}) {
  return (
    <div className="flex w-56 flex-col gap-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Settings className="size-4" aria-hidden="true" />
        {title}
      </div>
      <div className="grid gap-2 text-sm">
        <button
          className="focusable rounded px-3 py-2 text-left hover:bg-current/10"
          type="button"
        >
          {firstAction}
        </button>
        <button
          className="focusable rounded px-3 py-2 text-left hover:bg-current/10"
          type="button"
        >
          {secondAction}
        </button>
      </div>
    </div>
  );
}

function renderSplitButton({
  buttonIcon,
  buttonIconPosition,
  popover,
  popoverAlign,
  popoverClassName,
  popoverFirstAction,
  popoverSecondAction,
  popoverShowArrow,
  popoverSide,
  popoverSideOffset,
  popoverTitle,
  segment,
  segmentAriaLabel,
  segmentChildren,
  segmentDisabled,
  segmentIcon,
  segmentIconPosition,
  segmentPosition,
  ...buttonProps
}: SplitButtonStoryArgs) {
  const segmentContent = segmentChildren.trim() || undefined;
  const icon = iconMap[segmentIcon];
  const controlledSegment: SplitButtonProps['segment'] = segmentContent
    ? {
        ...segment,
        'aria-label': segmentAriaLabel || undefined,
        'children': segmentContent,
        'disabled': segmentDisabled,
        icon,
        'iconPosition': segmentIconPosition,
        'position': segmentPosition,
      }
    : {
        ...segment,
        'aria-label': segmentAriaLabel || 'Open options',
        'disabled': segmentDisabled,
        'icon': icon ?? iconMap.chevronDown,
        'iconPosition': segmentIconPosition,
        'position': segmentPosition,
      };

  return (
    <SplitButton
      {...buttonProps}
      icon={iconMap[buttonIcon]}
      iconPosition={buttonIconPosition}
      popover={{
        ...popover,
        align: popoverAlign,
        className: popoverClassName || undefined,
        content: (
          <PopoverActions
            firstAction={popoverFirstAction}
            secondAction={popoverSecondAction}
            title={popoverTitle}
          />
        ),
        showArrow: popoverShowArrow,
        side: popoverSide,
        sideOffset: popoverSideOffset,
      }}
      segment={controlledSegment}
    />
  );
}

const meta = {
  title: 'Components/SplitButton',
  component: SplitButton,
  parameters: {
    docs: {
      description: {
        component:
          'SplitButton composes `Button` and `Popover` into a grouped control with a continuous outer button shape and a narrow seam between the main action and popover segment. The public API starts from `Button` props: `children`, `className`, `icon`, `variant`, `color`, `size`, and event handlers configure the main action button. The required `segment` prop configures the secondary trigger with `position`, `icon`, `children`, `iconPosition`, `disabled`, and an `aria-label` for icon-only segments. The required `popover` prop supplies `content` and forwards all other props to `PopoverContent`. The controls panel exposes story-only scalar controls that build those nested `segment` and `popover` objects.',
      },
    },
    layout: 'centered',
  },
  render: renderSplitButton,
  tags: ['autodocs'],
  argTypes: {
    children: {
      control: 'text',
      table: {
        category: 'Button',
      },
    },
    className: {
      control: false,
      table: {
        category: 'Button',
      },
    },
    color: {
      control: 'select',
      options: BUTTON_COLORS,
      table: {
        category: 'Button',
      },
    },
    disabled: {
      control: 'boolean',
      table: {
        category: 'Button',
      },
    },
    icon: {
      control: false,
      table: {
        disable: true,
      },
    },
    buttonIcon: {
      control: 'select',
      options: Object.keys(iconMap),
      table: {
        category: 'Button',
      },
    },
    buttonIconPosition: {
      control: 'inline-radio',
      options: ['left', 'right'],
      table: {
        category: 'Button',
      },
    },
    popover: {
      control: false,
      table: {
        disable: true,
      },
    },
    popoverAlign: {
      control: 'inline-radio',
      options: ['start', 'center', 'end'],
      table: {
        category: 'Popover',
      },
    },
    popoverClassName: {
      control: 'text',
      table: {
        category: 'Popover',
      },
    },
    popoverFirstAction: {
      control: 'text',
      table: {
        category: 'Popover content',
      },
    },
    popoverSecondAction: {
      control: 'text',
      table: {
        category: 'Popover content',
      },
    },
    popoverShowArrow: {
      control: 'boolean',
      table: {
        category: 'Popover',
      },
    },
    popoverSide: {
      control: 'select',
      options: ['top', 'right', 'bottom', 'left'],
      table: {
        category: 'Popover',
      },
    },
    popoverSideOffset: {
      control: 'number',
      table: {
        category: 'Popover',
      },
    },
    popoverTitle: {
      control: 'text',
      table: {
        category: 'Popover content',
      },
    },
    segment: {
      control: false,
      table: {
        disable: true,
      },
    },
    segmentAriaLabel: {
      control: 'text',
      table: {
        category: 'Segment',
      },
    },
    segmentChildren: {
      control: 'text',
      table: {
        category: 'Segment',
      },
    },
    segmentDisabled: {
      control: 'boolean',
      table: {
        category: 'Segment',
      },
    },
    segmentIcon: {
      control: 'select',
      options: Object.keys(iconMap),
      table: {
        category: 'Segment',
      },
    },
    segmentIconPosition: {
      control: 'inline-radio',
      options: ['left', 'right'],
      table: {
        category: 'Segment',
      },
    },
    segmentPosition: {
      control: 'inline-radio',
      options: ['left', 'right'],
      table: {
        category: 'Segment',
      },
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg', 'xl'],
      table: {
        category: 'Button',
      },
    },
    variant: {
      control: 'select',
      options: BUTTON_VARIANTS,
      table: {
        category: 'Button',
      },
    },
  },
  args: {
    children: 'Save changes',
    buttonIcon: 'none',
    buttonIconPosition: 'left',
    color: 'primary',
    disabled: false,
    popover: {
      content: null,
    },
    popoverAlign: 'end',
    popoverClassName: '',
    popoverFirstAction: 'Save as draft',
    popoverSecondAction: 'Save a copy',
    popoverShowArrow: true,
    popoverSide: 'bottom',
    popoverSideOffset: 10,
    popoverTitle: 'More actions',
    segment: {
      'aria-label': 'Open save options',
      'icon': <ChevronDown aria-hidden="true" />,
    },
    segmentAriaLabel: 'Open save options',
    segmentChildren: '',
    segmentDisabled: false,
    segmentIcon: 'chevronDown',
    segmentIconPosition: 'left',
    segmentPosition: 'right',
    size: 'md',
    variant: 'default',
  },
} satisfies Meta<SplitButtonStoryArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const SegmentOnLeft: Story = {
  args: {
    children: 'Import',
    color: 'default',
    segmentAriaLabel: 'Open import options',
    segmentPosition: 'left',
  },
};

export const TextSegment: Story = {
  args: {
    buttonIcon: 'download',
    children: 'Export',
    color: 'secondary',
    segmentChildren: 'More',
    segmentIcon: 'none',
  },
};

export const IconAndTextSegment: Story = {
  args: {
    buttonIcon: 'plus',
    children: 'Create',
    color: 'success',
    segmentChildren: 'Options',
    segmentIcon: 'chevronDown',
    segmentIconPosition: 'right',
  },
};

export const LongLabels: Story = {
  args: {
    children: 'Save changes and notify collaborators',
    color: 'info',
    popoverClassName: 'w-72',
    segmentChildren: 'Additional save options',
    segmentIcon: 'chevronDown',
    segmentIconPosition: 'right',
  },
};

export const Disabled: Story = {
  args: {
    buttonIcon: 'check',
    children: 'Already saved',
    color: 'default',
    disabled: true,
    segmentAriaLabel: 'Open save options',
    segmentIcon: 'chevronDown',
  },
};
