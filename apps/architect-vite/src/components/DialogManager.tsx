import Dialogs from "@codaco/legacy-ui/components/Dialogs";
import { useDispatch, useSelector } from "react-redux";
import { closeDialog } from "../ducks/modules/dialogs";
import type { RootState } from "../ducks/modules/root";
import { useBodyScrollLock } from "./InlineEditScreen/useBodyScrollLock";

const DialogManager = () => {
	const dispatch = useDispatch();
	const dialogs = useSelector((state: RootState) => state.dialogs.dialogs);

	useBodyScrollLock(dialogs.length > 0);

	const handleCloseDialog = (id: string) => {
		dispatch(closeDialog(id));
	};

	return <Dialogs dialogs={dialogs} closeDialog={handleCloseDialog} />;
};

export default DialogManager;
