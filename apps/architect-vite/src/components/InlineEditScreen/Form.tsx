import { reduxForm } from "redux-form";
import stopPropagationFromHandler from "~/utils/stopPropagationFromHandler";

const formOptions = {
	touchOnBlur: false,
	touchOnChange: true,
};

type FormProps = {
	handleSubmit: (event?: React.FormEvent) => void;
	children?: React.ReactNode;
};

/**
 * This is for redux-form
 * Would like to wrap this component up into InlineEditScreen if possible
 */
const Form = ({ handleSubmit, children = null }: FormProps) => (
	<form onSubmit={stopPropagationFromHandler(handleSubmit)}>{children}</form>
);


export default reduxForm(formOptions)(Form);
