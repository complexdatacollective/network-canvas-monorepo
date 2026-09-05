import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import { assetSchema } from '@codaco/protocol-validation';
import { contentHash, type SectionDoc } from '@codaco/studio-sync/apply';
import { assembleProtocolSections } from '@codaco/studio-sync/protocol-document';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import {
  InMemoryCompoundHost,
  type InMemoryCompoundHostLease,
} from '../../compound-edit/InMemoryCompoundHost.ts';
import ProtocolField from '../../form/ProtocolField.tsx';
import {
  createStageIdentity,
  ProtocolBuilderSessionStore,
  type CompoundEditSubmission,
  type CompoundSectionEdit,
  type FinishRequest,
  type ProtocolBuilderPresence,
} from '../../session.ts';
import { renderResourceEditor } from '../components/__tests__/renderResourceEditor.tsx';
import ResourcePickerControl, {
  type ResourcePickerControlProps,
} from '../components/ResourcePickerControl.tsx';
import { InMemoryResourceGateway } from '../InMemoryResourceGateway.ts';

const stageSection = sectionId({ kind: 'stage', stageId: 'stage-1' });
const settingsSection = sectionId({ kind: 'settings' });
const stageOrderSection = sectionId({ kind: 'stageOrder' });
const assetsSection = sectionId({ kind: 'assets' });
const venueSection = sectionId({ kind: 'codebookNode', typeId: 'venue' });

/** Distinctive, so a leak on any surface is unambiguous rather than plausible. */
const SECRET = 'pk.editor-secret-must-never-appear';
const KEY_NAME = 'Mapbox key';
/** The gateway's first staged id, which is what the field ends up holding. */
const STAGED_ID = 'staged-resource-1';

const stageFields: SectionDoc = {
  label: 'Where do you meet?',
  subject: { entity: 'node', type: 'venue' },
  mapOptions: {
    // The field the researcher is about to fill by adding a key.
    tokenAssetId: '',
    style: 'mapbox://styles/mapbox/standard',
    center: [0, 0],
    initialZoom: 8,
    dataSourceAssetId: 'map-layers',
    color: 'node-color-seq-1',
    targetFeatureProperty: 'name',
  },
  prompts: [
    {
      id: 'prompt-1',
      text: 'Where is this place?',
      variable: 'venue-location',
    },
  ],
};

const protocolSections: Record<string, SectionDoc> = {
  [settingsSection]: { name: 'Staged secret', schemaVersion: 8 },
  [stageOrderSection]: { stages: ['stage-1'] },
  [stageSection]: { id: 'stage-1', type: 'Geospatial', ...stageFields },
  [venueSection]: {
    name: 'Venue',
    color: 'node-color-seq-1',
    shape: { default: 'circle' },
    variables: {
      'venue-location': { name: 'venueLocation', type: 'location' },
    },
  },
  [assetsSection]: {
    'map-layers': {
      type: 'geojson',
      id: 'map-layers',
      name: 'Map layers',
      source: 'layers.geojson',
    },
  },
};

const presence: ProtocolBuilderPresence = {
  sessionId: 'tab-primary',
  userId: 'user-primary',
  displayName: 'Primary editor',
  sectionId: stageSection,
  mode: 'editing',
};
const lease: InMemoryCompoundHostLease = {
  sectionId: stageSection,
  leaseOwner: 'owner-primary',
  leaseEpoch: 4n,
  holder: presence,
};

type MapOptionsFieldProps = Omit<
  ResourcePickerControlProps,
  'value' | 'onChange' | 'kind'
> &
  Readonly<{
    value?: Record<string, unknown>;
    onChange?: (next: Record<string, unknown>) => void;
  }>;

/**
 * The map options a Geospatial editor holds, with the token picker inside
 * them.
 *
 * Registered on the whole `mapOptions` value rather than on the token alone,
 * because a submit replaces a top-level value with what the form holds: the
 * control that owns the container owns everything in it, and the map settings
 * beside the token have to survive the save that adds the token.
 */
function MapOptionsField({
  value,
  onChange,
  ...fieldProps
}: MapOptionsFieldProps) {
  const options = value ?? {};
  const token = options.tokenAssetId;
  return (
    <ResourcePickerControl
      {...fieldProps}
      kind="apikey"
      value={typeof token === 'string' ? token : undefined}
      onChange={(tokenAssetId) => onChange?.({ ...options, tokenAssetId })}
    />
  );
}

/**
 * The whole stack a host wires: a compound host holding the protocol, a
 * resource host, and a session over both. `onFinish` is what a host writes —
 * the stage's own commands and the manifest commands the promotion handed it,
 * in ONE submission, because a stage committed without its manifest entries
 * references resources the protocol does not have.
 */
function createFixture() {
  const host = new InMemoryCompoundHost({
    protocolSections,
    manifestRevision: { sequence: 7n, hash: 'revision-7' },
    leases: [lease],
  });
  const gateway = new InMemoryResourceGateway();
  const submissions: CompoundEditSubmission[] = [];
  let finishes = 0;

  const session = new ProtocolBuilderSessionStore({
    identity: createStageIdentity('Geospatial', () => 'stage-1'),
    fields: stageFields,
    protocolSections: host.getSnapshot().protocolSections,
    manifestRevision: host.getSnapshot().manifestRevision,
    access: { mode: 'editable', leaseOwner: 'owner-primary', leaseEpoch: 4n },
    resourceGateway: gateway,
    buildCandidate: ({ stageDocument, protocolSections: sections }) =>
      assembleProtocolSections({ ...sections, [stageSection]: stageDocument }),
    onFinish: ({ pendingCommands, resourceManifest }: FinishRequest) => {
      const sections = host.getSnapshot().protocolSections;
      const stageCommands = pendingCommands.flatMap((batch) => [
        ...batch.commands,
      ]);
      const edits: CompoundSectionEdit[] = [];
      if (stageCommands.length > 0) {
        edits.push({
          kind: 'update',
          sectionId: stageSection,
          expectedContentHash: contentHash(sections[stageSection] ?? {}),
          commands: stageCommands,
        });
      }
      if (resourceManifest !== undefined) {
        edits.push({
          kind: 'update',
          sectionId: assetsSection,
          expectedContentHash: contentHash(sections[assetsSection] ?? {}),
          commands: [...resourceManifest.commands],
        });
      }
      const submission: CompoundEditSubmission = {
        id: `finish-${++finishes}`,
        description: 'Finish the stage',
        edits,
        authority: {
          sectionId: stageSection,
          leaseOwner: 'owner-primary',
          leaseEpoch: 4n,
        },
      };
      submissions.push(submission);
      const result = host.submit(submission);
      if (result.status !== 'applied') {
        throw new Error(
          result.status === 'failed' ? result.message : 'the sections are held',
        );
      }
    },
  });

  // Recorded from the first render onwards, so "the key never reached a
  // snapshot" is asserted against every snapshot the editor was rendered
  // from, not just the one left standing at the end.
  const snapshots: string[] = [serializeSnapshot(session)];
  session.subscribe(() => snapshots.push(serializeSnapshot(session)));

  return { gateway, host, session, snapshots, submissions };
}

function serializeSnapshot(session: ProtocolBuilderSessionStore): string {
  // Everything a host could log, with the one value JSON cannot serialize on
  // its own written out rather than dropped.
  return JSON.stringify(session.getSnapshot(), (_key, value: unknown) =>
    typeof value === 'bigint' ? String(value) : value,
  );
}

async function addKey(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole('button', { name: 'Select an API key' }),
  );
  await user.type(await screen.findByLabelText('Name'), KEY_NAME);
  await user.type(await screen.findByLabelText('Key'), SECRET);
  await user.click(screen.getByRole('button', { name: 'Add API key' }));
}

describe('a key added in the editor and saved with its stage', () => {
  it('commits the stage and the key in one apply, with the key materialising only in the manifest', async () => {
    const user = userEvent.setup();
    const { gateway, host, session, snapshots, submissions } = createFixture();
    const { fieldValue } = renderResourceEditor({
      session,
      actions: ({ formId }) => (
        <SubmitButton form={formId}>Finished editing</SubmitButton>
      ),
      children: (
        <ProtocolField
          component={MapOptionsField}
          name="mapOptions"
          label="Map provider API key"
        />
      ),
    });

    await addKey(user);
    await waitFor(() =>
      expect(fieldValue('mapOptions')).toMatchObject({
        tokenAssetId: STAGED_ID,
      }),
    );

    // Before the save, with the key staged: the id is everywhere it belongs
    // and the key itself is nowhere. Each check is paired with what proves it
    // is looking at something.
    expect(JSON.stringify(fieldValue('mapOptions'))).toContain(STAGED_ID);
    expect(JSON.stringify(fieldValue('mapOptions'))).not.toContain(SECRET);
    expect(snapshots.join('\n')).toContain(STAGED_ID);
    expect(snapshots.join('\n')).not.toContain(SECRET);
    expect(document.body.textContent ?? '').toContain(KEY_NAME);
    expect(document.body.innerHTML).not.toContain(SECRET);
    expect(
      [...document.querySelectorAll('input')].map((input) => input.value),
    ).not.toContain(SECRET);

    await user.click(screen.getByRole('button', { name: 'Finished editing' }));
    await waitFor(() => expect(submissions).toHaveLength(1));

    // ONE apply, carrying the stage's own edit and the key's manifest entry:
    // a host that could commit them separately could commit a stage naming a
    // key the protocol does not have.
    expect(submissions[0]?.edits.map((edit) => edit.sectionId)).toEqual([
      stageSection,
      assetsSection,
    ]);
    expect(host.getSnapshot().manifestRevision.sequence).toBe(8n);

    const sections = host.getSnapshot().protocolSections;
    expect(sections[stageSection]).toMatchObject({
      mapOptions: {
        tokenAssetId: STAGED_ID,
        // The rest of the container the picker sits in, saved unchanged.
        style: 'mapbox://styles/mapbox/standard',
        dataSourceAssetId: 'map-layers',
      },
    });
    // The one place the key legitimately materialises: the manifest entry the
    // protocol format spells as an `apikey` asset.
    const entry = sections[assetsSection]?.[STAGED_ID];
    expect(entry).toEqual({
      type: 'apikey',
      id: STAGED_ID,
      name: KEY_NAME,
      value: SECRET,
    });
    expect(assetSchema.safeParse(entry).success).toBe(true);

    // Nothing was left staged, and nothing the editor can see ever held it.
    expect(gateway.getStagingResidue()).toEqual([]);
    expect(session.getSnapshot().stagedResources).toEqual([]);
    expect(snapshots).not.toHaveLength(0);
    expect(snapshots.join('\n')).not.toContain(SECRET);
    expect(document.body.innerHTML).not.toContain(SECRET);
  });

  it('leaves the stage and the key uncommitted when the promotion is refused', async () => {
    const user = userEvent.setup();
    const { gateway, host, session, submissions } = createFixture();
    renderResourceEditor({
      session,
      actions: ({ formId }) => (
        <SubmitButton form={formId}>Finished editing</SubmitButton>
      ),
      children: (
        <ProtocolField
          component={MapOptionsField}
          name="mapOptions"
          label="Map provider API key"
        />
      ),
    });

    await addKey(user);
    await waitFor(() => expect(screen.getByText(KEY_NAME)).toBeVisible());
    gateway.failNext('promote');

    await user.click(screen.getByRole('button', { name: 'Finished editing' }));

    // The researcher is told, in the gateway's own words, and the key they
    // added is still there to save on the next try.
    expect(
      await screen.findByText('the resource host is temporarily unavailable'),
    ).toBeVisible();
    expect(submissions).toEqual([]);
    expect(host.getSnapshot().manifestRevision.sequence).toBe(7n);
    expect(
      session.getSnapshot().stagedResources.map((staged) => staged.id),
    ).toEqual([STAGED_ID]);
  });
});
