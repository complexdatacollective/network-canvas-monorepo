import { map } from "lodash";
import MiniTable from "../MiniTable";
import { renderValue } from "../helpers";

const behaviorLabel = (behaviourValue: any, behaviourKey: string) => {
	switch (behaviourKey) {
		case "allowRepositioning":
			return { label: "Repositioning enabled", value: behaviourValue };
		case "automaticLayout":
			return { label: "Automatic layout enabled", value: behaviourValue.enabled };
		case "minNodes":
			return { label: "Minimum nodes on stage", value: behaviourValue };
		case "maxNodes":
			return { label: "Maximum nodes on stage", value: behaviourValue };
		case "freeDraw":
			return { label: "Freedraw enabled", value: behaviourValue };
		default:
			return { label: behaviourKey, value: behaviourValue };
	}
};

const behaviourRows = (behaviours: Record<string, any>) =>
	map(behaviours, (behaviourValue, behaviourKey) => {
		const labelValue = behaviorLabel(behaviourValue, behaviourKey);
		return [labelValue.label, renderValue(labelValue.value)];
	});

type BehavioursProps = {
	behaviours?: {
		allowRepositioning?: boolean;
		freeDraw?: boolean;
		[key: string]: any;
	} | null;
};

const Behaviours = ({ behaviours = null }: BehavioursProps) => {
	if (!behaviours) {
		return null;
	}

	return (
		<div className="protocol-summary-stage__behaviours">
			<div className="protocol-summary-stage__behaviours-content">
				<h2 className="section-heading">Behaviours</h2>
				<MiniTable rotated rows={behaviourRows(behaviours)} />
			</div>
		</div>
	);
};

export default Behaviours;
