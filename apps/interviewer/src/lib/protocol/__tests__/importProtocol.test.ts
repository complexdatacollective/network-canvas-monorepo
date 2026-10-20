import JSZip from 'jszip';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createAppIntl } from '@codaco/app-i18n/messages';
import { COMPATIBLE_PROTOCOL_SCHEMA_VERSION } from '@codaco/interview/protocol-schema-version';
import { hashProtocol } from '@codaco/protocol-validation';
import { interviewerCatalogSource } from '~/locales/catalogs';

import { importProtocolFromFile } from '../importProtocol';

const saveProtocolMock = vi.fn();

vi.mock('../../db/api', () => ({
  saveProtocol: (...args: unknown[]) => saveProtocolMock(...args),
}));

/**
 * The wording a researcher must never be shown mid-fieldwork: the archive
 * library's name and documentation URL, its central-directory phrasing, an
 * internal filename, a JSON parser's cursor position, or schema-version
 * arithmetic.
 */
const IMPLEMENTATION_DETAIL =
  /jszip|stuk\.github\.io|central directory|protocol\.json|JSON at position|position \d+|schemaVersion|\d+ -> \d+/i;

const asFile = (bytes: Uint8Array, name = 'study.netcanvas') =>
  new File([bytes as BlobPart], name);

const buildArchive = async (
  entries: Record<string, string>,
): Promise<Uint8Array> => {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(entries)) {
    zip.file(path, content);
  }
  return zip.generateAsync({ type: 'uint8array' });
};

describe('importProtocolFromFile error reporting', () => {
  beforeEach(() => {
    saveProtocolMock.mockReset();
    saveProtocolMock.mockResolvedValue(undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('describes a file that is not an archive without naming the zip library', async () => {
    const result = await importProtocolFromFile(
      asFile(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])),
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBe('extract-failed');
    expect(result.message).not.toMatch(IMPLEMENTATION_DETAIL);
    expect(result.message).toContain('Network Canvas protocol');
  });

  it('describes an archive with no protocol in it', async () => {
    const bytes = await buildArchive({ 'assets/photo.png': 'PNGDATA' });

    const result = await importProtocolFromFile(asFile(bytes));

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBe('extract-failed');
    expect(result.message).not.toMatch(IMPLEMENTATION_DETAIL);
    // Paired with the negative assertion so an empty message — or the generic
    // fallback, which would mean the taxonomy never classified this — cannot
    // pass by saying nothing at all.
    expect(result.message).toMatch(/nothing to open/i);
    expect(result.message).not.toBe('This protocol could not be opened.');
  });

  it('describes damaged protocol contents without the parser position', async () => {
    const bytes = await buildArchive({
      'protocol.json': '{"schemaVersion": 8, "na',
    });

    const result = await importProtocolFromFile(asFile(bytes));

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBe('extract-failed');
    expect(result.message).not.toMatch(IMPLEMENTATION_DETAIL);
    // Same pairing: the researcher is told what to do next, not just what went
    // wrong, and an empty string cannot satisfy that.
    expect(result.message).toMatch(/backup/i);
    expect(result.message).not.toBe('This protocol could not be opened.');
  });

  it('tells the researcher to update when the protocol is from a newer version', async () => {
    const bytes = await buildArchive({
      'protocol.json': JSON.stringify({
        schemaVersion: COMPATIBLE_PROTOCOL_SCHEMA_VERSION + 1,
        name: 'From the future',
      }),
    });

    const result = await importProtocolFromFile(asFile(bytes));

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBe('unsupported-version');
    expect(result.message).not.toMatch(IMPLEMENTATION_DETAIL);
    expect(result.message).toMatch(/newer version/i);
    expect(saveProtocolMock).not.toHaveBeenCalled();
  });

  it('describes a protocol that does not say which version made it', async () => {
    const bytes = await buildArchive({
      'protocol.json': JSON.stringify({ name: 'No version' }),
    });

    const result = await importProtocolFromFile(asFile(bytes));

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBe('validation-failed');
    expect(result.message).not.toMatch(IMPLEMENTATION_DETAIL);
    expect(result.message).toMatch(/which version/i);
  });

  it('describes a storage failure as a device problem, not a machine error', async () => {
    const protocol = {
      schemaVersion: 8,
      name: 'Saveable',
      description: '',
      stages: [],
      codebook: { node: {}, edge: {}, ego: {} },
      assetManifest: {},
    };
    const bytes = await buildArchive({
      'protocol.json': JSON.stringify(protocol),
    });
    saveProtocolMock.mockRejectedValueOnce(
      new DOMException(
        'The current transaction exceeded its quota limitations.',
        'QuotaExceededError',
      ),
    );

    const result = await importProtocolFromFile(
      asFile(bytes),
      undefined,
      undefined,
      { olderSchema: 'upgrade' },
    );

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBe('save-failed');
    expect(result.message).not.toMatch(/quota|transaction|IDB/i);
    expect(result.message).toContain('device');
  });

  it('refuses a current protocol whose codebook uses __proto__ as an id', async () => {
    const nodeType = {
      name: 'Person',
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
    };
    const bytes = await buildArchive({
      'protocol.json': `{"schemaVersion":${COMPATIBLE_PROTOCOL_SCHEMA_VERSION},"name":"Proto","description":"","localization":{"defaultLocale":"en","locales":["en"]},"stages":[{"id":"finish","type":"FinishSession","mode":"confirmation","label":{"en":"Finish"},"content":{"en":"# Finish\\n\\nThank you."},"finishedContent":{"en":"# Finished\\n\\nThank you."},"finishLabel":{"en":"Finish"},"finishConfirmation":{"en":"Finish?"},"finishFailed":{"en":"Not finished."},"outcome":"completed"}],"codebook":{"node":{"__proto__":${JSON.stringify(nodeType)}},"edge":{},"ego":{}},"assetManifest":{}}`,
    });

    const result = await importProtocolFromFile(asFile(bytes));

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBe('validation-failed');
    expect(result.issues).toEqual([
      { path: 'codebook.node.__proto__', message: 'An id cannot be __proto__' },
    ]);
    expect(saveProtocolMock).not.toHaveBeenCalled();
  });

  it('renders actionable Spanish import guidance from the actual archive failure metadata', async () => {
    const intl = createAppIntl({
      locale: 'es',
      messages: await interviewerCatalogSource.load('es'),
    });
    const cases: [Uint8Array, string][] = [
      [
        new Uint8Array([1, 2, 3, 4]),
        'Este archivo no es un protocolo de Network Canvas.',
      ],
      [
        await buildArchive({ 'notes.txt': 'No protocol' }),
        'Este archivo no contiene el protocolo',
      ],
      [
        await buildArchive({ 'protocol.json': '{broken' }),
        'Prueba con una copia de seguridad',
      ],
    ];
    for (const [bytes, expectedGuidance] of cases) {
      const result = await importProtocolFromFile(asFile(bytes));
      if (result.success)
        throw new Error('Expected the deliberately invalid archive to fail');
      expect(
        intl.formatMessage(
          result.localizedMessage.descriptor,
          result.localizedMessage.values,
        ),
      ).toContain(expectedGuidance);
    }
    expect(saveProtocolMock).not.toHaveBeenCalled();
  });
});

describe('importing a file below this app’s schema', () => {
  const schema8 = {
    schemaVersion: 8,
    name: 'Older study',
    description: '',
    stages: [],
    codebook: { node: {}, edge: {}, ego: {} },
    assetManifest: {},
  };

  beforeEach(() => {
    saveProtocolMock.mockReset();
    saveProtocolMock.mockResolvedValue(undefined);
  });

  it('never migrates on its own: it asks for the researcher’s choice', async () => {
    const bytes = await buildArchive({
      'protocol.json': JSON.stringify(schema8),
    });

    const result = await importProtocolFromFile(asFile(bytes));

    expect(result).toMatchObject({
      success: false,
      error: 'migration-required',
      schemaVersion: 8,
    });
    if (result.success) return;
    expect(result.message).toBe(
      'This protocol could not be upgraded to the current version.',
    );
    expect(result.message).not.toMatch(IMPLEMENTATION_DETAIL);
    expect(saveProtocolMock).not.toHaveBeenCalled();
  });

  it('migrates, validates, hashes and saves it once the researcher chose to upgrade', async () => {
    const bytes = await buildArchive({
      'protocol.json': JSON.stringify(schema8),
    });

    const result = await importProtocolFromFile(
      asFile(bytes),
      undefined,
      undefined,
      { olderSchema: 'upgrade' },
    );

    expect(result).toMatchObject({ success: true, migrated: true });
    if (!result.success) return;
    expect(result.protocol.schemaVersion).toBe(
      COMPATIBLE_PROTOCOL_SCHEMA_VERSION,
    );
    expect(saveProtocolMock).toHaveBeenCalledWith(
      result.protocol,
      result.hash,
      [],
    );
  });

  it('imports a file at this app’s schema without asking', async () => {
    const bytes = await buildArchive({
      'protocol.json': JSON.stringify(schema8),
    });
    const upgraded = await importProtocolFromFile(
      asFile(bytes),
      undefined,
      undefined,
      { olderSchema: 'upgrade' },
    );
    if (!upgraded.success) throw new Error('expected the upgrade to succeed');
    saveProtocolMock.mockClear();

    const current = await buildArchive({
      'protocol.json': JSON.stringify(upgraded.protocol),
    });
    const result = await importProtocolFromFile(asFile(current));

    expect(result).toMatchObject({ success: true, migrated: false });
    expect(saveProtocolMock).toHaveBeenCalledTimes(1);
  });
});

describe('keeping a file below this app’s schema on schema 8', () => {
  const schema8 = {
    schemaVersion: 8 as const,
    name: 'Older study',
    description: '',
    stages: [],
    codebook: {
      node: {
        person: {
          name: 'Person',
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
          variables: {},
        },
      },
      edge: {},
      ego: {},
    },
    assetManifest: {},
  };
  const schema7 = {
    schemaVersion: 7,
    description: '',
    stages: [],
    codebook: {
      node: {
        person: { name: 'Person', color: 'node-color-seq-1', variables: {} },
      },
      edge: {},
      ego: {},
    },
    assetManifest: {},
  };

  beforeEach(() => {
    saveProtocolMock.mockReset();
    saveProtocolMock.mockResolvedValue(undefined);
  });

  it('stores a schema 8 file as it is, hashed as Interviewer 8 hashes it', async () => {
    const bytes = await buildArchive({
      'protocol.json': JSON.stringify(schema8),
    });

    const result = await importProtocolFromFile(
      asFile(bytes),
      undefined,
      undefined,
      { olderSchema: 'keep' },
    );

    expect(result).toMatchObject({
      success: true,
      migrated: false,
      name: 'Older study',
    });
    if (!result.success) return;
    expect(result.protocol).toEqual(schema8);
    expect(result.hash).toBe(hashProtocol(schema8));
    expect(saveProtocolMock).toHaveBeenCalledWith(schema8, result.hash, []);
  });

  it('brings a schema 7 file to schema 8 and no further, named from the file', async () => {
    const bytes = await buildArchive({
      'protocol.json': JSON.stringify(schema7),
    });

    const result = await importProtocolFromFile(
      asFile(bytes, 'Classic Study.netcanvas'),
      undefined,
      undefined,
      { olderSchema: 'keep' },
    );

    expect(result).toMatchObject({
      success: true,
      migrated: false,
      name: 'Classic Study',
    });
    if (!result.success) return;
    expect(result.protocol.schemaVersion).toBe(8);
    expect(result.protocol).toMatchObject({ name: 'Classic Study' });
    expect(result.hash).toBe(hashProtocol(result.protocol));
    expect(saveProtocolMock).toHaveBeenCalledWith(
      result.protocol,
      result.hash,
      [],
    );
  });

  it('refuses a schema 8 file with no name, which Interviewer 8 requires', async () => {
    const { name: _name, ...unnamed } = schema8;
    const bytes = await buildArchive({
      'protocol.json': JSON.stringify(unnamed),
    });

    const result = await importProtocolFromFile(
      asFile(bytes),
      undefined,
      undefined,
      { olderSchema: 'keep' },
    );

    expect(result).toMatchObject({
      success: false,
      error: 'validation-failed',
      issues: [{ path: 'name' }],
    });
    expect(saveProtocolMock).not.toHaveBeenCalled();
  });

  it('refuses a file that is not a schema 8 protocol in outline', async () => {
    const bytes = await buildArchive({
      'protocol.json': JSON.stringify({ ...schema8, stages: 'none' }),
    });

    const result = await importProtocolFromFile(
      asFile(bytes),
      undefined,
      undefined,
      { olderSchema: 'keep' },
    );

    expect(result).toMatchObject({
      success: false,
      error: 'validation-failed',
    });
    expect(saveProtocolMock).not.toHaveBeenCalled();
  });

  // Validated as Interviewer 8 validates its imports (its frozen schema 8
  // validator), so a file Interviewer 8 would refuse is refused here too,
  // rather than kept and then run at /v8/ by an engine that cannot read it.
  const keepRefuses = async (document: unknown) => {
    const bytes = await buildArchive({
      'protocol.json': JSON.stringify(document),
    });
    const result = await importProtocolFromFile(
      asFile(bytes),
      undefined,
      undefined,
      { olderSchema: 'keep' },
    );
    expect(saveProtocolMock).not.toHaveBeenCalled();
    return result;
  };

  it('refuses a file with a key Interviewer 8’s schema does not know', async () => {
    expect(
      await keepRefuses({ ...schema8, notASchema8Key: true }),
    ).toMatchObject({
      success: false,
      error: 'validation-failed',
      issues: [{ path: '', message: 'Unrecognized key: "notASchema8Key"' }],
    });
  });

  it('refuses a stage of a type Interviewer 8 does not have', async () => {
    expect(
      await keepRefuses({
        ...schema8,
        stages: [{ id: 's1', type: 'NotAStage', label: 'Unknown' }],
      }),
    ).toMatchObject({
      success: false,
      error: 'validation-failed',
      issues: [{ path: 'stages.0.type' }],
    });
  });

  it('refuses a node type without the shape Interviewer 8 requires', async () => {
    expect(
      await keepRefuses({
        ...schema8,
        codebook: {
          ...schema8.codebook,
          node: {
            person: {
              name: 'Person',
              color: 'node-color-seq-1',
              variables: {},
            },
          },
        },
      }),
    ).toMatchObject({
      success: false,
      error: 'validation-failed',
      issues: [{ path: 'codebook.node.person.shape' }],
    });
  });

  it('refuses a stage whose subject is not in the codebook', async () => {
    const result = await keepRefuses({
      ...schema8,
      stages: [
        {
          id: 's1',
          type: 'NameGenerator',
          label: 'Names',
          subject: { entity: 'node', type: 'missing' },
          form: { title: 'Add', fields: [] },
          prompts: [{ id: 'p1', text: 'Name people' }],
        },
      ],
    });
    expect(result).toMatchObject({
      success: false,
      error: 'validation-failed',
    });
    if (result.success || result.error !== 'validation-failed') return;
    expect(result.issues).toContainEqual({
      path: 'stages.0.subject',
      message: 'Stage subject is not defined in the codebook',
    });
  });

  it('keeps a file with stages Interviewer 8 validates', async () => {
    const withStage = {
      ...schema8,
      stages: [
        {
          id: 's1',
          type: 'Information',
          label: 'Welcome',
          title: 'Welcome',
          items: [{ id: 'i1', type: 'text', content: 'Hello' }],
        },
      ],
    };
    const bytes = await buildArchive({
      'protocol.json': JSON.stringify(withStage),
    });

    const result = await importProtocolFromFile(
      asFile(bytes),
      undefined,
      undefined,
      { olderSchema: 'keep' },
    );

    expect(result).toMatchObject({ success: true });
    if (!result.success) return;
    expect(result.protocol).toEqual(withStage);
    expect(saveProtocolMock).toHaveBeenCalledWith(withStage, result.hash, []);
  });

  it('still upgrades a file at this app’s schema without asking, keep or not', async () => {
    const upgraded = await importProtocolFromFile(
      asFile(await buildArchive({ 'protocol.json': JSON.stringify(schema8) })),
      undefined,
      undefined,
      { olderSchema: 'upgrade' },
    );
    if (!upgraded.success) throw new Error('expected the upgrade to succeed');
    saveProtocolMock.mockClear();

    const result = await importProtocolFromFile(
      asFile(
        await buildArchive({
          'protocol.json': JSON.stringify(upgraded.protocol),
        }),
      ),
      undefined,
      undefined,
      { olderSchema: 'keep' },
    );

    expect(result).toMatchObject({ success: true, migrated: false });
    if (!result.success) return;
    expect(result.protocol.schemaVersion).toBe(
      COMPATIBLE_PROTOCOL_SCHEMA_VERSION,
    );
  });
});
