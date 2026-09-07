import { createElement, type ReactNode } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import {
  headingTagBelow,
  useEnclosingHeadingLevel,
} from '@codaco/fresco-ui/typography/EnclosingHeadingLevel';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import ProtocolField from '../../form/ProtocolField.tsx';
import BuilderSection from '../BuilderSection.tsx';
import { narrativePedigreeMessages } from './narrativePedigreeMessages.ts';

const FIELD_NAME = 'showAtRiskStatuses';

/**
 * The emphasis inside the explanation below, as tags a translator moves.
 *
 * The stressed phrases are clauses of a sentence rather than fragments glued
 * around markup, so each paragraph is one message and the tags travel inside
 * it — a language that puts "may develop" somewhere else in the sentence can
 * take the emphasis with it.
 */
const EMPHASIS = Object.freeze({
  em: (chunks: ReactNode) => <em>{chunks}</em>,
  strong: (chunks: ReactNode) => <strong>{chunks}</strong>,
});

/**
 * Whether the pedigree shows who MIGHT be affected as well as who is.
 *
 * Not a capability the section switches off, because there is nothing to lose
 * when it is off: the schema holds a single boolean, and its absence and
 * `false` mean the same thing. The stage's own committed value seeds the
 * control — a hardcoded default would register the toggle as off whatever the
 * stage held, and turn at-risk symbols off the first time an unrelated edit
 * was saved.
 */
export default function AtRiskStatusesSection() {
  const intl = useAppIntl();

  return (
    <BuilderSection
      title={intl.formatMessage(narrativePedigreeMessages.atRiskTitle)}
      description={intl.formatMessage(
        narrativePedigreeMessages.atRiskDescription,
      )}
    >
      <ProtocolField<typeof ToggleField>
        name={FIELD_NAME}
        component={ToggleField}
        inline
        label={intl.formatMessage(narrativePedigreeMessages.atRiskFieldLabel)}
        hint={intl.formatMessage(narrativePedigreeMessages.atRiskFieldHint)}
      />
      <AtRiskExplanation />
    </BuilderSection>
  );
}

/**
 * What at-risk means, how it is worked out, and why it is off unless a
 * clinician asks for it.
 *
 * A component of its own rather than the prose it was, because the level these
 * headings take is a fact about where they render: the section around them
 * states what it encloses, and only something rendered INSIDE the section can
 * read that. Written from the section component itself the answer is the
 * heading above the section, which is one rung too high.
 */
function AtRiskExplanation() {
  const intl = useAppIntl();
  const enclosingHeadingLevel = useEnclosingHeadingLevel();
  const headingTag =
    enclosingHeadingLevel === null
      ? 'h4'
      : headingTagBelow(enclosingHeadingLevel);
  // The element only — `level` still carries the type treatment.
  const asCounted =
    headingTag === 'h4' ? {} : { render: createElement(headingTag) };

  return (
    <div>
      <Paragraph>
        {intl.formatMessage(narrativePedigreeMessages.atRiskMeaning, EMPHASIS)}
      </Paragraph>

      <Heading level="h4" {...asCounted}>
        {intl.formatMessage(narrativePedigreeMessages.atRiskHowHeading)}
      </Heading>
      <Paragraph>
        {intl.formatMessage(
          narrativePedigreeMessages.atRiskHowInferred,
          EMPHASIS,
        )}
      </Paragraph>
      <Paragraph>
        {intl.formatMessage(
          narrativePedigreeMessages.atRiskHowConstrained,
          EMPHASIS,
        )}
      </Paragraph>

      <Heading level="h4" {...asCounted}>
        {intl.formatMessage(narrativePedigreeMessages.atRiskWhyOffHeading)}
      </Heading>
      <Paragraph>
        {intl.formatMessage(narrativePedigreeMessages.atRiskWhyOff, EMPHASIS)}
      </Paragraph>
    </div>
  );
}
