import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { expect, waitFor, within } from 'storybook/test';
import SuperJSON from 'superjson';

import type { CaptureParameters } from '../../storybook-support/CaptureStory';
import StoryInterviewShell from '../../storybook-support/StoryInterviewShell';
import { buildInterview, type Family } from './FamilyPedigree.stories';

/**
 * A three-generation family as a participant would draw it: both sets of
 * grandparents, the participant's parents with an uncle and an aunt, and the
 * participant with a brother.
 */
const threeGenerations: Family = {
  people: [
    { id: 'ego', name: 'Sarah', gender: 'woman', sex: 'female', ego: true },
    { id: 'brother', name: 'Michael', gender: 'man', sex: 'male' },
    { id: 'mother', name: 'Linda', gender: 'woman', sex: 'female' },
    { id: 'father', name: 'Robert', gender: 'man', sex: 'male' },
    { id: 'aunt', name: 'Susan', gender: 'woman', sex: 'female' },
    { id: 'uncle', name: 'Paul', gender: 'man', sex: 'male' },
    {
      id: 'maternalGrandmother',
      name: 'Margaret',
      gender: 'woman',
      sex: 'female',
    },
    { id: 'maternalGrandfather', name: 'Harold', gender: 'man', sex: 'male' },
    { id: 'paternalGrandmother', name: 'Ruth', gender: 'woman', sex: 'female' },
    { id: 'paternalGrandfather', name: 'George', gender: 'man', sex: 'male' },
  ],
  links: [
    { from: 'maternalGrandmother', to: 'maternalGrandfather', kind: 'partner' },
    {
      from: 'maternalGrandmother',
      to: 'mother',
      kind: 'biological',
      carrier: true,
    },
    { from: 'maternalGrandfather', to: 'mother', kind: 'biological' },
    {
      from: 'maternalGrandmother',
      to: 'aunt',
      kind: 'biological',
      carrier: true,
    },
    { from: 'maternalGrandfather', to: 'aunt', kind: 'biological' },
    { from: 'paternalGrandmother', to: 'paternalGrandfather', kind: 'partner' },
    {
      from: 'paternalGrandmother',
      to: 'father',
      kind: 'biological',
      carrier: true,
    },
    { from: 'paternalGrandfather', to: 'father', kind: 'biological' },
    {
      from: 'paternalGrandmother',
      to: 'uncle',
      kind: 'biological',
      carrier: true,
    },
    { from: 'paternalGrandfather', to: 'uncle', kind: 'biological' },
    { from: 'mother', to: 'father', kind: 'partner' },
    { from: 'mother', to: 'ego', kind: 'biological', carrier: true },
    { from: 'father', to: 'ego', kind: 'biological' },
    { from: 'mother', to: 'brother', kind: 'biological', carrier: true },
    { from: 'father', to: 'brother', kind: 'biological' },
  ],
};

/**
 * Screenshot-capture story for the FamilyPedigree interface. Consumed by the
 * @codaco/interface-images generation pipeline.
 *
 * The stage opens on the seeded three-generation family, drawn on the canvas
 * with everyone's names and the participant as "You". A family that is
 * already drawn opens with no add menu and the side panel closed, so the
 * canvas itself is pictured. Rendered like CaptureStory — a full-viewport
 * Shell with the navigation rail hidden — but from the interface stories'
 * own interview builder, which seeds the family through the stage's
 * attributes.
 */
const CapturePedigree = () => {
  const rawPayload = useMemo(
    () => SuperJSON.stringify(buildInterview({ family: threeGenerations })),
    [],
  );

  return (
    <div className="flex h-dvh w-full">
      <StoryInterviewShell
        rawPayload={rawPayload}
        hideNavigation
        isDevelopment={false}
      />
    </div>
  );
};

const meta: Meta = {
  title: 'Capture/FamilyPedigree',
  tags: ['capture'],
  parameters: {
    layout: 'fullscreen',
    capture: { interface: 'FamilyPedigree' } satisfies CaptureParameters,
  },
};

export default meta;

export const Capture: StoryObj = {
  render: () => <CapturePedigree />,
  // The capture runner screenshots once the play function has finished, so
  // it waits here for the whole family to be drawn.
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(canvas.getAllByTestId('pedigree-person')).toHaveLength(
        threeGenerations.people.length,
      ),
    );
    await expect(
      await canvas.findByRole('button', { name: /^You/ }),
    ).toBeVisible();
    await expect(
      canvasElement.ownerDocument.querySelector(
        '[data-testid="pedigree-person-panel"]',
      ),
    ).toBeNull();
  },
};
