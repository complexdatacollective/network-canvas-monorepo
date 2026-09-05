import { groupBy, isEmpty, map, toPairs } from 'es-toolkit/compat';
import React, { useContext } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Heading from '@codaco/fresco-ui/typography/Heading';
import { formatAssetType } from '~/components/Assets/assetMetadataMessages';

import DualLink from './DualLink';
import EntityBadge from './EntityBadge';
import SummaryContext from './SummaryContext';
const messages = defineMessages({
  numberedStage: {
    id: 'architect.presentation.numberedStage',
    defaultMessage: '{position, number}. {label}',
    description:
      'Complete presentation message. Preserve authored values; the translator controls spacing and punctuation.',
  },
  contents: {
    id: 'architect.protocolSummary.contents.contents',
    defaultMessage: 'Contents',
    description:
      'Visible text in lib / ProtocolSummary / components / Contents.',
  },
  stages: {
    id: 'architect.protocolSummary.contents.stages',
    defaultMessage: 'Stages',
    description:
      'Visible text in lib / ProtocolSummary / components / Contents.',
  },
  codebook: {
    id: 'architect.protocolSummary.contents.codebook',
    defaultMessage: 'Codebook',
    description:
      'Visible text in lib / ProtocolSummary / components / Contents.',
  },
  ego: {
    id: 'architect.protocolSummary.contents.ego',
    defaultMessage: 'Ego',
    description:
      'Visible text in lib / ProtocolSummary / components / Contents.',
  },
  nodeTypes: {
    id: 'architect.protocolSummary.contents.nodeTypes',
    defaultMessage: 'Node types',
    description:
      'Visible text in lib / ProtocolSummary / components / Contents.',
  },
  edgeTypes: {
    id: 'architect.protocolSummary.contents.edgeTypes',
    defaultMessage: 'Edge types',
    description:
      'Visible text in lib / ProtocolSummary / components / Contents.',
  },
  assets: {
    id: 'architect.protocolSummary.contents.assets',
    defaultMessage: 'Assets',
    description:
      'Visible text in lib / ProtocolSummary / components / Contents.',
  },
});

type Asset = {
  name?: string;
  type?: string;
  [key: string]: unknown;
};
const headingClass = 'uppercase font-semibold text-xs tracking-widest my-5';
const Contents = () => {
  const intl = useAppIntl();
  const { protocol } = useContext(SummaryContext);
  const nodes = toPairs(protocol.codebook?.node ?? {});
  const edges = toPairs(protocol.codebook?.edge ?? {});
  const assets = groupBy(
    toPairs(protocol.assetManifest ?? {}),
    ([, asset]) => (asset as Asset).type,
  );
  return (
    <div>
      <Heading level="h1">{intl.formatMessage(messages.contents)}</Heading>
      <div className="[&_a]:text-neon-coral [&_li]:my-2.5 [&_ol_ol]:ps-10 [&_ol_ul]:ps-10 [&_ul_li]:flex [&_ul_li]:items-center [&_ul_li]:ps-0">
        <ol className="ps-0">
          <li className={`list-none ${headingClass}`}>
            {intl.formatMessage(messages.stages)}
          </li>
          <ol>
            {protocol.stages &&
              map(protocol.stages, ({ label, id }, index) => (
                <li key={id}>
                  <DualLink to={`#stage-${id}`}>
                    {intl.formatMessage(messages.numberedStage, {
                      position: index + 1,
                      label,
                    })}
                  </DualLink>
                </li>
              ))}
          </ol>
          <li className={`list-none ${headingClass}`}>
            {intl.formatMessage(messages.codebook)}
          </li>
          <ul>
            {protocol.codebook?.ego && (
              <li>
                <DualLink to="#ego">
                  {intl.formatMessage(messages.ego)}
                </DualLink>
              </li>
            )}
            <li className={headingClass}>
              {intl.formatMessage(messages.nodeTypes)}
            </li>
            <ul>
              {nodes.map(([id]) => (
                <li key={id}>
                  <EntityBadge type={id} entity="node" link tiny />
                </li>
              ))}
            </ul>
            {!isEmpty(edges) && (
              <>
                <li className={headingClass}>
                  {intl.formatMessage(messages.edgeTypes)}
                </li>
                <ul>
                  {edges.map(([id]) => (
                    <li key={id}>
                      <EntityBadge type={id} entity="edge" link tiny />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </ul>
          {!isEmpty(assets) && (
            <>
              <li className={`list-none ${headingClass}`}>
                {intl.formatMessage(messages.assets)}
              </li>
              <ul>
                {assets &&
                  map(assets, (typeAssets, type) => (
                    <React.Fragment key={type}>
                      <li className={headingClass}>
                        {formatAssetType(type, intl)}
                      </li>
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
