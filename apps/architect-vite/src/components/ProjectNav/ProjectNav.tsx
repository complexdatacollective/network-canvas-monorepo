import { BookOpenText, Check, Download, FileImage, type LucideIcon, Printer, Redo, Timeline, Undo } from "lucide-react";
import { motion } from "motion/react";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { Link, useLocation } from "wouter";
import Tooltip from "~/components/NewComponents/Tooltip";
import { useAppDispatch } from "~/ducks/hooks";
import { redo, undo } from "~/ducks/modules/activeProtocol";
import { actionCreators as dialogActions } from "~/ducks/modules/dialogs";
import { exportNetcanvas } from "~/ducks/modules/userActions/userActions";
import Button, { IconButton } from "~/lib/legacy-ui/components/Button";
import { getCanRedo, getCanUndo, getProtocolName } from "~/selectors/protocol";
import { cn } from "~/utils/cn";
import ActionToolbar from "./ActionToolbar";
import Breadcrumb, { type BreadcrumbItem } from "./Breadcrumb";
import NavShell from "./NavShell";

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

type ProjectNavProps = {
	extraActions?: React.ReactNode;
};

const ProjectNav = ({ extraActions }: ProjectNavProps) => {
	const [location] = useLocation();
	const dispatch = useAppDispatch();
	const protocolName = useSelector(getProtocolName);
	const canUndo = useSelector(getCanUndo);
	const canRedo = useSelector(getCanRedo);

	const [isExporting, setIsExporting] = useState(false);
	const [downloadSuccess, setDownloadSuccess] = useState(false);

	const handleUndo = useCallback(() => dispatch(undo()), [dispatch]);
	const handleRedo = useCallback(() => dispatch(redo()), [dispatch]);

	const handleDownload = useCallback(async () => {
		try {
			setIsExporting(true);
			await dispatch(exportNetcanvas()).unwrap();
			setDownloadSuccess(true);
		} catch (error) {
			dispatch(
				dialogActions.openDialog({
					type: "Error",
					title: "Failed to export protocol",
					message: error instanceof Error ? error.message : String(error),
				}),
			);
		} finally {
			setIsExporting(false);
		}
	}, [dispatch]);

	useEffect(() => {
		if (!downloadSuccess) return;
		const timer = setTimeout(() => setDownloadSuccess(false), 2000);
		return () => clearTimeout(timer);
	}, [downloadSuccess]);

	// Summary is read-only: undo/redo would have no visible effect.
	const isSummary = location === "/protocol/summary";

	const breadcrumbItems: BreadcrumbItem[] = [{ label: protocolName ?? "Untitled protocol" }];

	const tabs = (
		<nav aria-label="Project sections" className="flex items-center gap-(--space-lg) lg:gap-(--space-xl)">
			{TABS.map(({ href, label, Icon }) => {
				const isActive = location === href;
				return (
					<Link
						key={href}
						href={href}
						aria-current={isActive ? "page" : undefined}
						className={cn(
							"text-base font-semibold relative cursor-pointer no-underline text-current transition-colors leading-none",
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
				{extraActions}
				{!isSummary && (
					<>
						<IconButton
							variant="text"
							icon={<Undo />}
							onClick={handleUndo}
							disabled={!canUndo}
							aria-label="Undo"
							className="hover:bg-current/10"
						/>
						<IconButton
							variant="text"
							icon={<Redo />}
							onClick={handleRedo}
							disabled={!canRedo}
							aria-label="Redo"
							className="hover:bg-current/10"
						/>
					</>
				)}
				<Tooltip content="Download .netcanvas protocol">
					<Button
						onClick={handleDownload}
						color="sea-green"
						content={downloadSuccess ? "Downloaded" : isExporting ? "Downloading..." : "Download"}
						disabled={isExporting}
						icon={downloadSuccess ? <Check /> : <Download />}
					/>
				</Tooltip>
			</ActionToolbar>
		</>
	);
};

export default ProjectNav;
