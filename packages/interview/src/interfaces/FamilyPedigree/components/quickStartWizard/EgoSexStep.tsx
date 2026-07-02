'use client';

import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { BIOLOGICAL_SEX_LEAD_IN } from '@codaco/shared-consts';

import BiologicalSexField from '../BiologicalSexField';

/**
 * Captures the participant's own biological sex. Ego is a leaf/proband with no
 * parent edges to infer sex from, so without this step ego drops out of its own
 * sex-linked risk. Carries the one-time lead-in explaining why the question is
 * asked (inheritance, not gender identity).
 */
export default function EgoSexStep() {
  return (
    <>
      <Paragraph>{BIOLOGICAL_SEX_LEAD_IN}</Paragraph>
      <BiologicalSexField subject="self" />
    </>
  );
}
