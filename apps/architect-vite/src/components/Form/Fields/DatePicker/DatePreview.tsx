import { motion } from "motion/react";
import React, { type MouseEvent } from "react";
import { cva, cx } from "~/utils/cva";
import DateComponent from "./DatePicker/DateComponent";
import { getMonthName } from "./helpers";

type DatePreviewProps = {
	onClick?: (open?: boolean) => void;
	isActive?: boolean;
	placeholder?: string | null;
};

const previewVariants = cva({
	base: cx(
		"bg-background text-input-contrast",
		"flex items-center",
		"rounded-t-2xl",
		"px-4 text-base leading-16",
		"border-b-2 border-transparent",
		"transition-[border-bottom-color] duration-200",
		"focus:border-sea-green",
		"focus-visible:outline-none",
	),
	variants: {
		isEmpty: {
			true: "text-input-placeholder cursor-pointer italic",
			false: "",
		},
	},
});

const previewPartVariants = cva({
	base: cx("inline-block cursor-pointer transition-colors duration-200"),
	variants: {
		isSet: {
			true: "text-input-contrast not-italic",
			false: "text-input-placeholder italic",
		},
	},
});

const DatePreview = ({ onClick = () => {}, isActive = false, placeholder = null }: DatePreviewProps) => (
	<DateComponent>
		{({ date, type, onChange, isComplete, isEmpty }) => {
			const previewRef = React.createRef<HTMLDivElement>();

			const handleClickYear = (e: MouseEvent) => {
				e.stopPropagation();
				onChange({ year: null, month: null, day: null });
				onClick();
			};

			const handleClickMonth = (e: MouseEvent) => {
				e.stopPropagation();
				onChange({ month: null, day: null });
				onClick();
			};

			const handleClickDay = (e: MouseEvent) => {
				e.stopPropagation();
				onChange({ day: null });
				onClick();
			};

			const handleClickPreview = () => {
				if (isComplete) {
					return;
				}
				onClick();
			};

			const handleClear = (e: MouseEvent) => {
				e.stopPropagation();
				onChange({ year: null, month: null, day: null });
				onClick(false);
			};

			const handlePreviewKeyDown = (e: React.KeyboardEvent) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					if (!isComplete) {
						onClick();
					}
				}
			};

			if (!isActive && isEmpty && placeholder) {
				return (
					<motion.div
						className={previewVariants({ isEmpty: true })}
						onClick={handleClickPreview}
						onKeyDown={handlePreviewKeyDown}
						role="button"
						tabIndex={0}
						aria-label="Select date"
						ref={previewRef}
					>
						<span className="text-input-placeholder italic">{placeholder}</span>
					</motion.div>
				);
			}

			const clearVisible = !isEmpty || isActive;

			return (
				<motion.div
					className={previewVariants({ isEmpty })}
					onClick={handleClickPreview}
					onKeyDown={handlePreviewKeyDown}
					role="button"
					tabIndex={0}
					aria-label="Date picker"
					ref={previewRef}
				>
					<button
						type="button"
						className={previewPartVariants({ isSet: !!date.year })}
						onClick={handleClickYear}
						aria-label="Clear year"
					>
						{date.year || "Year"}
					</button>
					{["full", "month"].includes(type || "") && <div className="text-sea-green px-2">/</div>}
					{["full", "month"].includes(type || "") && (
						<button
							type="button"
							className={previewPartVariants({ isSet: !!date.month })}
							onClick={handleClickMonth}
							aria-label="Clear month"
						>
							{date.month ? getMonthName(date.month) : "Month"}
						</button>
					)}
					{["full"].includes(type || "") && <div className="text-sea-green px-2">/</div>}
					{["full"].includes(type || "") && (
						<button
							type="button"
							className={previewPartVariants({ isSet: !!date.day })}
							onClick={handleClickDay}
							aria-label="Clear day"
						>
							{date.day || "Day"}
						</button>
					)}
					<button
						type="button"
						className={cx(
							"border-sea-green ml-auto inline-block h-[1.4rem] cursor-pointer border-b",
							"leading-[1.4rem] transition-opacity duration-200",
							clearVisible ? "opacity-100" : "opacity-0",
						)}
						onClick={handleClear}
						aria-label="Clear date"
					>
						clear
					</button>
				</motion.div>
			);
		}}
	</DateComponent>
);

export default DatePreview;
