import { beforeEach, describe, expect, it, vi } from 'vitest';

// The shared contract every ProtocolBuilderResourceGateway adapter must pass —
// the in-memory proof adapter here, Architect's adapter, and eventually
// Studio's. It is imported only from test files (vitest is a devDependency and
// no runtime module imports this one), and it lives in `src` rather than
// `__tests__` so an adapter that lives in another workspace can run it.
import { assetSchema } from '@codaco/protocol-validation';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import type {
  ManifestApplyOutcome,
  ManifestApplyRequest,
  ProtocolBuilderResourceGateway,
  ResourceDescriptor,
  ResourceGatewayFailure,
  ResourceResult,
} from './gateway.ts';

/**
 * What an adapter must expose for the contract to observe host state it cannot
 * reach through the port itself. Everything here is a test control; none of it
 * belongs on {@link ProtocolBuilderResourceGateway}.
 */
export type ResourceGatewayContractHarness = Readonly<{
  gateway: ProtocolBuilderResourceGateway;
  /** The committed manifest the host would serve right now, keyed by asset id. */
  committedManifest(): Readonly<Record<string, unknown>>;
  /**
   * Every key the host still holds on behalf of staging — descriptors, bytes,
   * secret handles, remembered stage requests, unreleased previews. Discarding
   * everything must empty it.
   */
  stagingResidue(): readonly string[];
  /** Arrange the next promotion to fail after some, but not all, bytes moved. */
  failNextPromotionPartially(): void;
  /** Arrange the next download to fail transiently, exactly once. */
  failNextDownloadTransiently(): void;
  /**
   * Stage a resource this adapter can hold but cannot write a schema-valid
   * manifest entry for — content that arrived with no filename is the ordinary
   * case — and return its id. Promotion must refuse it rather than move its
   * bytes behind an entry the protocol format rejects.
   */
  stageUnmanifestableResource(): Promise<string> | string;
  /**
   * Host storage details (bucket or key prefixes, database names, endpoints)
   * that must never appear in anything the gateway returns. Required: a
   * harness that named none would leave the leak test asserting nothing.
   */
  storageMarkers: readonly string[];
}>;

/** The committed resource every harness must seed before the contract runs. */
export const RESOURCE_GATEWAY_CONTRACT_SEED = Object.freeze({
  committedImage: Object.freeze({
    id: 'committed-backdrop',
    name: 'Committed backdrop',
    source: 'committed-backdrop.png',
    contentType: 'image/png',
  }),
});

/** The exact bytes the seeded committed image must hold. */
export function resourceGatewayContractImageBytes(): Uint8Array {
  return Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 7, 8, 9, 10]);
}

const STAGED_IMAGE_BYTES = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]);
const STAGED_ROSTER_BYTES = new TextEncoder().encode(
  JSON.stringify({ nodes: [{ attributes: { name: 'Ada' } }], edges: [] }),
);
/** A roster as researchers most often have one: a spreadsheet export. */
const STAGED_CSV_ROSTER_BYTES = new TextEncoder().encode(
  'name,role\nAda,engineer\nGrace,mathematician\n',
);
/** Distinctive so a leak anywhere in a serialized surface is unambiguous. */
const SECRET_VALUE = 'pk.contract-secret-must-never-appear';

const ASSETS_SECTION = sectionId({ kind: 'assets' });

export function describeResourceGatewayContract(
  name: string,
  createHarness: () =>
    | ResourceGatewayContractHarness
    | Promise<ResourceGatewayContractHarness>,
): void {
  describe(`resource gateway contract: ${name}`, () => {
    let current: ResourceGatewayContractHarness | undefined;

    beforeEach(async () => {
      current = await createHarness();
    });

    const harness = (): ResourceGatewayContractHarness => {
      if (current === undefined) throw new Error('the harness was not created');
      return current;
    };
    const gateway = (): ProtocolBuilderResourceGateway => harness().gateway;

    const stageImage = async (
      requestId = 'request-image',
    ): Promise<ResourceDescriptor> =>
      expectOk(
        await gateway().stageUpload({
          requestId,
          kind: 'image',
          name: 'Staged backdrop',
          source: 'staged-backdrop.png',
          contentType: 'image/png',
          bytes: STAGED_IMAGE_BYTES,
        }),
      );

    const stageRoster = async (
      requestId = 'request-roster',
    ): Promise<ResourceDescriptor> =>
      expectOk(
        await gateway().stageUpload({
          requestId,
          kind: 'network',
          name: 'Staged roster',
          source: 'staged-roster.json',
          contentType: 'application/json',
          bytes: STAGED_ROSTER_BYTES,
        }),
      );

    /** Stages an arbitrary network document, for the rosters that are wrong. */
    const stageJsonRoster = async (
      requestId: string,
      network: unknown,
    ): Promise<ResourceDescriptor> =>
      expectOk(
        await gateway().stageUpload({
          requestId,
          kind: 'network',
          name: 'Staged JSON roster',
          source: `${requestId}.json`,
          contentType: 'application/json',
          bytes: new TextEncoder().encode(JSON.stringify(network)),
        }),
      );

    const stageCsvRoster = async (
      requestId = 'request-csv-roster',
    ): Promise<ResourceDescriptor> =>
      expectOk(
        await gateway().stageUpload({
          requestId,
          kind: 'network',
          name: 'Staged CSV roster',
          source: 'staged-roster.csv',
          contentType: 'text/csv',
          bytes: STAGED_CSV_ROSTER_BYTES,
        }),
      );

    const stageSecret = async (requestId = 'request-secret') =>
      expectOk(
        await gateway().stageSecret({
          requestId,
          name: 'Map token',
          value: SECRET_VALUE,
        }),
      );

    it('lists the committed manifest and nothing staged', async () => {
      const listed = expectOk(await gateway().list());

      expect(listed.map((descriptor) => descriptor.id)).toEqual([
        RESOURCE_GATEWAY_CONTRACT_SEED.committedImage.id,
      ]);
      expect(listed[0]?.status).toBe('committed');
      expect(harness().stagingResidue()).toEqual([]);
    });

    it('stages an upload with a referenceable asset id, outside the committed manifest', async () => {
      const staged = await stageImage();

      expect(staged.status).toBe('staged');
      expect(staged.id).not.toBe('');
      expect(staged.source).toBe('staged-backdrop.png');
      // A draft may reference the id immediately …
      const listed = expectOk(await gateway().list({ status: 'staged' }));
      expect(listed.map((descriptor) => descriptor.id)).toEqual([staged.id]);
      // … while the committed manifest still knows nothing about it.
      expect(Object.keys(harness().committedManifest())).toEqual([
        RESOURCE_GATEWAY_CONTRACT_SEED.committedImage.id,
      ]);
    });

    it('stages once when an uncertain upload is retried', async () => {
      const first = await stageImage('request-retry');
      const second = await stageImage('request-retry');

      expect(second.id).toBe(first.id);
      expect(expectOk(await gateway().list({ status: 'staged' }))).toHaveLength(
        1,
      );
    });

    it('keeps an upload and a secret that share a request id apart', async () => {
      // A request id is unique to the picker that made it, not across pickers:
      // two of them can hand the host the same id for entirely different work.
      const upload = await stageImage('request-shared');
      const secret = await stageSecret('request-shared');

      expect(secret.descriptor.id).not.toBe(upload.id);

      const retriedUpload = await stageImage('request-shared');
      const retriedSecret = await stageSecret('request-shared');

      // Each retry is its own operation's retry: an upload that came back as
      // the secret's descriptor would put a key where a file belongs.
      expect(retriedUpload.id).toBe(upload.id);
      expect(retriedUpload.kind).toBe('image');
      expect(retriedSecret.descriptor.id).toBe(secret.descriptor.id);
      expect(String(retriedSecret.handle)).toBe(String(secret.handle));
      expect(
        expectOk(await gateway().list({ status: 'staged' }))
          .map((descriptor) => descriptor.id)
          .toSorted(),
      ).toEqual([upload.id, secret.descriptor.id].toSorted());

      // Discarding one must not take the other's retry identity with it.
      expectOk(await gateway().discardStaged(upload.id));

      expect((await stageSecret('request-shared')).descriptor.id).toBe(
        secret.descriptor.id,
      );
    });

    it('stages a secret as an opaque handle and keeps the value off every surface', async () => {
      const secret = await stageSecret();

      expect(secret.descriptor.kind).toBe('apikey');
      expect(secret.descriptor.status).toBe('staged');
      expect(String(secret.handle)).not.toContain(SECRET_VALUE);
      expect(SECRET_VALUE).not.toContain(String(secret.handle));

      const listed = expectOk(await gateway().list());
      const inspected = expectOk(await gateway().inspect(secret.descriptor.id));
      const previewFailure = expectFailure(
        await gateway().resolvePreview(secret.descriptor.id),
      );
      const downloadFailure = expectFailure(
        await gateway().download(secret.descriptor.id),
      );
      // What a stage draft would actually hold: the asset id, never the value.
      const draftSnapshot = {
        editedSection: { fields: { token: secret.descriptor.id } },
        resources: listed,
        inspected,
        failures: [previewFailure, downloadFailure],
        handle: secret.handle,
        descriptor: secret.descriptor,
      };

      expect(JSON.stringify(draftSnapshot)).not.toContain(SECRET_VALUE);
      expect(JSON.stringify(harness().stagingResidue())).not.toContain(
        SECRET_VALUE,
      );
    });

    it('refuses to preview or download secret material', async () => {
      const secret = await stageSecret();

      expect(
        expectFailure(await gateway().resolvePreview(secret.descriptor.id))
          .reason,
      ).toBe('unsupported-kind');
      expect(
        expectFailure(await gateway().download(secret.descriptor.id)).reason,
      ).toBe('unsupported-kind');
    });

    it('resolves previews for committed and staged content', async () => {
      const staged = await stageImage();

      const committedPreview = expectOk(
        await gateway().resolvePreview(
          RESOURCE_GATEWAY_CONTRACT_SEED.committedImage.id,
        ),
      );
      const stagedPreview = expectOk(await gateway().resolvePreview(staged.id));

      expect(committedPreview.url).not.toBe('');
      expect(stagedPreview.url).not.toBe('');
      expect(stagedPreview.resourceId).toBe(staged.id);
      stagedPreview.release();
      committedPreview.release();
    });

    it('inspects committed and staged resources and reports anything else as not-found', async () => {
      const staged = await stageRoster();

      expect(expectOk(await gateway().inspect(staged.id)).descriptor.id).toBe(
        staged.id,
      );
      expect(
        expectOk(
          await gateway().inspect(
            RESOURCE_GATEWAY_CONTRACT_SEED.committedImage.id,
          ),
        ).descriptor.status,
      ).toBe('committed');

      const failure = expectFailure(
        await gateway().inspect('no-such-resource'),
      );
      expect(failure.reason).toBe('not-found');
      expect(failure.retryable).toBe(false);
    });

    it('reads a CSV roster as one node per row, with its columns as attributes', async () => {
      const roster = await stageCsvRoster();

      const inspection = expectOk(await gateway().inspect(roster.id));

      // A CSV roster is as ordinary as a JSON one — it is what a spreadsheet
      // exports — so an adapter that cannot read one leaves the researcher
      // choosing between rosters it can tell them nothing about.
      expect(inspection.counts).toEqual({ nodes: 2, edges: 0 });
      expect([...(inspection.variableNames ?? [])].toSorted()).toEqual([
        'name',
        'role',
      ]);
    });

    it('refuses a JSON roster whose entries are not objects, and names the one that is not', async () => {
      const holed = await stageJsonRoster('request-holed-roster', {
        nodes: [{ attributes: { name: 'Ada' } }, null],
        edges: [],
      });
      const badAttributes = await stageJsonRoster(
        'request-bad-attributes-roster',
        { nodes: [{ attributes: 'Ada' }], edges: [] },
      );

      const holedFailure = expectFailure(await gateway().inspect(holed.id));
      const attributesFailure = expectFailure(
        await gateway().inspect(badAttributes.id),
      );

      // The interview's own loader throws on both of these, so an adapter that
      // only counts the array lets a protocol commit a field pointing at a
      // roster that fails the moment the interview opens it — with a manifest
      // entry that looks perfectly valid. The row is named because that is the
      // one thing the researcher has to go and fix.
      expect(holedFailure.reason).toBe('invalid-content');
      expect(holedFailure.retryable).toBe(false);
      expect(holedFailure.message).toContain('node 2');
      expect(attributesFailure.reason).toBe('invalid-content');
      expect(attributesFailure.message).toContain('node 1');
    });

    it('refuses a JSON roster carrying an attribute value the interview cannot hold, and names it', async () => {
      const roster = await stageJsonRoster('request-nested-value-roster', {
        nodes: [
          { attributes: { name: 'Ada' } },
          { attributes: { name: 'Grace', address: { city: 'Arlington' } } },
        ],
        edges: [],
      });

      const failure = expectFailure(await gateway().inspect(roster.id));

      // The interview parses every attribute value through the same schema
      // that decides what a variable may hold, and throws on one it rejects.
      // An adapter that checks only the shape of the attributes object lets a
      // protocol commit a field pointing at a roster that fails the moment the
      // interview opens it. The attribute is named alongside its row because
      // between them they are the whole of what the researcher has to fix.
      expect(failure.reason).toBe('invalid-content');
      expect(failure.retryable).toBe(false);
      expect(failure.message).toContain('node 2');
      expect(failure.message).toContain('address');
    });

    it('reads the attribute values the interview accepts, and passes over the empty ones', async () => {
      const roster = await stageJsonRoster('request-value-shapes-roster', {
        nodes: [
          {
            attributes: {
              name: 'Ada',
              age: 36,
              consented: true,
              languages: ['English', 'French'],
              home: { x: 0.25, y: 0.5 },
              nickname: null,
            },
          },
        ],
        edges: [],
      });

      const inspection = expectOk(await gateway().inspect(roster.id));

      // Every one of these is a value a variable holds — a layout coordinate
      // and a categorical selection included — and a null is a cell the
      // researcher left empty, which the interview skips rather than refuses.
      // An adapter stricter than the runtime turns ordinary rosters away.
      expect(inspection.counts).toEqual({ nodes: 1, edges: 0 });
      expect([...(inspection.variableNames ?? [])].toSorted()).toEqual([
        'age',
        'consented',
        'home',
        'languages',
        'name',
        'nickname',
      ]);
    });

    it('reads a CSV roster column named with dots as one attribute', async () => {
      const roster = expectOk(
        await gateway().stageUpload({
          requestId: 'request-dotted-csv-roster',
          kind: 'network',
          name: 'Roster with a dotted column',
          source: 'dotted-roster.csv',
          contentType: 'text/csv',
          bytes: new TextEncoder().encode(
            'name,home.city\nAda,London\nGrace,Arlington\n',
          ),
        }),
      );

      const inspection = expectOk(await gateway().inspect(roster.id));

      // A spreadsheet exports a column called `home.city` as one column, and
      // the interview reads it as one attribute of that name. An adapter whose
      // CSV parser folds the dots into a nested object reports a variable the
      // roster does not have — and gives that variable a value no attribute may
      // hold, so the roster it just described would also be refused.
      expect(inspection.counts).toEqual({ nodes: 2, edges: 0 });
      expect([...(inspection.variableNames ?? [])].toSorted()).toEqual([
        'home.city',
        'name',
      ]);
    });

    it('downloads the exact bytes of committed and staged content', async () => {
      const staged = await stageImage();

      const committed = expectOk(
        await gateway().download(
          RESOURCE_GATEWAY_CONTRACT_SEED.committedImage.id,
        ),
      );
      expect([...committed.bytes]).toEqual([
        ...resourceGatewayContractImageBytes(),
      ]);

      const stagedContent = expectOk(await gateway().download(staged.id));
      expect([...stagedContent.bytes]).toEqual([...STAGED_IMAGE_BYTES]);
    });

    it('reports a transient failure as retryable and succeeds when retried', async () => {
      const staged = await stageImage();
      harness().failNextDownloadTransiently();

      const failure = expectFailure(await gateway().download(staged.id));
      expect(failure.retryable).toBe(true);

      const retried = expectOk(await gateway().download(staged.id));
      expect([...retried.bytes]).toEqual([...STAGED_IMAGE_BYTES]);
    });

    it('discards one staged resource and leaves the others staged', async () => {
      const image = await stageImage();
      const roster = await stageRoster();

      expectOk(await gateway().discardStaged(image.id));

      expect(
        expectOk(await gateway().list({ status: 'staged' })).map(
          (descriptor) => descriptor.id,
        ),
      ).toEqual([roster.id]);
      expect(expectFailure(await gateway().download(image.id)).reason).toBe(
        'not-found',
      );
    });

    it('discards all staging with no residue and no change to the committed manifest', async () => {
      const image = await stageImage();
      const secret = await stageSecret();
      const preview = expectOk(await gateway().resolvePreview(image.id));
      expect(preview.url).not.toBe('');

      expectOk(await gateway().discardAllStaged());

      expect(harness().stagingResidue()).toEqual([]);
      expect(expectOk(await gateway().list({ status: 'staged' }))).toEqual([]);
      expect(expectFailure(await gateway().inspect(image.id)).reason).toBe(
        'not-found',
      );
      expect(
        expectFailure(await gateway().inspect(secret.descriptor.id)).reason,
      ).toBe('not-found');
      expect(Object.keys(harness().committedManifest())).toEqual([
        RESOURCE_GATEWAY_CONTRACT_SEED.committedImage.id,
      ]);
    });

    it('promotes every staged resource and its manifest entry together', async () => {
      const image = await stageImage();
      const secret = await stageSecret();
      const applied: ManifestApplyRequest[] = [];

      const promotion = expectOk(
        await gateway().promote({
          id: 'promotion-1',
          resourceIds: [image.id, secret.descriptor.id],
          secretHandles: [secret.handle],
          applyManifest: (request) => {
            applied.push(request);
            return { status: 'applied' };
          },
        }),
      );

      expect(applied).toHaveLength(1);
      const request = applied[0];
      expect(request?.sectionId).toBe(ASSETS_SECTION);
      expect(request?.commands.map((command) => command.key)).toEqual([
        image.id,
        secret.descriptor.id,
      ]);
      for (const command of request?.commands ?? []) {
        expect(command.op).toBe('set');
        expect(
          assetSchema.safeParse(
            command.op === 'set' ? command.value : undefined,
          ).success,
        ).toBe(true);
      }

      expect(promotion.promoted.map((descriptor) => descriptor.status)).toEqual(
        ['committed', 'committed'],
      );
      expect(Object.keys(harness().committedManifest()).toSorted()).toEqual(
        [
          RESOURCE_GATEWAY_CONTRACT_SEED.committedImage.id,
          image.id,
          secret.descriptor.id,
        ].toSorted(),
      );
      expect(harness().stagingResidue()).toEqual([]);
    });

    it('rolls a partially failed promotion back completely and reports it as retryable', async () => {
      const image = await stageImage();
      const roster = await stageRoster();
      const applyManifest = vi.fn((): ManifestApplyOutcome => ({
        status: 'applied',
      }));
      harness().failNextPromotionPartially();

      const failure = expectFailure(
        await gateway().promote({
          id: 'promotion-partial',
          resourceIds: [image.id, roster.id],
          applyManifest,
        }),
      );

      expect(failure.reason).toBe('promotion-failed');
      expect(failure.retryable).toBe(true);
      expect(applyManifest).not.toHaveBeenCalled();
      expect(Object.keys(harness().committedManifest())).toEqual([
        RESOURCE_GATEWAY_CONTRACT_SEED.committedImage.id,
      ]);
      expect(
        expectOk(await gateway().list({ status: 'staged' })).map(
          (descriptor) => descriptor.id,
        ),
      ).toEqual([image.id, roster.id].toSorted());
    });

    it('rolls the promotion back when the manifest half cannot be applied', async () => {
      const image = await stageImage();

      const failure = expectFailure(
        await gateway().promote({
          id: 'promotion-manifest-failure',
          resourceIds: [image.id],
          applyManifest: () => ({
            status: 'failed',
            retryable: true,
            message: 'another editor is changing the same sections',
          }),
        }),
      );

      expect(failure.reason).toBe('promotion-failed');
      expect(failure.retryable).toBe(true);
      expect(Object.keys(harness().committedManifest())).toEqual([
        RESOURCE_GATEWAY_CONTRACT_SEED.committedImage.id,
      ]);
      expect(
        expectOk(await gateway().list({ status: 'staged' })).map(
          (descriptor) => descriptor.id,
        ),
      ).toEqual([image.id]);
    });

    it('promotes exactly once when a failed promotion is retried', async () => {
      const image = await stageImage();
      let attempt = 0;
      const applyManifest = vi.fn((): ManifestApplyOutcome => {
        attempt += 1;
        return attempt === 1
          ? {
              status: 'failed',
              retryable: true,
              message: 'the protocol changed while finishing',
            }
          : { status: 'applied' };
      });
      const promotion = {
        id: 'promotion-retry',
        resourceIds: [image.id],
        applyManifest,
      };

      expectFailure(await gateway().promote(promotion));
      const retried = expectOk(await gateway().promote(promotion));
      const repeated = expectOk(await gateway().promote(promotion));

      expect(applyManifest).toHaveBeenCalledTimes(2);
      expect(retried.promoted.map((descriptor) => descriptor.id)).toEqual([
        image.id,
      ]);
      expect(repeated.promoted.map((descriptor) => descriptor.id)).toEqual([
        image.id,
      ]);
      expect(Object.keys(harness().committedManifest()).toSorted()).toEqual(
        [RESOURCE_GATEWAY_CONTRACT_SEED.committedImage.id, image.id].toSorted(),
      );
      expect(harness().stagingResidue()).toEqual([]);
    });

    it('coalesces concurrent promotions of one id into a single apply', async () => {
      const image = await stageImage();
      let releaseApply: (() => void) | undefined;
      const applyGate = new Promise<void>((resolve) => {
        releaseApply = resolve;
      });
      let applies = 0;
      // The second apply fails, so a gateway that runs it rolls back — and the
      // rollback deletes what the first apply committed.
      const applyManifest = vi.fn(async (): Promise<ManifestApplyOutcome> => {
        applies += 1;
        if (applies > 1) {
          return {
            status: 'failed',
            retryable: true,
            message: 'the protocol changed while finishing',
          };
        }
        await applyGate;
        return { status: 'applied' };
      });
      const promotion = {
        id: 'promotion-concurrent',
        resourceIds: [image.id],
        applyManifest,
      };

      const first = gateway().promote(promotion);
      const second = gateway().promote(promotion);
      releaseApply?.();
      const outcomes = [expectOk(await first), expectOk(await second)];

      expect(applyManifest).toHaveBeenCalledTimes(1);
      expect(outcomes[1]).toEqual(outcomes[0]);
      expect(outcomes[0]?.promoted.map((descriptor) => descriptor.id)).toEqual([
        image.id,
      ]);
      expect(Object.keys(harness().committedManifest()).toSorted()).toEqual(
        [RESOURCE_GATEWAY_CONTRACT_SEED.committedImage.id, image.id].toSorted(),
      );
      expect(harness().stagingResidue()).toEqual([]);
    });

    it('refuses to promote an unknown resource or a secret without its handle', async () => {
      const secret = await stageSecret();
      const applyManifest = vi.fn((): ManifestApplyOutcome => ({
        status: 'applied',
      }));

      const unknown = expectFailure(
        await gateway().promote({
          id: 'promotion-unknown',
          resourceIds: ['no-such-resource'],
          applyManifest,
        }),
      );
      const withoutHandle = expectFailure(
        await gateway().promote({
          id: 'promotion-handleless',
          resourceIds: [secret.descriptor.id],
          applyManifest,
        }),
      );

      expect(unknown.reason).toBe('not-found');
      expect(withoutHandle.reason).toBe('invalid-request');
      expect(withoutHandle.retryable).toBe(false);
      expect(applyManifest).not.toHaveBeenCalled();
      expect(Object.keys(harness().committedManifest())).toEqual([
        RESOURCE_GATEWAY_CONTRACT_SEED.committedImage.id,
      ]);
    });

    it('refuses to promote a resource it cannot write a valid manifest entry for', async () => {
      const resourceId = await harness().stageUnmanifestableResource();
      const applyManifest = vi.fn((): ManifestApplyOutcome => ({
        status: 'applied',
      }));

      const failure = expectFailure(
        await gateway().promote({
          id: 'promotion-unmanifestable',
          resourceIds: [resourceId],
          applyManifest,
        }),
      );

      // The schema decides, before anything moves: an entry it rejects would
      // commit bytes the protocol cannot name, which no rollback undoes once
      // the revision is published.
      expect(failure.reason).toBe('invalid-content');
      expect(failure.resourceId).toBe(resourceId);
      expect(applyManifest).not.toHaveBeenCalled();
      expect(Object.keys(harness().committedManifest())).toEqual([
        RESOURCE_GATEWAY_CONTRACT_SEED.committedImage.id,
      ]);
    });

    it('keeps host storage details out of every failure it reports', async () => {
      const markers = harness().storageMarkers;
      // Without markers the loop below would assert nothing, and an adapter
      // could leak every key it has and still pass.
      expect(markers).not.toEqual([]);
      const staged = await stageImage();
      harness().failNextDownloadTransiently();

      const failures = [
        expectFailure(await gateway().download(staged.id)),
        expectFailure(await gateway().inspect('no-such-resource')),
        expectFailure(await gateway().resolvePreview('no-such-resource')),
        expectFailure(
          await gateway().promote({
            id: 'promotion-missing',
            resourceIds: ['no-such-resource'],
            applyManifest: () => ({ status: 'applied' }),
          }),
        ),
      ];

      for (const failure of failures) {
        expect(failure.message).not.toBe('');
        expect(typeof failure.retryable).toBe('boolean');
        for (const marker of markers) {
          expect(JSON.stringify(failure)).not.toContain(marker);
        }
      }
    });
  });
}

function expectOk<T>(result: ResourceResult<T>): T {
  if (result.status !== 'ok') {
    throw new Error(
      `expected an ok resource result, got ${result.failure.reason}: ${result.failure.message}`,
    );
  }
  return result.data;
}

function expectFailure<T>(result: ResourceResult<T>): ResourceGatewayFailure {
  if (result.status !== 'failed') {
    throw new Error('expected a failed resource result');
  }
  return result.failure;
}
