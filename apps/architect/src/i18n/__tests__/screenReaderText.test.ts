import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  checkScreenReaderText,
  collectSourceFiles,
} from '@codaco/app-i18n/catalog-guards';

/**
 * Text only a screen reader reads stays English in every language, written in
 * the component rather than as a message (`@codaco/app-i18n`'s README, "Text
 * only a screen reader reads is not a message").
 */

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '../..');

/** Attributes whose text a sighted person also sees, so it is translated. */
const SHOWN_AS_WELL: Record<string, string> = {
  'components/Home/LibraryPanel.tsx: messages.clearAllLocallySavedProtocols':
    'the button has the same text as a visible tooltip',
  'components/Localization/LanguageList.tsx: messages.editTranslations':
    'the same text is the button tooltip',
  'components/Localization/LanguageList.tsx: messages.changeLanguage':
    'the same text is the button tooltip',
  'components/Localization/TranslationTable.tsx: messages.search':
    'the same text is the search field placeholder',
  'components/ProjectNav/StageEditorNav.tsx: messages.previewSettings':
    'a toolbar icon button shows its name as a tooltip',
  'components/ProjectNav/historyToolbarItems.tsx: messages.undo':
    'a toolbar icon button shows its name as a tooltip',
  'components/ProjectNav/historyToolbarItems.tsx: messages.redo':
    'a toolbar icon button shows its name as a tooltip',
  'components/ProtocolReview/ReviewProblemView.tsx: messages.ratingUseful':
    'the rating icon button shows its name as a tooltip',
  'components/ProtocolReview/ReviewProblemView.tsx: messages.ratingNotUseful':
    'the rating icon button shows its name as a tooltip',
  'components/Screens/NewStageScreen/NewStageScreen.tsx: messages.clearSearch':
    'the same text is the button title and tooltip',
  'components/VariablePill.tsx: messages.editAttributeName':
    'the same text is the pill tooltip',
};

describe('text only a screen reader reads', () => {
  it('is looking at enough of Architect to be worth trusting', () => {
    expect(collectSourceFiles(srcDir).length).toBeGreaterThan(100);
  });

  it('is never a translated message', () => {
    expect(
      checkScreenReaderText(collectSourceFiles(srcDir), srcDir, SHOWN_AS_WELL),
    ).toEqual([]);
  });
});
