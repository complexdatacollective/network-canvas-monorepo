import { DateTime } from "luxon";
import { useContext } from "react";
import networkCanvasLogo from "~/images/NC-Mark.svg";
import ProtocolCard from "~/lib/legacy-ui/components/Cards/ProtocolCard";
import SummaryContext from "./SummaryContext";

const Cover = () => {
	const { protocol, protocolName } = useContext(SummaryContext);

	const lastModifiedFormatted = protocol.lastModified
		? DateTime.fromISO(protocol.lastModified).toHTTP()
		: DateTime.now().toHTTP();
	const date = new Date();
	const now = `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;

	return (
		<div className="relative flex h-(--page-size-height) flex-col items-center justify-center print:h-screen [&_.protocol-card]:bg-platinum [&_.protocol-card]:max-w-[12cm] [&_.protocol-card]:[zoom:120%] [&_.protocol-card_.protocol-name]:block">
			<div className="absolute top-0 left-0 flex w-full items-center justify-between border-b-2 border-platinum">
				<h2>Protocol Summary Document</h2>
				<div className="flex items-center justify-end">
					<img className="size-(--space-3xl)" src={networkCanvasLogo} alt="A Network Canvas project" />
					<h2>Network Canvas</h2>
				</div>
			</div>
			<ProtocolCard
				name={protocolName}
				description={protocol.description ?? ""}
				lastModified={lastModifiedFormatted}
				schemaVersion={protocol.schemaVersion ?? 8}
			/>
			<br />
			<br />
			<br />
			<h2 className="font-semibold text-xs uppercase tracking-widest">Document Created: {now}</h2>
		</div>
	);
};

export default Cover;
