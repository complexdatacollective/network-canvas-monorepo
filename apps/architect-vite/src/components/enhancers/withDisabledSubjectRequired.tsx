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

	return {
		disabled: !type,
		disabledMessage: "Select a node type above to configure this section.",
	};
});

export default withDisabledSubjectRequired;
