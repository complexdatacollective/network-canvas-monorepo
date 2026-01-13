/* eslint-env jest */

import PropTypes from "prop-types";
import React from "react";
import { Provider } from "react-redux";
import { compose } from "recompose";
import { createStore } from "redux";
import { reduxForm } from "redux-form";

const store = createStore(() => ({}));

const Form = compose(
	reduxForm({
		form: "foo",
	}),
)(({ children }) => <form>{children}</form>);

const Scaffold = ({ children }) => (
	<Provider store={store}>
		<Form>{children}</Form>
	</Provider>
);

Scaffold.propTypes = {
	children: PropTypes.node,
};

Scaffold.defaultProps = {
	children: null,
};

export default Scaffold;
