import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  type ComponentType,
  useCallback,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Alert, AlertDescription } from '@codaco/fresco-ui/Alert';
import Field from '@codaco/fresco-ui/form/Field/Field';
import Section from '@codaco/fresco-ui/Section';
import type { VariableType } from '@codaco/protocol-validation';
import { sectionId } from '@codaco/studio-sync/taxonomy';
import { withAnimationsEnabled } from '@codaco/vitest-config/modern/with-animations-enabled';

import { useCreateCodebookVariable } from '../../codebook/useCodebookVariableEdits.ts';
import AssignAttributes, {
  type CreateAttributeOutcome,
} from '../../form/arrayFields/AssignAttributes.tsx';
import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import {
  type CodebookSubject,
  variablesForSubject,
} from '../../protocol-context.ts';
import { useProtocolContext } from '../../state/protocolContext.ts';
import {
  attributeField,
  attributeSearchBox,
  attributeTrigger,
  chooseAttribute,
  clearAttributeSearch,
  findCreateRow,
  inventAttribute,
  offeredAttributes,
  openAttributePicker,
  searchAttributes,
  unavailableAttributes,
} from '../../testing/attributePicker.ts';
import {
  fixtureStageId,
  fixtureTypeId,
  fixtureVariableId,
} from '../../testing/protocolFixture.ts';
import {
  type RenderStageEditorOptions,
  renderStageEditor,
} from '../../testing/renderStageEditor.tsx';
import { testTypeId } from '../../testing/testId.ts';
import type { VariableNameScope } from '../variableNameRules.ts';
import VariablePickerField, {
  type CreateOptionOutcome,
  type VariablePickerOption,
} from '../VariablePickerField.tsx';

/** The attributes of a person, judged for a field that takes a Boolean. */
const OPTIONS: readonly VariablePickerOption[] = [
  { value: 'v-married', label: 'married', type: 'boolean' },
  { value: 'v-close', label: 'close_friend', type: 'boolean' },
  {
    value: 'v-age',
    label: 'age',
    type: 'number',
    unavailableReason: 'Only Boolean attributes can be used here.',
    unavailableForType: true,
  },
  {
    value: 'v-weekly',
    label: 'sees_weekly',
    type: 'boolean',
    unavailableReason: 'Prompt 2 already highlights this attribute.',
  },
];

const SCOPE: VariableNameScope = {
  entity: 'node',
  variables: [
    ...OPTIONS.map((option) => ({
      id: option.value,
      name: option.label,
      type: option.type ?? 'text',
    })),
    // A layout attribute exports `home_x` and `home_y`, and is not offered.
    { id: 'v-home', name: 'home', type: 'layout' },
  ],
  layouts: [],
};

const POPUP = '[data-attribute-picker-popup][data-open]';
const popupIsOpen = () => document.querySelector(POPUP) !== null;

/** The region that the field keeps mounted for what it says after a create. */
const notice = () => screen.getByRole('status');

type ControlProps = Readonly<{
  options?: readonly VariablePickerOption[];
  initialValue?: string;
  onCreateOption?: (name: string) => Promise<CreateOptionOutcome>;
  newVariableType?: string;
  emptyMessage?: string;
  readOnly?: boolean;
  disabled?: boolean;
}>;

/**
 * The control on its own, labelled the way `Field` labels it, holding its own
 * value. The spies are the seam: `onChange` and `onSelectExisting` are what a
 * section is told.
 */
const mountControl = (props: ControlProps = {}) => {
  const onChange = vi.fn();
  const onSelectExisting = vi.fn();
  const onBlur = vi.fn();

  function Control(current: ControlProps) {
    const [value, setValue] = useState(current.initialValue);
    return (
      <>
        <label id="picker-label" htmlFor="picker">
          Attribute to highlight
        </label>
        <VariablePickerField
          id="picker"
          name="highlight"
          aria-labelledby="picker-label"
          options={current.options ?? OPTIONS}
          value={value}
          onChange={(next) => {
            onChange(next);
            setValue(next);
          }}
          onSelectExisting={onSelectExisting}
          onBlur={onBlur}
          nameScope={SCOPE}
          {...(current.onCreateOption === undefined
            ? {}
            : { onCreateOption: current.onCreateOption })}
          {...(current.newVariableType === undefined
            ? {}
            : { newVariableType: current.newVariableType })}
          {...(current.emptyMessage === undefined
            ? {}
            : { emptyMessage: current.emptyMessage })}
          readOnly={current.readOnly ?? false}
          disabled={current.disabled ?? false}
        />
        <button type="button">Somewhere else</button>
      </>
    );
  }

  const view = render(<Control {...props} />);
  const user = userEvent.setup();
  const field = view.container;
  return {
    user,
    onChange,
    onSelectExisting,
    onBlur,
    field,
    rerender: (next: ControlProps) => view.rerender(<Control {...next} />),
    trigger: () => attributeTrigger(field),
    open: () => openAttributePicker(user, field),
  };
};

/**
 * A create whose answer the test gives by hand, as a slow codebook round trip
 * does: the moment between the press and the answer is one no test going
 * through a host can hold open.
 */
const createHeldInHand = () => {
  let answer: ((outcome: CreateOptionOutcome) => void) | undefined;
  let fail: ((reason: Error) => void) | undefined;
  const onCreateOption = vi.fn(
    () =>
      new Promise<CreateOptionOutcome>((resolve, reject) => {
        answer = resolve;
        fail = reject;
      }),
  );
  return {
    onCreateOption,
    answerWith: (outcome: CreateOptionOutcome) => {
      if (answer === undefined) throw new Error('Nothing is waiting.');
      answer(outcome);
    },
    throwFrom: (reason: Error) => {
      if (fail === undefined) throw new Error('Nothing is waiting.');
      fail(reason);
    },
  };
};

const optionNamed = (popup: HTMLElement, name: string) =>
  within(popup).getByRole('option', { name });

const typeIn = async (
  control: ReturnType<typeof mountControl>,
  popup: HTMLElement,
  text: string,
) => {
  await control.user.type(attributeSearchBox(popup), text);
};

const createRowOf = (popup: HTMLElement): HTMLElement => {
  const row = findCreateRow(popup);
  if (row === null) throw new Error('The list offers no create row.');
  return row;
};

describe('the attribute picker’s select box', () => {
  it('is a combobox named by its label, showing a placeholder until an attribute is chosen', () => {
    const control = mountControl();

    expect(control.trigger()).toHaveRole('combobox');
    expect(control.trigger()).toHaveAccessibleName(
      'Attribute to highlight Select an attribute',
    );
  });

  it('shows the chosen attribute as its pill, and says what kind of answer it records', () => {
    const control = mountControl({ initialValue: 'v-married' });

    expect(control.trigger()).toHaveAccessibleName(
      'Attribute to highlight married',
    );
    expect(control.trigger()).toHaveAccessibleDescription(
      'Attribute type: Boolean',
    );
    expect(
      control.trigger().querySelector('data[value="married"]'),
    ).toHaveAttribute('data-attribute-type', 'boolean');
  });

  it('opens a list named after the field, with the search box focused', async () => {
    const control = mountControl();
    const popup = await control.open();

    expect(popup).toHaveAccessibleName('Attribute to highlight');
    expect(attributeSearchBox(popup)).toHaveFocus();
    expect(attributeSearchBox(popup)).toHaveAccessibleName('Find an attribute');
  });

  it('lists the attributes that can be chosen by name, then the others under their own heading, those ruled out only for their type last', async () => {
    const control = mountControl();
    const popup = await control.open();

    const rows = within(popup).getAllByRole('option');
    // `age` sorts before `sees_weekly` by name, but it is ruled out only for
    // its type, which is the reason a researcher least needs to read.
    expect(rows.map((row) => row.dataset.attributeId)).toEqual([
      'v-close',
      'v-married',
      'v-weekly',
      'v-age',
    ]);
    expect(rows[0]).toHaveAccessibleName('close_friend');
    expect(rows[0]).toHaveAccessibleDescription('Attribute type: Boolean');
    expect(rows[0]).not.toHaveAttribute('aria-disabled');

    const heading = within(popup).getByRole('group', {
      name: 'Not available here',
    });
    expect(within(heading).getAllByRole('option')).toEqual([rows[2], rows[3]]);
    expect(rows[2]).toHaveAttribute('aria-disabled', 'true');
    expect(rows[3]).toHaveAttribute('aria-disabled', 'true');
  });

  it('chooses an attribute, tells the caller, closes and gives focus back to the select box', async () => {
    const control = mountControl();
    const popup = await control.open();

    await control.user.click(optionNamed(popup, 'married'));

    await waitFor(() => expect(popupIsOpen()).toBe(false));
    expect(control.onChange).toHaveBeenCalledExactlyOnceWith('v-married');
    expect(control.onSelectExisting).toHaveBeenCalledExactlyOnceWith(
      'v-married',
    );
    expect(control.trigger()).toHaveAccessibleName(
      'Attribute to highlight married',
    );
    await waitFor(() => expect(control.trigger()).toHaveFocus());
  });

  it('chooses the highlighted attribute on Enter', async () => {
    const control = mountControl();
    await control.open();

    await control.user.keyboard('{ArrowDown}{Enter}');

    await waitFor(() => expect(popupIsOpen()).toBe(false));
    expect(control.onChange).toHaveBeenCalledExactlyOnceWith('v-close');
    await waitFor(() => expect(control.trigger()).toHaveFocus());
  });

  it('closes on Escape without choosing, gives focus back and forgets the search', async () => {
    const control = mountControl();
    const popup = await control.open();
    await typeIn(control, popup, 'mar');

    await control.user.keyboard('{Escape}');

    await waitFor(() => expect(popupIsOpen()).toBe(false));
    expect(control.onChange).not.toHaveBeenCalled();
    await waitFor(() => expect(control.trigger()).toHaveFocus());
    const reopened = await control.open();
    expect(attributeSearchBox(reopened)).toHaveValue('');
  });

  it('finds an attribute from an abbreviation of its name', async () => {
    const control = mountControl();
    const popup = await control.open();

    await typeIn(control, popup, 'mrd');

    await waitFor(() =>
      expect(
        within(popup)
          .getAllByRole('option')
          .map((row) => row.dataset.attributeId),
      ).toEqual(['v-married']),
    );
  });

  it('is read the same way by the shared test helpers', async () => {
    const control = mountControl();

    expect(await offeredAttributes(control.user, control.field)).toEqual([
      'v-close',
      'v-married',
    ]);
    // A reason for the attribute's type is read last.
    expect(await unavailableAttributes(control.user, control.field)).toEqual([
      'v-weekly',
      'v-age',
    ]);

    const popup = await control.open();
    await searchAttributes(control.user, popup, 'mrd');
    expect(
      within(popup)
        .getAllByRole('option')
        .map((row) => row.dataset.attributeId),
    ).toEqual(['v-married']);
    await clearAttributeSearch(control.user, popup);
    expect(within(popup).getAllByRole('option')).toHaveLength(4);
  });

  it('says so when nothing matches and nothing can be created', async () => {
    const control = mountControl();
    const popup = await control.open();

    await typeIn(control, popup, 'qqq');

    expect(
      await within(popup).findByText('No attributes match “qqq”.'),
    ).toBeVisible();
    expect(within(popup).queryByRole('option')).toBeNull();
  });
});

/**
 * An attribute that cannot be chosen here is listed and explains itself, but
 * only when the researcher tries to choose it: reaching it with the arrow keys
 * says nothing, so a keyboard user scanning the list is not read a paragraph
 * per row.
 */
describe('an attribute that is not available here', () => {
  const reasonShownFor = (row: HTMLElement) =>
    row.dataset.revealed !== undefined &&
    within(row).queryByText('Prompt 2 already highlights this attribute.') !==
      null;

  it('does not explain itself when the arrow keys reach it', async () => {
    const control = mountControl();
    const popup = await control.open();
    const weekly = optionNamed(popup, 'sees_weekly');

    // Down past the two that can be chosen.
    await control.user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');

    await waitFor(() => expect(weekly).toHaveAttribute('data-highlighted'));
    expect(reasonShownFor(weekly)).toBe(false);
    expect(weekly).toHaveAccessibleDescription('Attribute type: Boolean');
  });

  it('explains itself when clicked, and selects nothing', async () => {
    const control = mountControl({ initialValue: 'v-married' });
    const popup = await control.open();
    const weekly = optionNamed(popup, 'sees_weekly');

    await control.user.click(weekly);

    await waitFor(() => expect(reasonShownFor(weekly)).toBe(true));
    expect(weekly).toHaveAccessibleDescription(
      'Attribute type: Boolean Prompt 2 already highlights this attribute.',
    );
    // The row is still named after the attribute, not after the reason.
    expect(weekly).toHaveAccessibleName('sees_weekly');
    expect(popupIsOpen()).toBe(true);
    expect(control.onChange).not.toHaveBeenCalled();
    expect(control.onSelectExisting).not.toHaveBeenCalled();
    expect(control.trigger()).toHaveAccessibleName(
      'Attribute to highlight married',
    );
  });

  it('explains itself on Enter, selects nothing, and stops explaining when the highlight moves on', async () => {
    const control = mountControl();
    const popup = await control.open();
    const weekly = optionNamed(popup, 'sees_weekly');

    await control.user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
    await waitFor(() => expect(weekly).toHaveAttribute('data-highlighted'));
    await control.user.keyboard('{Enter}');

    await waitFor(() => expect(reasonShownFor(weekly)).toBe(true));
    expect(control.onChange).not.toHaveBeenCalled();
    expect(popupIsOpen()).toBe(true);

    await control.user.keyboard('{ArrowUp}');
    await waitFor(() => expect(reasonShownFor(weekly)).toBe(false));
  });

  it('is shown as itself when the field holds it, with the reason under the field', () => {
    const control = mountControl({ initialValue: 'v-weekly' });

    expect(control.trigger()).toHaveAccessibleName(
      'Attribute to highlight sees_weekly',
    );
    expect(
      screen.getByText('Prompt 2 already highlights this attribute.'),
    ).toBeVisible();
    expect(control.trigger()).toHaveAccessibleDescription(
      'Attribute type: Boolean Prompt 2 already highlights this attribute.',
    );
  });
});

describe('a stored choice that is not among the options', () => {
  /**
   * Kept and named rather than dropped: blanking the control would hide the
   * very reference the researcher has to resolve, and write the blank back.
   */
  it('keeps the stored id, names it, and says it is not available', () => {
    const control = mountControl({ initialValue: 'v-deleted' });

    expect(control.trigger()).toHaveAccessibleName(
      'Attribute to highlight v-deleted — this attribute is not available here',
    );
    expect(
      control.trigger().querySelector('[data-attribute-missing]'),
    ).not.toBeNull();
    expect(
      screen.getByText(
        'This attribute is not available here. Choose another one.',
      ),
    ).toBeVisible();
    expect(control.onChange).not.toHaveBeenCalled();
  });

  it('keeps the control on screen even when nothing else can be chosen', () => {
    const control = mountControl({ initialValue: 'v-deleted', options: [] });

    expect(control.trigger()).toBeInTheDocument();
  });
});

describe('nothing to offer', () => {
  it('says so in place of the control when nothing can be chosen or created', () => {
    mountControl({
      options: [],
      emptyMessage: 'This node type has no Boolean attributes yet.',
    });

    expect(
      screen.getByText('This node type has no Boolean attributes yet.'),
    ).toBeVisible();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('says that none of the listed attributes can be used, rather than that there are none', async () => {
    const unavailable = OPTIONS.filter(
      (option) => option.unavailableReason !== undefined,
    );
    const control = mountControl({
      options: unavailable,
      emptyMessage: 'This node type has no Boolean attributes yet.',
    });

    // Under the field, without opening the list.
    expect(
      screen.getByText(
        'None of the existing attributes can be used here. Open the list to see why.',
      ),
    ).toBeVisible();
    // The caller's sentence is about a codebook with no attributes at all,
    // which this one is not.
    expect(
      screen.queryByText('This node type has no Boolean attributes yet.'),
    ).toBeNull();

    const popup = await control.open();
    expect(
      within(popup).getByText(
        'None of the attributes below can be used here. Choose one to see why.',
      ),
    ).toBeVisible();
    expect(
      within(popup)
        .getAllByRole('option')
        .map((row) => row.dataset.attributeId),
    ).toEqual(['v-weekly', 'v-age']);
  });

  it('invites the first attribute in an empty codebook where one can be created', async () => {
    const control = mountControl({
      options: [],
      onCreateOption: () => Promise.resolve({ status: 'created' }),
    });
    const popup = await control.open();

    expect(
      within(popup).getByText(/Nothing has been recorded about this type yet/u),
    ).toBeVisible();
    expect(
      within(popup).getByRole('link', {
        name: 'documentation on attribute naming',
      }),
    ).toBeInTheDocument();
  });
});

describe('creating an attribute from the list', () => {
  it('offers the typed name as the first row, naming the type that it will have', async () => {
    const control = mountControl({
      onCreateOption: () => Promise.resolve({ status: 'created' }),
      newVariableType: 'boolean',
    });
    const popup = await control.open();
    expect(attributeSearchBox(popup)).toHaveAccessibleName(
      'Find or create an attribute',
    );

    // A name that also matches an attribute: the researcher who typed a name
    // that nothing has is asking for that name.
    await typeIn(control, popup, 'marr');

    const rows = within(popup).getAllByRole('option');
    expect(rows[0]).toBe(createRowOf(popup));
    expect(rows[0]).toHaveAccessibleName('Create “marr”');
    expect(rows[0]).toHaveAccessibleDescription('New Boolean attribute');
    expect(
      rows[0]?.querySelector('[data-attribute-type-mark]'),
    ).toHaveAttribute('data-attribute-type-mark', 'boolean');
    expect(rows[1]).toHaveAccessibleName('married');
  });

  it('names no type where the caller presets none', async () => {
    const control = mountControl({
      onCreateOption: () => Promise.resolve({ status: 'created' }),
    });
    const popup = await control.open();

    await typeIn(control, popup, 'knows_ego');

    expect(createRowOf(popup)).toHaveAccessibleDescription('New attribute');
    expect(createRowOf(popup).querySelector('[data-attribute-type-mark]')).toBe(
      null,
    );
  });

  it('creates on Enter, and closes once the attribute exists', async () => {
    const held = createHeldInHand();
    const control = mountControl({ onCreateOption: held.onCreateOption });
    const popup = await control.open();

    await typeIn(control, popup, '  knows_ego ');
    await control.user.keyboard('{Enter}');

    // Asked under the name it will be stored as: trimmed.
    expect(held.onCreateOption).toHaveBeenCalledExactlyOnceWith('knows_ego');
    held.answerWith({ status: 'created' });
    await waitFor(() => expect(popupIsOpen()).toBe(false));
    expect(notice()).toBeEmptyDOMElement();
    // A create is not a choice made in the list.
    expect(control.onSelectExisting).not.toHaveBeenCalled();
  });

  it('offers nothing to create for a name the list already has, in any case', async () => {
    const control = mountControl({
      onCreateOption: () => Promise.resolve({ status: 'created' }),
    });
    const popup = await control.open();

    await typeIn(control, popup, 'Married');
    expect(findCreateRow(popup)).toBeNull();

    // An unavailable attribute's name is taken too: it is in the list.
    await control.user.clear(attributeSearchBox(popup));
    await typeIn(control, popup, 'AGE');
    expect(findCreateRow(popup)).toBeNull();
  });

  it.each([
    ['home', 'this type already has an attribute called that'],
    [
      'home_x',
      'The export already has a column called “home_x” for the position of the layout attribute “home”. Choose a different name.',
    ],
  ])(
    'turns the row off for %j, with the reason, and creates nothing',
    async (name, reason) => {
      const onCreateOption = vi.fn(() =>
        Promise.resolve<CreateOptionOutcome>({ status: 'created' }),
      );
      const control = mountControl({ onCreateOption });
      const popup = await control.open();

      await typeIn(control, popup, name);

      const row = within(popup).getByRole('option', {
        name: `An attribute cannot be named “${name}”`,
      });
      expect(row).toHaveAttribute('aria-disabled', 'true');
      expect(row).toHaveAccessibleDescription(reason);

      await control.user.click(row);
      await control.user.keyboard('{Enter}');
      expect(onCreateOption).not.toHaveBeenCalled();
      expect(popupIsOpen()).toBe(true);
    },
  );

  it('says what it is creating while the codebook is answering, and holds every row', async () => {
    const held = createHeldInHand();
    const control = mountControl({ onCreateOption: held.onCreateOption });
    const popup = await control.open();
    await typeIn(control, popup, 'marr');

    await control.user.click(createRowOf(popup));

    const busy = within(popup).getByRole('option', {
      name: 'Creating “marr”…',
    });
    expect(busy).toHaveAttribute('aria-disabled', 'true');
    expect(optionNamed(popup, 'married')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    // Neither a second choice nor a dismissal is taken while it waits.
    await control.user.click(optionNamed(popup, 'married'));
    await control.user.keyboard('{Escape}');
    expect(popupIsOpen()).toBe(true);
    expect(control.onChange).not.toHaveBeenCalled();
    expect(held.onCreateOption).toHaveBeenCalledOnce();

    held.answerWith({ status: 'created' });
    await waitFor(() => expect(popupIsOpen()).toBe(false));
  });

  it('keeps the list open on a refused name, with the reason on the create row', async () => {
    const held = createHeldInHand();
    const control = mountControl({ onCreateOption: held.onCreateOption });
    const popup = await control.open();
    await typeIn(control, popup, 'knows_ego');
    await control.user.click(createRowOf(popup));

    held.answerWith({
      status: 'refused',
      message: 'Robin is currently editing a section needed for this change.',
    });

    await waitFor(() =>
      expect(createRowOf(popup)).toHaveAccessibleDescription(
        'Robin is currently editing a section needed for this change.',
      ),
    );
    expect(createRowOf(popup)).toHaveAccessibleName('Create “knows_ego”');
    expect(createRowOf(popup)).toHaveAttribute('data-create-state', 'refused');
    expect(attributeSearchBox(popup)).toHaveValue('knows_ego');
    expect(notice()).toBeEmptyDOMElement();

    // The reason is about that name, and goes as soon as the name changes.
    await typeIn(control, popup, '_2');
    expect(createRowOf(popup)).toHaveAccessibleDescription('New attribute');
  });

  it('keeps the list open on a refusal that gives no reason', async () => {
    const held = createHeldInHand();
    const control = mountControl({ onCreateOption: held.onCreateOption });
    const popup = await control.open();
    await typeIn(control, popup, 'knows_ego');
    await control.user.click(createRowOf(popup));

    held.answerWith({ status: 'refused' });

    await waitFor(() =>
      expect(createRowOf(popup)).toHaveAttribute(
        'data-create-state',
        'offered',
      ),
    );
    expect(attributeSearchBox(popup)).toHaveValue('knows_ego');
  });

  it('closes, and says so on the field, when the attribute was created and nothing took it', async () => {
    const held = createHeldInHand();
    const control = mountControl({ onCreateOption: held.onCreateOption });
    const popup = await control.open();
    await typeIn(control, popup, 'knows_ego');
    await control.user.click(createRowOf(popup));

    held.answerWith({ status: 'unassigned' });

    await waitFor(() => expect(popupIsOpen()).toBe(false));
    expect(notice()).toHaveTextContent(
      '“knows_ego” was added to the codebook, but it has not been selected here.',
    );
  });

  it('closes, and says the create failed, when the caller throws instead of answering', async () => {
    const held = createHeldInHand();
    const control = mountControl({ onCreateOption: held.onCreateOption });
    const popup = await control.open();
    await typeIn(control, popup, 'knows_ego');
    await control.user.click(createRowOf(popup));

    held.throwFrom(new Error('the host refused the commit'));

    await waitFor(() => expect(popupIsOpen()).toBe(false));
    expect(notice()).toHaveTextContent(
      'This attribute could not be created, so nothing was changed. Try again.',
    );
  });

  it('takes the notice down when the next create is asked for', async () => {
    const held = createHeldInHand();
    const control = mountControl({ onCreateOption: held.onCreateOption });
    let popup = await control.open();
    await typeIn(control, popup, 'knows_ego');
    await control.user.click(createRowOf(popup));
    held.answerWith({ status: 'unassigned' });
    await waitFor(() => expect(notice()).not.toBeEmptyDOMElement());

    popup = await control.open();
    await typeIn(control, popup, 'knows_alter');
    await control.user.click(createRowOf(popup));

    expect(notice()).toBeEmptyDOMElement();
    held.answerWith({ status: 'created' });
    await waitFor(() => expect(popupIsOpen()).toBe(false));
  });
});

describe('a field that stops taking answers', () => {
  it.each([
    ['read-only', { readOnly: true }],
    ['disabled', { disabled: true }],
  ] as const)('cannot be opened while %s', async (_, locked) => {
    const control = mountControl(locked);

    expect(control.trigger()).toHaveAttribute(
      'readOnly' in locked ? 'aria-readonly' : 'aria-disabled',
      'true',
    );
    await control.user.click(control.trigger());
    expect(popupIsOpen()).toBe(false);
  });

  /**
   * A save refused because someone else holds the stage leaves the form
   * mounted and every field in it disabled; a list left open over it would
   * offer choices the host only refuses.
   */
  it('closes its list when the field turns read-only under it', async () => {
    const onCreateOption = vi.fn(() =>
      Promise.resolve<CreateOptionOutcome>({ status: 'created' }),
    );
    const control = mountControl({ onCreateOption });
    const popup = await control.open();
    await typeIn(control, popup, 'knows_ego');

    control.rerender({ onCreateOption, readOnly: true });

    await waitFor(() => expect(popupIsOpen()).toBe(false));
    expect(onCreateOption).not.toHaveBeenCalled();
  });
});

/**
 * The popup is portalled out of the field, but its React events still bubble
 * through the owner tree: the search box taking focus must not read as the
 * researcher leaving the field.
 */
describe('the picker’s blur boundary', () => {
  it('is not left while its list is open, nor when focus comes back to the select box', async () => {
    const control = mountControl();
    const popup = await control.open();
    await control.user.click(optionNamed(popup, 'married'));
    await waitFor(() => expect(control.trigger()).toHaveFocus());

    expect(control.onBlur).not.toHaveBeenCalled();

    await control.user.click(
      screen.getByRole('button', { name: 'Somewhere else' }),
    );
    expect(control.onBlur).toHaveBeenCalledOnce();
  });

  it('is left when the open list is dismissed by clicking another control', async () => {
    const control = mountControl();
    await control.open();
    await control.user.click(
      screen.getByRole('button', { name: 'Somewhere else' }),
    );

    await waitFor(() => expect(popupIsOpen()).toBe(false));
    // At least once: the search box and the select box can each report the
    // departure, and a second blur only marks the field touched again.
    expect(control.onBlur).toHaveBeenCalled();
  });
});

/*
 * The picker inside a stage editor: creating an attribute from a row of a
 * stage, as a section that offers stamps does.
 */

const PERSON = fixtureTypeId('node', 'person');
const ON_PERSON = { entity: 'node', typeName: 'person' } as const;
const FLAGGED = fixtureVariableId(ON_PERSON, 'flagged');
const SUBJECT: CodebookSubject = { entity: 'node', type: PERSON };
const PERSON_SECTION = sectionId({ kind: 'codebookNode', typeId: PERSON });
const NO_VARIABLES: ReadonlySet<string> = new Set();
const ROW_PICKER = 'Create or select an attribute';
const DIRECT_PICKER = 'Attribute this question records';

// Rows know nothing about what any control takes, so the picker reaches them
// as an open-record renderer — adapted once, exactly as a section does it.
const VariablePicker = VariablePickerField as ComponentType<
  Record<string, unknown>
>;

/**
 * What the HOST decides about an attribute created from a row: which codebook
 * section it lands in, and what it is created as.
 */
type CreateAs = Readonly<{
  into: CodebookSubject | undefined;
  draft: Readonly<{ type: VariableType; component?: string }>;
}>;

const STAMPED: CreateAs = {
  into: SUBJECT,
  draft: { type: 'boolean', component: 'Toggle' },
};

function StampedAttributes({
  createAs = STAMPED,
  fieldName = 'additionalAttributes',
}: Readonly<{ createAs?: CreateAs; fieldName?: string }>) {
  const { into, draft } = createAs;
  const protocolContext = useProtocolContext();
  const createVariable = useCreateCodebookVariable(into);
  const [problem, setProblem] = useState<string | undefined>(undefined);

  const variableOptions = useMemo(
    () =>
      Object.entries(variablesForSubject(protocolContext, SUBJECT)).map(
        ([id, variable]) => ({
          value: id,
          label: variable.name,
          type: variable.type,
        }),
      ),
    [protocolContext],
  );

  const onCreateVariable = useCallback(
    async (variableName: string): Promise<CreateAttributeOutcome> => {
      const outcome = await createVariable({ name: variableName, ...draft });
      if (outcome.status === 'refused') {
        setProblem(outcome.message);
        return { status: 'refused', message: outcome.message };
      }
      setProblem(undefined);
      return { status: 'created', variableId: outcome.variableId };
    },
    [createVariable, draft],
  );

  return (
    <Section title="Additional attributes">
      <Field
        name={fieldName}
        label="Additional attributes"
        component={AssignAttributes}
        subject={SUBJECT}
        variableOptions={variableOptions}
        variablePickerComponent={VariablePicker}
        onCreateVariable={onCreateVariable}
        draftValidatedVariables={NO_VARIABLES}
        committedVariableIds={NO_VARIABLES}
      />
      {problem !== undefined && (
        <Alert variant="destructive">
          <AlertDescription>{problem}</AlertDescription>
        </Alert>
      )}
    </Section>
  );
}

/**
 * Where a stage that can be SAVED keeps the attributes it stamps. The rows'
 * default field is not a field of any stage, which a save would refuse.
 */
const SAVEABLE_FIELD = 'prompts[0].additionalAttributes';

const renderRows = (
  sections: ReturnType<typeof StampedAttributes>,
  options: Pick<RenderStageEditorOptions, 'heldSections'> = {},
) =>
  renderStageEditor({
    stageId: fixtureStageId('name-generator-1'),
    sections,
    ...options,
  });

const addRow = async (harness: ReturnType<typeof renderRows>) => {
  await harness.user.click(
    await screen.findByRole('button', { name: 'Add new attribute to assign' }),
  );
};

const picker = () => attributeField(ROW_PICKER);

/** The attribute the row now names, as the picker states it. */
const heldVariableName = () =>
  attributeTrigger(picker())
    .querySelector('data[value]')
    ?.getAttribute('value') ?? undefined;

const personVariableNames = (
  harness: ReturnType<typeof renderStageEditor>,
  codebook: 'host' | 'editor' = 'host',
) => {
  const variables = (
    codebook === 'host' ? harness.hostCodebook() : harness.editorCodebook()
  ).node?.[PERSON]?.variables;
  if (variables === undefined) {
    throw new Error('the person type is gone, so it has no attributes to read');
  }
  return Object.values(variables).map((variable) => variable.name);
};

describe('an attribute created from a stage row', () => {
  /**
   * Inside a stage editor the new attribute is part of the stage's draft: the
   * editor reads it at once, and the protocol has it only once the stage is
   * saved.
   */
  it('is selected, held with the stage, and written when the stage is saved', async () => {
    const harness = renderRows(
      <StampedAttributes fieldName={SAVEABLE_FIELD} />,
    );
    await addRow(harness);

    await inventAttribute(harness.user, picker(), 'nominated_early');

    await waitFor(() => expect(popupIsOpen()).toBe(false));
    expect(heldVariableName()).toBe('nominated_early');
    expect(Object.keys(harness.stagedCodebook())).toEqual([PERSON_SECTION]);
    expect(personVariableNames(harness, 'editor')).toContain('nominated_early');
    expect(personVariableNames(harness)).not.toContain('nominated_early');

    await harness.user.click(screen.getByRole('radio', { name: 'True' }));
    await harness.submit();

    expect(personVariableNames(harness)).toContain('nominated_early');
  });

  it('is dropped with a cancelled stage', async () => {
    const harness = renderRows(<StampedAttributes />);
    await addRow(harness);

    await inventAttribute(harness.user, picker(), 'nominated_early');
    await waitFor(() => expect(popupIsOpen()).toBe(false));
    await harness.cancel();

    expect(
      Object.values(
        harness.host.store.read(PERSON_SECTION).document.variables ?? {},
      ).map((variable) =>
        typeof variable === 'object' && variable !== null
          ? Reflect.get(variable, 'name')
          : undefined,
      ),
    ).not.toContain('nominated_early');
  });

  /**
   * Nothing is locked while the attribute is only held in the stage draft, so
   * the refusal comes when the stage is SAVED, which has to lock the person
   * type. It names the holder, and the attribute stays held for a retry.
   */
  it('stays held when the stage save is refused, naming the holder', async () => {
    const harness = renderRows(
      <StampedAttributes fieldName={SAVEABLE_FIELD} />,
      { heldSections: [{ sectionId: PERSON_SECTION, displayName: 'Robin' }] },
    );
    await addRow(harness);

    await inventAttribute(harness.user, picker(), 'nominated_early');
    await waitFor(() => expect(popupIsOpen()).toBe(false));
    await harness.user.click(screen.getByRole('radio', { name: 'True' }));

    expect(await harness.submit()).toBeNull();
    expect(
      await screen.findByText(
        'Robin is currently editing a section needed for this change.',
      ),
    ).toBeInTheDocument();
    expect(personVariableNames(harness)).not.toContain('nominated_early');
    expect(personVariableNames(harness, 'editor')).toContain('nominated_early');
  });

  it('keeps the list open on a name the codebook refused, with the reason', async () => {
    const harness = renderRows(
      <StampedAttributes
        createAs={{
          into: SUBJECT,
          draft: { type: 'text', component: 'DatePicker' },
        }}
      />,
    );
    await addRow(harness);

    const popup = await inventAttribute(
      harness.user,
      picker(),
      'nominated_early',
    );

    await waitFor(() =>
      expect(createRowOf(popup)).toHaveAccessibleDescription(
        'This attribute cannot be collected with that input control.',
      ),
    );
    expect(attributeSearchBox(popup)).toHaveValue('nominated_early');
    expect(heldVariableName()).toBeUndefined();
  });
});

describe('the attribute picker, read in Spanish', () => {
  const renderInSpanish = (createAs?: CreateAs) =>
    renderStageEditor({
      stageId: fixtureStageId('name-generator-1'),
      locale: 'es',
      sections:
        createAs === undefined ? (
          <StampedAttributes />
        ) : (
          <StampedAttributes createAs={createAs} />
        ),
    });

  const openInSpanish = async (harness: ReturnType<typeof renderInSpanish>) => {
    await harness.user.click(
      await screen.findByRole('button', {
        name: 'Añadir un nuevo atributo para asignar',
      }),
    );
    return openAttributePicker(
      harness.user,
      attributeField('Crear o seleccionar un atributo'),
    );
  };

  /** Asks for an attribute, and reads back the reason that it was refused. */
  const refusalFor = async (
    harness: ReturnType<typeof renderInSpanish>,
    attributeName: string,
  ) => {
    const popup = await openInSpanish(harness);
    await harness.user.type(attributeSearchBox(popup), attributeName);
    await harness.user.click(createRowOf(popup));
    await waitFor(() =>
      expect(createRowOf(popup)).toHaveAttribute(
        'data-create-state',
        'refused',
      ),
    );
    return createRowOf(popup);
  };

  it('names the list after the field, and its search box, in Spanish', async () => {
    const harness = renderInSpanish();
    const popup = await openInSpanish(harness);

    expect(popup).toHaveAccessibleName('Crear o seleccionar un atributo');
    expect(attributeSearchBox(popup)).toHaveAttribute(
      'placeholder',
      'Busca o crea un atributo…',
    );
  });

  it('says in Spanish why a name cannot be used, before asking', async () => {
    const harness = renderInSpanish();
    const popup = await openInSpanish(harness);

    // The person type's layout attribute `layout` exports its position to
    // `layout_x`. An attribute the type already has by a name is listed
    // instead, so the export column is what still turns a name away here.
    await harness.user.type(attributeSearchBox(popup), 'layout_x');

    expect(createRowOf(popup)).toHaveAttribute('aria-disabled', 'true');
    expect(createRowOf(popup)).toHaveAccessibleDescription(
      'La exportación ya tiene una columna llamada «layout_x» para la posición del atributo de disposición «layout». Elige otro nombre.',
    );
  });

  it('says in Spanish that the stage is about nothing yet', async () => {
    const harness = renderInSpanish({
      into: undefined,
      draft: { type: 'boolean', component: 'Toggle' },
    });

    expect(
      await refusalFor(harness, 'nominado_pronto'),
    ).toHaveAccessibleDescription(
      'Elige con qué trabaja esta etapa antes de crear un atributo.',
    );
  });

  it('says in Spanish that the type it would be added to has gone', async () => {
    const harness = renderInSpanish({
      into: { entity: 'node', type: testTypeId('un-tipo-que-no-existe') },
      draft: { type: 'boolean', component: 'Toggle' },
    });

    expect(
      await refusalFor(harness, 'nominado_pronto'),
    ).toHaveAccessibleDescription(
      'Esta etapa trabaja con algo que el libro de códigos ya no contiene, así que no se ha guardado nada. Elige de nuevo con qué trabaja.',
    );
  });

  it('says in Spanish that nothing was created, when there is nothing else to say', async () => {
    const harness = renderInSpanish({
      into: SUBJECT,
      draft: { type: 'categorical', component: 'CheckboxGroup' },
    });

    expect(
      await refusalFor(harness, 'nominado_pronto'),
    ).toHaveAccessibleDescription(
      'No se pudo crear este atributo, así que no se cambió nada. Inténtalo de nuevo.',
    );
  });

  it('says in Spanish that the control cannot collect this kind of answer', async () => {
    const harness = renderInSpanish({
      into: SUBJECT,
      draft: { type: 'text', component: 'DatePicker' },
    });

    expect(
      await refusalFor(harness, 'nominado_pronto'),
    ).toHaveAccessibleDescription(
      'Este atributo no se puede recoger con ese control de entrada.',
    );
  });
});

/**
 * A required picker inside a stage editor, and whether the form thinks the
 * researcher has LEFT it.
 */
describe('a required picker in a stage editor', () => {
  const REQUIRED = 'Choose an attribute.';
  const FIELD_NAME = 'nodeConfig.egoAttribute';

  function BlurredProbe() {
    const { storeApi } = useStageEditorForm();
    const blurred = useSyncExternalStore(
      useCallback(
        (onStoreChange: () => void) => storeApi.subscribe(onStoreChange),
        [storeApi],
      ),
      useCallback(
        () =>
          storeApi.getState().getFieldState(FIELD_NAME)?.meta.isBlurred ===
          true,
        [storeApi],
      ),
    );
    return (
      <output aria-label="Left the attribute field" data-blurred={blurred}>
        {blurred ? 'left' : 'in it'}
      </output>
    );
  }

  function RequiredPicker() {
    return (
      <Section title="What this question records">
        <Field<typeof VariablePickerField>
          name={FIELD_NAME}
          component={VariablePickerField}
          label={DIRECT_PICKER}
          options={[{ value: FLAGGED, label: 'flagged', type: 'boolean' }]}
          required={REQUIRED}
        />
        <BlurredProbe />
      </Section>
    );
  }

  const probe = () =>
    screen.getByRole('status', { name: 'Left the attribute field' });

  it('does not raise the required error while the list is open', async () => {
    const harness = renderStageEditor({
      stageId: fixtureStageId('name-generator-1'),
      sections: <RequiredPicker />,
    });
    await harness.opened();
    const field = attributeField(DIRECT_PICKER);

    attributeTrigger(field).focus();
    await openAttributePicker(harness.user, field);

    expect(probe()).toHaveAttribute('data-blurred', 'false');
    expect(screen.queryByText(REQUIRED)).toBeNull();
  });

  /**
   * A refused save sends the researcher to the select box, the control that
   * resolves the error; choosing an attribute clears it.
   */
  it('takes focus after a refused save, and clears the error once an attribute is chosen', async () => {
    const harness = renderStageEditor({
      stageId: fixtureStageId('name-generator-1'),
      sections: <RequiredPicker />,
    });
    await harness.opened();
    const field = attributeField(DIRECT_PICKER);

    expect(await harness.submit()).toBeNull();
    expect(await screen.findByText(REQUIRED)).toBeVisible();
    await waitFor(() => expect(attributeTrigger(field)).toHaveFocus());

    await chooseAttribute(harness.user, field, 'flagged');

    await waitFor(() => expect(screen.queryByText(REQUIRED)).toBeNull());
    expect(attributeTrigger(field)).toHaveAccessibleName(
      `${DIRECT_PICKER} flagged`,
    );
  });

  /**
   * A picker inside a row is different: its nearest field is unconnected,
   * while the next connected ancestor owns the whole list. Propagating there
   * would reject a row the researcher has not finished filling in.
   */
  it('does not blur the owning list when a row’s picker is answered', async () => {
    const harness = renderRows(<StampedAttributes />);
    await addRow(harness);

    await chooseAttribute(harness.user, picker(), 'flagged');

    expect(heldVariableName()).toBe('flagged');
    expect(
      screen.queryByText('Choose what this attribute is set to.'),
    ).toBeNull();
  });
});

describe('how the select box shows a new choice', () => {
  /**
   * The field holding its own value, with a way to change it from outside —
   * as a form reset, an undo or another stage's values arriving do — and a
   * create that adds the attribute and gives it to the field before it
   * answers, as the stage editor's create does.
   */
  const mountWithOutsideChanges = (initialValue?: string) => {
    let changeFromOutside: (next: string | undefined) => void = () => {};

    function Harness() {
      const [value, setValue] = useState(initialValue);
      const [options, setOptions] = useState(OPTIONS);
      changeFromOutside = setValue;
      return (
        <>
          <label id="picker-label" htmlFor="picker">
            Attribute to highlight
          </label>
          <VariablePickerField
            id="picker"
            name="highlight"
            aria-labelledby="picker-label"
            options={options}
            value={value}
            onChange={setValue}
            nameScope={SCOPE}
            newVariableType="boolean"
            onCreateOption={async (variableName) => {
              setOptions((current) => [
                ...current,
                { value: 'v-new', label: variableName, type: 'boolean' },
              ]);
              setValue('v-new');
              return { status: 'created' };
            }}
          />
        </>
      );
    }

    const view = render(<Harness />);
    const user = userEvent.setup();
    const field = view.container;
    return {
      user,
      field,
      rerender: () => view.rerender(<Harness />),
      changeFromOutside: (next: string | undefined) =>
        act(() => changeFromOutside(next)),
      trigger: () => attributeTrigger(field),
    };
  };

  /** The trigger's slot showing this attribute's pill. */
  const slotShowing = (trigger: HTMLElement, attributeName: string) => {
    const pill = trigger.querySelector(`data[value="${attributeName}"]`);
    const slot = pill?.parentElement;
    if (slot === null || slot === undefined) {
      throw new Error(`The trigger does not show “${attributeName}”.`);
    }
    return slot;
  };
  const arrivedByChoice = (trigger: HTMLElement, attributeName: string) =>
    slotShowing(trigger, attributeName).hasAttribute('data-animated-arrival');
  const confirmation = (trigger: HTMLElement) =>
    trigger.querySelector('[data-choice-confirmation]');

  it('draws the value held when the field mounts as it is', () => {
    const control = mountWithOutsideChanges('v-married');

    expect(arrivedByChoice(control.trigger(), 'married')).toBe(false);
    expect(confirmation(control.trigger())).toBeNull();
  });

  it('shows the arrival of an attribute chosen in an empty field, and of one chosen over another', async () => {
    const control = mountWithOutsideChanges();

    await chooseAttribute(control.user, control.field, 'married');
    expect(arrivedByChoice(control.trigger(), 'married')).toBe(true);
    const first = confirmation(control.trigger());
    expect(first).not.toBeNull();

    await chooseAttribute(control.user, control.field, 'close_friend');
    expect(arrivedByChoice(control.trigger(), 'close_friend')).toBe(true);
    // A new confirmation for the new choice, rather than the old one left
    // in place.
    const second = confirmation(control.trigger());
    expect(second).not.toBeNull();
    expect(second).not.toBe(first);
  });

  it('shows the arrival of an attribute created here', async () => {
    const control = mountWithOutsideChanges('v-married');

    await inventAttribute(control.user, control.field, 'knows_well');
    await waitFor(() => expect(popupIsOpen()).toBe(false));

    expect(arrivedByChoice(control.trigger(), 'knows_well')).toBe(true);
    expect(confirmation(control.trigger())).not.toBeNull();
  });

  it('does not replay on a re-render with the same value, and draws a value changed from outside as it is', async () => {
    const control = mountWithOutsideChanges('v-married');
    await chooseAttribute(control.user, control.field, 'close_friend');
    const slot = slotShowing(control.trigger(), 'close_friend');
    const shownConfirmation = confirmation(control.trigger());

    control.rerender();
    control.changeFromOutside('v-close');

    // The same elements, so nothing mounted again to play a second time.
    expect(slotShowing(control.trigger(), 'close_friend')).toBe(slot);
    expect(confirmation(control.trigger())).toBe(shownConfirmation);

    control.changeFromOutside('v-married');
    // The value replaced from outside is hidden at once, not faded out
    // under the new one.
    expect(slotShowing(control.trigger(), 'close_friend')).toHaveClass(
      'invisible',
    );
    expect(arrivedByChoice(control.trigger(), 'married')).toBe(false);
    expect(confirmation(control.trigger())).toBeNull();

    // Back from outside to the attribute that was once chosen here: still a
    // change from outside.
    control.changeFromOutside('v-close');
    expect(arrivedByChoice(control.trigger(), 'close_friend')).toBe(false);
    expect(confirmation(control.trigger())).toBeNull();
  });

  it('hides the value that is leaving from the select box’s name while the new one arrives', async () => {
    const control = mountWithOutsideChanges('v-married');

    await withAnimationsEnabled(async () => {
      await chooseAttribute(control.user, control.field, 'close_friend');
      // The old pill is still drawn, on its way out, and is not part of the
      // name.
      expect(
        control.trigger().querySelector('data[value="married"]'),
      ).not.toBeNull();
      expect(control.trigger()).toHaveAccessibleName(
        'Attribute to highlight close_friend',
      );
    });
  });
});
