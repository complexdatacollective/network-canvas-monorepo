import Spinner from "~/lib/legacy-ui/components/Spinner";

const ProtocolLoadingOverlay = () => (
	<div className="fixed inset-0 z-50 flex items-center justify-center bg-rich-black/50 backdrop-blur-sm">
		<Spinner />
	</div>
);

export default ProtocolLoadingOverlay;
