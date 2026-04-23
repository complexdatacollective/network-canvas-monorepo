import headerGraphic from "~/images/Arc-Flat.svg";
import networkCanvasLogo from "~/images/NC-Mark.svg";
import { appVersion } from "~/utils/appVersion";
import Badge from "../Badge";
import LaunchPad from "./LaunchPad";

type NavLinkProps = {
	href: string;
	children: React.ReactNode;
};

const NavLink = ({ href, children }: NavLinkProps) => (
	<a
		href={href}
		target="_blank"
		rel="noopener noreferrer"
		className="small-heading hover:text-primary underline decoration-2 underline-offset-8 decoration-transparent hover:decoration-action transition-all"
	>
		{children}
	</a>
);

const Home = () => {
	return (
		<div className="flex flex-col h-dvh overflow-y-auto">
			<header className="flex justify-between items-center gap-4 sm:gap-8 max-w-6xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-8">
				<div className="flex items-center gap-3 sm:gap-4 pl-2 sm:pl-3 pr-4 sm:pr-8 py-2 bg-surface-1 rounded-full shadow-sm">
					<img src={networkCanvasLogo} alt="Network Canvas" className="h-10 w-10 sm:h-14 sm:w-14" />
					<h3>Architect</h3>
					<Badge color="sea-green">WEB</Badge>
				</div>
				<div className="flex items-center gap-6 lg:gap-12">
					<nav className="hidden md:flex items-center gap-6 lg:gap-10">
						<NavLink href="https://documentation.networkcanvas.com">Docs</NavLink>
						<NavLink href="https://community.networkcanvas.com">Community</NavLink>
						<NavLink href="https://github.com/complexdatacollective">Github</NavLink>
					</nav>
					<Badge color="white" className="hidden sm:inline-flex">
						<span className="h-2 w-2 rounded-full bg-active" />v{appVersion}
					</Badge>
				</div>
			</header>

			<main className="flex-1 flex flex-col max-w-5xl mx-auto w-full px-8 pt-4">
				<div className="flex flex-col items-center text-center gap-6">
					<img src={headerGraphic} alt="Network Canvas Architect" className="h-24" />
					<div>
						<h2 className="hero mb-3">
							Welcome to <span className="text-action">Architect</span>
						</h2>
						<p className="lead max-w-md mx-auto">A tool for building Network Canvas interviews.</p>
					</div>
				</div>

				<LaunchPad />
			</main>
		</div>
	);
};

export default Home;
