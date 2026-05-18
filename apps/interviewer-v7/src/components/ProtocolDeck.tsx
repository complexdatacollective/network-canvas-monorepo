import Button, { IconButton } from "@codaco/fresco-ui/Button";
import TimeAgo from "@codaco/fresco-ui/TimeAgo";
import Heading from "@codaco/fresco-ui/typography/Heading";
import { cva } from "@codaco/fresco-ui/utils/cva";
import { ChevronLeft, ChevronRight, Play, Plus } from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { NewSessionDialog } from "~/components/NewSessionDialog";
import type { ProtocolWithCounts, StoredSession } from "~/lib/db/types";

// Beyond MAX_VISIBLE, the fanned stack stops adding visible cards.
const MAX_VISIBLE = 5;
// Fan-out tuning. Offsets are percentages of the card's own size so the
// fanned stack adapts when the deck container resizes (transform percentages
// resolve against the transformed element's box). Original tuning at
// 360×470 cards: 240px horizontal ≈ 66% width, 22px drop ≈ 4.7% height,
// 10px hover peek ≈ 2.1% height.
const FAN_OFFSET_PCT = 66;
const FAN_DROP_PCT = 4.7;
const FAN_PEEK_PCT = 2.1;
const FAN_ROTATE = 5;
const FAN_SCALE_STEP = 0.07;
// Per-accent class bundle: cover gradient + ring-on-active. Indexed by the
// same hash function so Tailwind can statically scan every variant. Tailwind
// can't synthesise an arbitrary colour from a runtime string, so each accent
// gets its own pre-baked class set rather than a single class with a CSS var.
const ACCENT_CLASSES = [
	{
		cover:
			"bg-[linear-gradient(140deg,var(--color-cerulean-blue),color-mix(in_srgb,var(--color-cerulean-blue)_50%,black))]",
		ring: "shadow-[0_30px_60px_oklch(0.10_0.05_281/0.7),0_0_0_2px_var(--color-cerulean-blue)]",
	},
	{
		cover:
			"bg-[linear-gradient(140deg,var(--color-paradise-pink),color-mix(in_srgb,var(--color-paradise-pink)_50%,black))]",
		ring: "shadow-[0_30px_60px_oklch(0.10_0.05_281/0.7),0_0_0_2px_var(--color-paradise-pink)]",
	},
	{
		cover: "bg-[linear-gradient(140deg,var(--color-mustard),color-mix(in_srgb,var(--color-mustard)_50%,black))]",
		ring: "shadow-[0_30px_60px_oklch(0.10_0.05_281/0.7),0_0_0_2px_var(--color-mustard)]",
	},
	{
		cover:
			"bg-[linear-gradient(140deg,var(--color-neon-carrot),color-mix(in_srgb,var(--color-neon-carrot)_50%,black))]",
		ring: "shadow-[0_30px_60px_oklch(0.10_0.05_281/0.7),0_0_0_2px_var(--color-neon-carrot)]",
	},
	{
		cover: "bg-[linear-gradient(140deg,var(--color-kiwi),color-mix(in_srgb,var(--color-kiwi)_50%,black))]",
		ring: "shadow-[0_30px_60px_oklch(0.10_0.05_281/0.7),0_0_0_2px_var(--color-kiwi)]",
	},
	{
		cover:
			"bg-[linear-gradient(140deg,var(--color-purple-pizazz),color-mix(in_srgb,var(--color-purple-pizazz)_50%,black))]",
		ring: "shadow-[0_30px_60px_oklch(0.10_0.05_281/0.7),0_0_0_2px_var(--color-purple-pizazz)]",
	},
	{
		cover:
			"bg-[linear-gradient(140deg,var(--color-sea-serpent),color-mix(in_srgb,var(--color-sea-serpent)_50%,black))]",
		ring: "shadow-[0_30px_60px_oklch(0.10_0.05_281/0.7),0_0_0_2px_var(--color-sea-serpent)]",
	},
];
const INACTIVE_SHADOW = "shadow-[0_20px_40px_oklch(0.10_0.05_281/0.5)]";
const EASE = [0.22, 1, 0.36, 1] as const;

type DeckEntry = { kind: "protocol"; protocol: ProtocolWithCounts } | { kind: "import" };

type ProtocolDeckProps = {
	protocols: ProtocolWithCounts[];
	sessions: StoredSession[];
	onImport: () => void;
	onSessionCreated: (sessionId: string) => void;
};

const cardBase = cva({
	base: [
		"absolute top-0 left-1/2 cursor-pointer rounded-[3rem] text-left",
		"focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sea-green",
	].join(" "),
});

// Card dimensions scale with the deck container's available height.
// Width derives from the original 360:470 aspect ratio. `h-[88%]` leaves room
// at the bottom of the section for the fanned cards' y-translate (max abs is 3,
// max drop ≈ 3 × 4.7% = 14.1% of the card's own height), so even the
// furthest-out cards stay within the cards area.
const CARD_SIZE_CLASS = "h-[88%] aspect-[36/47] origin-[center_bottom]";

const importCardClass = cva({
	base: [
		"flex flex-col items-center justify-center gap-3 border-[3px] border-dashed border-outline bg-background",
		CARD_SIZE_CLASS,
		"text-text/80",
	].join(" "),
});

const protocolCardClass = cva({
	base: [CARD_SIZE_CLASS, "overflow-hidden border-0 bg-surface-1 p-0 text-text"].join(" "),
});

// `size="lg"` resolves to h-16 = 4 × --theme-root-size; in the interview
// theme that's ~72px on tablet/desktop. The lucide override forces the
// chevron to 32px regardless of Button's proportional icon sizing.
const CHEVRON_BUTTON_CLASS =
	"border-outline bg-surface/85 backdrop-blur-md shadow-md disabled:opacity-40 [&>.lucide]:!size-8";

function pickAccentIndex(hash: string): number {
	let total = 0;
	for (let i = 0; i < hash.length; i += 1) total = (total + hash.charCodeAt(i)) % ACCENT_CLASSES.length;
	return total;
}

export function ProtocolDeck({ protocols, sessions, onImport, onSessionCreated }: ProtocolDeckProps) {
	const [activeIdx, setActiveIdx] = useState(0);
	const [pendingProtocolHash, setPendingProtocolHash] = useState<string | null>(null);

	const visibleProtocols = useMemo(() => protocols.slice(0, MAX_VISIBLE), [protocols]);

	const deck = useMemo<DeckEntry[]>(() => {
		const entries: DeckEntry[] = visibleProtocols.map((p) => ({ kind: "protocol", protocol: p }));
		entries.push({ kind: "import" });
		return entries;
	}, [visibleProtocols]);

	// Clamp the active index when the deck shrinks (e.g., protocol deleted elsewhere).
	useEffect(() => {
		setActiveIdx((idx) => Math.min(idx, Math.max(deck.length - 1, 0)));
	}, [deck.length]);

	const startInterview = useCallback((hash: string) => {
		setPendingProtocolHash(hash);
	}, []);

	const handleActivate = useCallback(
		(idx: number) => {
			if (idx !== activeIdx) {
				setActiveIdx(idx);
				return;
			}
			const entry = deck[idx];
			if (!entry) return;
			if (entry.kind === "import") {
				onImport();
				return;
			}
			startInterview(entry.protocol.hash);
		},
		[activeIdx, deck, onImport, startInterview],
	);

	// Global ←/→/Enter cycle the deck — the deck is the primary affordance on
	// Home, so page-wide keys feel natural. The dialog overlay swallows keys when
	// open because the NewSessionDialog mounts a focus-trapped surface above.
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (pendingProtocolHash) return;
			const target = event.target;
			if (target instanceof HTMLElement) {
				const tag = target.tagName;
				if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) return;
			}
			if (event.key === "ArrowLeft") {
				event.preventDefault();
				setActiveIdx((idx) => Math.max(0, idx - 1));
				return;
			}
			if (event.key === "ArrowRight") {
				event.preventDefault();
				setActiveIdx((idx) => Math.min(deck.length - 1, idx + 1));
				return;
			}
			if (event.key === "Enter") {
				event.preventDefault();
				handleActivate(activeIdx);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [activeIdx, deck.length, handleActivate, pendingProtocolHash]);

	const atStart = activeIdx === 0;
	const atEnd = activeIdx === deck.length - 1;

	return (
		<>
			<motion.div
				initial={{ opacity: 0, y: 36, scale: 0.97 }}
				animate={{ opacity: 1, y: 0, scale: 1 }}
				transition={{ duration: 0.75, delay: 0.65, ease: EASE }}
				className="flex min-h-0 w-full flex-1 flex-col gap-8 [perspective:1800px]"
			>
				<section aria-label="Protocol deck" className="relative w-full min-h-0 flex-1">
					{deck.map((entry, i) => {
						const offset = i - activeIdx;
						const abs = Math.abs(offset);
						if (abs > 3) return null;
						const isActive = offset === 0;
						return (
							<DeckCard
								key={entry.kind === "import" ? "import" : entry.protocol.hash}
								entry={entry}
								offset={offset}
								isActive={isActive}
								sessions={sessions}
								onTap={() => handleActivate(i)}
							/>
						);
					})}
				</section>

				{deck.length > 1 ? (
					<motion.div
						initial={{ opacity: 0, y: 16 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.55, delay: 1.05, ease: EASE }}
						className="z-[6] flex shrink-0 items-center justify-center gap-7"
					>
						<motion.span
							whileHover={{ scale: 1.06 }}
							whileTap={{ scale: 0.92 }}
							transition={{ duration: 0.2 }}
							className="inline-flex"
						>
							<IconButton
								size="xl"
								variant="text"
								icon={<ChevronLeft strokeWidth={2.8} aria-hidden />}
								aria-label="Previous protocol"
								onClick={() => setActiveIdx((i) => Math.max(0, i - 1))}
								disabled={atStart}
								className={CHEVRON_BUTTON_CLASS}
							/>
						</motion.span>
						<div className="flex items-center gap-2.5">
							{deck.map((entry, i) => (
								<button
									key={entry.kind === "import" ? "import" : entry.protocol.hash}
									type="button"
									onClick={() => setActiveIdx(i)}
									aria-label={`Go to card ${i + 1}`}
									aria-current={i === activeIdx ? "true" : undefined}
									className={`h-3 cursor-pointer rounded-full border-0 p-0 transition-all duration-200 ${
										i === activeIdx ? "w-9 bg-sea-green" : "w-3 bg-surface-2"
									}`}
								/>
							))}
						</div>
						<motion.span
							whileHover={{ scale: 1.06 }}
							whileTap={{ scale: 0.92 }}
							transition={{ duration: 0.2 }}
							className="inline-flex"
						>
							<IconButton
								size="xl"
								variant="text"
								icon={<ChevronRight strokeWidth={2.8} aria-hidden />}
								aria-label="Next protocol"
								onClick={() => setActiveIdx((i) => Math.min(deck.length - 1, i + 1))}
								disabled={atEnd}
								className={CHEVRON_BUTTON_CLASS}
							/>
						</motion.span>
					</motion.div>
				) : null}
			</motion.div>

			{pendingProtocolHash ? (
				<NewSessionDialog
					open
					protocolHash={pendingProtocolHash}
					onClose={() => setPendingProtocolHash(null)}
					onCreated={(session) => {
						setPendingProtocolHash(null);
						onSessionCreated(session.id);
					}}
				/>
			) : null}
		</>
	);
}

type DeckCardProps = {
	entry: DeckEntry;
	offset: number;
	isActive: boolean;
	sessions: StoredSession[];
	onTap: () => void;
};

function DeckCard({ entry, offset, isActive, sessions, onTap }: DeckCardProps) {
	const abs = Math.abs(offset);
	const variants = useMemo(
		() => ({
			rest: {
				x: `calc(-50% + ${offset * FAN_OFFSET_PCT}%)`,
				y: `${abs * FAN_DROP_PCT}%`,
				rotate: offset * FAN_ROTATE,
				scale: 1 - abs * FAN_SCALE_STEP,
				opacity: abs > 2 ? 0.35 : 1,
				zIndex: 10 - abs,
			},
			peek: {
				y: `${abs * FAN_DROP_PCT - (isActive ? 0 : FAN_PEEK_PCT)}%`,
				rotate: offset * FAN_ROTATE * 0.85,
				scale: 1 - abs * FAN_SCALE_STEP + (isActive ? 0 : 0.025),
			},
		}),
		[abs, isActive, offset],
	);

	const className = cardBase();

	if (entry.kind === "import") {
		return (
			<motion.button
				type="button"
				onClick={onTap}
				className={`${className} ${importCardClass()}`}
				variants={variants}
				initial="rest"
				animate="rest"
				whileHover="peek"
				whileFocus="peek"
				transition={{ type: "spring", stiffness: 280, damping: 26 }}
				aria-label="Import a protocol"
			>
				<div className="inline-flex h-[84px] w-[84px] items-center justify-center rounded-full bg-surface text-sea-green">
					<Plus size={36} strokeWidth={2.5} aria-hidden />
				</div>
				<Heading level="h2" margin="none" className="font-black text-text">
					Import a protocol
				</Heading>
				<div className="px-8 text-center text-sm">
					Add a <span className="font-monospace text-text">.netcanvas</span> file
				</div>
			</motion.button>
		);
	}

	const protocol = entry.protocol;
	const accent = ACCENT_CLASSES[pickAccentIndex(protocol.hash)];
	const sessionCount = sessions.filter((s) => s.protocolHash === protocol.hash).length;
	const shadowClass = isActive ? accent?.ring : INACTIVE_SHADOW;

	return (
		<motion.button
			type="button"
			onClick={onTap}
			className={`${className} ${protocolCardClass()} ${shadowClass ?? INACTIVE_SHADOW}`}
			variants={variants}
			initial="rest"
			animate="rest"
			whileHover="peek"
			whileFocus="peek"
			transition={{ type: "spring", stiffness: 280, damping: 26 }}
			aria-label={`${protocol.name}${isActive ? " (active)" : ""}`}
		>
			{/* Cover — 200/470 of original card height */}
			<div className={`relative h-[42.5%] overflow-hidden p-6 ${accent?.cover ?? ""}`}>
				<div className="relative">
					<Heading
						level="h2"
						margin="none"
						className="mt-2 max-w-[90%] font-black leading-[0.98] tracking-[-0.025em] text-white"
					>
						{protocol.name}
					</Heading>
					<div className="mt-2.5 font-monospace text-xs text-white/85">Schema v{protocol.schemaVersion}</div>
				</div>
			</div>

			{/* Meta row */}
			<div className="flex items-center justify-between px-6 pt-4 font-monospace text-xs">
				<span className="text-text/60">
					Imported <TimeAgo date={protocol.importedAt} />
				</span>
				<span className="text-text/60">
					{sessionCount} {sessionCount === 1 ? "interview" : "interviews"}
				</span>
			</div>

			{/* Description */}
			<div className="px-6 pt-3.5 pb-[18px]">
				<p className="line-clamp-3 text-sm leading-[1.45] text-text/80">
					{protocol.description ?? "No description provided."}
				</p>
			</div>

			{/* CTA on active */}
			{isActive ? (
				<Button
					icon={<Play className="stroke-[3px]!" aria-hidden />}
					className="bg-sea-green font-black uppercase tracking-[0.08em] text-primary-contrast border-b-8 border-b-sea-green-dark text-base"
					size="lg"
					onClick={onTap}
				>
					Start new interview
				</Button>
			) : null}
		</motion.button>
	);
}
