import ProtocolControlBar from "~/components/ProtocolControlBar";
import useProtocolLoader from "~/hooks/useProtocolLoader";
// import ExperimentalTimeline from "./Timeline/ExperimentalTimeline";
import Timeline from "./Timeline/Timeline";

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
