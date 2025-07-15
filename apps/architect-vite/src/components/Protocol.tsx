import Overview from "~/components/Overview";
import ProtocolControlBar from "~/components/ProtocolControlBar";
import Timeline from "~/components/Timeline";
import useProtocolLoader from "~/hooks/useProtocolLoader";

const Protocol = () => {
	// Use the protocol loader hook to handle URL-based protocol loading
	useProtocolLoader();

	return (
		<>
			<Overview />
			<Timeline />
			<ProtocolControlBar />
		</>
	);
};

export default Protocol;
