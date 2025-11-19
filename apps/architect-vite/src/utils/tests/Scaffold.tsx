/* eslint-env jest */

import { configureStore } from "@reduxjs/toolkit";
import type React from "react";
import { Provider } from "react-redux";
import { compose } from "recompose";
import { reduxForm } from "redux-form";

type ScaffoldProps = {
	children?: React.ReactNode;
};

const store = configureStore({
	reducer: () => ({}),
});

const Form = compose(
	reduxForm({
		form: "foo",
	}),
)((props: unknown) => {
	const { children } = props as { children?: React.ReactNode };
	return <form>{children}</form>;
});

const Scaffold = ({ children = null }: ScaffoldProps) => (
	<Provider store={store}>
		<Form>{children}</Form>
	</Provider>
);

export default Scaffold;
