import { screen, waitFor } from '@testing-library/react';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import { InvalidShape } from '@codaco/protocol-builder-core/contract/errors';
import type { StageCodebookSection } from '@codaco/protocol-builder-core/contract/schemas';
import type { ProtocolSectionId } from '@codaco/studio-sync/taxonomy';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import SubjectSection from '../../sections/subject-picker/SubjectSection.tsx';
import type { InMemoryHost } from '../../testing/host/createInMemoryHost.ts';
import { loadFixtureStage } from '../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';

/** A new stage with the fields of one the protocol already holds, so it can be saved as it is. */
const ADDED_STAGE = {
  type: 'NameGeneratorQuickAdd',
  position: 0,
  fields: loadFixtureStage('name-generator-quick-add-1').fields,
} as const;

type Harness = ReturnType<typeof renderStageEditor>;

const CLASH =
  'A change you made to the codebook while editing this stage no longer fits the protocol, so nothing was saved.';
const LOST =
  'This stage is not something the protocol can hold, so nothing was saved and your unsaved changes have been discarded.';

const QUICK_ADD = sectionId({
  kind: 'stage',
  stageId: 'name-generator-quick-add-1',
});

/** The codebook sections a save carried, by id: what the host was asked to write. */
const carried = (sections: readonly StageCodebookSection[] | undefined) =>
  (sections ?? []).map((section) => section.sectionId);

/**
 * Invents a node type called Place in the subject picker's own dialog and
 * keeps the stage on the type it has, so the type is a codebook change the
 * stage is holding and the stage itself can still be saved.
 */
const stagePlace = async (harness: Harness) => {
  await harness.user.click(
    await screen.findByRole('button', { name: 'Create new node type' }),
  );
  await harness.user.type(
    await screen.findByRole('textbox', { name: 'Node type name' }),
    'Place',
  );
  await harness.user.click(screen.getByRole('button', { name: 'Save entity' }));
  await harness.user.click(
    await screen.findByRole('button', { name: 'Cancel' }),
  );
  await waitFor(() =>
    expect(Object.keys(harness.stagedCodebook())).toHaveLength(1),
  );
};

/**
 * The host refusing the stage's write because of one section: the answer a
 * real host gives when the codebook changes it was sent no longer fit the
 * protocol (two attributes of one name, say).
 */
const invalidShapeFor = (id: ProtocolSectionId) =>
  new InvalidShape({ sectionId: id, issues: [] });

/**
 * The refused write, with what the editor sent kept for the test to read.
 */
function refusingWith(
  host: InMemoryHost,
  refuseOn: (sent: readonly StageCodebookSection[]) => ProtocolSectionId,
) {
  const sent: (readonly StageCodebookSection[])[] = [];
  return {
    sent,
    adapter: host.adapterWith({
      Submit: (input) => {
        sent.push(input.codebook ?? []);
        return Effect.fail(invalidShapeFor(refuseOn(input.codebook ?? [])));
      },
      Create: (input) => {
        sent.push(input.codebook ?? []);
        return Effect.fail(invalidShapeFor(refuseOn(input.codebook ?? [])));
      },
    }),
  };
}

describe('a stage save the host refuses over a codebook section', () => {
  it('keeps the draft and says the codebook changes no longer fit, when saving an existing stage', async () => {
    let refusal: ReturnType<typeof refusingWith> | undefined;
    const harness = renderStageEditor({
      stageId: 'name-generator-quick-add-1',
      sections: <SubjectSection entity="node" />,
      adapter: (host) => {
        refusal = refusingWith(
          host,
          ([first]) => first?.sectionId ?? QUICK_ADD,
        );
        return refusal.adapter;
      },
    });
    await stagePlace(harness);
    const staged = harness.stagedCodebook();

    expect(await harness.submit()).toBeNull();

    expect(await screen.findByRole('alert')).toHaveTextContent(CLASH);
    // The refusal is about the section the stage carried, which it did send.
    expect(carried(refusal?.sent[0])).toEqual(Object.keys(staged));
    // Nothing was written, and the researcher's change is still theirs.
    expect(Object.keys(harness.stagedCodebook())).toEqual(Object.keys(staged));
    expect(
      Object.values(harness.hostCodebook().node ?? {}).some(
        (type) => type.name === 'Place',
      ),
    ).toBe(false);
  });

  it('keeps the draft and says the codebook changes no longer fit, when adding a stage', async () => {
    let refusal: ReturnType<typeof refusingWith> | undefined;
    const harness = renderStageEditor({
      create: ADDED_STAGE,
      sections: <SubjectSection entity="node" />,
      adapter: (host) => {
        refusal = refusingWith(
          host,
          ([first]) => first?.sectionId ?? QUICK_ADD,
        );
        return refusal.adapter;
      },
    });
    const before = harness.host.store.sectionIds().length;
    await stagePlace(harness);
    const staged = harness.stagedCodebook();

    expect(await harness.submit()).toBeNull();

    expect(await screen.findByRole('alert')).toHaveTextContent(CLASH);
    expect(carried(refusal?.sent[0])).toEqual(Object.keys(staged));
    expect(Object.keys(harness.stagedCodebook())).toEqual(Object.keys(staged));
    expect(harness.host.store.sectionIds()).toHaveLength(before);
  });

  it('still says the stage is lost when the refused section is the stage itself, saving an existing stage', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-quick-add-1',
      sections: <SubjectSection entity="node" />,
      adapter: (host) => refusingWith(host, () => QUICK_ADD).adapter,
    });
    await harness.opened();

    expect(await harness.submit()).toBeNull();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(LOST);
    expect(alert).not.toHaveTextContent(CLASH);
  });

  it('still says the stage is not something the protocol can hold when the refused section is the stage being added', async () => {
    const harness = renderStageEditor({
      create: ADDED_STAGE,
      sections: <SubjectSection entity="node" />,
      adapter: (host) => refusingWith(host, () => QUICK_ADD).adapter,
    });
    await harness.opened();

    expect(await harness.submit()).toBeNull();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(LOST);
    expect(alert).not.toHaveTextContent(CLASH);
  });
});
