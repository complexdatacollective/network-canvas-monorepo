import { type ReactNode, useContext } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { UnorderedList } from '@codaco/fresco-ui/typography/UnorderedList';
import { narrativePedigreeMessages } from '@codaco/protocol-builder/editors/narrative-pedigree/narrativePedigreeMessages';
import { interfaceDisplayName } from '@codaco/protocol-builder/interfaces/interfaceNames';
import type {
  InheritancePattern,
  LocalizedString,
} from '@codaco/protocol-validation';
import { summaryMessages } from '~/lib/ProtocolSummary/summaryMessages';

import DualLink from '../DualLink';
import MiniTable from '../MiniTable';
import SummaryContext from '../SummaryContext';
import { DefaultLanguageText, SummaryText } from '../SummaryText';
import Variable from '../Variable';
import SectionFrame from './SectionFrame';

const messages = defineMessages({
  atRiskStatusesShown: {
    id: 'architect.protocolSummary.stage.narrativePedigree.atRiskStatusesShown',
    defaultMessage: '{shown, select, true {Shown} other {Not shown}}',
    description:
      'Value, in the printable protocol summary, saying whether a Narrative Pedigree stage draws the possible (at-risk) statuses it infers, beside the label "Show possible (at-risk) statuses".',
  },
});

const INHERITANCE_MESSAGES = {
  autosomalDominant: narrativePedigreeMessages.inheritanceAutosomalDominant,
  autosomalRecessive: narrativePedigreeMessages.inheritanceAutosomalRecessive,
  xLinkedDominant: narrativePedigreeMessages.inheritanceXLinkedDominant,
  xLinkedRecessive: narrativePedigreeMessages.inheritanceXLinkedRecessive,
  yLinked: narrativePedigreeMessages.inheritanceYLinked,
  mitochondrial: narrativePedigreeMessages.inheritanceMitochondrial,
  multifactorial: narrativePedigreeMessages.inheritanceMultifactorial,
  unknown: narrativePedigreeMessages.inheritanceUnknown,
} as const satisfies Record<InheritancePattern, unknown>;

const isInheritancePattern = (value: string): value is InheritancePattern =>
  Object.hasOwn(INHERITANCE_MESSAGES, value);

type Disease = {
  id: string;
  label: LocalizedString;
  color: string;
  attribute: string;
  inheritancePattern: string;
};

type NarrativePedigreeProps = {
  sourceStageId: string;
  showAtRiskStatuses: boolean;
  diseases: Disease[];
};

/** The theme colour a disease's palette entry (`node-color-seq-3`) names. */
const swatchColor = (color: string) =>
  `var(--node-${color.replace('node-color-seq-', '')})`;

/**
 * Which Family Pedigree a Narrative Pedigree stage draws, whether it shows the
 * statuses it infers, and each disease it overlays: the attribute that says
 * who has it, its colour, and how it is inherited.
 */
const NarrativePedigree = ({
  sourceStageId,
  showAtRiskStatuses,
  diseases,
}: NarrativePedigreeProps) => {
  const intl = useAppIntl();
  const { protocol } = useContext(SummaryContext);
  const source = protocol.stages.find((stage) => stage.id === sourceStageId);

  const rows: [string, ReactNode][] = [
    [
      intl.formatMessage(narrativePedigreeMessages.sourceLabel),
      source ? (
        <DualLink key="source" to={`#stage-${source.id}`}>
          <DefaultLanguageText value={source.label} />
        </DualLink>
      ) : (
        sourceStageId
      ),
    ],
    [
      intl.formatMessage(narrativePedigreeMessages.atRiskFieldLabel),
      intl.formatMessage(messages.atRiskStatusesShown, {
        shown: String(showAtRiskStatuses),
      }),
    ],
  ];

  return (
    <>
      <SectionFrame
        title={interfaceDisplayName('NarrativePedigree', intl) ?? ''}
      >
        <MiniTable rotated wide rows={rows} />
      </SectionFrame>
      {diseases.length > 0 && (
        <SectionFrame
          title={intl.formatMessage(narrativePedigreeMessages.diseasesTitle)}
        >
          <UnorderedList>
            {diseases.map((disease) => (
              <li className="my-5" key={disease.id}>
                <div className="break-inside-avoid">
                  <div className="flex items-center gap-2 font-semibold">
                    <span
                      aria-hidden
                      className="inline-block size-4 flex-none rounded-full"
                      style={{ backgroundColor: swatchColor(disease.color) }}
                    />
                    <SummaryText value={disease.label} />
                  </div>
                  <MiniTable
                    rotated
                    rows={[
                      [
                        intl.formatMessage(summaryMessages.attribute),
                        <Variable key="attribute" id={disease.attribute} />,
                      ],
                      [
                        intl.formatMessage(
                          narrativePedigreeMessages.diseaseInheritanceLabel,
                        ),
                        isInheritancePattern(disease.inheritancePattern)
                          ? intl.formatMessage(
                              INHERITANCE_MESSAGES[disease.inheritancePattern],
                            )
                          : disease.inheritancePattern,
                      ],
                    ]}
                  />
                </div>
              </li>
            ))}
          </UnorderedList>
        </SectionFrame>
      )}
    </>
  );
};

export default NarrativePedigree;
