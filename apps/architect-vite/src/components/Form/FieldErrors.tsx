import { AnimatePresence, motion } from "motion/react";
import { cx } from "~/utils/cva";

type FieldErrorsProps = {
	id: string;
	name?: string;
	errors: string[];
	show: boolean;
	className?: string;
};

export function FieldErrors({ id, name, errors, show, className }: FieldErrorsProps) {
	const visible = show && errors.length > 0;
	return (
		<AnimatePresence initial={false}>
			{visible && (
				<motion.div
					key={`${id}-errors`}
					id={id}
					role="alert"
					aria-live="polite"
					data-field-name={name}
					initial={{ opacity: 0, height: 0 }}
					animate={{ opacity: 1, height: "auto" }}
					exit={{ opacity: 0, height: 0 }}
					transition={{ duration: 0.2 }}
					className={cx(
						"bg-destructive text-destructive-contrast",
						"rounded-sm px-3 py-2 mt-2 text-sm",
						"flex items-center gap-2",
						className,
					)}
				>
					{errors.map((e) => (
						<span key={`${id}-${e}`}>{e}</span>
					))}
				</motion.div>
			)}
		</AnimatePresence>
	);
}
