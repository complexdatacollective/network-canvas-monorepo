import { useEffect } from "react";
import { useSelector } from "react-redux";
import { useLocation } from "wouter";
import ControlBar from "~/components/ControlBar";
import { Layout } from "~/components/EditorLayout";
import useProtocolLoader from "~/hooks/useProtocolLoader";
import { Button } from "~/lib/legacy-ui/components";
import AssetManifest from "~/lib/ProtocolSummary/components/AssetManifest";
import Codebook from "~/lib/ProtocolSummary/components/Codebook";
import Contents from "~/lib/ProtocolSummary/components/Contents";
import Cover from "~/lib/ProtocolSummary/components/Cover";
import Stages from "~/lib/ProtocolSummary/components/Stages";
import SummaryContext from "~/lib/ProtocolSummary/components/SummaryContext";
import { getCodebookIndex } from "~/lib/ProtocolSummary/helpers";
import { getProtocol, getProtocolName } from "~/selectors/protocol";

// Create a formatted date string that can be used in a filename (no illegal chars)
const dateWithSafeChars = (date: string, replaceWith = "-") =>
	date.replace(/[^a-zA-Z\d\s]/gi, replaceWith).toLowerCase();

const SummaryPage = () => {
	const [, setLocation] = useLocation();

	// Load the protocol based on URL parameters
	useProtocolLoader();

	// Apply print class for print preview styling
	useEffect(() => {
		document.documentElement.classList.add("print");

		return () => {
			document.documentElement.classList.remove("print");
		};
	}, []);

	// Get the active protocol and metadata from Redux store
	const protocol = useSelector(getProtocol);
	const protocolName = useSelector(getProtocolName);

	const handleGoBack = () => {
		setLocation("/protocol");
	};

	const index = getCodebookIndex(protocol);

	const print = () => {
		if (!protocolName) return;

		const now = new Date();
		const dateString = `${dateWithSafeChars(now.toLocaleDateString(), "-")} ${dateWithSafeChars(now.toLocaleTimeString(), ".")}`;

		// Extract filename without extension (web-compatible approach)
		const fileName = `${protocolName} Protocol Summary (Created ${dateString}).pdf`;

		window.document.title = fileName;
		window.print();
	};

	// Don't render until we have protocol data
	if (!protocol || !protocolName) {
		return (
			<Layout>
				<p>Loading protocol...</p>
			</Layout>
		);
	}

	return (
		<SummaryContext.Provider
			value={{
				protocol,
				protocolName,
				index,
			}}
		>
			<div className="relative flex flex-col h-dvh print:h-auto print:overflow-visible">
				<div className="flex-1 overflow-y-auto print:overflow-visible">
					<Layout className="protocol-summary-page">
						<div className="screen-heading">
							<div className="flex flex-col">
								<h1 className="screen-heading">Protocol Summary</h1>
								<p>
									Below is a comprehensive summary of your protocol configuration, including all stages, codebook, and
									assets.
								</p>
							</div>
						</div>
						<div className="protocol-summary">
							<div className="protocol-summary__cover page-break-marker">
								<Cover />
							</div>

							<div className="protocol-summary__contents page-break-marker">
								<Contents />
							</div>

							<div className="protocol-summary__stages">
								<Stages />
							</div>

							<div className="protocol-summary__codebook">
								<Codebook />
							</div>

							<div className="protocol-summary__manifest">
								<AssetManifest />
							</div>
						</div>
					</Layout>
				</div>
				<ControlBar
					className="print:hidden"
					secondaryButtons={[
						<Button key="go-back" onClick={handleGoBack} color="platinum">
							Go Back
						</Button>,
					]}
					buttons={[
						<Button key="print" onClick={print} color="sea-green">
							Print
						</Button>,
					]}
				/>
			</div>
		</SummaryContext.Provider>
	);
};

export default SummaryPage;
