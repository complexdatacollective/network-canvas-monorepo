import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { expect, waitFor, within } from 'storybook/test';
import SuperJSON from 'superjson';

import { SyntheticInterview } from '@codaco/protocol-utilities';

import StoryInterviewShell from '../../storybook-support/StoryInterviewShell';

function PedigreeStoryWrapper({
  buildFn,
}: {
  buildFn: () => SyntheticInterview;
}) {
  const interview = useMemo(() => buildFn(), [buildFn]);
  const rawPayload = useMemo(
    () =>
      SuperJSON.stringify(interview.getInterviewPayload({ currentStep: 1 })),
    [interview],
  );

  return (
    <div className="flex h-dvh w-full">
      <StoryInterviewShell rawPayload={rawPayload} />
    </div>
  );
}

const meta: Meta = {
  title: 'Interfaces/FamilyPedigree',
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj;

const buildEmpty = () => {
  const si = new SyntheticInterview(1);
  si.addInformationStage({ title: 'Welcome', text: 'Before the pedigree.' });
  const stage = si.addStage('FamilyPedigree', {
    prompt:
      'Add the members of your family. Select a person to add their relatives.',
  });
  stage.addFormField({ component: 'Number', prompt: 'Age' });
  stage.addFormField({
    component: 'Boolean',
    prompt: 'Is this person still living?',
    validation: { required: true },
  });
  si.addInformationStage({ title: 'Complete', text: 'After the pedigree.' });
  return si;
};

/** The first visit: only the participant, selected, with the add menu open. */
export const FirstVisit: Story = {
  render: () => <PedigreeStoryWrapper buildFn={buildEmpty} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(canvas.getByTestId('pedigree-menu-parent')).toBeVisible(),
    );
    for (const relation of ['sibling', 'partner', 'child', 'edit']) {
      await expect(
        canvas.getByTestId(`pedigree-menu-${relation}`),
      ).toBeVisible();
    }
  },
};

const buildPartial = () => {
  const si = new SyntheticInterview(2);
  si.addInformationStage({ title: 'Welcome', text: 'Before the pedigree.' });
  const stage = si.addStage('FamilyPedigree', {
    prompt:
      'Add the members of your family. Select a person to add their relatives.',
  });
  const person = (
    uid: string,
    name: string | undefined,
    gender?: string,
    sex?: string,
    isEgo = false,
  ) =>
    si.addManualNode(stage.id, stage.personType, uid, {
      [stage.ego]: isEgo,
      ...(name ? { [stage.name]: name } : {}),
      ...(gender ? { [stage.genderIdentity]: [gender] } : {}),
      ...(sex ? { [stage.sexAssignedAtBirth]: [sex] } : {}),
    });
  const link = (from: string, to: string, kind: string, current = true) =>
    si.addManualEdge(stage.edgeType, `${from}-${to}`, from, to, {
      [stage.kind]: [kind],
      ...(kind === 'partner'
        ? { [stage.currentPartner]: current }
        : { [stage.gestationalCarrier]: false }),
    });

  person('ego', 'Sarietha', 'woman', 'female', true);
  person('julie', 'Julie', 'woman', 'female');
  person('rob', 'Rob', 'man', 'male');
  person('joshua', 'Joshua', 'man', 'male');
  person('partner', undefined, 'nonBinary');
  link('julie', 'rob', 'partner', false);
  for (const parent of ['julie', 'rob']) {
    link(parent, 'ego', 'biological');
    link(parent, 'joshua', 'biological');
  }
  link('ego', 'partner', 'partner');

  si.addInformationStage({ title: 'Complete', text: 'After the pedigree.' });
  return si;
};

/**
 * A family under way: separated parents, a brother, and a partner whose name
 * and sex assigned at birth are still missing.
 */
export const FamilyInProgress: Story = {
  render: () => <PedigreeStoryWrapper buildFn={buildPartial} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(canvas.getAllByTestId('pedigree-person')).toHaveLength(5),
    );
    await expect(
      canvas.getByRole('button', { name: /Unnamed, some details missing/ }),
    ).toBeVisible();
  },
};
