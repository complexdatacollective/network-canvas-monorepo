import { get } from "es-toolkit/compat";
import { useContext } from "react";
import DualLink from "./DualLink";
import MiniTable from "./MiniTable";
import SummaryContext from "./SummaryContext";

type AssetBadgeProps = {
	id: string;
	link?: boolean;
};

type AssetData = {
	name?: string;
	type?: string;
	[key: string]: unknown;
};

const AssetBadge = ({ id, link = false }: AssetBadgeProps) => {
	const { protocol } = useContext(SummaryContext);

	const data = get(protocol.assetManifest, id) as AssetData | undefined;

	if (!data) {
		return `Asset ${id} not found`;
	}

	const name = !link ? data.name : <DualLink to={`#asset-${id}`}>{data.name}</DualLink>;

	return (
		<div className="protocol-summary-asset-badge">
			<div className="protocol-summary-asset-badge__content">
				<MiniTable
					rotated
					rows={[
						["Type", data.type],
						["Name", name],
					]}
				/>
			</div>
		</div>
	);
};

export default AssetBadge;
