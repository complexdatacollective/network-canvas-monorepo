import { useLocation } from "wouter";

type SubRoute = "assets" | "codebook" | "summary" | "experiments";

const ROUTES: Record<SubRoute, { label: string; path: string }> = {
	assets: { label: "Assets", path: "/protocol/assets" },
	codebook: { label: "Codebook", path: "/protocol/codebook" },
	summary: { label: "Summary", path: "/protocol/summary" },
	experiments: { label: "Experiments", path: "/protocol/experiments" },
};

const SUB_ROUTES: SubRoute[] = ["assets", "codebook", "summary", "experiments"];

type Props = {
	active: SubRoute;
};

export default function SubRouteNav({ active }: Props) {
	const [, navigate] = useLocation();
	return (
		<nav className="flex items-center gap-1" aria-label="Protocol sections">
			{SUB_ROUTES.map((key) => {
				const { label, path } = ROUTES[key];
				const isActive = key === active;
				return (
					<button
						key={key}
						type="button"
						onClick={() => navigate(path)}
						className="cursor-pointer rounded-full px-3 py-1.5 font-heading text-[11px] font-bold uppercase tracking-[0.15em]"
						style={{
							color: isActive ? "hsl(240 35% 17%)" : "hsl(220 4% 44%)",
							background: isActive ? "#ffffff" : "transparent",
							boxShadow: isActive ? "0 2px 8px rgba(22,21,43,0.08)" : "none",
						}}
					>
						{label}
					</button>
				);
			})}
		</nav>
	);
}
