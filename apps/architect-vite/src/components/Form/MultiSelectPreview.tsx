import { useSelector } from "react-redux";
import { formValueSelector } from "redux-form";
import NativeSelect from "~/components/Form/Fields/NativeSelect";
import ValidatedField from "./ValidatedField";

type PropertyConfig = {
	fieldName: string;
	component?: React.ComponentType;
	placeholder?: string;
};

type MultiSelectPreviewProps = {
	form: string;
	fieldId: string;
	properties: Array<PropertyConfig>;
	options: (fieldName: string, rowValues: unknown, allValues: unknown) => Array<Record<string, unknown>>;
	sortable?: boolean;
};

export const MultiSelectPreview = ({ form, fieldId, properties, options }: MultiSelectPreviewProps) => {
	const rowValues = useSelector((state: unknown) => {
		const selector = formValueSelector(form);
		return selector(state, fieldId);
	});

	const fieldName = fieldId.split("[")[0];
	const allValues = useSelector((state: unknown) => {
		const selector = formValueSelector(form);
		return selector(state, fieldName);
	});

	return (
		<div className="form-fields-multi-select__rule-options">
			{properties.map(({ fieldName, component, placeholder, ...rest }) => (
				<div className="form-fields-multi-select__rule-option py-2" key={fieldName}>
					<ValidatedField
						component={component || NativeSelect}
						name={`${fieldId}.${fieldName}`}
						options={options(fieldName, rowValues, allValues)}
						validation={{ required: true }}
						placeholder={placeholder}
						{...rest}
					/>
				</div>
			))}
		</div>
	);
};

export default MultiSelectPreview;
