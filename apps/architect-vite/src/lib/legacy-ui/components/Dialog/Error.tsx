import { motion } from "motion/react";
import { type ReactNode, useState } from "react";
import Button from "../Button";
import Dialog from "./Dialog";

const getErrorMessage = (error: Error | string | { friendlyMessage?: string; toString: () => string } | null) =>
	!!error &&
	(typeof error === "object" && "friendlyMessage" in error && error.friendlyMessage
		? error.friendlyMessage
		: error.toString());

const getMessage = ({
	error,
	message,
}: {
	error: Error | string | { friendlyMessage?: string } | null;
	message: React.ReactNode;
}) =>
	error ? getErrorMessage(error as Error | string | { friendlyMessage?: string; toString: () => string }) : message;

const getStack = (error: Error | string | { stack?: string } | null) =>
	!!error && typeof error === "object" && "stack" in error && error.stack;

type AdditionalInformationProps = {
	stack?: string;
};

const AdditionalInformation = ({ stack = null }: AdditionalInformationProps) => {
	const [expanded, setExpanded] = useState(false);

	const buttonText = expanded ? "Hide details \u25b2" : "Show details \u25bc";

	return (
		<div className="dialog__additional">
			<motion.div
				className="dialog__additional-box"
				initial={{ height: 0 }}
				animate={expanded ? { height: "auto" } : { height: 0 }}
			>
				<pre className="error__stack-trace">{stack}</pre>
			</motion.div>
			<Button color="platinum" onClick={() => setExpanded(!expanded)}>
				{buttonText}
			</Button>
		</div>
	);
};

type ErrorDialogProps = {
	error?: Error | string | { friendlyMessage?: string };
	message?: ReactNode;
	onConfirm: () => void;
	show?: boolean;
	confirmLabel?: string;
	title?: string;
};

/*
 * Designed to present errors to the user. Unlike some other Dialog types user must
 * explicitly click Acknowledge to close.
 */
const ErrorDialog = ({
	error = null,
	message = null,
	onConfirm,
	show = false,
	confirmLabel = "OK",
	title = "Something went wrong!",
}: ErrorDialogProps) => {
	const stack = getStack(error);

	return (
		<Dialog
			type="error"
			icon="error"
			show={show}
			title={title}
			message={getMessage({ error, message })}
			options={[<Button key="confirm" onClick={onConfirm} color="neon-coral" content={confirmLabel} />]}
		>
			{stack && <AdditionalInformation stack={stack} />}
		</Dialog>
	);
};

export default ErrorDialog;
