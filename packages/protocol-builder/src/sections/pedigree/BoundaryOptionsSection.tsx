import { type ReactNode, useMemo } from 'react';

import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import ProtocolField from '../../form/ProtocolField.tsx';
import BuilderSection from '../BuilderSection.tsx';
import { pedigreeMessages } from './pedigreeMessages.ts';

const GRANDPARENTS_FIELD = 'boundaries.requireGrandparents';
const CHILDREN_CONTRIBUTORS_FIELD = 'boundaries.requireChildrenContributors';

/**
 * The three enforcement levels, keyed by the schema value each writes.
 *
 * Descriptors rather than words, and resolved beside the control: a label
 * resolved at module load would be whatever language happened to be current
 * when this file was first imported, for the rest of the session.
 */
const REQUIREMENT_LABELS: Readonly<Record<string, MessageDescriptor>> =
  Object.freeze({
    required: pedigreeMessages.boundariesLevelRequired,
    recommended: pedigreeMessages.boundariesLevelRecommended,
    off: pedigreeMessages.boundariesLevelOff,
  });

/** The level's name inside an explanation, drawn as the emphasis it is. */
const boldTerm = (chunks: ReactNode) => <strong>{chunks}</strong>;

/**
 * How far the pedigree has to reach before the participant may finish.
 *
 * Both boundaries are owned together because they are the two members of one
 * schema object: a section owning part of a nested value has to render every
 * part of it, or the half it does not render is written back over on save.
 */
export default function BoundaryOptionsSection() {
  const intl = useAppIntl();

  const requirementOptions = useMemo(
    () =>
      Object.entries(REQUIREMENT_LABELS).map(([value, label]) => ({
        value,
        label: intl.formatMessage(label),
      })),
    [intl],
  );

  return (
    <BuilderSection
      title={intl.formatMessage(pedigreeMessages.boundariesTitle)}
      description={intl.formatMessage(pedigreeMessages.boundariesDescription)}
    >
      <Paragraph>
        {intl.formatMessage(pedigreeMessages.boundariesEnforcementIntro)}
      </Paragraph>
      <ul className="mb-5 list-disc pl-7 [&_li]:mb-1">
        {/*
          Each bullet is ONE message with the level's name marked inside it,
          rather than a bold fragment glued to a sentence: a translator moves
          the emphasis to wherever their language puts the term.
        */}
        <li>
          {intl.formatMessage(pedigreeMessages.boundariesOffExplanation, {
            term: boldTerm,
          })}
        </li>
        <li>
          {intl.formatMessage(
            pedigreeMessages.boundariesRecommendedExplanation,
            { term: boldTerm },
          )}
        </li>
        <li>
          {intl.formatMessage(pedigreeMessages.boundariesRequiredExplanation, {
            term: boldTerm,
          })}
        </li>
      </ul>
      <ProtocolField<typeof NativeSelectField>
        name={GRANDPARENTS_FIELD}
        component={NativeSelectField}
        label={intl.formatMessage(pedigreeMessages.boundariesGrandparentsLabel)}
        hint={intl.formatMessage(pedigreeMessages.boundariesGrandparentsHint)}
        options={requirementOptions}
        placeholder={intl.formatMessage(
          pedigreeMessages.boundariesSelectPlaceholder,
        )}
        required
      />
      <ProtocolField<typeof NativeSelectField>
        name={CHILDREN_CONTRIBUTORS_FIELD}
        component={NativeSelectField}
        label={intl.formatMessage(
          pedigreeMessages.boundariesChildrenContributorsLabel,
        )}
        hint={intl.formatMessage(
          pedigreeMessages.boundariesChildrenContributorsHint,
        )}
        options={requirementOptions}
        placeholder={intl.formatMessage(
          pedigreeMessages.boundariesSelectPlaceholder,
        )}
        required
      />
    </BuilderSection>
  );
}
