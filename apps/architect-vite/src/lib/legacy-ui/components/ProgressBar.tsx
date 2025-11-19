import cx from "classnames";

const fillerValue = (orientation: "horizontal" | "vertical", percentProgress: number | null) => {
	const property = orientation === "horizontal" ? "width" : "height";

	return {
		[property]: `${percentProgress}%`,
	};
};

type ProgressBarProps = {
	indeterminate?: boolean;
	onClick?: () => void;
	orientation?: "horizontal" | "vertical";
	percentProgress?: number | null;
	nudge?: boolean;
};

const ProgressBar = ({
	indeterminate = false,
	onClick = () => {},
	orientation = "vertical",
	percentProgress = 0,
	nudge = true,
}: ProgressBarProps) => {
	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			onClick();
		}
	};

	const hasClickHandler = onClick !== (() => {});

	return (
		<div
			className={cx("progress-bar", `progress-bar--${orientation}`, {
				"progress-bar--indeterminate": indeterminate || percentProgress === null,
				"progress-bar--complete": percentProgress === 100 && nudge,
			})}
			onClick={onClick}
			onKeyDown={handleKeyDown}
			role={hasClickHandler ? "button" : undefined}
			tabIndex={hasClickHandler ? 0 : undefined}
			aria-label={hasClickHandler ? `Progress: ${percentProgress}%` : undefined}
		>
			<div className="progress-bar__filler" style={fillerValue(orientation, percentProgress)} />
		</div>
	);
};

export default ProgressBar;
