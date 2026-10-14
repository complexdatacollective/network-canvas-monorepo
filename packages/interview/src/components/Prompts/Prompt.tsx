'use client';

import { motion } from 'motion/react';
import { Fragment } from 'react';

import { RenderMarkdown } from '@codaco/fresco-ui/RenderMarkdown';
import Heading from '@codaco/fresco-ui/typography/Heading';
import { cx } from '@codaco/fresco-ui/utils/cva';
import type { LocalizedString } from '@codaco/protocol-validation';

import { DynamicMarkdown } from '../../dynamicValues/DynamicText';
import { useLocalizedString } from '../../localization/ProtocolLocalizationProvider';

const variants = {
  enter: (backwards: boolean) => ({
    x: backwards ? '-25%' : '25%',
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (backwards: boolean) => ({
    x: backwards ? '25%' : '-25%',
    opacity: 0,
  }),
};

type PromptProps = {
  id: string;
  text: LocalizedString;
  backwards?: boolean;
  small?: boolean;
};

/**
 * Renders a single prompt with animation support.
 */
const Prompt = ({ id, text, backwards = false, small }: PromptProps) => {
  const promptClasses = cx('font-heading pb-[0.1em] text-center text-2xl');
  // `markdown` is the natural sentence, values and all, for the tooltip and
  // anything that speaks the prompt; `parts` marks the values out on screen.
  const { text: markdown, parts } = useLocalizedString(text);

  return (
    <motion.div
      data-testid="prompt"
      title={markdown}
      key={id}
      custom={backwards}
      variants={variants}
      className={promptClasses}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{
        x: { type: 'spring', stiffness: 600, damping: 35 },
        opacity: { duration: 0.2 },
      }}
    >
      <Heading
        level={small ? 'h4' : 'h2'}
        margin="none"
        className="max-w-[65ch] font-normal"
      >
        {parts === undefined ? (
          <RenderMarkdown render={<Fragment />}>{markdown}</RenderMarkdown>
        ) : (
          <DynamicMarkdown render={<Fragment />} parts={parts} />
        )}
      </Heading>
    </motion.div>
  );
};

export default Prompt;
