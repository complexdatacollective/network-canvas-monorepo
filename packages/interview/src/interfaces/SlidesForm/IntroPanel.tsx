'use client';

import { MotionSurface } from '@codaco/fresco-ui/layout/Surface';
import {
  ALLOWED_MARKDOWN_SECTION_TAGS,
  RenderMarkdown,
} from '@codaco/fresco-ui/RenderMarkdown';
import Heading from '@codaco/fresco-ui/typography/Heading';

type IntroPanelProps = {
  title: string;
  text: string;
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
      variants={introVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      noContainer
    >
      <Heading level="h1" className="text-center">
        {title}
      </Heading>
      <RenderMarkdown allowedElements={ALLOWED_MARKDOWN_SECTION_TAGS}>
        {text}
      </RenderMarkdown>
    </MotionSurface>
  );
}
