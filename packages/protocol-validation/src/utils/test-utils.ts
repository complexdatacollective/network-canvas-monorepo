import type { NodeDefinition } from '../schemas/9/codebook/definitions.ts';

/** A localized string with one translation, in the base protocol's language. */
export const localized = (text: string, locale = 'en') => ({ [locale]: text });

/** Canonical `{ value, label }` options with their default labels localized. */
export const localizedOptions = <Value>(
  options: readonly { value: Value; label: string }[],
) => options.map(({ value, label }) => ({ value, label: localized(label) }));

/**
 * Creates a base valid protocol for testing variations
 */
export const createBaseProtocol = () => ({
  name: 'Test Protocol',
  schemaVersion: 9 as const,
  localization: { defaultLocale: 'en', locales: ['en'] },
  codebook: {
    ego: {
      variables: {
        egoName: {
          name: 'EgoName',
          type: 'text',
          component: 'Text',
        },
        egoAge: {
          name: 'EgoAge',
          type: 'number',
          component: 'Number',
        },
      },
    },
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        shape: { default: 'circle' } as NodeDefinition['shape'],
        variables: {
          name: {
            name: 'Name',
            type: 'text',
            component: 'Text',
          },
          age: {
            name: 'Age',
            type: 'number',
            component: 'Number',
          },
          category: {
            name: 'Category',
            type: 'categorical',
            options: [
              { label: localized('Friend'), value: 'friend' },
              { label: localized('Family'), value: 'family' },
            ],
          },
          strength: {
            name: 'Relationship_Strength',
            type: 'ordinal',
            options: [
              { label: localized('Weak'), value: 1 },
              { label: localized('Medium'), value: 2 },
              { label: localized('Strong'), value: 3 },
            ],
          },
          layoutPosition: {
            name: 'Layout_Position',
            type: 'layout',
          },
        },
      },
      colleague: {
        name: 'Colleague',
        color: 'node-color-seq-2',
        shape: { default: 'circle' } as NodeDefinition['shape'],
        variables: {
          colleagueName: {
            name: 'Name',
            type: 'text',
          },
          department: {
            name: 'Department',
            type: 'text',
          },
        },
      },
    },
    edge: {
      knows: {
        name: 'Knows',
        color: 'edge-color-seq-1',
        variables: {
          closeness: {
            name: 'Closeness',
            type: 'ordinal',
            component: 'RadioGroup',
            options: [
              { label: localized('Not Close'), value: 1 },
              { label: localized('Somewhat Close'), value: 2 },
              { label: localized('Very Close'), value: 3 },
            ],
          },
          duration: {
            name: 'Duration',
            type: 'number',
            component: 'Number',
          },
        },
      },
      collaborates: {
        name: 'Collaborates',
        color: 'edge-color-seq-2',
        variables: {
          frequency: {
            name: 'Frequency',
            type: 'ordinal',
            options: [
              { label: localized('Rarely'), value: 1 },
              { label: localized('Sometimes'), value: 2 },
              { label: localized('Often'), value: 3 },
            ],
          },
        },
      },
    },
  },
  stages: [
    {
      id: 'nameGenerator1',
      type: 'NameGenerator',
      label: localized('Generate Names'),
      subject: {
        entity: 'node',
        type: 'person',
      },
      form: {
        title: localized('Add person'),
        fields: [
          {
            variable: 'name',
            prompt: localized('Enter name'),
          },
        ],
      },
      prompts: [
        {
          id: 'prompt1',
          text: localized('Who do you know?'),
        },
      ],
    },
    {
      id: 'sociogram1',
      type: 'Sociogram',
      label: localized('Sociogram'),
      subject: {
        entity: 'node',
        type: 'person',
      },
      background: {
        concentricCircles: 4,
      },
      prompts: [
        {
          id: 'socPrompt1',
          text: localized('Position nodes'),
          layout: {
            layoutVariable: 'layoutPosition',
          },
        },
      ],
    },
  ],
});
