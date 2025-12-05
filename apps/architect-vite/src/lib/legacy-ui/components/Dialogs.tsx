import type { CSSProperties, ReactNode } from "react";
import { useCallback } from "react";
import Confirm from "./Dialog/Confirm";
import ErrorDialogComponent from "./Dialog/Error";
import Notice from "./Dialog/Notice";
import Simple from "./Dialog/Simple";
import UserErrorDialogComponent from "./Dialog/UserError";
import Warning from "./Dialog/Warning";

type BaseDialog = {
	id: string;
	title?: string;
	message?: ReactNode;
	onConfirm?: () => void;
	onCancel?: () => void;
};

type ConfirmDialog = BaseDialog & {
	type: "Confirm";
	title: string;
	canCancel?: boolean;
	confirmLabel?: string;
	cancelLabel?: string;
};

type NoticeDialog = BaseDialog & {
	type: "Notice";
	title: string;
	confirmLabel?: string;
};

type WarningDialog = BaseDialog & {
	type: "Warning";
	title: string;
	canCancel?: boolean;
	confirmLabel?: string;
	cancelLabel?: string;
};

type ErrorDialog = BaseDialog & {
	type: "Error";
	error?: Error | string | { friendlyMessage?: string };
	confirmLabel?: string;
};

type UserErrorDialog = BaseDialog & {
	type: "UserError";
	error?: Error | string | { friendlyMessage?: string };
	confirmLabel?: string;
};

type SimpleDialog = BaseDialog & {
	type: "Simple";
	title: string;
	children?: ReactNode;
	className?: string;
	style?: CSSProperties;
};

export type Dialog = ConfirmDialog | NoticeDialog | WarningDialog | ErrorDialog | UserErrorDialog | SimpleDialog;

export type { ConfirmDialog, UserErrorDialog };

/*
 * Displays a stack of Dialogs.
 *
 * <Dialogs dialogs closeDialog />
 *
 * `closeDialog` called when Dialog is cancelled or confirmed, may be used to track
 * state.
 *
 * `dialogs` prop in the format (note many of the props simple map
 * to the specific Dialog type):
 *
 * dialogs: [
 *   {
 *     id: '1234-1234-1',
 *     type: 'Confirm',
 *     title: 'Something to confirm',
 *     message: 'More detail about confirmation',
 *     onConfirm: () => {},
 *     onCancel: () => {},
 *   },
 *   {
 *     id: '1234-1234-2',
 *     type: 'Notice',
 *     title: 'Something info for the user',
 *     message: 'More detail...',
 *     onConfirm: () => {},
 *   },
 *   {
 *     id: '1234-1234-3',
 *     type: 'Warning',
 *     title: 'Something to warn the user about, maybe a non-failing error',
 *     message: 'More detail...',
 *     onConfirm: () => {},
 *   },
 *   {
 *     id: '1234-1234-4',
 *     type: 'Error',
 *     error: new Error('message and title are automatic'),
 *     onConfirm: () => {},
 *     onCancel: () => {},
 *   },
 * ]
 */

type DialogsProps = {
	dialogs?: Dialog[];
	closeDialog: (id: string) => void;
};

const Dialogs = ({ dialogs = [], closeDialog }: DialogsProps) => {
	const handleConfirm = useCallback(
		(dialog: Dialog) => {
			if (dialog.onConfirm) {
				dialog.onConfirm();
			}
			closeDialog(dialog.id);
		},
		[closeDialog],
	);

	const handleCancel = useCallback(
		(dialog: Dialog) => {
			if (dialog.onCancel) {
				dialog.onCancel();
			}
			closeDialog(dialog.id);
		},
		[closeDialog],
	);

	const renderDialog = useCallback(
		(dialog: Dialog) => {
			const onConfirm = () => handleConfirm(dialog);
			const onCancel = () => handleCancel(dialog);

			switch (dialog.type) {
				case "Confirm":
					return (
						<Confirm
							key={dialog.id}
							show
							title={dialog.title}
							message={dialog.message}
							canCancel={(dialog as ConfirmDialog).canCancel}
							confirmLabel={dialog.confirmLabel}
							cancelLabel={(dialog as ConfirmDialog).cancelLabel}
							onConfirm={onConfirm}
							onCancel={onCancel}
						/>
					);
				case "Warning":
					return (
						<Warning
							key={dialog.id}
							show
							title={dialog.title}
							message={dialog.message}
							canCancel={(dialog as WarningDialog).canCancel}
							confirmLabel={dialog.confirmLabel}
							cancelLabel={(dialog as WarningDialog).cancelLabel}
							onConfirm={onConfirm}
							onCancel={onCancel}
						/>
					);
				case "Notice":
					return (
						<Notice
							key={dialog.id}
							show
							title={(dialog as NoticeDialog).title}
							message={dialog.message}
							confirmLabel={dialog.confirmLabel}
							onConfirm={onConfirm}
						/>
					);
				case "Error":
					return (
						<ErrorDialogComponent
							key={dialog.id}
							show
							title={dialog.title}
							message={dialog.message}
							error={(dialog as ErrorDialog).error}
							confirmLabel={dialog.confirmLabel}
							onConfirm={onConfirm}
						/>
					);
				case "UserError":
					return (
						<UserErrorDialogComponent
							key={dialog.id}
							show
							title={dialog.title}
							message={dialog.message}
							error={(dialog as UserErrorDialog).error}
							confirmLabel={dialog.confirmLabel}
							onConfirm={onConfirm}
						/>
					);
				case "Simple":
					return (
						<Simple
							key={dialog.id}
							show
							title={(dialog as SimpleDialog).title}
							message={dialog.message}
							className={(dialog as SimpleDialog).className}
							style={(dialog as SimpleDialog).style}
							onBlur={onCancel}
						/>
					);
				default: {
					// TypeScript ensures this is exhaustive
					return null;
				}
			}
		},
		[handleConfirm, handleCancel],
	);

	return dialogs.map(renderDialog);
};

export { Dialogs };

export default Dialogs;
