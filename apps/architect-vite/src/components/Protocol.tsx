import { Check, Download, Redo, Undo } from "lucide-react";
import { useCallback, useState } from "react";
import { useLocation } from "wouter";
import PillButton from "~/components/shared/PillButton";
import PreviewIframe from "~/components/shared/PreviewIframe";
import ProtocolHeader from "~/components/shared/ProtocolHeader";
import SplitPane from "~/components/shared/SplitPane";
import { useAppDispatch, useAppSelector } from "~/ducks/hooks";
import { clearActiveProtocol, redo, undo } from "~/ducks/modules/activeProtocol";
import { actionCreators as dialogActions } from "~/ducks/modules/dialogs";
import { exportNetcanvas } from "~/ducks/modules/userActions/userActions";
import useProtocolLoader from "~/hooks/useProtocolLoader";
import { getCanRedo, getCanUndo, getIsProtocolDirty, getProtocolName } from "~/selectors/protocol";
import Overview from "./Overview";
import Timeline from "./Timeline";

const Protocol = () => {
	useProtocolLoader();
	const dispatch = useAppDispatch();
	const [, navigate] = useLocation();

	const protocolName = useAppSelector(getProtocolName) ?? "Untitled protocol";
	const canUndo = useAppSelector(getCanUndo);
	const canRedo = useAppSelector(getCanRedo);
	const isDirty = useAppSelector(getIsProtocolDirty);

	const [isDownloading, setIsDownloading] = useState(false);
	const [justDownloaded, setJustDownloaded] = useState(false);
	const [narrowPreviewOpen, setNarrowPreviewOpen] = useState(false);

	const handleDownload = useCallback(async () => {
		setIsDownloading(true);
		try {
			await dispatch(exportNetcanvas()).unwrap();
			setJustDownloaded(true);
			setTimeout(() => setJustDownloaded(false), 2000);
		} finally {
			setIsDownloading(false);
		}
	}, [dispatch]);

	const handleClose = useCallback(() => {
		dispatch(
			dialogActions.openDialog({
				type: "Warning",
				title: "Clear Editor?",
				message:
					"Returning to the start screen will clear the current protocol from the editor. If you have made changes, please download the updated version first.",
				confirmLabel: "Return to start screen",
				onConfirm: () => {
					dispatch(clearActiveProtocol());
					navigate("/");
				},
			}),
		);
	}, [dispatch, navigate]);

	const actions = (
		<>
			<button
				type="button"
				onClick={() => dispatch(undo())}
				disabled={!canUndo}
				aria-label="Undo"
				className="flex size-9 cursor-pointer items-center justify-center rounded-full bg-white disabled:opacity-40"
				style={{ boxShadow: "0 2px 8px rgba(22,21,43,0.08)" }}
			>
				<Undo className="size-4" />
			</button>
			<button
				type="button"
				onClick={() => dispatch(redo())}
				disabled={!canRedo}
				aria-label="Redo"
				className="flex size-9 cursor-pointer items-center justify-center rounded-full bg-white disabled:opacity-40"
				style={{ boxShadow: "0 2px 8px rgba(22,21,43,0.08)" }}
			>
				<Redo className="size-4" />
			</button>
			<PillButton
				variant="primary"
				size="sm"
				onClick={handleDownload}
				disabled={isDownloading}
				icon={justDownloaded ? <Check className="size-4" /> : <Download className="size-4" />}
			>
				{justDownloaded ? "Saved" : isDownloading ? "Saving…" : isDirty ? "Save •" : "Save"}
			</PillButton>
		</>
	);

	return (
		<div className="flex h-dvh flex-col pt-16" style={{ background: "#F3EFF6" }}>
			<ProtocolHeader protocolName={protocolName} actions={actions} onLogoClick={handleClose} />
			<div className="flex-1 overflow-hidden">
				<SplitPane
					left={<PreviewIframe />}
					right={
						<div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8">
							<Overview />
							<Timeline />
						</div>
					}
					narrowPreviewOpen={narrowPreviewOpen}
					onNarrowPreviewToggle={() => setNarrowPreviewOpen((v) => !v)}
				/>
			</div>
		</div>
	);
};

export default Protocol;
