import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadProtocolGallery } from '~/lib/protocolGallery';
import { isStageType } from '~/lib/stageTypes';

const expectedStageCounts: Record<string, number[]> = {
  'gate': [42],
  'kaya': [16],
  'robust': [18],
  'sixhumene': [32, 28, 20],
  'snaaps': [17],
  'test-to-prep': [24],
  'uk-jcoin-i': [26],
};

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

    expect(protocols).toHaveLength(7);
    expect(protocols.find(({ featured }) => featured)?.slug).toBe(
      'test-to-prep',
    );
    expect(
      protocols
        .find(({ slug }) => slug === 'sixhumene')
        ?.downloads.map(({ wave }) => wave),
    ).toEqual([1, 2, 3]);
    expect(protocols.find(({ slug }) => slug === 'snaaps')).toMatchObject({
      dateAdded: '2026-06-12',
      sandboxUrl: undefined,
      usesRosters: true,
      fields: ['Social work', 'Aging'],
      edgeGeneration: ['sociogram'],
      supplementaryMaterials: [
        {
          filename: 'SNAAPS_v1.0 Sample Interview Screenshots.pdf',
          label: 'Sample interview screenshots',
        },
      ],
    });

    for (const protocol of protocols) {
      expect(protocol.dateAdded).toMatch(/^\d{4}-\d{2}-\d{2}$/);
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
      for (const material of protocol.supplementaryMaterials) {
        expect(material.filename).not.toContain('/');
        expect(material.path).toContain('/protocols/protocol-gallery/');
        expect(material.path).not.toContain('assets.networkcanvas.com');
      }
    }
  });

  it("reads every wave's stage sequence out of its .netcanvas file", async () => {
    const protocols = await loadProtocolGallery();

    for (const protocol of protocols) {
      expect(
        protocol.downloads.map(({ stages }) => stages.length),
        protocol.slug,
      ).toEqual(expectedStageCounts[protocol.slug]);
      for (const stage of protocol.downloads.flatMap(({ stages }) => stages)) {
        expect(stage.label).not.toBe('');
        expect(isStageType(stage.type), stage.type).toBe(true);
      }
    }
  });

  it('keeps facet values free of case-only duplicates', async () => {
    const protocols = await loadProtocolGallery();
    const values = new Set(protocols.flatMap(({ fields }) => fields));
    const folded = new Set(
      [...values].map((value) => value.toLocaleLowerCase('en')),
    );

    expect(folded.size).toBe(values.size);
  });

  it('parses the shipped dataset once per process', async () => {
    const [first, second] = await Promise.all([
      loadProtocolGallery(),
      loadProtocolGallery(),
    ]);

    expect(second).toBe(first);
    expect(await loadProtocolGallery()).toBe(first);
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
