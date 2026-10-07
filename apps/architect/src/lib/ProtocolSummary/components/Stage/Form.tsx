import { useContext } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Heading from '@codaco/fresco-ui/typography/Heading';
import type { LocalizedString } from '@codaco/protocol-validation';
import { summaryMessages } from '~/lib/ProtocolSummary/summaryMessages';

import { getVariableMeta } from '../helpers';
import MiniTable from '../MiniTable';
import SummaryContext from '../SummaryContext';
import {
  SummaryMarkdown,
  SummaryText,
  useMultilingualSummary,
} from '../SummaryText';
import Variable from '../Variable';
import SectionFrame from './SectionFrame';
const messages = defineMessages({
  form: {
    id: 'architect.protocolSummary.stage.form.form',
    defaultMessage: 'Form',
    description:
      'The title text in lib / ProtocolSummary / components / Stage / Form.',
  },
  title: {
    id: 'architect.protocolSummary.stage.form.title',
    defaultMessage: 'Title: {value1}',
    description:
      'Visible text in lib / ProtocolSummary / components / Stage / Form.',
  },
});

type FormFieldType = {
  prompt: LocalizedString;
  variable: string;
};
type FormProps = {
  form?: {
    title?: LocalizedString;
    fields?: FormFieldType[];
  } | null;
};
const Form = ({ form = null }: FormProps) => {
  const intl = useAppIntl();
  const { index } = useContext(SummaryContext);
  const multilingual = useMultilingualSummary();
  if (!form) {
    return null;
  }
  const fieldRows =
    form.fields?.map(({ prompt, variable }) => {
      const meta = getVariableMeta(index, variable);
      return [
        <Variable key={`var-${variable}`} id={variable} />,
        <span key={`comp-${variable}`}>{meta.component ?? ''}</span>,
        <SummaryMarkdown key={`prompt-${variable}`} value={prompt} />,
      ];
    }) ?? [];
  return (
    <SectionFrame
      title={intl.formatMessage(messages.form)}
      wrapperClassName="break-inside-avoid"
    >
      {form.title &&
        (multilingual ? (
          <MiniTable
            rotated
            wide
            rows={[
              [
                intl.formatMessage(summaryMessages.title),
                <SummaryText key="title" value={form.title} />,
              ],
            ]}
          />
        ) : (
          <Heading level="h4">
            {intl.formatMessage(messages.title, {
              value1: <SummaryText value={form.title} />,
            })}
          </Heading>
        ))}
      <MiniTable
        wide
        className="table-fixed [&_:is(th,td):nth-child(1)]:w-[40%] [&_:is(th,td):nth-child(2)]:w-[24%] [&_:is(th,td):nth-child(3)]:w-[36%]"
        rows={[
          [
            intl.formatMessage(summaryMessages.attribute),
            intl.formatMessage(summaryMessages.component),
            intl.formatMessage(summaryMessages.prompt),
          ],
          ...fieldRows,
        ]}
      />
    </SectionFrame>
  );
};
export default Form;
