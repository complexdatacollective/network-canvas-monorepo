import { FilePlus, FolderOpen } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import NewProtocolDialog from "~/components/NewProtocolDialog";
import { SAMPLE_PROTOCOL_URL } from "~/config";
import { useAppDispatch } from "~/ducks/hooks";
import { createNetcanvas, openLocalNetcanvas, openRemoteNetcanvas } from "~/ducks/modules/userActions/userActions";
import architectIcon from "~/images/Arc-Flat.svg";
import Button from "~/lib/legacy-ui/components/Button";
import { appVersion } from "~/utils/appVersion";
import Badge from "../Badge";
import ProtocolLoadingOverlay from "./ProtocolLoadingOverlay";
import TransitMap from "./TransitMap";
import { TIMELINE_SCRIPT } from "./timelineScript";

type NavLinkProps = {
	href: string;
	children: React.ReactNode;
};

const NavLink = ({ href, children }: NavLinkProps) => (
	<a
		href={href}
		target="_blank"
		rel="noopener noreferrer"
		className="small-heading hover:text-primary underline decoration-2 underline-offset-8 decoration-transparent hover:decoration-(--color-action) transition-all"
	>
		{children}
	</a>
);

const Home = () => {
	const dispatch = useAppDispatch();
	const [isLoading, setIsLoading] = useState(false);
	const [showNewDialog, setShowNewDialog] = useState(false);
	const [visibleCount, setVisibleCount] = useState(3);

	useEffect(() => {
		const id = setInterval(() => setVisibleCount((c) => c + 1), 2400);
		return () => clearInterval(id);
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

	const onDrop = (files: File[]) => {
		const file = files[0];
		if (file) {
			void runAction(async () => {
				await dispatch(openLocalNetcanvas(file));
			});
		}
	};

	const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
		onDrop,
		accept: { "application/octet-stream": [".netcanvas"] },
		multiple: false,
		noClick: true,
		noKeyboard: true,
	});

	const handleOpenSample = () => {
		void runAction(async () => {
			await dispatch(openRemoteNetcanvas(SAMPLE_PROTOCOL_URL));
		});
	};

	return (
		<>
			<ProtocolLoadingOverlay open={isLoading} />
			<NewProtocolDialog open={showNewDialog} onOpenChange={setShowNewDialog} onSubmit={handleCreate} />

			<div {...getRootProps()} className="relative flex flex-col h-dvh overflow-y-auto">
				<input {...getInputProps()} />

				{isDragActive && (
					<div className="pointer-events-none fixed inset-3 z-50 rounded-2xl border-4 border-dashed border-action bg-action/10" />
				)}

				<header className="flex justify-between items-center gap-4 sm:gap-8 max-w-6xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-8">
					<div className="flex items-center gap-3 sm:gap-4 pl-2 sm:pl-3 pr-4 sm:pr-8 py-2 bg-surface-1 rounded-full shadow-sm">
						<img src={architectIcon} alt="Architect" className="h-10 w-10 sm:h-14 sm:w-14" />
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

				<main className="flex-1 flex flex-col max-w-5xl mx-auto w-full px-8 pb-8 gap-8">
					<div className="flex flex-col md:flex-row gap-8 w-full items-start">
						<div aria-hidden className="hidden md:block md:w-1/2 h-screen shrink-0 pointer-events-none">
							<TransitMap stops={TIMELINE_SCRIPT} count={visibleCount} />
						</div>

						<div className="flex-1 flex flex-col gap-6 text-left items-start pt-16">
							<div>
								<h2 className="hero mb-3">
									Welcome to <span className="text-action">Architect</span>
								</h2>
								<p className="lead max-w-xl">
									Architect is the protocol designer for Network Canvas. Compose name generators, capture ordinal and
									categorical data, map connections, and explore narratives.
								</p>
							</div>

							<div className="flex flex-wrap gap-3">
								<Button size="large" color="sea-green" onClick={() => setShowNewDialog(true)}>
									<FilePlus />
									Create a new protocol
								</Button>
								<Button size="large" color="slate-blue" onClick={open}>
									<FolderOpen />
									Open existing protocol
								</Button>
							</div>

							<p className="text-sm">
								First time?{" "}
								<button type="button" onClick={handleOpenSample} className="action-link">
									Explore a sample protocol
								</button>
							</p>
						</div>
					</div>

					{/* <DevTools /> */}
				</main>
			</div>
		</>
	);
};

export default Home;
