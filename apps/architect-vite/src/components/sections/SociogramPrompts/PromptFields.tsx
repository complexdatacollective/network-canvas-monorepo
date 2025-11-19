import { compose } from "recompose";
import PromptText from "~/components/sections/PromptText";
import DisplayEdgesSection from "./PromptFieldsEdges";
import FieldsLayout from "./PromptFieldsLayout";
import TapBehaviourSection from "./PromptFieldsTapBehaviour";
import withCanCreateEdgesState from "./withCanCreateEdgesState";

// TODO no prop spreading
const PromptFields = (props: Record<string, unknown>) => (
	<div>
		<PromptText />
		<FieldsLayout {...props} />
		<TapBehaviourSection {...props} />
		<DisplayEdgesSection {...props} />
	</div>
);

export default compose(withCanCreateEdgesState)(PromptFields as React.ComponentType<unknown>);
