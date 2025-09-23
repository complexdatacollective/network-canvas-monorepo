import { BookOpen, CodeXml, Download, Trash, UsersRound } from "lucide-react";
import { useDispatch } from "react-redux";
import { SAMPLE_PROTOCOL_URL } from "~/config";
import { openRemoteNetcanvas } from "~/ducks/modules/userActions/userActions";
import { clearAllStorage } from "~/utils/assetDB";
import { cn } from "~/utils/cn";
import { openExternalLink } from "../ExternalLink";
import ProtocolDropzone from "./ProtocolDropzone";

type LaunchCardProps = {
	icon: React.ReactNode;
	title: string;
	description: string;
	onClick: () => void;
	classNames?: string;
	devOnly?: boolean;
};

const LaunchCard = ({ icon, title, description, onClick, classNames, devOnly }: LaunchCardProps) => (
	<button
		type="button"
		onClick={onClick}
		onKeyDown={(e) => e.key === "Enter" && onClick()}
		className={cn(
			"text-primary-foreground rounded-lg cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-1 flex p-4 gap-4 items-center",
			devOnly && "border",
			classNames,
		)}
	>
		<div
			className={cn(
				"flex items-center justify-center w-12 h-12 rounded-full flex-shrink-0 bg-white/20",
				devOnly && "bg-inherit",
			)}
		>
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

	const handleClearStorage = () => {
		clearAllStorage();
	};

	const installDevelopmentProtocol = () => {
		// TODO: implement installing from development-protocol package
		console.log("Installing development protocol");
	};

	return (
		<div className="p-8">
			<div className="items-center justify-center flex flex-col">
				<ProtocolDropzone />
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 w-full">
					<LaunchCard
						icon={<UsersRound />}
						title="User Community"
						description="Ask questions and get help"
						onClick={() => openExternalLink("https://community.networkcanvas.com")}
						classNames="bg-cerulean-blue"
					/>
					<LaunchCard
						icon={<BookOpen />}
						title="Documentation"
						description="Learn how to use Architect"
						onClick={() => openExternalLink("https://documentation.networkcanvas.com")}
						classNames="bg-sea-serpent"
					/>
					<LaunchCard
						icon={<Download />}
						title="Sample Protocol"
						description="Explore a sample project"
						onClick={downloadSampleProtocol}
						classNames="bg-mustard"
					/>
					{process.env.NODE_ENV === "development" && (
						<>
							<LaunchCard
								icon={<CodeXml />}
								title="Development Protocol"
								description="Install development protocol"
								onClick={installDevelopmentProtocol}
								devOnly
								classNames="bg-primary/5 text-primary border-primary"
							/>
							<LaunchCard
								icon={<Trash />}
								title="Clear All Data"
								description="Clear Redux state, localStorage, and IndexedDB"
								onClick={handleClearStorage}
								devOnly
								classNames="bg-error/5 text-error border-error"
							/>
						</>
					)}
				</div>
			</div>
		</div>
	);
};

export default LaunchPad;
