import ProtocolControlBar from "~/components/ProtocolControlBar";
import useProtocolLoader from "~/hooks/useProtocolLoader";
import Overview from "./Overview";
import Timeline from "./Timeline";

const Protocol = () => {
	// Use the protocol loader hook to handle URL-based protocol loading
	useProtocolLoader();

	return (
		<div className="relative flex flex-col h-dvh">
			<div className="flex-1 overflow-y-auto">
				<Overview />
				<Timeline />
			</div>
			<ProtocolControlBar />
		</div>
	);
};

export default Protocol;
