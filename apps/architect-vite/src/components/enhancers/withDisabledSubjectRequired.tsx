import { withProps } from "react-recompose";

type PropsWithSubject = {
	interfaceType?: string;
	type?: string;
};

type InjectedProps = { disabled: boolean; disabledMessage?: string };

const withDisabledSubjectRequired = withProps<InjectedProps, PropsWithSubject>(({ interfaceType, type }) => {
	if (interfaceType === "EgoForm") {
		return { disabled: false };
	}

	const entityLabel = interfaceType === "AlterEdgeForm" ? "an edge" : "a node";

	return {
		disabled: !type,
		disabledMessage: `Select ${entityLabel} type above to configure this section.`,
	};
});

export default withDisabledSubjectRequired;
