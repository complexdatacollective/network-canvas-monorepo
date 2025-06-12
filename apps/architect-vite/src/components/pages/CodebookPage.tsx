import { useLocation } from "wouter";
import Codebook from "~/components/Codebook/Codebook";
import { Layout } from "~/components/EditorLayout";
import useProtocolLoader from "~/hooks/useProtocolLoader";

const CodebookPage = () => {
	const [, setLocation] = useLocation();

	// Load the protocol based on URL parameters
	useProtocolLoader();

	const handleGoBack = () => {
		// Extract protocol ID from current URL and navigate back to protocol overview
		const urlPath = window.location.pathname;
		const protocolId = urlPath.match(/\/protocol\/([^\/]+)/)?.[1];
		if (protocolId) {
			setLocation(`/protocol/${protocolId}`);
		} else {
			setLocation("/");
		}
	};

	return (
		<div className="scene scene--codebook">
			<div className="stage-heading stage-heading--inline">
				<Layout>
					<div className="flex items-center gap-4 mb-6">
						<button
							onClick={handleGoBack}
							className="text-blue-600 hover:text-blue-800 flex items-center gap-2"
							type="button"
						>
							← Back to Protocol
						</button>
					</div>
					<h1 className="screen-heading">Codebook</h1>
					<p>
						Below you can find an overview of the node and edge types that you have defined while creating your
						interview. Entities that are unused may be deleted.
					</p>
				</Layout>
			</div>
			<Layout>
				<Codebook />
			</Layout>
		</div>
	);
};

export default CodebookPage;