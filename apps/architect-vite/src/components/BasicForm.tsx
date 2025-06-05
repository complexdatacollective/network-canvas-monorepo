import React, { useCallback } from "react";
import { connect } from "react-redux";
import { reduxForm, submit } from "redux-form";
import { compose } from "@reduxjs/toolkit";

type BasicFormProps = {
	children: React.ReactNode;
	form: string;
	submit: (form: string) => void;
};

const BasicForm = ({ children, form, submit: submitForm }: BasicFormProps) => {
	// Custom submit handler to prevent propagation to any parent redux-form forms.
	const onSubmit = useCallback(
		(e: React.FormEvent) => {
			e.preventDefault();
			e.stopPropagation();
			submitForm(form);
		},
		[form, submitForm],
	);

	return <form onSubmit={onSubmit}>{children}</form>;
};

export default compose(reduxForm(), connect(null, { submit }))(BasicForm);