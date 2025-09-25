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
		<div className="scene scene--assets">
			<div className="stage-heading stage-heading--inline">
				<Layout>
					<div className="flex items-center gap-4 mb-6">
						<Button onClick={handleGoBack} color="platinum">
							← Back to Protocol
						</Button>
					</div>
					<h1 className="screen-heading">Resource Library</h1>
					<p>
						Welcome to the resource library. Here, you can import external data resources which can be used in building
						your protocol. These resources might include images, video, audio, or even external network data. See our{" "}
						<ExternalLink href="https://documentation.networkcanvas.com/key-concepts/resources/">
							documentation
						</ExternalLink>{" "}
						for more information.
					</p>
				</Layout>
			</div>
			<Layout>
				<AssetBrowser />
			</Layout>
		</div>
	);
};

export default AssetsPage;
