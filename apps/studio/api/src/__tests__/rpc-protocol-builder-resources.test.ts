import { createHash, randomUUID } from 'node:crypto';

import { Effect } from 'effect';
import { beforeAll, describe, expect, it } from 'vitest';

import { MAX_UPLOAD_BYTES } from '@codaco/studio-contract/limits';
import {
  DraftId,
  ProtocolId,
  TeamId,
} from '@codaco/studio-contract/schema/ids';

import { type Studio } from '../app.ts';
import { TenantScope } from '../db/tenant.ts';
import { ASSET_KEY_PLACEHOLDER, openAssetKey } from '../protocol/asset-keys.ts';
import { ObjectStore } from '../storage/object-store.ts';
import { testDb } from './support/database.ts';
import { memoryObjectStore } from './support/object-store.ts';
import {
  ADA,
  ASSETS,
  callerOf,
  EDIT,
  GRACE,
  holdingEvents,
  holdingStaging,
  latch,
  OTHER_EDIT,
  setupProtocolBuilderSuite,
  STAGE_ORDER,
  TEAM_ID,
  until,
} from './support/protocol-builder-suite.ts';
import {
  createProtocolBuilderClient,
  type ProtocolBuilderTestClient,
} from './support/protocol-builder.ts';
import { expectRpcFailure, type RpcTestClient } from './support/rpc.ts';
import { testCipher } from './support/secrets.ts';

describe.skipIf(!testDb)('the protocol-builder host surface', () => {
  const suite = setupProtocolBuilderSuite();
  const {
    runEffect,
    access,
    objects,
    objectStore,
    setStoreUnreachable,
    teamRows,
    call,
    callExit,
    createStage,
    stagedIds,
    removedAfterOpening,
  } = suite;
  let host: ProtocolBuilderTestClient;
  let protocolId: string;
  let draftId: string;
  let adaRpc: RpcTestClient;
  let studio: Studio;

  beforeAll(() => {
    host = suite.host;
    protocolId = suite.protocolId;
    draftId = suite.draftId;
    adaRpc = suite.adaRpc;
    studio = suite.studio;
  });

  it('promotes a staged resource in the submitting section’s own revision', async () => {
    const stage = await createStage(ADA, 'Names a secret');
    const staged = await call(
      ADA,
      host.rpc('ResourcesStage', {
        protocolId,
        editId: EDIT,
        requestId: 'promoted-secret',
        request: { kind: 'secret', name: 'Mapbox token', value: 'pk.secret' },
      }),
    );
    if (staged.status !== 'ok') throw new Error('staging failed');

    const held = await call(
      ADA,
      host.rpc('AcquireLock', { protocolId, sectionId: stage.sectionId }),
    );
    const written = await call(
      ADA,
      host.rpc('Submit', {
        protocolId,
        requestId: randomUUID(),
        sectionId: stage.sectionId,
        document: { ...held.document, label: 'Names a secret' },
        revision: held.revision,
        promote: { editId: EDIT, resourceIds: [staged.data.descriptor.id] },
      }),
    );

    expect(written.promoted?.map((entry) => entry.status)).toEqual([
      'committed',
    ]);
    const assets = await call(
      ADA,
      host.rpc('GetSection', { protocolId, sectionId: ASSETS }),
    );
    expect(assets.document[staged.data.descriptor.id]).toMatchObject({
      name: 'Mapbox token',
      type: 'apikey',
    });
    expect(assets.revision.sequence).toBe(written.revision.sequence);
    expect(await stagedIds(EDIT)).not.toContain(staged.data.descriptor.id);
    await call(
      ADA,
      host.rpc('ReleaseLock', { protocolId, sectionId: stage.sectionId }),
    );
  });

  it('writes neither the section nor the manifest when a promotion fails', async () => {
    const stage = await createStage(ADA, 'Renamed beside a bad promotion');
    const assetsBefore = await call(
      ADA,
      host.rpc('GetSection', { protocolId, sectionId: ASSETS }),
    );
    const held = await call(
      ADA,
      host.rpc('AcquireLock', { protocolId, sectionId: stage.sectionId }),
    );

    const error = await expectRpcFailure(
      callExit(
        ADA,
        host.rpc('Submit', {
          protocolId,
          requestId: randomUUID(),
          sectionId: stage.sectionId,
          document: { ...held.document, label: 'Renamed' },
          revision: held.revision,
          promote: { editId: EDIT, resourceIds: ['never-staged'] },
        }),
      ),
      'PromotionFailed',
    );

    expect(error).toMatchObject({
      sectionId: stage.sectionId,
      failure: { reason: 'not-found', resourceId: 'never-staged' },
    });
    const after = await call(
      ADA,
      host.rpc('GetSection', { protocolId, sectionId: stage.sectionId }),
    );
    expect(after.document.label).toBe('Renamed beside a bad promotion');
    expect(after.revision).toEqual(held.revision);
    const assets = await call(
      ADA,
      host.rpc('GetSection', { protocolId, sectionId: ASSETS }),
    );
    expect(assets.document).toEqual(assetsBefore.document);
    await call(
      ADA,
      host.rpc('ReleaseLock', { protocolId, sectionId: stage.sectionId }),
    );
  });

  it('hands a staged and a promoted API key back through inspect', async () => {
    const stage = await createStage(ADA, 'Reads its key back');
    const staged = await call(
      ADA,
      host.rpc('ResourcesStage', {
        protocolId,
        editId: EDIT,
        requestId: 'readable-secret',
        request: {
          kind: 'secret',
          name: 'Readable token',
          value: 'pk.readable',
        },
      }),
    );
    if (staged.status !== 'ok') throw new Error('staging failed');
    const resourceId = staged.data.descriptor.id;

    const whileStaged = await call(
      ADA,
      host.rpc('ResourcesInspect', { protocolId, editId: EDIT, resourceId }),
    );
    expect(whileStaged.status === 'ok' && whileStaged.data.value).toBe(
      'pk.readable',
    );

    const held = await call(
      ADA,
      host.rpc('AcquireLock', { protocolId, sectionId: stage.sectionId }),
    );
    await call(
      ADA,
      host.rpc('Submit', {
        protocolId,
        requestId: randomUUID(),
        sectionId: stage.sectionId,
        document: { ...held.document, label: 'Reads its key back' },
        revision: held.revision,
        promote: { editId: EDIT, resourceIds: [resourceId] },
      }),
    );

    const committed = await call(
      ADA,
      host.rpc('ResourcesInspect', { protocolId, resourceId }),
    );
    expect(committed.status === 'ok' && committed.data.value).toBe(
      'pk.readable',
    );
    await call(
      ADA,
      host.rpc('ReleaseLock', { protocolId, sectionId: stage.sectionId }),
    );
  });

  it('seals a promoted API key instead of writing it into the protocol', async () => {
    // Deliberately not Mapbox-token shaped: `pnpm check:mapbox-tokens` scans
    // every tracked file for `<pk|sk|tk>.eyJ….…`.
    const SECRET = 'map-key-never-at-rest';
    const stage = await createStage(ADA, 'Seals its key');
    const staged = await call(
      ADA,
      host.rpc('ResourcesStage', {
        protocolId,
        editId: EDIT,
        requestId: 'sealed-secret',
        request: { kind: 'secret', name: 'Sealed token', value: SECRET },
      }),
    );
    if (staged.status !== 'ok') throw new Error('staging failed');
    const resourceId = staged.data.descriptor.id;

    const held = await call(
      ADA,
      host.rpc('AcquireLock', { protocolId, sectionId: stage.sectionId }),
    );
    await call(
      ADA,
      host.rpc('Submit', {
        protocolId,
        requestId: randomUUID(),
        sectionId: stage.sectionId,
        document: { ...held.document, label: 'Seals its key' },
        revision: held.revision,
        promote: { editId: EDIT, resourceIds: [resourceId] },
      }),
    );
    await call(
      ADA,
      host.rpc('ReleaseLock', { protocolId, sectionId: stage.sectionId }),
    );

    const manifest = await call(
      ADA,
      host.rpc('GetSection', { protocolId, sectionId: ASSETS }),
    );
    const entry = (manifest?.document as Record<string, unknown> | undefined)?.[
      resourceId
    ];
    expect(entry).toEqual({ name: 'Sealed token', type: 'apikey' });

    const sealed = await teamRows(
      `SELECT key_id FROM protocol_asset_keys
       WHERE team_id = $1 AND protocol_id = $2 AND asset_id = $3`,
      [TEAM_ID, protocolId, resourceId],
    );
    expect(sealed).toHaveLength(1);
    await expect(
      runEffect(
        TenantScope.open(
          access,
          openAssetKey(testCipher(), {
            teamId: TEAM_ID,
            protocolId,
            assetId: resourceId,
          }),
        ),
      ),
    ).resolves.toBe(SECRET);

    const sections = await teamRows<{ doc: string }>(
      `SELECT doc::text AS doc FROM sections`,
    );
    for (const row of sections) {
      expect(row.doc).not.toContain(SECRET);
    }
    const events = await teamRows<{ doc: string }>(
      `SELECT doc::text AS doc FROM protocol_events WHERE doc IS NOT NULL`,
    );
    for (const row of events) {
      expect(row.doc).not.toContain(SECRET);
    }

    const draft = await adaRpc.call(
      adaRpc.rpc('protocols.draft', {
        teamId: TeamId.make(TEAM_ID),
        protocolId: ProtocolId.make(protocolId),
        draftId: DraftId.make(draftId),
      }),
    );
    expect(JSON.stringify(draft)).not.toContain(SECRET);
  });

  it('admits a submit of the assets section carrying a redacted API key', async () => {
    const SECRET = 'map-key-submitted-beside';
    const stage = await createStage(ADA, 'Keeps its key');
    const staged = await call(
      ADA,
      host.rpc('ResourcesStage', {
        protocolId,
        editId: EDIT,
        requestId: 'redacted-beside',
        request: { kind: 'secret', name: 'Beside token', value: SECRET },
      }),
    );
    if (staged.status !== 'ok') throw new Error('staging failed');
    const resourceId = staged.data.descriptor.id;
    const held = await call(
      ADA,
      host.rpc('AcquireLock', { protocolId, sectionId: stage.sectionId }),
    );
    await call(
      ADA,
      host.rpc('Submit', {
        protocolId,
        requestId: randomUUID(),
        sectionId: stage.sectionId,
        document: { ...held.document, label: 'Keeps its key' },
        revision: held.revision,
        promote: { editId: EDIT, resourceIds: [resourceId] },
      }),
    );
    await call(
      ADA,
      host.rpc('ReleaseLock', { protocolId, sectionId: stage.sectionId }),
    );

    const manifest = await call(
      ADA,
      host.rpc('AcquireLock', { protocolId, sectionId: ASSETS }),
    );
    expect((manifest.document as Record<string, unknown>)[resourceId]).toEqual({
      name: 'Beside token',
      type: 'apikey',
    });

    const submitted = await call(
      ADA,
      host.rpc('Submit', {
        protocolId,
        requestId: randomUUID(),
        sectionId: ASSETS,
        document: {
          ...manifest.document,
          districts: {
            name: 'Districts',
            type: 'geojson',
            source: 'districts.geojson',
          },
        },
        revision: manifest.revision,
      }),
    );
    expect(submitted.revision).toBeDefined();
    await call(ADA, host.rpc('ReleaseLock', { protocolId, sectionId: ASSETS }));

    const sections = await teamRows<{ doc: string }>(
      `SELECT doc::text AS doc FROM sections`,
    );
    for (const row of sections) {
      expect(row.doc).not.toContain(SECRET);
      expect(row.doc).not.toContain(ASSET_KEY_PLACEHOLDER);
    }
    await expect(
      runEffect(
        TenantScope.open(
          access,
          openAssetKey(testCipher(), {
            teamId: TEAM_ID,
            protocolId,
            assetId: resourceId,
          }),
        ),
      ),
    ).resolves.toBe(SECRET);
  });

  it('answers a discard with the status alone', async () => {
    const staged = await call(
      GRACE,
      host.rpc('ResourcesStage', {
        protocolId,
        editId: EDIT,
        requestId: 'discarded-secret',
        request: { kind: 'secret', name: 'Throwaway', value: 'pk.throwaway' },
      }),
    );
    if (staged.status !== 'ok') throw new Error('staging failed');

    const discarded = await call(
      GRACE,
      host.rpc('ResourcesDiscard', {
        protocolId,
        editId: EDIT,
        resourceId: staged.data.descriptor.id,
      }),
    );

    expect(discarded).toStrictEqual({ status: 'ok' });
    const again = await call(
      GRACE,
      host.rpc('ResourcesDiscard', {
        protocolId,
        editId: EDIT,
        resourceId: staged.data.descriptor.id,
      }),
    );
    expect(again).toStrictEqual({
      status: 'failed',
      failure: {
        reason: 'not-found',
        message: 'no such staged resource',
        retryable: false,
        resourceId: staged.data.descriptor.id,
      },
    });
  });

  it('promotes a staged resource with the stage being created', async () => {
    const staged = await call(
      ADA,
      host.rpc('ResourcesStage', {
        protocolId,
        editId: EDIT,
        requestId: 'created-with-secret',
        request: { kind: 'secret', name: 'Created token', value: 'pk.created' },
      }),
    );
    if (staged.status !== 'ok') throw new Error('staging failed');

    const created = await call(
      ADA,
      host.rpc('Create', {
        protocolId,
        requestId: randomUUID(),
        kind: 'stage',
        document: {
          type: 'Information',
          label: 'Carries a secret',
          title: 'Carries a secret',
          items: [],
        },
        promote: { editId: EDIT, resourceIds: [staged.data.descriptor.id] },
      }),
    );

    expect(created.promoted?.map((entry) => entry.status)).toEqual([
      'committed',
    ]);
    const assets = await call(
      ADA,
      host.rpc('GetSection', { protocolId, sectionId: ASSETS }),
    );
    expect(assets.document[staged.data.descriptor.id]).toMatchObject({
      name: 'Created token',
      type: 'apikey',
    });
    const order = await call(
      ADA,
      host.rpc('GetSection', { protocolId, sectionId: STAGE_ORDER }),
    );
    expect(assets.revision.sequence).toBe(created.revision.sequence);
    expect(order.revision.sequence).toBe(created.revision.sequence);
    expect(await stagedIds(EDIT)).not.toContain(staged.data.descriptor.id);
  });

  it('creates no stage when the promotion it carries cannot be committed', async () => {
    const before = await call(
      ADA,
      host.rpc('GetSection', { protocolId, sectionId: STAGE_ORDER }),
    );

    const error = await expectRpcFailure(
      callExit(
        ADA,
        host.rpc('Create', {
          protocolId,
          requestId: randomUUID(),
          kind: 'stage',
          document: {
            type: 'Information',
            label: 'Never made',
            title: 'Never made',
            items: [],
          },
          promote: { editId: EDIT, resourceIds: ['never-staged'] },
        }),
      ),
      'PromotionFailed',
    );

    expect(error.sectionId).toBeUndefined();
    expect(error.failure).toMatchObject({
      reason: 'not-found',
      resourceId: 'never-staged',
    });
    const after = await call(
      ADA,
      host.rpc('GetSection', { protocolId, sectionId: STAGE_ORDER }),
    );
    expect(after.document.stages).toEqual(before.document.stages);
  });

  it('replays what a retried promoting submit already wrote', async () => {
    const stage = await createStage(ADA, 'Saved once');
    const staged = await call(
      ADA,
      host.rpc('ResourcesStage', {
        protocolId,
        editId: EDIT,
        requestId: 'retried-submit-secret',
        request: {
          kind: 'secret',
          name: 'Resubmitted',
          value: 'pk.resubmitted',
        },
      }),
    );
    if (staged.status !== 'ok') throw new Error('staging failed');
    const held = await call(
      ADA,
      host.rpc('AcquireLock', { protocolId, sectionId: stage.sectionId }),
    );
    const promote = {
      editId: EDIT,
      resourceIds: [staged.data.descriptor.id] as const,
    };
    const requestId = randomUUID();
    const written = await call(
      ADA,
      host.rpc('Submit', {
        protocolId,
        requestId,
        sectionId: stage.sectionId,
        document: { ...held.document, label: 'Saved once' },
        revision: held.revision,
        promote,
      }),
    );
    await call(
      ADA,
      host.rpc('ReleaseLock', { protocolId, sectionId: stage.sectionId }),
    );

    const retried = await call(
      ADA,
      host.rpc('Submit', {
        protocolId,
        requestId,
        sectionId: stage.sectionId,
        document: { ...held.document, label: 'Saved once' },
        revision: held.revision,
        promote,
      }),
    );

    expect(retried.revision).toEqual(written.revision);
    expect(retried.promoted?.map((entry) => entry.id)).toEqual([
      staged.data.descriptor.id,
    ]);
  });

  it('keeps one edit’s staged resource out of the edit open beside it', async () => {
    const staged = await call(
      ADA,
      host.rpc('ResourcesStage', {
        protocolId,
        editId: EDIT,
        requestId: 'two-edits-secret',
        request: { kind: 'secret', name: 'One edit’s token', value: 'pk.one' },
      }),
    );
    if (staged.status !== 'ok') throw new Error('staging failed');
    const resourceId = staged.data.descriptor.id;

    const listed = await call(
      ADA,
      host.rpc('ResourcesList', {
        protocolId,
        editId: OTHER_EDIT,
        status: 'staged',
      }),
    );
    const inspected = await call(
      ADA,
      host.rpc('ResourcesInspect', {
        protocolId,
        editId: OTHER_EDIT,
        resourceId,
      }),
    );
    const discarded = await call(
      ADA,
      host.rpc('ResourcesDiscard', {
        protocolId,
        editId: OTHER_EDIT,
        resourceId,
      }),
    );
    await call(
      ADA,
      host.rpc('ResourcesDiscard', { protocolId, editId: OTHER_EDIT }),
    );

    if (listed.status !== 'ok') throw new Error('listing failed');
    expect(listed.data.resources.map((entry) => entry.id)).not.toContain(
      resourceId,
    );
    expect(inspected).toMatchObject({
      status: 'failed',
      failure: { reason: 'not-found' },
    });
    expect(discarded).toMatchObject({ status: 'failed' });
    const mine = await call(
      ADA,
      host.rpc('ResourcesList', { protocolId, editId: EDIT, status: 'staged' }),
    );
    if (mine.status !== 'ok') throw new Error('listing failed');
    expect(mine.data.resources.map((entry) => entry.id)).toContain(resourceId);
  });

  it('refuses a promotion naming a resource another edit staged', async () => {
    const stage = await createStage(ADA, 'Promotes what it never staged');
    const staged = await call(
      ADA,
      host.rpc('ResourcesStage', {
        protocolId,
        editId: EDIT,
        requestId: 'not-this-edits-secret',
        request: { kind: 'secret', name: 'Not yours', value: 'pk.notyours' },
      }),
    );
    if (staged.status !== 'ok') throw new Error('staging failed');
    const held = await call(
      ADA,
      host.rpc('AcquireLock', { protocolId, sectionId: stage.sectionId }),
    );

    const error = await expectRpcFailure(
      callExit(
        ADA,
        host.rpc('Submit', {
          protocolId,
          requestId: randomUUID(),
          sectionId: stage.sectionId,
          document: held.document,
          revision: held.revision,
          promote: {
            editId: OTHER_EDIT,
            resourceIds: [staged.data.descriptor.id],
          },
        }),
      ),
      'PromotionFailed',
    );
    expect(error.failure).toMatchObject({
      reason: 'not-found',
      resourceId: staged.data.descriptor.id,
    });
    await call(
      ADA,
      host.rpc('ReleaseLock', { protocolId, sectionId: stage.sectionId }),
    );
  });

  it('lists only what the protocol has committed when no edit is named', async () => {
    const staged = await call(
      ADA,
      host.rpc('ResourcesStage', {
        protocolId,
        editId: EDIT,
        requestId: 'unnamed-edit-secret',
        request: {
          kind: 'secret',
          name: 'Still an import',
          value: 'pk.import',
        },
      }),
    );
    if (staged.status !== 'ok') throw new Error('staging failed');

    const listed = await call(ADA, host.rpc('ResourcesList', { protocolId }));

    if (listed.status !== 'ok') throw new Error('listing failed');
    expect(listed.data.resources.map((entry) => entry.status)).not.toContain(
      'staged',
    );
    expect(listed.data.resources.map((entry) => entry.id)).not.toContain(
      staged.data.descriptor.id,
    );
  });

  it('commits promoted bytes under their content hash, keeping the display name', async () => {
    const stage = await createStage(ADA, 'Names a photograph');
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const staged = await call(
      ADA,
      host.rpc('ResourcesStage', {
        protocolId,
        editId: EDIT,
        requestId: 'promoted-portrait',
        request: {
          kind: 'content',
          contentKind: 'image',
          name: 'Nook',
          source: 'nook.png',
          contentType: 'image/png',
          bytes,
        },
      }),
    );
    if (staged.status !== 'ok') throw new Error('staging failed');
    const resourceId = staged.data.descriptor.id;
    const held = await call(
      ADA,
      host.rpc('AcquireLock', { protocolId, sectionId: stage.sectionId }),
    );

    const written = await call(
      ADA,
      host.rpc('Submit', {
        protocolId,
        requestId: randomUUID(),
        sectionId: stage.sectionId,
        document: held.document,
        revision: held.revision,
        promote: { editId: EDIT, resourceIds: [resourceId] },
      }),
    );

    const digest = createHash('sha256').update(bytes).digest('hex');
    const source = `${digest}.png`;
    const assets = await call(
      ADA,
      host.rpc('GetSection', { protocolId, sectionId: ASSETS }),
    );
    expect(assets.document[resourceId]).toEqual({
      name: 'Nook',
      type: 'image',
      source,
    });
    expect(written.promoted).toEqual([
      expect.objectContaining({ id: resourceId, status: 'committed', source }),
    ]);
    const listed = await call(ADA, host.rpc('ResourcesList', { protocolId }));
    if (listed.status !== 'ok') throw new Error('listing failed');
    expect(listed.data.resources).toContainEqual(
      expect.objectContaining({
        id: resourceId,
        name: 'Nook',
        status: 'committed',
        source,
      }),
    );
    const preview = await call(
      ADA,
      host.rpc('ResourcesPreview', { protocolId, resourceId }),
    );
    expect(preview).toMatchObject({
      status: 'ok',
      data: { url: `/storage/${digest}` },
    });
    await call(
      ADA,
      host.rpc('ReleaseLock', { protocolId, sectionId: stage.sectionId }),
    );
  });

  it('keeps a staged resource out of another editor’s discard', async () => {
    const staged = await call(
      GRACE,
      host.rpc('ResourcesStage', {
        protocolId,
        editId: EDIT,
        requestId: 'grace-keeps-this',
        request: { kind: 'secret', name: 'Grace’s token', value: 'pk.grace' },
      }),
    );
    if (staged.status !== 'ok') throw new Error('staging failed');
    const resourceId = staged.data.descriptor.id;

    const byId = await call(
      ADA,
      host.rpc('ResourcesDiscard', { protocolId, editId: EDIT, resourceId }),
    );
    const wholesale = await call(
      ADA,
      host.rpc('ResourcesDiscard', { protocolId, editId: EDIT }),
    );

    expect(byId).toMatchObject({ status: 'failed' });
    expect(wholesale).toStrictEqual({ status: 'ok' });
    const listed = await call(
      GRACE,
      host.rpc('ResourcesList', { protocolId, editId: EDIT }),
    );
    if (listed.status !== 'ok') throw new Error('listing failed');
    expect(listed.data.resources.map((entry) => entry.id)).toContain(
      resourceId,
    );
  });

  const stageFile = (
    over: ProtocolBuilderTestClient,
    editId: string,
    requestId: string,
    bytes: Uint8Array,
  ) =>
    over.call(
      callerOf(ADA),
      over.rpc('ResourcesStage', {
        protocolId,
        editId,
        requestId,
        request: {
          kind: 'content',
          contentKind: 'image',
          name: 'A photograph',
          source: 'photo.png',
          contentType: 'image/png',
          bytes,
        },
      }),
    );

  const objectKeyOf = async (resourceId: string) => {
    const [row] = await teamRows<{ objectKey: string }>(
      `SELECT object_key AS "objectKey" FROM protocol_staged_resources
        WHERE resource_id = $1`,
      [resourceId],
    );
    if (row === undefined) throw new Error('no staged row');
    return row.objectKey;
  };

  const stagedRowsOf = (resourceId: string) =>
    teamRows(
      `SELECT resource_id FROM protocol_staged_resources WHERE resource_id = $1`,
      [resourceId],
    );

  it('keeps a staged file through a restart, for another replica to promote', async () => {
    const edit = 'edit-across-replicas';
    const bytes = new Uint8Array([137, 80, 78, 71, 0, 0, 0, 42]);
    const first = await createProtocolBuilderClient(studio, {
      objectStore,
      replicaId: 'replica-that-staged',
    });
    let firstOpen = true;
    const second = await createProtocolBuilderClient(studio, {
      objectStore,
      replicaId: 'replica-that-promotes',
    });
    try {
      const staged = await stageFile(first, edit, 'across-replicas', bytes);
      if (staged.status !== 'ok') throw new Error(staged.failure.message);
      const resourceId = staged.data.descriptor.id;
      await first.dispose();
      firstOpen = false;

      const listed = await second.call(
        callerOf(ADA),
        second.rpc('ResourcesList', { protocolId, editId: edit }),
      );
      if (listed.status !== 'ok') throw new Error(listed.failure.message);
      expect(listed.data.resources).toContainEqual(
        expect.objectContaining({ id: resourceId, status: 'staged' }),
      );
      const preview = await second.call(
        callerOf(ADA),
        second.rpc('ResourcesPreview', {
          protocolId,
          editId: edit,
          resourceId,
        }),
      );
      expect(preview).toEqual({
        status: 'ok',
        data: {
          resourceId,
          url: `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`,
        },
      });

      const stage = await createStage(ADA, 'Promoted on another replica');
      const held = await second.call(
        callerOf(ADA),
        second.rpc('AcquireLock', { protocolId, sectionId: stage.sectionId }),
      );
      const written = await second.call(
        callerOf(ADA),
        second.rpc('Submit', {
          protocolId,
          requestId: randomUUID(),
          sectionId: stage.sectionId,
          document: held.document,
          revision: held.revision,
          promote: { editId: edit, resourceIds: [resourceId] },
        }),
      );
      const digest = createHash('sha256').update(bytes).digest('hex');
      expect(written.promoted).toEqual([
        expect.objectContaining({
          id: resourceId,
          status: 'committed',
          source: `${digest}.png`,
        }),
      ]);
      expect(objects.keys()).toContain(`assets/${digest}`);
      await second.call(
        callerOf(ADA),
        second.rpc('ReleaseLock', { protocolId, sectionId: stage.sectionId }),
      );
    } finally {
      if (firstOpen) await first.dispose();
      await second.dispose();
    }
  });

  it('deletes a promotion’s staged rows in its own write, and its staged object after', async () => {
    const edit = 'edit-promoted-once';
    const events = holdingEvents();
    const other = await createProtocolBuilderClient(studio, {
      objectStore,
      events: events.layer,
    });
    try {
      const staged = await stageFile(
        other,
        edit,
        'promoted-once',
        new Uint8Array([4, 8, 15, 16, 23, 42]),
      );
      if (staged.status !== 'ok') throw new Error(staged.failure.message);
      const resourceId = staged.data.descriptor.id;
      const objectKey = await objectKeyOf(resourceId);
      const stage = await createStage(ADA, 'Promotes a file once');
      const held = await other.call(
        callerOf(ADA),
        other.rpc('AcquireLock', { protocolId, sectionId: stage.sectionId }),
      );

      const committed = events.next((entries) =>
        entries.some(
          ({ event }) =>
            event.type === 'revision' && event.sectionId === stage.sectionId,
        ),
      );
      const written = other.call(
        callerOf(ADA),
        other.rpc('Submit', {
          protocolId,
          requestId: randomUUID(),
          sectionId: stage.sectionId,
          document: held.document,
          revision: held.revision,
          promote: { editId: edit, resourceIds: [resourceId] },
        }),
      );
      await committed.reached;
      try {
        expect(await stagedRowsOf(resourceId)).toEqual([]);
        expect(objects.keys()).toContain(objectKey);
      } finally {
        committed.release();
      }
      await written;

      await until(
        () => objects.removed().includes(objectKey),
        'the promoted staged object to be deleted',
      );
      expect(objects.keys()).not.toContain(objectKey);
      await other.call(
        callerOf(ADA),
        other.rpc('ReleaseLock', { protocolId, sectionId: stage.sectionId }),
      );
    } finally {
      await other.dispose();
    }
  });

  it('deletes a discarded file’s object before its row, keeping the row while the object stays', async () => {
    const edit = 'edit-discarded-file';
    const staged = await stageFile(
      host,
      edit,
      'discarded-file',
      new Uint8Array([7, 7, 7]),
    );
    if (staged.status !== 'ok') throw new Error(staged.failure.message);
    const resourceId = staged.data.descriptor.id;
    const objectKey = await objectKeyOf(resourceId);

    setStoreUnreachable(true);
    let refused;
    try {
      refused = await call(
        ADA,
        host.rpc('ResourcesDiscard', { protocolId, editId: edit, resourceId }),
      );
    } finally {
      setStoreUnreachable(false);
    }
    expect(refused).toMatchObject({
      status: 'failed',
      failure: { reason: 'unavailable', retryable: true },
    });
    expect(await stagedIds(edit)).toContain(resourceId);

    const discarded = await call(
      ADA,
      host.rpc('ResourcesDiscard', { protocolId, editId: edit, resourceId }),
    );
    expect(discarded).toStrictEqual({ status: 'ok' });
    expect(objects.removed()).toContain(objectKey);
    expect(objects.keys()).not.toContain(objectKey);
    expect(await stagedRowsOf(resourceId)).toEqual([]);
  });

  it('stages nothing for a file the object store cannot take', async () => {
    const edit = 'edit-stage-store-down';
    setStoreUnreachable(true);
    let refused;
    try {
      refused = await stageFile(
        host,
        edit,
        'stage-store-down',
        new Uint8Array([1]),
      );
    } finally {
      setStoreUnreachable(false);
    }
    expect(refused).toMatchObject({
      status: 'failed',
      failure: { reason: 'unavailable', retryable: true },
    });
    expect(await stagedIds(edit)).toEqual([]);
  });

  it('refuses a file for good where no object store is configured', async () => {
    const storeless = await createProtocolBuilderClient(studio, {
      objectStore: ObjectStore.absent,
    });
    try {
      const refused = await stageFile(
        storeless,
        'edit-no-store',
        'no-store',
        new Uint8Array([1]),
      );
      expect(refused).toMatchObject({
        status: 'failed',
        failure: { reason: 'unsupported-kind', retryable: false },
      });
    } finally {
      await storeless.dispose();
    }
  });

  it('deletes the object an interrupted stage had already put', async () => {
    const edit = 'edit-interrupted-stage';
    const held = memoryObjectStore();
    const put = latch();
    let putKey = '';
    const other = await createProtocolBuilderClient(studio, {
      objectStore: ObjectStore.of({
        ...held.store,
        putStaged: (key, bytes, mediaType) =>
          held.store.putStaged(key, bytes, mediaType).pipe(
            Effect.andThen(
              Effect.sync(() => {
                putKey = key;
                put.open();
              }),
            ),
            Effect.andThen(Effect.never),
          ),
      }),
    });
    try {
      const abort = new AbortController();
      const staging = other.callExit(
        callerOf(ADA),
        other.rpc('ResourcesStage', {
          protocolId,
          editId: edit,
          requestId: 'interrupted-stage',
          request: {
            kind: 'content',
            contentKind: 'image',
            name: 'A photograph',
            source: 'photo.png',
            contentType: 'image/png',
            bytes: new Uint8Array([9, 9, 9]),
          },
        }),
        { signal: abort.signal },
      );
      await put.opened;
      expect(held.keys()).toContain(putKey);

      abort.abort();
      await staging;
      await until(
        () => held.removed().includes(putKey),
        'the interrupted stage’s object to be deleted',
      );
      expect(held.keys()).not.toContain(putKey);
      expect(await stagedIds(edit)).toEqual([]);
    } finally {
      await other.dispose();
    }
  });

  it('refuses a write whose staged resource was discarded after it was planned', async () => {
    const edit = 'edit-gone-before-write';
    const staged = await call(
      ADA,
      host.rpc('ResourcesStage', {
        protocolId,
        editId: edit,
        requestId: 'gone-before-write',
        request: { kind: 'secret', name: 'Discarded', value: 'pk.discarded' },
      }),
    );
    if (staged.status !== 'ok') throw new Error('staging failed');
    const resourceId = staged.data.descriptor.id;
    const stage = await createStage(ADA, 'Loses its resource');
    const held = await call(
      ADA,
      host.rpc('AcquireLock', { protocolId, sectionId: stage.sectionId }),
    );
    const staging = holdingStaging();
    const other = await createProtocolBuilderClient(studio, {
      objectStore,
      staged: staging.layer,
    });
    try {
      const planned = staging.next((id) => id === resourceId);
      const submitting = other.callExit(
        callerOf(ADA),
        other.rpc('Submit', {
          protocolId,
          requestId: randomUUID(),
          sectionId: stage.sectionId,
          document: { ...held.document, label: 'Renamed' },
          revision: held.revision,
          promote: { editId: edit, resourceIds: [resourceId] },
        }),
      );
      await planned.reached;
      await call(
        ADA,
        host.rpc('ResourcesDiscard', { protocolId, editId: edit, resourceId }),
      );
      planned.release();

      const error = await expectRpcFailure(submitting, 'PromotionFailed');
      expect(error).toMatchObject({
        sectionId: stage.sectionId,
        failure: { reason: 'not-found', resourceId, retryable: false },
      });
      const after = await call(
        ADA,
        host.rpc('GetSection', { protocolId, sectionId: stage.sectionId }),
      );
      expect(after.revision).toEqual(held.revision);
      const assets = await call(
        ADA,
        host.rpc('GetSection', { protocolId, sectionId: ASSETS }),
      );
      expect(assets.document[resourceId]).toBeUndefined();
    } finally {
      await other.dispose();
      await call(
        ADA,
        host.rpc('ReleaseLock', { protocolId, sectionId: stage.sectionId }),
      );
    }
  });

  it('refuses an empty file, and keeps nothing staged for it', async () => {
    const edit = 'edit-empty';
    const empty = await call(
      ADA,
      host.rpc('ResourcesStage', {
        protocolId,
        editId: edit,
        requestId: 'empty',
        request: {
          kind: 'content',
          contentKind: 'image',
          name: 'A photograph with no pixels',
          source: 'blank.png',
          contentType: 'image/png',
          bytes: new Uint8Array(0),
        },
      }),
    );

    expect(empty).toMatchObject({
      status: 'failed',
      failure: { reason: 'invalid-content' },
    });
    const listed = await call(
      ADA,
      host.rpc('ResourcesList', { protocolId, editId: edit, status: 'staged' }),
    );
    if (listed.status !== 'ok') throw new Error(listed.failure.message);
    expect(listed.data.resources).toEqual([]);
  });

  it('refuses a resource larger than this deployment stores, and keeps none of it', async () => {
    const edit = 'edit-oversize';
    const oversized = await call(
      ADA,
      host.rpc('ResourcesStage', {
        protocolId,
        editId: edit,
        requestId: 'oversized',
        request: {
          kind: 'content',
          contentKind: 'image',
          name: 'A photograph nobody can send',
          source: 'huge.png',
          contentType: 'image/png',
          bytes: new Uint8Array(MAX_UPLOAD_BYTES + 1),
        },
      }),
    );

    expect(oversized).toMatchObject({
      status: 'failed',
      failure: { reason: 'too-large' },
    });
    const listed = await call(
      ADA,
      host.rpc('ResourcesList', { protocolId, editId: edit, status: 'staged' }),
    );
    if (listed.status !== 'ok') throw new Error(listed.failure.message);
    expect(listed.data.resources).toEqual([]);
  });

  it('answers an unreachable object store with a failure the editor can retry', async () => {
    const edit = 'edit-store-down';
    const stage = await createStage(ADA, 'Names a file the store cannot take');
    const staged = await call(
      ADA,
      host.rpc('ResourcesStage', {
        protocolId,
        editId: edit,
        requestId: 'store-down',
        request: {
          kind: 'content',
          contentKind: 'image',
          name: 'A photograph',
          source: 'photo.png',
          contentType: 'image/png',
          bytes: new Uint8Array([9, 9, 9]),
        },
      }),
    );
    if (staged.status !== 'ok') throw new Error(staged.failure.message);
    const held = await call(
      ADA,
      host.rpc('AcquireLock', { protocolId, sectionId: stage.sectionId }),
    );
    const promote = {
      editId: edit,
      resourceIds: [staged.data.descriptor.id] as const,
    };

    setStoreUnreachable(true);
    let refused;
    try {
      refused = await callExit(
        ADA,
        host.rpc('Submit', {
          protocolId,
          requestId: randomUUID(),
          sectionId: stage.sectionId,
          document: { ...held.document, label: 'Renamed with a file' },
          revision: held.revision,
          promote,
        }),
      );
    } finally {
      setStoreUnreachable(false);
    }
    const error = await expectRpcFailure(
      Promise.resolve(refused),
      'PromotionFailed',
    );
    expect(error.failure).toMatchObject({
      reason: 'unavailable',
      retryable: true,
      resourceId: staged.data.descriptor.id,
    });

    const written = await call(
      ADA,
      host.rpc('Submit', {
        protocolId,
        requestId: randomUUID(),
        sectionId: stage.sectionId,
        document: { ...held.document, label: 'Renamed with a file' },
        revision: held.revision,
        promote,
      }),
    );
    expect(written.promoted?.map((entry) => entry.status)).toEqual([
      'committed',
    ]);
    await call(
      ADA,
      host.rpc('ReleaseLock', { protocolId, sectionId: stage.sectionId }),
    );
  });

  it('hands no committed API key to a caller removed while the inspection runs', async () => {
    const { who, remove, restore } =
      await removedAfterOpening('removed-inspect');
    const stage = await createStage(ADA, 'Commits a key');
    const staged = await call(
      ADA,
      host.rpc('ResourcesStage', {
        protocolId,
        editId: OTHER_EDIT,
        requestId: randomUUID(),
        request: { kind: 'secret', name: 'Committed', value: 'pk.committed' },
      }),
    );
    if (staged.status !== 'ok') throw new Error('staging failed');
    const resourceId = staged.data.descriptor.id;
    const held = await call(
      ADA,
      host.rpc('AcquireLock', { protocolId, sectionId: stage.sectionId }),
    );
    await call(
      ADA,
      host.rpc('Submit', {
        protocolId,
        requestId: randomUUID(),
        sectionId: stage.sectionId,
        document: held.document,
        revision: held.revision,
        promote: { editId: OTHER_EDIT, resourceIds: [resourceId] },
      }),
    );
    await call(
      ADA,
      host.rpc('ReleaseLock', { protocolId, sectionId: stage.sectionId }),
    );

    const staging = holdingStaging();
    const other = await createProtocolBuilderClient(studio, {
      objectStore,
      staged: staging.layer,
    });
    try {
      const reading = staging.next();
      const inspected = other.callExit(
        callerOf(who),
        other.rpc('ResourcesInspect', { protocolId, editId: EDIT, resourceId }),
      );
      await reading.reached;
      await remove();
      reading.release();
      await expectRpcFailure(inspected, 'ProtocolNotFound');
    } finally {
      await restore();
      await other.dispose();
    }
  });
});
