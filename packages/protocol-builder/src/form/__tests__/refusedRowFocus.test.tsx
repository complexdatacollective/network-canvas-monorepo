import { screen, waitFor } from '@testing-library/react';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import { InvalidShape } from '@codaco/protocol-builder-core/contract/errors';
import { createProtocolObjectId } from '@codaco/protocol-validation';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { nameGeneratorQuickAddStageEditor } from '../../editors/name-generator-quick-add/NameGeneratorQuickAddStageEditor.ts';
import { loadFixtureStage } from '../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';

const FIXTURE = loadFixtureStage('name-generator-quick-add-1').fields;
const FIRST = createProtocolObjectId();
const SECOND = createProtocolObjectId();

/** The fixture's stage, asking its question twice, so its rows differ. */
const FIELDS = {
  ...FIXTURE,
  prompts: [FIRST, SECOND].map((id) => ({
    ...(Array.isArray(FIXTURE.prompts) ? FIXTURE.prompts[0] : {}),
    id,
  })),
};

const REFUSED =
  'This stage could not be added because part of it is not valid. Your changes are still here. Correct the problem, then try adding the stage again.';

/** Adding the fixture's quick-add stage, refused with these issues. */
const renderRefusedAdd = (
  issues: ConstructorParameters<typeof InvalidShape>[0]['issues'],
) =>
  renderStageEditor({
    create: { type: 'NameGeneratorQuickAdd', position: 0, fields: FIELDS },
    registry: nameGeneratorQuickAddStageEditor,
    adapter: (host) =>
      host.adapterWith({
        Create: () =>
          Effect.fail(
            new InvalidShape({
              sectionId: sectionId({
                kind: 'stage',
                stageId: 'name-generator-quick-add-1',
              }),
              issues,
            }),
          ),
      }),
  });

describe('an add the host refuses over one row of a list', () => {
  it('moves focus to the row the refusal is about', async () => {
    const harness = renderRefusedAdd([
      {
        path: ['prompts', 1, 'text'],
        message: 'Too long',
        objectId: SECOND,
      },
    ]);
    await harness.opened();

    expect(await harness.submit()).toBeNull();

    expect(await screen.findByRole('alert')).toHaveTextContent(REFUSED);
    await waitFor(() =>
      expect(document.activeElement?.getAttribute('data-item-id')).toBe(SECOND),
    );
  });

  it('leaves focus where it was when the refusal names no row', async () => {
    const harness = renderRefusedAdd([
      { path: ['prompts', 1, 'text'], message: 'Too long' },
    ]);
    await harness.opened();

    expect(await harness.submit()).toBeNull();

    expect(await screen.findByRole('alert')).toHaveTextContent(REFUSED);
    expect(document.querySelectorAll('[data-item-id]')).toHaveLength(2);
    expect(document.activeElement?.closest('[data-item-id]')).toBeNull();
    expect(document.querySelector('[data-item-id][tabindex]')).toBeNull();
  });
});
