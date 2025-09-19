import { useLocation } from "wouter";
import Codebook from "~/components/Codebook/Codebook";
import { Layout } from "~/components/EditorLayout";
import useProtocolLoader from "~/hooks/useProtocolLoader";
import { Button } from "~/lib/legacy-ui";

const CodebookPage = () => {
	const [, setLocation] = useLocation();

	// Load the protocol based on URL parameters
	useProtocolLoader();

	const handleGoBack = () => {
		// Extract protocol ID from current URL and navigate back to protocol overview
		// const urlPath = window.location.pathname;
		// const protocolId = urlPath.match(/\/protocol\/([^\/]+)/)?.[1];
		// if (protocolId) {
		// 	setLocation(`/protocol/${protocolId}`);
		// } else {
		// 	setLocation("/");
		// }
		setLocation("/protocol");
	};

	return (
		<Layout>
			<div className="stage-heading">
				<h1 className="screen-heading">Codebook</h1>
				<p>
					Below you can find an overview of the node and edge types that you have defined while creating your interview.
					Entities that are unused may be deleted.
				</p>
			</div>
			<Codebook />
			<div className="flex fixed bottom-0 p-6 bg-slate-blue-dark w-full">
				<Button onClick={handleGoBack} color="platinum">
					Go Back
				</Button>
			</div>
		</Layout>
	);
};

export default CodebookPage;
