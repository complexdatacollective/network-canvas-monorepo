import Button from "@codaco/legacy-ui/components/Button";
import AssetBrowser from "~/components/AssetBrowser";
import Layout from "~/components/EditorLayout/Layout";
import ExternalLink from "~/components/ExternalLink";
import Screen from "~/components/Screen/Screen";
import ControlBar from "../ControlBar";
import CollapsableHeader from "../Screen/CollapsableHeader";

type AssetBrowserScreenProps = {
	layoutId?: string | null;
	onComplete: () => void;
};

const AssetBrowserScreen = ({ layoutId = null, onComplete }: AssetBrowserScreenProps) => {
	const buttons = [
		<Button key="done" onClick={onComplete} color="platinum">
			Close
		</Button>,
	];

	return (
		<Screen buttons={buttons} footer={<ControlBar buttons={buttons} />} layoutId={layoutId}>
			<CollapsableHeader
				collapsedState={
					<div className="stage-heading stage-heading--collapsed stage-heading--shadow">
						<Layout>
							<h2>Resource Library</h2>
						</Layout>
					</div>
				}
			>
				<div className="stage-heading stage-heading--inline">
					<Layout>
						<h1 className="screen-heading">Resource Library</h1>
						<p>
							Welcome to the resource library. Here, you can import external data resources which can be used in
							building your protocol. These resources might include images, video, audio, or even external network data.
							See our{" "}
							<ExternalLink href="https://documentation.networkcanvas.com/key-concepts/resources/">
								documentation
							</ExternalLink>{" "}
							for more information.
						</p>
					</Layout>
				</div>
			</CollapsableHeader>
			<Layout>
				<AssetBrowser />
			</Layout>
		</Screen>
	);
};


export { AssetBrowserScreen };

export default AssetBrowserScreen;
