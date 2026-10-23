import type { Meta, StoryObj } from '@storybook/react-vite';
import SuperJSON from 'superjson';

import StoryInterviewShell from '../../storybook-support/StoryInterviewShell';
import { buildInterview, type Family } from './FamilyPedigree.stories';

function Scratch({ family }: { family: Family }) {
  const rawPayload = SuperJSON.stringify(
    buildInterview({ family, framing: 'gendered' }),
  );
  return (
    <div className="flex h-dvh w-full">
      <StoryInterviewShell rawPayload={rawPayload} />
    </div>
  );
}

const meta: Meta<{ family: Family }> = {
  title: 'Scratch/DeadEnds',
  parameters: { layout: 'fullscreen' },
  render: (args) => <Scratch {...args} />,
};
export default meta;
type Story = StoryObj<{ family: Family }>;

const base = [
  {
    id: 'ego',
    name: 'Ari',
    gender: 'woman',
    sex: 'female' as const,
    ego: true,
  },
];

/** Rachel recorded as carrying Ari, but Jo (her co-mother) did. */
export const CarrierSwap: Story = {
  args: {
    family: {
      people: [
        ...base,
        { id: 'rachel', name: 'Rachel', gender: 'woman', sex: 'female' },
        { id: 'jo', name: 'Jo', gender: 'woman', sex: 'female' },
        { id: 'tom', name: 'Tom', gender: 'man', sex: 'male' },
      ],
      links: [
        { from: 'rachel', to: 'jo', kind: 'partner' },
        { from: 'rachel', to: 'ego', kind: 'biological', carrier: true },
        { from: 'jo', to: 'ego', kind: 'social' },
        { from: 'tom', to: 'ego', kind: 'donor' },
      ],
    },
  },
};

/** Ari's mother carried her; Tom recorded as biological father, but he is
 * her step-father. Mark is her biological father. */
export const ThirdGeneticParent: Story = {
  args: {
    family: {
      people: [
        ...base,
        { id: 'mum', name: 'Rachel', gender: 'woman', sex: 'female' },
        { id: 'tom', name: 'Tom', gender: 'man', sex: 'male' },
        { id: 'mark', name: 'Mark', gender: 'man', sex: 'male' },
      ],
      links: [
        { from: 'mum', to: 'tom', kind: 'partner' },
        { from: 'mum', to: 'ego', kind: 'biological', carrier: true },
        { from: 'tom', to: 'ego', kind: 'biological' },
        { from: 'mark', to: 'mum', kind: 'partner', current: false },
      ],
    },
  },
};

/** Sam added as Ari's partner, but Sam is her son. */
export const WrongRelationshipType: Story = {
  args: {
    family: {
      people: [
        ...base,
        { id: 'mum', name: 'Rachel', gender: 'woman', sex: 'female' },
        { id: 'dad', name: 'Tom', gender: 'man', sex: 'male' },
        { id: 'sam', name: 'Sam', gender: 'man', sex: 'male' },
      ],
      links: [
        { from: 'mum', to: 'dad', kind: 'partner' },
        { from: 'mum', to: 'ego', kind: 'biological', carrier: true },
        { from: 'dad', to: 'ego', kind: 'biological' },
        { from: 'ego', to: 'sam', kind: 'partner' },
      ],
    },
  },
};

/** Grandma June added as Rachel's mother, but she is Tom's. */
export const WrongSideGrandparent: Story = {
  args: {
    family: {
      people: [
        ...base,
        { id: 'mum', name: 'Rachel', gender: 'woman', sex: 'female' },
        { id: 'dad', name: 'Tom', gender: 'man', sex: 'male' },
        { id: 'june', name: 'June', gender: 'woman', sex: 'female' },
      ],
      links: [
        { from: 'mum', to: 'dad', kind: 'partner' },
        { from: 'mum', to: 'ego', kind: 'biological', carrier: true },
        { from: 'dad', to: 'ego', kind: 'biological' },
        { from: 'june', to: 'mum', kind: 'biological', carrier: true },
      ],
    },
  },
};

/** Ben added as a half-brother sharing only Tom, but he is Ari's twin. */
export const TwinAddedAsHalfSibling: Story = {
  args: {
    family: {
      people: [
        ...base,
        { id: 'mum', name: 'Rachel', gender: 'woman', sex: 'female' },
        { id: 'dad', name: 'Tom', gender: 'man', sex: 'male' },
        { id: 'ben', name: 'Ben', gender: 'man', sex: 'male' },
      ],
      links: [
        { from: 'mum', to: 'dad', kind: 'partner' },
        { from: 'mum', to: 'ego', kind: 'biological', carrier: true },
        { from: 'dad', to: 'ego', kind: 'biological' },
        { from: 'dad', to: 'ben', kind: 'biological' },
      ],
    },
  },
};

/** Ari and Bea are twins recorded fraternal; Bea recorded male by mistake. */
export const IdenticalTwinWrongSex: Story = {
  args: {
    family: {
      people: [
        ...base,
        { id: 'mum', name: 'Rachel', gender: 'woman', sex: 'female' },
        { id: 'dad', name: 'Tom', gender: 'man', sex: 'male' },
        { id: 'bea', name: 'Bea', gender: 'woman', sex: 'male' },
      ],
      links: [
        { from: 'mum', to: 'dad', kind: 'partner' },
        { from: 'mum', to: 'ego', kind: 'biological', carrier: true },
        { from: 'dad', to: 'ego', kind: 'biological' },
        { from: 'mum', to: 'bea', kind: 'biological', carrier: true },
        { from: 'dad', to: 'bea', kind: 'biological' },
        { from: 'ego', to: 'bea', kind: 'fraternalTwin' },
      ],
    },
  },
};
