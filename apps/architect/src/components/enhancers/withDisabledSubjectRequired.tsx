import type { ComponentType } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
const messages = defineMessages({
  selectType: {
    id: 'architect.sections.selectType',
    defaultMessage:
      'Select {entity, select, edge {an edge} other {a node}} type above to configure this section.',
    description: 'Explains why a subject-dependent editor section is disabled.',
  },
});

type PropsWithSubject = { interfaceType?: string; type?: string };
type InjectedProps = { disabled: boolean; disabledMessage?: string };
export default function withDisabledSubjectRequired<
  Props extends InjectedProps,
>(Component: ComponentType<Props>) {
  return function SubjectRequired(
    props: Omit<Props, keyof InjectedProps> & PropsWithSubject,
  ) {
    const intl = useAppIntl();
    const disabled = props.interfaceType !== 'EgoForm' && !props.type;
    const injected = {
      disabled,
      disabledMessage: disabled
        ? intl.formatMessage(messages.selectType, {
            entity: props.interfaceType === 'AlterEdgeForm' ? 'edge' : 'node',
          })
        : undefined,
    };
    return <Component {...(props as Props)} {...injected} />;
  };
}
