import type { Meta, StoryObj } from '@storybook/react-vite';

import { SyntheticInterview } from '@codaco/protocol-utilities';
import CaptureStory, {
  type CaptureParameters,
} from '~/.storybook/CaptureStory';

/**
 * Screenshot-capture story for the FamilyPedigree interface. Consumed by the
 * @codaco/interface-images generation pipeline; tune the synthetic data here
 * to change the published screenshots.
 */
const build = () => {
  const si = new SyntheticInterview(1);

  const nodeType = si.addNodeType({
    name: 'Person',
    shape: { default: 'diamond' },
  });
  const nameVar = nodeType.addVariable({
    name: 'Name',
    type: 'text',
    component: 'Text',
  });
  const genderVar = nodeType.addVariable({
    id: 'gender_identity',
    name: 'Current Gender Identity',
    type: 'categorical',
    options: [
      { label: 'Man/boy', value: 'man' },
      { label: 'Woman/girl', value: 'woman' },
      { label: 'Non-binary', value: 'non_binary' },
      { label: 'Genderqueer/Gender non-conforming', value: 'genderqueer' },
      { label: 'Two-Spirit', value: 'two_spirit' },
      { label: 'Other', value: 'other' },
      { label: 'Prefer not to say', value: 'prefer_not_to_say' },
      { label: "Don't know", value: 'dont_know' },
    ],
    component: 'RadioGroup',
    validation: { required: true },
  });
  nodeType.setShape({
    default: 'diamond',
    dynamic: {
      variable: genderVar.id,
      type: 'discrete',
      map: [
        { value: 'man', shape: 'square' },
        { value: 'woman', shape: 'circle' },
        { value: 'non_binary', shape: 'diamond' },
        { value: 'genderqueer', shape: 'diamond' },
        { value: 'two_spirit', shape: 'diamond' },
        { value: 'other', shape: 'diamond' },
        { value: 'prefer_not_to_say', shape: 'diamond' },
      ],
    },
  });
  const diseaseVar = nodeType.addVariable({
    name: 'Has Disease',
    type: 'boolean',
  });
  const isEgoVar = nodeType.addVariable({ name: 'Is Ego', type: 'boolean' });
  const relationshipToEgoVar = nodeType.addVariable({
    name: 'Relationship to Ego',
    type: 'text',
  });

  const edgeType = si.addEdgeType({ name: 'Family' });
  const relationshipVar = edgeType.addVariable({
    name: 'Relationship',
    type: 'categorical',
    options: [
      { label: 'Parent', value: 'parent' },
      { label: 'Child', value: 'child' },
      { label: 'Sibling', value: 'sibling' },
      { label: 'Partner', value: 'partner' },
    ],
  });
  const isActiveVar = edgeType.addVariable({
    name: 'Is Active',
    type: 'boolean',
  });
  const isGestCarrierVar = edgeType.addVariable({
    name: 'Is Gestational Carrier',
    type: 'boolean',
  });

  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  si.addStage('FamilyPedigree', {
    label: 'Family Pedigree',
    subject: { entity: 'node', type: nodeType.id },
    nodeConfig: {
      type: nodeType.id,
      nodeLabelVariable: nameVar.id,
      egoVariable: isEgoVar.id,
      relationshipVariable: relationshipToEgoVar.id,
      form: [
        {
          variable: genderVar.id,
          prompt: 'How does this person identify their gender?',
        },
      ],
    },
    edgeConfig: {
      type: edgeType.id,
      relationshipTypeVariable: relationshipVar.id,
      isActiveVariable: isActiveVar.id,
      isGestationalCarrierVariable: isGestCarrierVar.id,
    },
    censusPrompt:
      'Please create your family pedigree by adding family members.',
    nominationPrompts: [
      {
        id: '1',
        text: 'Please nominate any family members who have been diagnosed with type 2 diabetes.',
        variable: diseaseVar.id,
      },
    ],
  });
  si.addInformationStage({ title: 'Complete', text: 'After the main stage.' });
  return si;
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
  render: () => <CaptureStory build={build} />,
};
