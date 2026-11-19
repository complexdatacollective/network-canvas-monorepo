import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import QuickAddSection from '../../editors/name-generator-quick-add/sections/QuickAddSection.tsx';
import SubjectSection from '../../sections/subject-picker/SubjectSection.tsx';
import { openAttributePicker } from '../../testing/attributePicker.ts';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';

type Harness = ReturnType<typeof renderStageEditor>;

const typeNamed = (
  codebook: ReturnType<Harness['editorCodebook']>,
  name: string,
) =>
  Object.entries(codebook.node ?? {}).find(
    ([, definition]) => definition.name === name,
  );

/**
 * Invents a node type called Place from the subject picker's own dialog, and
 * either moves the stage to it or keeps the stage on the type it has (which
 * keeps the rest of the stage, so it can still be saved).
 */
const inventPlace = async (
  harness: Harness,
  stage: 'moveTheStage' | 'keepTheStage',
) => {
  await harness.user.click(
    await screen.findByRole('button', { name: 'Create new node type' }),
  );
  await harness.user.type(
    await screen.findByRole('textbox', { name: 'Node type name' }),
    'Place',
  );
  await harness.user.click(screen.getByRole('button', { name: 'Save entity' }));
  await harness.user.click(
    await screen.findByRole('button', {
      name: stage === 'moveTheStage' ? 'Change the node type' : 'Cancel',
    }),
  );
  const place = screen.getByRole('radio', { name: 'Place' });
  await waitFor(() =>
    stage === 'moveTheStage'
      ? expect(place).toBeChecked()
      : expect(place).not.toBeChecked(),
  );
};

/**
 * Codebook changes that build on one another inside one stage edit.
 *
 * Each is kept with the stage's draft (see `StagedCodebookStore`), so a later
 * change has to find an earlier one where the editor shows it: an attribute
 * invented on a type the researcher invented a moment before is a change to a
 * section only the draft holds.
 */
describe('codebook changes made on top of one another in a stage edit', () => {
  it('writes a type invented in the edit with the stage, and only then', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-quick-add-1',
      sections: <SubjectSection entity="node" />,
    });

    await inventPlace(harness, 'keepTheStage');
    expect(typeNamed(harness.editorCodebook(), 'Place')).toBeDefined();
    expect(typeNamed(harness.hostCodebook(), 'Place')).toBeUndefined();

    expect(await harness.submit()).not.toBeNull();
    expect(typeNamed(harness.hostCodebook(), 'Place')).toBeDefined();
  });

  it('takes a type invented in the edit away with a cancelled edit', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-quick-add-1',
      sections: <SubjectSection entity="node" />,
    });

    await inventPlace(harness, 'keepTheStage');
    expect(typeNamed(harness.editorCodebook(), 'Place')).toBeDefined();

    await harness.cancel();
    expect(typeNamed(harness.hostCodebook(), 'Place')).toBeUndefined();
  });

  /**
   * Found by the Architect e2e suite: moving the stage to the new type reset
   * every field the form held — the parked codebook changes among them — so
   * the type vanished and the attribute was refused as belonging to a type
   * "the codebook no longer holds".
   */
  it('invents an attribute on a type invented in the same edit', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-quick-add-1',
      sections: (
        <>
          <SubjectSection entity="node" />
          <QuickAddSection />
        </>
      ),
    });

    await inventPlace(harness, 'moveTheStage');

    const field = document.querySelector<HTMLElement>(
      '[data-field-name="quickAdd"]',
    );
    if (field === null) throw new Error('No quick-add field');
    const dialog = await openAttributePicker(harness.user, field);
    await harness.user.type(
      within(dialog).getByRole('searchbox', {
        name: 'Find or create an attribute',
      }),
      'nickname',
    );
    await harness.user.click(
      within(dialog).getByRole('option', {
        name: 'Create new attribute called “nickname”.',
      }),
    );

    await waitFor(() => {
      const place = typeNamed(harness.editorCodebook(), 'Place');
      expect(
        Object.values(place?.[1].variables ?? {}).map(({ name }) => name),
      ).toContain('nickname');
    });
    expect(screen.queryByRole('alert')).toBeNull();
    // Held, not written: the protocol has neither until the stage is saved.
    expect(typeNamed(harness.hostCodebook(), 'Place')).toBeUndefined();

    // And both are one change of the stage's: the type and the attribute on
    // it are held together, against a section the protocol does not hold.
    const [placeId] = typeNamed(harness.editorCodebook(), 'Place') ?? [];
    expect(Object.keys(harness.stagedCodebook())).toEqual([
      `codebook:node:${placeId}`,
    ]);
  });
});
