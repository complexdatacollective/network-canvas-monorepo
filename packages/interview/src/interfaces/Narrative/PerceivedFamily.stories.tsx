import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useState } from 'react';
import { expect, waitFor, within } from 'storybook/test';
import { SuperJSON } from 'superjson';

import { SyntheticInterview } from '@codaco/protocol-utilities';
import { CurrentProtocolSchema } from '@codaco/protocol-validation';
import prototype from '@codaco/protocols/e2e/perceived-family/protocol.json';
import { entityAttributesProperty, type NcNode } from '@codaco/shared-consts';

import StoryInterviewShell from '../../storybook-support/StoryInterviewShell';

// The demonstration protocol names its entries by UUID; the people below are
// recorded against them, found by the names the protocol gives them.
const entryNamed = <T extends { name: string }>(
  record: Record<string, T>,
  name: string,
): [string, T] => {
  const entry = Object.entries(record).find(([, value]) => value.name === name);
  if (!entry) throw new Error(`The protocol has no entry named ${name}.`);
  return entry;
};
const [PERSON_TYPE, personType] = entryNamed(prototype.codebook.node, 'Person');
const [KNOWS_TYPE] = entryNamed(prototype.codebook.edge, 'Knows');
const variable = (name: string) => entryNamed(personType.variables, name)[0];
const V = {
  name: variable('name'),
  relationship_words: variable('relationship_words'),
  family_categories: variable('family_categories'),
  feels_family: variable('feels_family'),
  emotional_support: variable('emotional_support'),
  practical_support: variable('practical_support'),
  identity_affirming: variable('identity_affirming'),
  closeness: variable('closeness'),
};
const FAMILY_LAYOUT = entryNamed(
  prototype.codebook.layouts,
  'family_layout',
)[0];

const people: NcNode[] = [
  {
    _uid: 'maya',
    type: PERSON_TYPE,
    [entityAttributesProperty]: {
      [V.name]: 'Maya',
      [V.relationship_words]: 'My aunt',
      [V.family_categories]: ['grew_up'],
      [V.feels_family]: true,
      [V.emotional_support]: true,
      [V.practical_support]: false,
      [V.identity_affirming]: true,
      [V.closeness]: 3,
      [FAMILY_LAYOUT]: { x: 0.4, y: 0.36 },
    },
  },
  {
    _uid: 'jo',
    type: PERSON_TYPE,
    [entityAttributesProperty]: {
      [V.name]: 'Jo',
      [V.relationship_words]: 'Chosen sibling',
      [V.family_categories]: ['chosen'],
      [V.feels_family]: true,
      [V.emotional_support]: true,
      [V.practical_support]: true,
      [V.identity_affirming]: true,
      [V.closeness]: 3,
      [FAMILY_LAYOUT]: { x: 0.61, y: 0.37 },
    },
  },
  {
    _uid: 'kai',
    type: PERSON_TYPE,
    [entityAttributesProperty]: {
      [V.name]: 'Kai',
      [V.relationship_words]: 'My partner',
      [V.family_categories]: ['partner', 'chosen'],
      [V.feels_family]: true,
      [V.emotional_support]: true,
      [V.practical_support]: false,
      [V.identity_affirming]: true,
      [V.closeness]: 3,
      [FAMILY_LAYOUT]: { x: 0.48, y: 0.62 },
    },
  },
  {
    _uid: 'avery',
    type: PERSON_TYPE,
    [entityAttributesProperty]: {
      [V.name]: 'Avery',
      [V.relationship_words]: 'My parent; we are figuring things out',
      [V.family_categories]: ['grew_up'],
      [V.feels_family]: true,
      [V.emotional_support]: false,
      [V.practical_support]: true,
      [V.identity_affirming]: false,
      [V.closeness]: 2,
      [FAMILY_LAYOUT]: { x: 0.24, y: 0.59 },
    },
  },
  {
    _uid: 'sam',
    type: PERSON_TYPE,
    [entityAttributesProperty]: {
      [V.name]: 'Sam',
      [V.relationship_words]: 'A friend who feels like family',
      [V.family_categories]: ['chosen', 'another'],
      [V.feels_family]: true,
      [V.emotional_support]: true,
      [V.practical_support]: false,
      [V.identity_affirming]: true,
      [V.closeness]: 2,
      [FAMILY_LAYOUT]: { x: 0.74, y: 0.58 },
    },
  },
];

function PerceivedFamilyStory({ step }: { step: number }) {
  const [rawPayload, setRawPayload] = useState<string>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    let active = true;
    const prepare = async () => {
      const result = await CurrentProtocolSchema.safeParseAsync(prototype);
      if (!active) return;
      if (!result.success) {
        setError('The demonstration protocol could not be validated.');
        return;
      }
      const baseline = new SyntheticInterview(17).getInterviewPayload();
      setRawPayload(
        SuperJSON.stringify({
          ...baseline,
          currentStep: step,
          protocol: { ...baseline.protocol, ...result.data },
          network: {
            ego: { [entityAttributesProperty]: {} },
            nodes: people,
            edges: [
              {
                _uid: 'jo-kai',
                type: KNOWS_TYPE,
                from: 'jo',
                to: 'kai',
                [entityAttributesProperty]: {},
              },
              {
                _uid: 'jo-sam',
                type: KNOWS_TYPE,
                from: 'jo',
                to: 'sam',
                [entityAttributesProperty]: {},
              },
              {
                _uid: 'maya-avery',
                type: KNOWS_TYPE,
                from: 'maya',
                to: 'avery',
                [entityAttributesProperty]: {},
              },
            ],
          },
        }),
      );
    };
    void prepare();
    return () => {
      active = false;
    };
  }, [step]);
  if (error) return <p role="alert">{error}</p>;
  if (!rawPayload)
    return <output aria-live="polite">Preparing the demonstration…</output>;
  return (
    <div className="h-screen">
      <StoryInterviewShell rawPayload={rawPayload} isDevelopment={false} />
    </div>
  );
}

const meta = {
  title: 'Examples/Perceived Family',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const NarrativeReflection: Story = {
  render: () => <PerceivedFamilyStory step={7} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Only the Narrative has presets, so this fails on any other stage.
    await canvas.findByText('Everyone on your map');
    await canvas.findByText('Maya');
    // The stage mounts at its `initial` opacity of 0 and only reaches the
    // `animate` variant on a later tick, so visibility has to be polled.
    await waitFor(async () => {
      await expect(canvas.getByText('Maya')).toBeVisible();
      await expect(canvas.getByText('Jo')).toBeVisible();
      await expect(canvas.getByText('Avery')).toBeVisible();
    });
  },
};

export const FullWalkthrough: Story = {
  render: () => <PerceivedFamilyStory step={1} />,
  play: async ({ canvasElement }) => {
    const heading = await within(canvasElement).findByText(
      'Who feels like family to you?',
    );
    await waitFor(() => expect(heading).toBeVisible());
  },
};
