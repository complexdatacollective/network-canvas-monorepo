import { cva, cx } from "~/utils/cva";
import Icon from "../Icon";

type ProtocolCardProps = {
	schemaVersion: number;
	lastModified: string | null; // Expects ISO 8601 datetime string
	name: string;
	installationDate?: string | null; // Expects ISO 8601 datetime string
	description?: string | null;
	onClickHandler?: () => void;
	onStatusClickHandler?: () => void;
	isOutdated?: boolean;
	isObsolete?: boolean;
	condensed?: boolean;
	selected?: boolean;
};

const formatDate = (timeString: string | null) => timeString && new Date(timeString).toLocaleString(undefined);

// Marker classes `protocol-card` and `protocol-name` are non-BEM hooks preserved
// for cross-area cascades — slice 17's `Cover.tsx` targets `[&_.protocol-card]:...`
// and `[&_.protocol-card_.protocol-name]:block` to override the card's appearance
// when nested inside the printable summary cover. Removing these markers would
// break that cascade. Drop them when slice 17's Cover migration absorbs the
// styling into props instead.
const cardVariants = cva({
	base: "protocol-card relative flex overflow-hidden rounded bg-platinum text-navy-taupe",
	variants: {
		layout: {
			default: "min-h-(--space-6xl) flex-col-reverse",
			condensed: "h-(--space-4xl) flex-row",
		},
		clickable: {
			true: "cursor-pointer transition-all duration-(--animation-duration-fast) ease-(--animation-easing) hover:-translate-y-[2px] hover:shadow-[0_4px_8px_rgba(0,0,0,0.1)]",
			false: "",
		},
		selected: {
			true: 'before:pointer-events-none before:absolute before:inset-0 before:rounded before:border-(--space-xs) before:border-mustard before:content-[""]',
			false: "",
		},
		obsolete: {
			true: "[&>.icon-section]:bg-error [&>.icon-section]:text-[#ff9dbb] [&_.protocol-name]:opacity-35 [&_.protocol-description]:opacity-35",
			false: "",
		},
	},
	defaultVariants: {
		layout: "default",
		clickable: false,
		selected: false,
		obsolete: false,
	},
});

const iconSectionVariants = cva({
	base: "icon-section flex flex-shrink-0 flex-row items-center justify-center bg-slate-blue-dark text-[#aab0fd] min-h-0",
	variants: {
		condensed: {
			true: "flex-[0_0_var(--space-3xl)] p-0 [&_.protocol-icon]:size-(--space-lg)",
			false: "py-(--space-md) px-(--space-xl)",
		},
	},
	defaultVariants: {
		condensed: false,
	},
});

const mainSectionVariants = cva({
	base: "flex min-h-0 flex-1 flex-col justify-center",
	variants: {
		condensed: {
			true: "py-(--space-md) px-(--space-lg) w-[calc(100%-var(--space-3xl))] [&_.protocol-name]:flex-none [&_.protocol-name]:text-base [&_.protocol-name]:whitespace-nowrap [&_.protocol-name]:overflow-hidden [&_.protocol-name]:text-ellipsis",
			false: "px-(--space-xl) pt-(--space-lg) pb-(--space-md)",
		},
	},
	defaultVariants: {
		condensed: false,
	},
});

const ProtocolCard = ({
	selected = false,
	condensed = false,
	schemaVersion,
	lastModified,
	installationDate = null,
	name,
	description = null,
	isOutdated = false,
	isObsolete = false,
	onStatusClickHandler = () => {},
	onClickHandler,
}: ProtocolCardProps) => {
	const layout = condensed ? "condensed" : "default";
	const rootClass = cardVariants({
		layout,
		clickable: !!onClickHandler,
		selected,
		obsolete: isObsolete,
	});

	const renderStatusIcon = () => {
		// The legacy `.status-icon.protocol-card--outdated { background: var(--color-warning) }`
		// rule never matched any rendered DOM (the JSX applied `status-icon--outdated`, not
		// `protocol-card--outdated`, on the same element). The `outdated` state therefore
		// rendered with the same default `status-icon` styling as a normal protocol; the
		// migration matches that actual rendered output.
		const statusButtonClass =
			"flex size-(--space-2xl) items-center justify-center rounded-full p-(--space-md) ml-(--space-md) text-center [&_svg]:size-full!";

		if (isOutdated && !isObsolete) {
			return (
				<button
					type="button"
					className={statusButtonClass}
					onClick={(e) => {
						e.stopPropagation();
						onStatusClickHandler();
					}}
					aria-label="Protocol is outdated - click for details"
				>
					<Icon name="warning" />
				</button>
			);
		}

		if (isObsolete) {
			return (
				<button
					type="button"
					className={statusButtonClass}
					onClick={(e) => {
						e.stopPropagation();
						onStatusClickHandler();
					}}
					aria-label="Protocol is obsolete - click for details"
				>
					<Icon name="error" />
				</button>
			);
		}

		return (
			<div className="protocol-icon flex h-full flex-[0_0_var(--space-xl)] [&_.icon]:flex-[0_1_auto] [&_.icon]:size-full!">
				<Icon name="protocol-card" />
			</div>
		);
	};

	const renderDescription = () => {
		if (condensed) {
			return (
				<div className="protocol-description flex-none w-full text-xs whitespace-nowrap overflow-hidden text-ellipsis">
					{description}
				</div>
			);
		}

		return (
			<div className="protocol-description flex-1 overflow-y-auto pt-(--space-md) text-sm [-webkit-overflow-scrolling:touch] [scroll-behavior:smooth]">
				{description}
			</div>
		);
	};

	const cardContent = (
		<>
			<div className={iconSectionVariants({ condensed })}>
				{renderStatusIcon()}
				{!condensed && (
					<div className="protocol-meta flex flex-1 flex-col justify-center">
						{installationDate && (
							<h6 className="m-(--space-xs) flex items-center justify-end text-xs uppercase tracking-widest">
								Installed:
								{formatDate(installationDate)}
							</h6>
						)}
						<h6 className="m-(--space-xs) flex items-center justify-end text-xs uppercase tracking-widest">
							Last Modified:
							{formatDate(lastModified)}
						</h6>
						<h6 className="m-(--space-xs) flex items-center justify-end text-xs uppercase tracking-widest">
							Schema Version:
							{schemaVersion}
						</h6>
					</div>
				)}
			</div>
			<div className={mainSectionVariants({ condensed })}>
				<h2 className="protocol-name flex-none m-0 flex items-center hyphens-auto">{name}</h2>
				{description && renderDescription()}
			</div>
		</>
	);

	if (onClickHandler) {
		return (
			<button type="button" className={cx(rootClass, "appearance-none border-0 text-left")} onClick={onClickHandler}>
				{cardContent}
			</button>
		);
	}

	return <div className={rootClass}>{cardContent}</div>;
};

export default ProtocolCard;
