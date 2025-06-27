/* eslint-env jest */

import type React from "react";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { reduxForm } from "redux-form";
import { compose } from "recompose";

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
)(({ children }: { children?: React.ReactNode }) => <form>{children}</form>);

const Scaffold = ({ children = null }: ScaffoldProps) => (
	<Provider store={store}>
		<Form>{children}</Form>
	</Provider>
);

export default Scaffold;
