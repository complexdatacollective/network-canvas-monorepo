import AssetBadge from "../AssetBadge";
import MiniTable from "../MiniTable";

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
		<div className="protocol-summary-stage__panels">
			<div className="protocol-summary-stage__panels-content">
				<h2 className="section-heading">Panels</h2>
				<ol>
					{panels.map((panel) => (
						<li className="protocol-summary-stage__panels-panel" key={panel.id}>
							<MiniTable
								rotated
								rows={[
									["Title", panel.title],
									[
										"Data Source",
										panel.dataSource === "existing" ? (
											<p>
												<em>Existing network</em>
											</p>
										) : (
											<AssetBadge id={panel.dataSource} link />
										),
									],
								]}
							/>
						</li>
					))}
				</ol>
			</div>
		</div>
	);
};

export default Panels;
