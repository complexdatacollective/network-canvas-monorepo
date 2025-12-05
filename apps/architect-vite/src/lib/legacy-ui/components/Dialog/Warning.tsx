import type { ReactNode } from "react";
import Button from "../Button";
import Dialog from "./Dialog";

type WarningProps = {
	title: string;
	message?: ReactNode;
	canCancel?: boolean;
	onConfirm: () => void;
	onCancel?: () => void;
	confirmLabel?: string;
	cancelLabel?: string;
	show?: boolean;
};

/*
 * Designed to present warnings to the user. Unlike some other Dialog types user
 * must explicitly click Acknowledge to close.
 */
const Warning = ({
	title,
	message,
	canCancel = true,
	onConfirm,
	onCancel,
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
			...(canCancel && onCancel
				? [<Button key="cancel" onClick={onCancel} color="navy-taupe" content={cancelLabel} />]
				: []),
			<Button key="confirm" onClick={onConfirm} color="mustard" content={confirmLabel} />,
		]}
	/>
);

export default Warning;
