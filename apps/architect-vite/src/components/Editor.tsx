import { merge } from "es-toolkit/compat";
import React, { createContext, useContext, useState } from "react";
import { type ConfigProps, Form, type InjectedFormProps, reduxForm } from "redux-form";
import Issues from "./Issues";

type EditorOwnProps = Partial<ConfigProps<Record<string, unknown>, EditorOwnProps>> & {
	form: string; // Make this required, so that consumers must specify a form name.
	children?: React.ReactNode;
};

type EditorProps = EditorOwnProps &
	InjectedFormProps<Record<string, unknown>, EditorOwnProps> & {
		values?: Record<string, unknown>;
	};

// Form context type
type FormContextType = {
	form: string;
	submitting?: boolean;
	submitFailed?: boolean;
	pristine?: boolean;
	valid?: boolean;
	initialValues?: Record<string, unknown>;
	values: Record<string, unknown>;
	error?: string;
	warning?: string;
};

// Create the form context
const FormContext = createContext<FormContextType | undefined>(undefined);

// Custom hook to access form context
export const useFormContext = () => {
	const context = useContext(FormContext);
	if (context === undefined) {
		throw new Error("useFormContext must be used within an Editor component");
	}
	return context;
};

/**
 * A thin wrapper over redux form's Form component that handles displaying issues
 * when the form is submitted and there are validation errors.
 *
 */
const Editor = (props: EditorProps) => {
	const {
		handleSubmit,
		submitFailed,
		submitting,
		pristine,
		valid,
		initialValues,
		error,
		warning,
		form,
		children,
		values,
	} = props;
	const [isIssuesVisible, setIsIssuesVisible] = useState(false);

	const hideIssues = () => {
		setIsIssuesVisible(false);
	};

	// Show issues when submit fails
	React.useEffect(() => {
		if (submitFailed) {
			setIsIssuesVisible(true);
		}
	}, [submitFailed]);

	// Create context value with useful form information
	const contextValue: FormContextType = {
		form,
		submitting,
		submitFailed,
		pristine,
		valid,
		initialValues,
		values: merge(values || {}, initialValues || {}),
		error,
		warning,
	};

	return (
		<FormContext.Provider value={contextValue}>
			<Form onSubmit={handleSubmit} className="flex-1 h-full w-full">
				{children}
			</Form>
			<Issues show={isIssuesVisible} hideIssues={hideIssues} />
		</FormContext.Provider>
	);
};

export default reduxForm<Record<string, unknown>, EditorOwnProps>({
	touchOnBlur: false,
	touchOnChange: true,
	enableReinitialize: true,
})(Editor);
