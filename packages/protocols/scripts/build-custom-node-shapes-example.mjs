#!/usr/bin/env node
// Builds examples/custom-node-shapes/protocol.json and its assets/ folder from
// the SVG files in examples/custom-node-shapes/shapes/{illustrated,accented}.
// The SVG files are the source; each becomes an image asset, written in the
// canonical form the node shape parser produces.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseNodeShapeSvg,
  serializeNodeShapeSvg,
} from '../../fresco-ui/src/node/nodeShapeSvg.ts';

const exampleDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'examples',
  'custom-node-shapes',
);
const protocolPath = join(exampleDir, 'protocol.json');
const assetDir = join(exampleDir, 'assets');

const kinds = [
  { value: 'person', label: 'A person' },
  { value: 'group', label: 'A group' },
  { value: 'home', label: 'A home' },
  { value: 'school', label: 'A school' },
  { value: 'place', label: 'A place' },
  { value: 'activity', label: 'An activity' },
  { value: 'community', label: 'A community or faith setting' },
  { value: 'professional', label: 'A professional or service' },
  { value: 'animal', label: 'An animal' },
  { value: 'online', label: 'An online space' },
  { value: 'memory', label: 'An object or memory' },
  { value: 'other', label: 'Something else' },
];

const en = (text) => ({ en: text });

const assetManifest = {};

async function readShapes(set) {
  const shapes = {};
  for (const { value, label } of kinds) {
    const file = join(exampleDir, 'shapes', set, `${value}.svg`);
    const result = parseNodeShapeSvg(await readFile(file, 'utf8'));
    if (!result.success || result.issues.length > 0) {
      const detail = result.issues
        .map((issue) => `${issue.code}: ${issue.detail}`)
        .join('; ');
      throw new Error(`${file} is not a valid node shape SVG (${detail})`);
    }
    const assetId = `shape-${set}-${value}`;
    const source = `${assetId}.svg`;
    await writeFile(
      join(assetDir, source),
      `${serializeNodeShapeSvg(result.shape)}\n`,
    );
    assetManifest[assetId] = {
      id: assetId,
      type: 'image',
      name: `${value}.svg (${set})`,
      source,
    };
    shapes[value] = {
      name: label.replace(/^An? /, '').replace(/^./, (c) => c.toUpperCase()),
      asset: assetId,
    };
  }
  return shapes;
}

function nodeType({ key, name, color, customShapes }) {
  return {
    name,
    color,
    icon: 'add-a-person',
    customShapes,
    shape: {
      default: 'custom:other',
      dynamic: {
        variable: `${key}_type`,
        type: 'discrete',
        map: kinds.map(({ value }) => ({ value, shape: `custom:${value}` })),
      },
    },
    variables: {
      [`${key}_name`]: {
        name: 'name',
        type: 'text',
        component: 'Text',
        validation: { required: true },
      },
      [`${key}_type`]: {
        name: 'type',
        type: 'categorical',
        component: 'ToggleButtonGroup',
        options: kinds.map(({ value, label }) => ({ label: en(label), value })),
        validation: { required: true, maxSelected: 1 },
      },
      [`${key}_layout`]: { name: 'layout', type: 'layout' },
    },
  };
}

function nameGenerator({ id, type, label, prompt }) {
  return {
    id,
    type: 'NameGenerator',
    label: en(label),
    subject: { entity: 'node', type },
    form: {
      title: en('Add to my world'),
      fields: [
        {
          id: `field-${type}_name`,
          variable: `${type}_name`,
          prompt: en('What do you call them or it?'),
        },
        {
          id: `field-${type}_type`,
          variable: `${type}_type`,
          prompt: en('What kind of thing is it?'),
        },
      ],
    },
    prompts: [{ id: `${id}-prompt`, text: en(prompt) }],
  };
}

function sociogram({ id, type, edge, label }) {
  return {
    id,
    type: 'Sociogram',
    label: en(label),
    subject: { entity: 'node', type },
    background: { concentricCircles: 3, skewedTowardCenter: true },
    prompts: [
      {
        id: `${id}-prompt`,
        text: en(
          'Put the things that matter **most** to you in the middle. Then tap two things to join them up if they **go together**.',
        ),
        layout: { layoutVariable: `${type}_layout` },
        edges: { create: edge, display: [edge] },
      },
    ],
  };
}

async function buildProtocol() {
  await rm(assetDir, { recursive: true, force: true });
  await mkdir(assetDir);

  const template = JSON.parse(
    await readFile(
      join(
        exampleDir,
        '..',
        '..',
        'templates',
        'mental-health-networks',
        'protocol.json',
      ),
      'utf8',
    ),
  );
  const finish = template.stages.find(
    (stage) => stage.type === 'FinishSession' && stage.outcome === 'completed',
  );
  const illustrated = await readShapes('illustrated');
  const accented = await readShapes('accented');

  return {
    name: 'Custom Node Shapes',
    description:
      'An example of custom node shapes for a study with children. The things in a child\'s world are drawn with a picture chosen by a "type" attribute. One node type uses pictures with their own colours; a second uses the node type\'s colour for the main parts of each picture.',
    schemaVersion: template.schemaVersion,
    localization: { defaultLocale: 'en', locales: ['en'] },
    lastModified: '2026-11-13T00:00:00.000Z',
    experiments: {},
    codebook: {
      node: {
        world_illustrated: nodeType({
          key: 'world_illustrated',
          name: 'Part of my world',
          color: 'node-color-seq-1',
          customShapes: illustrated,
        }),
        world_accented: nodeType({
          key: 'world_accented',
          name: 'Part of my world (node colour)',
          color: 'node-color-seq-6',
          customShapes: accented,
        }),
      },
      edge: {
        goes_with: { name: 'Goes with', color: 'edge-color-seq-1' },
        goes_with_accented: {
          name: 'Goes with (node colour)',
          color: 'edge-color-seq-3',
        },
      },
    },
    assetManifest,
    stages: [
      {
        id: 'welcome',
        type: 'Information',
        label: en('Welcome'),
        content: en(
          '# My world\n\nWe are going to make a picture of **your world**: the people, places, animals and things that matter to you.\n\nThere are no right or wrong answers. You can skip anything you do not want to talk about.',
        ),
      },
      nameGenerator({
        id: 'name-illustrated',
        type: 'world_illustrated',
        label: 'Who and what is in your world?',
        prompt:
          'Who and what is **important to you**? Add each one, and choose what kind of thing it is.',
      }),
      sociogram({
        id: 'map-illustrated',
        type: 'world_illustrated',
        edge: 'goes_with',
        label: 'Make your map',
      }),
      {
        id: 'accented-introduction',
        type: 'Information',
        label: en('Node-coloured shapes'),
        content: en(
          "# The same shapes in the node colour\n\n_For researchers._ The next two screens repeat the task with a second node type. The main parts of its shapes are drawn in the node type's own colour (`var(--node-color)` and `var(--node-color-dark)`), and the details keep colours of their own. Change the node type's colour in Architect and every shape follows.",
        ),
      },
      nameGenerator({
        id: 'name-accented',
        type: 'world_accented',
        label: 'Add some more',
        prompt:
          'Add a few more things from your world, and choose what kind of thing each one is.',
      }),
      sociogram({
        id: 'map-accented',
        type: 'world_accented',
        edge: 'goes_with_accented',
        label: 'Make another map',
      }),
      finish,
    ],
    interfaceText: template.interfaceText,
  };
}

await writeFile(
  protocolPath,
  `${JSON.stringify(await buildProtocol(), null, 2)}\n`,
);
