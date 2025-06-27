import cx from "classnames";
import Icon from "~/lib/legacy-ui/components/Icon";

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
