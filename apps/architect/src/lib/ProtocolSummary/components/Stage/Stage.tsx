import { isEmpty } from 'es-toolkit/compat';
import React, { useContext, useMemo } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Heading from '@codaco/fresco-ui/typography/Heading';
import StageTypeImage from '@codaco/protocol-builder/interfaces/StageTypeImage';
import {
  type FamilyPedigreeNominationPrompt,
  type FinishMode,
  type FinishOutcome,
  type FramingSetting,
  type LocalizedString,
  type Panel,
  type Stage as ProtocolStage,
  type StageSubject,
  stageDynamicValueContext,
  suppliedStageSettingApplies,
} from '@codaco/protocol-validation';
import { summaryMessages } from '~/lib/ProtocolSummary/summaryMessages';

import DualLink from '../DualLink';
import EntityBadge from '../EntityBadge';
import LayoutName from '../LayoutName';
import MiniTable from '../MiniTable';
import PrintedPage from '../PrintedPage';
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
import MapOptions from './MapOptions';
import NameGenerationStep from './NameGenerationStep';
import NarrativePedigree from './NarrativePedigree';
import PageContent from './PageContent';
import PageHeading from './PageHeading';
import Panels from './Panels';
import Presets from './Presets';
import Prompts, { type PromptType } from './Prompts';
import QuickAdd from './QuickAdd';
import RosterPanel from './RosterPanel';
import ScaffoldingStep from './ScaffoldingStep';
import SectionFrame from './SectionFrame';
import SkipLogic from './SkipLogic';
import StageWording from './StageWording';
const messages = defineMessages({
  networkFiltering: {
    id: 'architect.protocolSummary.stage.stage.networkFiltering',
    defaultMessage: 'Network Filtering',
    description:
      'Section heading in the printable protocol summary, above the rules that decide which nodes of the network a stage shows.',
  },
  skipLogic: {
    id: 'architect.protocolSummary.stage.stage.skipLogic',
    defaultMessage: 'Skip Logic',
    description:
      'Section heading in the printable protocol summary, above the rules that decide when a stage is skipped during an interview.',
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
/**
 * Canvas stage types whose built-in wording the summary prints after
 * everything else the stage holds, and only the settings the stage's
 * choices make apply (a heading no preset uses is never shown).
 */
const WORDING_AFTER_CANVAS: ReadonlySet<string> = new Set([
  'Narrative',
  'NarrativePedigree',
]);

/**
 * Stage types whose built-in wording another section prints: a Family
 * Pedigree's in its own sections, a Finish stage's among its screens, and a
 * Language Chooser's heading as the stage's page heading.
 */
const WORDING_PRINTED_ELSEWHERE: ReadonlySet<string> = new Set([
  'FamilyPedigree',
  'FinishSession',
  'LanguageChooser',
]);

/** The types a stage's subject names: a node subject's list, or its edge type. */
const subjectTypes = (subject: StageSubject): string[] => {
  if (subject.entity === 'node') return subject.types;
  if (subject.entity === 'edge') return [subject.type];
  return [];
};

/**
 * The settings of a stage the summary prints. Every stage type holds its own
 * subset, so each is optional; the summary prints those the stage holds.
 * Its built-in wording settings are not listed: `StageWording` reads each by
 * the path the stage editor's rules give it.
 */
export type StageConfiguration = {
  subject?: StageSubject;
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
  layout?: Extract<
    ProtocolStage,
    { type: 'Sociogram' | 'NetworkComposer' }
  >['layout'];
  presets?: {
    id: string;
    label: LocalizedString;
    layout?: Extract<
      ProtocolStage,
      { type: 'Narrative' }
    >['presets'][number]['layout'];
    groupVariable?: string;
    edges?: { display?: { type: string; label: LocalizedString }[] };
    highlight?: {
      id: string;
      label: LocalizedString;
      attributes: { id: string; type: string; variable: string }[];
    }[];
  }[];
  title?: LocalizedString;
  interviewScript?: string;
  content?: LocalizedString;
  finishedContent?: LocalizedString;
  mode?: FinishMode;
  outcome?: FinishOutcome;
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
} & Readonly<Record<string, unknown>>;

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
          <bdi>{part.value}</bdi>
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
    layout,
    title,
    interviewScript,
    // FinishSession
    content,
    finishedContent,
    mode: finishMode,
    outcome,
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
  const stage = { ...configuration, type };
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
    <PrintedPage id={`stage-${id}`}>
      <div className="flex items-center">
        <div className="me-5 flex-1">
          <div
            className="before:bg-cyber-grape flex items-center text-2xl font-bold before:me-5 before:flex before:size-19 before:flex-none before:items-center before:justify-center before:rounded-full before:[font-family:var(--heading-font)] before:text-white before:content-[attr(data-number)]"
            data-number={intl.formatNumber(stageNumber)}
          >
            {/* A stage name may be one long word; it breaks rather than
                widening the page. */}
            <Heading level="h1" className="min-w-0 wrap-anywhere">
              <DefaultLanguageText value={label} />
            </Heading>
          </div>
          {(multilingual ||
            subject ||
            layout !== undefined ||
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
                        <div key="name" className="wrap-anywhere">
                          <SummaryText value={label} />
                        </div>,
                      ],
                    ]
                  : []),
                ...(subject
                  ? [
                      [
                        intl.formatMessage(summaryMessages.subject),
                        <React.Fragment key="subject">
                          {subjectTypes(subject).map((subjectType) => (
                            <EntityBadge
                              key={subjectType}
                              small
                              iconSize="tiny"
                              type={subjectType}
                              entity={subject.entity}
                              link
                            />
                          ))}
                        </React.Fragment>,
                      ],
                    ]
                  : []),
                ...(layout === undefined
                  ? []
                  : [
                      [
                        intl.formatMessage(summaryMessages.layout),
                        <LayoutName key="layout" id={layout} />,
                      ],
                    ]),
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
      {!WORDING_AFTER_CANVAS.has(type) &&
        !WORDING_PRINTED_ELSEWHERE.has(type) && <StageWording stage={stage} />}
      <Presets
        presets={presets ?? null}
        nodeTypes={subject?.entity === 'node' ? subject.types : []}
      />
      {type === 'NetworkComposer' && (
        <ComposerEdges edges={configuration.edges ?? null} />
      )}
      <PageHeading heading={title ?? null} />
      {type === 'Information' && <PageContent content={content ?? null} />}
      <FamilyTreeVariables
        relationshipTypeVariable={relationshipTypeVariable}
        relationshipToEgoVariable={relationshipToEgoVariable}
        egoSexVariable={egoSexVariable}
        nodeSexVariable={nodeSexVariable}
        nodeIsEgoVariable={nodeIsEgoVariable}
      />
      <FamilyPedigree
        personType={
          subject?.entity === 'node' ? (subject.types[0] ?? null) : null
        }
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
          stage={stage}
        />
      )}
      {WORDING_AFTER_CANVAS.has(type) && (
        <StageWording
          stage={stage}
          omits={(path) => !suppliedStageSettingApplies(stage, path.split('.'))}
        />
      )}
      <InterviewScript interviewScript={interviewScript ?? null} />
    </PrintedPage>
  );
};
const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * A stage, and what its text that shows values can show: every value its
 * prompts or its form's fields could, so each value in its text reads as
 * the value it stands for wherever the summary prints it.
 */
const Stage = (props: StageProps) => {
  const { protocol } = useContext(SummaryContext);
  const { configuration, type } = props;
  const site = useMemo(() => {
    const conditions: unknown =
      'conditions' in configuration ? configuration.conditions : undefined;
    return {
      context: stageDynamicValueContext({
        codebook: protocol.codebook,
        stage: { ...configuration, type },
      }),
      // The codebook and the stage's conditions, so that a value the stage
      // cannot show is still called what it was, or said to be deleted.
      conditions: {
        values: isRecord(conditions) ? conditions : {},
        codebook: protocol.codebook,
        subject: undefined,
        allowEgoRules: true,
      },
    };
  }, [configuration, type, protocol.codebook]);
  return (
    <SummaryDynamicValuesContext value={site}>
      <StageContent {...props} />
    </SummaryDynamicValuesContext>
  );
};

export default Stage;
