import { BookOpen, Download, UsersRound } from "lucide-react";
import { useDispatch } from "react-redux";
import { SAMPLE_PROTOCOL_URL } from "~/config";
import { createNetcanvas, openLocalNetcanvas, openRemoteNetcanvas } from "~/ducks/modules/userActions/userActions";
import { clearAllStorage } from "~/utils/assetDB";
import { openExternalLink } from "../ExternalLink";
import ProtocolDropzone from "./ProtocolDropzone";

const LaunchPad = () => {
	const dispatch = useDispatch();

	const downloadSampleProtocol = () => dispatch(openRemoteNetcanvas(SAMPLE_PROTOCOL_URL));

	const handleInstallDevProtocols = async () => {
		dispatch(openRemoteNetcanvas(SAMPLE_PROTOCOL_URL));
	};

	const handleCreateNewProtocol = () => {
		dispatch(createNetcanvas());
	};

	const handleOpenExistingProtocol = () => {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = ".netcanvas";
		input.onchange = (event) => {
			const file = (event.target as HTMLInputElement).files?.[0];
			if (file) {
				dispatch(openLocalNetcanvas(file));
			}
		};
		input.click();
	};

	const handleClearStorage = () => {
		clearAllStorage();
	};

	// return (
	// 	<Section className="launch-pad">
	// 		<Group>
	// 			<h2>Tasks</h2>
	// 			<div className="launch-pad__actions">
	// 				<div className="launch-pad__action">
	// 					<GraphicButton
	// 						graphic={createButtonGraphic}
	// 						graphicPosition="20% bottom"
	// 						graphicSize="auto 90%"
	// 						onClick={handleCreateNewProtocol}
	// 					>
	// 						<h2>Create</h2>
	// 						<h3>New Protocol</h3>
	// 					</GraphicButton>
	// 				</div>
	// 				<div className="launch-pad__action-divider" />
	// 				<div className="launch-pad__action">
	// 					<GraphicButton
	// 						graphic={openButtonGraphic}
	// 						graphicPosition="0 bottom"
	// 						color="slate-blue-dark"
	// 						graphicSize="auto 115%"
	// 						onClick={handleOpenExistingProtocol}
	// 					>
	// 						<h2>Open</h2>
	// 						<h3>Existing Protocol</h3>
	// 					</GraphicButton>
	// 				</div>
	// 			</div>
	// 		</Group>
	// 		{process.env.NODE_ENV === "development" && (
	// 			<Group>
	// 				<h2>Development Tools</h2>
	// 				<div className="launch-pad__actions">
	// 					<div className="launch-pad__action">
	// 						<GraphicButton
	// 							graphic={createButtonGraphic}
	// 							graphicPosition="20% bottom"
	// 							graphicSize="auto 90%"
	// 							onClick={handleInstallDevProtocols}
	// 							color="neon-coral"
	// 						>
	// 							<h2>Install</h2>
	// 							<h3>Sample Protocols</h3>
	// 						</GraphicButton>
	// 					</div>
	// 					<div className="launch-pad__action-divider" />
	// 					<div className="launch-pad__action">
	// 						<GraphicButton
	// 							graphic={openButtonGraphic}
	// 							graphicPosition="0 bottom"
	// 							color="mustard"
	// 							graphicSize="auto 115%"
	// 							onClick={handleClearStorage}
	// 						>
	// 							<h2>Clear</h2>
	// 							<h3>All Storage</h3>
	// 						</GraphicButton>
	// 					</div>
	// 				</div>
	// 			</Group>
	// 		)}
	// 	</Section>
	// );
	return (
		<div className="items-center justify-center flex flex-col">
			<ProtocolDropzone />
			<h2 className="mb-8">Need Help Getting Started?</h2>
			<div className="grid grid-cols-3 gap-4 w-full">
				{/* Community Card */}
				<div
					onClick={() => openExternalLink("https://community.networkcanvas.com")}
					className="bg-cerulean-blue rounded-lg text-primary-foreground p-6"
				>
					<UsersRound className="h-8 w-8" />
					<div>
						<h4>Community</h4>
						<p className="text-sm">Get help and share ideas</p>
					</div>
				</div>

				<div
					onClick={() => openExternalLink("https://documentation.networkcanvas.com")}
					className="bg-sea-serpent rounded-lg text-primary-foreground p-6"
				>
					<BookOpen className="h-8 w-8" />
					<div>
						<h4>Documentation</h4>
						<p className="text-sm">Learn how to use Architect</p>
					</div>
				</div>

				<div onClick={downloadSampleProtocol} className="bg-mustard rounded-lg text-primary-foreground p-6">
					<Download className="h-8 w-8" />
					<div>
						<h4>Sample Protocol</h4>
						<p className="text-sm">Download an example to explore</p>
					</div>
				</div>
			</div>
		</div>
	);
};

export default LaunchPad;
