import React from "react";
import { compose, withStateHandlers } from "recompose";
import { Form, reduxForm } from "redux-form";
import Issues from "./Issues";

type EditorProps = {
	hideIssues: () => void;
	isIssuesVisible: boolean;
	handleSubmit: (event?: React.FormEvent) => void;
	submitFailed: boolean;
	form: string;
	title?: string;
	children?: React.ReactNode | ((props: any) => React.ReactNode);
	component?: React.ComponentType<any> | null;
};

/**
 * Editor is a scaffold for specific editor components.
 *
 * It includes:
 * - `<Issues />` component, which provides interactive form errors
 * - `<CodeView />` component, which reveals the form's working copy of the configuration
 * - A redux-form `<Form />` component, which allows us to dispatch submit from outside
 *   the editor (necessary for our button footers).
 *
 * Required props:
 * - {string} form Name to use for the form in redux-form, this must match any child form
 *   components which hard-code this values
 * - {Component} component A React component which contains any number of redux-form `<Field />`
 * - {func} onSubmit(values) The submit handler, it receives the values of the form as an argument
 *   and will likely be hooked up to redux state.
 * - It also accepts the same props as `reduxForm()`, such as `initialValues`
 *
 * @example
 * export const formName = 'MY_EDITOR';
 *
 * const MySpecificEditor = ({
 *   submitHandler,
 * }) => (
 *   <Editor
 *     form={formName}
 *     component={MyFieldsComponent}
 *     onSubmit={submitHandler}
 *   />
 * );
 *
 * const mapDispatchToProps = (dispatch) => ({
 *   onSubmit: (values) => {
 *     if (values.id) {
 *       dispatch(actions.update(values.id, values));
 *     } else {
 *       dispatch(actions.create(values));
 *     }
 *   },
 * });
 *
 * export default connect(null, mapDispatchToProps)(MySpecificEditor);
 */
const Editor = ({
	handleSubmit,
	hideIssues,
	isIssuesVisible,
	form,
	children,
	title = "",
	submitFailed,
	component: Component = null,
	...rest
}: EditorProps) => {
	console.log("Editor: rest", rest);
	return (
		<>
			<Form onSubmit={handleSubmit}>
				{typeof children === "function" &&
					children({
						form,
						submitFailed,
						...rest,
					})}
				{children && typeof children !== "function" && children}
				{!children && Component && (
					<Component
						form={form}
						submitFailed={submitFailed}
						{...rest}
					/>
				)}
			</Form>
			<Issues form={form} show={isIssuesVisible} hideIssues={hideIssues} />
		</>
	);
};

export default compose(
	withStateHandlers(
		{ isIssuesVisible: false },
		{
			hideIssues: () => () => ({ isIssuesVisible: false }),
			onSubmitFail: () => () => ({ isIssuesVisible: true }),
		},
	),
	reduxForm({
		touchOnBlur: false,
		touchOnChange: true,
		enableReinitialize: true,
	}),
)(Editor);