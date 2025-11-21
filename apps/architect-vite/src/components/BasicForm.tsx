import { compose } from "@reduxjs/toolkit";
import type React from "react";
import { useCallback } from "react";
import { connect } from "react-redux";
import { reduxForm, submit } from "redux-form";

type BasicFormProps = {
	children: React.ReactNode;
	form: string;
	submit: (form: string) => void;
	onSubmit?: () => void;
};

const BasicForm = ({ children, form, submit: submitForm, onSubmit: onSubmitProp }: BasicFormProps) => {
	// Custom submit handler to prevent propagation to any parent redux-form forms.
	const onSubmit = useCallback(
		(e: React.FormEvent) => {
			e.preventDefault();
			e.stopPropagation();
			submitForm(form);
			if (onSubmitProp) {
				onSubmitProp();
			}
		},
		[form, submitForm, onSubmitProp],
	);

	return <form onSubmit={onSubmit}>{children}</form>;
};

export default compose(reduxForm({}), connect(null, { submit }))(BasicForm) as React.ComponentType<
	Omit<BasicFormProps, "submit"> & { form: string; onSubmit?: () => void }
>;
