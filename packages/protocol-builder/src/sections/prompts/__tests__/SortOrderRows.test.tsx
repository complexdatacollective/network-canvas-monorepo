import { screen, waitFor } from '@testing-library/react';
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
const seededWithARule = () => ({
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
          sortOrder: [RULE],
        },
      ],
    },
  },
  sections,
});

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
