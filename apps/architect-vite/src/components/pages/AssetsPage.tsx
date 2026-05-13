import AssetBrowser from "~/components/AssetBrowser";
import { Layout } from "~/components/EditorLayout";
import ExternalLink from "~/components/ExternalLink";
import PageHeading from "~/components/ProjectNav/PageHeading";
import useProtocolLoader from "~/hooks/useProtocolLoader";

const AssetsPage = () => {
	// Load the protocol based on URL parameters
	useProtocolLoader();

	return (
		<Layout>
			<PageHeading
				title="Resource Library"
				description={
					<>
						Import external data resources to use in your protocol — images, video, audio, or network data. See our{" "}
						<ExternalLink href="https://documentation.networkcanvas.com/key-concepts/resources/">
							documentation
						</ExternalLink>{" "}
						for more information.
					</>
				}
			/>
			<div className="mx-(--space-5xl) w-full max-w-[80rem]">
				<AssetBrowser sectionLayout="vertical" />
			</div>
		</Layout>
	);
};

export default AssetsPage;
