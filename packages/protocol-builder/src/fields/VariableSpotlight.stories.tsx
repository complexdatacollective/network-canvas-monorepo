import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import Button from '@codaco/fresco-ui/Button';
import DialogProvider from '@codaco/fresco-ui/dialogs/DialogProvider';

import type { VariablePickerOption } from './VariablePickerField.tsx';
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
  /** What the codebook answers a create with. */
  outcome?: 'created' | 'refused';
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
                  setChosen(name);
                  return 'finished' as const;
                },
                ...(namesInUse === undefined ? {} : { namesInUse }),
              }
            : {})}
        />
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

    const box = dialog.getByRole('searchbox', {
      name: 'Find or create an attribute',
    });
    await expect(box).toHaveFocus();
    // The NAME never changes; only the placeholder says whether this caller
    // would take a new attribute.
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
