import { cva, type VariantProps } from "class-variance-authority";
import headerGraphic from "~/images/Arc-Flat.svg";
import networkCanvasLogo from "~/images/NC-Mark.svg";
import { appVersion } from "~/utils/appVersion";
import { cn } from "~/utils/cn";
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
		className="uppercase hover:text-primary underline decoration-2 underline-offset-8 decoration-transparent hover:decoration-action transition-all"
	>
		{children}
	</a>
);

const headerPillVariants = cva("flex items-center bg-surface-1 rounded-full shadow-sm", {
	variants: {
		size: {
			md: "gap-3 sm:gap-4 px-4 sm:px-8 py-2 text-sm sm:text-base",
			sm: "gap-2 px-4 py-1 text-xs",
		},
	},
	defaultVariants: {
		size: "md",
	},
});

type HeaderPillProps = {
	className?: string;
	children: React.ReactNode;
} & VariantProps<typeof headerPillVariants>;

const HeaderPill = ({ size, className, children }: HeaderPillProps) => (
	<div className={cn(headerPillVariants({ size }), className)}>{children}</div>
);

const Home = () => {
	return (
		<div className="relative flex flex-col h-dvh">
			<div className="overflow-y-auto flex flex-col">
				<div className="flex justify-between items-center gap-4 sm:gap-8 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 text-foreground">
					<HeaderPill className="pl-2 sm:pl-3">
						<img src={networkCanvasLogo} alt="Network Canvas" className="h-10 w-10 sm:h-14 sm:w-14" />
						<span className="font-bold text-base sm:text-lg">Architect</span>
						<Badge color="sea-green">WEB</Badge>
					</HeaderPill>
					<div className="flex items-center gap-6 lg:gap-12">
						<nav className="hidden md:flex items-center gap-6 lg:gap-10 text-base font-semibold tracking-widest">
							<NavLink href="https://documentation.networkcanvas.com">Docs</NavLink>
							<NavLink href="https://community.networkcanvas.com">Community</NavLink>
							<NavLink href="https://github.com/complexdatacollective">Github</NavLink>
						</nav>
						<HeaderPill size="sm" className="hidden sm:flex font-semibold">
							<span className="h-2 w-2 rounded-full bg-active" />
							<span>v{appVersion}</span>
						</HeaderPill>
					</div>
				</div>

				<div className="flex-1 flex flex-col items-center px-8 pt-4">
					<div className="w-full max-w-5xl flex-1 flex flex-col">
						<div className="flex flex-col items-center text-center gap-6">
							<img src={headerGraphic} alt="Network Canvas Architect" className="h-24" />
							<div>
								<h2 className="text-6xl font-bold tracking-tight mb-3">
									Welcome to <span className="text-action">Architect</span>
								</h2>
								<p className="text-lg text-foreground/60 max-w-md mx-auto">
									A tool for building Network Canvas interviews.
								</p>
							</div>
						</div>

						<LaunchPad />
					</div>
				</div>
			</div>
		</div>
	);
};

export default Home;
