import { describe, expect, it } from 'vitest';

import { assetSchema } from '@codaco/protocol-validation';

import { type ResourceDescriptor, type ResourceResult } from '../gateway.ts';
import {
  describeResourceGatewayContract,
  RESOURCE_GATEWAY_CONTRACT_SEED,
  resourceGatewayContractImageBytes,
  type ResourceGatewayContractHarness,
} from '../gatewayContract.ts';
import { InMemoryResourceGateway } from '../InMemoryResourceGateway.ts';

const ROSTER_BYTES = new TextEncoder().encode(
  JSON.stringify({
    nodes: [
      { attributes: { name: 'Ada', role: 'engineer' } },
      { attributes: { name: 'Grace' } },
    ],
    edges: [{ from: 0, to: 1 }],
  }),
);

const SECRET_VALUE = 'pk.adapter-secret-must-never-appear';

function createGateway(
  options: Readonly<{ maxByteLength?: number }> = {},
): InMemoryResourceGateway {
  return new InMemoryResourceGateway({
    committed: [
      {
        kind: 'image',
        ...RESOURCE_GATEWAY_CONTRACT_SEED.committedImage,
        bytes: resourceGatewayContractImageBytes(),
      },
    ],
    ...(options.maxByteLength === undefined
      ? {}
      : { maxByteLength: options.maxByteLength }),
  });
}

function createHarness(): ResourceGatewayContractHarness {
  const gateway = createGateway();
  return {
    gateway,
    committedManifest: () => gateway.getCommittedManifest(),
    stagingResidue: () => gateway.getStagingResidue(),
    failNextPromotionPartially: () => {
      gateway.failNextPromotionPartially();
    },
    failNextDownloadTransiently: () => {
      gateway.failNext('download', { reason: 'unavailable' });
    },
    // Internal keys this adapter uses for staging; a failure that named one
    // would be leaking host storage detail into the editor.
    storageMarkers: ['content:', 'request:', 'preview-', 'staged-secret-'],
  };
}

describeResourceGatewayContract('InMemoryResourceGateway', createHarness);

describe('InMemoryResourceGateway', () => {
  const stageRoster = async (
    gateway: InMemoryResourceGateway,
    bytes: Uint8Array = ROSTER_BYTES,
  ): Promise<ResourceDescriptor> =>
    unwrap(
      await gateway.stageUpload({
        requestId: 'roster-request',
        kind: 'network',
        name: 'Roster',
        source: 'roster.json',
        contentType: 'application/json',
        bytes,
      }),
    );

  it('reports roster counts and attribute names when inspecting a network resource', async () => {
    const gateway = createGateway();
    const roster = await stageRoster(gateway);

    const inspection = unwrap(await gateway.inspect(roster.id));

    expect(inspection.counts).toEqual({ nodes: 2, edges: 1 });
    expect(inspection.variableNames).toEqual(['name', 'role']);
  });

  const stageCsvRoster = async (
    gateway: InMemoryResourceGateway,
    csv: string,
    source = 'roster.csv',
  ): Promise<ResourceDescriptor> =>
    unwrap(
      await gateway.stageUpload({
        requestId: `csv-${source}`,
        kind: 'network',
        name: 'CSV roster',
        source,
        contentType: 'text/csv',
        bytes: new TextEncoder().encode(csv),
      }),
    );

  it('reports row counts and column names when inspecting a CSV roster', async () => {
    const gateway = createGateway();
    const roster = await stageCsvRoster(
      gateway,
      'name,role\nAda,engineer\nGrace,mathematician\n',
    );

    const inspection = unwrap(await gateway.inspect(roster.id));

    // One node per row and no edges, which is the whole of what a CSV roster
    // can say — the same reading Architect gives the same file.
    expect(inspection.counts).toEqual({ nodes: 2, edges: 0 });
    expect(inspection.variableNames).toEqual(['name', 'role']);
  });

  it('reports a CSV roster whose rows do not match its header as invalid content', async () => {
    const gateway = createGateway();
    const roster = await stageCsvRoster(
      gateway,
      'name,role\nAda,engineer,extra\n',
    );

    const result = await gateway.inspect(roster.id);

    expect(result.status === 'failed' && result.failure.reason).toBe(
      'invalid-content',
    );
  });

  it('reads a roster by its filename rather than by its media type', async () => {
    const gateway = createGateway();
    // A CSV chosen from a file picker that reported no type at all: the
    // manifest's `source` is what says what the file is.
    const roster = unwrap(
      await gateway.stageUpload({
        requestId: 'untyped-csv',
        kind: 'network',
        name: 'CSV roster',
        source: 'roster.csv',
        contentType: 'application/octet-stream',
        bytes: new TextEncoder().encode('name,role\nAda,engineer\n'),
      }),
    );

    expect(unwrap(await gateway.inspect(roster.id)).counts).toEqual({
      nodes: 1,
      edges: 0,
    });
  });

  it('reports unreadable network content as invalid content', async () => {
    const gateway = createGateway();
    const roster = await stageRoster(
      gateway,
      new TextEncoder().encode('not json'),
    );

    const result = await gateway.inspect(roster.id);

    expect(result.status).toBe('failed');
    expect(result.status === 'failed' && result.failure.reason).toBe(
      'invalid-content',
    );
  });

  it('refuses content larger than the host will store', async () => {
    const gateway = createGateway({ maxByteLength: 4 });

    const result = await gateway.stageUpload({
      requestId: 'too-large',
      kind: 'image',
      name: 'Huge',
      source: 'huge.png',
      contentType: 'image/png',
      bytes: Uint8Array.from([1, 2, 3, 4, 5]),
    });

    expect(result.status === 'failed' && result.failure.reason).toBe(
      'too-large',
    );
    expect(result.status === 'failed' && result.failure.retryable).toBe(false);
  });

  it('refuses a filename that is not a plain manifest source', async () => {
    const gateway = createGateway();

    const result = await gateway.stageUpload({
      requestId: 'bad-source',
      kind: 'image',
      name: 'Traversal',
      source: '../escape.png',
      contentType: 'image/png',
      bytes: Uint8Array.from([1, 2, 3]),
    });

    expect(result.status === 'failed' && result.failure.reason).toBe(
      'invalid-request',
    );
  });

  it('refuses to stage or promote while the session is read-only', async () => {
    const gateway = createGateway();
    const staged = await stageRoster(gateway);
    gateway.setReadOnly(true);

    const upload = await gateway.stageUpload({
      requestId: 'while-read-only',
      kind: 'image',
      name: 'Blocked',
      source: 'blocked.png',
      contentType: 'image/png',
      bytes: Uint8Array.from([1, 2, 3]),
    });
    const promotion = await gateway.promote({
      id: 'while-read-only',
      resourceIds: [staged.id],
      applyManifest: () => ({ status: 'applied' }),
    });

    expect(upload.status === 'failed' && upload.failure.reason).toBe(
      'read-only',
    );
    expect(promotion.status === 'failed' && promotion.failure.reason).toBe(
      'read-only',
    );
  });

  it('forgets a discarded stage request so the same file stages again', async () => {
    const gateway = createGateway();
    const first = await stageRoster(gateway);

    unwrap(await gateway.discardStaged(first.id));
    const second = await stageRoster(gateway);

    expect(second.id).not.toBe(first.id);
    expect(second.status).toBe('staged');
  });

  it('applies an injected failure exactly once', async () => {
    const gateway = createGateway();
    gateway.failNext('list');

    const failed = await gateway.list();
    const recovered = await gateway.list();

    expect(failed.status).toBe('failed');
    expect(recovered.status).toBe('ok');
  });

  it('filters the listing by resource kind', async () => {
    const gateway = createGateway();
    await stageRoster(gateway);

    const images = unwrap(await gateway.list({ kinds: ['image'] }));
    const networks = unwrap(await gateway.list({ kinds: ['network'] }));

    expect(images.map((descriptor) => descriptor.kind)).toEqual(['image']);
    expect(networks.map((descriptor) => descriptor.kind)).toEqual(['network']);
  });

  it('writes secret material into the manifest entry only at promotion', async () => {
    const gateway = createGateway();
    const secret = unwrap(
      await gateway.stageSecret({
        requestId: 'secret-request',
        name: 'Map token',
        value: SECRET_VALUE,
      }),
    );

    // Before promotion the host holds it, and nothing the editor can see does.
    expect(JSON.stringify(gateway.getCommittedManifest())).not.toContain(
      SECRET_VALUE,
    );
    expect(JSON.stringify(unwrap(await gateway.list()))).not.toContain(
      SECRET_VALUE,
    );

    unwrap(
      await gateway.promote({
        id: 'secret-promotion',
        resourceIds: [secret.descriptor.id],
        secretHandles: [secret.handle],
        applyManifest: () => ({ status: 'applied' }),
      }),
    );

    const entry = gateway.getCommittedManifest()[secret.descriptor.id];
    const parsed = assetSchema.safeParse(entry);
    expect(parsed.success && parsed.data.type).toBe('apikey');
    expect(
      parsed.success && parsed.data.type === 'apikey' && parsed.data.value,
    ).toBe(SECRET_VALUE);
    // The promoted entry is the host boundary; the editor's own surfaces stay clean.
    expect(JSON.stringify(unwrap(await gateway.list()))).not.toContain(
      SECRET_VALUE,
    );
    expect(gateway.getStagingResidue()).toEqual([]);
  });

  it('refuses to promote a resource that is already committed', async () => {
    const gateway = createGateway();

    const result = await gateway.promote({
      id: 'already-committed',
      resourceIds: [RESOURCE_GATEWAY_CONTRACT_SEED.committedImage.id],
      applyManifest: () => ({ status: 'applied' }),
    });

    expect(result.status === 'failed' && result.failure.reason).toBe(
      'invalid-request',
    );
  });

  it('rolls back and reports a retryable failure when the manifest apply throws', async () => {
    const gateway = createGateway();
    const roster = await stageRoster(gateway);

    const result = await gateway.promote({
      id: 'throwing-apply',
      resourceIds: [roster.id],
      applyManifest: () => {
        throw new Error('the session lost its lease');
      },
    });

    expect(result.status === 'failed' && result.failure.reason).toBe(
      'promotion-failed',
    );
    expect(result.status === 'failed' && result.failure.retryable).toBe(true);
    expect(Object.keys(gateway.getCommittedManifest())).toEqual([
      RESOURCE_GATEWAY_CONTRACT_SEED.committedImage.id,
    ]);
    expect(unwrap(await gateway.list({ status: 'staged' }))).toHaveLength(1);
  });
});

function unwrap<T>(result: ResourceResult<T>): T {
  if (result.status !== 'ok') {
    throw new Error(
      `expected an ok resource result, got ${result.failure.reason}: ${result.failure.message}`,
    );
  }
  return result.data;
}
