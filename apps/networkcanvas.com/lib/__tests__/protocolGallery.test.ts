import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadProtocolGallery } from '~/lib/protocolGallery';

describe('loadProtocolGallery', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'networkcanvas-gallery-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('loads the shipped protocols and resolves every local download', async () => {
    const protocols = await loadProtocolGallery();

    expect(protocols).toHaveLength(6);
    expect(protocols.find(({ featured }) => featured)?.slug).toBe(
      'test-to-prep',
    );
    expect(
      protocols
        .find(({ slug }) => slug === 'sixhumene')
        ?.downloads.map(({ wave }) => wave),
    ).toEqual([1, 2, 3]);

    for (const protocol of protocols) {
      expect(protocol.dateAdded).toBe('2025-10-22');
      for (const download of protocol.downloads) {
        expect(download.protocolFilename).not.toContain('/');
        expect(download.codebookFilename).not.toContain('/');
        expect(
          download.protocolPath.startsWith('/protocols/protocol-gallery/'),
        ).toBe(true);
        expect(
          download.codebookPath.startsWith('/protocols/protocol-gallery/'),
        ).toBe(true);
        expect(download.protocolPath).not.toContain('assets.networkcanvas.com');
        expect(download.codebookPath).not.toContain('assets.networkcanvas.com');
      }
    }
  });

  it('rejects duplicate slugs with the CSV row number', async () => {
    const source = await readFile(
      join(process.cwd(), 'content', 'protocol-gallery.csv'),
      'utf8',
    );
    const contentFile = join(directory, 'protocol-gallery.csv');
    await writeFile(contentFile, source.replace('"uk-jcoin-i",', '"kaya",'));

    await expect(loadProtocolGallery(contentFile)).rejects.toThrow(
      'protocol-gallery.csv: row 3: Slug: duplicate slug',
    );
  });

  it('fails the build when a referenced asset is missing', async () => {
    const emptyAssetDirectory = join(directory, 'assets');
    const sourceFile = join(process.cwd(), 'content', 'protocol-gallery.csv');

    await expect(
      loadProtocolGallery(sourceFile, emptyAssetDirectory),
    ).rejects.toThrow('Missing gallery asset:');
  });
});
