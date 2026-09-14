import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { documentWithEntityProperties } from '../../editing.ts';
import type { CodebookWriteOutcome } from '../../writes.ts';
import CodebookEntityEditor from '../CodebookEntityEditor.tsx';

/**
 * A node type whose shape already follows one of its attributes keeps that
 * mapping through every other edit its dialog can make.
 *
 * Nothing in the editor writes `shape.dynamic` unless the researcher touches
 * the mapping, but `shape` is written WHOLE — so the mapping survives only
 * because every helper that rewrites part of `shape` carries the rest of it
 * forward. That is one spread, in one function, and this is what says so.
 */

const SUBJECT = { entity: 'node', type: 'person' } as const;
const PERSON_SECTION = sectionId({ kind: 'codebookNode', typeId: 'person' });

const MAPPING = {
  variable: 'ethnicity',
  type: 'discrete',
  map: [{ value: 'asian', shape: 'square' }],
} as const;

const PERSON: SectionDoc = {
  name: 'Person',
  color: 'node-color-seq-1',
  icon: 'add-a-person',
  shape: { default: 'circle', dynamic: MAPPING },
  variables: {
    ethnicity: {
      name: 'Ethnicity',
      type: 'categorical',
      component: 'CheckboxGroup',
      options: [
        { label: 'Asian', value: 'asian' },
        { label: 'White', value: 'white' },
      ],
    },
  },
};

const applied = async (): Promise<CodebookWriteOutcome> => ({
  status: 'applied',
  sectionId: PERSON_SECTION,
});

type SubmitEntity = (document: SectionDoc) => Promise<CodebookWriteOutcome>;

const renderEditor = (onSubmit: SubmitEntity) =>
  render(
    <CodebookEntityEditor
      mode="update"
      sessionKey="preservation"
      subject={SUBJECT}
      initialDraft={PERSON}
      authoritativeDocument={PERSON}
      existingEntityNames={[]}
      onSubmit={onSubmit}
    />,
  );

describe('a stored shape mapping', () => {
  it('survives a change to the type’s name alone', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<SubmitEntity>(applied);
    renderEditor(onSubmit);

    const name = screen.getByRole('textbox', { name: 'Node type name' });
    await user.clear(name);
    await user.type(name, 'Adult');
    await user.click(screen.getByRole('button', { name: 'Save entity' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0]?.[0].shape).toEqual({
      default: 'circle',
      dynamic: MAPPING,
    });
  });

  it('survives a change to the type’s default shape alone', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn<SubmitEntity>(applied);
    renderEditor(onSubmit);

    await user.click(
      within(screen.getByRole('radiogroup', { name: 'Shape' })).getByRole(
        'radio',
        { name: 'Select shape Diamond' },
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Save entity' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0]?.[0].shape).toEqual({
      default: 'diamond',
      dynamic: MAPPING,
    });
  });
});

/**
 * And the rule underneath it: the entity form owns `shape` whole, so a draft
 * that omits `dynamic` REMOVES it from the saved type. That is what switching
 * the mapping off means, and it is also why the editor has to carry a mapping
 * it is not editing forward itself — nothing below will do it.
 */
describe('documentWithEntityProperties', () => {
  it('drops a dynamic mapping the draft’s shape does not carry', () => {
    const written = documentWithEntityProperties({
      subject: SUBJECT,
      authoritativeDocument: PERSON,
      draft: { ...PERSON, shape: { default: 'diamond' } },
    });

    expect(written.shape).toEqual({ default: 'diamond' });
  });
});
