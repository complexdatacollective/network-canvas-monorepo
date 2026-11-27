import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { narrativePresetMessages } from '@codaco/protocol-builder/editors/narrative/narrativePresetMessages';
import type { LocalizedString, Stage } from '@codaco/protocol-validation';
import { summaryMessages } from '~/lib/ProtocolSummary/summaryMessages';

import EntityBadge from '../EntityBadge';
import LayoutName from '../LayoutName';
import MiniTable from '../MiniTable';
import type { FilterType } from '../Rules';
import {
  DefaultLanguageText,
  SummaryText,
  useMultilingualSummary,
} from '../SummaryText';
import Variable from '../Variable';
import Filter from './Filter';
import SectionFrame from './SectionFrame';
const messages = defineMessages({
  presets: {
    id: 'architect.protocolSummary.stage.presets.presets',
    defaultMessage: 'Presets',
    description:
      'Section heading in the printable protocol summary, above the list of presets (saved views) of a narrative stage.',
  },
});

type NarrativePreset = Extract<Stage, { type: 'Narrative' }>['presets'][number];

type PresetsProps = {
  presets?: Array<{
    id: string;
    label: LocalizedString;
    layout?: NarrativePreset['layout'];
    groupVariable?: string;
    edges?: { display?: { type: string; label: LocalizedString }[] };
    highlight?: { variable: string; label: LocalizedString }[];
    filter?: FilterType;
  }> | null;
};

const Presets = ({ presets = null }: PresetsProps) => {
  const intl = useAppIntl();
  const multilingual = useMultilingualSummary();
  if (!presets) {
    return null;
  }

  return (
    <SectionFrame title={intl.formatMessage(messages.presets)}>
      <div className="flex flex-col gap-5 pt-5">
        {presets.map((preset) => (
          <div key={preset.id}>
            <SectionFrame title={<DefaultLanguageText value={preset.label} />}>
              <MiniTable
                rotated
                rows={[
                  ...(multilingual
                    ? [
                        [
                          intl.formatMessage(summaryMessages.label),
                          <SummaryText key="label" value={preset.label} />,
                        ],
                      ]
                    : []),
                  ...(preset.layout === undefined
                    ? []
                    : [
                        [
                          intl.formatMessage(summaryMessages.layout),
                          <LayoutName key="layout" id={preset.layout} />,
                        ],
                      ]),
                  // A narrative stage has no filter of its own: each preset
                  // narrows the network for itself, so the rules are listed
                  // with the preset they belong to.
                  ...(preset.filter
                    ? [
                        [
                          intl.formatMessage(
                            narrativePresetMessages.presetFilterTitle,
                          ),
                          <Filter key="filter" filter={preset.filter} />,
                        ],
                      ]
                    : []),
                  [
                    intl.formatMessage(summaryMessages.showEdges),
                    <ul key="show-edges" className="flex flex-col gap-1">
                      {(preset.edges?.display ?? []).map(({ type, label }) =>
                        multilingual ? (
                          <li
                            key={type}
                            className="flex flex-col items-start gap-1"
                          >
                            <EntityBadge entity="edge" type={type} tiny link />
                            <SummaryText value={label} />
                          </li>
                        ) : (
                          <li
                            key={type}
                            className="flex flex-wrap items-center gap-2"
                          >
                            <SummaryText value={label} />
                            <EntityBadge entity="edge" type={type} tiny link />
                          </li>
                        ),
                      )}
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
                    <ul key="highlight" className="flex flex-col gap-1">
                      {(preset.highlight ?? []).map(({ variable, label }) =>
                        multilingual ? (
                          <li
                            key={variable}
                            className="flex flex-col items-start gap-1"
                          >
                            <Variable id={variable} />
                            <SummaryText value={label} />
                          </li>
                        ) : (
                          <li
                            key={variable}
                            className="flex flex-wrap items-center gap-2"
                          >
                            <SummaryText value={label} />
                            <Variable id={variable} />
                          </li>
                        ),
                      )}
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
