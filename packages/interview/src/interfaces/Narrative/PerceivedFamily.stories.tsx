import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect, useState } from 'react';
import { expect, waitFor, within } from 'storybook/test';
import SuperJSON from 'superjson';

import { SyntheticInterview } from '@codaco/protocol-utilities';
import { CurrentProtocolSchema } from '@codaco/protocol-validation';
import prototype from '@codaco/protocols/documentation/pedigree-collaboration/queer-perceived-family/protocol.json';
import { entityAttributesProperty, type NcNode } from '@codaco/shared-consts';

import StoryInterviewShell from '../../storybook-support/StoryInterviewShell';

const people: NcNode[] = [
  {
    _uid: 'maya',
    type: 'person',
    [entityAttributesProperty]: {
      name: 'Maya',
      relationship_words: 'My aunt',
      family_categories: ['grew_up'],
      feels_family: true,
      emotional_support: true,
      practical_support: false,
      identity_affirming: true,
      closeness: 3,
      family_layout: { x: 0.4, y: 0.36 },
    },
  },
  {
    _uid: 'jo',
    type: 'person',
    [entityAttributesProperty]: {
      name: 'Jo',
      relationship_words: 'Chosen sibling',
      family_categories: ['chosen'],
      feels_family: true,
      emotional_support: true,
      practical_support: true,
      identity_affirming: true,
      closeness: 3,
      family_layout: { x: 0.61, y: 0.37 },
    },
  },
  {
    _uid: 'kai',
    type: 'person',
    [entityAttributesProperty]: {
      name: 'Kai',
      relationship_words: 'My partner',
      family_categories: ['partner', 'chosen'],
      feels_family: true,
      emotional_support: true,
      practical_support: false,
      identity_affirming: true,
      closeness: 3,
      family_layout: { x: 0.48, y: 0.62 },
    },
  },
  {
    _uid: 'avery',
    type: 'person',
    [entityAttributesProperty]: {
      name: 'Avery',
      relationship_words: 'My parent; we are figuring things out',
      family_categories: ['grew_up'],
      feels_family: true,
      emotional_support: false,
      practical_support: true,
      identity_affirming: false,
      closeness: 2,
      family_layout: { x: 0.24, y: 0.59 },
    },
  },
  {
    _uid: 'sam',
    type: 'person',
    [entityAttributesProperty]: {
      name: 'Sam',
      relationship_words: 'A friend who feels like family',
      family_categories: ['chosen', 'another'],
      feels_family: true,
      emotional_support: true,
      practical_support: false,
      identity_affirming: true,
      closeness: 2,
      family_layout: { x: 0.74, y: 0.58 },
    },
  },
];

function PerceivedFamilyStory({ step }: { step: number }) {
  const [rawPayload, setRawPayload] = useState<string>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    let active = true;
    void CurrentProtocolSchema.safeParseAsync(prototype).then((result) => {
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
                type: 'knows',
                from: 'jo',
                to: 'kai',
                [entityAttributesProperty]: {},
              },
              {
                _uid: 'jo-sam',
                type: 'knows',
                from: 'jo',
                to: 'sam',
                [entityAttributesProperty]: {},
              },
              {
                _uid: 'maya-avery',
                type: 'knows',
                from: 'maya',
                to: 'avery',
                [entityAttributesProperty]: {},
              },
            ],
          },
        }),
      );
    });
    return () => {
      active = false;
    };
  }, [step]);
  if (error) return <p role="alert">{error}</p>;
  if (!rawPayload) return <p role="status">Preparing the demonstration…</p>;
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
  render: () => <PerceivedFamilyStory step={6} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The stage animates in, so a name can be in the document before it is
    // visible; a loaded runner can reach the assertion mid-animation.
    for (const name of ['Maya', 'Jo', 'Avery']) {
      const node = await canvas.findByText(name);
      await waitFor(() => expect(node).toBeVisible());
    }
  },
};

export const FullWalkthrough: Story = {
  render: () => <PerceivedFamilyStory step={1} />,
  play: async ({ canvasElement }) => {
    const prompt = await within(canvasElement).findByText(
      'Who feels like family to you?',
    );
    // As above: the prompt is in the document before the stage is visible.
    await waitFor(() => expect(prompt).toBeVisible());
  },
};
