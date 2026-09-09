import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import InputField from '@codaco/fresco-ui/form/fields/InputField';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import {
  useResourceClient,
  useStagedResources,
} from '../../resources/client.tsx';
import BuilderSection from '../../sections/BuilderSection.tsx';
import {
  fixtureStageIds,
  loadFixtureStage,
} from '../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import ProtocolField from '../ProtocolField.tsx';

const STAGE_ID = 'information-1';
const STAGE_SECTION = sectionId({ kind: 'stage', stageId: STAGE_ID });

/** One section owning one value, so a save can be compared key by key. */
const nameSection = (
  <BuilderSection title="Stage name">
    <ProtocolField name="label" label="Stage name" component={InputField} />
  </BuilderSection>
);

describe('a stage somebody else is editing', () => {
  it('opens read-only, and says who has it', async () => {
    renderStageEditor({
      stageId: STAGE_ID,
      sections: nameSection,
      readOnly: true,
    });

    // Awaited, because nothing tells the editor the stage is somebody else's
    // until the host answers its acquire.
    expect(
      await screen.findByText(
        'Robin is editing this stage, so you can read it but not change it.',
      ),
    ).toBeInTheDocument();
  });
});

describe('what a save writes', () => {
  it('hands back the whole section, changed only where the researcher changed it', async () => {
    const seeded = loadFixtureStage(STAGE_ID);
    const harness = renderStageEditor({
      stageId: STAGE_ID,
      sections: nameSection,
    });

    const field = screen.getByRole('textbox', { name: 'Stage name' });
    await harness.user.clear(field);
    await harness.user.type(field, 'A renamed page');

    const written = await harness.submit();

    expect(written).not.toBeNull();
    // Every key of the stage, not only the one on screen: a submit that wrote
    // just the mounted field would leave the rest of the section behind.
    expect(written?.stageDocument).toEqual({
      ...seeded.fields,
      id: STAGE_ID,
      type: seeded.type,
      label: 'A renamed page',
    });
    // And nothing the form invented on the way through.
    expect(Object.keys(written?.stageDocument ?? {}).toSorted()).toEqual(
      ['id', 'type', ...Object.keys(seeded.fields)].toSorted(),
    );
  });
});

describe('a save the protocol refuses because the lock has gone', () => {
  it('says so, discards the draft, and leaves the stage as it was', async () => {
    const seeded = loadFixtureStage(STAGE_ID);
    const harness = renderStageEditor({
      stageId: STAGE_ID,
      sections: nameSection,
    });

    const field = screen.getByRole('textbox', { name: 'Stage name' });
    await harness.user.clear(field);
    await harness.user.type(field, 'Never saved');

    // Nothing tells the editor the lock has gone; it finds out here.
    harness.takeOverLock();
    const written = await harness.submit();

    expect(written).toBeNull();
    expect(
      await screen.findByText(
        /Somebody else is editing this stage now, so nothing was saved/,
      ),
    ).toBeInTheDocument();
    // The draft is gone: the control is back to what the protocol holds.
    const savedLabel = seeded.fields.label;
    expect(typeof savedLabel).toBe('string');
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Stage name' })).toHaveValue(
        String(savedLabel),
      );
    });
    expect(harness.protocolSections()[STAGE_SECTION]).toEqual({
      id: STAGE_ID,
      type: seeded.type,
      ...seeded.fields,
    });
  });
});

describe('a stage the protocol does not hold yet', () => {
  it('is registered where the host said it would go', async () => {
    const before = fixtureStageIds();
    const harness = renderStageEditor({
      create: {
        type: 'Information',
        position: 1,
        // A template is not a saveable stage: every interface needs something
        // only a researcher can supply, and the sections of a real editor are
        // what fill that in. One mounted section cannot, so the stage arrives
        // already holding what the schema asks for.
        fields: loadFixtureStage(STAGE_ID).fields,
      },
      sections: nameSection,
    });

    const field = screen.getByRole('textbox', { name: 'Stage name' });
    await harness.user.clear(field);
    await harness.user.type(field, 'A new page');
    const written = await harness.submit();

    expect(written).not.toBeNull();
    const order = orderOf(harness.protocolSections());
    const created = written?.stageDocument.id;
    expect(typeof created).toBe('string');
    expect(order[1]).toBe(created);
    expect(order.length).toBe(before.length + 1);
  });
});

/**
 * Imports a file and lists what the edit is holding, so a test can watch the
 * staging land without driving a picker.
 */
function StagedFileProbe() {
  const resources = useResourceClient();
  const { staged } = useStagedResources();
  return (
    <BuilderSection title="Import">
      <button
        type="button"
        onClick={() => {
          void resources.stageUpload({
            requestId: 'probe-request',
            kind: 'network',
            name: 'A roster',
            source: 'roster.csv',
            contentType: 'text/csv',
            bytes: new TextEncoder().encode('{}'),
          });
        }}
      >
        Import a file
      </button>
      <ul>
        {staged.map((descriptor) => (
          <li key={descriptor.id}>{descriptor.name}</li>
        ))}
      </ul>
    </BuilderSection>
  );
}

const stagedProbe = (
  <>
    {nameSection}
    <StagedFileProbe />
  </>
);

describe('a file imported while the stage is open', () => {
  it('is committed with the stage that names it', async () => {
    const harness = renderStageEditor({
      stageId: STAGE_ID,
      sections: stagedProbe,
    });

    await harness.user.click(
      screen.getByRole('button', { name: 'Import a file' }),
    );
    expect(await screen.findByText('A roster')).toBeInTheDocument();

    expect(await harness.submit()).not.toBeNull();

    const manifest = harness.protocolSections()[
      sectionId({ kind: 'assets' })
    ] as Record<string, { name?: unknown }>;
    expect(
      Object.values(manifest).some((entry) => entry.name === 'A roster'),
    ).toBe(true);
  });

  it('is dropped when the researcher closes the stage without saving', async () => {
    const harness = renderStageEditor({
      stageId: STAGE_ID,
      sections: stagedProbe,
    });

    await harness.user.click(
      screen.getByRole('button', { name: 'Import a file' }),
    );
    expect(await screen.findByText('A roster')).toBeInTheDocument();

    await harness.cancel();

    const manifest = harness.protocolSections()[
      sectionId({ kind: 'assets' })
    ] as Record<string, { name?: unknown }>;
    expect(
      Object.values(manifest).some((entry) => entry.name === 'A roster'),
    ).toBe(false);
  });
});

function orderOf(sections: Readonly<Record<string, unknown>>): string[] {
  const order = sections[sectionId({ kind: 'stageOrder' })];
  const stages =
    typeof order === 'object' && order !== null
      ? Reflect.get(order, 'stages')
      : undefined;
  return Array.isArray(stages)
    ? stages.filter((entry): entry is string => typeof entry === 'string')
    : [];
}
