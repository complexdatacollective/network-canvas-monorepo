import { Check, Download, Redo, Undo } from "lucide-react";
import { useCallback, useState } from "react";
import { useSelector } from "react-redux";
import { useLocation } from "wouter";
import ControlBar from "~/components/ControlBar";
import { useAppDispatch } from "~/ducks/hooks";
import { clearActiveProtocol, getCanRedo, getCanUndo, redo, undo } from "~/ducks/modules/activeProtocol";
import { actionCreators as dialogActions } from "~/ducks/modules/dialogs";
import { checkUnsavedChanges, exportNetcanvas } from "~/ducks/modules/userActions/userActions";
import type { RootState } from "~/ducks/store";
import logoutIcon from "~/images/home/log-out.svg";
import { Button } from "~/lib/legacy-ui/components";

const ProtocolControlBar = () => {
	const dispatch = useAppDispatch();
	const [, navigate] = useLocation();
	const [isExporting, setIsExporting] = useState(false);
	const [downloadSuccess, setDownloadSuccess] = useState(false);

	const canUndo = useSelector((state: RootState) => getCanUndo(state));
	const canRedo = useSelector((state: RootState) => getCanRedo(state));

	const handleReturnToStart = useCallback(async () => {
		// todo: confirm un-downloaded changes

		const canContinue = await dispatch(checkUnsavedChanges()).unwrap();
		if (!canContinue) {
			return;
		}

		dispatch(
			dialogActions.openDialog({
				type: "Warning",
				title: "Clear Editor?",
				message:
					"Returning to the start screen will clear the current protocol from the editor. If you have made changes to your protocol, please ensure you have downloaded the updated version before proceeding.",
				confirmLabel: "Return to start screen",
				onConfirm: () => {
					dispatch(clearActiveProtocol());
					navigate("/");
				},
			}),
		);
	}, [dispatch, navigate]);

	const handleDownload = useCallback(async () => {
		try {
			setIsExporting(true);
			await dispatch(exportNetcanvas()).unwrap();
			setDownloadSuccess(true);
			setTimeout(() => setDownloadSuccess(false), 2000);
		} catch (error) {
			throw new Error(`Failed to export protocol: ${error}`);
		} finally {
			setIsExporting(false);
		}
	}, [dispatch]);

	const handleUndo = useCallback(() => {
		dispatch(undo());
	}, [dispatch]);

	const handleRedo = useCallback(() => {
		dispatch(redo());
	}, [dispatch]);

	return (
		<ControlBar
			secondaryButtons={[
				<Button
					key="return-button"
					color="platinum"
					icon={
						<div>
							<img src={logoutIcon} alt="Return to start screen" />
						</div>
					}
					onClick={handleReturnToStart}
				>
					Return to start screen
				</Button>,
			]}
			buttons={[
				<Button key="undo-button" color="platinum" icon={<Undo />} onClick={handleUndo} disabled={!canUndo}>
					Undo
				</Button>,
				<Button key="redo-button" color="platinum" icon={<Redo />} onClick={handleRedo} disabled={!canRedo}>
					Redo
				</Button>,
				<Button
					key="export-button"
					onClick={handleDownload}
					color="sea-green"
					content={downloadSuccess ? "Downloaded" : isExporting ? "Downloading..." : "Download"}
					disabled={isExporting}
					icon={downloadSuccess ? <Check /> : <Download />}
				/>,
			]}
		/>
	);
};

export default ProtocolControlBar;
