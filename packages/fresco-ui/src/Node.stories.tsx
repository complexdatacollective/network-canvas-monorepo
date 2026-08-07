import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';

import Node, { NodeColors } from './Node';
import { withTooltipProvider } from './storybook-support/withTooltipProvider';
import { TooltipProvider } from './Tooltip';
import Heading from './typography/Heading';
import Paragraph from './typography/Paragraph';

const meta: Meta<typeof Node> = {
  title: 'Components/Node',
  component: Node,
  tags: ['autodocs'],
  decorators: [withTooltipProvider],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: `
The Node component is the fundamental representation of an entity in Network Canvas.
Nodes represent people, places, organizations, or other entities in social network interviews.

## Visual States
- **Focus**: Outline ring (via \`focusable\` utility) - color matches node color
- **Selected**: Box-shadow ring with spring animation
- **Linking**: Pulsing box-shadow ring (separate layer, can be active with selected)
- **Loading**: Spinner replaces label
- **Disabled**: Desaturated, no pointer events

## Interaction Behaviors (Inferred)
Interaction behaviors are automatically inferred from the props you provide:
- **onClick provided**: Enables press animation, sets pointer cursor
- **style.cursor provided**: Uses that cursor (e.g., \`'grab'\` from drag systems like useDragSource)
- **Neither**: Default cursor, no press animation (display only)

This design allows the Node to integrate seamlessly with external interaction systems
without needing explicit mode flags.

## Truncated Labels
Labels that exceed the available space are line-clamped. When (and only when) a
label is actually clamped, the complete label is shown in a tooltip on mouse
hover and keyboard focus. The tooltip never opens from press, click, or touch,
is suppressed while a pointer button is held or a drag is active, and cannot
capture pointer events. The full label always remains the accessible name.
        `,
      },
    },
  },
  argTypes: {
    label: {
      control: 'text',
      description:
        'Text displayed inside the node. Labels wrap at locale-appropriate opportunities, fall back to safe character breaks, and are line-clamped with an ellipsis.',
      table: {
        type: { summary: 'string' },
        defaultValue: { summary: 'Node' },
      },
    },
    size: {
      control: 'select',
      options: ['xxs', 'xs', 'sm', 'md', 'lg'],
      description: 'Size of the node.',
      table: {
        type: { summary: "'xxs' | 'xs' | 'sm' | 'md' | 'lg'" },
        defaultValue: { summary: 'md' },
      },
    },
    shape: {
      control: 'select',
      options: ['circle', 'square', 'diamond'],
      description: 'Shape of the node.',
      table: {
        type: { summary: "'circle' | 'square' | 'diamond'" },
        defaultValue: { summary: 'circle' },
      },
    },
    color: {
      control: 'select',
      options: NodeColors,
      description:
        'Color scheme for the node. Also affects the focus ring color.',
      table: {
        type: { summary: 'NodeColorSequence' },
        defaultValue: { summary: 'node-color-seq-1' },
      },
    },
    selected: {
      control: 'boolean',
      description:
        'Whether the node is selected. Shows a box-shadow ring with spring animation.',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'false' },
      },
    },
    linking: {
      control: 'boolean',
      description:
        'Whether the node is in linking mode. Shows a pulsing box-shadow animation.',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'false' },
      },
    },
    loading: {
      control: 'boolean',
      description:
        'Whether the node is in loading state. Shows a spinner instead of the label.',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'false' },
      },
    },
    disabled: {
      control: 'boolean',
      description:
        'Whether the node is disabled. Desaturated appearance, no pointer events.',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'false' },
      },
    },
    onClick: {
      description:
        'Click handler. When provided, enables press animation and pointer cursor.',
      table: {
        type: { summary: '(event: MouseEvent) => void' },
      },
    },
    onPointerDown: {
      table: { disable: true },
    },
    onPointerUp: {
      table: { disable: true },
    },
  },
  args: {
    label: 'Node',
    size: 'md',
    shape: 'circle',
    color: 'node-color-seq-1',
    selected: false,
    linking: false,
    loading: false,
    disabled: false,
  },
};

export default meta;
type Story = StoryObj<typeof Node>;

/**
 * The default node with standard settings.
 * Use the controls panel to experiment with different props.
 */
export const Default: Story = {
  render: (args) => <Node {...args} />,
};

/**
 * Nodes come in five sizes, from xxs (32px) to lg (128px).
 */
export const Sizes: Story = {
  render: () => (
    <div className="flex items-end gap-8">
      {(['xxs', 'xs', 'sm', 'md', 'lg'] as const).map((size) => (
        <div key={size} className="flex flex-col items-center gap-2">
          <Node size={size} label={size.toUpperCase()} />
          <span className="text-xs text-current/70">{size}</span>
        </div>
      ))}
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Available sizes: `xxs` (32px), `xs` (64px), `sm` (80px), `md` (104px), `lg` (128px).',
      },
    },
  },
};

/**
 * Nodes can be circular, square, or diamond-shaped.
 */
export const Shapes: Story = {
  render: () => (
    <div className="flex gap-8">
      {(['circle', 'square', 'diamond'] as const).map((shape, i) => (
        <div key={shape} className="flex flex-col items-center gap-2">
          <Node
            shape={shape}
            label={shape}
            color={`node-color-seq-${i + 1}` as (typeof NodeColors)[number]}
          />
          <span className="text-xs text-current/70">{shape}</span>
        </div>
      ))}
    </div>
  ),
};

/**
 * Comparison of all shapes at all available sizes.
 */
export const ShapesAtAllSizes: Story = {
  render: () => (
    <div className="flex flex-col gap-8">
      {(['xxs', 'xs', 'sm', 'md', 'lg'] as const).map((size) => (
        <div key={size} className="flex items-center gap-8">
          <span className="w-12 text-sm font-medium">{size}</span>
          <div className="flex items-end gap-6">
            {(['circle', 'square', 'diamond'] as const).map((shape) => (
              <div key={shape} className="flex flex-col items-center gap-2">
                <Node
                  size={size}
                  shape={shape}
                  label={size === 'xxs' ? '' : shape}
                />
                <span className="text-xs text-current/70">{shape}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  ),
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        story: `
Side-by-side comparison of all shapes at each size.

**Circle nodes** use \`rounded-full\` for a perfect circle.

**Square nodes** use proportional border-radius (~25% of node size).

**Diamond nodes** are rotated squares with counter-rotated content. They use the same proportional border-radius as square, with all shadow effects (selected, linking, focus) rotating with the element.
        `,
      },
    },
  },
};

/**
 * Eight predefined colors are available, plus a custom option for arbitrary colors.
 */
export const Colors: Story = {
  render: () => (
    <div className="grid grid-cols-4 gap-6">
      {NodeColors.filter((c) => c !== 'custom').map((color, i) => (
        <div key={color} className="flex flex-col items-center gap-2">
          <Node color={color} label={`Color ${i + 1}`} />
          <span className="text-xs text-current/70">{i + 1}</span>
        </div>
      ))}
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Colors are defined in the theme and can be customized per-protocol. The focus ring color matches the node color.',
      },
    },
  },
};

/**
 * Demonstrates all visual states a node can be in.
 */
export const VisualStates: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-8">
      <div className="flex flex-col items-center gap-2">
        <Node
          label="Default"
          color={args.color}
          shape={args.shape}
          size={args.size}
        />
        <span className="text-xs text-current/70">Default</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <Node
          label="Selected"
          selected
          color={args.color}
          shape={args.shape}
          size={args.size}
        />
        <span className="text-xs text-current/70">Selected</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <Node
          label="Linking"
          linking
          color={args.color}
          shape={args.shape}
          size={args.size}
        />
        <span className="text-xs text-current/70">Linking</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <Node
          label="Loading"
          loading
          color={args.color}
          shape={args.shape}
          size={args.size}
        />
        <span className="text-xs text-current/70">Loading</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <Node
          label="Disabled"
          disabled
          color={args.color}
          shape={args.shape}
          size={args.size}
        />
        <span className="text-xs text-current/70">Disabled</span>
      </div>
    </div>
  ),
  parameters: {
    chromatic: { pauseAnimationAtEnd: true },
    docs: {
      description: {
        story: `
- **Default**: Normal appearance
- **Selected**: Box-shadow ring with spring animation
- **Linking**: Pulsing box-shadow animation (for creating connections)
- **Loading**: Spinner replaces the label
- **Disabled**: Desaturated, no interactions
        `,
      },
    },
  },
};

/**
 * Selected and linking can be active simultaneously.
 * Each uses a separate visual layer (both use box-shadow but are independent).
 */
export const CombinedStates: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-8">
      <div className="flex flex-col items-center gap-2">
        <Node label="Selected" selected color="node-color-seq-1" />
        <span className="text-xs text-current/70">Selected only</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <Node label="Linking" linking color="node-color-seq-2" />
        <span className="text-xs text-current/70">Linking only</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <Node label="Both" selected linking color="node-color-seq-3" />
        <span className="text-xs text-current/70">Both active</span>
      </div>
    </div>
  ),
  parameters: {
    chromatic: { pauseAnimationAtEnd: true },
    docs: {
      description: {
        story:
          'The linking animation is rendered on a separate element, so it can pulse independently while the selected state remains visible.',
      },
    },
  },
};

/**
 * Focus ring is shown on keyboard focus and uses the node's color.
 * Tab through the nodes to see the focus ring.
 */
export const FocusRing: Story = {
  render: () => (
    <div className="flex gap-8">
      {(
        [
          'node-color-seq-1',
          'node-color-seq-2',
          'node-color-seq-3',
          'node-color-seq-4',
        ] as const
      ).map((color, i) => (
        <Node key={color} color={color} label={`Tab ${i + 1}`} />
      ))}
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Press **Tab** to navigate between nodes and see the colored focus ring. The focus ring color matches the node color.',
      },
    },
  },
};

const resilientLabelCases: readonly {
  caption: string;
  label: string;
  lang: string;
  dir?: 'rtl';
}[] = [
  {
    caption: 'Short name',
    label: 'Amina',
    lang: 'en',
  },
  {
    caption: 'Natural word boundaries',
    label: 'María de los Ángeles Hernández García',
    lang: 'es',
  },
  {
    caption: 'Locale-aware hyphenation',
    label: 'Alexandra Müller-Lüdenscheidt',
    lang: 'de',
  },
  {
    caption: 'CJK line breaking',
    label: '佐藤アレクサンドラ美咲',
    lang: 'ja',
  },
  {
    caption: 'Right-to-left text',
    label: 'محمد عبد الرحمن بن عبد العزيز الحسيني',
    lang: 'ar',
    dir: 'rtl',
  },
  {
    caption: 'No natural break opportunities',
    label: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    lang: 'en',
  },
];

const resilientLabelShapes = ['circle', 'square', 'diamond'] as const;

/**
 * Labels stay within the node shape across languages and pathological input.
 */
export const LongLabels: Story = {
  render: () => (
    <div className="flex flex-col gap-10">
      {resilientLabelCases.map(({ caption, label, lang, dir }, index) => (
        <section key={caption} className="flex flex-col gap-3">
          <Heading level="h3" margin="none" className="text-base">
            {caption}
          </Heading>
          <div className="flex flex-wrap gap-8">
            {resilientLabelShapes.map((shape) => (
              <div
                key={shape}
                className="flex w-32 flex-col items-center gap-2"
              >
                <Node
                  label={label}
                  lang={lang}
                  dir={dir}
                  shape={shape}
                  size="sm"
                  color={
                    `node-color-seq-${index + 1}` as (typeof NodeColors)[number]
                  }
                />
                <span className="text-center text-xs text-current/70">
                  {shape}
                </span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const nodes = canvas.getAllByRole('button');

    await expect(nodes).toHaveLength(
      resilientLabelCases.length * resilientLabelShapes.length,
    );

    for (const node of nodes) {
      const bounds = node.getBoundingClientRect();
      await expect(Math.abs(bounds.width - bounds.height)).toBeLessThan(1);

      const accessibleLabel = node.getAttribute('aria-label');
      const visibleLabel = within(node).getByText(accessibleLabel ?? '');
      await expect(visibleLabel).toHaveClass(
        'hyphens-auto',
        'wrap-anywhere',
        'line-clamp-3',
      );
    }
  },
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        story:
          'Every label scenario is shown on circle, square, and diamond nodes. The browser first uses Unicode and locale-aware line-breaking rules (including automatic hyphenation from the inherited `lang`). If a string has no meaningful break opportunity, it may break anywhere before reaching the shape edge. Labels that exhaust the available height are clamped with an ellipsis, while the full value remains the accessible name.',
      },
    },
  },
};

/**
 * Interaction behaviors are inferred from the props you provide.
 */
export const InferredBehaviors: Story = {
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <Heading level="h3" margin="none" className="mb-2 text-sm font-medium">
          With onClick (Clickable)
        </Heading>
        <Paragraph margin="none" className="mb-4 text-xs text-current/70">
          Pointer cursor, press animation on click. Behavior is inferred from
          onClick being present.
        </Paragraph>
        {/* eslint-disable-next-line no-console */}
        <Node label="Clickable" onClick={() => console.log('clicked')} />
      </div>
      <div>
        <Heading level="h3" margin="none" className="mb-2 text-sm font-medium">
          With style.cursor (Draggable)
        </Heading>
        <Paragraph margin="none" className="mb-4 text-xs text-current/70">
          Grab cursor from external style. This is how drag systems like
          useDragSource integrate.
        </Paragraph>
        <Node
          label="Draggable"
          style={{ cursor: 'grab' }}
          color="node-color-seq-2"
        />
      </div>
      <div>
        <Heading level="h3" margin="none" className="mb-2 text-sm font-medium">
          Both onClick & Cursor
        </Heading>
        <Paragraph margin="none" className="mb-4 text-xs text-current/70">
          External cursor style takes precedence, but press animation still
          works from onClick.
        </Paragraph>
        <Node
          label="Both"
          style={{ cursor: 'grab' }}
          // eslint-disable-next-line no-console
          onClick={() => console.log('clicked')}
          color="node-color-seq-3"
        />
      </div>
      <div>
        <Heading level="h3" margin="none" className="mb-2 text-sm font-medium">
          Display Only
        </Heading>
        <Paragraph margin="none" className="mb-4 text-xs text-current/70">
          No onClick, no cursor override. Default cursor, no press animation.
        </Paragraph>
        <Node label="Display" color="node-color-seq-4" />
      </div>
    </div>
  ),
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        story: `
Interaction behaviors are automatically inferred:
- **onClick present**: Pointer cursor + press animation
- **style.cursor provided**: Uses that cursor (e.g., \`'grab'\` from drag systems)
- **Both**: External cursor wins, press animation still enabled
- **Neither**: Default cursor + no animation (display only)

This allows seamless integration with external systems like \`useDragSource\` without explicit mode flags.
        `,
      },
    },
  },
};

/**
 * Interactive example demonstrating selection toggling with actions.
 */
export const SelectionDemo: Story = {
  render: function SelectionDemoRender(args) {
    const [selected, setSelected] = useState(false);
    return (
      <div className="flex flex-col items-center gap-4">
        <Node
          {...args}
          selected={selected}
          onClick={() => setSelected((s) => !s)}
        />
        <span className="text-xs text-current/70">
          Click to toggle selection
        </span>
      </div>
    );
  },
  args: {
    label: 'Click Me',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Click the node to toggle selection. Notice the spring animation when selecting and the smooth fade when deselecting.',
      },
    },
  },
};

/**
 * Interactive example with multiple nodes for selection and linking.
 */
export const InteractiveDemo: Story = {
  render: function InteractiveDemoRender() {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [linkingId, setLinkingId] = useState<string | null>(null);

    const nodes = [
      { id: '1', label: 'Alice', color: 'node-color-seq-1' as const },
      { id: '2', label: 'Bob', color: 'node-color-seq-2' as const },
      { id: '3', label: 'Carol', color: 'node-color-seq-3' as const },
      { id: '4', label: 'David', color: 'node-color-seq-4' as const },
    ];

    const toggleSelection = (id: string) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    };

    const toggleLinking = (id: string) => {
      setLinkingId((prev) => (prev === id ? null : id));
    };

    return (
      <div className="flex flex-col gap-8">
        <div>
          <Paragraph margin="none" className="mb-4 text-sm text-current/70">
            <strong>Click</strong> to toggle selection ·{' '}
            <strong>Shift+Click</strong> to toggle linking mode
          </Paragraph>
          <div className="flex gap-6">
            {nodes.map((node) => (
              <Node
                key={node.id}
                label={node.label}
                color={node.color}
                selected={selectedIds.has(node.id)}
                linking={linkingId === node.id}
                onClick={(e) => {
                  if (e.shiftKey) {
                    toggleLinking(node.id);
                  } else {
                    toggleSelection(node.id);
                  }
                }}
              />
            ))}
          </div>
        </div>
        <div className="text-xs text-current/70">
          <div>
            Selected:{' '}
            {selectedIds.size > 0 ? Array.from(selectedIds).join(', ') : 'none'}
          </div>
          <div>Linking: {linkingId ?? 'none'}</div>
        </div>
      </div>
    );
  },
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        story:
          'A more complete demo showing multiple nodes with selection and linking. Click to select, Shift+click to enter linking mode.',
      },
    },
  },
};

/**
 * Disabled nodes cannot be interacted with.
 */
export const DisabledNodes: Story = {
  render: () => (
    <div className="flex gap-8">
      <div className="flex flex-col items-center gap-2">
        <Node label="Enabled" />
        <span className="text-xs text-current/70">Enabled</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <Node label="Disabled" disabled color="node-color-seq-2" />
        <span className="text-xs text-current/70">Disabled</span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <Node label="Selected" disabled selected color="node-color-seq-3" />
        <span className="text-xs text-current/70">Disabled + Selected</span>
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Disabled nodes are desaturated and have `pointer-events: none`. Visual states like selected can still be shown.',
      },
    },
  },
};

const tooltipLabelCases: readonly {
  caption: string;
  label: string;
  lang: string;
  dir?: 'rtl';
  truncates: boolean;
}[] = [
  { caption: 'Short name', label: 'Ash', lang: 'en', truncates: false },
  {
    caption: 'Natural word boundaries',
    label: 'Alexandria Montgomery-Fitzgerald von Habsburg III',
    lang: 'en',
    truncates: true,
  },
  {
    caption: 'Locale-aware hyphenation',
    label:
      'Alexandra Müller-Lüdenscheidt von Donaudampfschifffahrtsgesellschaft',
    lang: 'de',
    truncates: true,
  },
  {
    caption: 'CJK text',
    label: '佐藤アレクサンドラ美咲エリザベス真理子オリビア',
    lang: 'ja',
    truncates: true,
  },
  {
    caption: 'Right-to-left text',
    label: 'محمد عبد الرحمن بن عبد العزيز الحسيني الهاشمي',
    lang: 'ar',
    dir: 'rtl',
    truncates: true,
  },
  {
    caption: 'No natural break opportunities',
    label: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    lang: 'en',
    truncates: true,
  },
];

const labelOverflows = (labelElement: HTMLElement) =>
  labelElement.scrollHeight - labelElement.clientHeight > 1 ||
  labelElement.scrollWidth - labelElement.clientWidth > 1;

const getOpenTooltip = () =>
  document.querySelector('[data-base-ui-portal] [data-open][role="tooltip"]');

/**
 * Truncated labels expose their complete value in a tooltip on hover and
 * keyboard focus. Untruncated labels never show a tooltip, and pressing a
 * pointer button closes and suppresses it.
 */
export const TruncatedLabelTooltip: Story = {
  render: () => (
    <div className="flex flex-wrap gap-8 p-16">
      {tooltipLabelCases.map(({ caption, label, lang, dir }) => (
        <div key={caption} className="flex w-32 flex-col items-center gap-2">
          <Node label={label} lang={lang} dir={dir} onClick={fn()} />
          <span className="text-center text-xs text-current/70">{caption}</span>
        </div>
      ))}
    </div>
  ),
  decorators: [
    (StoryComponent) => (
      <TooltipProvider delay={0} closeDelay={0}>
        <StoryComponent />
      </TooltipProvider>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    for (const { label, truncates } of tooltipLabelCases) {
      const node = canvas.getByRole('button', { name: label });
      const visibleLabel = within(node).getByText(label);
      await expect(labelOverflows(visibleLabel)).toBe(truncates);

      await userEvent.hover(node);
      if (truncates) {
        await waitFor(() => expect(getOpenTooltip()).toHaveTextContent(label));
      } else {
        await new Promise((resolve) => setTimeout(resolve, 150));
        await expect(getOpenTooltip()).toBeNull();
      }
      await userEvent.unhover(node);
      await waitFor(() => expect(getOpenTooltip()).toBeNull());
    }

    const truncatedCase = tooltipLabelCases[1]!;
    const truncatedNode = canvas.getByRole('button', {
      name: truncatedCase.label,
    });
    await userEvent.hover(truncatedNode);
    await waitFor(() => expect(getOpenTooltip()).not.toBeNull());
    await userEvent.pointer({ keys: '[MouseLeft>]', target: truncatedNode });
    await waitFor(() => expect(getOpenTooltip()).toBeNull());
    await userEvent.pointer({ keys: '[/MouseLeft]', target: truncatedNode });
    await userEvent.unhover(truncatedNode);
    await waitFor(() => expect(getOpenTooltip()).toBeNull());

    // Keyboard focus-open can't be driven by synthetic play input
    // (no focus-visible modality); covered in Node.tooltip.test.tsx.
  },
  parameters: {
    layout: 'padded',
    chromatic: { disableSnapshot: true },
    docs: {
      description: {
        story: `
Overflow is detected from real layout after render — not from character count —
so only labels that actually clamp get a tooltip. The tooltip opens on mouse
hover and keyboard focus, never from press, click, or touch; pressing a pointer
button closes it and keeps it closed while held. The tooltip is rendered with
\`pointer-events: none\`, so it can never capture a gesture, and its content is
\`aria-hidden\` because the full label is already the button's accessible name.
        `,
      },
    },
  },
};

/**
 * The truncated-label tooltip in its open state, for visual review.
 */
export const TruncatedLabelTooltipOpen: Story = {
  render: () => (
    <div className="p-24">
      <Node
        label="Alexandria Montgomery-Fitzgerald von Habsburg III"
        onClick={fn()}
      />
    </div>
  ),
  decorators: [
    (StoryComponent) => (
      <TooltipProvider delay={0} closeDelay={0}>
        <StoryComponent />
      </TooltipProvider>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const node = canvas.getByRole('button');
    await userEvent.hover(node);
    await waitFor(() => expect(getOpenTooltip()).not.toBeNull());
  },
  parameters: {
    chromatic: { pauseAnimationAtEnd: true },
    docs: {
      description: {
        story:
          'The complete label appears above the node without altering its layout or size.',
      },
    },
  },
};

/**
 * Overflow detection holds across every size and shape.
 */
export const TruncationAcrossSizes: Story = {
  render: () => (
    <div className="flex flex-col gap-8">
      {(['xxs', 'xs', 'sm', 'md', 'lg'] as const).map((size) => (
        <div key={size} className="flex items-center gap-8">
          <span className="w-12 text-sm font-medium">{size}</span>
          <div className="flex items-end gap-6">
            {(['circle', 'square', 'diamond'] as const).map((shape) => (
              <Node
                key={shape}
                size={size}
                shape={shape}
                label="Alexandria Montgomery-Fitzgerald von Habsburg III"
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const nodes = canvas.getAllByRole('button');
    await expect(nodes).toHaveLength(15);

    for (const node of nodes) {
      const visibleLabel = within(node).getByText(
        'Alexandria Montgomery-Fitzgerald von Habsburg III',
      );
      await expect(labelOverflows(visibleLabel)).toBe(true);
    }
  },
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        story:
          'A label longer than any node can hold is detected as truncated at every size (each size clamps at a different line count) and shape, so the tooltip is available for all of them.',
      },
    },
  },
};
