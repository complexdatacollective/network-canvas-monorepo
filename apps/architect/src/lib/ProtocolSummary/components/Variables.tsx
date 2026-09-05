import { find, get, isEmpty, sortBy, toPairs } from 'es-toolkit/compat';
import type { ReactNode } from 'react';
import React, { useContext } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import type { Variable } from '@codaco/protocol-validation';
import Markdown from '~/components/Markdown';
import { VariablePill } from '~/components/VariablePill';
import { VARIABLE_TYPES } from '~/config/variables';
import { formatConfig } from '~/i18n/formatConfig';
import { summaryMessages } from '~/lib/ProtocolSummary/summaryMessages';

import DualLink from './DualLink';
import { SummaryValue } from './helpers';
import MiniTable from './MiniTable';
import SummaryContext from './SummaryContext';
const messages = defineMessages({
  name: {
    id: 'architect.protocolSummary.variables.name',
    defaultMessage: 'Name',
    description:
      'Visible text in lib / ProtocolSummary / components / Variables.',
  },
  type: {
    id: 'architect.protocolSummary.variables.type',
    defaultMessage: 'Type',
    description:
      'Visible text in lib / ProtocolSummary / components / Variables.',
  },
  usedIn: {
    id: 'architect.protocolSummary.variables.usedIn',
    defaultMessage: 'Used In',
    description:
      'Visible text in lib / ProtocolSummary / components / Variables.',
  },
  noAttributesToDisplay: {
    id: 'architect.protocolSummary.variables.noAttributesToDisplay',
    defaultMessage: 'No attributes to display.',
    description:
      'Visible text in lib / ProtocolSummary / components / Variables.',
  },
});

type ProtocolType = {
  stages?: Array<{ id: string; label: string }>;
  [key: string]: unknown;
};

type IndexEntry = {
  id: string;
  stages?: string[];
  [key: string]: unknown;
};

const getStageName = (protocol: ProtocolType) => (stageId: string) => {
  const stageConfiguration = find(protocol.stages, ['id', stageId]);
  return get(stageConfiguration, 'label');
};

// TODO: Make this part of the index?
const makeGetUsedIn =
  (protocol: ProtocolType) => (indexEntry: IndexEntry | undefined) => {
    const stages = get(indexEntry, 'stages', []) as string[];

    return stages.map((stageId: string) => [
      stageId,
      getStageName(protocol)(stageId),
    ]);
  };

type VariablesProps = {
  variables?: Record<string, unknown>;
};

const Variables = ({ variables }: VariablesProps) => {
  const intl = useAppIntl();
  const { protocol, index } = useContext(SummaryContext);

  const getUsedIn = makeGetUsedIn(protocol as ProtocolType);

  const sortedVariables = sortBy(toPairs(variables), [
    (variable) => (variable[1] as Variable).name.toLowerCase(),
  ]);

  return (
    <div className="[&_a]:text-neon-coral">
      <table className="[&_thead>tr>th]:bg-platinum [&_tbody>tr>td]:border-t-platinum-dark w-full [&_tbody>tr>td]:border-t [&_tbody>tr>td]:p-2.5 [&_tbody>tr>td]:align-top [&_tbody>tr>td:first-of-type]:wrap-break-word [&_tbody>tr>td:first-of-type]:hyphens-auto [&_td]:max-w-[7cm] [&_th]:max-w-[7cm] [&_thead>tr>th]:p-2.5 [&_thead>tr>th]:pe-5 [&_thead>tr>th]:align-top">
        <thead>
          <tr>
            <th>{intl.formatMessage(messages.name)}</th>
            <th>{intl.formatMessage(messages.type)}</th>
            <th>{intl.formatMessage(messages.usedIn)}</th>
          </tr>
        </thead>
        <tbody>
          {isEmpty(variables) && (
            <tr>
              <td colSpan={3}>
                {intl.formatMessage(messages.noAttributesToDisplay)}
              </td>
            </tr>
          )}
          {sortedVariables.map(([variableId, variableConfiguration]) => {
            const config = variableConfiguration as Variable;
            const { name, type } = config;

            const indexEntry = index.find(
              ({ id }: { id: string }) => id === variableId,
            ) as IndexEntry | undefined;

            let optionsRows: ReactNode[][] = [];

            if ('options' in config) {
              optionsRows =
                config.options?.map(({ value, label }) => [
                  <span key={`val-${String(value)}`}>
                    {<SummaryValue value={value} />}
                  </span>,
                  <Markdown key={`label-${String(value)}`} label={label} />,
                ]) ?? [];
            }

            return (
              <tr key={variableId} id={`variable-${variableId}`}>
                <td>
                  <VariablePill
                    className="max-w-[7cm]"
                    label={name}
                    type={type}
                  />
                </td>
                <td>
                  {formatConfig(VARIABLE_TYPES[type], intl)?.label ?? type}
                  <br />
                  <br />
                  {optionsRows.length > 0 && (
                    <MiniTable
                      className="m-0 max-w-[7cm]"
                      rows={[
                        [
                          intl.formatMessage(summaryMessages.value),
                          intl.formatMessage(summaryMessages.label),
                        ],
                        ...optionsRows,
                      ]}
                    />
                  )}
                </td>
                <td>
                  {getUsedIn(indexEntry).map(([stageId, stageName]) => (
                    <React.Fragment key={String(stageId)}>
                      <DualLink to={`#stage-${String(stageId)}`}>
                        {String(stageName)}
                      </DualLink>
                      <br />
                    </React.Fragment>
                  ))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default Variables;
