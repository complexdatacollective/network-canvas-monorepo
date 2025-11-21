import { useSelector } from "react-redux";
import { useAppDispatch } from "~/ducks/hooks";
import Dialogs from "~/lib/legacy-ui/components/Dialogs";
import { closeDialog } from "../ducks/modules/dialogs";
import type { RootState } from "../ducks/modules/root";

type LegacyDialog = {
	id: string;
	type: "Confirm" | "Error" | "Notice" | "Simple" | "UserError" | "Warning";
	onConfirm?: () => void;
	onCancel?: () => void;
	[key: string]: unknown;
};

const DialogManager = () => {
	const dispatch = useAppDispatch();
	const dialogs = useSelector((state: RootState) => state.dialogs.dialogs);

	const handleCloseDialog = (id: string) => {
		dispatch(closeDialog(id));
	};

	// Convert Redux Toolkit dialogs to legacy dialog format
	const legacyDialogs: LegacyDialog[] = dialogs.map((dialog) => ({
		...dialog,
		// Flatten the structure for legacy component
		...(dialog.type === "Error" && "error" in dialog ? { error: dialog.error } : {}),
	})) as LegacyDialog[];

	return <Dialogs dialogs={legacyDialogs} closeDialog={handleCloseDialog} />;
};

export default DialogManager;
