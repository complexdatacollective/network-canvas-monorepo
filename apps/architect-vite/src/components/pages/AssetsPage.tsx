import { useLocation } from "wouter";
import AssetBrowser from "~/components/AssetBrowser";
import Card from "~/components/shared/Card";
import ProtocolHeader from "~/components/shared/ProtocolHeader";
import { useAppSelector } from "~/ducks/hooks";
import useProtocolLoader from "~/hooks/useProtocolLoader";
import { getProtocolName } from "~/selectors/protocol";
import SubRouteNav from "./SubRouteNav";

const AssetsPage = () => {
	useProtocolLoader();
	const [, navigate] = useLocation();
	const protocolName = useAppSelector(getProtocolName) ?? "Untitled protocol";

	return (
		<div className="flex h-dvh flex-col pt-16" style={{ background: "#F3EFF6" }}>
			<ProtocolHeader
				protocolName={protocolName}
				subsection="Assets"
				actions={<SubRouteNav active="assets" />}
				onLogoClick={() => navigate("/protocol")}
			/>
			<main className="flex-1 overflow-auto">
				<div className="mx-auto max-w-5xl px-6 py-8">
					<Card padding="lg">
						<AssetBrowser sectionLayout="vertical" />
					</Card>
				</div>
			</main>
		</div>
	);
};

export default AssetsPage;
