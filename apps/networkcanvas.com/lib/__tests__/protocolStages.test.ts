import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readProtocolStages } from '~/lib/protocolStages';

const galleryAssets = join(
  process.cwd(),
  'public',
  'protocols',
  'protocol-gallery',
);

describe('readProtocolStages', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'networkcanvas-stages-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('reads the ordered stage types and labels from a .netcanvas file', async () => {
    const stages = await readProtocolStages(
      join(galleryAssets, 'Test-to-PrEP_10-22-2025.netcanvas'),
    );

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

  it('names the file when the archive cannot be read', async () => {
    const file = join(directory, 'broken.netcanvas');
    await writeFile(file, 'not a zip');

    await expect(readProtocolStages(file)).rejects.toThrow(
      /^broken\.netcanvas: /,
    );
  });

  it('names the file when it is missing', async () => {
    await expect(
      readProtocolStages(join(directory, 'absent.netcanvas')),
    ).rejects.toThrow(/^absent\.netcanvas: /);
  });
});
