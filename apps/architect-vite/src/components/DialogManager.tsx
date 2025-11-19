import { useDispatch, useSelector } from "react-redux";
import Dialogs from "~/lib/legacy-ui/components/Dialogs";
import { closeDialog } from "../ducks/modules/dialogs";
import type { RootState } from "../ducks/modules/root";

const DialogManager = () => {
	const dispatch = useDispatch();
	const dialogs = useSelector((state: RootState) => state.dialogs.dialogs);

	const handleCloseDialog = (id: string) => {
		dispatch(closeDialog(id));
	};

	return <Dialogs dialogs={dialogs} closeDialog={handleCloseDialog} />;
};

export default DialogManager;
