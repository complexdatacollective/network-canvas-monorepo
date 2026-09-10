import type { StageSection } from '../../defineStageEditor.tsx';
import PassphraseRulesSection from './PassphraseRulesSection.tsx';

/** Whether the passphrase a participant chooses has to meet requirements. */
export const passphraseRules = (): StageSection => () => (
  <PassphraseRulesSection />
);
