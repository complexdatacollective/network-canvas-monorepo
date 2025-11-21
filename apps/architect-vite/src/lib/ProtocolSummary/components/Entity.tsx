import EntityBadge from "./EntityBadge";
import Variables from "./Variables";

type EntityProps = {
	type?: string;
	entity?: string;
	variables?: Record<string, unknown>;
};

const Entity = ({ type, entity, variables }: EntityProps) => (
	<div className="protocol-summary-entity page-break-marker" id={entity === "ego" ? "ego" : `entity-${type ?? ""}`}>
		{entity !== "ego" && type && entity && (
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
