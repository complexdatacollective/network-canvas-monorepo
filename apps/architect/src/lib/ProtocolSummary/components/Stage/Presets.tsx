import { get } from 'es-toolkit/compat';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { summaryMessages } from '~/lib/ProtocolSummary/summaryMessages';

import EntityBadge from '../EntityBadge';
import MiniTable from '../MiniTable';
import Variable from '../Variable';
import SectionFrame from './SectionFrame';
const messages = defineMessages({
  presets: {
    id: 'architect.protocolSummary.stage.presets.presets',
    defaultMessage: 'Presets',
    description:
      'The title text in lib / ProtocolSummary / components / Stage / Presets.',
  },
});

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
  const intl = useAppIntl();
  if (!presets) {
    return null;
  }

  return (
    <SectionFrame title={intl.formatMessage(messages.presets)}>
      <div className="flex flex-col gap-5 pt-5">
        {presets.map((preset) => (
          <div key={preset.label}>
            <SectionFrame title={preset.label}>
              <MiniTable
                rotated
                rows={[
                  [
                    intl.formatMessage(summaryMessages.layoutAttribute),
                    <Variable
                      key={`layout-${preset.layoutVariable}`}
                      id={preset.layoutVariable ?? ''}
                    />,
                  ],
                  [
                    intl.formatMessage(summaryMessages.showEdges),
                    <ul key="show-edges">
                      {get(preset, 'edges.display', []).map((edge: string) => (
                        <li key={edge}>
                          <EntityBadge entity="edge" type={edge} tiny link />
                        </li>
                      ))}
                    </ul>,
                  ],
                  [
                    intl.formatMessage(summaryMessages.groupAttribute),
                    <Variable
                      key={`group-${preset.groupVariable}`}
                      id={preset.groupVariable ?? ''}
                    />,
                  ],
                  [
                    intl.formatMessage(summaryMessages.highlightAttributes),
                    <ul key="highlight">
                      {get(preset, 'highlight', []).map((id: string) => (
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
          </div>
        ))}
      </div>
    </SectionFrame>
  );
};

export default Presets;
