import cx from "classnames";
import { get } from "es-toolkit/compat";
import { useContext } from "react";
import EntityIcon from "~/components/Codebook/EntityIcon";
import DualLink from "./DualLink";
import SummaryContext from "./SummaryContext";

type EntityBadgeProps = {
	type: string;
	entity: string;
	link?: boolean;
	small?: boolean;
	tiny?: boolean;
};

const EntityBadge = ({ type, entity, link = false, small = false, tiny = false }: EntityBadgeProps) => {
	const {
		protocol: { codebook },
	} = useContext(SummaryContext);

	const classes = cx("protocol-summary-entity-badge", {
		"protocol-summary-entity-badge--small": small,
		"protocol-summary-entity-badge--tiny": tiny,
	});

	const color = get(codebook, [entity, type, "color"]);
	const name = get(codebook, [entity, type, "name"]);

	const label = small || tiny ? name : <h2>{name}</h2>;

	const badge = (
		<>
			<div className="protocol-summary-entity-badge__icon">
				<EntityIcon color={color} entity={entity} />
			</div>
			<div className="protocol-summary-entity-badge__label">{label}</div>
		</>
	);

	if (!link) {
		return <div className={classes}>{badge}</div>;
	}

	return (
		<DualLink to={`#entity-${type}`} className={classes}>
			{badge}
		</DualLink>
	);
};


export default EntityBadge;
