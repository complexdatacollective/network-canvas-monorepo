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
			md: "gap-4 px-8 py-2 text-base",
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
				<div className="flex justify-between items-center gap-8 w-full max-w-6xl mx-auto px-6 py-8 text-foreground">
					<HeaderPill className="pl-3">
						<img src={networkCanvasLogo} alt="Network Canvas" className="h-14 w-14" />
						<span className="font-bold text-lg">Architect</span>
						<Badge color="sea-green">WEB</Badge>
					</HeaderPill>
					<div className="flex items-center gap-12">
						<nav className="flex items-center gap-10 text-base font-semibold tracking-widest">
							<NavLink href="https://documentation.networkcanvas.com">Docs</NavLink>
							<NavLink href="https://community.networkcanvas.com">Community</NavLink>
							<NavLink href="https://github.com/complexdatacollective">Github</NavLink>
						</nav>
						<HeaderPill size="sm" className="font-semibold">
							<span className="h-2 w-2 rounded-full bg-active" />
							<span>v{appVersion}</span>
						</HeaderPill>
					</div>
				</div>

				<div className="flex-1 flex flex-col items-center px-8 pt-12">
					<div className="w-full max-w-5xl flex-1 flex flex-col">
						<div className="flex md:flex-row flex-col items-center justify-center gap-8">
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
		</div>
	);
};

export default Home;
