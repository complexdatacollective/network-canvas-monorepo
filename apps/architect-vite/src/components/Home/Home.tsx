import { useCallback, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useLocation } from "wouter";
import NewProtocolDialog from "~/components/NewProtocolDialog";
import { DEVELOPMENT_PROTOCOL_URL, SAMPLE_PROTOCOL_URL } from "~/config";
import { useAppDispatch, useAppSelector } from "~/ducks/hooks";
import { type StoredProtocol, selectRecentProtocols } from "~/ducks/modules/protocols";
import { createNetcanvas, openLocalNetcanvas, openRemoteNetcanvas } from "~/ducks/modules/userActions/userActions";
import architectIcon from "~/images/landing/architect-icon.png";
import fileIcon from "~/images/landing/file-icon.svg";
import { appVersion } from "~/utils/appVersion";
import ProtocolLoadingOverlay from "./ProtocolLoadingOverlay";
import TransitMap from "./TransitMap";
import { TIMELINE_SCRIPT } from "./timelineScript";

type Template = {
	id: string;
	name: string;
	description: string;
	stages: number;
	url: string;
	color: string;
};

const BASE_TEMPLATES: Template[] = [
	{
		id: "sample",
		name: "Sample Protocol",
		description: "A guided tour of Network Canvas interview stages",
		stages: 11,
		url: SAMPLE_PROTOCOL_URL,
		color: "hsl(342 77% 51%)",
	},
];

const DEV_TEMPLATES: Template[] = [
	{
		id: "development",
		name: "Development Protocol",
		description: "Kitchen-sink protocol used to exercise every feature",
		stages: 14,
		url: DEVELOPMENT_PROTOCOL_URL,
		color: "hsl(237 79% 67%)",
	},
];

function formatRelative(ts: number): string {
	const diffMs = Date.now() - ts;
	const min = Math.round(diffMs / 60000);
	if (min < 1) return "Just now";
	if (min < 60) return min === 1 ? "1 minute ago" : `${min} minutes ago`;
	const hr = Math.round(min / 60);
	if (hr < 24) return hr === 1 ? "1 hour ago" : `${hr} hours ago`;
	const day = Math.round(hr / 24);
	if (day === 1) return "Yesterday";
	if (day < 7) return `${day} days ago`;
	return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const Home = () => {
	const dispatch = useAppDispatch();
	const [, navigate] = useLocation();
	const recents = useAppSelector(selectRecentProtocols(6));

	const [visibleCount, setVisibleCount] = useState(3);
	const [isLoading, setIsLoading] = useState(false);
	const [showNewDialog, setShowNewDialog] = useState(false);
	const [toast, setToast] = useState<string | null>(null);
	const [ledgerMode, setLedgerMode] = useState<"recent" | "templates">("recent");

	const templates = [...BASE_TEMPLATES, ...(import.meta.env.DEV ? DEV_TEMPLATES : [])];

	const popToast = useCallback((msg: string) => {
		setToast(msg);
		setTimeout(() => setToast(null), 2400);
	}, []);

	useEffect(() => {
		const t = setInterval(() => setVisibleCount((c) => c + 1), 2400);
		return () => clearInterval(t);
	}, []);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (!(e.metaKey || e.ctrlKey)) return;
			if (e.key === "n" || e.key === "N") {
				e.preventDefault();
				setShowNewDialog(true);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	const runAction = useCallback(async (action: () => Promise<unknown>) => {
		setIsLoading(true);
		try {
			await action();
		} finally {
			setIsLoading(false);
		}
	}, []);

	const handleCreate = useCallback(
		(values: { name: string; description?: string }) => {
			setShowNewDialog(false);
			void runAction(async () => {
				await dispatch(createNetcanvas(values));
			});
		},
		[dispatch, runAction],
	);

	const handleOpenFile = useCallback(
		(file: File) => {
			void runAction(async () => {
				await dispatch(openLocalNetcanvas(file));
			});
		},
		[dispatch, runAction],
	);

	const handleOpenTemplate = useCallback(
		(url: string) => {
			void runAction(async () => {
				await dispatch(openRemoteNetcanvas(url));
			});
		},
		[dispatch, runAction],
	);

	const handleOpenRecent = useCallback(
		(protocol: StoredProtocol) => {
			navigate(`/protocol/${protocol.id}`);
		},
		[navigate],
	);

	const {
		getRootProps,
		getInputProps,
		isDragActive,
		open: openFileDialog,
	} = useDropzone({
		onDrop: (files) => {
			const file = files[0];
			if (file) {
				popToast(`Opening ${file.name}`);
				handleOpenFile(file);
			}
		},
		accept: { "application/octet-stream": [".netcanvas"] },
		multiple: false,
		noClick: true,
		noKeyboard: true,
	});

	return (
		<>
			<ProtocolLoadingOverlay open={isLoading} />

			<div
				{...getRootProps({
					className: "w-full h-dvh",
				})}
			>
				<input {...getInputProps()} />

				{/* Drag overlay state */}
				{isDragActive && (
					<div
						className="pointer-events-none fixed inset-3 z-40 rounded-3xl border-[3px] border-dashed sm:inset-6"
						style={{
							borderColor: "hsl(168 100% 39%)",
							background: "rgba(0,201,162,0.10)",
						}}
					/>
				)}

				<div className="relative mx-auto flex px-4 max-w-7xl">
					{/* Top bar */}
					<header className="absolute left-4 right-4 top-4 z-10 flex items-center sm:left-8 sm:right-8 sm:top-6 xl:left-12 xl:right-12 xl:top-7 2xl:left-14 2xl:right-14 2xl:top-9 min-[1920px]:left-16 min-[1920px]:right-16 min-[1920px]:top-11">
						<div
							className="flex items-center gap-2.5 rounded-full bg-white/50 py-1.5 pl-1.5 pr-3 sm:gap-3.5 sm:py-2 sm:pl-2 sm:pr-4.5 2xl:gap-4 2xl:py-2.5 2xl:pr-5 min-[1920px]:gap-5 min-[1920px]:pr-6"
							style={{ boxShadow: "0 4px 12px rgba(22,21,43,0.08)" }}
						>
							<img src={architectIcon} alt="" className="size-12 rounded-full" />
							<div className="font-heading text-base font-extrabold sm:text-lg 2xl:text-xl min-[1920px]:text-[22px]">
								Architect
							</div>
							<span
								className="hidden rounded-full px-2 py-[3px] text-[10px] font-bold uppercase tracking-[0.15em] sm:inline 2xl:px-2.5 2xl:text-[11px] min-[1920px]:text-[12px]"
								style={{ background: "rgba(0,201,162,0.18)", color: "hsl(168 100% 26%)" }}
							>
								web
							</span>
						</div>

						<nav className="ml-auto hidden items-center gap-4 font-heading text-xs font-bold uppercase tracking-[0.15em] md:flex lg:gap-6 2xl:gap-7 2xl:text-[13px] min-[1920px]:gap-8 min-[1920px]:text-[14px]">
							<a
								href="https://documentation.networkcanvas.com"
								target="_blank"
								rel="noreferrer"
								className="hover:opacity-70"
							>
								Docs
							</a>
							<a
								href="https://community.networkcanvas.com"
								target="_blank"
								rel="noreferrer"
								className="hover:opacity-70"
							>
								Community
							</a>
							<a
								href="https://github.com/complexdatacollective"
								target="_blank"
								rel="noreferrer"
								className="hover:opacity-70"
							>
								GitHub
							</a>
							<div
								className="hidden items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[10.5px] normal-case tracking-normal lg:flex 2xl:px-3.5 2xl:py-2 2xl:text-[11.5px] min-[1920px]:text-[12.5px]"
								style={{ boxShadow: "0 2px 8px rgba(22,21,43,0.08)" }}
							>
								<span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "hsl(168 100% 39%)" }} />v
								{appVersion} · What's new
							</div>
						</nav>
					</header>
				</div>

				<div className="mx-auto px-6 flex h-full z-10 justify-center items-center">
					{/* Transit-map timeline on the left */}
					<div className="grow-0 shrink h-full">
						<TransitMap stops={TIMELINE_SCRIPT} count={visibleCount} />
					</div>

					{/* Right panel — content */}
					<section className="flex shrink-0 w-full flex-col gap-6 h-full pt-40 pb-6 max-w-xl">
						<div>
							<h1 className="mx-0 mb-4 mt-3.5 text-8xl font-extrabold leading-[0.90] tracking-[-0.028em]">
								Networks,
								<br />
								<span className="text-neon-coral">one stage</span>
								<br />
								at a time.
							</h1>
							<p className="m-0 text-xl leading-[1.55]" style={{ color: "hsl(240 17% 35%)" }}>
								Architect is the protocol designer for Network Canvas. Compose name generators, capture ordinal and
								categorical data, map connections and explore narratives.
							</p>
						</div>

						{/* CTAs */}
						<div className="flex flex-col flex-wrap items-stretch gap-3 sm:flex-row sm:items-center">
							<button
								type="button"
								onClick={() => setShowNewDialog(true)}
								className="inline-flex cursor-pointer items-center justify-center gap-2.5 rounded-full px-7 py-4 font-heading text-[12.5px] font-bold uppercase tracking-[0.15em] text-white 2xl:gap-3 2xl:px-8 2xl:py-[18px] 2xl:text-[13.5px] min-[1920px]:px-9 min-[1920px]:py-5 min-[1920px]:text-[14.5px]"
								style={{ background: "hsl(168 100% 39%)", boxShadow: "0 4px 0 hsl(168 100% 26%)" }}
							>
								<svg
									className="h-[15px] w-[15px] 2xl:h-4 2xl:w-4 min-[1920px]:h-[18px] min-[1920px]:w-[18px]"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2.5"
									strokeLinecap="round"
									aria-hidden
								>
									<title>Plus</title>
									<path d="M12 5v14M5 12h14" />
								</svg>
								Create a new protocol
							</button>
							<button
								type="button"
								onClick={openFileDialog}
								className="cursor-pointer rounded-full bg-white px-6 py-[15px] font-heading text-[12.5px] font-bold uppercase tracking-[0.15em] 2xl:px-7 2xl:py-[17px] 2xl:text-[13.5px] min-[1920px]:px-8 min-[1920px]:py-[19px] min-[1920px]:text-[14.5px]"
								style={{ boxShadow: "0 2px 8px rgba(22,21,43,0.08)", color: "hsl(240 35% 17%)" }}
							>
								Open from disk
							</button>
						</div>

						{/* Drop card */}
						<div
							className="flex items-center gap-3.5 rounded bg-white/40 px-4 py-3.5 sm:px-5 sm:py-4 2xl:gap-4 2xl:px-6 2xl:py-5 min-[1920px]:gap-5 min-[1920px]:px-7 min-[1920px]:py-6"
							style={{ boxShadow: "0 4px 12px rgba(22,21,43,0.06)" }}
						>
							<div
								className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl 2xl:h-12 2xl:w-12 2xl:rounded-2xl min-[1920px]:h-[52px] min-[1920px]:w-[52px]"
								style={{ background: "rgba(107,114,236,0.18)" }}
							>
								<img
									src={fileIcon}
									alt=""
									className="h-6 w-6 2xl:h-[26px] 2xl:w-[26px] min-[1920px]:h-7 min-[1920px]:w-7"
								/>
							</div>
							<div className="min-w-0 flex-1">
								<div className="font-heading text-[13.5px] font-extrabold 2xl:text-[15px] min-[1920px]:text-[16px]">
									Drop a .netcanvas file anywhere on the page
								</div>
								<div
									className="text-[11.5px] 2xl:text-[12.5px] min-[1920px]:text-[13.5px]"
									style={{ color: "hsl(220 4% 44%)" }}
								>
									Works fully offline — your file never leaves the browser.
								</div>
							</div>
							<span className="hidden sm:inline">
								<Kbd>⌘O</Kbd>
							</span>
						</div>

						{/* Recents / Templates ledger */}
						<Ledger
							mode={ledgerMode}
							onModeChange={setLedgerMode}
							recents={recents}
							templates={templates}
							onOpenRecent={handleOpenRecent}
							onOpenTemplate={(t) => {
								popToast(`Creating from template: ${t.name}`);
								handleOpenTemplate(t.url);
							}}
						/>
					</section>
				</div>

				{toast && (
					<div
						className="fixed bottom-4 left-4 right-4 z-50 rounded-xl px-4 py-3 text-center text-[13px] font-bold text-white sm:left-auto sm:right-7 sm:bottom-7 sm:text-left"
						style={{
							background: "hsl(240 35% 17%)",
							boxShadow: "0 12px 32px rgba(31,27,58,0.25)",
							animation: "nc-toast-in 200ms cubic-bezier(0.34, 1.56, 0.64, 1) both",
						}}
					>
						{toast}
					</div>
				)}
			</div>

			<NewProtocolDialog open={showNewDialog} onOpenChange={setShowNewDialog} onSubmit={handleCreate} />
		</>
	);
};

function Kbd({ children }: { children: React.ReactNode }) {
	return (
		<span
			className="inline-flex min-w-4 items-center justify-center rounded-[5px] border bg-white px-[7px] py-[2px] font-mono text-[11px] font-semibold"
			style={{ borderColor: "rgba(31,27,58,0.25)", color: "hsl(240 35% 17%)" }}
		>
			{children}
		</span>
	);
}

type LedgerProps = {
	mode: "recent" | "templates";
	onModeChange: (mode: "recent" | "templates") => void;
	recents: StoredProtocol[];
	templates: Template[];
	onOpenRecent: (protocol: StoredProtocol) => void;
	onOpenTemplate: (template: Template) => void;
};

function Ledger({ mode, onModeChange, recents, templates, onOpenRecent, onOpenTemplate }: LedgerProps) {
	return (
		<div
			className="flex min-h-[220px] flex-col overflow-hidden rounded bg-white/40 py-3.5 xl:min-h-0 xl:flex-1 2xl:py-4 min-[1920px]:py-5"
			style={{ boxShadow: "0 4px 12px rgba(22,21,43,0.06)" }}
		>
			<div className="flex items-center gap-1.5 px-3.5 pb-2.5 2xl:px-4 2xl:pb-3 min-[1920px]:px-5">
				{(["recent", "templates"] as const).map((k) => (
					<button
						type="button"
						key={k}
						onClick={() => onModeChange(k)}
						className="cursor-pointer rounded-full px-3 py-2 font-heading text-[11px] font-extrabold uppercase tracking-[0.2em] sm:px-3.5 sm:text-[12px] 2xl:px-4 2xl:py-2.5 2xl:text-[12.5px] min-[1920px]:px-4 min-[1920px]:text-[13.5px]"
						style={{
							color: mode === k ? "hsl(240 35% 17%)" : "hsl(220 4% 44%)",
							background: mode === k ? "#F3EFF6" : "transparent",
						}}
					>
						{k === "recent" ? "Recent" : "Templates"}
					</button>
				))}
				<span
					className="ml-auto font-mono text-[11px] 2xl:text-[12px] min-[1920px]:text-[13px]"
					style={{ color: "hsl(220 4% 44%)" }}
				>
					{mode === "recent"
						? recents.length === 1
							? "1 file"
							: `${recents.length} files`
						: templates.length === 1
							? "1 template"
							: `${templates.length} templates`}
				</span>
			</div>

			<div className="flex-1 overflow-auto">
				{mode === "recent" && recents.length === 0 && (
					<div
						className="px-5 py-6 text-center text-[12.5px] 2xl:py-7 2xl:text-[13.5px] min-[1920px]:py-8 min-[1920px]:text-[14.5px]"
						style={{ color: "hsl(220 4% 44%)" }}
					>
						Your recently opened protocols will appear here.
					</div>
				)}

				{mode === "recent" &&
					recents.slice(0, 5).map((r, i) => (
						<button
							type="button"
							key={r.id}
							onClick={() => onOpenRecent(r)}
							className="grid w-full cursor-pointer grid-cols-[28px_1fr_auto] items-center gap-3 px-5 py-2.5 text-left transition-[background] duration-150 hover:bg-[#F3EFF6] 2xl:gap-4 2xl:px-6 2xl:py-3 min-[1920px]:px-7 min-[1920px]:py-3.5"
						>
							<span
								className="font-mono text-[11px] 2xl:text-[12px] min-[1920px]:text-[13px]"
								style={{ color: "hsl(220 4% 44%)" }}
							>
								{String(i + 1).padStart(2, "0")}
							</span>
							<div className="min-w-0">
								<div className="truncate font-heading text-[13.5px] font-extrabold 2xl:text-[15px] min-[1920px]:text-[16px]">
									{r.name}
								</div>
								<div
									className="truncate font-mono text-[11px] 2xl:text-[12px] min-[1920px]:text-[13px]"
									style={{ color: "hsl(220 4% 44%)" }}
								>
									{r.description || "No description"}
								</div>
							</div>
							<div
								className="font-mono text-[11px] 2xl:text-[12px] min-[1920px]:text-[13px]"
								style={{ color: "hsl(220 4% 44%)" }}
							>
								{formatRelative(r.lastModified)}
							</div>
						</button>
					))}

				{mode === "templates" &&
					templates.map((t) => (
						<button
							type="button"
							key={t.id}
							onClick={() => onOpenTemplate(t)}
							className="grid w-full cursor-pointer grid-cols-[28px_1fr_auto] items-center gap-3 px-5 py-2.5 text-left transition-[background] duration-150 hover:bg-[#F3EFF6] 2xl:gap-4 2xl:px-6 2xl:py-3 min-[1920px]:px-7 min-[1920px]:py-3.5"
						>
							<div
								className="h-5 w-5 rounded-md 2xl:h-6 2xl:w-6 min-[1920px]:h-[26px] min-[1920px]:w-[26px]"
								style={{ background: t.color }}
							/>
							<div className="min-w-0">
								<div className="truncate font-heading text-[13.5px] font-extrabold 2xl:text-[15px] min-[1920px]:text-[16px]">
									{t.name}
								</div>
								<div
									className="truncate text-[11px] 2xl:text-[12px] min-[1920px]:text-[13px]"
									style={{ color: "hsl(220 4% 44%)" }}
								>
									{t.description}
								</div>
							</div>
							<div
								className="font-mono text-[11px] 2xl:text-[12px] min-[1920px]:text-[13px]"
								style={{ color: "hsl(220 4% 44%)" }}
							>
								{t.stages} stages
							</div>
						</button>
					))}
			</div>
		</div>
	);
}

export default Home;
