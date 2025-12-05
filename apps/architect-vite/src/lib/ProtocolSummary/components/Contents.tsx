import { groupBy, isEmpty, map, toPairs } from "lodash";
import React, { useContext } from "react";
import DualLink from "./DualLink";
import EntityBadge from "./EntityBadge";
import SummaryContext from "./SummaryContext";

type Asset = {
	name?: string;
	type?: string;
	[key: string]: unknown;
};

const Contents = () => {
	const { protocol } = useContext(SummaryContext);

	const nodes = toPairs(protocol.codebook?.node ?? {});
	const edges = toPairs(protocol.codebook?.edge ?? {});
	const assets = groupBy(toPairs(protocol.assetManifest ?? {}), ([, asset]) => (asset as Asset).type);

	return (
		<div className="protocol-summary-contents">
			<h1>Contents</h1>
			<div className="protocol-summary-contents__section">
				<ol>
					<li>Stages</li>
					<ol>
						{protocol.stages &&
							map(protocol.stages, ({ label, id }, index) => (
								<li key={id}>
									<DualLink to={`#stage-${id}`}>
										{index + 1}. {label}
									</DualLink>
								</li>
							))}
					</ol>
					<li>Codebook</li>
					<ul>
						{protocol.codebook?.ego && (
							<li>
								<DualLink to="#ego">Ego</DualLink>
							</li>
						)}
						<li className="heading">Node types</li>
						<ul>
							{nodes.map(([id]) => (
								<li key={id}>
									<EntityBadge type={id} entity="node" link small />
								</li>
							))}
						</ul>
						{!isEmpty(edges) && (
							<>
								<li className="heading">Edge types</li>
								<ul>
									{edges.map(([id]) => (
										<li key={id}>
											<EntityBadge type={id} entity="edge" link small />
										</li>
									))}
								</ul>
							</>
						)}
					</ul>
					{!isEmpty(assets) && (
						<>
							<li>Assets</li>
							<ul>
								{assets &&
									map(assets, (typeAssets, type) => (
										<React.Fragment key={type}>
											<li className="heading">{type}</li>
											<ul>
												{typeAssets.map(([id, asset]) => (
													<li key={id}>
														<DualLink to={`#asset-${id}`}>{(asset as Asset).name}</DualLink>
													</li>
												))}
											</ul>
										</React.Fragment>
									))}
							</ul>
						</>
					)}
				</ol>
			</div>
		</div>
	);
};

export default Contents;
