import { beforeEach, describe, expect, it, vi } from 'vitest';

import { COMPATIBLE_PROTOCOL_SCHEMA_VERSION } from '@codaco/interview/protocol-schema-version';
import { hashProtocol, migrateProtocol } from '@codaco/protocol-validation';
import {
  buildAssetManifest,
  migrateProtocolsToCompatibleVersion,
} from '~/scripts/migrate-protocols';

/**
 * A minimal v7 protocol JSON containing the fields the v7→v8 migration
 * actually transforms (iconVariant on a node, Toggle with options, alter
 * filter rule). This lets the tests verify the real migration applies, not
 * just that some hand-rolled stub produced the right output.
 */
function makeV7Protocol() {
  return {
    schemaVersion: 7,
    description: 'Test protocol',
    lastModified: '2024-01-01T00:00:00.000Z',
    codebook: {
      node: {
        person: {
          name: 'Person',
          color: 'node-color-seq-1',
          iconVariant: 'add-a-person',
          variables: {
            isAttending: {
              name: 'isAttending',
              type: 'boolean',
              component: 'Toggle',
              options: [
                { label: 'Yes', value: true },
                { label: 'No', value: false },
              ],
            },
          },
        },
      },
      edge: {},
      ego: { variables: {} },
    },
    stages: [
      {
        id: 'stage-1',
        type: 'Information',
        label: 'Stage 1',
        items: [],
      },
    ],
  };
}

type MockPrisma = {
  protocol: {
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
  };
};

function makeMockPrisma(): MockPrisma {
  return {
    protocol: {
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn().mockResolvedValue(null),
    },
  };
}

// The script calls only these three methods of the transaction client.
const runMigration = (prisma: MockPrisma) =>
  migrateProtocolsToCompatibleVersion(
    prisma as unknown as Parameters<
      typeof migrateProtocolsToCompatibleVersion
    >[0],
  );

/** The one update the migration made, to assert on by property path. */
function onlyWrite(prisma: MockPrisma): unknown {
  expect(prisma.protocol.update).toHaveBeenCalledTimes(1);
  return prisma.protocol.update.mock.calls[0]?.[0];
}

/**
 * What a write put in the experiments column, for `toStrictEqual`: Prisma's
 * null markers have no enumerable keys, so `toEqual({})` would accept them.
 */
function experimentsWritten(written: unknown): unknown {
  if (typeof written !== 'object' || written === null) return undefined;
  if (!('data' in written)) return undefined;
  const { data } = written;
  if (typeof data !== 'object' || data === null) return undefined;
  return 'experiments' in data ? data.experiments : undefined;
}

const NAME_ATTRIBUTE = 'node.person.variables.name';

/**
 * `makeV7Protocol` with a text attribute marked `encrypted`, a mark the
 * migration to version 8 keeps and the one to version 9 removes unless the
 * protocol's experiments turned encryption on.
 */
function makeV7ProtocolWithEncryptedName() {
  const v7 = makeV7Protocol();
  return {
    ...v7,
    codebook: {
      ...v7.codebook,
      node: {
        person: {
          ...v7.codebook.node.person,
          variables: {
            ...v7.codebook.node.person.variables,
            name: { name: 'name', type: 'text', encrypted: true },
          },
        },
      },
    },
  };
}

/** A conformant version 8 row with an encrypted attribute. */
function makeEncryptedV8Row(experiments: unknown) {
  const v8 = migrateProtocol(
    { ...makeV7ProtocolWithEncryptedName(), name: 'Encrypted' },
    8,
    { name: 'Encrypted' },
  );
  return {
    id: 'cm-encrypted-v8',
    assets: [],
    name: 'Encrypted.netcanvas',
    schemaVersion: 8,
    stages: v8.stages,
    codebook: v8.codebook,
    experiments,
  };
}

/**
 * A row stored at `schemaVersion` whose body still has the legacy shapes only
 * normalization rewrites, with an encrypted attribute.
 */
function makeLegacyShapedEncryptedRow(
  schemaVersion: number,
  experiments: unknown,
) {
  const legacyShaped = makeV7ProtocolWithEncryptedName();
  return {
    id: 'cm-legacy-encrypted',
    assets: [],
    name: 'Legacy Encrypted.netcanvas',
    schemaVersion,
    stages: legacyShaped.stages,
    codebook: legacyShaped.codebook,
    experiments,
  };
}

describe('migrateProtocolsToCompatibleVersion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is a no-op when there are no v7 protocols', async () => {
    const prisma = makeMockPrisma();

    await runMigration(prisma);

    expect(prisma.protocol.update).not.toHaveBeenCalled();
  });

  it('migrates a v7 protocol row up to the compatible version and writes the result back', async () => {
    const v7 = makeV7Protocol();
    const prisma = makeMockPrisma();
    prisma.protocol.findMany.mockResolvedValue([
      {
        id: 'cm-protocol-1',
        assets: [],
        name: 'Test Protocol.netcanvas',
        schemaVersion: 7,
        stages: v7.stages,
        codebook: v7.codebook,
        experiments: null,
        description: v7.description,
        lastModified: new Date(v7.lastModified),
      },
    ]);

    await runMigration(prisma);

    expect(prisma.protocol.update).toHaveBeenCalledTimes(1);

    type UpdateCallArg = {
      where: { id: string };
      data: {
        schemaVersion: number;
        experiments: unknown;
        codebook: {
          node: { person: Record<string, unknown> };
        };
        hash: string;
      };
    };

    const rawCall: unknown = prisma.protocol.update.mock.calls[0]?.[0];
    expect(rawCall).toBeDefined();
    const updateCall = rawCall as UpdateCallArg;

    expect(updateCall.where).toEqual({ id: 'cm-protocol-1' });
    expect(updateCall.data.schemaVersion).toBe(
      COMPATIBLE_PROTOCOL_SCHEMA_VERSION,
    );
    // The migration to version 8 gives the protocol empty experiments.
    expect(updateCall.data.experiments).toStrictEqual({});

    // iconVariant → icon, with shape added
    const personNode = updateCall.data.codebook.node.person;
    expect(personNode.icon).toBe('add-a-person');
    expect(personNode).not.toHaveProperty('iconVariant');
    expect(personNode.shape).toEqual({ default: 'circle' });

    // Toggle options removed
    const toggleVar = personNode.variables as {
      isAttending: Record<string, unknown>;
    };
    expect(toggleVar.isAttending).not.toHaveProperty('options');

    // Hash recomputed
    expect(typeof updateCall.data.hash).toBe('string');
    expect(updateCall.data.hash.length).toBeGreaterThan(0);
  });

  it('produces a hash identical to what the import flow would produce', async () => {
    const v7 = makeV7Protocol();

    // (a) Run it through our migration script
    const prisma = makeMockPrisma();
    prisma.protocol.findMany.mockResolvedValue([
      {
        id: 'cm-x',
        assets: [],
        name: 'My Protocol.netcanvas',
        schemaVersion: 7,
        stages: v7.stages,
        codebook: v7.codebook,
        experiments: null,
        description: v7.description,
        lastModified: new Date(v7.lastModified),
      },
    ]);

    await runMigration(prisma);

    type UpdateCallArg = { data: { hash: string } };
    const dbCall = prisma.protocol.update.mock.calls[0]?.[0] as UpdateCallArg;
    const dbHash = dbCall.data.hash;

    // (b) Independently run the same v7 protocol through the same migration
    // chain the import flow uses (useProtocolImport.tsx strips .netcanvas
    // before passing as the `name` dependency).
    const importName = 'My Protocol.netcanvas'.replace(/\.netcanvas$/i, '');
    const importMigrated = migrateProtocol(
      { ...v7, name: importName },
      COMPATIBLE_PROTOCOL_SCHEMA_VERSION,
      { name: importName },
    );
    const importHash = hashProtocol(importMigrated);

    expect(dbHash).toBe(importHash);
  });

  it('leaves an unmigratable protocol in place without failing the deployment', async () => {
    // Rows stored under an older, more permissive validator can fail the
    // corrected rules; one such row must never block a customer's upgrade.
    // The runtime payload guard refuses its interviews instead.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const prisma = makeMockPrisma();
    prisma.protocol.findMany.mockResolvedValue([
      {
        id: 'cm-broken',
        assets: [],
        name: 'Broken Protocol.netcanvas',
        schemaVersion: 7,
        // `stages` is required to be an array — passing a non-array makes
        // VersionedProtocolSchema reject this protocol inside migrateProtocol.
        stages: 'not-an-array',
        codebook: { node: {}, edge: {}, ego: { variables: {} } },
        experiments: null,
        description: null,
        lastModified: new Date('2024-01-01T00:00:00.000Z'),
      },
    ]);

    await expect(runMigration(prisma)).resolves.toBeUndefined();

    // Nothing was written for the broken row, and the failure names it.
    expect(prisma.protocol.update).not.toHaveBeenCalled();
    const logged = errorSpy.mock.calls.map((call) => String(call[0])).join(' ');
    expect(logged).toMatch(/Broken Protocol\.netcanvas/);
    expect(logged).toMatch(/cm-broken/);
    errorSpy.mockRestore();
  });

  it('normalizes a version 8 row that fails its own version when the target has moved past it', async () => {
    // A version 8 row persisted before version 8's current rules shipped,
    // still carrying legacy field shapes. Once the target is past 8 it is
    // migrated rather than checked for conformance, and its migration fails
    // version 8's pre-validation; it must still reach the target.
    const legacyShaped = makeV7Protocol();
    const storedExperiments = { encryptedVariables: true };
    const prisma = makeMockPrisma();
    prisma.protocol.findMany.mockResolvedValue([
      {
        id: 'cm-legacy-v8',
        assets: [],
        name: 'Legacy V8.netcanvas',
        schemaVersion: 8,
        stages: legacyShaped.stages,
        codebook: legacyShaped.codebook,
        experiments: storedExperiments,
        description: legacyShaped.description,
        lastModified: new Date(legacyShaped.lastModified),
      },
    ]);
    expect(() =>
      migrateProtocol(
        { ...legacyShaped, name: 'Legacy V8', schemaVersion: 8 },
        COMPATIBLE_PROTOCOL_SCHEMA_VERSION,
      ),
    ).toThrow();

    await runMigration(prisma);

    expect(prisma.protocol.update).toHaveBeenCalledTimes(1);
    expect(prisma.protocol.update).toHaveBeenCalledWith({
      where: { id: 'cm-legacy-v8' },
      data: expect.objectContaining({
        schemaVersion: COMPATIBLE_PROTOCOL_SCHEMA_VERSION,
        // iconVariant → icon proves the legacy shape was rewritten.
        codebook: expect.objectContaining({
          node: {
            person: expect.objectContaining({ icon: 'add-a-person' }),
          },
        }),
      }),
    });
    expect(experimentsWritten(onlyWrite(prisma))).toStrictEqual({});
  });

  it('leaves a version 8 row in place when neither migration nor normalization succeeds', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const prisma = makeMockPrisma();
    prisma.protocol.findMany.mockResolvedValue([
      {
        id: 'cm-broken-v8',
        assets: [],
        name: 'Broken V8.netcanvas',
        schemaVersion: 8,
        stages: 'not-an-array',
        codebook: { node: {}, edge: {}, ego: { variables: {} } },
        experiments: null,
        description: null,
        lastModified: new Date('2024-01-01T00:00:00.000Z'),
      },
    ]);

    await expect(runMigration(prisma)).resolves.toBeUndefined();

    expect(prisma.protocol.update).not.toHaveBeenCalled();
    const logged = errorSpy.mock.calls.map((call) => String(call[0])).join(' ');
    expect(logged).toMatch(/Broken V8\.netcanvas/);
    expect(logged).toMatch(/Normalizing it from schema version 7 also failed/);
    errorSpy.mockRestore();
  });

  it('normalizes a protocol stored at the compatible version that is not conformant', async () => {
    // A protocol stored at the compatible version but still carrying legacy
    // field shapes (iconVariant, Toggle options). These slip past the
    // below-target filter yet fail the strict read-time CurrentProtocolSchema,
    // so they must be re-normalized through the migration chain.
    const legacyShaped = makeV7Protocol();
    const prisma = makeMockPrisma();
    prisma.protocol.findMany.mockResolvedValue([
      {
        id: 'cm-mislabelled',
        assets: [],
        name: 'Mislabelled.netcanvas',
        schemaVersion: COMPATIBLE_PROTOCOL_SCHEMA_VERSION,
        stages: legacyShaped.stages,
        codebook: legacyShaped.codebook,
        experiments: null,
        description: legacyShaped.description,
        lastModified: new Date(legacyShaped.lastModified),
      },
    ]);

    await runMigration(prisma);

    expect(prisma.protocol.update).toHaveBeenCalledTimes(1);

    type UpdateCallArg = {
      where: { id: string };
      data: {
        schemaVersion: number;
        codebook: { node: { person: Record<string, unknown> } };
        hash: string;
      };
    };
    const call = prisma.protocol.update.mock.calls[0]?.[0] as UpdateCallArg;

    expect(call.where).toEqual({ id: 'cm-mislabelled' });
    expect(call.data.schemaVersion).toBe(COMPATIBLE_PROTOCOL_SCHEMA_VERSION);
    // iconVariant → icon proves the v7→v8 migration actually ran on the
    // mislabelled protocol rather than leaving its legacy shape untouched.
    expect(call.data.codebook.node.person.icon).toBe('add-a-person');
    expect(call.data.codebook.node.person).not.toHaveProperty('iconVariant');
  });

  it('normalizes non-conformant asset-referencing protocols', async () => {
    // The re-migration input must include the manifest reconstructed from the
    // Asset rows, or migration of any asset-referencing protocol would fail
    // its output validation.
    const mixed = makeV7Protocol();
    mixed.stages.push({
      id: 'stage-roster',
      type: 'NameGeneratorRoster',
      label: 'Roster',
      subject: { entity: 'node', type: 'person' },
      dataSource: 'asset-roster-1',
      prompts: [{ id: 'p1', text: 'Who?' }],
    } as unknown as (typeof mixed.stages)[number]);

    const prisma = makeMockPrisma();
    prisma.protocol.findMany.mockResolvedValue([
      {
        id: 'cm-asset-current',
        assets: [
          {
            assetId: 'asset-roster-1',
            name: 'roster.csv',
            type: 'network',
            value: null,
          },
        ],
        name: 'AssetProtocol.netcanvas',
        schemaVersion: COMPATIBLE_PROTOCOL_SCHEMA_VERSION,
        stages: mixed.stages,
        codebook: mixed.codebook,
        experiments: null,
        description: mixed.description,
        lastModified: new Date(mixed.lastModified),
      },
    ]);

    await runMigration(prisma);

    expect(prisma.protocol.update).toHaveBeenCalledTimes(1);
  });

  it('skips conformant asset-referencing protocols instead of re-normalizing them each deploy', async () => {
    const v7 = makeV7Protocol();
    v7.stages.push({
      id: 'stage-roster',
      type: 'NameGeneratorRoster',
      label: 'Roster',
      subject: { entity: 'node', type: 'person' },
      dataSource: 'asset-roster-1',
      prompts: [{ id: 'p1', text: 'Who?' }],
    } as unknown as (typeof v7.stages)[number]);
    const conformant = migrateProtocol(
      {
        ...v7,
        name: 'CleanAssets',
        assetManifest: {
          'asset-roster-1': {
            id: 'asset-roster-1',
            name: 'roster.csv',
            type: 'network',
            source: 'roster.csv',
          },
        },
      },
      COMPATIBLE_PROTOCOL_SCHEMA_VERSION,
      { name: 'CleanAssets' },
    );

    const prisma = makeMockPrisma();
    prisma.protocol.findMany.mockResolvedValue([
      {
        id: 'cm-clean-assets',
        assets: [
          {
            assetId: 'asset-roster-1',
            name: 'roster.csv',
            type: 'network',
            value: null,
          },
        ],
        name: 'CleanAssets.netcanvas',
        schemaVersion: COMPATIBLE_PROTOCOL_SCHEMA_VERSION,
        stages: conformant.stages,
        codebook: conformant.codebook,
        localization: conformant.localization,
        experiments: null,
        description: null,
        lastModified: new Date('2024-01-01T00:00:00.000Z'),
      },
    ]);

    await runMigration(prisma);

    expect(prisma.protocol.update).not.toHaveBeenCalled();
  });

  it('conformant protocols at the compatible version are left untouched', async () => {
    // Start from a fully-migrated protocol so it already satisfies the strict
    // schema; the migration must skip it (no re-write, no hash churn).
    const v7 = makeV7Protocol();
    const conformant = migrateProtocol(
      { ...v7, name: 'Clean' },
      COMPATIBLE_PROTOCOL_SCHEMA_VERSION,
      { name: 'Clean' },
    );

    const prisma = makeMockPrisma();
    prisma.protocol.findMany.mockResolvedValue([
      {
        id: 'cm-clean-current',
        assets: [],
        name: 'Clean.netcanvas',
        schemaVersion: COMPATIBLE_PROTOCOL_SCHEMA_VERSION,
        stages: conformant.stages,
        codebook: conformant.codebook,
        localization: conformant.localization,
        experiments: null,
        description: null,
        lastModified: new Date('2024-01-01T00:00:00.000Z'),
      },
    ]);

    await runMigration(prisma);

    expect(prisma.protocol.update).not.toHaveBeenCalled();
  });

  it('leaves a non-normalizable protocol in place without throwing', async () => {
    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const prisma = makeMockPrisma();
    prisma.protocol.findMany.mockResolvedValue([
      {
        id: 'cm-unfixable',
        assets: [],
        name: 'Unfixable.netcanvas',
        schemaVersion: COMPATIBLE_PROTOCOL_SCHEMA_VERSION,
        // Not an array: fails the strict schema AND cannot be migrated, so the
        // normalization attempt throws internally. It must be logged and left
        // in place rather than aborting the whole deploy transaction.
        stages: 'not-an-array',
        codebook: { node: {}, edge: {}, ego: { variables: {} } },
        experiments: null,
        description: null,
        lastModified: new Date('2024-01-01T00:00:00.000Z'),
      },
    ]);

    await expect(runMigration(prisma)).resolves.toBeUndefined();

    expect(prisma.protocol.update).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Unfixable.netcanvas'),
    );
    warnSpy.mockRestore();
  });

  it('detects a hash collision before writing and names both protocols', async () => {
    const v7 = makeV7Protocol();
    const prisma = makeMockPrisma();
    prisma.protocol.findMany.mockResolvedValue([
      {
        id: 'cm-collide',
        assets: [],
        name: 'Colliding.netcanvas',
        schemaVersion: 7,
        stages: v7.stages,
        codebook: v7.codebook,
        experiments: null,
        description: v7.description,
        lastModified: new Date(v7.lastModified),
      },
    ]);

    // The pre-write check finds the colliding row by hash. Raising the actual
    // constraint violation is not an option — inside setup-database's single
    // PostgreSQL transaction it would poison every subsequent statement.
    prisma.protocol.findFirst.mockResolvedValue({
      id: 'cm-existing',
      name: 'Existing.netcanvas',
    });

    // A hash collision is tolerated like any other per-row failure — the
    // deployment completes and the log names both rows so the administrator
    // can resolve the duplicate.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(runMigration(prisma)).resolves.toBeUndefined();

    const logged = errorSpy.mock.calls.map((call) => String(call[0])).join(' ');
    expect(logged).toMatch(/cm-collide/);
    expect(logged).toMatch(/Colliding\.netcanvas/);
    expect(logged).toMatch(/cm-existing/);
    expect(logged).toMatch(/Existing\.netcanvas/);
    // Detected BEFORE any write: the constraint violation itself would poison
    // the surrounding PostgreSQL transaction.
    expect(prisma.protocol.update).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

/**
 * Run the deploy migration over a version 8 row that fails its own version and
 * so is normalized from version 7, whose migration to 8 resets experiments to
 * empty. Returns what was written.
 */
async function normalizeLegacyShapedV8Row(experiments: unknown) {
  const row = makeLegacyShapedEncryptedRow(8, experiments);
  expect(row.codebook).toHaveProperty(`${NAME_ATTRIBUTE}.encrypted`, true);
  expect(() =>
    migrateProtocol(
      {
        name: 'Legacy Encrypted',
        schemaVersion: 8,
        stages: row.stages,
        codebook: row.codebook,
      },
      COMPATIBLE_PROTOCOL_SCHEMA_VERSION,
    ),
  ).toThrow();
  const prisma = makeMockPrisma();
  prisma.protocol.findMany.mockResolvedValue([row]);

  await runMigration(prisma);

  const written = onlyWrite(prisma);
  // iconVariant → icon proves the row went through normalization.
  expect(written).toHaveProperty(
    'data.codebook.node.person.icon',
    'add-a-person',
  );
  return written;
}

describe('encrypted attributes in the deploy migration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps a version 8 row’s attributes encrypted when its experiments turned encryption on', async () => {
    // Their collected values are ciphertext; unmarking them would hand the
    // interview ciphertext as if it were the participant's answer.
    const row = makeEncryptedV8Row({ encryptedVariables: true });
    const prisma = makeMockPrisma();
    prisma.protocol.findMany.mockResolvedValue([row]);

    await runMigration(prisma);

    const written = onlyWrite(prisma);
    expect(written).toHaveProperty(
      'data.schemaVersion',
      COMPATIBLE_PROTOCOL_SCHEMA_VERSION,
    );
    expect(written).toHaveProperty(
      `data.codebook.${NAME_ATTRIBUTE}.encrypted`,
      true,
    );
    expect(experimentsWritten(written)).toStrictEqual({});
  });

  it.each([
    ['absent', null],
    ['empty', {}],
    ['off', { encryptedVariables: false }],
  ])(
    'unmarks a version 8 row’s encrypted attributes when encryption was %s, since their values are plaintext',
    async (_description, experiments) => {
      const row = makeEncryptedV8Row(experiments);
      expect(row.codebook).toHaveProperty(`${NAME_ATTRIBUTE}.encrypted`, true);
      const prisma = makeMockPrisma();
      prisma.protocol.findMany.mockResolvedValue([row]);

      await runMigration(prisma);

      const written = onlyWrite(prisma);
      expect(written).toHaveProperty(
        `data.codebook.${NAME_ATTRIBUTE}.type`,
        'text',
      );
      expect(written).not.toHaveProperty(
        `data.codebook.${NAME_ATTRIBUTE}.encrypted`,
      );
      expect(experimentsWritten(written)).toStrictEqual({});
    },
  );

  it.each([
    // The alpha runtime encrypted while the flag, then named `encryptNames`,
    // was on.
    ['the alpha’s name for the flag', { encryptNames: true }],
    ['the flag beside an unknown key', { encryptedVariables: true, other: 1 }],
  ])(
    'keeps a version 8 row’s attributes encrypted when its experiments turn encryption on with %s',
    async (_description, experiments) => {
      const row = makeEncryptedV8Row(experiments);
      const prisma = makeMockPrisma();
      prisma.protocol.findMany.mockResolvedValue([row]);

      await runMigration(prisma);

      const written = onlyWrite(prisma);
      expect(written).toHaveProperty(
        'data.schemaVersion',
        COMPATIBLE_PROTOCOL_SCHEMA_VERSION,
      );
      expect(written).toHaveProperty(
        `data.codebook.${NAME_ATTRIBUTE}.encrypted`,
        true,
      );
      expect(experimentsWritten(written)).toStrictEqual({});
    },
  );

  it.each([
    ['text', 'on'],
    ['a list', ['encryptedVariables']],
    ['a flag that is not a boolean', { encryptedVariables: 'true' }],
    ['the alpha’s flag turned off', { encryptNames: false }],
  ])(
    'upgrades a version 8 row whose experiments are %s, with encryption off',
    async (_description, experiments) => {
      const row = makeEncryptedV8Row(experiments);
      const prisma = makeMockPrisma();
      prisma.protocol.findMany.mockResolvedValue([row]);

      await runMigration(prisma);

      const written = onlyWrite(prisma);
      expect(written).toHaveProperty(
        'data.schemaVersion',
        COMPATIBLE_PROTOCOL_SCHEMA_VERSION,
      );
      expect(written).toHaveProperty(
        `data.codebook.${NAME_ATTRIBUTE}.type`,
        'text',
      );
      expect(written).not.toHaveProperty(
        `data.codebook.${NAME_ATTRIBUTE}.encrypted`,
      );
    },
  );

  it('keeps a version 8 row’s attributes encrypted when normalizing it with the alpha’s name for the flag', async () => {
    const written = await normalizeLegacyShapedV8Row({ encryptNames: true });

    expect(written).toHaveProperty(
      `data.codebook.${NAME_ATTRIBUTE}.encrypted`,
      true,
    );
  });

  it('normalizes a version 8 row whose experiments are text, with encryption off', async () => {
    const written = await normalizeLegacyShapedV8Row('on');

    expect(written).toHaveProperty(
      `data.codebook.${NAME_ATTRIBUTE}.type`,
      'text',
    );
    expect(written).not.toHaveProperty(
      `data.codebook.${NAME_ATTRIBUTE}.encrypted`,
    );
  });

  it('keeps a version 8 row’s attributes encrypted when normalizing it with encryption on', async () => {
    const written = await normalizeLegacyShapedV8Row({
      encryptedVariables: true,
    });

    expect(written).toHaveProperty(
      `data.codebook.${NAME_ATTRIBUTE}.encrypted`,
      true,
    );
    expect(experimentsWritten(written)).toStrictEqual({});
  });

  it('unmarks a version 8 row’s encrypted attributes when normalizing it with encryption off', async () => {
    const written = await normalizeLegacyShapedV8Row(null);

    expect(written).toHaveProperty(
      `data.codebook.${NAME_ATTRIBUTE}.type`,
      'text',
    );
    expect(written).not.toHaveProperty(
      `data.codebook.${NAME_ATTRIBUTE}.encrypted`,
    );
    expect(experimentsWritten(written)).toStrictEqual({});
  });

  it.each([
    ['none', null],
    ['empty ones', {}],
  ])(
    'keeps the attributes of a non-conformant row at the compatible version encrypted when normalizing it, with %s stored',
    async (_description, experiments) => {
      // That version always encrypts an attribute marked `encrypted`, so the
      // empty experiments the version 8 step of normalization starts from
      // must not decide.
      const row = makeLegacyShapedEncryptedRow(
        COMPATIBLE_PROTOCOL_SCHEMA_VERSION,
        experiments,
      );
      expect(row.codebook).toHaveProperty(`${NAME_ATTRIBUTE}.encrypted`, true);
      const prisma = makeMockPrisma();
      prisma.protocol.findMany.mockResolvedValue([row]);

      await runMigration(prisma);

      const written = onlyWrite(prisma);
      expect(written).toHaveProperty(
        'data.codebook.node.person.icon',
        'add-a-person',
      );
      expect(written).toHaveProperty(
        `data.codebook.${NAME_ATTRIBUTE}.encrypted`,
        true,
      );
      expect(experimentsWritten(written)).toStrictEqual({});
    },
  );

  it('normalizes a row at the compatible version whose experiments still turn on encrypted attributes, keeping them encrypted', async () => {
    // A row stored while encrypted attributes were still an experiment of
    // that version. Its body is conformant; only the setting is refused.
    const atEncryptionVersion = migrateProtocol(
      { ...makeV7ProtocolWithEncryptedName(), name: 'Prerelease' },
      8,
      { name: 'Prerelease' },
    );
    const current = migrateProtocol(
      {
        ...atEncryptionVersion,
        experiments: { encryptedVariables: true },
      },
      COMPATIBLE_PROTOCOL_SCHEMA_VERSION,
      { name: 'Prerelease' },
    );
    const prisma = makeMockPrisma();
    prisma.protocol.findMany.mockResolvedValue([
      {
        id: 'cm-prerelease',
        assets: [],
        name: 'Prerelease.netcanvas',
        schemaVersion: COMPATIBLE_PROTOCOL_SCHEMA_VERSION,
        stages: current.stages,
        codebook: current.codebook,
        localization: current.localization,
        experiments: { encryptedVariables: true },
      },
    ]);

    await runMigration(prisma);

    const written = onlyWrite(prisma);
    expect(written).toHaveProperty(
      `data.codebook.${NAME_ATTRIBUTE}.encrypted`,
      true,
    );
    expect(experimentsWritten(written)).toStrictEqual({});
  });

  it('leaves a row at the compatible version in place when its experiments name one this deployment does not have', async () => {
    // Normalizing it must not drop a setting the protocol relies on.
    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const prisma = makeMockPrisma();
    prisma.protocol.findMany.mockResolvedValue([
      makeLegacyShapedEncryptedRow(COMPATIBLE_PROTOCOL_SCHEMA_VERSION, {
        laterFeature: true,
      }),
    ]);

    await runMigration(prisma);

    expect(prisma.protocol.update).not.toHaveBeenCalled();
    const warned = warnSpy.mock.calls.map((call) => String(call[0])).join(' ');
    expect(warned).toMatch(/Legacy Encrypted\.netcanvas/);
    warnSpy.mockRestore();
  });
});

describe('buildAssetManifest', () => {
  it('reconstructs a file-asset manifest entry from a stored Asset row', () => {
    const manifest = buildAssetManifest([
      {
        assetId: 'asset-network-1',
        name: 'roster-source.csv',
        type: 'network',
        value: null,
      },
    ]);

    expect(manifest['asset-network-1']).toEqual({
      id: 'asset-network-1',
      name: 'roster-source.csv',
      type: 'network',
      source: 'roster-source.csv',
    });
  });

  it('reconstructs an apikey manifest entry using value, not source', () => {
    const manifest = buildAssetManifest([
      {
        assetId: 'asset-key-1',
        name: 'Mapbox token',
        type: 'apikey',
        value: 'pk.secret',
      },
    ]);

    expect(manifest['asset-key-1']).toEqual({
      id: 'asset-key-1',
      name: 'Mapbox token',
      type: 'apikey',
      value: 'pk.secret',
    });
  });

  it('keys every asset by its assetId', () => {
    const manifest = buildAssetManifest([
      { assetId: 'a', name: 'a.png', type: 'image', value: null },
      { assetId: 'b', name: 'b.geojson', type: 'geojson', value: null },
    ]);

    expect(Object.keys(manifest)).toEqual(['a', 'b']);
  });
});
