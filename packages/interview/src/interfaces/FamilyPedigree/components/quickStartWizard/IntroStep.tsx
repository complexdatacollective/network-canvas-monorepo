'use client';

import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { useAssetUrl } from '~/hooks/useAssetUrl';
import { useStageSelector } from '~/hooks/useStageSelector';
import { getIntroScreen } from '~/interfaces/FamilyPedigree/utils/stageConfig';

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
    <video controls title="Intro video" className="w-full rounded">
      <source src={url} />
    </video>
  );
}

export default function IntroStep() {
  const introScreen = useStageSelector(getIntroScreen);

  if (!introScreen) return null;

  return (
    <>
      {introScreen.title && <Heading level="h2">{introScreen.title}</Heading>}
      <Paragraph>{introScreen.text}</Paragraph>
      {introScreen.videoAssetId && (
        <IntroVideo assetId={introScreen.videoAssetId} />
      )}
    </>
  );
}
