import { BookOpenText, FileImage, type LucideIcon, Printer, Redo, Timeline, Undo } from "lucide-react";
import { motion } from "motion/react";
import { useCallback } from "react";
import { useSelector } from "react-redux";
import { Link, useLocation } from "wouter";
import { useAppDispatch } from "~/ducks/hooks";
import { redo, undo } from "~/ducks/modules/activeProtocol";
import type { RootState } from "~/ducks/store";
import { IconButton } from "~/lib/legacy-ui/components/Button";
import { getCanRedo, getCanUndo, getProtocolName } from "~/selectors/protocol";
import { cn } from "~/utils/cn";
import ActionToolbar from "./ActionToolbar";
import Breadcrumb, { type BreadcrumbItem } from "./Breadcrumb";
import DownloadButton from "./DownloadButton";
import NavShell from "./NavShell";
import { PageActionsTarget } from "./PageActions";

type Tab = {
	href: string;
	label: string;
	Icon: LucideIcon;
};

const TABS: Tab[] = [
	{ href: "/protocol", label: "Stages", Icon: Timeline },
	{ href: "/protocol/assets", label: "Resources", Icon: FileImage },
	{ href: "/protocol/codebook", label: "Codebook", Icon: BookOpenText },
	{ href: "/protocol/summary", label: "Summary", Icon: Printer },
];

const ProjectNav = () => {
	const [location] = useLocation();
	const dispatch = useAppDispatch();
	const protocolName = useSelector(getProtocolName);
	const canUndo = useSelector((state: RootState) => getCanUndo(state));
	const canRedo = useSelector((state: RootState) => getCanRedo(state));

	const handleUndo = useCallback(() => dispatch(undo()), [dispatch]);
	const handleRedo = useCallback(() => dispatch(redo()), [dispatch]);

	// Summary is read-only: undo/redo would have no visible effect.
	const isSummary = location === "/protocol/summary";

	const breadcrumbItems: BreadcrumbItem[] = [{ label: protocolName ?? "Untitled protocol" }];

	const tabs = (
		<nav aria-label="Project sections" className="flex items-center gap-6 lg:gap-10">
			{TABS.map(({ href, label, Icon }) => {
				const isActive = location === href;
				return (
					<Link
						key={href}
						href={href}
						aria-current={isActive ? "page" : undefined}
						className={cn(
							"text-base font-semibold relative cursor-pointer no-underline text-white transition-colors leading-none",
							!isActive && "hover:text-action",
						)}
					>
						{isActive && (
							<motion.span
								layoutId="project-nav-active-outline"
								aria-hidden
								className="absolute -inset-x-4 -inset-y-2 rounded-full ring-2 ring-current/30"
								transition={{ type: "spring", stiffness: 500, damping: 40 }}
							/>
						)}
						<span className="relative inline-flex items-center gap-2">
							<Icon className="size-4 shrink-0" aria-hidden />
							{label}
						</span>
					</Link>
				);
			})}
		</nav>
	);

	return (
		<>
			<NavShell leading={<Breadcrumb items={breadcrumbItems} />} trailing={tabs} />
			<ActionToolbar>
				<PageActionsTarget />
				{!isSummary && (
					<>
						<IconButton
							variant="text"
							icon={<Undo />}
							onClick={handleUndo}
							disabled={!canUndo}
							aria-label="Undo"
							className="hover:bg-white/10"
						/>
						<IconButton
							variant="text"
							icon={<Redo />}
							onClick={handleRedo}
							disabled={!canRedo}
							aria-label="Redo"
							className="hover:bg-white/10"
						/>
					</>
				)}
				<DownloadButton />
			</ActionToolbar>
		</>
	);
};

export default ProjectNav;
