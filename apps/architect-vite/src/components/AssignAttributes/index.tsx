import type { ComponentType } from "react";
import type { WrappedFieldArrayProps } from "redux-form";
import { FieldArray } from "redux-form";
import AssignAttributes from "./AssignAttributes";

type AssignAttributesContainerProps = {
	form: string;
	entity: "node" | "edge" | "ego";
	type?: string;
	name: string;
};

const AssignAttributesContainer = (props: AssignAttributesContainerProps) => (
	<FieldArray
		component={AssignAttributes as ComponentType<WrappedFieldArrayProps<unknown>>}
		// eslint-disable-next-line react/jsx-props-no-spreading
		{...props}
	/>
);

export default AssignAttributesContainer;
