import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { Zip, ZipDeflate, ZipPassThrough, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { CURRENT_SCHEMA_VERSION } from '@codaco/protocol-validation';

import {
  canonicalJsonBytes,
  readCanonicalJson,
  readTemplateArchive,
} from '../template-archive.ts';
import {
  createTemplateArtifact,
  readTemplateArtifact,
  TEMPLATE_ARTIFACT_LIMITS,
  TemplateArtifactError,
  templateBytesHash,
  templateMerkleRoot,
  type TemplateArtifactInput,
  type TemplateArtifactManifest,
} from '../template-exchange.ts';
import {
  hasCuratedMetadata,
  TemplateMetadataSchema,
} from '../template-metadata.ts';

const encode = (text: string) => new TextEncoder().encode(text);
const png = Uint8Array.from(
  Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108000000003a7e9b55' +
      '0000000a4944415408d76360000000020001e221bc330000000049454e44ae426082',
    'hex',
  ),
);

// Minimal format signatures exercise the pinned detector itself; media decoding
// is not part of the archive's mechanical type-screening contract.
const oggSignature = (codec: number[]) =>
  Uint8Array.from([...encode('OggS'), ...new Uint8Array(24), ...codec]);
const mp4Signature = (brand: string) =>
  Uint8Array.from([
    0,
    0,
    0,
    24,
    ...encode('ftyp' + brand),
    ...new Uint8Array(12),
  ]);
const mediaSignatures = [
  {
    label: 'FLAC',
    type: 'audio/flac',
    mediaClass: 'audio',
    bytes: Uint8Array.from([...encode('fLaC'), ...new Uint8Array(38)]),
  },
  {
    label: 'Opus in Ogg',
    type: 'audio/ogg',
    mediaClass: 'audio',
    bytes: oggSignature([...encode('OpusHead')]),
  },
  {
    label: 'Vorbis in Ogg',
    type: 'audio/ogg',
    mediaClass: 'audio',
    bytes: oggSignature([1, ...encode('vorbis'), 0]),
  },
  {
    label: 'Theora in Ogg',
    type: 'video/ogg',
    mediaClass: 'video',
    bytes: oggSignature([128, ...encode('theora'), 0]),
  },
  {
    label: 'M4A',
    type: 'audio/mp4',
    mediaClass: 'audio',
    bytes: mp4Signature('M4A '),
  },
  {
    label: 'M4B',
    type: 'audio/mp4',
    mediaClass: 'audio',
    bytes: mp4Signature('M4B '),
  },
  {
    label: 'M4V',
    type: 'video/mp4',
    mediaClass: 'video',
    bytes: mp4Signature('M4V '),
  },
  {
    label: 'MP4',
    type: 'video/mp4',
    mediaClass: 'video',
    bytes: mp4Signature('isom'),
  },
] as const;

function fixture(): TemplateArtifactInput {
  return {
    template: { name: 'Portable template', kind: 'protocol', version: 1 },
    metadata: { schema_version: 1, authors: [{ name: 'Example researcher' }] },
    license: 'CC-BY-4.0',
    sections: {
      'settings': {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        name: 'Portable template',
      },
      'stageOrder': { stages: ['welcome'] },
      'stage:welcome': {
        id: 'welcome',
        type: 'Information',
        label: 'Welcome',
        title: 'Welcome',
        items: [{ id: 'image', type: 'asset', content: 'illustration' }],
      },
      'assets': {
        illustration: {
          type: 'image',
          name: 'Illustration',
          source: 'illustration.png',
        },
      },
    },
    assets: [
      {
        source: 'illustration.png',
        media_class: 'image',
        media_type: 'image/png',
        bytes: png,
      },
    ],
  };
}

describe('template binary media screening', () => {
  it.each(mediaSignatures)(
    'round-trips the canonical media type for $label and rejects a different family',
    async ({ type, mediaClass, bytes }) => {
      const input = fixture();
      input.sections = {
        ...input.sections,
        assets: {
          illustration: {
            type: mediaClass,
            name: 'Media',
            source: 'media.bin',
          },
        },
      };
      input.assets = [
        {
          source: 'media.bin',
          media_class: mediaClass,
          media_type: type,
          bytes,
        },
      ];
      const artifact = await createTemplateArtifact(input);
      expect(
        (await readTemplateArtifact(artifact.bytes)).assets[0]?.media_type,
      ).toBe(type);
      input.sections = {
        ...input.sections,
        assets: {
          illustration: { type: 'image', name: 'Media', source: 'media.bin' },
        },
      };
      input.assets = [
        {
          source: 'media.bin',
          media_class: 'image',
          media_type: 'image/png',
          bytes,
        },
      ];
      await expect(createTemplateArtifact(input)).rejects.toMatchObject({
        code: 'TEMPLATE_ASSET_DISALLOWED',
      });
    },
  );
});

function repack(files: Record<string, Uint8Array>): Uint8Array {
  return zipSync(files, { level: 9, mtime: new Date(1980, 0, 1) });
}

function manifestOf(
  files: Record<string, Uint8Array>,
): TemplateArtifactManifest {
  // The helper only reads artifacts already produced by the real builder.
  return JSON.parse(
    new TextDecoder().decode(files['manifest.json']),
  ) as TemplateArtifactManifest;
}

function writeManifest(
  files: Record<string, Uint8Array>,
  manifest: TemplateArtifactManifest,
): void {
  const { merkle_root: _old, ...root } = manifest;
  files['manifest.json'] = canonicalJsonBytes({
    ...root,
    merkle_root: templateMerkleRoot(root),
  });
}

function datasetFixture(
  type: 'network' | 'geojson',
  mediaType: 'text/csv' | 'application/json' | 'application/geo+json',
  source: string,
  text: string,
): TemplateArtifactInput {
  const input = fixture();
  input.sections = {
    ...input.sections,
    assets: {
      illustration: { type, name: 'Dataset', source },
    },
  };
  input.assets = [
    {
      source,
      media_class: 'dataset',
      media_type: mediaType,
      bytes: encode(text),
    },
  ];
  return input;
}

function streamedArchive(
  entries: [string, Uint8Array][],
  compress = false,
): Uint8Array {
  const chunks: Uint8Array[] = [];
  const zip = new Zip((error, chunk) => {
    if (error) throw error;
    chunks.push(chunk);
  });
  for (const [name, bytes] of entries) {
    const file = compress ? new ZipDeflate(name) : new ZipPassThrough(name);
    zip.add(file);
    file.push(bytes, true);
  }
  zip.end();
  const output = new Uint8Array(
    chunks.reduce((total, chunk) => total + chunk.length, 0),
  );
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

describe('template exchange metadata', () => {
  it('preserves the minimal publishing vocabulary without adding or localizing fields', () => {
    const metadata = { schema_version: 1 } as const;
    expect(TemplateMetadataSchema.parse(metadata)).toEqual(metadata);
    expect(hasCuratedMetadata(metadata)).toBe(false);
  });

  it('validates the complete vocabulary and distinguishes curation from publishing', () => {
    const metadata = {
      schema_version: 1,
      authors: [
        {
          name: 'A researcher',
          affiliation: 'A laboratory',
          orcid: '0000-0002-1825-0097',
        },
      ],
      description: 'A validated measure.',
      keywords: ['networks'],
      publications: [
        {
          doi: '10.5281/zenodo.12345',
          citation: 'Researcher (2026). A measure.',
          relation: 'validates',
        },
      ],
      related_links: [{ url: 'https://example.org/study', label: 'Study' }],
      funding: 'Example grant',
    };
    const parsed = TemplateMetadataSchema.parse(metadata);
    expect(parsed).toEqual(metadata);
    expect(hasCuratedMetadata(parsed)).toBe(true);
    expect(
      TemplateMetadataSchema.safeParse({
        ...metadata,
        related_links: [{ url: 'HTTPS://example.org/study' }],
      }).success,
    ).toBe(true);
    for (const invalid of [
      {
        ...metadata,
        authors: [{ name: 'A researcher', orcid: 'unverified garbage' }],
      },
      { ...metadata, description: { en: 'Localized metadata is not v1' } },
      { ...metadata, origin: { entry_id: 'author-supplied-origin' } },
      { ...metadata, authors: [{ name: 'Invalid\0author' }] },
      { ...metadata, authors: [{ name: 'Invalid\ud800author' }] },
      {
        ...metadata,
        publications: [
          { citation: 'Paper', relation: 'uses', doi: '10.1234/invalid\0doi' },
        ],
      },
      { ...metadata, related_links: [{ url: 'javascript:alert(1)' }] },
      { ...metadata, related_links: [{ url: 'http://example.org/study' }] },
      { ...metadata, related_links: [{ url: 'ftp://example.org/study' }] },
      { ...metadata, related_links: [{ url: 'mailto:study@example.org' }] },
      { ...metadata, related_links: [{ url: 'https:///path' }] },
      {
        ...metadata,
        related_links: [{ url: 'https://example.com\\@evil.example/path' }],
      },
      {
        ...metadata,
        related_links: [{ url: 'https://user:secret@example.org/study' }],
      },
      {
        ...metadata,
        publications: [{ citation: 'Paper', relation: 'endorses' }],
      },
    ])
      expect(TemplateMetadataSchema.safeParse(invalid).success).toBe(false);
  });
});

describe('portable template artifact', () => {
  it('accepts large valid coordinate arrays within the asset byte limit', async () => {
    const input = datasetFixture(
      'geojson',
      'application/geo+json',
      'large.geojson',
      JSON.stringify({
        type: 'MultiPoint',
        coordinates: Array.from({ length: 150_000 }, () => [1, 2]),
      }),
    );
    const built = await createTemplateArtifact(input);
    expect(built.artifact.assets[0]?.byte_size).toBe(
      input.assets[0]?.bytes.byteLength,
    );
  });
  it('matches the independently generated public hash conformance fixture', async () => {
    const vector = JSON.parse(
      readFileSync(
        new URL(
          '../../../../specifications/template-registry/v1/hash-vector.json',
          import.meta.url,
        ),
        'utf8',
      ),
    ) as {
      input: TemplateArtifactInput;
      canonical_root_input: string;
      manifest: TemplateArtifactManifest;
    };
    expect(vector.manifest.sections).toHaveLength(3);
    expect(
      createHash('sha256').update(vector.canonical_root_input).digest('hex'),
    ).toBe(vector.manifest.merkle_root);
    const created = await createTemplateArtifact(vector.input);
    expect(created.artifact.manifest).toEqual(vector.manifest);
    const { merkle_root: _root, ...input } = created.artifact.manifest;
    expect(new TextDecoder().decode(canonicalJsonBytes(input))).toBe(
      vector.canonical_root_input,
    );
  });

  it('round-trips a self-contained protocol and reproduces identity independent of ZIP encoding and object key order', async () => {
    const input = fixture();
    const created = await createTemplateArtifact(input);
    const repeated = await createTemplateArtifact({
      ...input,
      sections: Object.fromEntries(Object.entries(input.sections).toReversed()),
    });
    expect(created.bytes).toEqual(repeated.bytes);
    const compressed = repack(unzipSync(created.bytes));
    expect(compressed).not.toEqual(created.bytes);
    const fetched = await readTemplateArtifact(compressed);
    expect(fetched.manifest.merkle_root).toBe(
      created.artifact.manifest.merkle_root,
    );
    expect(fetched.sections).toEqual(input.sections);
    expect(fetched.metadata).toEqual(input.metadata);
    expect(fetched.assets[0]?.bytes).toEqual(png);
    expect(fetched.license).toBe('CC-BY-4.0');
    const { merkle_root, ...tree } = fetched.manifest;
    expect(merkle_root).toBe(
      createHash('sha256').update(canonicalJsonBytes(tree)).digest('hex'),
    );
    expect(Object.keys(fetched.manifest)).not.toContain('registry_url');
    expect(Object.keys(fetched.manifest)).not.toContain('publisher_id');
  });

  it('orders section IDs by ECMAScript UTF-16 code units', async () => {
    const astralId = '\u{10000}';
    const bmpId = '\uE000';
    const input = fixture();
    const welcome = input.sections['stage:welcome'];
    if (!welcome || !('id' in welcome))
      throw new Error('fixture stage missing');
    input.sections = {
      ...input.sections,
      stageOrder: { stages: ['welcome', astralId, bmpId] },
      [`stage:${astralId}`]: { ...welcome, id: astralId },
      [`stage:${bmpId}`]: { ...welcome, id: bmpId },
    };
    const artifact = await createTemplateArtifact(input);
    const ids = artifact.artifact.manifest.sections.map(({ id }) => id);
    expect(ids.indexOf(`stage:${astralId}`)).toBeLessThan(
      ids.indexOf(`stage:${bmpId}`),
    );
  });

  it('changes the identity for metadata, license, template description and section changes', async () => {
    const base = await createTemplateArtifact(fixture());
    const variants: TemplateArtifactInput[] = [
      {
        ...fixture(),
        metadata: { schema_version: 1, description: 'Revised provenance' },
      },
      { ...fixture(), license: 'CC0-1.0' },
      {
        ...fixture(),
        template: { ...fixture().template, summary: 'New version summary' },
      },
    ];
    const contentChange = fixture();
    contentChange.sections = {
      ...contentChange.sections,
      'stage:welcome': {
        ...contentChange.sections['stage:welcome'],
        title: 'Revised welcome',
      },
    };
    variants.push(contentChange);
    expect(variants).toHaveLength(4);
    for (const variant of variants) {
      expect(
        (await createTemplateArtifact(variant)).artifact.manifest.merkle_root,
      ).not.toBe(base.artifact.manifest.merkle_root);
    }
  });

  it('snapshots caller-owned metadata, sections and asset bytes before asynchronous screening', async () => {
    const input = fixture();
    const ownedBytes = Uint8Array.from(png);
    input.assets = [{ ...input.assets[0]!, bytes: ownedBytes }];
    const pending = createTemplateArtifact(input);
    input.template.name = 'Changed after call';
    input.metadata.authors![0]!.name = 'Changed author';
    input.sections['stage:welcome']!.title = 'Changed stage';
    ownedBytes.fill(0);
    const result = (await pending).artifact;
    expect(result.manifest.template.name).toBe('Portable template');
    expect(result.metadata.authors![0]!.name).toBe('Example researcher');
    expect(result.sections['stage:welcome']!.title).toBe('Welcome');
    expect(result.assets[0]!.bytes).toEqual(png);
  });

  it('rejects every content-leaf mismatch and a root mismatch', async () => {
    const created = await createTemplateArtifact(fixture());
    const original = unzipSync(created.bytes);
    const manifest = created.artifact.manifest;
    const settings = manifest.sections.find(({ id }) => id === 'settings')!;
    const alteredPng = Uint8Array.from(png);
    // Keep a recognizable PNG and an unchanged byte length: this must fail
    // because the content changed, not because MIME screening catches it.
    alteredPng[45] = alteredPng[45]! ^ 1;
    const replacements = new Map([
      [
        'metadata.json',
        canonicalJsonBytes({ schema_version: 1, description: 'Tampered' }),
      ],
      ['license.json', canonicalJsonBytes({ spdx: 'CC0-1.0' })],
      [
        `sections/${settings.hash}.json`,
        canonicalJsonBytes({
          name: 'Tampered',
          schemaVersion: CURRENT_SCHEMA_VERSION,
        }),
      ],
      [`assets/${manifest.assets[0]!.hash}`, alteredPng],
    ]);
    expect(replacements.size).toBe(4);
    for (const [path, tampered] of replacements) {
      await expect(
        readTemplateArtifact(repack({ ...original, [path]: tampered })),
      ).rejects.toMatchObject({ code: 'TEMPLATE_CONTENT_MISMATCH' });
    }
    const rootChanged = { ...manifest, merkle_root: '0'.repeat(64) };
    await expect(
      readTemplateArtifact(
        repack({
          ...original,
          'manifest.json': canonicalJsonBytes(rootChanged),
        }),
      ),
    ).rejects.toMatchObject({ code: 'TEMPLATE_CONTENT_MISMATCH' });
  });

  it('rejects newer schemas with a stable versioned error and unsupported format revisions', async () => {
    const { bytes } = await createTemplateArtifact(fixture());
    for (const version of [
      CURRENT_SCHEMA_VERSION + 1,
      CURRENT_SCHEMA_VERSION - 1,
    ]) {
      const files = unzipSync(bytes);
      writeManifest(files, {
        ...manifestOf(files),
        protocol_schema_version: version,
      });
      await expect(readTemplateArtifact(repack(files))).rejects.toMatchObject({
        code: 'TEMPLATE_SCHEMA_UNSUPPORTED',
        schemaVersion: version,
      });
    }
    const files = unzipSync(bytes);
    files['manifest.json'] = canonicalJsonBytes({
      ...manifestOf(files),
      format_version: 2,
    });
    await expect(readTemplateArtifact(repack(files))).rejects.toMatchObject({
      code: 'TEMPLATE_FORMAT_UNSUPPORTED',
    });
  });

  it('rejects reordering or duplicate identities even when a publisher recomputes the root', async () => {
    const { bytes } = await createTemplateArtifact(fixture());
    for (const kind of ['reorder', 'duplicate', 'unknown'] as const) {
      const files = unzipSync(bytes);
      const manifest = manifestOf(files);
      if (kind === 'reorder') manifest.sections.reverse();
      if (kind === 'duplicate') manifest.sections.push(manifest.sections[0]!);
      if (kind === 'unknown')
        manifest.sections[0] = {
          ...manifest.sections[0]!,
          id: 'executable:script',
        };
      writeManifest(files, manifest);
      await expect(readTemplateArtifact(repack(files))).rejects.toBeInstanceOf(
        TemplateArtifactError,
      );
    }
  });

  it('revalidates section schema, stage identity, stage order and whole-protocol references', async () => {
    const invalidStage = fixture();
    invalidStage.sections = {
      ...invalidStage.sections,
      'stage:welcome': {
        ...invalidStage.sections['stage:welcome'],
        type: 'CustomScript',
      },
    };
    const wrongIdentity = fixture();
    wrongIdentity.sections = {
      ...wrongIdentity.sections,
      'stage:welcome': {
        ...wrongIdentity.sections['stage:welcome'],
        id: 'another-stage',
      },
    };
    const wrongOrder = fixture();
    wrongOrder.sections = {
      ...wrongOrder.sections,
      stageOrder: { stages: ['absent'] },
    };
    for (const input of [invalidStage, wrongIdentity, wrongOrder]) {
      await expect(createTemplateArtifact(input)).rejects.toMatchObject({
        code: 'TEMPLATE_SECTIONS_INVALID',
      });
    }
    const missingAsset = fixture();
    missingAsset.sections = { ...missingAsset.sections, assets: {} };
    missingAsset.assets = [];
    await expect(createTemplateArtifact(missingAsset)).rejects.toMatchObject({
      code: 'TEMPLATE_ASSET_DISALLOWED',
    });
  });

  it('accepts a partial stage template and still requires its referenced assets', async () => {
    const input = fixture();
    input.template.kind = 'stage';
    input.sections = {
      'stage:welcome': input.sections['stage:welcome']!,
      'assets': input.sections.assets!,
    };
    expect((await createTemplateArtifact(input)).artifact.sections).toEqual(
      input.sections,
    );
    input.sections = { 'stage:welcome': input.sections['stage:welcome']! };
    input.assets = [];
    await expect(createTemplateArtifact(input)).rejects.toMatchObject({
      code: 'TEMPLATE_ASSET_DISALLOWED',
    });
  });

  it('rejects reusable artifacts with more than one qualifying subject', async () => {
    const input = fixture();
    input.template.kind = 'stage';
    input.sections = {
      'stage:first': { ...input.sections['stage:welcome']!, id: 'first' },
      'stage:second': { ...input.sections['stage:welcome']!, id: 'second' },
      'assets': input.sections.assets!,
    };
    await expect(createTemplateArtifact(input)).rejects.toMatchObject({
      code: 'TEMPLATE_SECTIONS_INVALID',
    });
  });

  it('screens actual media bytes, rejects executable classes and never exports embedded API keys', async () => {
    for (const [mediaType, bytes] of [
      ['image/png', encode('<svg><script>alert(1)</script></svg>')],
      ['image/svg+xml', encode('<svg/>')],
      ['application/javascript', encode('alert(1)')],
    ] as const) {
      const input = fixture();
      input.assets = [{ ...input.assets[0]!, media_type: mediaType, bytes }];
      await expect(createTemplateArtifact(input)).rejects.toMatchObject({
        code: 'TEMPLATE_ASSET_DISALLOWED',
      });
    }
    const credentials = fixture();
    credentials.sections = {
      ...credentials.sections,
      assets: {
        ...credentials.sections.assets,
        provider: {
          type: 'apikey',
          name: 'Provider',
          value: 'private-api-secret',
        },
      },
    };
    await expect(createTemplateArtifact(credentials)).rejects.toMatchObject({
      code: 'TEMPLATE_ASSET_DISALLOWED',
    });
  });

  it('admits inert UTF-8 datasets and rejects invalid/active documents disguised as datasets', async () => {
    const input = fixture();
    input.sections = {
      ...input.sections,
      assets: {
        illustration: { type: 'network', name: 'Roster', source: 'roster.csv' },
      },
    };
    input.assets = [
      {
        source: 'roster.csv',
        media_class: 'dataset',
        media_type: 'text/csv',
        bytes: encode('name,age\nExample,25\n'),
      },
    ];
    expect(
      (await createTemplateArtifact(input)).artifact.assets[0]?.media_class,
    ).toBe('dataset');
    for (const bytes of [
      encode('<html>executable document</html>'),
      encode('<body onload="alert(1)">'),
      encode('<!--comment--><script>alert(1)</script>'),
      encode('<?xml version="1.0"?><data/>'),
      Uint8Array.from([0xff, 0xfe, 0x80]),
      encode('name\0,age'),
    ]) {
      await expect(
        createTemplateArtifact({
          ...input,
          assets: [{ ...input.assets[0]!, bytes }],
        }),
      ).rejects.toMatchObject({ code: 'TEMPLATE_ASSET_DISALLOWED' });
    }
  });

  it('accepts the normative CSV grammar and rejects malformed or inconsistent records', async () => {
    const valid = [
      'name,age\nExample,25',
      'name,age\r\nExample,25\r\n',
      'name,notes\nExample,"comma, newline\nand ""quote"""\n',
      'name\n\nExample\n',
      'naïve,tab\n你好,one\tvalue',
      ',\n,',
      '\n',
      ' ',
    ];
    const malformed = [
      'name,notes\nExample,"unclosed',
      'name,notes\nExam"ple,value',
      'name,notes\n"Example"suffix,value',
      'name,age\rExample,25',
      'name,age\nExample',
      'name,age\n\nExample,25',
    ];
    expect(valid).toHaveLength(8);
    expect(malformed).toHaveLength(6);
    for (const text of valid) {
      await expect(
        createTemplateArtifact(
          datasetFixture('network', 'text/csv', 'roster.csv', text),
        ),
      ).resolves.toBeDefined();
    }
    for (const text of malformed) {
      await expect(
        createTemplateArtifact(
          datasetFixture('network', 'text/csv', 'roster.csv', text),
        ),
      ).rejects.toMatchObject({ code: 'TEMPLATE_ASSET_DISALLOWED' });
    }
  });

  it('removes exactly one initial UTF-8 BOM for JSON parsing while retaining hashed bytes', async () => {
    for (const [type, mediaType, source, text] of [
      ['network', 'application/json', 'network.json', '{"nodes":[]}'],
      [
        'geojson',
        'application/geo+json',
        'places.geojson',
        '{"type":"FeatureCollection","features":[]}',
      ],
    ] as const) {
      const original = `\uFEFF${text}`;
      const built = await createTemplateArtifact(
        datasetFixture(type, mediaType, source, original),
      );
      expect(built.artifact.assets[0]?.bytes).toEqual(encode(original));
      expect(built.artifact.assets[0]?.hash).toBe(
        createHash('sha256').update(encode(original)).digest('hex'),
      );
      for (const prefix of ['\uFEFF\uFEFF', ' \uFEFF'])
        await expect(
          createTemplateArtifact(
            datasetFixture(type, mediaType, source, `${prefix}${text}`),
          ),
        ).rejects.toMatchObject({ code: 'TEMPLATE_ASSET_DISALLOWED' });
    }
  });

  it('rejects non-finite decoded numbers throughout JSON datasets', async () => {
    for (const [type, mediaType, source, text] of [
      ['network', 'application/json', 'network.json', '{"value":1e400}'],
      [
        'geojson',
        'application/geo+json',
        'features.geojson',
        '{"type":"Feature","properties":{"value":1e400},"geometry":null}',
      ],
      [
        'geojson',
        'application/geo+json',
        'features.geojson',
        '{"type":"Point","coordinates":[1,2],"foreign":{"value":1e400}}',
      ],
    ] as const) {
      await expect(
        createTemplateArtifact(datasetFixture(type, mediaType, source, text)),
      ).rejects.toMatchObject({ code: 'TEMPLATE_ASSET_DISALLOWED' });
    }
  });

  it('rejects duplicate JSON dataset members before parsing can overwrite them', async () => {
    for (const [type, mediaType, source, text] of [
      [
        'network',
        'application/json',
        'network.json',
        '{"kind":"first","kind":"second"}',
      ],
      [
        'network',
        'application/json',
        'network.json',
        '{"nested":{"name":1,"name":2}}',
      ],
      [
        'network',
        'application/json',
        'network.json',
        '{"na\\u006de":1,"name":2}',
      ],
      [
        'geojson',
        'application/geo+json',
        'features.geojson',
        '{"type":"Point","coordinates":[1,2],"coordinates":[3,4]}',
      ],
    ] as const) {
      await expect(
        createTemplateArtifact(datasetFixture(type, mediaType, source, text)),
      ).rejects.toMatchObject({ code: 'TEMPLATE_ASSET_DISALLOWED' });
    }

    await expect(
      createTemplateArtifact(
        datasetFixture(
          'network',
          'application/json',
          'network.json',
          '{ "nodes": [{ "id": 1 }], "edges": [] }',
        ),
      ),
    ).resolves.toBeDefined();
    await expect(
      createTemplateArtifact(
        datasetFixture(
          'geojson',
          'application/geo+json',
          'features.geojson',
          '{"type":"GeometryCollection","geometries":[{"type":"Point","coordinates":[1,2]},{"type":"Point","coordinates":[],"bbox":[0,1,2,3,4,5]}]}',
        ),
      ),
    ).resolves.toBeDefined();
    await expect(
      createTemplateArtifact(
        datasetFixture(
          'geojson',
          'application/geo+json',
          'features.geojson',
          '{"type":"Polygon","coordinates":[[[0,0],[0,1],[1,1],[-0,0]]]}',
        ),
      ),
    ).resolves.toBeDefined();
  });

  it('bounds JSON dataset nesting before recursive validation', async () => {
    const nested = (depth: number) =>
      `${'{"value":'.repeat(depth)}null${'}'.repeat(depth)}`;
    await expect(
      createTemplateArtifact(
        datasetFixture(
          'network',
          'application/json',
          'network.json',
          nested(64),
        ),
      ),
    ).resolves.toBeDefined();
    await expect(
      createTemplateArtifact(
        datasetFixture(
          'network',
          'application/json',
          'network.json',
          nested(65),
        ),
      ),
    ).rejects.toMatchObject({ code: 'TEMPLATE_ASSET_DISALLOWED' });
  });

  it('validates recursive RFC 7946 GeoJSON structures', async () => {
    const geojson = {
      type: 'FeatureCollection',
      bbox: [-180, -90, 180, 90],
      features: [
        {
          type: 'Feature',
          id: 'all-geometries',
          properties: { label: 'Valid collection' },
          centerline: {
            type: 'LineString',
            coordinates: [
              [-170, 10],
              [170, 11],
            ],
            properties: { retained: 'arbitrary foreign descendant' },
          },
          geometry: {
            type: 'GeometryCollection',
            geometries: [
              { type: 'Point', coordinates: [1, 2] },
              { type: 'MultiPoint', coordinates: [[1, 2]] },
              {
                type: 'LineString',
                coordinates: [
                  [1, 2],
                  [3, 4],
                ],
              },
              {
                type: 'MultiLineString',
                coordinates: [
                  [
                    [1, 2],
                    [3, 4],
                  ],
                ],
              },
              {
                type: 'Polygon',
                coordinates: [
                  [
                    [0, 0],
                    [0, 1],
                    [1, 1],
                    [0, 0],
                  ],
                ],
              },
              {
                type: 'MultiPolygon',
                coordinates: [
                  [
                    [
                      [0, 0],
                      [0, 1],
                      [1, 1],
                      [0, 0],
                    ],
                  ],
                ],
              },
            ],
          },
        },
        { type: 'Feature', properties: null, geometry: null },
        {
          type: 'Feature',
          properties: {},
          geometry: { type: 'Point', coordinates: [] },
        },
      ],
    };
    await expect(
      createTemplateArtifact(
        datasetFixture(
          'geojson',
          'application/geo+json',
          'features.geojson',
          JSON.stringify(geojson),
        ),
      ),
    ).resolves.toBeDefined();

    await expect(
      createTemplateArtifact(
        datasetFixture(
          'geojson',
          'application/geo+json',
          'features.geojson',
          JSON.stringify({
            type: 'Point',
            coordinates: [1, 2, 3],
            bbox: [0, 1, 2, 3, 4, 5],
          }),
        ),
      ),
    ).resolves.toBeDefined();
    await expect(
      createTemplateArtifact(
        datasetFixture(
          'geojson',
          'application/geo+json',
          'features.geojson',
          JSON.stringify({
            type: 'Point',
            coordinates: [],
            bbox: [0, 1, 2, 3, 4, 5],
          }),
        ),
      ),
    ).resolves.toBeDefined();
  });

  it.each([
    ['Point without coordinates', { type: 'Point' }],
    [
      'FeatureCollection with a non-array features member',
      { type: 'FeatureCollection', features: 'invalid' },
    ],
    [
      'Feature without properties',
      { type: 'Feature', geometry: { type: 'Point', coordinates: [1, 2] } },
    ],
    [
      'Feature with an invalid geometry',
      { type: 'Feature', properties: {}, geometry: { type: 'Point' } },
    ],
    [
      'GeometryCollection with a non-geometry member',
      { type: 'GeometryCollection', geometries: [null] },
    ],
    ['short LineString', { type: 'LineString', coordinates: [[1, 2]] }],
    [
      'unclosed Polygon ring',
      {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [0, 1],
            [1, 1],
            [1, 0],
          ],
        ],
      },
    ],
    ['non-numeric position', { type: 'Point', coordinates: ['1', 2] }],
    ['invalid bbox', { type: 'Point', coordinates: [1, 2], bbox: [0, 1, 2] }],
    [
      'bbox dimension does not match its geometry',
      { type: 'Point', coordinates: [1, 2], bbox: [0, 1, 2, 3, 4, 5] },
    ],
    [
      'Feature bbox dimension does not match its geometry',
      {
        type: 'Feature',
        properties: {},
        geometry: { type: 'Point', coordinates: [1, 2, 3] },
        bbox: [0, 1, 2, 3],
      },
    ],
    [
      'FeatureCollection bbox dimension does not match contained geometries',
      {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: { type: 'Point', coordinates: [1, 2] },
          },
        ],
        bbox: [0, 1, 2, 3, 4, 5],
      },
    ],
    [
      'mixed coordinate dimensions',
      {
        type: 'MultiPoint',
        coordinates: [
          [1, 2],
          [1, 2, 3],
        ],
      },
    ],
    [
      'mixed coordinate dimensions in a GeometryCollection',
      {
        type: 'GeometryCollection',
        geometries: [
          { type: 'Point', coordinates: [1, 2] },
          { type: 'Point', coordinates: [1, 2, 3] },
        ],
      },
    ],
    [
      'Feature with a coordinates member',
      {
        type: 'Feature',
        properties: {},
        geometry: null,
        coordinates: [1, 2],
      },
    ],
    [
      'FeatureCollection with a geometries member',
      { type: 'FeatureCollection', features: [], geometries: [] },
    ],
    [
      'FeatureCollection with Feature members',
      {
        type: 'FeatureCollection',
        features: [],
        geometry: null,
        properties: {},
      },
    ],
    [
      'Geometry with Feature members',
      {
        type: 'Point',
        coordinates: [1, 2],
        geometry: null,
        properties: {},
      },
    ],
    [
      'Feature with a features member',
      { type: 'Feature', properties: {}, geometry: null, features: [] },
    ],
    [
      'Geometry with a features member',
      { type: 'Point', coordinates: [1, 2], features: [] },
    ],
    [
      'GeometryCollection with coordinates',
      { type: 'GeometryCollection', geometries: [], coordinates: [] },
    ],
    [
      'coordinate Geometry with geometries',
      { type: 'Point', coordinates: [1, 2], geometries: [] },
    ],
  ])('rejects invalid RFC 7946 GeoJSON: %s', async (_label, value) => {
    await expect(
      createTemplateArtifact(
        datasetFixture(
          'geojson',
          'application/geo+json',
          'features.geojson',
          JSON.stringify(value),
        ),
      ),
    ).rejects.toMatchObject({ code: 'TEMPLATE_ASSET_DISALLOWED' });
  });

  it('rejects missing, extra, duplicate, traversal and disagreeing local/central ZIP entries', async () => {
    const { bytes } = await createTemplateArtifact(fixture());
    const original = unzipSync(bytes);
    const missing = { ...original };
    delete missing['metadata.json'];
    await expect(readTemplateArtifact(repack(missing))).rejects.toMatchObject({
      code: 'TEMPLATE_ARTIFACT_INVALID',
    });
    for (const path of [
      '../manifest.json',
      '/manifest.json',
      'assets/../../secret',
      'script.js',
      `assets/${'0'.repeat(64)}`,
    ]) {
      await expect(
        readTemplateArtifact(
          repack({ ...original, [path]: encode('hidden payload') }),
        ),
      ).rejects.toMatchObject({ code: 'TEMPLATE_ARTIFACT_INVALID' });
    }
    const entries = Object.entries(original);
    await expect(
      readTemplateArtifact(streamedArchive([...entries, entries[0]!])),
    ).rejects.toMatchObject({ code: 'TEMPLATE_ARTIFACT_INVALID' });
    const localMismatch = streamedArchive([
      ['manifest.json', original['manifest.json']!],
      ...entries.filter(([name]) => name !== 'manifest.json'),
    ]);
    localMismatch.set(encode('metadata.json'), 30);
    await expect(readTemplateArtifact(localMismatch)).rejects.toMatchObject({
      code: 'TEMPLATE_ARTIFACT_INVALID',
    });
    await expect(
      readTemplateArtifact(bytes.subarray(0, bytes.byteLength - 22)),
    ).rejects.toMatchObject({ code: 'TEMPLATE_ARTIFACT_INVALID' });
  });

  it('requires canonical JSON instead of accepting duplicate keys or changing imported metadata', async () => {
    const { bytes } = await createTemplateArtifact(fixture());
    for (const nonCanonical of [
      '{ "schema_version": 1 }',
      '{"schema_version":1,"schema_version":1}',
      '{"description":"\\ud800","schema_version":1}',
    ]) {
      const files = unzipSync(bytes);
      files['metadata.json'] = encode(nonCanonical);
      writeManifest(files, {
        ...manifestOf(files),
        metadata_hash: templateBytesHash(files['metadata.json']),
      });
      await expect(readTemplateArtifact(repack(files))).rejects.toMatchObject({
        code: 'TEMPLATE_ARTIFACT_INVALID',
      });
    }
    expect(() =>
      readCanonicalJson(encode('{"a":'.repeat(65) + '1' + '}'.repeat(65))),
    ).toThrow(TemplateArtifactError);
    expect(() => readCanonicalJson(encode('{"value":"\\u0000"}'))).toThrow(
      TemplateArtifactError,
    );
    expect(() => readCanonicalJson(encode('{"\\ud800":true}'))).toThrow(
      TemplateArtifactError,
    );
    expect(readCanonicalJson(canonicalJsonBytes({ value: 'A 🌍' }))).toEqual({
      value: 'A 🌍',
    });
  });

  it('rejects a byte-order mark instead of silently changing the hashed JSON bytes', async () => {
    const created = await createTemplateArtifact(fixture());
    const bom = Uint8Array.from([0xef, 0xbb, 0xbf]);
    const prefixed = (bytes: Uint8Array) => {
      const output = new Uint8Array(bom.length + bytes.length);
      output.set(bom);
      output.set(bytes, bom.length);
      return output;
    };
    for (const name of ['manifest.json', 'metadata.json']) {
      const files = unzipSync(created.bytes);
      files[name] = prefixed(files[name]!);
      if (name === 'metadata.json') {
        writeManifest(files, {
          ...manifestOf(files),
          metadata_hash: templateBytesHash(files[name]!),
        });
      }
      await expect(readTemplateArtifact(repack(files))).rejects.toMatchObject({
        code: 'TEMPLATE_ARTIFACT_INVALID',
      });
    }
  });

  it('accepts streamed stored and compressed ZIP files with matched data descriptors', async () => {
    const created = await createTemplateArtifact(fixture());
    const entries = Object.entries(unzipSync(created.bytes));
    for (const compress of [false, true]) {
      const read = await readTemplateArtifact(
        streamedArchive(entries, compress),
      );
      expect(read.manifest.merkle_root).toBe(
        created.artifact.manifest.merkle_root,
      );
      expect(read.assets[0]!.bytes).toEqual(png);
    }
  });

  it('binds central records to the actual local ranges and rejects unsupported ZIP framing', async () => {
    const created = await createTemplateArtifact(fixture());
    const original = created.bytes;
    const end = original.byteLength - 22;
    const central = new DataView(
      original.buffer,
      original.byteOffset,
      original.byteLength,
    ).getUint32(end + 16, true);
    const corruptions: ((view: DataView) => void)[] = [
      (view) => view.setUint32(central, 0, true),
      (view) => view.setUint32(central + 42, 1, true),
      (view) => view.setUint32(central + 20, 1, true),
      (view) => view.setUint16(central + 8, 1, true),
      (view) => {
        view.setUint16(central + 8, 1, true);
        view.setUint16(6, 1, true);
      },
      (view) => view.setUint16(end + 4, 1, true),
      (view) => view.setUint16(end + 8, 1, true),
      (view) => view.setUint32(end + 12, 1, true),
      // Both header checksums agree, but the decoded bytes have another CRC.
      (view) => {
        view.setUint32(central + 16, 0, true);
        view.setUint32(14, 0, true);
      },
    ];
    expect(corruptions).toHaveLength(9);
    for (const corrupt of corruptions) {
      const bytes = Uint8Array.from(original);
      corrupt(new DataView(bytes.buffer));
      await expect(readTemplateArtifact(bytes)).rejects.toMatchObject({
        code: 'TEMPLATE_ARTIFACT_INVALID',
      });
    }
    // Extra fields can give other ZIP readers a different filename or local
    // payload interpretation. They are not part of this versioned transport.
    const extras = zipSync(unzipSync(original), {
      level: 0,
      extra: { 0xcafe: encode('alternate local framing') },
    });
    await expect(readTemplateArtifact(extras)).rejects.toMatchObject({
      code: 'TEMPLATE_ARTIFACT_INVALID',
    });
    const commented = zipSync(unzipSync(original), {
      level: 0,
      comment: 'Unsupported transport comment',
    });
    await expect(readTemplateArtifact(commented)).rejects.toMatchObject({
      code: 'TEMPLATE_ARTIFACT_INVALID',
    });
  });

  it('enforces archive, declared-entry and actual inflation caps', async () => {
    await expect(
      readTemplateArtifact(
        new Uint8Array(TEMPLATE_ARTIFACT_LIMITS.archiveBytes + 1),
      ),
    ).rejects.toMatchObject({ code: 'TEMPLATE_TOO_LARGE' });
    const input = fixture();
    await expect(
      createTemplateArtifact({
        ...input,
        assets: [
          {
            ...input.assets[0]!,
            bytes: new Uint8Array(TEMPLATE_ARTIFACT_LIMITS.assetBytes + 1),
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'TEMPLATE_TOO_LARGE' });
    const { bytes } = await createTemplateArtifact(input);
    const files = unzipSync(bytes);
    const bomb = encode(
      'x'.repeat(TEMPLATE_ARTIFACT_LIMITS.sectionBytes + 100_000),
    );
    files[`sections/${templateBytesHash(bomb)}.json`] = bomb;
    const packed = repack(files);
    expect(packed.byteLength).toBeLessThan(10_000);
    expect(() => readTemplateArchive(packed)).toThrowError(
      expect.objectContaining({ code: 'TEMPLATE_TOO_LARGE' }),
    );
    // Forge local and central uncompressed sizes. A metadata-only cap passes;
    // actual streaming output must still stop before accepting the expansion.
    // Put the malicious section first so earlier honest small files do not
    // end with the intentionally false size before the expansion is observed.
    const maliciousFirst = repack({
      [`sections/${templateBytesHash(bomb)}.json`]: bomb,
      ...files,
    });
    const actual = Uint8Array.from(maliciousFirst);
    const actualView = new DataView(actual.buffer);
    for (let offset = 0; offset + 28 < actual.byteLength; offset++) {
      const signature = actualView.getUint32(offset, true);
      if (signature === 0x04034b50) actualView.setUint32(offset + 22, 1, true);
      if (signature === 0x02014b50) actualView.setUint32(offset + 24, 1, true);
    }
    expect(() => readTemplateArchive(actual)).toThrowError(
      expect.objectContaining({ code: 'TEMPLATE_TOO_LARGE' }),
    );
  });

  it('caps aggregate content and ZIP entry counts even when every entry is individually small enough', async () => {
    const { bytes } = await createTemplateArtifact(fixture());
    const files = unzipSync(bytes);
    const tooMany = { ...files };
    for (let index = 0; index < TEMPLATE_ARTIFACT_LIMITS.files; index++) {
      tooMany[`assets/${index.toString(16).padStart(64, '0')}`] = encode('x');
    }
    expect(() => readTemplateArchive(repack(tooMany))).toThrowError(
      expect.objectContaining({ code: 'TEMPLATE_TOO_LARGE' }),
    );
    const tooMuch = { ...files };
    for (let index = 0; index < 4; index++) {
      const body = new Uint8Array(9 * 1024 * 1024);
      body[0] = index;
      tooMuch[`assets/${templateBytesHash(body)}`] = body;
    }
    const packed = repack(tooMuch);
    expect(packed.byteLength).toBeLessThan(
      TEMPLATE_ARTIFACT_LIMITS.archiveBytes,
    );
    expect(() => readTemplateArchive(packed)).toThrowError(
      expect.objectContaining({ code: 'TEMPLATE_TOO_LARGE' }),
    );
  });
});
