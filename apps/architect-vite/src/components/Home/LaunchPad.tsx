import { BookOpen, Download, UsersRound } from "lucide-react";
import { useDispatch } from "react-redux";
import { SAMPLE_PROTOCOL_URL } from "~/config";
import { createNetcanvas, openLocalNetcanvas, openRemoteNetcanvas } from "~/ducks/modules/userActions/userActions";
import { clearAllStorage } from "~/utils/assetDB";
import { openExternalLink } from "../ExternalLink";
import ProtocolDropzone from "./ProtocolDropzone";

type HelpCardProps = {
	icon: React.ReactNode;
	title: string;
	description: string;
	onClick: () => void;
	bgColor: string;
};

const HelpCard = ({ icon, title, description, onClick, bgColor }: HelpCardProps) => (
	<button
		type="button"
		onClick={onClick}
		onKeyDown={(e) => e.key === "Enter" && onClick()}
		className={`${bgColor} text-primary-foreground rounded-lg cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-1 flex p-4 gap-4 items-center`}
	>
		<div className="flex items-center justify-center w-12 h-12 rounded-full flex-shrink-0 bg-white/20">
			<div>{icon}</div>
		</div>

		<div className="flex flex-col text-left justify-center">
			<span className="font-semibold">{title}</span>
			<span className="text-sm mt-0.5 font-thin">{description}</span>
		</div>
	</button>
);

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

	return (
		<div className="items-center justify-center flex flex-col">
			<ProtocolDropzone />
			{/* <h3 className="mb-8">Need Help Getting Started?</h3> */}
			<div className="grid grid-cols-3 gap-4 w-full">
				<HelpCard
					icon={<UsersRound />}
					title="User Community"
					description="Ask questions and get help"
					onClick={() => openExternalLink("https://community.networkcanvas.com")}
					bgColor="bg-cerulean-blue"
				/>
				<HelpCard
					icon={<BookOpen />}
					title="Documentation"
					description="Learn how to use Architect"
					onClick={() => openExternalLink("https://documentation.networkcanvas.com")}
					bgColor="bg-sea-serpent"
				/>
				<HelpCard
					icon={<Download />}
					title="Sample Protocol"
					description="Explore a sample project"
					onClick={downloadSampleProtocol}
					bgColor="bg-mustard"
				/>
			</div>
		</div>
	);
};

export default LaunchPad;
