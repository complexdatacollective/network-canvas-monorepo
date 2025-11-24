import { map } from "lodash";
import { Trash2 } from "lucide-react";
import { motion } from "motion/react";
import NumberField from "~/components/Form/Fields/Number";
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
	itemKey: string;
	itemValue?: boolean | number | string | null;
	existingVariables: Record<string, ExistingVariable>;
};

const Validation = ({
	onDelete,
	onUpdate,
	options = [],
	itemKey,
	itemValue = null,
	existingVariables,
}: ValidationProps) => {
	const handleKeyChange = (option: string | null) => {
		onUpdate(option || "", itemValue, itemKey || "");
	};

	const handleNumberValueChange = (newValue: number | null) => {
		onUpdate(itemKey || "", newValue, itemKey || "");
	};

	const handleListValueChange = (newValue: string | null) => {
		onUpdate(itemKey || "", newValue, itemKey || "");
	};

	const keyInputProps = {
		name: "validation-key",
		value: itemKey ?? null,
		onChange: handleKeyChange,
	};

	const numberValueInputProps = {
		name: "validation-value",
		value: typeof itemValue === "number" ? itemValue : null,
		onChange: handleNumberValueChange,
	};

	const listValueInputProps = {
		name: "validation-value",
		value: typeof itemValue === "string" ? itemValue : null,
		onChange: handleListValueChange,
	};

	const existingVariableOptions = map(existingVariables, (variableValue, variableKey) => ({
		label: variableValue.name,
		value: variableKey,
	}));
	const handleDeleteKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			onDelete(itemKey || "");
		}
	};

	return (
		<div className="form-fields-multi-select__rule group">
			<div className="form-fields-multi-select__rule-options">
				<div className="form-fields-multi-select__rule-option">
					<NativeSelect
						options={options}
						input={keyInputProps}
						validation={{ required: true }}
						placeholder="Select validation rule"
					/>
				</div>
				{itemKey && isValidationWithNumberValue(itemKey) && (
					<div className="form-fields-multi-select__rule-option">
						<NumberField input={numberValueInputProps} validation={{ required: true }} />
					</div>
				)}
				{itemKey && isValidationWithListValue(itemKey) && (
					<div className="form-fields-multi-select__rule-option">
						<NativeSelect
							options={existingVariableOptions}
							input={listValueInputProps}
							validation={{ required: true }}
							placeholder="Select comparison variable"
						/>
					</div>
				)}
			</div>
			<div className="form-fields-multi-select__rule-control">
				<motion.div
					layout
					className="opacity-0 transition-all duration-200 cursor-pointer group-hover:opacity-100 hover:bg-tomato rounded-full p-2 grow-0 shrink-0 h-10 aspect-square"
					onClick={() => onDelete(itemKey || "")}
					onKeyDown={handleDeleteKeyDown}
					role="button"
					tabIndex={0}
					aria-label="Delete validation rule"
				>
					<Trash2 />
				</motion.div>
			</div>
		</div>
	);
};

export default Validation;
