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
	onClick,
	orientation = "vertical",
	percentProgress = 0,
	nudge = true,
}: ProgressBarProps) => {
	const commonClasses = cx("progress-bar", `progress-bar--${orientation}`, {
		"progress-bar--indeterminate": indeterminate || percentProgress === null,
		"progress-bar--complete": percentProgress === 100 && nudge,
	});

	const content = <div className="progress-bar__filler" style={fillerValue(orientation, percentProgress)} />;

	if (onClick) {
		return (
			<button type="button" className={commonClasses} onClick={onClick} aria-label={`Progress: ${percentProgress}%`}>
				{content}
			</button>
		);
	}

	return <div className={commonClasses}>{content}</div>;
};

export default ProgressBar;
