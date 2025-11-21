import type { VariableType } from "@codaco/protocol-validation";
import { get, has } from "es-toolkit/compat";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Button } from "~/lib/legacy-ui/components";
import EditableVariablePill, { SimpleVariablePill } from "./VariablePill";
import VariableSpotlight from "./VariableSpotlight";

type VariablePickerProps = {
	disallowCreation?: boolean;
	entity?: string;
	type?: string;
	label?: string;
	options?: Array<{
		label: string;
		value: string;
		type?: string;
	}>;
	meta?: {
		error?: string;
		invalid?: boolean;
		touched?: boolean;
	};
	input?: {
		value?: string | undefined;
		onChange?: (value: string) => void;
	};
	onCreateOption?: (value: string) => void;
};

const VariablePicker = ({
	options = [],
	entity,
	type,
	label = "Create or Select a Variable",
	onCreateOption = () => {},
	disallowCreation = false,
	meta = {},
	input = {},
}: VariablePickerProps) => {
	const [showPicker, setShowPicker] = useState(false);

	const { error, invalid, touched } = meta;
	const { value, onChange } = input;

	const handleSelectVariable = (variable: string) => {
		onChange?.(variable);
		setShowPicker(false);
	};

	const handleCreateOption = (variable: string) => {
		onChange?.("");
		setShowPicker(false);
		onCreateOption(variable);
	};

	const hideModal = () => setShowPicker(false);

	// New variables have no 'type' property
	const variablePillComponent = () => {
		const found = options.find(
			({ label: variableLabel, value: variableValue }) => value === variableValue || value === variableLabel,
		);

		if (has(found, "type") && found?.type) {
			return <EditableVariablePill uuid={found?.value ?? ""} />;
		}

		const selectedLabel = get(found, "label", null) as string | null;
		const selectedValue = get(found, "value", null) as string | null;

		const finalLabel = selectedLabel || selectedValue || "";
		const variableType = (get(found, "type", "text") as VariableType) || "text";

		return (
			<SimpleVariablePill label={finalLabel} type={variableType}>
				<span />
			</SimpleVariablePill>
		);
	};

	return (
		<>
			<fieldset className="form-fields-variable-picker">
				{label && <legend>{label}</legend>}

				{value && (
					<div>
						<AnimatePresence mode="wait" initial={false}>
							<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} key={value}>
								{variablePillComponent()}
							</motion.div>
						</AnimatePresence>
					</div>
				)}
				<Button icon="add" onClick={() => setShowPicker(true)} color="sea-green">
					{value ? "Change Variable" : "Select Variable"}
				</Button>
				{invalid && touched && <p className="form-fields-variable-picker__error">{error}</p>}
			</fieldset>
			<VariableSpotlight
				open={showPicker}
				onOpenChange={setShowPicker}
				entity={entity}
				type={type}
				onSelect={handleSelectVariable}
				onCancel={hideModal}
				options={options}
				onCreateOption={handleCreateOption}
				disallowCreation={disallowCreation}
			/>
		</>
	);
};

export default VariablePicker;
