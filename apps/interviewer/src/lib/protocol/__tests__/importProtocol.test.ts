import { readFileSync } from 'node:fs';
// Named import: the archive builder below already binds `path` as a loop
// variable, and a default import would shadow it.
import { resolve } from 'node:path';

import JSZip from 'jszip';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { hashProtocol } from '@codaco/protocol-validation';

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

    const result = await importProtocolFromFile(asFile(bytes));

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBe('save-failed');
    expect(result.message).not.toMatch(/quota|transaction|IDB/i);
    expect(result.message).toContain('device');
  });
});

/**
 * A minimal but non-empty v8 protocol. The stage matters: the hash covers
 * `codebook` and `stages`, so a protocol with no stages could not tell a hash
 * of the raw document apart from a hash of the parse output.
 */
const MINIMAL_PROTOCOL = {
  schemaVersion: 8,
  name: 'Hashable',
  description: '',
  codebook: {
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        shape: { default: 'circle' },
        variables: {
          'var-name': { name: 'name', type: 'text', component: 'Text' },
        },
      },
    },
    edge: {},
    ego: {},
  },
  stages: [
    {
      id: 'stage-people',
      type: 'NameGenerator',
      label: 'People',
      subject: { entity: 'node', type: 'person' },
      form: {
        title: 'Add a person',
        fields: [{ variable: 'var-name', prompt: 'Their name' }],
      },
      prompts: [{ id: 'prompt-people', text: 'Who do you know?' }],
    },
  ],
  assetManifest: {},
};

/**
 * The showcase protocol carrying authored stage/panel/prompt/variable
 * `synthetic` blocks. It moves into `packages/protocols/e2e/` in Phase 1
 * (plan §1.5), which is where this resolves; nothing reads it before then.
 */
const SYNTHETIC_SHOWCASE = resolve(
  import.meta.dirname,
  '../../../../../../packages/protocols/e2e/synthetic-showcase/protocol.json',
);

describe('hash boundary (activated in Phase 1 — plan §1.3)', () => {
  beforeEach(() => {
    saveProtocolMock.mockReset();
    saveProtocolMock.mockResolvedValue(undefined);
  });

  // Activated in Phase 1 (plan §1.3): remove .skip when the synthetic schema
  // and pre-parse hashing land.
  it.skip('hashes the raw document, not the parse output', async () => {
    const bytes = await buildArchive({
      'protocol.json': JSON.stringify(MINIMAL_PROTOCOL),
    });

    const result = await importProtocolFromFile(asFile(bytes));

    expect(result.success).toBe(true);
    // The hash a protocol is stored under is its Dexie row id and every asset
    // row's prefix, so it must be a property of the document the researcher
    // shipped — not of whatever defaults the current schema resolves onto it.
    expect(saveProtocolMock.mock.calls[0]?.[1]).toBe(
      hashProtocol(MINIMAL_PROTOCOL),
    );
  });

  // Activated in Phase 1 (plan §1.3): remove .skip when the synthetic schema
  // and pre-parse hashing land.
  it.skip('imports a protocol carrying authored synthetic blocks cleanly', async () => {
    const bytes = await buildArchive({
      'protocol.json': readFileSync(SYNTHETIC_SHOWCASE, 'utf8'),
    });

    const result = await importProtocolFromFile(asFile(bytes));

    expect(result.success).toBe(true);
  });
});
