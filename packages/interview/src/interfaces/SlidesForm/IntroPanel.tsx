'use client';

import { MotionSurface } from '@codaco/fresco-ui/layout/Surface';
import { ALLOWED_MARKDOWN_SECTION_TAGS } from '@codaco/fresco-ui/RenderMarkdown';
import Heading from '@codaco/fresco-ui/typography/Heading';
import type { LocalizedString } from '@codaco/protocol-validation';

import { LocalizedMarkdown } from '../../localization/LocalizedMarkdown';
import { LocalizedText } from '../../localization/LocalizedText';

type IntroPanelProps = {
  title: LocalizedString;
  text: LocalizedString;
};

const introVariants = {
  initial: { opacity: 0, scale: 0 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0 },
};

export default function IntroPanel({ title, text }: IntroPanelProps) {
  return (
    <MotionSurface
      className="h-auto max-h-[75%] max-w-2xl shadow-xl"
      spacing="lg"
      shadow="lg"
      variants={introVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      noContainer
    >
      <LocalizedText
        value={title}
        render={<Heading level="h1" className="text-center" />}
      />
      <LocalizedMarkdown
        value={text}
        allowedElements={ALLOWED_MARKDOWN_SECTION_TAGS}
      />
    </MotionSurface>
  );
}
