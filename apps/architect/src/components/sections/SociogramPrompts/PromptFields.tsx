import type { ComponentProps } from 'react';

import PromptText from '~/components/sections/PromptText';

import DisplayEdgesSection from './PromptFieldsEdges';
import FieldsLayout from './PromptFieldsLayout';
import TapBehaviourSection from './PromptFieldsTapBehaviour';

type PromptFieldsProps = ComponentProps<typeof FieldsLayout> &
  ComponentProps<typeof TapBehaviourSection> & {
    /** The edited row's committed prompt text, seeding the field. */
    text?: string;
  };

// TODO no prop spreading
const PromptFields = (props: PromptFieldsProps) => (
  <div>
    <PromptText initialValue={props.text} />
    <FieldsLayout {...props} />
    <TapBehaviourSection {...props} />
    <DisplayEdgesSection {...props} />
  </div>
);

export default PromptFields;
