import { get } from "es-toolkit/compat";
import EntityBadge from "../EntityBadge";
import MiniTable from "../MiniTable";
import Variable from "../Variable";

type PresetsProps = {
	presets?: Array<{
		label: string;
		layoutVariable?: string;
		groupVariable?: string;
		edges?: { display?: string[] };
		highlight?: string[];
	}> | null;
};

const Presets = ({ presets = null }: PresetsProps) => {
	if (!presets) {
		return null;
	}

	return (
		<div className="protocol-summary-stage__presets">
			<div className="protocol-summary-stage__presets-content">
				<h2 className="section-heading">Presets</h2>
				<ol>
					{presets.map((preset) => (
						<li key={preset.label}>
							<div className="protocol-summary-stage__presets-item">
								<h2 className="section-heading">{preset.label}</h2>
								<MiniTable
									rotated
									rows={[
										[
											"Layout variable",
											<Variable key={`layout-${preset.layoutVariable}`} id={preset.layoutVariable} link />,
										],
										[
											"Show edges",
											<ul key="show-edges">
												{get(preset, "edges.display", []).map((edge) => (
													<li key={edge}>
														<EntityBadge entity="edge" type={edge} tiny link />
													</li>
												))}
											</ul>,
										],
										[
											"Group variable",
											<Variable key={`group-${preset.groupVariable}`} id={preset.groupVariable} link />,
										],
										[
											"Highlight attributes",
											<ul key="highlight">
												{get(preset, "highlight", []).map((id) => (
													<li key={id}>
														<Variable id={id} link />
														<br />
													</li>
												))}
											</ul>,
										],
									]}
								/>
							</div>
						</li>
					))}
				</ol>
			</div>
		</div>
	);
};

export default Presets;
