import { motion } from "motion/react";
import React, { type MouseEvent } from "react";
import { cx } from "~/utils/cva";
import DateComponent from "./DatePicker/DateComponent";
import { getMonthName } from "./helpers";

const previewBase =
	"flex h-(--datepicker-preview-height) items-center rounded-t-lg border-b-2 border-transparent bg-background px-(--space-md) text-base transition-colors duration-(--animation-duration-fast) ease-(--animation-easing) focus:border-b-active";

const partBase =
	"inline-block cursor-pointer transition-colors duration-(--animation-duration-fast) ease-(--animation-easing)";

type DatePreviewProps = {
	onClick?: (open?: boolean) => void;
	isActive?: boolean;
	placeholder?: string | null;
};

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
						className={cx(previewBase, "cursor-pointer italic text-input-placeholder")}
						onClick={handleClickPreview}
						onKeyDown={handlePreviewKeyDown}
						role="button"
						tabIndex={0}
						aria-label="Select date"
						ref={previewRef}
					>
						<span className="italic text-input-placeholder">{placeholder}</span>
					</motion.div>
				);
			}

			return (
				<motion.div
					className={cx(previewBase, isEmpty && "cursor-pointer italic text-input-placeholder")}
					onClick={handleClickPreview}
					onKeyDown={handlePreviewKeyDown}
					role="button"
					tabIndex={0}
					aria-label="Date picker"
					ref={previewRef}
				>
					<button
						type="button"
						className={cx(partBase, date.year ? "not-italic text-input-foreground" : "italic text-input-placeholder")}
						onClick={handleClickYear}
						aria-label="Clear year"
					>
						{date.year || "Year"}
					</button>
					{["full", "month"].includes(type || "") && <div className="px-(--space-sm) text-active">/</div>}
					{["full", "month"].includes(type || "") && (
						<button
							type="button"
							className={cx(
								partBase,
								date.month ? "not-italic text-input-foreground" : "italic text-input-placeholder",
							)}
							onClick={handleClickMonth}
							aria-label="Clear month"
						>
							{date.month ? getMonthName(date.month) : "Month"}
						</button>
					)}
					{["full"].includes(type || "") && <div className="px-(--space-sm) text-active">/</div>}
					{["full"].includes(type || "") && (
						<button
							type="button"
							className={cx(partBase, date.day ? "not-italic text-input-foreground" : "italic text-input-placeholder")}
							onClick={handleClickDay}
							aria-label="Clear day"
						>
							{date.day || "Day"}
						</button>
					)}
					<button
						type="button"
						className={cx(
							"ml-auto h-(--space-md) cursor-pointer border-b border-active leading-(--space-md) transition-colors duration-(--animation-duration-fast) ease-(--animation-easing)",
							!isEmpty || isActive ? "opacity-100" : "opacity-0",
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
