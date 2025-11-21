import { withProps } from "recompose";

type PropsWithSubject = {
	interfaceType?: string;
	type?: string;
};

const withDisabledSubjectRequired = withProps<{ disabled: boolean }, PropsWithSubject>(({ interfaceType, type }) => {
	if (interfaceType === "EgoForm") {
		return { disabled: false };
	}

	return { disabled: !type };
});

export default withDisabledSubjectRequired;
