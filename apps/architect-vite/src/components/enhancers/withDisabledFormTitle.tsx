import { withProps } from "recompose";

type PropsWithInterfaceType = {
	interfaceType?: string;
};

const withDisabledFormTitle = withProps<{ disableFormTitle: boolean }, PropsWithInterfaceType>(({ interfaceType }) => {
	if (interfaceType === "EgoForm" || interfaceType === "AlterForm" || interfaceType === "AlterEdgeForm") {
		return { disableFormTitle: true };
	}

	return { disableFormTitle: false };
});

export default withDisabledFormTitle;
