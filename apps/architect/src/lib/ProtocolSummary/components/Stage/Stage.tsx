import { isEmpty, sortBy } from 'es-toolkit/compat';
import React, { useContext } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Heading from '@codaco/fresco-ui/typography/Heading';
import StageTypeImage from '@codaco/protocol-builder/interfaces/StageTypeImage';
import { summaryMessages } from '~/lib/ProtocolSummary/summaryMessages';

import DualLink from '../DualLink';
import EntityBadge from '../EntityBadge';
import MiniTable from '../MiniTable';
import SummaryContext from '../SummaryContext';
import Anonymisation from './Anonymisation';
import Behaviours from './Behaviours';
import DataSource from './DataSource';
import DiseaseNominationPrompts from './DiseaseNominationPrompts';
import FamilyTreeVariables from './FamilyTreeVariables';
import Filter from './Filter';
import Form from './Form';
import InterviewScript from './InterviewScript';
import IntroductionPanel from './IntroductionPanel';
import Items from './Items';
import MapOptions from './MapOptions';
import NameGenerationStep from './NameGenerationStep';
import PageHeading from './PageHeading';
import Panels from './Panels';
import Presets from './Presets';
import Prompts, { type PromptType } from './Prompts';
import QuickAdd from './QuickAdd';
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
  prompt: string;
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
  label: string;
  stageNumber: number;
  type: string;
};
const Stage = ({ configuration, id, label, stageNumber, type }: StageProps) => {
  const intl = useAppIntl();
  const { index } = useContext(SummaryContext);
  const stageVariables = sortBy(variablesOnStage(index)(id), [
    (variable) => variable[1].toLowerCase(),
  ]);
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
        title: string;
        text: string;
      }
    | undefined;
  const dataSource = configuration.dataSource as string | undefined;
  const quickAdd = configuration.quickAdd as string | undefined;
  const panels = configuration.panels as
    | {
        id: string;
        title: string;
        dataSource: string;
      }[]
    | undefined;
  const prompts = configuration.prompts as PromptType[] | undefined;
  const form = configuration.form as
    | {
        title?: string;
        fields?: FormFieldType[];
      }
    | undefined;
  const behaviours = configuration.behaviours as
    | Record<string, unknown>
    | undefined;
  const presets = configuration.presets as
    | {
        label: string;
        layoutVariable?: string;
        groupVariable?: string;
        edges?: {
          display?: string[];
        };
        highlight?: string[];
      }[]
    | undefined;
  const title = configuration.title as string | undefined;
  const items = configuration.items as
    | {
        id?: string;
        type?: string;
        content?: string;
        size?: string;
      }[]
    | undefined;
  const interviewScript = configuration.interviewScript as string | undefined;
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
        text: string;
        showQuickStartModal: boolean;
      }
    | undefined;
  const nameGenerationStep = configuration.nameGenerationStep as
    | {
        text: string;
        form: {
          fields?: Array<{
            variable: string;
            prompt: string;
          }>;
        };
      }
    | undefined;
  const diseaseNominationStep = configuration.diseaseNominationStep as
    | Array<{
        id: string;
        text: string;
        variable: string;
      }>
    | undefined;
  // Anonymisation
  const explanationText = configuration.explanationText as
    | {
        title: string;
        body: string;
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
      className="page-break-marker flex break-before-page flex-col gap-6"
      id={`stage-${id}`}
    >
      <div className="flex items-center">
        <div className="me-5 flex-1">
          <div
            className="before:bg-cyber-grape flex items-center text-2xl font-bold before:me-5 before:flex before:size-19 before:flex-none before:items-center before:justify-center before:rounded-full before:[font-family:var(--heading-font)] before:text-white before:content-[attr(data-number)]"
            data-number={stageNumber}
          >
            <Heading level="h1">{label}</Heading>
          </div>
          {(subject || edgeType || !isEmpty(stageVariables)) && (
            <MiniTable
              rotated
              rows={[
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
                          {stageVariables.map(([variableId, variable], i) => (
                            <React.Fragment key={`${id}-${variableId}`}>
                              <DualLink to={`#variable-${variableId}`}>
                                {variable}
                              </DualLink>
                              {/* Separator between authored attribute names. */}
                              {/* oxlint-disable-next-line formatjs/no-literal-string-in-jsx */}
                              {i !== stageVariables.length - 1 && ', '}
                            </React.Fragment>
                          ))}
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
      <ScaffoldingStep scaffoldingStep={scaffoldingStep ?? null} />
      <NameGenerationStep nameGenerationStep={nameGenerationStep ?? null} />
      <DiseaseNominationPrompts
        diseaseNominationStep={diseaseNominationStep ?? null}
      />
      <Anonymisation
        explanationText={explanationText ?? null}
        validation={validation ?? null}
      />
      <InterviewScript interviewScript={interviewScript ?? null} />
    </div>
  );
};
export default Stage;
