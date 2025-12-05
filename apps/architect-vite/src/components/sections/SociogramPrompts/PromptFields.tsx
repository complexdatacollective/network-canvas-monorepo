import type { ComponentProps } from "react";
import { compose } from "recompose";
import PromptText from "~/components/sections/PromptText";
import DisplayEdgesSection from "./PromptFieldsEdges";
import FieldsLayout from "./PromptFieldsLayout";
import TapBehaviourSection from "./PromptFieldsTapBehaviour";
import withCanCreateEdgesState from "./withCanCreateEdgesState";

type PromptFieldsProps = ComponentProps<typeof FieldsLayout> & ComponentProps<typeof TapBehaviourSection>;

// TODO no prop spreading
const PromptFields = (props: PromptFieldsProps) => (
	<div>
		<PromptText />
		<FieldsLayout {...props} />
		<TapBehaviourSection {...props} />
		<DisplayEdgesSection {...props} />
	</div>
);

export default compose<ComponentProps<typeof PromptFields>, typeof PromptFields>(withCanCreateEdgesState)(PromptFields);
