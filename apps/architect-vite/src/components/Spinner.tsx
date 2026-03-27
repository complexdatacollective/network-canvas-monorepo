import { cva, type VariantProps } from "class-variance-authority";
import { motion, useAnimationControls } from "motion/react";
import { useEffect, useRef } from "react";
import { cn } from "~/utils/cn";

const ANIMATION_DURATION = 1.8;

const spinnerColors = [
	{
		light: "oklch(73.83% 0.13 217.55)", // sea-serpent
		dark: "oklch(68.83% 0.13 217.55)",
	},
	{
		light: "oklch(81% 0.17 86.39)", // mustard
		dark: "oklch(76% 0.17 86.39)",
	},
	{
		light: "oklch(57.33% 0.2584 11.57)", // neon-coral
		dark: "oklch(52.33% 0.2584 11.57)",
	},
	{
		light: "oklch(70% 0.2 171.52)", // sea-green
		dark: "oklch(65% 0.2 171.52)",
	},
] as const;

const circlePositions = [
	{ top: -1, left: 0, rotate: 0 },
	{ top: 0, left: 2, rotate: 90 },
	{ top: 1, left: -1, rotate: -90 },
	{ top: 2, left: 1, rotate: -180 },
] as const;

const spinnerVariants = cva(
	[
		"[--container-size:calc(var(--circle-size)*3)]",
		"relative",
		"will-change-transform",
		"[backface-visibility:hidden]",
		"w-[var(--container-size)]",
		"h-[var(--container-size)]",
		"m-[var(--circle-size)]",
	].join(" "),
	{
		variants: {
			size: {
				xs: "[--circle-size:0.35rem]",
				sm: "[--circle-size:0.5rem]",
				md: "[--circle-size:0.75rem]",
				lg: "[--circle-size:1.25rem]",
				xl: "[--circle-size:2rem]",
			},
		},
		defaultVariants: {
			size: "md",
		},
	},
);

const halfCircleBase = "h-[var(--circle-size)] w-[calc(var(--circle-size)*2)] rounded-t-[calc(var(--circle-size)*2)]";

const containerAnimation = {
	rotate: [45, 45, 405, 405],
	scale: [1, 0.8, 1, 1],
	transition: {
		rotate: {
			duration: ANIMATION_DURATION,
			ease: "easeInOut" as const,
			times: [0, 0, 0.57, 1],
		},
		scale: {
			duration: ANIMATION_DURATION,
			ease: "easeInOut" as const,
			times: [0, 0.2, 0.57, 1],
		},
	},
};

type SpinnerProps = {
	customSize?: string;
	className?: string;
} & VariantProps<typeof spinnerVariants>;

export default function Spinner({ size = "md", customSize, className }: SpinnerProps) {
	const customSizeStyle = customSize ? ({ "--circle-size": customSize } as React.CSSProperties) : undefined;

	const containerControls = useAnimationControls();
	const hc0 = useAnimationControls();
	const hc1 = useAnimationControls();
	const hc2 = useAnimationControls();
	const hc3 = useAnimationControls();
	const halfCircleControls = [hc0, hc1, hc2, hc3] as const;

	const containerRef = useRef(containerControls);
	const halfCircleRef = useRef(halfCircleControls);
	containerRef.current = containerControls;
	halfCircleRef.current = halfCircleControls;

	useEffect(() => {
		let isMounted = true;

		const loop = async () => {
			while (isMounted) {
				const ctrls = halfCircleRef.current;
				const containerPromise = containerRef.current.start(containerAnimation);

				for (let i = 0; i < ctrls.length; i++) {
					const colors = spinnerColors[i];
					void ctrls[i].start({
						x: ["50%", "0%", "50%"],
						backgroundColor: [colors.dark, colors.light, colors.dark],
						transition: {
							duration: ANIMATION_DURATION,
							ease: [0.4, 0, 0.2, 1],
							times: [0, 0.5, 1],
						},
					});
				}

				await containerPromise;
			}
		};

		void loop();

		return () => {
			isMounted = false;
			containerRef.current.stop();
			for (const ctrl of halfCircleRef.current) {
				ctrl.stop();
			}
		};
	}, []);

	return (
		<motion.div
			className={cn(spinnerVariants({ size }), className)}
			style={customSizeStyle}
			initial={{ rotate: 45, scale: 1 }}
			animate={containerControls}
		>
			{circlePositions.map((pos, index) => {
				const colors = spinnerColors[index];

				return (
					<motion.div
						key={`${pos.top}-${pos.left}`}
						className="absolute"
						style={{
							top: `calc(var(--circle-size) * ${pos.top})`,
							left: `calc(var(--circle-size) * ${pos.left})`,
							rotate: pos.rotate || 0,
						}}
					>
						<motion.div
							className={halfCircleBase}
							initial={{ x: "50%", backgroundColor: colors.dark }}
							animate={halfCircleControls[index]}
						/>
						<div
							className={cn(halfCircleBase, "rotate-180 relative -top-px")}
							style={{ backgroundColor: colors.light }}
						/>
					</motion.div>
				);
			})}
		</motion.div>
	);
}
