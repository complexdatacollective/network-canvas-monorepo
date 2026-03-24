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

	const color = get(codebook, [entity, type, "color"]);
	const name = get(codebook, [entity, type, "name"]);

	const size = tiny ? "tiny" : small ? "small" : "default";
	const label = small || tiny ? name : <h2>{name}</h2>;

	const badge = <EntityIcon color={color} entity={entity} label={label} size={size} />;

	if (!link) {
		return badge;
	}

	return <DualLink to={`#entity-${type}`}>{badge}</DualLink>;
};

export default EntityBadge;
