import cx from "classnames";
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
	const modifierClasses = cx(
		"protocol-card",
		{ "protocol-card--clickable": onClickHandler },
		{ "protocol-card--condensed": condensed },
		{ "protocol-card--selected": selected },
		{ "protocol-card--outdated": !isObsolete && isOutdated },
		{ "protocol-card--obsolete": isObsolete },
	);

	const renderStatusIcon = () => {
		if (isOutdated) {
			return (
				<button
					type="button"
					className="status-icon status-icon--outdated"
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
					className="status-icon status-icon--obsolete"
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
			<div className="protocol-icon">
				<Icon name="protocol-card" />
			</div>
		);
	};

	const renderDescription = () => {
		if (condensed) {
			return <div className="protocol-description protocol-description--condensed">{description}</div>;
		}

		return <div className="protocol-description">{description}</div>;
	};

	const cardContent = (
		<>
			<div className="protocol-card__icon-section">
				{renderStatusIcon()}
				{!condensed && (
					<div className="protocol-meta">
						{installationDate && (
							<h6>
								Installed:
								{formatDate(installationDate)}
							</h6>
						)}
						<h6>
							Last Modified:
							{formatDate(lastModified)}
						</h6>
						<h6>
							Schema Version:
							{schemaVersion}
						</h6>
					</div>
				)}
			</div>
			<div className="protocol-card__main-section">
				<h2 className="protocol-name">{name}</h2>
				{description && renderDescription()}
			</div>
		</>
	);

	if (onClickHandler) {
		return (
			<button type="button" className={modifierClasses} onClick={onClickHandler}>
				{cardContent}
			</button>
		);
	}

	return <div className={modifierClasses}>{cardContent}</div>;
};

export default ProtocolCard;
