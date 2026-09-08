'use client';

import { AppMessage } from '@codaco/app-i18n/react';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import { BIOLOGICAL_SEX_LEAD_IN } from '../../biologicalSexCopy';
import BiologicalSexField from '../BiologicalSexField';

/**
 * Captures the participant's own biological sex. The participant is rendered
 * iconically in the pedigree, so this step deliberately has no name field or
 * additional node-form fields.
 */
export default function EgoSexStep() {
  return (
    <>
      <Paragraph>
        <AppMessage message={BIOLOGICAL_SEX_LEAD_IN} />
      </Paragraph>
      <BiologicalSexField subject="self" />
    </>
  );
}
