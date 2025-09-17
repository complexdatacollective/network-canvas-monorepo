import ProtocolControlBar from "~/components/ProtocolControlBar";
import useProtocolLoader from "~/hooks/useProtocolLoader";
import Timeline from "./Timeline";
// import ExperimentalTimeline from "./Timeline/ExperimentalTimeline";

const Protocol = () => {
	// Use the protocol loader hook to handle URL-based protocol loading
	useProtocolLoader();

	return (
		<>
			{/* <Overview /> */}
			<Timeline />
			{/* <ExperimentalTimeline /> */}
			<ProtocolControlBar />
		</>
	);
};

export default Protocol;
