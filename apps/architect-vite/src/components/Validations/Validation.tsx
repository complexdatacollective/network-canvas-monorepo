import { map } from "lodash";
import { Icon } from "~/lib/legacy-ui/components";
import Number from "~/lib/legacy-ui/components/Fields/Number";
import NativeSelect from "../Form/Fields/NativeSelect";
import { isValidationWithListValue, isValidationWithNumberValue } from "./options";

type ValidationOption = {
	label: string;
	value: string;
};

type ExistingVariable = {
	name: string;
};

type ValidationProps = {
	onDelete: (itemKey: string) => void;
	onUpdate: (key: string, value: boolean | number | string | null, itemKey: string) => void;
	options?: ValidationOption[];
	itemKey?: string | null;
	itemValue?: boolean | number | string | null;
	existingVariables: Record<string, ExistingVariable>;
};

const Validation = ({
	onDelete,
	onUpdate,
	options = [],
	itemKey = null,
	itemValue = null,
	existingVariables,
}: ValidationProps) => {
	const handleKeyChange = (option: string) => onUpdate(option, itemValue, itemKey || "");

	const handleValueChange = (newValue: boolean | number | string | null) =>
		onUpdate(itemKey || "", newValue, itemKey || "");

	const keyInputProps = {
		value: itemKey,
		onChange: handleKeyChange,
	};

	const valueInputProps = {
		value: itemValue || "",
		onChange: handleValueChange,
	};

	const existingVariableOptions = map(existingVariables, (variableValue, variableKey) => ({
		label: variableValue.name,
		value: variableKey,
	}));
	return (
		<div className="form-fields-multi-select__rule">
			<div className="form-fields-multi-select__rule-options">
				<div className="form-fields-multi-select__rule-option">
					<NativeSelect
						options={options}
						input={keyInputProps}
						validation={{ required: true }}
						placeholder="Select validation rule"
					/>
				</div>
				{isValidationWithNumberValue(itemKey) && (
					<div className="form-fields-multi-select__rule-option">
						<Number input={valueInputProps} validation={{ required: true }} />
					</div>
				)}
				{isValidationWithListValue(itemKey) && (
					<div className="form-fields-multi-select__rule-option">
						<NativeSelect
							options={existingVariableOptions}
							input={valueInputProps}
							validation={{ required: true }}
							placeholder="Select comparison variable"
						/>
					</div>
				)}
			</div>
			<div className="form-fields-multi-select__rule-control">
				<div className="form-fields-multi-select__delete" onClick={() => onDelete(itemKey || "")}>
					<Icon name="delete" />
				</div>
			</div>
		</div>
	);
};

export default Validation;
