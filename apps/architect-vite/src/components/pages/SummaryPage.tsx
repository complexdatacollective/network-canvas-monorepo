import { useEffect } from "react";
import { useLocation } from "wouter";
import Card from "~/components/shared/Card";
import ProtocolHeader from "~/components/shared/ProtocolHeader";
import { useAppSelector } from "~/ducks/hooks";
import useProtocolLoader from "~/hooks/useProtocolLoader";
import AssetManifest from "~/lib/ProtocolSummary/components/AssetManifest";
import Codebook from "~/lib/ProtocolSummary/components/Codebook";
import Contents from "~/lib/ProtocolSummary/components/Contents";
import Cover from "~/lib/ProtocolSummary/components/Cover";
import Stages from "~/lib/ProtocolSummary/components/Stages";
import SummaryContext from "~/lib/ProtocolSummary/components/SummaryContext";
import { getCodebookIndex } from "~/lib/ProtocolSummary/helpers";
import { getProtocol, getProtocolName } from "~/selectors/protocol";
import SubRouteNav from "./SubRouteNav";

const SummaryPage = () => {
	useProtocolLoader();
	const [, navigate] = useLocation();
	const protocol = useAppSelector(getProtocol);
	const protocolName = useAppSelector(getProtocolName) ?? "Untitled protocol";

	useEffect(() => {
		document.documentElement.classList.add("print");
		return () => {
			document.documentElement.classList.remove("print");
		};
	}, []);

	if (!protocol) {
		return <p>Loading protocol...</p>;
	}

	const index = getCodebookIndex(protocol);

	return (
		<div className="flex h-dvh flex-col pt-16" style={{ background: "#F3EFF6" }}>
			<ProtocolHeader
				protocolName={protocolName}
				subsection="Summary"
				actions={<SubRouteNav active="summary" />}
				onLogoClick={() => navigate("/protocol")}
			/>
			<main className="flex-1 overflow-auto print:h-auto print:overflow-visible">
				<SummaryContext.Provider value={{ protocol, protocolName, index }}>
					<div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8 print:max-w-none print:gap-4 print:p-0">
						<Card padding="lg">
							<Cover />
						</Card>
						<Card padding="lg">
							<Contents />
						</Card>
						<Card padding="lg">
							<Stages />
						</Card>
						<Card padding="lg">
							<Codebook />
						</Card>
						<Card padding="lg">
							<AssetManifest />
						</Card>
					</div>
				</SummaryContext.Provider>
			</main>
		</div>
	);
};

export default SummaryPage;
