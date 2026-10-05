import type { ReactNode } from 'react';

import { LocalizedInputField } from '@codaco/protocol-builder/fields/LocalizedStringField';
import { ProtocolLocalizationProvider } from '@codaco/protocol-builder/localization/ProtocolLocalization';
import type { LocalizedString } from '@codaco/protocol-validation';
import ArchitectField from '~/components/Form/ArchitectField';
import { useAppSelector } from '~/ducks/hooks';
import { getLocalization } from '~/selectors/protocol';

type LabelFieldProps = {
  name: string;
  label: string;
  hint: ReactNode;
  initialValue: LocalizedString | undefined;
};

/**
 * The words participants are shown for a codebook entry, in each of the
 * protocol's languages. The field opens in the default language. A label needs
 * text in at least one language; a language left empty is a missing
 * translation, which participants see in another language.
 */
const LabelField = ({ name, label, hint, initialValue }: LabelFieldProps) => {
  const localization = useAppSelector(getLocalization);

  return (
    <ProtocolLocalizationProvider localization={localization}>
      <ArchitectField
        component={LocalizedInputField}
        name={name}
        label={label}
        hint={hint}
        initialValue={initialValue}
        validation={{ required: true }}
      />
    </ProtocolLocalizationProvider>
  );
};

export default LabelField;
