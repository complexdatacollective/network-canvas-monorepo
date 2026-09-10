import type { StageSection } from '../../defineStageEditor.tsx';
import EncryptedAttributesSection from './EncryptedAttributesSection.tsx';

/** Which codebook attributes the participant's passphrase protects. */
export const encryptedAttributes = (): StageSection => () => (
  <EncryptedAttributesSection />
);
