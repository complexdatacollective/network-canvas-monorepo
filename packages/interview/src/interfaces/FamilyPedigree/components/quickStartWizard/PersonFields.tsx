"use client";

import Field from "@codaco/fresco-ui/form/Field/Field";
import type { FieldValue } from "@codaco/fresco-ui/form/Field/types";
import FieldNamespace from "@codaco/fresco-ui/form/FieldNamespace";
import InputField from "@codaco/fresco-ui/form/fields/InputField";
import useProtocolForm from "../../../../forms/useProtocolForm";
import { useStageSelector } from "../../../../hooks/useStageSelector";
import { getNodeForm, getNodeType } from "../../utils/nodeUtils";

type PersonFieldsProps = {
	namespace?: string;
	initial?: {
		name?: string;
		/** Initial values for custom protocol form fields, keyed by variable ID. */
		attributes?: Record<string, unknown>;
	};
	namePlaceholder?: string;
};

export default function PersonFields({ namespace, initial, namePlaceholder = "Enter name" }: PersonFieldsProps) {
	const nodeType = useStageSelector(getNodeType);
	const nodeForm = useStageSelector(getNodeForm);

	const { fieldComponents } = useProtocolForm({
		subject: {
			entity: "node",
			type: nodeType,
		},
		fields: nodeForm ?? [],
		initialValues: initial?.attributes as Record<string, FieldValue> | undefined,
	});

	const content = (
		<>
			<Field
				name="name"
				label="Name"
				component={InputField}
				placeholder={namePlaceholder}
				hint="Leave blank if the name is not known"
				initialValue={initial?.name ?? ""}
			/>
			{fieldComponents}
		</>
	);

	if (namespace) {
		return <FieldNamespace prefix={namespace}>{content}</FieldNamespace>;
	}

	return content;
}
