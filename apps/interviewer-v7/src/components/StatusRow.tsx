import { motion } from "motion/react";

const EASE = [0.22, 1, 0.36, 1] as const;
const APP_VERSION = "7.0.0";

type StatusRowProps = {
	protocolCount: number;
	interviewCount: number;
	onOpenData?: () => void;
};

export function StatusRow({ protocolCount, interviewCount, onOpenData }: StatusRowProps) {
	return (
		<motion.div
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.55, delay: 1.2, ease: EASE }}
			className="flex items-center justify-between font-monospace text-xs text-text/60"
		>
			<button
				type="button"
				onClick={() => onOpenData?.()}
				className="inline-flex cursor-pointer items-center gap-3.5 border-0 bg-transparent p-0 font-[inherit] text-[inherit] text-current"
			>
				<span>
					<strong className="font-bold text-text">{protocolCount}</strong> protocols
				</span>
				<span aria-hidden className="h-[3px] w-[3px] rounded-full bg-current" />
				<span>
					<strong className="font-bold text-text">{interviewCount}</strong> interviews
				</span>
			</button>
			<span>Interviewer {APP_VERSION}</span>
		</motion.div>
	);
}
