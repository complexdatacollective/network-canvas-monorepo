import { compose } from "@reduxjs/toolkit";
import type React from "react";
import { useCallback } from "react";
import { connect } from "react-redux";
import { type InjectedFormProps, reduxForm, submit } from "redux-form";

type BasicFormProps = {
	children: React.ReactNode;
	form: string;
	submit: (form: string) => void;
	onSubmit?: (values: Record<string, unknown>) => void;
};

type InjectedProps = InjectedFormProps<Record<string, unknown>, BasicFormProps>;

const BasicForm = ({
	children,
	form,
	submit: submitForm,
	onSubmit: onSubmitProp,
	handleSubmit,
}: BasicFormProps & InjectedProps) => {
	// Custom submit handler to prevent propagation to any parent redux-form forms.
	const onSubmit = useCallback(
		(e: React.FormEvent) => {
			e.preventDefault();
			e.stopPropagation();
			submitForm(form);
		},
		[form, submitForm],
	);

	// If an onSubmit handler is provided, use handleSubmit from reduxForm to get form values
	if (onSubmitProp) {
		return (
			<form
				onSubmit={(e) => {
					e.preventDefault();
					e.stopPropagation();
					handleSubmit(onSubmitProp)(e);
				}}
			>
				{children}
			</form>
		);
	}

	return <form onSubmit={onSubmit}>{children}</form>;
};

export default compose(reduxForm({}), connect(null, { submit }))(BasicForm) as React.ComponentType<
	Omit<BasicFormProps, "submit"> & { form: string; onSubmit?: (values: Record<string, unknown>) => void }
>;
