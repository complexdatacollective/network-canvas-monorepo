import { useLocation } from "wouter";
import AssetBrowser from "~/components/AssetBrowser";
import { Layout } from "~/components/EditorLayout";
import ExternalLink from "~/components/ExternalLink";
import useProtocolLoader from "~/hooks/useProtocolLoader";
import Button from "~/lib/legacy-ui/components/Button";

const AssetsPage = () => {
	const [, setLocation] = useLocation();

	// Load the protocol based on URL parameters
	useProtocolLoader();

	const handleGoBack = () => {
		setLocation("/protocol/");
	};

	return (
		<Layout>
			<div className="flex flex-col gap-6" style={{ margin: "var(--space-xl) var(--space-5xl)", maxWidth: "80rem" }}>
				<div className="stage-heading">
					<h1 className="screen-heading">Resource Library</h1>
					<p>
						Welcome to the resource library. Here, you can import external data resources which can be used in building
						your protocol. These resources might include images, video, audio, or even external network data. See our{" "}
						<ExternalLink href="https://documentation.networkcanvas.com/key-concepts/resources/">
							documentation
						</ExternalLink>{" "}
						for more information.
					</p>
				</div>
				<AssetBrowser />
			</div>
			<div className="flex fixed bottom-0 p-6 bg-cyber-grape w-full">
				<Button onClick={handleGoBack} color="platinum">
					Go Back
				</Button>
			</div>
		</Layout>
	);
};

export default AssetsPage;
