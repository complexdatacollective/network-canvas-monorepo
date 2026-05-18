import architectIcon from "~/images/Arc-Flat.svg";
import { cx } from "~/utils/cva";
import Badge from "./Badge";

type BrandProps = {
	onClick?: () => void;
	className?: string;
	variant?: "pill" | "inline" | "icon";
};

const PILL_CHROME = "py-2 pl-2 sm:pl-3 pr-4 sm:pr-8 rounded-full bg-surface-1 text-surface-1-foreground shadow-sm";
const ROW = "flex items-center gap-3 sm:gap-4 shrink-0";
const INTERACTIVE = "cursor-pointer border-none hover:opacity-90 transition-opacity";

const Brand = ({ onClick, className, variant = "pill" }: BrandProps) => {
	const isPill = variant === "pill";
	const isIcon = variant === "icon";

	const iconClassName = isIcon ? "h-11 w-11" : "h-10 w-10 sm:h-14 sm:w-14";
	const iconImg = <img src={architectIcon} alt="Architect" className={iconClassName} />;

	if (isIcon) {
		if (onClick) {
			return (
				<button
					type="button"
					onClick={onClick}
					aria-label="Return to start screen"
					className={cx("shrink-0 bg-transparent p-0", INTERACTIVE, className)}
				>
					{iconImg}
				</button>
			);
		}
		return <div className={cx("shrink-0", className)}>{iconImg}</div>;
	}

	const baseClasses = cx(ROW, isPill && PILL_CHROME);

	const content = (
		<>
			{iconImg}
			<p className="h3 m-0">Architect</p>
			<Badge color="sea-green">WEB</Badge>
		</>
	);

	if (onClick) {
		return (
			<button
				type="button"
				onClick={onClick}
				aria-label="Return to start screen"
				className={cx(baseClasses, INTERACTIVE, !isPill && "bg-transparent p-0", className)}
			>
				{content}
			</button>
		);
	}

	return <div className={cx(baseClasses, className)}>{content}</div>;
};

export default Brand;
