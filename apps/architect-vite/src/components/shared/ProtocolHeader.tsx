import type { ReactNode } from "react";
import architectIcon from "~/images/landing/architect-icon.png";
import { appVersion } from "~/utils/appVersion";
import Badge from "./Badge";

type Props = {
	protocolName: string;
	subsection?: string;
	actions?: ReactNode;
	onLogoClick?: () => void;
};

export default function ProtocolHeader({ protocolName, subsection, actions, onLogoClick }: Props) {
	return (
		<header className="fixed left-0 right-0 top-0 z-30 flex items-center gap-4 px-6 py-3">
			<button
				type="button"
				aria-label="Architect home"
				onClick={onLogoClick}
				className="flex cursor-pointer items-center gap-3 rounded-full bg-white py-1.5 pl-1.5 pr-3"
				style={{ boxShadow: "0 4px 12px rgba(22,21,43,0.08)" }}
			>
				<img src={architectIcon} alt="" className="size-10 rounded-full" />
				<span className="font-heading text-base font-extrabold">Architect</span>
				<Badge color="hsl(168 100% 26%)">v{appVersion}</Badge>
			</button>

			<nav
				aria-label="Protocol breadcrumb"
				className="flex min-w-0 items-center gap-2 font-heading text-sm font-bold"
				style={{ color: "hsl(240 35% 17%)" }}
			>
				<span className="truncate max-w-[32ch]">{protocolName}</span>
				{subsection && (
					<>
						<span aria-hidden style={{ color: "hsl(220 4% 44%)" }}>
							▸
						</span>
						<span className="truncate max-w-[32ch]" style={{ color: "hsl(220 4% 44%)" }}>
							{subsection}
						</span>
					</>
				)}
			</nav>

			{actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
		</header>
	);
}
