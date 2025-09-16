import { get, has } from "es-toolkit/compat";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Button } from "~/lib/legacy-ui/components";
import SpotlightModal from "./SpotlightModal";
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
		value?: string;
		onChange?: (value: string) => void;
	};
	onCreateOption?: (value: string) => void;
};

const VariablePicker = ({
	options = [],
	entity = null,
	type = null,
	label = "Create or Select a Variable",
	onCreateOption = () => {},
	disallowCreation = false,
	meta = { error: null, invalid: false, touched: false },
	input = { value: null, onChange: () => {} },
}: VariablePickerProps) => {
	const [showPicker, setShowPicker] = useState(false);

	const { error, invalid, touched } = meta;
	const { value, onChange } = input;

	const handleSelectVariable = (variable) => {
		onChange(variable);
		setShowPicker(false);
	};

	const handleCreateOption = (variable) => {
		onChange(null);
		setShowPicker(false);
		onCreateOption(variable);
	};

	const hideModal = () => setShowPicker(false);

	// New variables have no 'type' property
	const variablePillComponent = () => {
		const found = options.find(
			({ label: variableLabel, value: variableValue }) => value === variableValue || value === variableLabel,
		);

		if (has(found, "type")) {
			return <EditableVariablePill uuid={found.value} />;
		}

		const selectedLabel = get(found, "label", null);
		const selectedValue = get(found, "value", null);

		const finalLabel = selectedLabel || selectedValue;

		return <SimpleVariablePill label={finalLabel} />;
	};

	return (
		<>
			<div className="">
				{value && (
					<div className="mb-[var(--space-md)]">
						<AnimatePresence exitBeforeEnter initial={false}>
							<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} key={value}>
								{variablePillComponent()}
							</motion.div>
						</AnimatePresence>
					</div>
				)}
				<Button icon="add" onClick={() => setShowPicker(true)}>
					{value ? "Change Variable" : "Select Variable"}
				</Button>
				{invalid && touched && <p className="form-fields-variable-picker__error">{error}</p>}
			</div>
			<SpotlightModal show={showPicker} onBlur={hideModal}>
				<VariableSpotlight
					entity={entity}
					type={type}
					onSelect={handleSelectVariable}
					onCancel={hideModal}
					options={options}
					onCreateOption={handleCreateOption}
					disallowCreation={disallowCreation}
				/>
			</SpotlightModal>
		</>
	);
};

export default VariablePicker;
