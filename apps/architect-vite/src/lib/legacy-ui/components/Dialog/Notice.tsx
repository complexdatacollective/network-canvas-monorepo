import type { ReactNode } from "react";
import Dialog from "./Dialog";
import Button from "../Button";

interface NoticeProps {
	title: string;
	message?: ReactNode;
	onConfirm: () => void;
	confirmLabel?: string;
	show?: boolean;
}

/*
 * Designed to present notices to the user.
 */
const Notice = ({ title, message = null, onConfirm, confirmLabel = "OK", show = false }: NoticeProps) => (
	<Dialog
		type="notice"
		icon="info"
		show={show}
		title={title}
		message={message}
		onBlur={onConfirm}
		options={[<Button key="confirm" onClick={onConfirm} color="primary" content={confirmLabel} />]}
	/>
);

export { Notice };

export default Notice;
