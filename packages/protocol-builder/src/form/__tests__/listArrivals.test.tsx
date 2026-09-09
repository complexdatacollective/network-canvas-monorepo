import { act, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { SectionDoc } from '@codaco/studio-sync/apply';

import {
  TestPromptEditor,
  TestPromptPreview,
} from '../../sections/__tests__/rowFixtures.tsx';
import FormFieldsSection from '../../sections/FormFieldsSection.tsx';
import PromptsSection from '../../sections/PromptsSection.tsx';
import { loadFixtureStage } from '../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';

/**
 * The question and hint are rich-text editors, whose editing surface cannot be
 * driven in jsdom — ProseMirror places the caret through `elementFromPoint`.
 * The same stand-in `FormFieldsSection`'s own tests use, for the same reason.
 */
vi.mock('../../fields/RichTextField.tsx', () => ({
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

type Harness = ReturnType<typeof renderStageEditor>;

const asRecord = (value: unknown): SectionDoc =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as SectionDoc)
    : {};

/** Attributes a family-member form can collect, beyond the pedigree's slots. */
const addFormAttributes = (harness: Harness) => {
  const family = asRecord(
    harness.session.getSnapshot().protocolSections[
      'codebook:node:family_member'
    ],
  );
  harness.receiveCodebookUpdate({
    node: {
      family_member: {
        ...family,
        variables: {
          ...asRecord(family.variables),
          fm_note: { name: 'fm_note', type: 'text', component: 'Text' },
          fm_extra: { name: 'fm_extra', type: 'text', component: 'Text' },
        },
      },
    },
  });
};

/**
 * A Family Pedigree whose family-member form the editor holds at
 * `nodeConfig.form` — the list a stage keeps somewhere other than the top
 * level, which is what nested addressing exists for.
 */
const pedigreeWithForm = (form: readonly SectionDoc[]) => {
  const fixture = loadFixtureStage('family-pedigree-1');
  return {
    id: 'family-pedigree-1',
    type: 'FamilyPedigree' as const,
    fields: {
      ...fixture.fields,
      nodeConfig: { ...asRecord(fixture.fields.nodeConfig), form: [...form] },
    },
  };
};

/** Rewrites the question one row asks, through the row's own dialog. */
const rewriteRow = async (
  harness: Harness,
  trigger: string,
  field: string,
  text: string,
) => {
  await harness.user.click(
    (await screen.findAllByRole('button', { name: trigger }))[0]!,
  );
  const dialog = within(await screen.findByRole('dialog'));
  const control = dialog.getByRole('textbox', { name: field });
  await harness.user.clear(control);
  await harness.user.type(control, text);
  await harness.user.click(dialog.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(screen.queryAllByRole('dialog')).toHaveLength(0));
};

const rowsAt = (document: SectionDoc, path: readonly string[]): unknown[] => {
  let cursor: unknown = document;
  for (const segment of path) cursor = asRecord(cursor)[segment];
  return Array.isArray(cursor) ? cursor : [];
};

/**
 * What a list editor commits when it rewrites one row is a whole-list `set`:
 * the command vocabulary addresses a place in the document and cannot reach
 * inside a row. Replayed literally onto a base a collaborator has changed, that
 * value writes their rows back out of existence — so it is merged into the
 * arrival row by row instead, by each row's own identity.
 */
describe('a collaborator’s rows arriving under an unsaved list edit', () => {
  it('merges the arrival into an unsaved edit of a nested list', async () => {
    const harness = renderStageEditor({
      stage: pedigreeWithForm([
        { id: 'row-a', variable: 'fm_name', prompt: 'Their name?' },
        { id: 'row-b', variable: 'fm_note', prompt: 'Anything else?' },
      ]),
      sections: (
        <FormFieldsSection
          subject="node"
          subjectTypePath="nodeConfig.type"
          fieldsPath="nodeConfig.form"
          optional
        />
      ),
    });
    addFormAttributes(harness);

    await rewriteRow(harness, 'Edit field', 'Question text', 'What name?');
    expect(harness.pendingCommands()).toHaveLength(1);

    // The host has taken a change from somebody else and none of ours: they
    // added a row above, and rewrote the one we did not touch.
    act(() => {
      harness.session.acknowledge({
        fields: pedigreeWithForm([
          { id: 'row-zero', variable: 'fm_extra', prompt: 'Arrived first' },
          { id: 'row-a', variable: 'fm_name', prompt: 'Their name?' },
          { id: 'row-b', variable: 'fm_note', prompt: 'Rewritten elsewhere' },
        ]).fields,
        throughBatchId: 0,
        manifestRevision: { sequence: 9n, hash: 'revision-9' },
      });
    });

    const request = await harness.submit();
    expect(request).not.toBeNull();
    expect(rowsAt(request!.stageDocument, ['nodeConfig', 'form'])).toEqual([
      { id: 'row-zero', variable: 'fm_extra', prompt: 'Arrived first' },
      { id: 'row-a', variable: 'fm_name', prompt: 'What name?' },
      { id: 'row-b', variable: 'fm_note', prompt: 'Rewritten elsewhere' },
    ]);
  });

  it('merges the arrival into an unsaved edit of a top-level list', async () => {
    const fixture = loadFixtureStage('name-generator-1');
    const withPrompts = (prompts: readonly SectionDoc[]) => ({
      ...fixture.fields,
      prompts: [...prompts],
    });
    const harness = renderStageEditor({
      stage: {
        id: 'name-generator-1',
        type: 'NameGenerator',
        fields: withPrompts([
          { id: 'prompt-a', text: 'Who do you know?' },
          { id: 'prompt-b', text: 'Who else?' },
        ]),
      },
      sections: (
        <PromptsSection
          PromptEditor={TestPromptEditor}
          PromptPreview={TestPromptPreview}
          requiresSubject={false}
        />
      ),
    });

    await rewriteRow(harness, 'Edit prompt', 'Prompt text', 'Who exactly?');
    expect(harness.pendingCommands()).toHaveLength(1);

    act(() => {
      harness.session.acknowledge({
        fields: withPrompts([
          { id: 'prompt-zero', text: 'Arrived first' },
          { id: 'prompt-a', text: 'Who do you know?' },
          { id: 'prompt-b', text: 'Rewritten elsewhere' },
        ]),
        throughBatchId: 0,
        manifestRevision: { sequence: 9n, hash: 'revision-9' },
      });
    });

    const request = await harness.submit();
    expect(request).not.toBeNull();
    expect(rowsAt(request!.stageDocument, ['prompts'])).toEqual([
      { id: 'prompt-zero', text: 'Arrived first' },
      { id: 'prompt-a', text: 'Who exactly?' },
      { id: 'prompt-b', text: 'Rewritten elsewhere' },
    ]);
  });
});
