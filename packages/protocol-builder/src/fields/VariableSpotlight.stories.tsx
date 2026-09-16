import type { Meta, StoryObj } from '@storybook/react-vite';
import { useRef, useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import type { VariablePickerOption } from './VariablePickerField.tsx';
import type { CreateRowOutcome } from './VariableSpotlight.tsx';
import VariableSpotlight from './VariableSpotlight.tsx';

const ATTRIBUTES: readonly VariablePickerOption[] = [
  { value: 'name', label: 'name', type: 'text' },
  { value: 'age', label: 'age', type: 'number' },
  { value: 'contactFreq', label: 'contactFreq', type: 'ordinal' },
  { value: 'contactType', label: 'contactType', type: 'categorical' },
  { value: 'flagged', label: 'flagged', type: 'boolean' },
  { value: 'closeness', label: 'closeness', type: 'scalar' },
  { value: 'metOn', label: 'metOn', type: 'datetime' },
  { value: 'homeTown', label: 'homeTown', type: 'location' },
];

type HostProps = Readonly<{
  options?: readonly VariablePickerOption[];
  /** Whether this caller lets an attribute be invented from the search term. */
  canCreate?: boolean;
  /** Names the type already holds, whatever kind of answer they record. */
  namesInUse?: readonly string[];
  /**
   * What the codebook answers a create with. `editor` is the escalation: a kind
   * of answer a name cannot finish opens the codebook's own editor and leaves
   * this window open underneath it, waiting.
   */
  outcome?: 'created' | 'refused' | 'editor';
}>;

/**
 * The window, opened from a control that names it — which is how it is always
 * reached: the picker's trigger is what it is named after, and what focus
 * returns to when it is dismissed.
 */
function SpotlightHost({
  options = ATTRIBUTES,
  canCreate = false,
  namesInUse,
  outcome = 'created',
}: HostProps) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<string | undefined>(undefined);
  const [editing, setEditing] = useState<string | undefined>(undefined);
  const answerCreate = useRef<((outcome: CreateRowOutcome) => void) | null>(
    null,
  );

  return (
    <DialogProvider>
      <div className="flex flex-col items-start gap-4 p-6">
        <p id="picker-label">Attribute this question records</p>
        <Button type="button" onClick={() => setOpen(true)}>
          Select attribute
        </Button>
        <p role="status" aria-label="Chosen attribute">
          {chosen ?? 'Nothing chosen yet.'}
        </p>
        <VariableSpotlight
          open={open}
          onOpenChange={setOpen}
          options={options}
          aria-labelledby="picker-label"
          onSelect={(value) => {
            setChosen(value);
            setOpen(false);
          }}
          {...(canCreate
            ? {
                onCreate: async (name: string) => {
                  await Promise.resolve();
                  if (outcome === 'refused') {
                    return { keep: 'The codebook would not take that name.' };
                  }
                  if (outcome === 'editor') {
                    setEditing(name);
                    return new Promise<CreateRowOutcome>((resolve) => {
                      answerCreate.current = resolve;
                    });
                  }
                  setChosen(name);
                  return 'finished' as const;
                },
                ...(namesInUse === undefined ? {} : { namesInUse }),
              }
            : {})}
        />
        <Dialog
          open={editing !== undefined}
          title="Create a new attribute"
          closeDialog={() => {
            setEditing(undefined);
            answerCreate.current?.('correct-the-name');
          }}
        >
          <Paragraph>
            The codebook asks for everything a name cannot settle, which for an
            ordinal attribute is the answers it ranks.
          </Paragraph>
        </Dialog>
      </div>
    </DialogProvider>
  );
}

const openIt = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  await userEvent.click(
    await canvas.findByRole('button', { name: 'Select attribute' }),
  );
  return within(await within(document.body).findByRole('dialog'));
};

const meta = {
  title: 'Protocol Builder/Fields/Attribute window',
  component: SpotlightHost,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The window the attribute picker opens: a search box, one flat alphabetical list of typed rows, and — where the caller allows it — an offer to create an attribute under whatever was typed. A window rather than a list beside the control, because a node type carried through a few studies holds dozens of attributes of one kind and a list shown in place would bury whatever the researcher was reading. Named after the field that opened it, so a screen reader announces which question is being answered.',
      },
    },
  },
  args: {},
  tags: ['autodocs'],
} satisfies Meta<typeof SpotlightHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Closed, as it spends most of its life. */
export const Closed: Story = {};

/** Every attribute the caller offered, by name, with the kind it records. */
export const TheWholeList: Story = {
  play: async ({ canvasElement }) => {
    const dialog = await openIt(canvasElement);

    // Both the name and the placeholder say whether this caller would take a
    // new attribute, so a researcher who hears only the name is told the same
    // thing as one who reads the box.
    const box = dialog.getByRole('searchbox', { name: 'Find an attribute' });
    await expect(box).toHaveFocus();
    await expect(box).toHaveAttribute('placeholder', 'Find an attribute…');
    // Alphabetical, not the order the caller handed them over in.
    const rows = dialog.getAllByRole('option');
    await expect(rows).toHaveLength(ATTRIBUTES.length);
    await expect(rows[0]).toHaveAccessibleName('age');
    await expect(rows[0]).toHaveAttribute('data-attribute-type', 'number');
  },
};

/** Typing narrows the list as the researcher types, with nothing to wait for. */
export const NarrowedByTyping: Story = {
  play: async ({ canvasElement }) => {
    const dialog = await openIt(canvasElement);

    await userEvent.keyboard('contact');

    const rows = dialog.getAllByRole('option');
    await expect(rows).toHaveLength(2);
    await expect(rows[0]).toHaveAccessibleName('contactFreq');
    await expect(rows[1]).toHaveAccessibleName('contactType');
  },
};

/**
 * The arrow keys hand the search box over to the list, and Enter takes the row
 * they land on — so a name typed in full needs no pointer at all.
 */
export const TakenWithTheKeyboard: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const dialog = await openIt(canvasElement);

    await userEvent.keyboard('contact{ArrowDown}');
    const listbox = dialog.getByRole('listbox', { name: 'Attribute results' });
    await expect(listbox.contains(document.activeElement)).toBe(true);
    await userEvent.keyboard('{ArrowDown}{Enter}');

    await expect(
      canvas.getByRole('status', { name: 'Chosen attribute' }),
    ).toHaveTextContent('contactType');
  },
};

/**
 * With a create verb, a name nothing matches puts the offer first — looking
 * for an attribute and finding it does not exist are one act.
 */
export const InventingOne: Story = {
  args: { canCreate: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const dialog = await openIt(canvasElement);

    await userEvent.keyboard('nominated_early');
    const create = dialog.getByRole('option', {
      name: 'Create new attribute called “nominated_early”.',
    });
    await expect(dialog.getAllByRole('option')[0]).toBe(create);
    await userEvent.click(create);

    await expect(
      canvas.getByRole('status', { name: 'Chosen attribute' }),
    ).toHaveTextContent('nominated_early');
  },
};

/**
 * A name the type already holds, or one the export formats cannot carry: the
 * row states the reason and does nothing, rather than spending a round trip to
 * come back with a complaint about a name still on screen.
 */
export const ANameThatCannotBeUsed: Story = {
  args: { canCreate: true, namesInUse: ['age', 'nominated_early'] },
  play: async ({ canvasElement }) => {
    const dialog = await openIt(canvasElement);

    await userEvent.keyboard('nominated_early');
    await expect(
      dialog.getByRole('option', {
        name: 'Cannot create attribute named “nominated_early”: this type already has an attribute called that',
      }),
    ).toHaveAttribute('aria-disabled', 'true');
  },
};

/**
 * A refusal is ABOUT the name that was typed, so the window stays open on it
 * with the reason beside it — the section that refused it is behind a modal
 * while this is open, so a sentence left there is one nobody reads.
 */
export const ACreateThatWasRefused: Story = {
  args: { canCreate: true, outcome: 'refused' },
  play: async ({ canvasElement }) => {
    const dialog = await openIt(canvasElement);

    await userEvent.keyboard('nominated_early');
    await userEvent.click(
      dialog.getByRole('option', {
        name: 'Create new attribute called “nominated_early”.',
      }),
    );

    await expect(await dialog.findByRole('alert')).toHaveTextContent(
      'The codebook would not take that name.',
    );
    await expect(
      dialog.getByRole('searchbox', { name: 'Find or create an attribute' }),
    ).toHaveValue('nominated_early');
  },
};

/** Nothing to offer, and a researcher who may make the first one. */
export const TheFirstAttributeOfThisType: Story = {
  args: { options: [], canCreate: true },
  play: async ({ canvasElement }) => {
    const dialog = await openIt(canvasElement);

    await expect(
      dialog.getByText(/Nothing has been recorded about this type yet/u),
    ).toBeVisible();
    await expect(
      dialog.getByRole('link', { name: 'documentation on attribute naming' }),
    ).toBeInTheDocument();
  },
};

/** Nothing to offer, and nothing this control can do about it. */
export const NothingToChooseFrom: Story = {
  args: { options: [] },
  play: async ({ canvasElement }) => {
    const dialog = await openIt(canvasElement);

    await expect(
      dialog.getByText(
        'There are no attributes to choose from here, and one cannot be created from this window. Create one elsewhere in your protocol and come back to choose it.',
      ),
    ).toBeVisible();
  },
};

/** Narrowed to nothing, by a caller that cannot offer to create one. */
export const NothingMatches: Story = {
  play: async ({ canvasElement }) => {
    const dialog = await openIt(canvasElement);

    await userEvent.keyboard('zzz');

    await expect(
      dialog.getByText(
        'No attribute matches what you typed, and one cannot be created from this window. Create one elsewhere in your protocol and come back to choose it.',
      ),
    ).toBeVisible();
  },
};

/** Whether `element` starts a stacking context of its own. */
function startsStackingContext(element: HTMLElement): boolean {
  const style = getComputedStyle(element);
  return (
    (style.position !== 'static' && style.zIndex !== 'auto') ||
    style.isolation === 'isolate' ||
    style.transform !== 'none' ||
    style.filter !== 'none' ||
    style.opacity !== '1' ||
    style.mixBlendMode !== 'normal' ||
    style.contain.includes('paint')
  );
}

function nearestCommonAncestor(
  first: HTMLElement,
  second: HTMLElement,
): HTMLElement {
  for (
    let above: HTMLElement | null = first;
    above;
    above = above.parentElement
  ) {
    if (above.contains(second)) return above;
  }
  throw new Error('the two popups are not in one tree');
}

/**
 * Which of two popups the browser paints last: inside one stacking context,
 * z-index decides and document order settles a tie.
 *
 * Computed rather than hit-tested, because an open dialog makes everything
 * outside it inert and `elementFromPoint` skips an inert subtree while it is
 * still painted over the dialog — it answers "the editor" either way.
 */
function paintedLast(first: HTMLElement, second: HTMLElement): HTMLElement {
  const root = nearestCommonAncestor(first, second);
  for (const popup of [first, second]) {
    for (
      let above = popup.parentElement;
      above !== null && above !== root;
      above = above.parentElement
    ) {
      if (startsStackingContext(above)) {
        throw new Error(
          `${above.className} stacks between a popup and their shared root, so z-index and document order no longer decide which of the two is on top`,
        );
      }
    }
  }
  const layer = (popup: HTMLElement): number => {
    const zIndex = getComputedStyle(popup).zIndex;
    return zIndex === 'auto' ? 0 : Number(zIndex);
  };
  if (layer(first) !== layer(second)) {
    return layer(first) > layer(second) ? first : second;
  }
  return first.compareDocumentPosition(second) &
    Node.DOCUMENT_POSITION_FOLLOWING
    ? second
    : first;
}

function overlaps(first: HTMLElement, second: HTMLElement): boolean {
  const one = first.getBoundingClientRect();
  const two = second.getBoundingClientRect();
  return (
    Math.min(one.right, two.right) > Math.max(one.left, two.left) &&
    Math.min(one.bottom, two.bottom) > Math.max(one.top, two.top)
  );
}

/**
 * A kind of answer a name cannot finish opens the codebook's own editor, and
 * this window waits underneath it — so the editor is the one on top. A z-index
 * here put the window over every dialog opened after it.
 */
export const TheEditorItOpens: Story = {
  args: { canCreate: true, outcome: 'editor' },
  play: async ({ canvasElement }) => {
    const body = within(document.body);
    const dialog = await openIt(canvasElement);
    // Read before the editor opens: it marks everything outside itself inert,
    // and a role query cannot reach the window once it is.
    const attributeWindow = body.getByRole('dialog', {
      name: 'Attribute this question records',
    });

    await userEvent.keyboard('nominated_early');
    await userEvent.click(
      dialog.getByRole('option', {
        name: 'Create new attribute called “nominated_early”.',
      }),
    );

    const editor = await body.findByRole('dialog', {
      name: 'Create a new attribute',
    });
    // Both are on screen at once, which is what makes the question a question.
    await expect(overlaps(attributeWindow, editor)).toBe(true);
    await expect(paintedLast(attributeWindow, editor)).toBe(editor);
  },
};
