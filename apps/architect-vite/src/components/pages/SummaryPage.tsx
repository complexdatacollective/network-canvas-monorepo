import { useEffect } from "react";
import { useSelector } from "react-redux";
import { useLocation, useParams } from "wouter";
import { Layout } from "~/components/EditorLayout";
import useProtocolLoader from "~/hooks/useProtocolLoader";
import { Button } from "~/lib/legacy-ui";
import AssetManifest from "~/lib/ProtocolSummary/components/AssetManifest";
import Codebook from "~/lib/ProtocolSummary/components/Codebook";
import Contents from "~/lib/ProtocolSummary/components/Contents";
import Cover from "~/lib/ProtocolSummary/components/Cover";
import Stages from "~/lib/ProtocolSummary/components/Stages";
import SummaryContext from "~/lib/ProtocolSummary/components/SummaryContext";
import { getCodebookIndex } from "~/lib/ProtocolSummary/helpers";
import { getProtocol } from "~/selectors/protocol";

// Create a formatted date string that can be used in a filename (no illegal chars)
const dateWithSafeChars = (date: string, replaceWith = "-") =>
	date.replace(/[^a-zA-Z\d\s]/gi, replaceWith).toLowerCase();

const SummaryPage = () => {
	const [, setLocation] = useLocation();
	const { protocolId } = useParams();

	// Load the protocol based on URL parameters
	useProtocolLoader();

	// Apply print class for print preview styling
	useEffect(() => {
		document.documentElement.classList.add("print");

		return () => {
			document.documentElement.classList.remove("print");
		};
	}, []);

	// Get the active protocol from Redux store
	const protocol = useSelector(getProtocol);

	const handleGoBack = () => {
		if (protocolId) {
			setLocation(`/protocol/${protocolId}`);
		} else {
			setLocation("/");
		}
	};

	const index = getCodebookIndex(protocol);

	const print = () => {
		const now = new Date();
		const dateString = `${dateWithSafeChars(now.toLocaleDateString(), "-")} ${dateWithSafeChars(now.toLocaleTimeString(), ".")}`;

		// Extract filename without extension (web-compatible approach)
		const baseFileName =
			protocol?.name
				?.replace(/\.netcanvas$/, "")
				.split("/")
				.pop() || "protocol";
		const fileName = `${baseFileName} Protocol Summary (Created ${dateString}).pdf`;

		window.document.title = fileName;
		window.print();
	};

	// Don't render until we have protocol data
	if (!protocol) {
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
				index,
			}}
		>
			<Layout className="protocol-summary-page">
				<div className="stage-heading">
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
				<div className="protocol-summary-controls">
					<Button onClick={handleGoBack} color="platinum">
						Go Back
					</Button>
					<Button onClick={print}>Print</Button>
				</div>
			</Layout>
		</SummaryContext.Provider>
	);
};

export default SummaryPage;
