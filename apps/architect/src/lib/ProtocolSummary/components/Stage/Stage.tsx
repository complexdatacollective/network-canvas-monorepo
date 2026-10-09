import { isEmpty } from 'es-toolkit/compat';
import React, { useContext } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Heading from '@codaco/fresco-ui/typography/Heading';
import StageTypeImage from '@codaco/protocol-builder/interfaces/StageTypeImage';
import type {
  FamilyPedigreeNominationPrompt,
  FinishOutcome,
  FramingSetting,
  Item,
  LocalizedString,
  Panel,
} from '@codaco/protocol-validation';
import { summaryMessages } from '~/lib/ProtocolSummary/summaryMessages';

import DualLink from '../DualLink';
import EntityBadge from '../EntityBadge';
import MiniTable from '../MiniTable';
import SummaryContext from '../SummaryContext';
import {
  DefaultLanguageText,
  SummaryText,
  useMultilingualSummary,
} from '../SummaryText';
import Anonymisation from './Anonymisation';
import Behaviours from './Behaviours';
import CanvasWording from './CanvasWording';
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
type StageProps = {
  configuration: Record<string, unknown>;
  id: string;
  label: LocalizedString;
  stageNumber: number;
  type: string;
};
const Stage = ({ configuration, id, label, stageNumber, type }: StageProps) => {
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
  const subject = configuration.subject as
    | {
        type: string;
        entity: string;
      }
    | undefined;
  const filter = configuration.filter as Record<string, unknown> | undefined;
  const skipLogic = configuration.skipLogic as
    | Record<string, unknown>
    | undefined;
  const introductionPanel = configuration.introductionPanel as
    | {
        title: LocalizedString;
        text: LocalizedString;
      }
    | undefined;
  const dataSource = configuration.dataSource as string | undefined;
  const panelTitle = configuration.panelTitle as LocalizedString | undefined;
  const quickAdd = configuration.quickAdd as string | undefined;
  const panels = configuration.panels as Panel[] | undefined;
  const prompts = configuration.prompts as PromptType[] | undefined;
  const form = configuration.form as
    | {
        title?: LocalizedString;
        fields?: FormFieldType[];
      }
    | undefined;
  const behaviours = configuration.behaviours as
    | Record<string, unknown>
    | undefined;
  const presets = configuration.presets as
    | {
        id: string;
        label: LocalizedString;
        layoutVariable?: string;
        groupVariable?: string;
        edges?: {
          display?: string[];
        };
        highlight?: { variable: string; label: LocalizedString }[];
      }[]
    | undefined;
  const title = configuration.title as LocalizedString | undefined;
  const items = configuration.items as Item[] | undefined;
  const interviewScript = configuration.interviewScript as string | undefined;
  // FinishSession
  const content = configuration.content as LocalizedString | undefined;
  const outcome = configuration.outcome as FinishOutcome | undefined;
  const finishing = {
    finishLabel: configuration.finishLabel as LocalizedString | undefined,
    finishConfirmation: configuration.finishConfirmation as
      | LocalizedString
      | undefined,
    finishedNotice: configuration.finishedNotice as LocalizedString | undefined,
    finishFailed: configuration.finishFailed as LocalizedString | undefined,
  };
  // Legacy FamilyTreeCensus fields (kept for backward compatibility with old protocols)
  const edgeType = configuration.edgeType as
    | {
        type: string;
        entity: string;
      }
    | undefined;
  const relationshipTypeVariable = configuration.relationshipTypeVariable as
    | string
    | undefined;
  const relationshipToEgoVariable = configuration.relationshipToEgoVariable as
    | string
    | undefined;
  const egoSexVariable = configuration.egoSexVariable as string | undefined;
  const nodeSexVariable = configuration.nodeSexVariable as string | undefined;
  const nodeIsEgoVariable = configuration.nodeIsEgoVariable as
    | string
    | undefined;
  const scaffoldingStep = configuration.scaffoldingStep as
    | {
        text: LocalizedString;
        showQuickStartModal: boolean;
      }
    | undefined;
  const nameGenerationStep = configuration.nameGenerationStep as
    | {
        text: LocalizedString;
        form: {
          fields?: Array<{
            variable: string;
            prompt: LocalizedString;
          }>;
        };
      }
    | undefined;
  // FamilyPedigree
  const pedigreePrompt =
    type === 'FamilyPedigree'
      ? ((configuration.prompt as LocalizedString | undefined) ?? null)
      : null;
  const nodeConfiguration = configuration.nodeConfiguration as
    | FamilyPedigreeNodeConfiguration
    | undefined;
  const edgeConfiguration = configuration.edgeConfiguration as
    | FamilyPedigreeEdgeConfiguration
    | undefined;
  const completeness = configuration.completeness as
    | FamilyPedigreeCompleteness
    | undefined;
  const framing = configuration.framing as FramingSetting | undefined;
  const nominationPrompts = configuration.nominationPrompts as
    | FamilyPedigreeNominationPrompt[]
    | undefined;
  // NarrativePedigree
  const narrativePedigree =
    type === 'NarrativePedigree'
      ? {
          sourceStageId: String(configuration.sourceStageId ?? ''),
          showAtRiskStatuses: configuration.showAtRiskStatuses === true,
          diseases: (configuration.diseases ?? []) as {
            id: string;
            label: LocalizedString;
            color: string;
            attribute: string;
            inheritancePattern: string;
          }[],
        }
      : null;
  // Anonymisation
  const explanationText = configuration.explanationText as
    | {
        title: LocalizedString;
        body: LocalizedString;
      }
    | undefined;
  const validation = configuration.validation as
    | {
        minLength?: number;
        maxLength?: number;
      }
    | undefined;
  // Geospatial
  const mapOptions = configuration.mapOptions as
    | {
        tokenAssetId?: string;
        dataSourceAssetId?: string;
        style?: string;
        center?: [number, number];
        initialZoom?: number;
        color?: string;
        targetFeatureProperty?: string;
      }
    | undefined;
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
      <Presets presets={presets ?? null} />
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
          content={content ?? null}
          outcome={outcome ?? null}
          finishing={finishing}
        />
      )}
      <CanvasWording type={type} configuration={configuration} />
      <InterviewScript interviewScript={interviewScript ?? null} />
    </div>
  );
};
export default Stage;
