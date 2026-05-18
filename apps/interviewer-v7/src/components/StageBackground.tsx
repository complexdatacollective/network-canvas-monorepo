import { cx } from "@codaco/fresco-ui/utils/cva";
import { type ReactNode, useEffect, useState } from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

// Mirrors the Blobs primitive in the design bundle's shared.jsx: two soft blobs
// at fixed positions, staggered animation delays, alpha tuned for the start screen.
type BlobConfig = {
	className: string;
	delayClass: string;
};

const BLOBS: BlobConfig[] = [
	{
		className: "absolute top-[-12%] left-[-8%] h-[460px] w-[460px] bg-sea-green opacity-[0.18]",
		delayClass: "[animation-delay:0s]",
	},
	{
		className: "absolute top-[5%] right-[-6%] h-[360px] w-[360px] bg-paradise-pink opacity-[0.18]",
		delayClass: "[animation-delay:1.7s]",
	},
];

type StageBackgroundProps = {
	children?: ReactNode;
	className?: string;
};

export const StageBackground = ({ children, className }: StageBackgroundProps) => {
	const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(() => {
		if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
			return false;
		}
		return window.matchMedia(REDUCED_MOTION_QUERY).matches;
	});

	useEffect(() => {
		if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
			return;
		}
		const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY);
		const handleChange = (event: MediaQueryListEvent) => {
			setPrefersReducedMotion(event.matches);
		};
		setPrefersReducedMotion(mediaQuery.matches);
		mediaQuery.addEventListener("change", handleChange);
		return () => {
			mediaQuery.removeEventListener("change", handleChange);
		};
	}, []);

	return (
		<div
			className={cx(
				"relative bg-[radial-gradient(ellipse_at_50%_110%,oklch(0.36_0.10_281)_0%,var(--background)_60%),var(--background)] text-text",
				className,
			)}
		>
			{!prefersReducedMotion && (
				<div className="iv-blobs" aria-hidden="true">
					{BLOBS.map((blob, i) => (
						<span key={`${blob.className}-${i}`} className={cx("iv-blob", blob.className, blob.delayClass)} />
					))}
				</div>
			)}
			{children}
		</div>
	);
};
