import type { ReactNode } from "react";
import Button from "../Button";
import Dialog from "./Dialog";

type ConfirmProps = {
	title: string;
	message?: ReactNode;
	canCancel?: boolean;
	onConfirm: () => void;
	onCancel?: () => void;
	confirmLabel?: string;
	cancelLabel?: string;
	show?: boolean;
	className?: string;
};

/*
 * Designed to present yes/no choices to the user.
 */
const Confirm = ({
	title,
	message,
	canCancel = true,
	onConfirm,
	onCancel,
	confirmLabel = "OK",
	cancelLabel = "Cancel",
	show = false,
	className,
}: ConfirmProps) => (
	<Dialog
		type="confirm"
		icon="info"
		show={show}
		title={title}
		message={message}
		onBlur={onCancel}
		classNames={className}
		options={[
			...(canCancel && onCancel
				? [<Button key="cancel" onClick={onCancel} color="navy-taupe" content={cancelLabel} />]
				: []),
			<Button key="confirm" onClick={onConfirm} color="sea-green" content={confirmLabel} />,
		]}
	/>
);

export default Confirm;
