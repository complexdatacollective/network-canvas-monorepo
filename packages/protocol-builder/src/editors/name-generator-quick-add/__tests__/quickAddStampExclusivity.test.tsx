import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import {
  attributeField,
  attributeTrigger,
  awaitOfferedAttributes,
  closeAttributePicker,
  offeredAttributes,
  unavailableReason,
} from '../../../testing/attributePicker.ts';
import {
  fixtureStageId,
  fixtureTypeId,
  fixtureVariableId,
} from '../../../testing/protocolFixture.ts';
import type { StageEditorHarness } from '../../../testing/renderStageEditor.tsx';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import { testVariableId } from '../../../testing/testId.ts';
import { nameGeneratorQuickAddStageEditor } from '../NameGeneratorQuickAddStageEditor.ts';

/**
 * The prompt text is a rich-text editor, and its editing surface cannot be
 * driven in jsdom — the same substitution `NameGeneratorPromptsSection`'s own
 * tests make, and for the same reason. Nothing here types a prompt.
 */
vi.mock('../../../fields/RichTextField.tsx', () => ({
  default: ({
    id,
    name,
    value,
    onChange,
  }: Readonly<{
    id?: string;
    name?: string;
    value?: unknown;
    onChange?: (next: string) => void;
  }>) => (
    <input
      id={id}
      name={name}
      value={typeof value === 'string' ? value : ''}
      onChange={(event) => onChange?.(event.target.value)}
    />
  ),
}));

const PERSON = fixtureTypeId('node', 'person');
const PERSON_SECTION = sectionId({ kind: 'codebookNode', typeId: PERSON });
const personVariable = (name: string) =>
  fixtureVariableId({ entity: 'node', typeName: 'person' }, name);
const NAME = personVariable('name');
const NICKNAME = testVariableId('nickname');

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * A text attribute nothing else in the fixture protocol touches.
 *
 * The case below is about the two writers of ONE stage, so the attribute they
 * argue over has to be free of every other claim: an attribute a form
 * elsewhere collects is already kept out of this picker by the role map, and a
 * case built on one would pass with the stage's own writers ignored.
 */
const addFreeTextVariable = (
  harness: StageEditorHarness,
  variableName: string,
): void => {
  const variableId = testVariableId(variableName);
  const section = harness.protocolSections()[PERSON_SECTION];
  if (section === undefined) {
    throw new Error('the fixture protocol has no person node type');
  }
  const variables = isRecord(section.variables) ? section.variables : {};
  if (Object.hasOwn(variables, variableId)) {
    throw new Error(
      `"person" already has a "${variableName}" attribute, so adding one proves nothing.`,
    );
  }
  const updated: SectionDoc = {
    ...section,
    variables: {
      ...variables,
      [variableId]: {
        name: variableName,
        type: 'text',
        component: 'Text',
      },
    },
  };
  harness.receiveCodebookUpdate({ node: { [PERSON]: updated } });
};

const QUICK_ADD_LABEL = 'Select an attribute';

/** The field a prompt's stamp row picks its attribute in. */
const STAMP_PICKER = 'Create or select an attribute';

/** Every attribute a picker's window offers, by the id it would store. */
const offeredIds = (window: HTMLElement): string[] =>
  [
    ...window.querySelectorAll(
      '[role="option"][data-attribute-id]:not([data-unavailable])',
    ),
  ].map((row) => row.getAttribute('data-attribute-id') ?? '');

const quickAddPicker = async (): Promise<HTMLElement> => {
  await screen.findByText(QUICK_ADD_LABEL, { selector: 'label' });
  return attributeField(QUICK_ADD_LABEL);
};

/**
 * The stage seeded over the fixture's own quick-add generator, so the role map
 * takes the SAVED copy of this stage out and the draft below is the only thing
 * claiming its attributes.
 */
const quickAddHolding = (fields: SectionDoc) => ({
  registry: nameGeneratorQuickAddStageEditor,
  stage: {
    id: fixtureStageId('name-generator-quick-add-1'),
    type: 'NameGeneratorQuickAdd' as const,
    fields: {
      label: { 'en-US': 'Name Generator Quick Add' },
      subject: { entity: 'node', types: [PERSON] },
      ...fields,
    },
  },
});

/**
 * The box a participant types a person's name into and the fixed values a
 * prompt stamps on everyone named under it are opposite writers of the same
 * codebook: quick add honours the attribute's rules while they type, a stamp
 * writes straight past them, and the protocol's own role-conflict rule refuses
 * a stage that does both to one attribute.
 *
 * The stamps are read from the LIVE stage rather than from the role map, which
 * is built with the edited stage taken out. A protocol authored elsewhere can
 * arrive with a prompt stamping a text attribute, and the picker offered it as
 * the box to fill in: a conflict the researcher would have created by
 * accepting what they were shown, with nothing at the save to catch it.
 */
describe('what a quick-add generator and its own prompts may not share', () => {
  it('does not offer an attribute this stage’s own prompts stamp', async () => {
    const harness = renderStageEditor(
      quickAddHolding({
        quickAdd: NAME,
        prompts: [
          {
            id: 'name-generator-quick-add-prompt-1',
            text: { 'en-US': 'Quickly add people you know' },
            additionalAttributes: [{ variable: NICKNAME, value: true }],
          },
        ],
      }),
    );
    addFreeTextVariable(harness, 'nickname');

    // The attribute exists and is of the one type this box can fill in, so its
    // absence below is the stamp's doing and not the type filter's.
    const picker = await quickAddPicker();
    await awaitOfferedAttributes(harness.user, picker, (offered) =>
      expect(offered).toContain(NAME),
    );
    expect(await offeredAttributes(harness.user, picker)).not.toContain(
      NICKNAME,
    );
    // Listed, with the prompt that stamps it.
    expect(await unavailableReason(harness.user, picker, NICKNAME)).toBe(
      'Prompt 1 on this stage assigns a value to this attribute, so it cannot also be collected here.',
    );
  });

  /**
   * And the same pair in the other order, which is the direction a filter on
   * the quick-add picker alone would leave open.
   *
   * It is closed by the kinds of answer the two writers take, not by a filter:
   * quick add fills in ONE box, so it offers text attributes alone
   * (`QuickAddSection`'s `QUICK_ADD_TYPE`), and a stamp writes a fixed value,
   * so the row offers booleans alone (`NameGeneratorPromptsSection`'s
   * `STAMP_TYPE`), and lists every other attribute as one it cannot use.
   * No attribute is ever in both pools, so the attribute quick add fills in
   * cannot be stamped by a prompt of the same stage.
   */
  it('does not offer the quick-add attribute to its own prompt stamps', async () => {
    const harness = renderStageEditor(
      quickAddHolding({
        quickAdd: NICKNAME,
        prompts: [
          {
            id: 'name-generator-quick-add-prompt-1',
            text: { 'en-US': 'Quickly add people you know' },
          },
        ],
      }),
    );
    addFreeTextVariable(harness, 'nickname');
    // Held by the picker, so the conflict this is about is the live one.
    const picker = await quickAddPicker();
    await awaitOfferedAttributes(harness.user, picker, (offered) =>
      expect(offered).toContain(NICKNAME),
    );

    const prompt = await screen.findByRole('button', { name: 'Edit prompt' });
    await harness.user.click(prompt);
    const dialog = await screen.findByRole('dialog');
    await harness.user.click(
      within(dialog).getByRole('button', {
        name: 'Add new attribute to assign',
      }),
    );
    await harness.user.click(
      attributeTrigger(attributeField(STAMP_PICKER, dialog)),
    );
    const window = await waitFor(() => {
      const opened = screen
        .getAllByRole('dialog')
        .find((element) => element !== dialog);
      if (opened === undefined) {
        throw new Error('the attribute window did not open');
      }
      return opened;
    });

    const offered = offeredIds(window);
    // A boolean the fixture leaves free is offered, so an empty list is not
    // what is being read.
    expect(offered).toContain(personVariable('highlighted'));
    expect(offered).not.toContain(NICKNAME);
    await closeAttributePicker(harness.user);
    // Listed, for the reason that comes first: it is not a Boolean.
    expect(
      await unavailableReason(
        harness.user,
        attributeField(STAMP_PICKER, dialog),
        NICKNAME,
      ),
    ).toBe('Only Boolean attributes can be used here.');
  });
});
