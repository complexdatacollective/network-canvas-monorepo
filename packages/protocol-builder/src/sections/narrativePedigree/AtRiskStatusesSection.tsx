import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import ProtocolField from '../../form/ProtocolField.tsx';
import BuilderSection from '../BuilderSection.tsx';

const FIELD_NAME = 'showAtRiskStatuses';

export type AtRiskStatusesCopy = Readonly<{
  /** Names the section in the outline and to assistive technology. */
  sectionTitle: string;
  description: string;
  fieldLabel: string;
  fieldHint: string;
}>;

const DEFAULT_COPY: AtRiskStatusesCopy = {
  sectionTitle: 'At-risk statuses',
  description:
    'Choose whether the pedigree also shows inferred risk alongside recorded status.',
  fieldLabel: 'Show possible (at-risk) statuses',
  fieldHint:
    'Off by default. At-risk symbols are inferred rather than observed, and are intended for clinician-directed use.',
};

export type AtRiskStatusesSectionProps = Readonly<{
  copy?: Partial<AtRiskStatusesCopy>;
}>;

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
export default function AtRiskStatusesSection({
  copy,
}: AtRiskStatusesSectionProps) {
  const words = { ...DEFAULT_COPY, ...copy };

  return (
    <BuilderSection title={words.sectionTitle} description={words.description}>
      <ProtocolField<typeof ToggleField>
        name={FIELD_NAME}
        component={ToggleField}
        inline
        label={words.fieldLabel}
        hint={words.fieldHint}
      />
      <div>
        <Paragraph>
          When this is on, the pedigree also shows a person who{' '}
          <em>may develop</em> a condition or <em>may carry</em> it. These are
          drawn as the usual status symbol with a question mark
          (&ldquo;?&rdquo;) added. A solid, filled symbol always means a
          clinically <em>affected</em> individual, so at-risk relatives always
          appear as unfilled symbols marked with a &ldquo;?&rdquo;.
        </Paragraph>

        <Heading level="h4">How it is worked out</Heading>
        <Paragraph>
          At-risk statuses are not observed or diagnosed. They are inferred from
          the family structure together with each condition&rsquo;s inheritance
          pattern — the child of a parent affected by a dominant condition is
          shown as <em>may develop</em> it, and the child of two carriers of a
          recessive condition as <em>may carry</em> it.
        </Paragraph>
        <Paragraph>
          Two rules constrain how risk travels through a family. Only{' '}
          <em>biological</em> and <em>donor</em> relationships pass conditions
          on; social, adoptive, surrogate and partner links do not. And where a
          person&rsquo;s biological sex is not known, sex-linked inheritance
          through that person is left uncertain rather than guessed.
        </Paragraph>

        <Heading level="h4">Why this is off by default</Heading>
        <Paragraph>
          At-risk symbols are a strong visual signal that can be read as
          established fact rather than inferred risk. They are intended for{' '}
          <strong>clinician-directed use</strong>, where the result is
          interpreted in context. Standard pedigree nomenclature deliberately
          does not encode probabilistic risk, so leave this off unless a
          clinician is guiding interpretation.
        </Paragraph>
      </div>
    </BuilderSection>
  );
}
