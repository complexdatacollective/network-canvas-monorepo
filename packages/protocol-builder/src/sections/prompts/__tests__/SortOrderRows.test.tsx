import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import InputField from '@codaco/fresco-ui/form/fields/InputField';

import type { SortableProperty } from '../../../fields/sortOrderOptions.ts';
import { DialogFormField } from '../../../form/DialogForm.tsx';
import type { FinishRequest } from '../../../session.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import PromptsSection from '../../PromptsSection.tsx';
import type { RowEditorProps, RowPreviewProps } from '../../rowRenderers.tsx';
import SortOrderRows from '../SortOrderRows.tsx';

/**
 * What a person may be sorted by, as the fixture protocol's codebook defines
 * them.
 *
 * Written out rather than read from the codebook because the question here is
 * what `SortOrderRows` does with the properties it is handed; a family's own
 * section is where "which properties" is decided, and each of the two families
 * that call this component decides it differently. `layout` is included on
 * purpose: it is a real person attribute that nothing can be ordered by, so
 * its absence from the offered options is this component's filtering rather
 * than a shorter list.
 */
const PERSON_PROPERTIES: readonly SortableProperty[] = [
  { value: 'name', label: 'name', type: 'text' },
  { value: 'age', label: 'age', type: 'number' },
  { value: 'layout', label: 'layout', type: 'layout' },
];

const SORT_SWITCH = 'Sort unplaced nodes';
const ADD_RULE = 'Add a rule for the order unplaced nodes are handed over in';

/**
 * A stand-in for one family's prompt fields, holding a single sort order.
 *
 * The sociogram's shape — one `sortOrder` key on the prompt — because it is
 * the shape that has to work from a section OUTSIDE this folder, and the two
 * bin keys are already exercised by the census and bin sections that own them.
 * Everything else about the prompt is deliberately plain: a failure here
 * should be about the sort rules and nothing else.
 */
function SortOrderPromptEditor({ item }: RowEditorProps) {
  return (
    <>
      <DialogFormField
        name="text"
        label="Prompt text"
        component={InputField}
        required="Enter the question this prompt asks."
      />
      <SortOrderRows
        name="sortOrder"
        title={SORT_SWITCH}
        description="Choose the order the nodes the participant has not placed yet are handed to them in."
        label="Sort rules"
        hint="Rules are applied in order. Use the asterisk to keep the order the nodes were added in."
        addButtonLabel={ADD_RULE}
        emptyStateMessage="No rules yet, so nodes are handed over in the order they were added."
        properties={PERSON_PROPERTIES}
        committedRules={item.sortOrder}
      />
    </>
  );
}

function SortOrderPromptPreview({ item }: RowPreviewProps) {
  return <span>{typeof item.text === 'string' ? item.text : 'Empty'}</span>;
}

const sections = (
  <PromptsSection
    PromptEditor={SortOrderPromptEditor}
    PromptPreview={SortOrderPromptPreview}
  />
);

const RULE = { property: 'age', direction: 'desc' };

/**
 * A sociogram whose first prompt already has a sort order.
 *
 * Built rather than opened from the fixture: the fixture's sociogram prompts
 * carry no `sortOrder`, and a prompt that already has rules is exactly the
 * case a group defaulting closed would quietly destroy. The rest of the prompt
 * is the fixture's own, so what saves here is a stage the protocol schema
 * accepts.
 */
const seededWith = (rules: readonly Record<string, unknown>[]) => ({
  stage: {
    id: 'sociogram-1',
    type: 'Sociogram' as const,
    fields: {
      label: 'Sociogram',
      subject: { entity: 'node', type: 'person' },
      background: { concentricCircles: 4, skewedTowardCenter: true },
      behaviours: { automaticLayout: true },
      prompts: [
        {
          id: 'sociogram-prompt-1',
          text: 'Place the people who know each other close together',
          layout: { layoutVariable: 'layout' },
          sortOrder: rules,
        },
      ],
    },
  },
  sections,
});

const seededWithARule = () => seededWith([RULE]);

/**
 * A sort rule left pointing at an attribute a collaborator has since deleted.
 *
 * `SortRuleSchema.property` is `existence: 'unchecked'`, so the protocol keeps
 * this stage rather than refusing it — which is right, because deleting an
 * attribute must not make somebody else's stage unopenable. The editor is what
 * has to say the reference is dangling, and it is `SortOrderRows` that has to
 * say it, so that every family holding a sort order says the same thing.
 */
const ORPHANED_PROPERTY = 'nickname';

const ORPHANED_OPTION_LABEL = `${ORPHANED_PROPERTY} — this attribute is no longer in the codebook`;

const MISSING_ATTRIBUTE_MESSAGE =
  'This rule points at an attribute no longer in the codebook. Choose another or delete the rule.';

const seededWithAnOrphanedRule = () =>
  seededWith([{ property: ORPHANED_PROPERTY, direction: 'asc' }]);

/**
 * The prompt a save actually committed.
 *
 * Throws on a refused save rather than answering with an empty row: the claim
 * below is that a key is GONE, and a refusal read as an empty prompt would
 * satisfy that claim without the stage ever having been saved.
 */
function savedPrompt(request: FinishRequest | null): Record<string, unknown> {
  if (request === null) {
    throw new Error('The stage did not save, so nothing was committed.');
  }
  const [first] = Array.isArray(request.stageDocument.prompts)
    ? request.stageDocument.prompts
    : [];
  if (typeof first !== 'object' || first === null) {
    throw new Error('The saved stage has no prompt to read.');
  }
  return first as Record<string, unknown>;
}

describe('the sort order a prompt carries', () => {
  it('opens switched on, holding the rule the prompt was saved with', async () => {
    const harness = renderStageEditor(seededWithARule());

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    await screen.findByRole('dialog');

    await waitFor(() =>
      expect(screen.getByRole('switch', { name: SORT_SWITCH })).toBeChecked(),
    );
    expect(screen.getByRole('combobox', { name: 'Property' })).toHaveValue(
      'age',
    );
    expect(screen.getByRole('combobox', { name: 'Direction' })).toHaveValue(
      'desc',
    );
  });

  it('offers the order nodes were added in, and every property but the layout', async () => {
    const harness = renderStageEditor(seededWithARule());

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    const property = await screen.findByRole('combobox', { name: 'Property' });

    expect(
      [...property.querySelectorAll('option')]
        .map((option) => option.value)
        .filter((value) => value !== ''),
      // `layout` holds a node's position on the canvas, which is not a value
      // one node can be ordered ahead of another by.
    ).toEqual(['*', 'name', 'age']);
    // The property this rule already uses stays on offer, disabled, so a
    // second rule cannot repeat it.
    expect(
      [...property.querySelectorAll('option')].find(
        (option) => option.value === 'age',
      ),
    ).toBeDisabled();
  });

  it('saves a rule the researcher switched the group on to write', async () => {
    const harness = renderStageEditor({ stageId: 'sociogram-1', sections });

    await harness.user.click(
      screen.getAllByRole('button', { name: 'Edit prompt' })[0]!,
    );
    await screen.findByRole('dialog');
    // The fixture's prompt has no rules, so the group opens closed and there
    // is nothing to add a rule to until it is switched on.
    expect(screen.getByRole('switch', { name: SORT_SWITCH })).not.toBeChecked();

    await harness.user.click(screen.getByRole('switch', { name: SORT_SWITCH }));
    await harness.user.click(
      await screen.findByRole('button', { name: ADD_RULE }),
    );
    await harness.user.selectOptions(
      await screen.findByRole('combobox', { name: 'Property' }),
      'name',
    );
    await harness.user.selectOptions(
      screen.getByRole('combobox', { name: 'Direction' }),
      'asc',
    );
    await harness.user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const saved = savedPrompt(await harness.submit());
    expect(saved.sortOrder).toEqual([{ property: 'name', direction: 'asc' }]);
    // The rule went into the prompt it was written in, and changed nothing
    // else the prompt was holding.
    expect(saved.edges).toEqual({ display: ['knows'], create: 'knows' });
    expect(saved.id).toBe('sociogram-prompt-1');
  });

  it('drops the key when the researcher switches the group off', async () => {
    const harness = renderStageEditor(seededWithARule());

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: SORT_SWITCH })).toBeChecked(),
    );

    await harness.user.click(screen.getByRole('switch', { name: SORT_SWITCH }));
    await harness.user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const saved = savedPrompt(await harness.submit());
    // Not an empty list: `sortOrder` is optional in the prompt schema, and a
    // prompt that sorts by nothing has to say so by not carrying the key at
    // all. An empty array would round-trip as a configured-but-empty order.
    expect(Object.hasOwn(saved, 'sortOrder')).toBe(false);
    expect(saved.text).toBe(
      'Place the people who know each other close together',
    );
  });
});

/**
 * A rule whose attribute has been deleted still has to be readable, fixable,
 * and impossible to save as it stands.
 *
 * Handled by `SortOrderRows` rather than by any one family: the schema keeps
 * such a rule on purpose, so every family holding a sort order inherits the
 * same dangling reference.
 */
describe('a sort rule pointing at an attribute the codebook has lost', () => {
  const openPrompt = async (harness: {
    user: { click(element: Element): Promise<void> };
  }) => {
    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    await screen.findByRole('dialog');
  };

  it('shows the rule, naming the attribute it can no longer find', async () => {
    const harness = renderStageEditor(seededWithAnOrphanedRule());

    await openPrompt(harness);

    // The cell renders from the option list, so an id no option carries leaves
    // the control blank while the value behind it is still there and still
    // saved. The researcher then has an empty required cell and no way to find
    // out what it points at.
    const property = await screen.findByRole('combobox', { name: 'Property' });
    expect(property).toHaveValue(ORPHANED_PROPERTY);
    expect(
      within(property).getByRole('option', { name: ORPHANED_OPTION_LABEL }),
    ).toBeDisabled();
  });

  /**
   * The half a family could not do for itself.
   *
   * The option getter disables an option a rule already names, and while the
   * orphan IS named that looks like enough. It is not: point the rule at
   * something else and the id becomes selectable, so the researcher can put
   * the dangling reference straight back — and this time on purpose.
   */
  it('keeps the deleted attribute unselectable once the rule points elsewhere', async () => {
    const harness = renderStageEditor(seededWithAnOrphanedRule());

    await openPrompt(harness);
    await harness.user.selectOptions(
      await screen.findByRole('combobox', { name: 'Property' }),
      'name',
    );

    expect(
      within(screen.getByRole('combobox', { name: 'Property' })).getByRole(
        'option',
        { name: ORPHANED_OPTION_LABEL },
      ),
    ).toBeDisabled();
  });

  it('refuses the save, and says which way out there is', async () => {
    const harness = renderStageEditor(seededWithAnOrphanedRule());

    await openPrompt(harness);
    await harness.user.click(screen.getByRole('button', { name: 'Save' }));

    // Not "every row needs a value in each column": the row HAS a value in
    // each column, and being told to fill in a cell that already looks filled
    // in leaves the researcher nothing to do.
    await screen.findByText(MISSING_ATTRIBUTE_MESSAGE);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('saves once the rule has been pointed at an attribute that exists', async () => {
    const harness = renderStageEditor(seededWithAnOrphanedRule());

    await openPrompt(harness);
    await harness.user.selectOptions(
      await screen.findByRole('combobox', { name: 'Property' }),
      'name',
    );
    // Choosing a property clears the direction behind it, because each column
    // narrows the next one's options.
    await harness.user.selectOptions(
      screen.getByRole('combobox', { name: 'Direction' }),
      'asc',
    );
    await harness.user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const saved = savedPrompt(await harness.submit());
    expect(saved.sortOrder).toEqual([{ property: 'name', direction: 'asc' }]);
  });
});
