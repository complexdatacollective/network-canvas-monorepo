import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo, useState } from 'react';
import { expect, screen, userEvent, waitFor, within } from 'storybook/test';

import UnconnectedField from '@codaco/fresco-ui/form/Field/UnconnectedField';
import Section from '@codaco/fresco-ui/Section';
import type { VariableType } from '@codaco/protocol-validation';

import type { VariableNameScope } from './variableNameRules.ts';
import VariablePickerField, {
  type CreateOptionOutcome,
  type VariablePickerOption,
} from './VariablePickerField.tsx';

const NEEDS_BOOLEAN = 'Nodes can only be highlighted by a Boolean attribute.';

/** The attributes of the node type "Person", judged for a highlight field. */
const PERSON_ATTRIBUTES: readonly VariablePickerOption[] = [
  {
    value: 'name',
    label: 'name',
    type: 'text',
    unavailableReason: `This is a Text attribute. ${NEEDS_BOOLEAN}`,
  },
  {
    value: 'age',
    label: 'age',
    type: 'number',
    unavailableReason: `This is a Number attribute. ${NEEDS_BOOLEAN}`,
  },
  { value: 'close_friend', label: 'close_friend', type: 'boolean' },
  { value: 'lives_nearby', label: 'lives_nearby', type: 'boolean' },
  {
    value: 'sees_weekly',
    label: 'sees_weekly',
    type: 'boolean',
    unavailableReason:
      'Prompt 2 on this stage already highlights this attribute.',
  },
  { value: 'married', label: 'married', type: 'boolean' },
  {
    value: 'closeness',
    label: 'closeness',
    type: 'ordinal',
    unavailableReason: `This is an Ordinal attribute. ${NEEDS_BOOLEAN}`,
  },
  {
    value: 'layout',
    label: 'layout',
    type: 'layout',
    unavailableReason:
      'This is a Layout attribute. It records where nodes are placed on the canvas, so it cannot be used to highlight them.',
  },
];

const FIELD_LABEL = 'Attribute to highlight';

/** What the stand-in codebook does when asked to create an attribute. */
type CreateBehaviour = 'created' | 'refused' | 'unassigned' | 'pending';

type HarnessProps = Readonly<{
  options?: readonly VariablePickerOption[];
  initialValue?: string;
  /** `none` stands for a caller that gives no preset type. */
  newVariableType?: VariableType | 'none';
  /** Absent: the picker only chooses from what exists. */
  create?: CreateBehaviour;
  emptyMessage?: string;
  readOnly?: boolean;
}>;

function Harness({
  options: initialOptions = PERSON_ATTRIBUTES,
  initialValue,
  newVariableType = 'boolean',
  create,
  emptyMessage,
  readOnly = false,
}: HarnessProps) {
  const [options, setOptions] = useState(initialOptions);
  const [value, setValue] = useState<string | undefined>(initialValue);
  const presetType = newVariableType === 'none' ? undefined : newVariableType;

  const nameScope = useMemo<VariableNameScope>(
    () => ({
      entity: 'node',
      variables: options.map((option) => ({
        id: option.value,
        name: option.label,
        type: option.type ?? 'text',
      })),
      layouts: [],
    }),
    [options],
  );

  const onCreateOption = async (name: string): Promise<CreateOptionOutcome> => {
    if (create === 'pending') return new Promise(() => undefined);
    // A story holds still, so the codebook write is the one thing stood in
    // for: what the picker does with each answer is what these stories show.
    await Promise.resolve();
    if (create === 'refused') {
      return {
        status: 'refused',
        message:
          'Robin is currently editing a section needed for this change. Try again when they have finished.',
      };
    }
    const created: VariablePickerOption = {
      value: `created:${name}`,
      label: name,
      ...(presetType === undefined ? {} : { type: presetType }),
    };
    setOptions((previous) => [...previous, created]);
    if (create === 'unassigned') return { status: 'unassigned' };
    setValue(created.value);
    return { status: 'created' };
  };

  return (
    <div className="mx-auto flex min-h-[40rem] w-full max-w-2xl flex-col p-8">
      <Section
        title="Prompt 1"
        description="Settings for how nodes are shown while this prompt is active."
      >
        <UnconnectedField
          name="highlight"
          label={FIELD_LABEL}
          hint="Nodes are highlighted when this Boolean attribute is true."
          component={VariablePickerField}
          options={options}
          value={value}
          onChange={setValue}
          nameScope={nameScope}
          readOnly={readOnly}
          {...(emptyMessage === undefined ? {} : { emptyMessage })}
          {...(create === undefined ? {} : { onCreateOption })}
          {...(presetType === undefined ? {} : { newVariableType: presetType })}
        />
      </Section>
    </div>
  );
}

const meta = {
  title: 'Protocol Builder/Fields/Attribute picker',
  component: Harness,
  parameters: {
    docs: {
      description: {
        component:
          'Chooses one codebook attribute and, where the caller allows it, creates the one that is missing. The field is a select box that shows the chosen attribute as its pill. Opening it shows a list anchored to it, with a search box that is focused automatically and matches attribute names loosely, so "mrd" finds "married". Attributes that cannot be used here are listed under "Not available here", dimmed; choosing one shows why instead of choosing it. When the caller passes `onCreateOption`, typing a name that no attribute has offers to create it as the first row of the list.',
      },
    },
  },
  args: {},
  tags: ['autodocs'],
} satisfies Meta<typeof Harness>;

export default meta;
type Story = StoryObj<typeof meta>;

const trigger = (canvasElement: HTMLElement) =>
  within(canvasElement).findByRole('combobox', {
    name: new RegExp(`^${FIELD_LABEL}`, 'u'),
  });

const openPopup = async (canvasElement: HTMLElement) => {
  await userEvent.click(await trigger(canvasElement));
  const search = await screen.findByRole('combobox', {
    name: /^Find (or create )?an attribute$/u,
  });
  await waitFor(() => expect(search).toHaveFocus());
  return search;
};

const openAndType = async (canvasElement: HTMLElement, query: string) => {
  const search = await openPopup(canvasElement);
  await userEvent.type(search, query);
  return search;
};

/** Nothing chosen yet: the select box shows its placeholder. */
export const Empty: Story = {
  play: async ({ canvasElement }) => {
    await expect(await trigger(canvasElement)).toHaveTextContent(
      'Select an attribute',
    );
  },
};

/** The chosen attribute is drawn as its pill inside the select box. */
export const Selected: Story = {
  args: { initialValue: 'close_friend' },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole('combobox', {
        name: `${FIELD_LABEL} close_friend`,
      }),
    ).toHaveAccessibleDescription(
      expect.stringContaining('Attribute type: Boolean'),
    );
  },
};

/**
 * Open with nothing typed: the attributes that can be chosen first, the chosen
 * one ticked, then the ones that cannot be used here.
 */
export const Open: Story = {
  args: { initialValue: 'close_friend' },
  play: async ({ canvasElement }) => {
    await openPopup(canvasElement);
    await expect(
      await screen.findByText('Not available here'),
    ).toBeInTheDocument();
    await expect(
      screen.getByRole('option', { name: 'sees_weekly' }),
    ).toHaveAttribute('aria-disabled', 'true');
  },
};

/** "mrd" finds "married" by a loose match. */
export const FuzzyFilter: Story = {
  play: async ({ canvasElement }) => {
    await openAndType(canvasElement, 'mrd');
    const listbox = await screen.findByRole('listbox');
    await waitFor(() =>
      expect(
        within(listbox)
          .getAllByRole('option')
          .map((option) => option.dataset.attributeId),
      ).toEqual(['married']),
    );
  },
};

/**
 * Choosing an attribute that cannot be used here selects nothing and shows
 * why, under its pill.
 */
export const UnavailableReasonRevealed: Story = {
  args: { initialValue: 'close_friend' },
  play: async ({ canvasElement }) => {
    await openPopup(canvasElement);
    const option = await screen.findByRole('option', { name: 'sees_weekly' });
    await expect(option).not.toHaveAttribute('data-revealed');
    // A researcher scrolls to the row before pressing it; userEvent does not.
    option.scrollIntoView({ block: 'nearest' });
    await userEvent.click(option);
    await waitFor(() => expect(option).toHaveAttribute('data-revealed'));
    await expect(option).toHaveAccessibleDescription(
      expect.stringContaining(
        'Prompt 2 on this stage already highlights this attribute.',
      ),
    );
    option.scrollIntoView({ block: 'nearest' });
    // Still open, and the choice has not changed.
    await expect(screen.getByRole('listbox')).toBeVisible();
    await expect(await trigger(canvasElement)).toHaveAccessibleName(
      `${FIELD_LABEL} close_friend`,
    );
  },
};

/** The create row, naming the type that the caller presets. */
export const CreateRow: Story = {
  args: { create: 'created' },
  play: async ({ canvasElement }) => {
    await openAndType(canvasElement, 'knows_ego');
    const row = await screen.findByRole('option', {
      name: 'Create “knows_ego”',
    });
    await expect(row).toHaveAccessibleDescription('New Boolean attribute');
  },
};

/** A caller that presets no type: the create row names none. */
export const CreateRowWithoutType: Story = {
  args: { create: 'created', newVariableType: 'none' },
  play: async ({ canvasElement }) => {
    await openAndType(canvasElement, 'knows_ego');
    await expect(
      await screen.findByRole('option', { name: 'Create “knows_ego”' }),
    ).toHaveAccessibleDescription('New attribute');
  },
};

/**
 * A name that the export cannot use: "layout_x" is already a column that the
 * layout attribute "layout" writes.
 */
export const InvalidName: Story = {
  args: { create: 'created' },
  play: async ({ canvasElement }) => {
    await openAndType(canvasElement, 'layout_x');
    const row = await screen.findByRole('option', {
      name: 'An attribute cannot be named “layout_x”',
    });
    await expect(row).toHaveAttribute('aria-disabled', 'true');
  },
};

/** While the codebook write is out, the row says so and holds every choice. */
export const Creating: Story = {
  args: { create: 'pending' },
  play: async ({ canvasElement }) => {
    await openAndType(canvasElement, 'knows_ego');
    await userEvent.click(
      await screen.findByRole('option', { name: 'Create “knows_ego”' }),
    );
    await expect(
      await screen.findByRole('option', { name: 'Creating “knows_ego”…' }),
    ).toHaveAttribute('aria-disabled', 'true');
  },
};

/** A refused create keeps the list open on the name, with the reason. */
export const Refused: Story = {
  args: { create: 'refused' },
  play: async ({ canvasElement }) => {
    const search = await openAndType(canvasElement, 'knows_ego');
    await userEvent.click(
      await screen.findByRole('option', { name: 'Create “knows_ego”' }),
    );
    const row = await screen.findByRole('option', {
      name: 'Create “knows_ego”',
      description: /Robin is currently editing/u,
    });
    await expect(row).toHaveAttribute('data-create-state', 'refused');
    await expect(search).toHaveValue('knows_ego');
  },
};

/**
 * The attribute was created, but whatever it was created for did not take
 * it. The list closes and the field says where the attribute went.
 */
export const Unassigned: Story = {
  args: { create: 'unassigned' },
  play: async ({ canvasElement }) => {
    await openAndType(canvasElement, 'knows_ego');
    await userEvent.click(
      await screen.findByRole('option', { name: 'Create “knows_ego”' }),
    );
    await expect(
      await within(canvasElement).findByText(
        '“knows_ego” was added to the codebook, but it has not been selected here.',
      ),
    ).toBeVisible();
  },
};

/**
 * The field holds an attribute that cannot be used here. It is shown as
 * itself, and the reason is shown under the field.
 */
export const HeldUnavailable: Story = {
  args: { initialValue: 'sees_weekly' },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText(
        'Prompt 2 on this stage already highlights this attribute.',
      ),
    ).toBeVisible();
  },
};

/**
 * The field holds an id that no attribute in the list has. It is kept and
 * named rather than dropped.
 */
export const HeldMissing: Story = {
  args: { initialValue: 'deleted_attribute' },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText(
        'This attribute is not available here. Choose another one.',
      ),
    ).toBeVisible();
  },
};

/** Nothing to choose and nothing may be created: the field says so. */
export const NothingToOffer: Story = {
  args: {
    options: [],
    emptyMessage: 'This node type has no Boolean attributes yet.',
  },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText(
        'This node type has no Boolean attributes yet.',
      ),
    ).toBeVisible();
    await expect(
      within(canvasElement).queryByRole('combobox'),
    ).not.toBeInTheDocument();
  },
};

/** An empty codebook, where the first attribute can be created. */
export const FirstAttribute: Story = {
  args: { options: [], create: 'created' },
  play: async ({ canvasElement }) => {
    await openPopup(canvasElement);
    await expect(
      await screen.findByText(/Nothing has been recorded about this type yet/u),
    ).toBeVisible();
  },
};

/**
 * What a choice looks like as it is made: the chosen attribute's pill rises
 * into the select box, replacing the placeholder or the pill that was there,
 * and the select box's border flashes once to confirm it. Nothing moves for a
 * value the field already held. Choose attributes here to watch it; the
 * automated run checks that both choices it makes were shown as arrivals
 * (animations are skipped under test, so it ends in the settled state).
 */
export const ChoosingShowsTheChange: Story = {
  args: { create: 'created' },
  play: async ({ canvasElement }) => {
    const select = await trigger(canvasElement);
    const arrivedAs = (name: string) =>
      select
        .querySelector(`data[value="${name}"]`)
        ?.closest('[data-animated-arrival]') ?? null;

    await expect(select.querySelector('[data-animated-arrival]')).toBeNull();

    await openPopup(canvasElement);
    await userEvent.click(screen.getByRole('option', { name: 'married' }));
    await waitFor(() => expect(arrivedAs('married')).not.toBeNull());

    await openPopup(canvasElement);
    await userEvent.click(screen.getByRole('option', { name: 'close_friend' }));
    await waitFor(() => expect(arrivedAs('close_friend')).not.toBeNull());
    await waitFor(() =>
      expect(select.querySelector('data[value="married"]')).toBeNull(),
    );
    await expect(
      select.querySelector('[data-choice-confirmation]'),
    ).not.toBeNull();
  },
};

/** Try every interaction, including creating an attribute. */
export const Playground: Story = {
  args: { create: 'created' },
};
