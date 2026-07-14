'use client';

import { motion, type Variants } from 'motion/react';
import { Children, type ComponentProps } from 'react';

import Heading from '@codaco/fresco-ui/typography/Heading';

// FancyHeading is a component that animates the words in a heading.
const FancyHeading = (props: ComponentProps<typeof Heading>) => {
  const words = Children.toArray(props.children);

  const variants: Variants = {
    hidden: { y: '100%' },
    visible: (custom: number) => ({
      y: 0,
      transition: {
        type: 'spring',
        stiffness: 200,
        damping: 30,
        mass: 1,
        delay: 0.1 * custom,
      },
    }),
  };

  let animationIndex = 0;

  const renderText = (text: string, outerIndex: number) =>
    text.split('\n').flatMap((line, lineIndex, lines) => {
      const lineWords = line.split(' ').map((word, wordIndex) => {
        const custom = animationIndex++;

        return (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: word index won't change
            key={`${outerIndex}-${lineIndex}-${wordIndex}`}
            className="relative top-[-0.75em] mb-[-1em] inline-block overflow-hidden"
          >
            <motion.span
              custom={custom}
              variants={variants}
              initial="hidden"
              animate="visible"
              className="inline-block"
            >
              {word}&nbsp;
            </motion.span>
          </span>
        );
      });

      if (lineIndex === lines.length - 1) return lineWords;

      return [
        ...lineWords,
        <br
          // biome-ignore lint/suspicious/noArrayIndexKey: line index won't change
          key={`${outerIndex}-${lineIndex}-break`}
        />,
      ];
    });

  return (
    <Heading {...props}>
      {words.map((word, index) =>
        typeof word === 'string' ? (
          renderText(word, index)
        ) : (
          <motion.span
            // biome-ignore lint/suspicious/noArrayIndexKey: word index won't change
            key={index}
            custom={animationIndex++}
            variants={variants}
            initial="hidden"
            animate="visible"
            className="inline-block"
          >
            {word}
          </motion.span>
        ),
      )}
    </Heading>
  );
};

export default FancyHeading;
