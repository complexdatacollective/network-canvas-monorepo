import AssetBadge from "../AssetBadge";
import MiniTable from "../MiniTable";
import SectionFrame from "./SectionFrame";

// TODO: add filter

type PanelsProps = {
	panels?: Array<{
		id: string;
		title: string;
		dataSource: string;
	}> | null;
};

const Panels = ({ panels = null }: PanelsProps) => {
	if (!panels || panels.length === 0) {
		return null;
	}

	return (
		<SectionFrame title="Panels">
			<ol className="m-0 ps-(--space-xl)">
				{panels.map((panel) => (
					<li className="my-(--space-md) pl-(--space-md)" key={panel.id}>
						<MiniTable
							rotated
							rows={[
								["Title", panel.title],
								[
									"Data Source",
									panel.dataSource === "existing" ? (
										<p key="existing">
											<em>Existing network</em>
										</p>
									) : (
										<AssetBadge key="asset" id={panel.dataSource} link />
									),
								],
							]}
						/>
					</li>
				))}
			</ol>
		</SectionFrame>
	);
};

export default Panels;
