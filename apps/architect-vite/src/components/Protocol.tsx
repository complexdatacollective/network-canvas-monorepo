import useProtocolLoader from "~/hooks/useProtocolLoader";
import ProtocolInfoCard from "./ProtocolInfoCard";
import Timeline from "./Timeline";

const Protocol = () => {
	useProtocolLoader();
	return (
		<div className="flex flex-col items-center mt-(--space-xl)">
			<ProtocolInfoCard />
			<Timeline />
		</div>
	);
};

export default Protocol;
