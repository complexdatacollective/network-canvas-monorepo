import type { Meta, StoryObj } from '@storybook/react-vite';
import { useRef, useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';

import { useFitText } from './hooks/useFitText';
import Node, { labelVariants, NodeColors } from './Node';
import Heading from './typography/Heading';
import Paragraph from './typography/Paragraph';

const meta: Meta<typeof Node> = {
  title: 'Components/Node',
  component: Node,
  tags: ['autodocs'],
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

## Gestures
The node is the single gesture recognizer for its own pointer sequence. The
handlers you declare say which gestures exist, and the node classifies each
gesture as exactly one of them and renders every visual consequence itself:
- **onClick**: taps and keyboard activation — pointer cursor, press animation,
  a tab stop, and \`aria-pressed\` from \`selected\`. The handler receives
  \`details.source\` ('pointer' | 'keyboard').
- **onLongPress**: a press held still — the filling hold indicator. Fires in
  addition to the built-in clipped-label reveal.
- **onDragStart / onDragMove / onDragEnd**: movement past the drag threshold —
  grab/grabbing cursor, pointer capture, \`aria-grabbed\`, touch-action none.
  Hosts implement the effects (where the node moves, what the payload is).

A gesture is never two things at once: a drag is not also a tap, a hold is not
also a tap, and a drag withdraws a hold's result. External drag systems
(\`useDragSource\`) may still compose their own pointer handlers; the node
treats their movement as theirs and only withdraws its own hold.

## Labels
Labels are fitted to the node: the type size steps down the scale until the name
fits, so most names are readable in full without any interaction. A name that
still overflows at the smallest legible size is clipped, and can be read in full
by pressing and holding, or by focusing the node from the keyboard. The hold is
abandoned as soon as the pointer moves far enough to begin a drag, and the tap
that would follow it is withdrawn.
        `,
      },
    },
  },
  argTypes: {
    label: {
      control: 'text',
      description:
        'Text displayed inside the node. Labels wrap at locale-appropriate opportunities, fall back to safe character breaks, and step down the type scale until they fit. Only a label that still overflows at the smallest legible size is clipped, and it can then be read in full by pressing and holding.',
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

const resilientLabelCases = [
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
    caption: 'No natural break opportunities',
    label: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    lang: 'en',
  },
] as const;

const resilientLabelShapes = ['circle', 'square', 'diamond'] as const;

/**
 * Labels stay within the node shape across languages and pathological input.
 */
export const LongLabels: Story = {
  render: () => (
    <div className="flex flex-col gap-10">
      {resilientLabelCases.map(({ caption, label, lang }, index) => (
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

      // Which rung the label fitted to — and whether that rung concedes to
      // hyphenation or emergency breaking — varies by label and environment;
      // the invariants are that every rung clamps and none may spill out of
      // the node.
      await expect(visibleLabel.className).toMatch(/line-clamp-\d/);
      const labelBounds = visibleLabel.getBoundingClientRect();
      await expect(labelBounds.height).toBeLessThanOrEqual(bounds.height);
      await expect(labelBounds.width).toBeLessThanOrEqual(bounds.width);
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
 * Declared gestures decide cursor, animation, and focusability.
 */
export const DeclaredGestures: Story = {
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <Heading level="h3" margin="none" className="mb-2 text-sm font-medium">
          With onClick (Clickable)
        </Heading>
        <Paragraph margin="none" className="mb-4 text-xs text-current/70">
          Pointer cursor, press animation, and a tab stop — declared by onClick.
        </Paragraph>
        {/* eslint-disable-next-line no-console */}
        <Node label="Clickable" onClick={() => console.log('clicked')} />
      </div>
      <div>
        <Heading level="h3" margin="none" className="mb-2 text-sm font-medium">
          With drag handlers (Draggable)
        </Heading>
        <Paragraph margin="none" className="mb-4 text-xs text-current/70">
          Declaring onDragStart makes the node draggable: grab cursor, pointer
          capture, and aria-grabbed while dragging.
        </Paragraph>
        <Node
          label="Draggable"
          onDragStart={() => undefined}
          color="node-color-seq-2"
        />
      </div>
      <div>
        <Heading level="h3" margin="none" className="mb-2 text-sm font-medium">
          Click & drag together
        </Heading>
        <Paragraph margin="none" className="mb-4 text-xs text-current/70">
          The recognizer decides which fires: a still release taps, movement
          drags — never both.
        </Paragraph>
        <Node
          label="Both"
          onDragStart={() => undefined}
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
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Focusable exactly when focus does something for a keyboard user.
    // Activation earns a tab stop; a pointer-only drag with no keyboard
    // handler would be a dead control under focus, so it earns none — hosts
    // that supply keyboard equivalents (as the canvas does) earn it back.
    await expect(
      canvas.getByRole('button', { name: 'Clickable' }).tabIndex,
    ).toBe(0);
    await expect(
      canvas.getByRole('button', { name: 'Draggable' }).tabIndex,
    ).toBe(-1);
    await expect(canvas.getByRole('button', { name: 'Both' }).tabIndex).toBe(0);
    await expect(canvas.getByRole('button', { name: 'Display' }).tabIndex).toBe(
      -1,
    );
  },
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        story: `
Declared handlers decide the visuals:
- **onClick**: pointer cursor + press animation + tab stop
- **onDragStart/Move/End**: grab cursor, grabbing while dragging, \`aria-grabbed\`
- **Both**: the recognizer classifies each gesture as exactly one of them
- **Neither**: default cursor, no animation, out of the tab order (display only)

A \`style.cursor\` override still wins, for external drag systems like \`useDragSource\` that compose their own pointer handlers.
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
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const node = canvas.getByRole('button', { name: 'Click Me' });

    // A clickable node is a toggle, and announces its state from `selected`.
    await expect(node).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(node);
    await waitFor(() => expect(node).toHaveAttribute('aria-pressed', 'true'));
    await userEvent.click(node);
    await waitFor(() => expect(node).toHaveAttribute('aria-pressed', 'false'));
  },
  parameters: {
    docs: {
      description: {
        story:
          'Click the node to toggle selection. Notice the spring animation when selecting and the smooth fade when deselecting. The announced toggle state (`aria-pressed`) follows `selected`, so what assistive technology hears always matches what is shown.',
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

const fittingLabelCases = [
  { caption: 'Short', label: 'Ash', lang: 'en' },
  { caption: 'Eight-letter word', label: 'Mohammad Crist', lang: 'en' },
  { caption: 'Typical', label: 'María Hernández', lang: 'es' },
  { caption: 'Long', label: 'Alexandra Müller-Lüdenscheidt', lang: 'de' },
  {
    caption: 'Very long',
    label: 'Alexandria Montgomery-Fitzgerald von Habsburg III',
    lang: 'en',
  },
  {
    caption: 'Beyond any fit',
    label:
      'Alexandria Montgomery-Fitzgerald von Habsburg III of Great Britain and Ireland, Duchess of Edinburgh',
    lang: 'en',
  },
] as const;

// The one case no rung can fit, used by the reveal stories.
const beyondAnyFit = fittingLabelCases[5];

/**
 * Labels are fitted to the node instead of being clipped at one fixed size.
 */
export const LabelFitting: Story = {
  render: () => (
    <div className="flex flex-col gap-10">
      {(['sm', 'md', 'lg'] as const).map((size) => (
        <section key={size} className="flex flex-col gap-3">
          <Heading level="h3" margin="none" className="text-base">
            {size}
          </Heading>
          <div className="flex flex-wrap items-end gap-8">
            {fittingLabelCases.map(({ caption, label, lang }, index) => (
              <div
                key={caption}
                className="flex w-40 flex-col items-center gap-2"
              >
                <Node
                  label={label}
                  lang={lang}
                  size={size}
                  color={
                    `node-color-seq-${index + 1}` as (typeof NodeColors)[number]
                  }
                />
                <span className="text-center text-xs text-current/70">
                  {caption}
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

    // These nodes have no onClick, so a tab stop exists only when the label
    // is clipped and focus would reveal it. A name shown in full offering the
    // reveal is the regression this guards: jsdom cannot reproduce it because
    // the fitter's failure mode was real layout arithmetic — fractional
    // line-height rounding read as truncation. 'Long' and 'Very long' are
    // deliberately unasserted: whether they fit depends on the environment's
    // hyphenation dictionary and the node size.
    const shownInFull = ['Short', 'Eight-letter word', 'Typical'] as const;
    for (const testCase of fittingLabelCases) {
      const nodes = canvas.getAllByRole('button', { name: testCase.label });
      for (const node of nodes) {
        if (testCase.caption === 'Beyond any fit') {
          // Focusable: the native button default, with no attribute written.
          await waitFor(() => expect(node).not.toHaveAttribute('tabindex'));
        } else if (
          (shownInFull as readonly string[]).includes(testCase.caption)
        ) {
          await waitFor(() => expect(node).toHaveAttribute('tabindex', '-1'));
        }
      }
    }
  },
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        story: `
The type size steps down through the scale until the name fits, measured from
real layout after render rather than guessed from a character count. Only names
that overflow even at the smallest legible size are clipped, so most are
readable in full without any interaction.

Words are never broken while a smaller size could fit them whole. A word no
size can hold is hyphenated at a point the reader expects (using the
hyphenation dictionary for the node's language), and only a word hyphenation
cannot segment is broken arbitrarily as a last resort.

The smallest rung is deliberately a floor: below it a name stops being legible
at arm's length on a tablet, which is worse than clipping it.
        `,
      },
    },
  },
};

/**
 * A name too long to fit at any size can be read in full by pressing and holding.
 */
function FractionalLeadingProbe() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { ref, isTruncated } = useFitText<HTMLSpanElement>({
    // The ladder floor's rung with its font size pinned to a fractional
    // pixel value, the way the interview app's fluid type actually resolves
    // `text-xs` (12.64px measured in the field). On scaled displays — retina
    // Macs, tablets, a zoomed page — the resulting fractional line boxes
    // round scrollHeight a couple of pixels past clientHeight with both
    // lines fully visible, which a too-tight height tolerance reads as a
    // clipped label. CI browsers render unscaled and cannot reproduce that
    // rounding, so this probe discriminates only where the bug lives: run it
    // on the hardware participants use.
    steps: [
      labelVariants({
        size: 'sm',
        className: 'text-[12.8px] leading-[1.15]! line-clamp-4',
      }),
    ],
    containerRef,
  });
  return (
    <div
      ref={containerRef}
      className="bg-node-1 flex size-24 items-center justify-center overflow-hidden rounded-full text-white"
    >
      {/* Forced two-line label (whitespace-pre-line) so the probe does not
          depend on any font's glyph widths. */}
      <span ref={ref} data-truncated={isTruncated}>
        {'Line one\nLine two'}
      </span>
    </div>
  );
}

/**
 * Regression probe for the fitter's height arithmetic, which only real layout
 * can exercise: two fully visible lines on the floor rung measure a couple of
 * pixels of scroll-height excess from fractional line-box rounding, and the
 * fitter must read that as rounding — not report the label clipped and offer
 * a reveal for a name already shown in full.
 */
export const LabelFitRounding: Story = {
  render: () => <FractionalLeadingProbe />,
  play: async ({ canvasElement }) => {
    // Wait out the fit (a microtask) rather than racing the initial state.
    await new Promise((resolve) => setTimeout(resolve, 150));
    const probe = canvasElement.querySelector('[data-truncated]');
    await expect(probe).toHaveAttribute('data-truncated', 'false');
  },
  parameters: { chromatic: { disableSnapshot: true } },
};

export const LabelReveal: Story = {
  render: () => (
    <div className="flex flex-wrap gap-12 p-16">
      {[beyondAnyFit, fittingLabelCases[0]].map(({ caption, label, lang }) => (
        <div key={caption} className="flex w-40 flex-col items-center gap-2">
          <Node label={label} lang={lang} onClick={fn()} />
          <span className="text-center text-xs text-current/70">{caption}</span>
        </div>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const clipped = canvas.getByRole('button', {
      name: beyondAnyFit.label,
    });
    const short = canvas.getByRole('button', {
      name: fittingLabelCases[0].label,
    });

    const openTooltip = () =>
      document.querySelector(
        '[data-base-ui-portal] [data-open][role="tooltip"]',
      );

    // A hold on a clipped name shows it is underway, then reveals it in full.
    await userEvent.pointer({ keys: '[MouseLeft>]', target: clipped });
    await waitFor(
      () => expect(clipped.querySelector('[data-node-holding]')).not.toBeNull(),
      { timeout: 3000 },
    );
    await waitFor(
      () => expect(openTooltip()).toHaveTextContent(beyondAnyFit.label),
      { timeout: 3000 },
    );
    await userEvent.pointer({ keys: '[/MouseLeft]', target: clipped });

    // A name that already fits has nothing to reveal.
    await userEvent.click(short);
    await userEvent.pointer({ keys: '[MouseLeft>]', target: short });
    await new Promise((resolve) => setTimeout(resolve, 800));
    await expect(openTooltip()).toBeNull();
    await userEvent.pointer({ keys: '[/MouseLeft]', target: short });
  },
  parameters: {
    layout: 'padded',
    chromatic: { disableSnapshot: true },
    docs: {
      description: {
        story: `
Press and hold a node for half a second to read a clipped name in full. The hold
is abandoned the moment the pointer moves far enough to begin a drag, so
positioning a node on a canvas is untouched, and the tap that would follow the
hold is withdrawn so reading a name never also selects the person.

Keyboard focus reveals the same popup without the timing, and the popup itself
is transparent to the pointer so it can never intercept a gesture. The complete
name is always the node's accessible name, so the popup adds nothing for screen
reader users and is hidden from them.
        `,
      },
    },
  },
};

/**
 * The recognizer classifies every gesture as exactly one thing.
 */
export const GestureClassification: Story = {
  render: function GestureClassificationRender() {
    const [counts, setCounts] = useState({ clicks: 0, drags: 0, holds: 0 });
    return (
      <div className="flex flex-col items-center gap-4 p-16">
        <Node
          label="Gesture"
          onClick={() => setCounts((c) => ({ ...c, clicks: c.clicks + 1 }))}
          onLongPress={() => setCounts((c) => ({ ...c, holds: c.holds + 1 }))}
          onDragStart={() => setCounts((c) => ({ ...c, drags: c.drags + 1 }))}
          onDragEnd={() => undefined}
        />
        <output data-testid="gesture-log" className="text-sm">
          {`clicks:${counts.clicks} drags:${counts.drags} holds:${counts.holds}`}
        </output>
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const node = canvas.getByRole('button', { name: 'Gesture' });
    const log = () => canvas.getByTestId('gesture-log').textContent;

    // A still tap is a click and nothing else.
    await userEvent.pointer([
      { keys: '[MouseLeft>]', target: node },
      { keys: '[/MouseLeft]' },
    ]);
    await waitFor(() => expect(log()).toBe('clicks:1 drags:0 holds:0'));

    // Movement past the threshold is a drag — and never also a click, even
    // though pointer capture still delivers the release's click to the node.
    await userEvent.pointer([
      { keys: '[MouseLeft>]', target: node, coords: { x: 100, y: 100 } },
      { coords: { x: 160, y: 100 } },
      { keys: '[/MouseLeft]' },
    ]);
    await waitFor(() => expect(log()).toBe('clicks:1 drags:1 holds:0'));

    // A press held still is a hold — and its release is not a click either.
    await userEvent.pointer({ keys: '[MouseLeft>]', target: node });
    await waitFor(() => expect(log()).toContain('holds:1'), { timeout: 3000 });
    await userEvent.pointer({ keys: '[/MouseLeft]' });
    await new Promise((resolve) => setTimeout(resolve, 100));
    await expect(log()).toBe('clicks:1 drags:1 holds:1');
  },
  parameters: {
    layout: 'padded',
    chromatic: { disableSnapshot: true },
    docs: {
      description: {
        story: `
An instrumented node counting what actually fired. The play function drives all
three gestures with real pointer sequences: a still tap clicks, movement past
the drag threshold drags (and the click that pointer capture still delivers is
swallowed), and a press held still holds (its release is swallowed too). Each
gesture resolves as exactly one thing.
        `,
      },
    },
  },
};

const downOn = (node: Element, pointerId: number, x = 100, y = 100) =>
  node.dispatchEvent(
    new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: x,
      clientY: y,
      pointerId,
      isPrimary: pointerId === 1,
    }),
  );

const moveTo = (pointerId: number, x: number, y: number) =>
  window.dispatchEvent(
    new PointerEvent('pointermove', {
      bubbles: true,
      clientX: x,
      clientY: y,
      pointerId,
    }),
  );

const upFrom = (pointerId: number, x = 100, y = 100) =>
  window.dispatchEvent(
    new PointerEvent('pointerup', {
      bubbles: true,
      clientX: x,
      clientY: y,
      pointerId,
    }),
  );

/**
 * The visual and semantic states a drag moves through.
 */
export const DragStates: Story = {
  render: () => (
    <div className="p-16">
      <Node
        label="Drag me"
        onDragStart={fn()}
        onDragMove={fn()}
        onDragEnd={fn()}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const node = canvas.getByRole('button', { name: 'Drag me' });

    // At rest: draggable means grab cursor and not grabbed. A pointer-only
    // drag earns no tab stop — a keyboard user could do nothing with it; a
    // host supplying keyboard handlers (as the canvas does) earns one.
    await expect(getComputedStyle(node).cursor).toBe('grab');
    await expect(node.tabIndex).toBe(-1);
    await expect(node).toHaveAttribute('aria-grabbed', 'false');

    // Mid-drag: grabbing cursor, aria-grabbed, and the dragging data state.
    downOn(node, 7);
    moveTo(7, 160, 100);
    await waitFor(() => {
      expect(node).toHaveAttribute('aria-grabbed', 'true');
      expect(node).toHaveAttribute('data-node-dragging');
      expect(getComputedStyle(node).cursor).toBe('grabbing');
    });

    // Released: everything returns to rest.
    upFrom(7, 160, 100);
    await waitFor(() => {
      expect(node).toHaveAttribute('aria-grabbed', 'false');
      expect(node).not.toHaveAttribute('data-node-dragging');
      expect(getComputedStyle(node).cursor).toBe('grab');
    });
  },
  parameters: {
    layout: 'padded',
    chromatic: { disableSnapshot: true },
    docs: {
      description: {
        story:
          'Declaring drag handlers makes the node render its own drag states: grab cursor at rest, grabbing plus `aria-grabbed` while the drag is live, and back to rest on release.',
      },
    },
  },
};

/**
 * A hold hands off to a drag: indicator withdrawn, label withdrawn, drag live.
 */
export const HoldToDragHandoff: Story = {
  render: () => (
    <div className="p-24">
      <Node
        label={beyondAnyFit.label}
        onClick={fn()}
        onDragStart={fn()}
        onDragEnd={fn()}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const node = canvas.getByRole('button');
    const openPopup = () =>
      document.querySelector(
        '[data-base-ui-portal] [data-open][role="tooltip"]',
      );

    // The press becomes a deliberate hold: the indicator fills the shape.
    downOn(node, 3);
    await waitFor(() =>
      expect(node.querySelector('[data-node-holding]')).not.toBeNull(),
    );

    // The hold runs its course and reveals the clipped label.
    await waitFor(() => expect(openPopup()).not.toBeNull(), { timeout: 2000 });

    // Movement past the threshold turns the gesture into a drag: the label
    // comes down rather than trailing the node, and the drag goes live.
    moveTo(3, 170, 100);
    await waitFor(() => {
      expect(openPopup()).toBeNull();
      expect(node).toHaveAttribute('data-node-dragging');
    });

    upFrom(3, 170, 100);
    await waitFor(() => expect(node).not.toHaveAttribute('data-node-dragging'));
  },
  parameters: {
    layout: 'padded',
    chromatic: { disableSnapshot: true },
    docs: {
      description: {
        story:
          'One pointer sequence passing through all three phases: hold feedback, the revealed label, then a drag that withdraws the reveal. Each phase ends cleanly before the next begins.',
      },
    },
  },
};

/**
 * A second finger cannot disturb a hold it does not own.
 */
export const TwoFingerHold: Story = {
  render: () => (
    <div className="p-24">
      <Node label={beyondAnyFit.label} onClick={fn()} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const node = canvas.getByRole('button');
    const openPopup = () =>
      document.querySelector(
        '[data-base-ui-portal] [data-open][role="tooltip"]',
      );

    // One finger holds until the label appears.
    downOn(node, 21);
    await waitFor(() => expect(openPopup()).not.toBeNull(), { timeout: 2000 });

    // A second finger lands on the same node and lifts again: the hold owns
    // the gesture, so the label must not be snatched away mid-read.
    downOn(node, 22);
    upFrom(22);
    await new Promise((resolve) => setTimeout(resolve, 200));
    await expect(openPopup()).not.toBeNull();

    // Releasing the owning finger is not an interruption either.
    upFrom(21);
    await new Promise((resolve) => setTimeout(resolve, 200));
    await expect(openPopup()).not.toBeNull();
  },
  parameters: {
    layout: 'padded',
    chromatic: { disableSnapshot: true },
    docs: {
      description: {
        story:
          'Multi-touch ownership: the finger that began a hold is the only one that can end it. A second finger touching the node neither dismisses the revealed label nor starts a new gesture.',
      },
    },
  },
};

/**
 * A node drawn inside something that already owns the interaction.
 */
export const Presentational: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-6 p-16">
      <button
        type="button"
        className="focusable bg-surface-1 text-surface-1-contrast flex items-center gap-4 rounded px-5 py-2.5"
        onClick={fn()}
      >
        <Node label="person" size="xs" presentational />
        <span>where name is exactly equal to Dee</span>
      </button>
      <Paragraph className="max-w-prose">
        The chip is inert content, so the whole card is one control: one tab
        stop, one accessible name, and no second target for a screen reader to
        find inside the first.
      </Paragraph>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const card = canvas.getByRole('button');

    // A control inside a control is invalid HTML and a dead target for
    // assistive technology; `<button>` takes phrasing content, so a `<div>`
    // in there is invalid too.
    await expect(
      card.querySelectorAll('button, [role="button"], [tabindex], div'),
    ).toHaveLength(0);
    await expect(card).toHaveAccessibleName(
      /person\s*where name is exactly equal to Dee/,
    );
  },
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        story: `
\`presentational\` renders a node as inert content — a \`<span>\` with no role,
no tab stop and no activation — for the case where the node is a picture of an
entity inside a control that owns the interaction, such as Architect's
skip-logic rule cards. The node's label still reads as part of the surrounding
control's name, and press-and-hold still reveals a clipped one; a
presentational node forwards no \`ref\` and ignores \`onClick\` and the drag
handlers.
        `,
      },
    },
  },
};
