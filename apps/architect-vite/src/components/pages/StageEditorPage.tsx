import { Check, X } from "lucide-react";
import { useCallback, useState } from "react";
import { useLocation, useParams } from "wouter";
import StageEditor from "~/components/StageEditor/StageEditor";
import PillButton from "~/components/shared/PillButton";
import PreviewIframe from "~/components/shared/PreviewIframe";
import ProtocolHeader from "~/components/shared/ProtocolHeader";
import SplitPane from "~/components/shared/SplitPane";
import { useAppSelector } from "~/ducks/hooks";
import useProtocolLoader from "~/hooks/useProtocolLoader";
import { getProtocolName, getStageIndexById, getStageLabelById } from "~/selectors/protocol";

const StageEditorPage = () => {
	const params = useParams<{ stageId?: string }>();
	const rawStageId = params.stageId;
	useProtocolLoader();
	const [, navigate] = useLocation();

	const urlParams = new URLSearchParams(window.location.search);
	const insertParam = urlParams.get("insertAtIndex");
	const insertAtIndex = insertParam ? Number(insertParam) : undefined;
	const type = urlParams.get("type") ?? undefined;
	const stageId = rawStageId === "new" ? undefined : rawStageId;

	const protocolName = useAppSelector(getProtocolName) ?? "Untitled protocol";
	const stageLabel = useAppSelector((s) => (stageId ? getStageLabelById(s, stageId) : undefined)) ?? "New stage";
	const stageIndex = useAppSelector((s) => (stageId ? getStageIndexById(s, stageId) : 0));

	const [submitRequested, setSubmitRequested] = useState(0);
	const [cancelRequested, setCancelRequested] = useState(0);
	const [isValid, setIsValid] = useState(true);
	const [narrowPreviewOpen, setNarrowPreviewOpen] = useState(false);

	const triggerSubmit = useCallback(() => setSubmitRequested((v) => v + 1), []);
	const triggerCancel = useCallback(() => setCancelRequested((v) => v + 1), []);

	const actions = (
		<>
			<PillButton variant="tertiary" size="sm" onClick={triggerCancel} icon={<X className="size-4" />}>
				Cancel
			</PillButton>
			<PillButton
				variant="primary"
				size="sm"
				onClick={triggerSubmit}
				disabled={!isValid}
				icon={<Check className="size-4" />}
			>
				Done
			</PillButton>
		</>
	);

	return (
		<div className="flex h-dvh flex-col pt-16">
			<ProtocolHeader
				protocolName={protocolName}
				subsection={stageLabel}
				actions={actions}
				onLogoClick={() => navigate("/protocol")}
			/>
			<div className="flex-1 overflow-hidden">
				<SplitPane
					left={<PreviewIframe stageIndex={stageIndex} />}
					right={
						<StageEditor
							id={stageId}
							insertAtIndex={insertAtIndex}
							type={type}
							submitRequestId={submitRequested}
							cancelRequestId={cancelRequested}
							onValidityChange={setIsValid}
						/>
					}
					narrowPreviewOpen={narrowPreviewOpen}
					onNarrowPreviewToggle={() => setNarrowPreviewOpen((v) => !v)}
				/>
			</div>
		</div>
	);
};

export default StageEditorPage;
