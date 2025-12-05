import cx from "classnames";
import { motion } from "motion/react";
import React, { type MouseEvent } from "react";
import DateComponent from "./DatePicker/DateComponent";
import { getMonthName } from "./helpers";

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

			const previewClass = cx("date-picker__preview", {
				"date-picker__preview--is-empty": isEmpty,
			});

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
					<button
						type="button"
						className={cx("date-picker__preview-part", {
							"date-picker__preview-part--is-set": date.year,
						})}
						onClick={handleClickYear}
						aria-label="Clear year"
					>
						{date.year || "Year"}
					</button>
					{["full", "month"].includes(type || "") && <div className="date-picker__preview-divider">/</div>}
					{["full", "month"].includes(type || "") && (
						<button
							type="button"
							className={cx("date-picker__preview-part", {
								"date-picker__preview-part--is-set": date.month,
							})}
							onClick={handleClickMonth}
							aria-label="Clear month"
						>
							{date.month ? getMonthName(date.month) : "Month"}
						</button>
					)}
					{["full"].includes(type || "") && <div className="date-picker__preview-divider">/</div>}
					{["full"].includes(type || "") && (
						<button
							type="button"
							className={cx("date-picker__preview-part", {
								"date-picker__preview-part--is-set": date.day,
							})}
							onClick={handleClickDay}
							aria-label="Clear day"
						>
							{date.day || "Day"}
						</button>
					)}
					<button
						type="button"
						className={cx("date-picker__preview-clear", {
							"date-picker__preview-clear--is-visible": !isEmpty || isActive,
						})}
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
