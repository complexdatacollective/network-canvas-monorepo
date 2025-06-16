import cx from "classnames";
import React from "react";
import logo from "../../assets/images/Srv-Flat.svg";
import HoverMarquee from "../HoverMarquee";

interface ServerCardProps {
	name?: string;
	addresses: string[];
	host?: string | null;
	onClickHandler?: () => void;
	disabled?: boolean;
}

/**
 * Renders a server icon & label. The label defaults to server name, falling back
 * to its first address (both provided via the `data` prop). If `secondaryLabel`
 * is provided, then it will be appended.
 */
const ServerCard = ({ name, addresses, host = null, onClickHandler, disabled = false }: ServerCardProps) => {
	const label = name || addresses[0];

	const modifierClasses = cx(
		"server-card",
		{ "server-card--clickable": onClickHandler },
		{ "server-card--disabled": disabled },
	);

	return (
		<div className={modifierClasses} onClick={onClickHandler}>
			<div className="server-card__icon-section">
				<div className="server-icon">
					<img src={logo} alt="" />
				</div>
			</div>
			<div className="server-card__main-section">
				<h2 className="server-name">
					<HoverMarquee>{label}</HoverMarquee>
				</h2>
				<h6>
					<HoverMarquee>
						Addresses:
						{addresses.map((address, index) => (
							<React.Fragment key={index}>
								[{address}]{index !== addresses.length - 1 && ","}
							</React.Fragment>
						))}
					</HoverMarquee>
				</h6>
				<h6>
					<HoverMarquee>
						Host:
						{host}
					</HoverMarquee>
				</h6>
			</div>
		</div>
	);
};

export default ServerCard;
