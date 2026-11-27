import { useContext } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Heading from '@codaco/fresco-ui/typography/Heading';
import type { LocalizedString } from '@codaco/protocol-validation';
import { summaryMessages } from '~/lib/ProtocolSummary/summaryMessages';

import { ControlName, getVariableMeta } from '../helpers';
import MiniTable from '../MiniTable';
import SummaryContext from '../SummaryContext';
import {
  SummaryLineIn,
  SummaryMarkdown,
  SummaryText,
  useMultilingualSummary,
  useTranslationLocale,
} from '../SummaryText';
import Variable from '../Variable';
import SectionFrame from './SectionFrame';

const messages = defineMessages({
  form: {
    id: 'architect.protocolSummary.stage.form.form',
    defaultMessage: 'Form',
    description:
      "Section heading in the printable protocol summary, above the text of a stage's form, which places each of the form's fields.",
  },
  title: {
    id: 'architect.protocolSummary.stage.form.title',
    defaultMessage: 'Title: {value1}',
    description:
      "Heading in the printable protocol summary giving the title of a stage's form. value1 is the title as written in the protocol.",
  },
  question: {
    id: 'architect.protocolSummary.stage.form.question',
    defaultMessage: 'Question',
    description:
      'Label in the printable protocol summary, in the details of a field placed in the text of a form. Beside it is the question that the field asks participants.',
  },
  hint: {
    id: 'architect.protocolSummary.stage.form.hint',
    defaultMessage: 'Hint',
    description:
      'Label in the printable protocol summary, in the details of a field placed in the text of a form. Beside it is the hint shown below the question.',
  },
  inputControl: {
    id: 'architect.protocolSummary.stage.form.inputControl',
    defaultMessage: 'Input control',
    description:
      'Label in the printable protocol summary, in the details of a field placed in the text of a form. Beside it is the kind of control that participants answer with, such as a text box or a set of buttons.',
  },
});

type FormFieldType = {
  id: string;
  variable: string;
  prompt: LocalizedString;
  hint?: LocalizedString;
};

type FormProps = {
  form?: {
    title?: LocalizedString;
    content?: LocalizedString;
    fields?: FormFieldType[];
  } | null;
};

/**
 * A field where the text of its form places it: the question and hint that
 * participants read in the language of that text, the attribute that the
 * answer is stored in, and the control that they answer with.
 */
const FieldSummary = ({ field }: Readonly<{ field: FormFieldType }>) => {
  const intl = useAppIntl();
  const { index } = useContext(SummaryContext);
  const locale = useTranslationLocale();
  const meta = getVariableMeta(index, field.variable);
  const inLanguage = (value: LocalizedString) =>
    locale === undefined ? (
      <SummaryMarkdown value={value} />
    ) : (
      <SummaryLineIn value={value} locale={locale} />
    );
  return (
    <div lang={intl.locale} data-field-summary={field.id}>
      <MiniTable
        rotated
        wide
        narrowLabels
        rows={[
          [intl.formatMessage(messages.question), inLanguage(field.prompt)],
          ...(field.hint === undefined
            ? []
            : [[intl.formatMessage(messages.hint), inLanguage(field.hint)]]),
          [
            intl.formatMessage(summaryMessages.attribute),
            <Variable key="variable" id={field.variable} />,
          ],
          [
            intl.formatMessage(messages.inputControl),
            <ControlName key="control" component={meta.component} />,
          ],
        ]}
      />
    </div>
  );
};

/**
 * A stage's form: its title, where it has one, and its text in each
 * language, with each field drawn where the text places it.
 */
const Form = ({ form = null }: FormProps) => {
  const intl = useAppIntl();
  const multilingual = useMultilingualSummary();
  if (!form) {
    return null;
  }
  const fields = form.fields ?? [];
  const fieldSummary = (fieldId: string) => {
    const field = fields.find(({ id }) => id === fieldId);
    return field === undefined ? null : <FieldSummary field={field} />;
  };
  return (
    <SectionFrame title={intl.formatMessage(messages.form)}>
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
      {/* A form opens with its own text, which may start with a heading. */}
      <div className="mt-3">
        <SummaryMarkdown
          value={form.content}
          multiline
          fieldSummary={fieldSummary}
        />
      </div>
    </SectionFrame>
  );
};

export default Form;
