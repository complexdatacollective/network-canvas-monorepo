import Icon from "@codaco/legacy-ui/components/Icon";
import cx from "classnames";

type FieldErrorProps = {
	error?: string | null;
	show?: boolean;
};

const FieldError = ({ error = null, show = false }: FieldErrorProps) => {
	const errorClasses = cx("form-field-error", { "form-field-error--show": show });

	return (
		<div className={errorClasses}>
			<Icon name="warning" /> {error}
		</div>
	);
};

export default FieldError;
