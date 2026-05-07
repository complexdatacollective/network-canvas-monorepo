import { get } from "es-toolkit/compat";
import EntityBadge from "../EntityBadge";
import MiniTable from "../MiniTable";
import Variable from "../Variable";
import SectionFrame from "./SectionFrame";

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
		<SectionFrame title="Presets">
			<ol className="m-0 ps-(--space-xl)">
				{presets.map((preset) => (
					<li className="my-(--space-md) pl-(--space-md)" key={preset.label}>
						<SectionFrame title={preset.label}>
							<MiniTable
								rotated
								rows={[
									[
										"Layout variable",
										<Variable key={`layout-${preset.layoutVariable}`} id={preset.layoutVariable ?? ""} />,
									],
									[
										"Show edges",
										<ul key="show-edges">
											{get(preset, "edges.display", []).map((edge: string) => (
												<li key={edge}>
													<EntityBadge entity="edge" type={edge} tiny link />
												</li>
											))}
										</ul>,
									],
									[
										"Group variable",
										<Variable key={`group-${preset.groupVariable}`} id={preset.groupVariable ?? ""} />,
									],
									[
										"Highlight attributes",
										<ul key="highlight">
											{get(preset, "highlight", []).map((id: string) => (
												<li key={id}>
													<Variable id={id} />
													<br />
												</li>
											))}
										</ul>,
									],
								]}
							/>
						</SectionFrame>
					</li>
				))}
			</ol>
		</SectionFrame>
	);
};

export default Presets;
