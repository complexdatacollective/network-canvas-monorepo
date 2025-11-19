import { reduxForm } from "redux-form";
import stopPropagationFromHandler from "~/utils/stopPropagationFromHandler";

type FormProps = {
	handleSubmit: (event?: React.FormEvent) => void;
	children?: React.ReactNode;
	id?: string;
};

/**
 * This is for redux-form
 * Would like to wrap this component up into InlineEditScreen if possible
 */
const Form = ({ handleSubmit, children = null, id }: FormProps) => (
	<form id={id} onSubmit={stopPropagationFromHandler(handleSubmit)}>
		{children}
	</form>
);

// The reduxForm HOC will automatically handle initialValues when passed as props
export default reduxForm({
	touchOnBlur: false,
	touchOnChange: true,
	enableReinitialize: false,
})(Form);
