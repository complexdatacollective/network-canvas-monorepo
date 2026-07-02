'use client';

import { RenderMarkdown } from '@codaco/fresco-ui/RenderMarkdown';
import Heading from '@codaco/fresco-ui/typography/Heading';
import { useAssetUrl } from '~/hooks/useAssetUrl';
import { useStageSelector } from '~/hooks/useStageSelector';
import { getIntroScreen } from '~/interfaces/FamilyPedigree/utils/stageConfig';

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
  title?: string;
  text: string;
  videoAssetId?: string;
};

export function shouldSkipIntroStep(
  introScreen: IntroScreen | null | undefined,
): boolean {
  return introScreen == null;
}

function IntroVideo({ assetId }: { assetId: string }) {
  const { url } = useAssetUrl(assetId);

  if (!url) return null;

  return (
    <video controls aria-label="Intro video" className="w-full rounded">
      <source src={url} />
      <track kind="captions" />
    </video>
  );
}

export default function IntroStep() {
  const introScreen = useStageSelector(getIntroScreen);

  if (!introScreen) return null;

  return (
    <>
      {introScreen.title && <Heading level="h3">{introScreen.title}</Heading>}
      <RenderMarkdown allowedElements={INTRO_ALLOWED_TAGS}>
        {introScreen.text}
      </RenderMarkdown>
      {introScreen.videoAssetId && (
        <IntroVideo assetId={introScreen.videoAssetId} />
      )}
    </>
  );
}
