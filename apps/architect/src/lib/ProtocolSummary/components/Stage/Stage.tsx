import { isEmpty } from 'es-toolkit/compat';
import React, { useContext, useMemo } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Heading from '@codaco/fresco-ui/typography/Heading';
import StageTypeImage from '@codaco/protocol-builder/interfaces/StageTypeImage';
import {
  type DynamicValues,
  type FamilyPedigreeNominationPrompt,
  type FinishMode,
  type FinishOutcome,
  type FramingSetting,
  type Item,
  type LocalizedString,
  type Panel,
  stageDynamicValueContext,
} from '@codaco/protocol-validation';
import { summaryMessages } from '~/lib/ProtocolSummary/summaryMessages';

import DualLink from '../DualLink';
import EntityBadge from '../EntityBadge';
import MiniTable from '../MiniTable';
import type { FilterType } from '../Rules';
import SummaryContext from '../SummaryContext';
import {
  DefaultLanguageText,
  SummaryDynamicValuesContext,
  SummaryText,
  useMultilingualSummary,
} from '../SummaryText';
import Anonymisation from './Anonymisation';
import Behaviours from './Behaviours';
import CanvasWording from './CanvasWording';
import ComposerEdges from './ComposerEdges';
import DataSource from './DataSource';
import FamilyPedigree, {
  type FamilyPedigreeCompleteness,
  type FamilyPedigreeEdgeConfiguration,
  type FamilyPedigreeNodeConfiguration,
} from './FamilyPedigree';
import FamilyTreeVariables from './FamilyTreeVariables';
import Filter from './Filter';
import FinishScreen from './FinishScreen';
import Form from './Form';
import InterviewScript from './InterviewScript';
import IntroductionPanel from './IntroductionPanel';
import Items from './Items';
import MapOptions from './MapOptions';
import NameGenerationStep from './NameGenerationStep';
import NarrativePedigree from './NarrativePedigree';
import PageHeading from './PageHeading';
import Panels from './Panels';
import Presets from './Presets';
import Prompts, { type PromptType } from './Prompts';
import QuickAdd from './QuickAdd';
import RosterPanel from './RosterPanel';
import ScaffoldingStep from './ScaffoldingStep';
import SectionFrame from './SectionFrame';
import SkipLogic from './SkipLogic';
import StageWording, { type StageWordingKey } from './StageWording';
const messages = defineMessages({
  networkFiltering: {
    id: 'architect.protocolSummary.stage.stage.networkFiltering',
    defaultMessage: 'Network Filtering',
    description:
      'The title text in lib / ProtocolSummary / components / Stage / Stage.',
  },
  skipLogic: {
    id: 'architect.protocolSummary.stage.stage.skipLogic',
    defaultMessage: 'Skip Logic',
    description:
      'The title text in lib / ProtocolSummary / components / Stage / Stage.',
  },
});

type FormFieldType = {
  prompt: LocalizedString;
  variable: string;
  [key: string]: unknown;
};
const variablesOnStage =
  (
    index: Array<{
      id: string;
      name: string;
      stages: string[];
    }>,
  ) =>
  (stageId: string) =>
    index.reduce<Array<[string, string]>>((memo, variable) => {
      if (!variable.stages.includes(stageId)) {
        return memo;
      }
      memo.push([variable.id, variable.name]);
      return memo;
    }, []);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The settings of a stage the summary prints. Every stage type holds its own
 * subset, so each is optional; the summary prints those the stage holds.
 */
export type StageConfiguration = {
  subject?: { type: string; entity: string };
  filter?: FilterType;
  skipLogic?: Record<string, unknown>;
  introductionPanel?: { title: LocalizedString; text?: LocalizedString };
  dataSource?: string;
  panelTitle?: LocalizedString;
  quickAdd?: string;
  panels?: Panel[];
  prompts?: PromptType[];
  form?: { title?: LocalizedString; fields?: FormFieldType[] };
  behaviours?: Record<string, unknown>;
  presets?: {
    id: string;
    label: LocalizedString;
    layoutVariable?: string;
    groupVariable?: string;
    edges?: { display?: { type: string; label: LocalizedString }[] };
    highlight?: { variable: string; label: LocalizedString }[];
  }[];
  title?: LocalizedString;
  items?: Item[];
  interviewScript?: string;
  content?: LocalizedString;
  finishedContent?: LocalizedString;
  mode?: FinishMode;
  outcome?: FinishOutcome;
  finishLabel?: LocalizedString;
  finishConfirmation?: LocalizedString;
  finishFailed?: LocalizedString;
  edgeType?: { type: string; entity: string };
  relationshipTypeVariable?: string;
  relationshipToEgoVariable?: string;
  egoSexVariable?: string;
  nodeSexVariable?: string;
  nodeIsEgoVariable?: string;
  scaffoldingStep?: { text: LocalizedString; showQuickStartModal: boolean };
  nameGenerationStep?: {
    text: LocalizedString;
    form: { fields?: { variable: string; prompt: LocalizedString }[] };
  };
  prompt?: LocalizedString;
  nodeConfiguration?: FamilyPedigreeNodeConfiguration;
  edgeConfiguration?: FamilyPedigreeEdgeConfiguration;
  completeness?: FamilyPedigreeCompleteness;
  framing?: FramingSetting;
  wording?: Record<string, LocalizedString | undefined>;
  nominationPrompts?: FamilyPedigreeNominationPrompt[];
  sourceStageId?: string;
  showAtRiskStatuses?: boolean;
  diseases?: {
    id: string;
    label: LocalizedString;
    color: string;
    attribute: string;
    inheritancePattern: string;
  }[];
  explanationText?: LocalizedString;
  validation?: { minLength?: number; maxLength?: number };
  mapOptions?: {
    tokenAssetId?: string;
    dataSourceAssetId?: string;
    style?: string;
    center?: [number, number];
    initialZoom?: number;
    color?: string;
    targetFeatureProperty?: string;
  };
  edges?: { subject: { type: string }; label: LocalizedString }[];
  dynamicValues?: DynamicValues;
} & Partial<Record<StageWordingKey, LocalizedString>>;

type StageProps = {
  configuration: StageConfiguration;
  id: string;
  label: LocalizedString;
  stageNumber: number;
  type: string;
};
const StageContent = ({
  configuration,
  id,
  label,
  stageNumber,
  type,
}: StageProps) => {
  const intl = useAppIntl();
  const { index } = useContext(SummaryContext);
  const multilingual = useMultilingualSummary();
  const stageVariables = variablesOnStage(index)(id).toSorted((a, b) =>
    a[1].localeCompare(b[1], intl.locale),
  );
  // Format literal names first: opaque React-node tokens hide the initial
  // sound that selects Spanish "y" versus "e". Consume links by position so
  // identical authored names still retain their own attribute targets.
  let nextVariable = 0;
  const stageVariableList = intl
    .formatListToParts(stageVariables.map(([, name]) => name))
    .map((part) => {
      if (part.type === 'literal') return part.value;
      const variable = stageVariables[nextVariable++];
      if (!variable) return part.value;
      return (
        <DualLink key={variable[0]} to={`#variable-${variable[0]}`}>
          {part.value}
        </DualLink>
      );
    });
  const {
    subject,
    filter,
    skipLogic,
    introductionPanel,
    dataSource,
    panelTitle,
    quickAdd,
    panels,
    prompts,
    form,
    behaviours,
    presets,
    title,
    items,
    interviewScript,
    // FinishSession
    content,
    finishedContent,
    mode: finishMode,
    outcome,
    finishLabel,
    finishConfirmation,
    finishFailed,
    // Legacy FamilyTreeCensus fields (kept for backward compatibility with old protocols)
    edgeType,
    relationshipTypeVariable,
    relationshipToEgoVariable,
    egoSexVariable,
    nodeSexVariable,
    nodeIsEgoVariable,
    scaffoldingStep,
    nameGenerationStep,
    // FamilyPedigree
    nodeConfiguration,
    edgeConfiguration,
    completeness,
    framing,
    nominationPrompts,
    // Anonymisation
    explanationText,
    validation,
    // Geospatial
    mapOptions,
  } = configuration;
  const finishing = { finishLabel, finishConfirmation, finishFailed };
  const pedigreePrompt =
    type === 'FamilyPedigree' ? (configuration.prompt ?? null) : null;
  // The words the participant sees, which the summary prints beside the rest.
  const pedigreeWording =
    type === 'FamilyPedigree' ? (configuration.wording ?? null) : null;
  // NarrativePedigree
  const narrativePedigree =
    type === 'NarrativePedigree'
      ? {
          sourceStageId: configuration.sourceStageId ?? '',
          showAtRiskStatuses: configuration.showAtRiskStatuses === true,
          diseases: configuration.diseases ?? [],
        }
      : null;
  return (
    <div
      // oxlint-disable-next-line tailwindcss/no-unknown-classes -- print stylesheet + e2e selector hook
      className="page-break-marker flex break-before-page flex-col gap-6"
      id={`stage-${id}`}
    >
      <div className="flex items-center">
        <div className="me-5 flex-1">
          <div
            className="before:bg-cyber-grape flex items-center text-2xl font-bold before:me-5 before:flex before:size-19 before:flex-none before:items-center before:justify-center before:rounded-full before:[font-family:var(--heading-font)] before:text-white before:content-[attr(data-number)]"
            data-number={intl.formatNumber(stageNumber)}
          >
            <Heading level="h1">
              <DefaultLanguageText value={label} />
            </Heading>
          </div>
          {(multilingual ||
            subject ||
            edgeType ||
            !isEmpty(stageVariables)) && (
            <MiniTable
              rotated
              wide={multilingual}
              rows={[
                // The heading names the stage in the default language; every
                // translation of its name is listed here.
                ...(multilingual
                  ? [
                      [
                        intl.formatMessage(summaryMessages.name),
                        <SummaryText key="name" value={label} />,
                      ],
                    ]
                  : []),
                ...(subject
                  ? [
                      [
                        intl.formatMessage(summaryMessages.subject),
                        <EntityBadge
                          key="subject"
                          small
                          iconSize="tiny"
                          type={subject.type}
                          entity={subject.entity}
                          link
                        />,
                      ],
                    ]
                  : []),
                ...(edgeType
                  ? [
                      [
                        intl.formatMessage(summaryMessages.edgeType),
                        <EntityBadge
                          key="edge-type"
                          small
                          iconSize="tiny"
                          type={edgeType.type}
                          entity="edge"
                          link
                        />,
                      ],
                    ]
                  : []),
                ...(!isEmpty(stageVariables)
                  ? [
                      [
                        intl.formatMessage(summaryMessages.attributes),
                        <React.Fragment key="vars">
                          {stageVariableList}
                        </React.Fragment>,
                      ],
                    ]
                  : []),
              ]}
            />
          )}
        </div>
        <div className="relative flex flex-[0_0_4.25cm] items-center">
          <div className="flex-1 [&_img]:w-full [&_img]:rounded-sm">
            {/* eager: the summary is rendered for print, where lazy
            images may never load before the print snapshot. */}
            <StageTypeImage
              type={type}
              ratio="4:3"
              sizes="4.25cm"
              loading="eager"
              alt=""
            />
          </div>
        </div>
      </div>
      {filter && (
        <SectionFrame title={intl.formatMessage(messages.networkFiltering)}>
          <MiniTable
            rotated
            wide
            rows={[
              [
                intl.formatMessage(summaryMessages.rules),
                <Filter key="filter" filter={filter} />,
              ],
            ]}
          />
        </SectionFrame>
      )}
      {skipLogic && (
        <SectionFrame title={intl.formatMessage(messages.skipLogic)}>
          <SkipLogic skipLogic={skipLogic} />
        </SectionFrame>
      )}
      <IntroductionPanel introductionPanel={introductionPanel ?? null} />
      <MapOptions mapOptions={mapOptions ?? null} />
      <DataSource dataSource={dataSource ?? null} />
      <RosterPanel panelTitle={panelTitle ?? null} />
      <QuickAdd quickAdd={quickAdd ?? null} />
      <Panels panels={panels ?? null} />
      <Prompts prompts={prompts ?? null} />
      <Form form={form ?? null} />
      <Behaviours behaviours={behaviours ?? null} />
      <StageWording type={type} configuration={configuration} />
      <Presets presets={presets ?? null} />
      {type === 'NetworkComposer' && (
        <ComposerEdges edges={configuration.edges ?? null} />
      )}
      <PageHeading heading={title ?? null} />
      <Items items={items ?? null} />
      <FamilyTreeVariables
        relationshipTypeVariable={relationshipTypeVariable}
        relationshipToEgoVariable={relationshipToEgoVariable}
        egoSexVariable={egoSexVariable}
        nodeSexVariable={nodeSexVariable}
        nodeIsEgoVariable={nodeIsEgoVariable}
      />
      <FamilyPedigree
        personType={subject?.type ?? null}
        prompt={pedigreePrompt}
        nodeConfiguration={nodeConfiguration ?? null}
        edgeConfiguration={edgeConfiguration ?? null}
        completeness={completeness ?? null}
        framing={framing ?? null}
        wording={pedigreeWording}
        nominationPrompts={nominationPrompts ?? null}
      />
      {narrativePedigree && <NarrativePedigree {...narrativePedigree} />}
      <ScaffoldingStep scaffoldingStep={scaffoldingStep ?? null} />
      <NameGenerationStep nameGenerationStep={nameGenerationStep ?? null} />
      {type === 'Anonymisation' && (
        <Anonymisation
          explanationText={explanationText ?? null}
          validation={validation ?? null}
        />
      )}
      {type === 'FinishSession' && (
        <FinishScreen
          mode={finishMode ?? 'confirmation'}
          content={content ?? null}
          finishedContent={finishedContent ?? null}
          outcome={outcome ?? null}
          finishing={finishing}
        />
      )}
      <CanvasWording type={type} configuration={configuration} />
      <InterviewScript interviewScript={interviewScript ?? null} />
    </div>
  );
};
/**
 * A stage, and what its text that shows values can show: every value its
 * prompts or its form's fields could, so each binding reads as the value it
 * stands for wherever the summary prints it.
 */
const Stage = (props: StageProps) => {
  const { protocol } = useContext(SummaryContext);
  const { configuration, type } = props;
  const site = useMemo(
    () => ({
      context: stageDynamicValueContext({
        codebook: protocol.codebook,
        stage: { ...configuration, type },
      }),
      bindings: isRecord(configuration.dynamicValues)
        ? configuration.dynamicValues
        : {},
    }),
    [configuration, type, protocol.codebook],
  );
  return (
    <SummaryDynamicValuesContext value={site}>
      <StageContent {...props} />
    </SummaryDynamicValuesContext>
  );
};

export default Stage;
