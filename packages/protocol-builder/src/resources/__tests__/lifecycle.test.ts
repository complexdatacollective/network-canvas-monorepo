import { describe, expect, it, vi } from 'vitest';

import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import type {
  ManifestApplyRequest,
  ProtocolBuilderResourceGateway,
  ResourceDescriptor,
  ResourceResult,
  StagedSecretHandle,
} from '../gateway.ts';
import { InMemoryResourceGateway } from '../InMemoryResourceGateway.ts';
import {
  assetsSectionForValidation,
  createStagedResourceTracker,
  draftResourceIssues,
  finishStagedResources,
  mergeDraftValidationIssues,
  planStagedResourceFinish,
  stageIndexForValidation,
} from '../lifecycle.ts';

const ASSETS_SECTION = sectionId({ kind: 'assets' });
const STAGE_ORDER_SECTION = sectionId({ kind: 'stageOrder' });
const SECRET_VALUE = 'pk.lifecycle-secret-must-never-appear';

const IMAGE_BYTES = Uint8Array.from([1, 2, 3, 4]);

function informationStage(...assetIds: readonly string[]): SectionDoc {
  return {
    id: 'stage-1',
    type: 'Information',
    title: 'Welcome',
    items: assetIds.map((assetId, index) => ({
      id: `item-${index}`,
      type: 'asset',
      content: assetId,
    })),
  };
}

function geospatialStage(tokenAssetId: string): SectionDoc {
  return {
    id: 'stage-1',
    type: 'Geospatial',
    subject: { entity: 'node', type: 'person' },
    mapOptions: {
      tokenAssetId,
      style: 'mapbox://styles/mapbox/standard',
      center: [0, 0],
      initialZoom: 1,
      dataSourceAssetId: 'committed-map',
      color: 'node-color-seq-1',
      targetFeatureProperty: 'name',
    },
  };
}

/**
 * A host whose staging calls hang until the test releases them — an upload or
 * a secret still in flight, which is the only way to observe what a session
 * does with a result that lands after it stopped staging.
 */
function gatedStagingHost(host: ProtocolBuilderResourceGateway): Readonly<{
  gateway: ProtocolBuilderResourceGateway;
  release(): void;
}> {
  let release = (): void => undefined;
  const staged = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    release: () => {
      release();
    },
    gateway: {
      list: (options) => host.list(options),
      inspect: (resourceId) => host.inspect(resourceId),
      download: (resourceId) => host.download(resourceId),
      resolvePreview: (resourceId) => host.resolvePreview(resourceId),
      discardStaged: (resourceId) => host.discardStaged(resourceId),
      discardAllStaged: () => host.discardAllStaged(),
      promote: (request) => host.promote(request),
      stageUpload: async (request) => {
        await staged;
        return host.stageUpload(request);
      },
      stageSecret: async (request) => {
        await staged;
        return host.stageSecret(request);
      },
    },
  };
}

function createTracker(
  gateway: ProtocolBuilderResourceGateway,
  isEditable: () => boolean = () => true,
) {
  const onStagedChanged = vi.fn();
  const tracker = createStagedResourceTracker({
    gateway,
    isEditable,
    onStagedChanged,
  });
  return { onStagedChanged, tracker };
}

async function stageImage(
  gateway: ProtocolBuilderResourceGateway,
  requestId = 'request-image',
): Promise<ResourceDescriptor> {
  const result = await gateway.stageUpload({
    requestId,
    kind: 'image',
    name: 'Staged backdrop',
    source: `${requestId}.png`,
    contentType: 'image/png',
    bytes: IMAGE_BYTES,
  });
  return expectOk(result);
}

function expectOk<T>(result: ResourceResult<T>): T {
  if (result.status !== 'ok') {
    throw new Error(`expected an ok result, got ${result.failure.reason}`);
  }
  return result.data;
}

function expectFailure<T>(result: ResourceResult<T>) {
  if (result.status !== 'failed') {
    throw new Error('expected a failed result');
  }
  return result.failure;
}

describe('staged resource tracker', () => {
  it('records what the editors staged, descriptors only', async () => {
    const host = new InMemoryResourceGateway();
    const { onStagedChanged, tracker } = createTracker(host);

    const image = await stageImage(tracker.gateway);
    const secret = expectOk(
      await tracker.gateway.stageSecret({
        requestId: 'request-secret',
        name: 'Mapbox token',
        value: SECRET_VALUE,
      }),
    );

    expect(tracker.staged().map((descriptor) => descriptor.id)).toEqual([
      image.id,
      secret.descriptor.id,
    ]);
    expect(JSON.stringify(tracker.staged())).not.toContain(SECRET_VALUE);
    expect(tracker.secretHandle(secret.descriptor.id)).toBe(secret.handle);
    expect(tracker.secretHandle(image.id)).toBeUndefined();
    expect(onStagedChanged).toHaveBeenCalledTimes(2);
  });

  it('keeps a promoted resource resolvable until the authoritative manifest carries it', async () => {
    const host = new InMemoryResourceGateway();
    const { tracker } = createTracker(host);
    const image = await stageImage(tracker.gateway);
    expectOk(
      await tracker.gateway.promote({
        id: 'promotion-1',
        resourceIds: [image.id],
        applyManifest: () => ({ status: 'applied' }),
      }),
    );

    // Committed, so no longer staged — but the session's authoritative
    // sections still predate the revision that carries it.
    expect(tracker.staged()).toEqual([]);
    expect(tracker.promotedAwaitingManifest({})).toEqual([image]);
    expect(tracker.promotedAwaitingManifest(undefined)).toEqual([image]);

    // The revision arrives, and the tracker has nothing left to say about it.
    expect(
      tracker.promotedAwaitingManifest({
        [image.id]: { type: 'image', id: image.id, name: image.name },
      }),
    ).toEqual([]);
    expect(tracker.promotedAwaitingManifest({})).toEqual([]);
  });

  it('forgets a staged resource the host discarded', async () => {
    const host = new InMemoryResourceGateway();
    const { onStagedChanged, tracker } = createTracker(host);
    const image = await stageImage(tracker.gateway);
    onStagedChanged.mockClear();

    expect(await tracker.gateway.discardStaged(image.id)).toMatchObject({
      status: 'ok',
    });

    expect(tracker.staged()).toEqual([]);
    expect(host.getStagingResidue()).toEqual([]);
    expect(onStagedChanged).toHaveBeenCalledTimes(1);
  });

  it('refuses staging and promotion while the session is read-only, and keeps what is already staged', async () => {
    const host = new InMemoryResourceGateway();
    let editable = true;
    const { tracker } = createTracker(host, () => editable);
    const image = await stageImage(tracker.gateway);

    editable = false;
    const upload = await tracker.gateway.stageUpload({
      requestId: 'request-second',
      kind: 'image',
      name: 'Another backdrop',
      source: 'another.png',
      contentType: 'image/png',
      bytes: IMAGE_BYTES,
    });
    const secret = await tracker.gateway.stageSecret({
      requestId: 'request-secret',
      name: 'Mapbox token',
      value: SECRET_VALUE,
    });
    const promotion = await tracker.gateway.promote({
      id: 'promotion-1',
      resourceIds: [image.id],
      applyManifest: () => ({ status: 'applied' }),
    });

    expect(expectFailure(upload).reason).toBe('read-only');
    expect(expectFailure(secret).reason).toBe('read-only');
    expect(expectFailure(promotion).reason).toBe('read-only');
    // Losing the lease must not throw the researcher's work away.
    expect(tracker.staged().map((descriptor) => descriptor.id)).toEqual([
      image.id,
    ]);
    expect(host.getCommittedManifest()).toEqual({});
    // Discarding stays available: the host may still offer it as a recovery.
    expect(await tracker.gateway.discardStaged(image.id)).toMatchObject({
      status: 'ok',
    });
    expect(tracker.staged()).toEqual([]);
  });

  it('discards an upload that lands after the session cancelled', async () => {
    const host = new InMemoryResourceGateway();
    const gated = gatedStagingHost(host);
    const { tracker } = createTracker(gated.gateway);
    const staging = tracker.gateway.stageUpload({
      requestId: 'request-in-flight',
      kind: 'image',
      name: 'Staged backdrop',
      source: 'in-flight.png',
      contentType: 'image/png',
      bytes: IMAGE_BYTES,
    });

    expect(await tracker.cancel()).toMatchObject({ status: 'ok' });
    gated.release();
    const landed = await staging;

    // Nothing else would ever drop it: the cancel discarded once, before this
    // upload existed at the host.
    expect(expectFailure(landed).reason).toBe('not-found');
    expect(tracker.staged()).toEqual([]);
    expect(host.getStagingResidue()).toEqual([]);
  });

  it('discards a secret that lands after the session cancelled', async () => {
    const host = new InMemoryResourceGateway();
    const gated = gatedStagingHost(host);
    const { tracker } = createTracker(gated.gateway);
    const staging = tracker.gateway.stageSecret({
      requestId: 'request-in-flight',
      name: 'Mapbox token',
      value: SECRET_VALUE,
    });

    expect(await tracker.cancel()).toMatchObject({ status: 'ok' });
    gated.release();
    const landed = await staging;

    // A kept secret is worse than kept bytes: the host would go on holding the
    // key for an editing session that is over.
    expect(expectFailure(landed).reason).toBe('not-found');
    expect(tracker.staged()).toEqual([]);
    expect(host.getStagingResidue()).toEqual([]);
  });

  it('discards an upload that lands after the finish that did not promote it', async () => {
    const host = new InMemoryResourceGateway();
    const gated = gatedStagingHost(host);
    const { tracker } = createTracker(gated.gateway);
    const staging = tracker.gateway.stageUpload({
      requestId: 'request-in-flight',
      kind: 'image',
      name: 'Staged backdrop',
      source: 'in-flight.png',
      contentType: 'image/png',
      bytes: IMAGE_BYTES,
    });

    tracker.finished();
    gated.release();
    const landed = await staging;

    expect(expectFailure(landed).reason).toBe('not-found');
    expect(tracker.staged()).toEqual([]);
    expect(host.getStagingResidue()).toEqual([]);
  });

  it('keeps staging that starts after a finish, which belongs to the next edit', async () => {
    const host = new InMemoryResourceGateway();
    const { tracker } = createTracker(host);

    tracker.finished();
    const image = await stageImage(tracker.gateway, 'request-after-finish');

    expect(tracker.staged().map((descriptor) => descriptor.id)).toEqual([
      image.id,
    ]);
  });

  it('refuses to discard a resource the promotion in flight is deciding', async () => {
    const host = new InMemoryResourceGateway();
    const { tracker } = createTracker(host);
    const image = await stageImage(tracker.gateway);
    let discardDuringApply: ResourceResult<undefined> | undefined;
    let cancelDuringApply: ResourceResult<undefined> | undefined;

    const promotion = expectOk(
      await tracker.gateway.promote({
        id: 'promotion-1',
        resourceIds: [image.id],
        applyManifest: async () => {
          // What an editor cancelled mid-save does: the bytes have moved, and
          // the manifest entry for them is in this very apply.
          discardDuringApply = await tracker.gateway.discardStaged(image.id);
          cancelDuringApply = await tracker.cancel();
          return { status: 'applied' };
        },
      }),
    );

    expect(discardDuringApply).toMatchObject({
      status: 'failed',
      failure: { reason: 'unavailable', retryable: true, resourceId: image.id },
    });
    expect(cancelDuringApply).toMatchObject({
      status: 'failed',
      failure: { reason: 'unavailable', retryable: true },
    });
    expect(promotion.promoted.map((descriptor) => descriptor.id)).toEqual([
      image.id,
    ]);
    // The committed resource is still resolvable: had the discard gone
    // through, the promotion would have had nothing left to mark and the
    // stage that references it would read as pointing at nothing.
    expect(
      tracker.promotedAwaitingManifest({}).map((descriptor) => descriptor.id),
    ).toEqual([image.id]);
    expect(host.getCommittedManifest()).toMatchObject({
      [image.id]: { type: 'image' },
    });
  });

  it('leaves a promoted resource alone when everything staged is discarded', async () => {
    const host = new InMemoryResourceGateway();
    const { tracker } = createTracker(host);
    const promoted = await stageImage(tracker.gateway, 'request-promoted');
    await stageImage(tracker.gateway, 'request-abandoned');
    expectOk(
      await tracker.gateway.promote({
        id: 'promotion-1',
        resourceIds: [promoted.id],
        applyManifest: () => ({ status: 'applied' }),
      }),
    );

    expectOk(await tracker.gateway.discardAllStaged());

    expect(tracker.staged()).toEqual([]);
    // Discarding staging must not reach a resource that is no longer staging:
    // it is committed, and the session goes on resolving it until the host's
    // revision carries its manifest entry.
    expect(
      tracker.promotedAwaitingManifest({}).map((descriptor) => descriptor.id),
    ).toEqual([promoted.id]);
  });
});

describe('planStagedResourceFinish', () => {
  it('promotes what the draft references and discards what it does not', async () => {
    const host = new InMemoryResourceGateway();
    const kept = await stageImage(host, 'request-kept');
    const dropped = await stageImage(host, 'request-dropped');

    expect(
      planStagedResourceFinish(informationStage(kept.id), [kept, dropped]),
    ).toEqual({ promote: [kept.id], discard: [dropped.id] });
  });
});

describe('finishStagedResources', () => {
  it('applies the stage inside the promotion, so bytes and manifest land together', async () => {
    const host = new InMemoryResourceGateway();
    const { tracker } = createTracker(host);
    const referenced = await stageImage(tracker.gateway, 'request-referenced');
    const abandoned = await stageImage(tracker.gateway, 'request-abandoned');
    const applied: ManifestApplyRequest[] = [];

    const outcome = await finishStagedResources({
      gateway: tracker.gateway,
      promotionId: 'promotion-1',
      stageDocument: informationStage(referenced.id),
      staged: tracker.staged(),
      secretHandle: (resourceId) => tracker.secretHandle(resourceId),
      applyStage: (manifest) => {
        if (manifest !== undefined) applied.push(manifest);
        // The bytes have moved by now; the manifest has not been applied.
        expect(host.getCommittedManifest()).toMatchObject({
          [referenced.id]: { type: 'image' },
        });
        return Promise.resolve();
      },
    });

    expect(outcome).toMatchObject({
      status: 'finished',
      promoted: [{ id: referenced.id, status: 'committed' }],
      discarded: [abandoned.id],
    });
    expect(applied).toHaveLength(1);
    expect(applied[0]).toMatchObject({
      promotionId: 'promotion-1',
      sectionId: ASSETS_SECTION,
      commands: [{ op: 'set', key: referenced.id }],
    });
    expect(tracker.staged()).toEqual([]);
    expect(host.getStagingResidue()).toEqual([]);
  });

  it('resolves a staged secret at the host, never through the editor', async () => {
    const host = new InMemoryResourceGateway();
    const { tracker } = createTracker(host);
    const secret = expectOk(
      await tracker.gateway.stageSecret({
        requestId: 'request-secret',
        name: 'Mapbox token',
        value: SECRET_VALUE,
      }),
    );
    let manifest: ManifestApplyRequest | undefined;

    const outcome = await finishStagedResources({
      gateway: tracker.gateway,
      promotionId: 'promotion-1',
      stageDocument: geospatialStage(secret.descriptor.id),
      staged: tracker.staged(),
      secretHandle: (resourceId) => tracker.secretHandle(resourceId),
      applyStage: (request) => {
        manifest = request;
        return Promise.resolve();
      },
    });

    expect(outcome.status).toBe('finished');
    expect(JSON.stringify(manifest?.promoted)).not.toContain(SECRET_VALUE);
    // The value reaches the manifest only because the HOST resolved the handle.
    expect(host.getCommittedManifest()).toEqual({
      [secret.descriptor.id]: {
        type: 'apikey',
        id: secret.descriptor.id,
        name: 'Mapbox token',
        value: SECRET_VALUE,
      },
    });
  });

  it('leaves nothing committed and staging intact when the stage apply fails', async () => {
    const host = new InMemoryResourceGateway();
    const { tracker } = createTracker(host);
    const referenced = await stageImage(tracker.gateway, 'request-referenced');
    const abandoned = await stageImage(tracker.gateway, 'request-abandoned');
    const failure = new Error('the host refused the revision');

    const outcome = await finishStagedResources({
      gateway: tracker.gateway,
      promotionId: 'promotion-1',
      stageDocument: informationStage(referenced.id),
      staged: tracker.staged(),
      secretHandle: (resourceId) => tracker.secretHandle(resourceId),
      applyStage: () => Promise.reject(failure),
    });

    expect(outcome).toEqual({ status: 'apply-failed', error: failure });
    expect(host.getCommittedManifest()).toEqual({});
    expect(tracker.staged().map((descriptor) => descriptor.id)).toEqual([
      referenced.id,
      abandoned.id,
    ]);
  });

  it('reports a rolled-back promotion as retryable, and the retry promotes once', async () => {
    const host = new InMemoryResourceGateway();
    const { tracker } = createTracker(host);
    const first = await stageImage(tracker.gateway, 'request-first');
    const second = await stageImage(tracker.gateway, 'request-second');
    const stageDocument = informationStage(first.id, second.id);
    const applyStage = vi.fn(() => Promise.resolve());
    const finish = () =>
      finishStagedResources({
        gateway: tracker.gateway,
        promotionId: 'promotion-1',
        stageDocument,
        staged: tracker.staged(),
        secretHandle: (resourceId) => tracker.secretHandle(resourceId),
        applyStage,
      });

    host.failNextPromotionPartially();
    const failed = await finish();

    expect(failed).toMatchObject({
      status: 'promotion-failed',
      failure: { reason: 'promotion-failed', retryable: true },
    });
    // A partial promotion that rolled back committed nothing and applied
    // nothing, so the stage is still exactly as it was.
    expect(applyStage).not.toHaveBeenCalled();
    expect(host.getCommittedManifest()).toEqual({});
    expect(tracker.staged()).toHaveLength(2);

    const retried = await finish();

    expect(retried.status).toBe('finished');
    expect(applyStage).toHaveBeenCalledTimes(1);
    expect(Object.keys(host.getCommittedManifest())).toEqual([
      first.id,
      second.id,
    ]);
    expect(host.getStagingResidue()).toEqual([]);
  });

  it('applies a stage that promotes nothing, and still discards what it abandoned', async () => {
    const host = new InMemoryResourceGateway();
    const { tracker } = createTracker(host);
    const abandoned = await stageImage(tracker.gateway, 'request-abandoned');
    const applyStage = vi.fn(() => Promise.resolve());

    const outcome = await finishStagedResources({
      gateway: tracker.gateway,
      promotionId: 'promotion-1',
      stageDocument: informationStage(),
      staged: tracker.staged(),
      secretHandle: (resourceId) => tracker.secretHandle(resourceId),
      applyStage,
    });

    expect(outcome).toMatchObject({
      status: 'finished',
      promoted: [],
      discarded: [abandoned.id],
    });
    // No promotion, so no manifest rides with the stage's own commands.
    expect(applyStage).toHaveBeenCalledExactlyOnceWith();
    expect(host.getStagingResidue()).toEqual([]);
  });

  it('keeps what a stage that promotes nothing abandoned when its apply fails', async () => {
    const host = new InMemoryResourceGateway();
    const { tracker } = createTracker(host);
    const abandoned = await stageImage(tracker.gateway, 'request-abandoned');
    const failure = new Error('the host refused the revision');

    const outcome = await finishStagedResources({
      gateway: tracker.gateway,
      promotionId: 'promotion-1',
      stageDocument: informationStage(),
      staged: tracker.staged(),
      secretHandle: (resourceId) => tracker.secretHandle(resourceId),
      applyStage: () => Promise.reject(failure),
    });

    // The draft walked away from this resource, but the stage that walked away
    // was never saved: discarding before the apply settles would throw the
    // researcher's file away on the strength of an edit that did not happen.
    expect(outcome).toEqual({ status: 'apply-failed', error: failure });
    expect(tracker.staged().map((descriptor) => descriptor.id)).toEqual([
      abandoned.id,
    ]);
    expect(host.getStagingResidue()).not.toEqual([]);
  });
});

describe('assetsSectionForValidation', () => {
  const stagedImage: ResourceDescriptor = Object.freeze({
    id: 'staged-image',
    kind: 'image',
    name: 'Staged backdrop',
    status: 'staged',
    source: 'staged-backdrop.png',
  });
  const stagedSecret: ResourceDescriptor = Object.freeze({
    id: 'staged-secret',
    kind: 'apikey',
    name: 'Mapbox token',
    status: 'staged',
  });
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const handle = 'staged-secret-handle' as StagedSecretHandle;

  it('adds what promotion will write, with the handle standing in for a secret', () => {
    const section = assetsSectionForValidation(
      {
        committed: {
          type: 'image',
          id: 'committed',
          name: 'A',
          source: 'a.png',
        },
      },
      [stagedImage, stagedSecret],
      (resourceId) => (resourceId === stagedSecret.id ? handle : undefined),
    );

    expect(section).toEqual({
      'committed': {
        type: 'image',
        id: 'committed',
        name: 'A',
        source: 'a.png',
      },
      'staged-image': {
        type: 'image',
        id: 'staged-image',
        name: 'Staged backdrop',
        source: 'staged-backdrop.png',
      },
      'staged-secret': {
        type: 'apikey',
        id: 'staged-secret',
        name: 'Mapbox token',
        value: handle,
      },
    });
  });

  it('leaves out a staged resource the manifest could not record', () => {
    const withoutSource: ResourceDescriptor = Object.freeze({
      id: 'staged-image',
      kind: 'image',
      name: 'Staged backdrop',
      status: 'staged',
    });

    expect(
      assetsSectionForValidation(
        undefined,
        [withoutSource, stagedSecret],
        () => undefined,
      ),
    ).toEqual({});
  });
});

describe('draft resource validation', () => {
  const protocolSections: Record<string, SectionDoc> = {
    [STAGE_ORDER_SECTION]: { stages: ['stage-0', 'stage-1'] },
    [ASSETS_SECTION]: {
      committed: {
        type: 'image',
        id: 'committed',
        name: 'A',
        source: 'a.png',
      },
      broken: { type: 'image', id: 'broken', name: 'B' },
    },
  };

  it('reports only references that are neither committed nor staged', () => {
    const issues = draftResourceIssues({
      stageDocument: informationStage('committed', 'staged-1', 'missing'),
      protocolSections,
      stagedResourceIds: ['staged-1'],
      stageIndex: 1,
    });

    expect(issues).toEqual([
      {
        code: 'custom',
        path: ['stages', 1, 'items', 2, 'content'],
        message: expect.stringContaining('"missing"'),
        resourceId: 'missing',
      },
    ]);
  });

  it('reports a committed entry the protocol schema rejects', () => {
    const issues = draftResourceIssues({
      stageDocument: informationStage('broken'),
      protocolSections,
      stagedResourceIds: [],
      stageIndex: 0,
    });

    expect(issues).toHaveLength(1);
    expect(issues[0]?.resourceId).toBe('broken');
  });

  it('places the draft where the canonical protocol will put it', () => {
    expect(stageIndexForValidation(protocolSections, 'stage-1')).toBe(1);
    // A stage the order does not list yet is assembled at the end.
    expect(stageIndexForValidation(protocolSections, 'stage-new')).toBe(2);
    expect(stageIndexForValidation({}, 'stage-1')).toBe(0);
  });

  it('drops a resource problem the schema already reported for that field', () => {
    const path = ['stages', 0, 'items', 0, 'content'];
    const schemaIssue = {
      code: 'custom',
      path,
      message: 'Item "missing" does not reference an asset in the manifest.',
    };
    const resourceIssue = {
      code: 'custom',
      path,
      message:
        'This stage uses a resource ("missing") that is not in the protocol.',
    };
    const elsewhere = {
      code: 'custom',
      path: ['stages', 0, 'items', 1, 'content'],
      message:
        'This stage uses a resource ("other") that is not in the protocol.',
    };

    expect(
      mergeDraftValidationIssues([schemaIssue], [resourceIssue, elsewhere]),
    ).toEqual([schemaIssue, elsewhere]);
  });
});
