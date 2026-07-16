'use client';

import type { Item } from '@codaco/protocol-validation';

import ContentItem from '../../../../components/ContentItem';
import { useStageSelector } from '../../../../hooks/useStageSelector';
import { getIntroScreen } from '../../utils/stageConfig';

// The wizard chrome heading is an h2, so the intro screen's own headings must
// sit beneath it. Allowing only h3/h4 (plus prose/lists/links) means an author's
// intro text can never introduce a heading at or above the dialog's level.
const INTRO_ALLOWED_TAGS = [
  'p',
  'br',
  'hr',
  'a',
  'em',
  'strong',
  'ul',
  'ol',
  'li',
  'h3',
  'h4',
];

type IntroScreen = {
  items: Item[];
};

export function shouldSkipIntroStep(
  introScreen: IntroScreen | null | undefined,
): boolean {
  return introScreen == null || introScreen.items.length === 0;
}

export default function IntroStep() {
  const introScreen = useStageSelector(getIntroScreen);

  if (!introScreen) return null;

  return (
    <>
      {introScreen.items.map((item) => (
        <ContentItem
          key={item.id}
          item={item}
          allowedTextElements={INTRO_ALLOWED_TAGS}
        />
      ))}
    </>
  );
}
