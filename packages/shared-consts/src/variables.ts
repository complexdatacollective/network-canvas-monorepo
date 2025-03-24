import { z } from "zod";

// Constants for repeated values
export const VariableNameSchema = z.string().regex(/^[a-zA-Z0-9._:-]+$/); // TODO: think about using branding here

export type InputControlDefinition = {
	label: string;
	description: string;
	image?: string;
};

export const textInput = {
	label: "Text Input",
	description: "This is a standard text input, allowing for simple data entry up to approximately 30 characters.",
};

export const textArea = {
	label: "Text Area",
	description: "This is an extra large text input, allowing for simple data entry for more than 30 characters.",
};

export const numberInput = {
	label: "Number Input",
	description: "This input is optimized for collecting numerical data, and will show a number pad if available.",
};

export const checkboxGroup = {
	label: "Checkbox Group",
	description: "This component provides a group of checkboxes so that multiple values can be toggled on or off.",
};

export const toggle = {
	label: "Toggle",
	description:
		'This component renders a switch, which can be tapped or clicked to indicate "on" or "off". By default it is in the "off" position. If you require a boolean input without a default, use the BooleanChoice component',
};

export const radioGroup = {
	label: "Radio Group",
	description: "This component renders a group of options and allow the user to choose one.",
};

export const toggleButtonGroup = {
	label: "Toggle Button Group",
	description:
		'This component provides a colorful button that can be toggled "on" or "off". It is an alternative to the Checkbox Group, and allows multiple selection by default.',
};

export const likertScale = {
	label: "LikertScale",
	description:
		"A component providing a likert-type scale in the form of a slider. Values are derived from the option properties of this variable, with labels for each option label.",
};

export const visualAnalogScale = {
	label: "VisualAnalogScale",
	description:
		"A Visual Analog Scale (VAS) component, which sets a normalized value between 0 and 1 representing the position of the slider between each end of the scale.",
};

export const datePicker = {
	label: "DatePicker",
	description: "A calendar date picker that allows a respondent to quickly enter year, month, and day data.",
};

export const relativeDatePicker = {
	label: "RelativeDatePicker",
	description:
		'A calendar date picker that automatically limits available dates relative to an "anchor date", which can be configured to the date of the interview session. ',
};

export const booleanChoice = {
	label: "BooleanChoice",
	description:
		'A component for boolean variables that requires the participant to actively select an option. Unlike the toggle component, this component accepts the "required" validation.',
};

export const inputControls = {
	textInput,
	textArea,
	numberInput,
	checkboxGroup,
	toggle,
	radioGroup,
	toggleButtonGroup,
	likertScale,
	visualAnalogScale,
	datePicker,
	relativeDatePicker,
	booleanChoice,
};
