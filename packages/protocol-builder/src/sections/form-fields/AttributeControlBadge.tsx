import type { ReactNode } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Badge } from '@codaco/fresco-ui/Badge';

import {
  variableTypeBadgeColor,
  variableTypeLabel,
} from '../../codebook/variableTypeLabels.ts';
import { controlLabel } from '../collectableTypes.ts';

const messages = defineMessages({
  attributeControlBadge: {
    id: 'protocolBuilder.formFields.attributeControlBadge',
    defaultMessage:
      '<type>{typeLabel}</type> attribute using <control>{controlLabel}</control> input control',
    description:
      'Shown in the collapsed row of a form’s list of questions, naming the kind of attribute it records into and the control the participant answers with. Both are already translated where they are read from, and both are emphasised inside the sentence so a translator moves them with the clause they belong to.',
  },
  previewMissing: {
    id: 'protocolBuilder.formFields.previewMissing',
    defaultMessage: 'This attribute is no longer in the codebook.',
    description:
      'Shown in the collapsed row of a form’s list of questions when the attribute it records into has been deleted from the codebook.',
  },
});

/**
 * Rich-text tag renderer held at module scope so it keeps one identity across
 * renders: an inline arrow returning JSX is a component defined during render.
 */
const renderStrong = (chunks: ReactNode) => <strong>{chunks}</strong>;

/** The codebook attribute a form field collects into, as the row reads it. */
export type BadgedAttribute = Readonly<{
  type?: string;
  component?: string;
}>;

/**
 * What one form field collects, said the way Architect says it: the kind of
 * attribute and the control the participant answers with, both translated and
 * both emphasised inside one sentence, marked in the colour that attribute
 * type carries everywhere else.
 *
 * A component rather than a formatted string because the sentence carries
 * markup. Architect shares one of these between its ordinary, composer and
 * family-pedigree row previews; the composer's preview is a different defect
 * (audit candidate 25) and is not touched here, so this stays inside the
 * package until the second caller arrives.
 *
 * The colour is the badge's outline rather than its fill. Filled is what
 * Architect released, and white on the released fill for a text attribute is
 * 4.43:1 — under the 4.5:1 a researcher is owed for text this size, and the
 * palette has several more that sit the same way. Outlined, the type colour is
 * the border and a wash of the surface behind it, and the sentence is read in
 * the surface's own text colour, which the theme already guarantees against
 * that surface.
 */
export default function AttributeControlBadge({
  attribute,
}: Readonly<{
  /** Absent when the attribute the field names is no longer in the codebook. */
  attribute: BadgedAttribute | undefined;
}>) {
  const intl = useAppIntl();
  const typeLabel = variableTypeLabel(attribute?.type);
  const controlDescriptor = controlLabel(attribute?.component);

  return (
    <Badge color={variableTypeBadgeColor(attribute?.type)} variant="outline">
      {attribute === undefined ? (
        intl.formatMessage(messages.previewMissing)
      ) : (
        <span>
          {intl.formatMessage(messages.attributeControlBadge, {
            // The schema's own token where this package has no name for it,
            // which is what a protocol authored against a later schema arrives
            // holding: an empty badge would say less than the identifier does.
            typeLabel: typeLabel
              ? intl.formatMessage(typeLabel)
              : (attribute.type ?? ''),
            controlLabel: controlDescriptor
              ? intl.formatMessage(controlDescriptor)
              : (attribute.component ?? ''),
            type: renderStrong,
            control: renderStrong,
          })}
        </span>
      )}
    </Badge>
  );
}
