import { unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { CURRENT_SCHEMA_VERSION } from '@codaco/protocol-validation';

import type { SectionDoc } from '../apply.ts';
import { assertSectionValid } from '../section-validation.ts';
import { canonicalJsonBytes } from '../template-archive.ts';
import {
  createTemplateArtifact,
  readTemplateArtifact,
  templateBytesHash,
  templateMerkleRoot,
  type TemplateArtifactInput,
  type TemplateArtifactManifest,
} from '../template-exchange.ts';

const information: SectionDoc = {
  id: 'example',
  type: 'Information',
  label: 'Example',
  title: 'Example',
  items: [{ id: 'text', type: 'text', content: 'Example information.' }],
};
const edge: SectionDoc = { name: 'Relationship' };
const node: SectionDoc = {
  name: 'Person',
  color: 'node-color-seq-1',
  shape: { default: 'circle' },
};
const variable = { name: 'Label', type: 'text' };
const subject = { entity: 'node', type: 'person' };
const prompt = { id: 'prompt', text: 'Who belongs in this network?' };
const introductionPanel = { title: 'Connections', text: 'Consider each pair.' };
const sociogram: SectionDoc = {
  id: 'example',
  type: 'Sociogram',
  label: 'Connections',
  subject,
  background: { concentricCircles: 0 },
  prompts: [
    {
      ...prompt,
      layout: { layoutVariable: 'layout' },
      edges: { display: ['relationship'] },
    },
  ],
};

function input(
  kind: TemplateArtifactInput['template']['kind'],
  sections: Record<string, SectionDoc>,
): TemplateArtifactInput {
  return {
    template: { name: 'Kind contract', kind, version: 1 },
    metadata: { schema_version: 1 },
    license: 'CC0-1.0',
    assets: [],
    // Supporting sections are permitted for every kind.
    sections: {
      settings: {
        name: 'Kind contract',
        schemaVersion: CURRENT_SCHEMA_VERSION,
      },
      ...sections,
    },
  };
}

const validCases: { name: string; input: TemplateArtifactInput }[] = [
  {
    name: 'protocol',
    input: input('protocol', {
      'stageOrder': { stages: ['example'] },
      'stage:example': information,
    }),
  },
  {
    name: 'stage',
    input: input('stage', {
      'stage:example': information,
      'codebook:node:person': node,
    }),
  },
  ...(
    [
      ['node', 'codebook:node:person', node],
      ['edge', 'codebook:edge:relationship', edge],
      ['ego', 'codebook:ego', {}],
    ] satisfies [string, string, SectionDoc][]
  ).flatMap(([name, id, definition]) => [
    {
      name: `${name} entity definition`,
      input: input('entity_definition', { [id]: definition }),
    },
    {
      name: `${name} variable set`,
      input: input('variable_set', {
        [id]: { ...definition, variables: { label: variable } },
      }),
    },
  ]),
  ...(
    [
      {
        type: 'NameGenerator',
        form: {
          title: 'Person',
          fields: [{ variable: 'label', prompt: 'Name' }],
        },
        prompts: [prompt],
      },
      { type: 'NameGeneratorQuickAdd', quickAdd: 'label', prompts: [prompt] },
      {
        type: 'DyadCensus',
        introductionPanel,
        prompts: [{ ...prompt, createEdge: 'relationship' }],
      },
      {
        type: 'TieStrengthCensus',
        introductionPanel,
        prompts: [
          {
            ...prompt,
            createEdge: 'relationship',
            edgeVariable: 'strength',
            negativeLabel: 'No connection',
          },
        ],
      },
      {
        type: 'OneToManyDyadCensus',
        behaviours: { removeAfterConsideration: true },
        prompts: [{ ...prompt, createEdge: 'relationship' }],
      },
      {
        ...sociogram,
        prompts: [
          {
            ...prompt,
            layout: { layoutVariable: 'layout' },
            edges: { create: 'relationship' },
          },
        ],
      },
    ] satisfies SectionDoc[]
  ).map((stage) => ({
    name: `${String(stage.type)} generator prompts`,
    input: input('generator_prompt_set', {
      'stage:example': { id: 'example', label: 'Example', subject, ...stage },
    }),
  })),
];
const roster = input('generator_prompt_set', {
  'stage:example': {
    id: 'example',
    label: 'Roster',
    type: 'NameGeneratorRoster',
    subject,
    dataSource: 'roster',
    prompts: [prompt],
  },
  'assets': {
    roster: { name: 'Roster', type: 'network', source: 'roster.csv' },
  },
});
roster.assets = [
  {
    source: 'roster.csv',
    media_type: 'text/csv',
    media_class: 'dataset',
    bytes: new TextEncoder().encode('name\nExample\n'),
  },
];
validCases.push({
  name: 'NameGeneratorRoster generator prompts with required asset',
  input: roster,
});

/** Rebuild all references and hashes so only the declared kind is incompatible. */
function replaceSections(
  bytes: Uint8Array,
  kind: TemplateArtifactInput['template']['kind'],
  sections: Record<string, SectionDoc>,
): Uint8Array {
  const files = unzipSync(bytes);
  const manifest = JSON.parse(
    new TextDecoder().decode(files['manifest.json']),
  ) as TemplateArtifactManifest;
  for (const section of manifest.sections)
    delete files[`sections/${section.hash}.json`];
  manifest.template.kind = kind;
  manifest.sections = Object.entries(sections)
    .map(([id, doc]) => {
      // A separate assertion proves malformed protocol content is not the refusal oracle.
      assertSectionValid(id, doc, Object.keys(sections));
      const content = canonicalJsonBytes(doc);
      const hash = templateBytesHash(content);
      files[`sections/${hash}.json`] = content;
      return { id, hash };
    })
    .toSorted((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const { merkle_root: _old, ...root } = manifest;
  files['manifest.json'] = canonicalJsonBytes({
    ...root,
    merkle_root: templateMerkleRoot(root),
  });
  return zipSync(files, { level: 9, mtime: new Date(1980, 0, 1) });
}

const incompatible: {
  name: string;
  kind: TemplateArtifactInput['template']['kind'];
  sections: Record<string, SectionDoc>;
}[] = [
  ...(
    [
      'stage',
      'entity_definition',
      'variable_set',
      'generator_prompt_set',
    ] as const
  ).map((kind) => ({
    name: `${kind} over settings only`,
    kind,
    sections: input(kind, {}).sections,
  })),
  {
    name: 'stage over entity definition',
    kind: 'stage',
    sections: { 'codebook:edge:relationship': edge },
  },
  {
    name: 'entity definition over stage',
    kind: 'entity_definition',
    sections: { 'stage:example': information },
  },
  {
    name: 'variable set over stage',
    kind: 'variable_set',
    sections: { 'stage:example': information },
  },
  {
    name: 'variable set over missing variables',
    kind: 'variable_set',
    sections: { 'codebook:edge:relationship': edge },
  },
  {
    name: 'variable set over empty variables',
    kind: 'variable_set',
    sections: { 'codebook:ego': { variables: {} } },
  },
  {
    name: 'generator prompts over entity variables',
    kind: 'generator_prompt_set',
    sections: { 'codebook:ego': { variables: { label: variable } } },
  },
  {
    name: 'generator prompts over information stage',
    kind: 'generator_prompt_set',
    sections: { 'stage:example': information },
  },
  {
    name: 'generator prompts over display-only Sociogram',
    kind: 'generator_prompt_set',
    sections: { 'stage:example': sociogram },
  },
  {
    name: 'generator prompts over an empty census edge reference',
    kind: 'generator_prompt_set',
    sections: {
      'stage:example': {
        id: 'example',
        type: 'DyadCensus',
        label: 'Connections',
        subject,
        introductionPanel,
        prompts: [{ ...prompt, createEdge: '' }],
      },
    },
  },
  {
    name: 'generator prompts over an empty Sociogram edge reference',
    kind: 'generator_prompt_set',
    sections: {
      'stage:example': {
        ...sociogram,
        prompts: [
          {
            ...prompt,
            layout: { layoutVariable: 'layout' },
            edges: { create: '' },
          },
        ],
      },
    },
  },
  {
    name: 'generator prompts over ordinary variable prompts',
    kind: 'generator_prompt_set',
    sections: {
      'stage:example': {
        id: 'example',
        label: 'Ranks',
        type: 'OrdinalBin',
        subject,
        prompts: [{ ...prompt, variable: 'rank', color: 'ord-color-seq-1' }],
      },
    },
  },
];

describe('template kind requires corresponding content', () => {
  it.each(validCases)(
    'accepts $name and its supporting sections',
    async ({ input: value }) => {
      const created = await createTemplateArtifact(value);
      expect(created.artifact.manifest.template.kind).toBe(value.template.kind);
      expect(created.artifact.sections).toEqual(value.sections);
      const read = await readTemplateArtifact(created.bytes);
      expect(read.manifest.merkle_root).toBe(
        created.artifact.manifest.merkle_root,
      );
      expect(read.sections).toEqual(value.sections);
    },
  );

  it.each(incompatible)(
    'refuses $name with correct archive hashes and valid section schemas',
    async ({ kind, sections }) => {
      const control = input('stage', { 'stage:example': information });
      const created = await createTemplateArtifact(control);
      const validRoundTrip = replaceSections(
        created.bytes,
        'stage',
        control.sections,
      );
      expect((await readTemplateArtifact(validRoundTrip)).sections).toEqual(
        control.sections,
      );
      const incompatibleArchive = replaceSections(
        created.bytes,
        kind,
        sections,
      );
      await expect(
        readTemplateArtifact(incompatibleArchive),
      ).rejects.toMatchObject({ code: 'TEMPLATE_SECTIONS_INVALID' });
    },
  );
});
