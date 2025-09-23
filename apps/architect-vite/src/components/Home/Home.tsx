import headerGraphic from "~/images/Arc-Flat.svg";
import networkCanvasLogo from "~/images/NC-Mark.svg";
import { appVersion } from "~/utils/appVersion";
import LaunchPad from "./LaunchPad";

const Home = () => {
	// useProtocolLoader();
	return (
		<div className="min-h-screen flex flex-col">
			<header className="flex justify-between items-center px-8 py-1 bg-accent text-accent-foreground">
				<div className="flex items-center gap-3">
					<img src={networkCanvasLogo} alt="Network Canvas" className="h-8 w-8" />
					<div className="flex items-baseline gap-2">
						<h1 className="text-xl font-semibold ">Network Canvas</h1>
						<span className="text-xl">Architect</span>
					</div>
				</div>
				<span className="text-sm">v{appVersion}</span>
			</header>

			<div className="flex-1 flex flex-col items-center px-8 pt-12">
				<div className="w-full max-w-5xl">
					<div className="flex md:flex-row flex-col items-center justify-center gap-8 mb-8">
						<img src={headerGraphic} alt="Network Canvas Architect" className="h-24" />
						<div className="text-left">
							<h2 className="text-4xl font-semibold mb-0">Welcome to Architect</h2>
							<p className="text-lg">A tool for building Network Canvas Interviews</p>
						</div>
					</div>

					<LaunchPad />
				</div>
			</div>
		</div>
	);
};

export default Home;
