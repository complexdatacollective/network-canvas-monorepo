import type { ReactNode } from "react";
import Dialog from "./Dialog";
import Button from "../Button";

interface WarningProps {
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
 * Designed to present warnings to the user. Unlike some other Dialog types user
 * must explicitly click Acknowledge to close.
 */
const Warning = ({
	title,
	message = null,
	canCancel = true,
	onConfirm,
	onCancel = null,
	confirmLabel = "OK",
	cancelLabel = "Cancel",
	show = false,
}: WarningProps) => (
	<Dialog
		type="warning"
		icon="warning"
		show={show}
		title={title}
		message={message}
		options={[
			canCancel ? <Button key="cancel" onClick={onCancel} color="navy-taupe" content={cancelLabel} /> : null,
			<Button key="confirm" onClick={onConfirm} color="mustard" content={confirmLabel} />,
		]}
	/>
);

export { Warning };

export default Warning;
