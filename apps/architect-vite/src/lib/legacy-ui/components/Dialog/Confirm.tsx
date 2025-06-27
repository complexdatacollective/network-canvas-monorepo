import type { ReactNode } from "react";
import Dialog from "./Dialog";
import Button from "../Button";

interface ConfirmProps {
	title: string;
	message?: ReactNode;
	canCancel?: boolean;
	onConfirm: () => void;
	onCancel?: () => void;
	confirmLabel?: string;
	cancelLabel?: string;
	show?: boolean;
}

/*
 * Designed to present yes/no choices to the user.
 */
const Confirm = ({
	title,
	message = null,
	canCancel = true,
	onConfirm,
	onCancel = null,
	confirmLabel = "OK",
	cancelLabel = "Cancel",
	show = false,
}: ConfirmProps) => (
	<Dialog
		type="confirm"
		icon="info"
		show={show}
		title={title}
		message={message}
		onBlur={onCancel}
		options={[
			canCancel ? <Button key="cancel" onClick={onCancel} color="navy-taupe" content={cancelLabel} /> : null,
			<Button key="confirm" onClick={onConfirm} color="sea-green" content={confirmLabel} />,
		]}
	/>
);

export { Confirm };

export default Confirm;
