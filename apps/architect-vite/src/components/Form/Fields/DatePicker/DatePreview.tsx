import cx from "classnames";
import { motion } from "motion/react";
import React, { type MouseEvent } from "react";
import Date from "./DatePicker/Date";
import { getMonthName } from "./helpers";

interface DatePreviewProps {
	onClick?: (open?: boolean) => void;
	isActive?: boolean;
	placeholder?: string | null;
}

const DatePreview = ({ onClick = () => {}, isActive = false, placeholder = null }: DatePreviewProps) => (
	<Date>
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

			const handleYearKeyDown = (e: React.KeyboardEvent) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					e.stopPropagation();
					onChange({ year: null, month: null, day: null });
					onClick();
				}
			};

			const handleMonthKeyDown = (e: React.KeyboardEvent) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					e.stopPropagation();
					onChange({ month: null, day: null });
					onClick();
				}
			};

			const handleDayKeyDown = (e: React.KeyboardEvent) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					e.stopPropagation();
					onChange({ day: null });
					onClick();
				}
			};

			const handleClearKeyDown = (e: React.KeyboardEvent) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					e.stopPropagation();
					onChange({ year: null, month: null, day: null });
					onClick(false);
				}
			};

			const previewClass = cx("date-picker__preview", { "date-picker__preview--is-empty": isEmpty });

			if (!isActive && isEmpty && placeholder) {
				return (
					<motion.div
						className={previewClass}
						onClick={handleClickPreview}
						onKeyDown={handlePreviewKeyDown}
						role="button"
						tabIndex={0}
						aria-label="Select date"
						// layout
						ref={previewRef}
					>
						<span className="date-picker__placeholder">{placeholder}</span>
					</motion.div>
				);
			}

			return (
				<motion.div
					className={previewClass}
					onClick={handleClickPreview}
					onKeyDown={handlePreviewKeyDown}
					role="button"
					tabIndex={0}
					aria-label="Date picker"
					// layout
					ref={previewRef}
				>
					<div
						className={cx("date-picker__preview-part", { "date-picker__preview-part--is-set": date.year })}
						onClick={handleClickYear}
						onKeyDown={handleYearKeyDown}
						role="button"
						tabIndex={0}
						aria-label="Clear year"
					>
						{date.year || "Year"}
					</div>
					{["full", "month"].includes(type || "") && <div className="date-picker__preview-divider">/</div>}
					{["full", "month"].includes(type || "") && (
						<div
							className={cx("date-picker__preview-part", { "date-picker__preview-part--is-set": date.month })}
							onClick={handleClickMonth}
							onKeyDown={handleMonthKeyDown}
							role="button"
							tabIndex={0}
							aria-label="Clear month"
						>
							{date.month ? getMonthName(date.month) : "Month"}
						</div>
					)}
					{["full"].includes(type || "") && <div className="date-picker__preview-divider">/</div>}
					{["full"].includes(type || "") && (
						<div
							className={cx("date-picker__preview-part", { "date-picker__preview-part--is-set": date.day })}
							onClick={handleClickDay}
							onKeyDown={handleDayKeyDown}
							role="button"
							tabIndex={0}
							aria-label="Clear day"
						>
							{date.day || "Day"}
						</div>
					)}
					<div
						className={cx("date-picker__preview-clear", {
							"date-picker__preview-clear--is-visible": !isEmpty || isActive,
						})}
						onClick={handleClear}
						onKeyDown={handleClearKeyDown}
						role="button"
						tabIndex={0}
						aria-label="Clear date"
					>
						clear
					</div>
				</motion.div>
			);
		}}
	</Date>
);

export default DatePreview;
