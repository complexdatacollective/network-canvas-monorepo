import { Printer } from "lucide-react";
import { useEffect } from "react";
import { useSelector } from "react-redux";
import { Layout } from "~/components/EditorLayout";
import Tooltip from "~/components/NewComponents/Tooltip";
import { PageActions } from "~/components/ProjectNav/PageActions";
import PageHeading from "~/components/ProjectNav/PageHeading";
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
			<PageActions>
				<Tooltip content="Print protocol summary">
					<Button onClick={print} color="neon-coral" icon={<Printer />}>
						Print
					</Button>
				</Tooltip>
			</PageActions>
			<Layout className="protocol-summary-page">
				<div className="print:hidden w-full">
					<PageHeading
						title="Protocol Summary"
						description="Below is a comprehensive summary of your protocol configuration, including all stages, codebook, and assets."
					/>
				</div>
				<div className="protocol-summary">
					<div className="page-break-marker">
						<Cover />
					</div>

					<div className="page-break-marker">
						<Contents />
					</div>

					<div>
						<Stages />
					</div>

					<div>
						<Codebook />
					</div>

					<div>
						<AssetManifest />
					</div>
				</div>
			</Layout>
		</SummaryContext.Provider>
	);
};

export default SummaryPage;
