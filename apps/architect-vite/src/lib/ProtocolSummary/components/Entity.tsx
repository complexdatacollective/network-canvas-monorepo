import Variables from "./Variables";
import EntityBadge from "./EntityBadge";

type EntityProps = {
	type?: string | null;
	entity?: string | null;
	variables?: Record<string, unknown> | null;
};

const Entity = ({ type = null, entity = null, variables = null }: EntityProps) => (
	<div className="protocol-summary-entity page-break-marker" id={entity === "ego" ? "ego" : `entity-${type}`}>
		{entity !== "ego" && (
			<div className="protocol-summary-entity__meta">
				<EntityBadge type={type} entity={entity} />
			</div>
		)}

		{entity === "ego" && (
			<div className="protocol-summary-entity__meta">
				<div className="protocol-summary-entity__meta-name">
					<h1>Ego</h1>
				</div>
			</div>
		)}

		<div className="protocol-summary-entity__variables">
			<Variables variables={variables} />
		</div>
	</div>
);

export default Entity;
