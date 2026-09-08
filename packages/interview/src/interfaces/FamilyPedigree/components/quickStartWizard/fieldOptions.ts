import type { IntlShape } from '@codaco/app-i18n/messages';
import type { RichSelectOption } from '@codaco/fresco-ui/form/fields/RichSelectGroup';
import type { RelationshipType } from '@codaco/protocol-validation';

import { resolveInterviewIntl } from '../../../../i18n/resolveIntl';
import { messages } from '../../messages';

export type ParentEdgeTypeOption = RichSelectOption & {
  value: RelationshipType;
};

export function parentEdgeTypeOptions(
  intl?: IntlShape,
): ParentEdgeTypeOption[] {
  const formatter = resolveInterviewIntl(intl);
  return [
    {
      value: 'biological',
      label: formatter.formatMessage(messages.biologicalParent),
      description: formatter.formatMessage(
        messages.biologicalParentDescription,
      ),
    },
    {
      value: 'social',
      label: formatter.formatMessage(messages.socialParent),
      description: formatter.formatMessage(messages.socialParentDescription),
    },
    {
      value: 'donor',
      label: formatter.formatMessage(messages.donor),
      description: formatter.formatMessage(messages.donorDescription),
    },
    {
      value: 'surrogate',
      label: formatter.formatMessage(messages.surrogate),
      description: formatter.formatMessage(messages.surrogateDescription),
    },
  ];
}
