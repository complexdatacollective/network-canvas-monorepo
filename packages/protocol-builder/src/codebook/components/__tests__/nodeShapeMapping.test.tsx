import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  asEntityAttributeReference,
  NodeDefinitionSchema,
} from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import {
  attributeField,
  chooseAttribute,
  offeredAttributes,
} from '../../../testing/attributePicker.ts';
import {
  shapeMappingIssue,
  shapeMappingVariables,
} from '../../shapeMapping.ts';
import type { CodebookWriteOutcome } from '../../writes.ts';
import CodebookEntityEditor from '../CodebookEntityEditor.tsx';

/**
 * Drawing a node type as a different shape depending on one of its attributes:
 * the feature Architect's `TypeEditor` carried and the package's entity dialog
 * had not.
 *
 * Driven through the editor rather than through the fields component, because
 * the whole point of the mapping is what reaches the saved document — a
 * control that looks right and writes `shape.dynamic` the runtime cannot read
 * is the failure worth guarding.
 */

const SUBJECT = { entity: 'node', type: 'person' } as const;
const PERSON_SECTION = sectionId({ kind: 'codebookNode', typeId: 'person' });

const VARIABLES: Record<string, unknown> = {
  ethnicity: {
    name: 'Ethnicity',
    type: 'categorical',
    component: 'CheckboxGroup',
    options: [
      { label: 'Asian', value: 'asian' },
      { label: 'White', value: 'white' },
    ],
  },
  alive: { name: 'Alive', type: 'boolean', component: 'Toggle' },
  age: {
    name: 'Age',
    type: 'number',
    component: 'Number',
    validation: { minValue: 0, maxValue: 120 },
  },
  closeness: {
    name: 'Closeness',
    type: 'scalar',
    component: 'VisualAnalogScale',
  },
  notes: { name: 'Notes', type: 'text', component: 'Text' },
};

const person = (shape: Record<string, unknown>): SectionDoc => ({
  name: 'Person',
  color: 'node-color-seq-1',
  icon: 'add-a-person',
  shape,
  variables: VARIABLES,
});

const PERSON = person({ default: 'circle' });

const applied = async (): Promise<CodebookWriteOutcome> => ({
  status: 'applied',
  sectionId: PERSON_SECTION,
});

type SubmitEntity = (document: SectionDoc) => Promise<CodebookWriteOutcome>;

const renderEditor = (
  onSubmit: SubmitEntity,
  document: SectionDoc = PERSON,
) => {
  render(
    <CodebookEntityEditor
      mode="update"
      sessionKey="mapping"
      subject={SUBJECT}
      initialDraft={document}
      authoritativeDocument={document}
      existingEntityNames={[]}
      onSubmit={onSubmit}
    />,
  );
  return userEvent.setup();
};

const toggle = () =>
  screen.getByRole('switch', { name: 'Map attribute to shape' });

const save = () => screen.getByRole('button', { name: 'Save entity' });

const shapeOf = (document: SectionDoc): Record<string, unknown> =>
  document.shape as Record<string, unknown>;

const dynamicOf = (onSubmit: ReturnType<typeof vi.fn<SubmitEntity>>) =>
  shapeOf(onSubmit.mock.calls[0]?.[0] as SectionDoc).dynamic;

describe('the shape mapping switch', () => {
  it('refuses a save while it is on and nothing is chosen', async () => {
    const onSubmit = vi.fn<SubmitEntity>(applied);
    const user = renderEditor(onSubmit);

    await user.click(toggle());
    await user.click(save());

    expect(
      await screen.findByText(
        'Select an attribute to map to a shape, or turn off shape mapping.',
      ),
    ).toBeVisible();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  /**
   * Switching it off has to REMOVE the key, not empty it: `shape.dynamic` is
   * optional in the schema and `{}` satisfies neither of its two variants, so
   * a mapping "cleared" to an empty record is a type the protocol refuses.
   */
  it('removes the mapping from the saved type when it is switched off', async () => {
    const onSubmit = vi.fn<SubmitEntity>(applied);
    const user = renderEditor(
      onSubmit,
      person({
        default: 'circle',
        dynamic: {
          variable: 'ethnicity',
          type: 'discrete',
          map: [{ value: 'asian', shape: 'square' }],
        },
      }),
    );

    await user.click(toggle());
    await user.click(save());

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    const shape = shapeOf(onSubmit.mock.calls[0]?.[0] as SectionDoc);
    expect(Object.hasOwn(shape, 'dynamic')).toBe(false);
    expect(shape).toEqual({ default: 'circle' });
  });

  /**
   * And switching it back on starts from nothing. A mapping the researcher
   * deliberately deleted must not come back because they changed their mind
   * about the feature.
   */
  it('does not resurrect a deleted mapping when it is switched on again', async () => {
    const onSubmit = vi.fn<SubmitEntity>(applied);
    const user = renderEditor(
      onSubmit,
      person({
        default: 'circle',
        dynamic: {
          variable: 'ethnicity',
          type: 'discrete',
          map: [{ value: 'asian', shape: 'square' }],
        },
      }),
    );

    await user.click(toggle());
    await user.click(toggle());

    expect(
      screen.queryByRole('combobox', { name: 'Shape for Asian' }),
    ).toBeNull();

    await user.click(save());
    expect(
      await screen.findByText(
        'Select an attribute to map to a shape, or turn off shape mapping.',
      ),
    ).toBeVisible();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('the attribute a shape can follow', () => {
  it('offers only the answers a shape can be chosen from', async () => {
    const onSubmit = vi.fn<SubmitEntity>(applied);
    const user = renderEditor(onSubmit);
    await user.click(toggle());

    // The picker lists what it is offered by name; what matters here is that
    // the text attribute is not among them.
    expect(await offeredAttributes(user, attributeField('Attribute'))).toEqual([
      'age',
      'alive',
      'closeness',
      'ethnicity',
    ]);
  });

  it('replaces the whole mapping when a different kind of attribute is chosen', async () => {
    const onSubmit = vi.fn<SubmitEntity>(applied);
    const user = renderEditor(onSubmit);
    await user.click(toggle());

    await chooseAttribute(user, attributeField('Attribute'), 'Age');
    expect(screen.getByText('Thresholds')).toBeVisible();

    await chooseAttribute(user, attributeField('Attribute'), 'Ethnicity');
    expect(screen.queryByText('Thresholds')).toBeNull();
    expect(screen.getByText('Shape for each value')).toBeVisible();

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Shape for Asian' }),
      'square',
    );
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Shape for White' }),
      'diamond',
    );
    await user.click(save());

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(dynamicOf(onSubmit)).toEqual({
      variable: 'ethnicity',
      type: 'discrete',
      map: [
        { value: 'asian', shape: 'square' },
        { value: 'white', shape: 'diamond' },
      ],
    });
  });
});

describe('a mapping that follows one answer at a time', () => {
  /**
   * A yes/no attribute drawn with a switch carries no labels of its own, so
   * the two answers are named here — and what is WRITTEN is the raw boolean
   * the interview runtime compares an answer against, not its name.
   */
  it('offers a yes/no attribute’s two answers and writes raw booleans', async () => {
    const onSubmit = vi.fn<SubmitEntity>(applied);
    const user = renderEditor(onSubmit);
    await user.click(toggle());
    await chooseAttribute(user, attributeField('Attribute'), 'Alive');

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Shape for True' }),
      'circle',
    );
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Shape for False' }),
      'diamond',
    );
    await user.click(save());

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(dynamicOf(onSubmit)).toEqual({
      variable: 'alive',
      type: 'discrete',
      map: [
        { value: true, shape: 'circle' },
        { value: false, shape: 'diamond' },
      ],
    });
  });

  it('says so while any answer still has no shape of its own', async () => {
    const onSubmit = vi.fn<SubmitEntity>(applied);
    const user = renderEditor(onSubmit);
    await user.click(toggle());
    await chooseAttribute(user, attributeField('Attribute'), 'Ethnicity');

    const notice = 'Some values are unmapped and will use the default shape.';
    expect(screen.getByText(notice)).toBeVisible();

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Shape for Asian' }),
      'square',
    );
    expect(screen.getByText(notice)).toBeVisible();

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Shape for White' }),
      'diamond',
    );
    expect(screen.queryByText(notice)).toBeNull();
  });

  it('writes a document the protocol schema accepts', async () => {
    const onSubmit = vi.fn<SubmitEntity>(applied);
    const user = renderEditor(onSubmit);
    await user.click(toggle());
    await chooseAttribute(user, attributeField('Attribute'), 'Ethnicity');
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Shape for Asian' }),
      'square',
    );
    await user.click(save());

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(
      NodeDefinitionSchema.safeParse(onSubmit.mock.calls[0]?.[0]).success,
    ).toBe(true);
  });
});

describe('a mapping that changes shape at a threshold', () => {
  const thresholdValue = (position: number) =>
    screen.getByRole('spinbutton', { name: `Threshold ${position} value` });

  it('refuses a save until it has a threshold, and says so once', async () => {
    const onSubmit = vi.fn<SubmitEntity>(applied);
    const user = renderEditor(onSubmit);
    await user.click(toggle());
    await chooseAttribute(user, attributeField('Attribute'), 'Age');

    expect(
      screen.getByText(
        'No thresholds yet — every value uses the default shape.',
      ),
    ).toBeVisible();

    await user.click(save());

    const refusal = await screen.findAllByText(
      'Add at least one threshold, or turn off shape mapping.',
    );
    expect(refusal).toHaveLength(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  /**
   * A screen reader only announces a change to a region it was already
   * watching, so the region that carries a refusal has to be on screen before
   * there is anything to say.
   */
  it('keeps the region the refusal is announced in mounted before there is one', async () => {
    const onSubmit = vi.fn<SubmitEntity>(applied);
    const user = renderEditor(onSubmit);
    await user.click(toggle());

    const regions = document.querySelectorAll('[aria-live="polite"]');
    expect(regions.length).toBeGreaterThan(0);

    await user.click(save());
    const refusal = await screen.findByText(
      'Select an attribute to map to a shape, or turn off shape mapping.',
    );
    expect(refusal.closest('[aria-live="polite"]')).not.toBeNull();
  });

  it('stops offering another threshold once the shapes run out', async () => {
    const onSubmit = vi.fn<SubmitEntity>(applied);
    const user = renderEditor(onSubmit);
    await user.click(toggle());
    await chooseAttribute(user, attributeField('Attribute'), 'Age');

    await user.click(screen.getByRole('button', { name: 'Add threshold' }));
    await user.click(screen.getByRole('button', { name: 'Add threshold' }));

    expect(screen.getAllByRole('spinbutton')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Add threshold' })).toBeNull();
  });

  it('leaves an emptied box empty, and commits a decimal when it is left', async () => {
    const onSubmit = vi.fn<SubmitEntity>(applied);
    const user = renderEditor(onSubmit);
    await user.click(toggle());
    await chooseAttribute(user, attributeField('Attribute'), 'Age');
    await user.click(screen.getByRole('button', { name: 'Add threshold' }));

    await user.clear(thresholdValue(1));
    expect(thresholdValue(1)).toHaveValue(null);

    await user.type(thresholdValue(1), '2.5');
    await user.tab();

    expect(
      screen.getByRole('combobox', { name: 'Shape at threshold 2.5' }),
    ).toBeVisible();
  });

  it('sorts the thresholds as soon as one is left out of order', async () => {
    const onSubmit = vi.fn<SubmitEntity>(applied);
    const user = renderEditor(onSubmit);
    await user.click(toggle());
    await chooseAttribute(user, attributeField('Attribute'), 'Age');
    await user.click(screen.getByRole('button', { name: 'Add threshold' }));
    await user.clear(thresholdValue(1));
    await user.type(thresholdValue(1), '10');
    await user.tab();
    await user.click(screen.getByRole('button', { name: 'Add threshold' }));
    await user.clear(thresholdValue(2));
    await user.type(thresholdValue(2), '5');
    await user.tab();

    expect(thresholdValue(1)).toHaveValue(5);
    expect(thresholdValue(2)).toHaveValue(10);

    await user.click(save());
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(dynamicOf(onSubmit)).toEqual({
      variable: 'age',
      type: 'breakpoints',
      thresholds: [
        { value: 5, shape: 'square' },
        { value: 10, shape: 'square' },
      ],
    });
    expect(
      NodeDefinitionSchema.safeParse(onSubmit.mock.calls[0]?.[0]).success,
    ).toBe(true);
  });

  it('bounds a threshold by the attribute’s own range', async () => {
    const onSubmit = vi.fn<SubmitEntity>(applied);
    const user = renderEditor(onSubmit);
    await user.click(toggle());
    await chooseAttribute(user, attributeField('Attribute'), 'Age');
    await user.click(screen.getByRole('button', { name: 'Add threshold' }));

    expect(thresholdValue(1)).toHaveAttribute('min', '0');
    expect(thresholdValue(1)).toHaveAttribute('max', '120');
    expect(thresholdValue(1)).toHaveAttribute('step', 'any');
  });

  /**
   * A scale answer is recorded on the visual analog scale's normalised 0–1
   * range, so whole numbers are the wrong increment for it entirely.
   */
  it('bounds a scale attribute’s threshold to its normalised range', async () => {
    const onSubmit = vi.fn<SubmitEntity>(applied);
    const user = renderEditor(onSubmit);
    await user.click(toggle());
    await chooseAttribute(user, attributeField('Attribute'), 'Closeness');
    await user.click(screen.getByRole('button', { name: 'Add threshold' }));

    expect(thresholdValue(1)).toHaveAttribute('min', '0');
    expect(thresholdValue(1)).toHaveAttribute('max', '1');
    expect(thresholdValue(1)).toHaveAttribute('step', '0.1');
  });

  /**
   * The row for everything under the lowest threshold is the type's own
   * default shape, and there is nothing to decide about it.
   */
  it('shows the default shape for everything below the first threshold', async () => {
    const onSubmit = vi.fn<SubmitEntity>(applied);
    const user = renderEditor(onSubmit, person({ default: 'diamond' }));
    await user.click(toggle());
    await chooseAttribute(user, attributeField('Attribute'), 'Age');

    const row = screen.getByText('Below first threshold').closest('div');
    if (row === null) throw new Error('expected a first-threshold row');
    const shown = within(row).getByRole('combobox', { name: 'Default shape' });
    expect(shown).toHaveValue('diamond');
    expect(shown).toBeDisabled();
    expect(
      within(row).getByRole('button', {
        name: 'Below first threshold cannot be removed',
      }),
    ).toBeDisabled();
  });
});

/**
 * The one refusal the editor cannot be driven into: every change re-sorts the
 * thresholds, so a mapping that rises out of order can only reach the check
 * from a stored protocol. It is still the schema's rule, so it is still
 * refused in the package's own words rather than by a parse failure.
 */
describe('shapeMappingIssue', () => {
  const readVariables = shapeMappingVariables(PERSON.variables);

  it('refuses thresholds that do not rise', () => {
    expect(
      shapeMappingIssue(
        {
          variable: asEntityAttributeReference('age'),
          type: 'breakpoints',
          thresholds: [
            { value: 10, shape: 'square' },
            { value: 10, shape: 'diamond' },
          ],
        },
        readVariables,
      ),
    ).toBeDefined();
  });

  it('accepts a mapping that does rise', () => {
    expect(
      shapeMappingIssue(
        {
          variable: asEntityAttributeReference('age'),
          type: 'breakpoints',
          thresholds: [
            { value: 10, shape: 'square' },
            { value: 20, shape: 'diamond' },
          ],
        },
        readVariables,
      ),
    ).toBeUndefined();
  });
});

/**
 * The picker offers only the attributes a shape can follow, so a mapping that
 * names another one cannot be built here — but a stored protocol can arrive
 * carrying one, and the editor must not hand it back to the save.
 */
describe('a mapping left pointing at an attribute no shape can follow', () => {
  it('refuses the save and says which field to fix', async () => {
    const onSubmit = vi.fn<SubmitEntity>(applied);
    const user = renderEditor(
      onSubmit,
      person({
        default: 'circle',
        dynamic: {
          variable: 'notes',
          type: 'discrete',
          map: [{ value: 'anything', shape: 'square' }],
        },
      }),
    );

    // Held but not offered: the picker says so in its own words.
    expect(
      screen.getByRole('switch', { name: 'Map attribute to shape' }),
    ).toBeChecked();
    expect(await offeredAttributes(user, attributeField('Attribute'))).toEqual([
      'age',
      'alive',
      'closeness',
      'ethnicity',
    ]);

    // Through an edit that has nothing to do with the mapping, because an
    // untouched draft has nothing to save: the mapping is checked whenever the
    // type is written, not only when it is the thing being changed.
    const name = screen.getByRole('textbox', { name: 'Node type name' });
    await user.clear(name);
    await user.type(name, 'Adult');
    await user.click(save());

    expect(
      await screen.findByText(
        'Select an attribute to map to a shape, or turn off shape mapping.',
      ),
    ).toBeVisible();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
