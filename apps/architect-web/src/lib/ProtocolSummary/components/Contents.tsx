import { groupBy, isEmpty, map, toPairs } from 'es-toolkit/compat';
import React, { useContext } from 'react';

import DualLink from './DualLink';
import EntityBadge from './EntityBadge';
import SummaryContext from './SummaryContext';

type Asset = {
  name?: string;
  type?: string;
  [key: string]: unknown;
};

const headingClass =
  'uppercase font-semibold text-xs tracking-widest my-(--space-md)';

const Contents = () => {
  const { protocol } = useContext(SummaryContext);

  const nodes = toPairs(protocol.codebook?.node ?? {});
  const edges = toPairs(protocol.codebook?.edge ?? {});
  const assets = groupBy(
    toPairs(protocol.assetManifest ?? {}),
    ([, asset]) => (asset as Asset).type,
  );

  return (
    <div>
      <h1>Contents</h1>
      <div className="[&_a]:text-neon-coral [&_li]:my-(--space-sm) [&_ol_ol]:ps-(--space-xl) [&_ol_ul]:ps-(--space-xl) [&_ul_li]:flex [&_ul_li]:items-center [&_ul_li]:ps-0">
        <ol className="ps-0">
          <li className={`list-none ${headingClass}`}>Stages</li>
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
          <li className={`list-none ${headingClass}`}>Codebook</li>
          <ul>
            {protocol.codebook?.ego && (
              <li>
                <DualLink to="#ego">Ego</DualLink>
              </li>
            )}
            <li className={headingClass}>Node types</li>
            <ul>
              {nodes.map(([id]) => (
                <li key={id}>
                  <EntityBadge type={id} entity="node" link small />
                </li>
              ))}
            </ul>
            {!isEmpty(edges) && (
              <>
                <li className={headingClass}>Edge types</li>
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
              <li className={`list-none ${headingClass}`}>Assets</li>
              <ul>
                {assets &&
                  map(assets, (typeAssets, type) => (
                    <React.Fragment key={type}>
                      <li className={headingClass}>{type}</li>
                      <ul>
                        {typeAssets.map(([id, asset]) => (
                          <li key={id}>
                            <DualLink to={`#asset-${id}`}>
                              {(asset as Asset).name}
                            </DualLink>
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
