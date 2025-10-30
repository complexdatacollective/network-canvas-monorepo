import { useParams } from "wouter";
import StageEditor from "~/components/StageEditor/StageEditor";
import useProtocolLoader from "~/hooks/useProtocolLoader";

const StageEditorPage = () => {
	const { stageId } = useParams();

	// Load the protocol based on URL parameters
	useProtocolLoader();

	// Get insertAtIndex and type from URL search params if available (for new stages)
	const urlParams = new URLSearchParams(window.location.search);
	const insertAtIndex = urlParams.get("insertAtIndex") ? Number(urlParams.get("insertAtIndex")) : undefined;
	const type = urlParams.get("type") || undefined;

	return (
		<div className="scene">
			<StageEditor id={stageId} insertAtIndex={insertAtIndex} type={type} />
		</div>
	);
};

export default StageEditorPage;
