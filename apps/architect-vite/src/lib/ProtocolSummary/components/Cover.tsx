import { DateTime } from "luxon";
import { useContext } from "react";
import networkCanvasLogo from "~/images/NC-Mark.svg";
import ProtocolCard from "~/lib/legacy-ui/components/Cards/ProtocolCard";
import SummaryContext from "./SummaryContext";

const Cover = () => {
	const { protocol } = useContext(SummaryContext);

	const lastModified = DateTime.fromISO(protocol.lastModified).toHTTP();
	const date = new Date();
	const now = `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;

	return (
		<div className="protocol-summary-cover">
			<div className="protocol-summary-cover__header">
				<h2>Protocol Summary Document</h2>
				<div className="protocol-summary-cover__brand">
					<img src={networkCanvasLogo} alt="A Network Canvas project" />
					<h2>Network Canvas</h2>
				</div>
			</div>
			<ProtocolCard
				name={protocol?.name ?? "Protocol"}
				description={protocol?.description ?? ""}
				lastModified={lastModified}
				schemaVersion={protocol?.schemaVersion ?? 8}
			/>
			<br />
			<br />
			<br />
			<h2 className="exported-date">Document Created: {now}</h2>
		</div>
	);
};

export default Cover;
