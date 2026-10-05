import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readProtocolArchive } from '~/lib/protocolStages';

const galleryAssets = join(
  process.cwd(),
  'public',
  'protocols',
  'protocol-gallery',
);

async function writeArchive(
  file: string,
  protocol: Record<string, unknown>,
): Promise<void> {
  const zip = new JSZip();
  zip.file('protocol.json', JSON.stringify(protocol));
  await writeFile(file, await zip.generateAsync({ type: 'nodebuffer' }));
}

describe('readProtocolArchive', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'networkcanvas-stages-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('reads the schema version and the ordered stage types and labels from a .netcanvas file', async () => {
    const { schemaVersion, stages } = await readProtocolArchive(
      join(galleryAssets, 'Test-to-PrEP_10-22-2025.netcanvas'),
    );

    expect(schemaVersion).toBe(7);
    expect(stages).toHaveLength(24);
    expect(stages[0]).toEqual({
      type: 'Information',
      label: 'Protocol Citation Information',
    });
    for (const stage of stages) {
      expect(stage.type).not.toBe('');
      expect(stage.label).not.toBe('');
      expect(stage.label).not.toMatch(/\s{2,}/);
    }
  });

  it('rejects a stage type this build does not know', async () => {
    const file = join(directory, 'future.netcanvas');
    await writeArchive(file, {
      schemaVersion: 8,
      stages: [
        { type: 'Information', label: 'Welcome' },
        { type: 'FutureInterface', label: 'Something new' },
      ],
    });

    await expect(readProtocolArchive(file)).rejects.toThrow(
      /^future\.netcanvas: protocol\.json: stages\.1\.type: unknown stage type$/,
    );
  });

  it('rejects a protocol without a schema version', async () => {
    const file = join(directory, 'unversioned.netcanvas');
    await writeArchive(file, {
      stages: [{ type: 'Information', label: 'Welcome' }],
    });

    await expect(readProtocolArchive(file)).rejects.toThrow(
      /^unversioned\.netcanvas: protocol\.json: schemaVersion: /,
    );
  });

  it('names the file when the archive cannot be read', async () => {
    const file = join(directory, 'broken.netcanvas');
    await writeFile(file, 'not a zip');

    await expect(readProtocolArchive(file)).rejects.toThrow(
      /^broken\.netcanvas: /,
    );
  });

  it('names the file when it is missing', async () => {
    await expect(
      readProtocolArchive(join(directory, 'absent.netcanvas')),
    ).rejects.toThrow(/^absent\.netcanvas: /);
  });
});
