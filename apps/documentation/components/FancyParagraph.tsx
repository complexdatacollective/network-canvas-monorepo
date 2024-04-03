import { motion } from 'framer-motion';
import { Paragraph, type ParagraphProps } from '@codaco/ui';
import { Children } from 'react';
import { isJavaScriptEnabled } from '~/lib/utils';

// FancyParagraph is a component that animates the words in a heading.
const FancyParagraph = (props: ParagraphProps) => {
  const words = Children.toArray(props.children);

  const variants = {
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

  const renderWord = (word: string, outerIndex: number) => {
    const segments = word.split(' ');
    return segments.map((segment, innerIndex) => (
      <span
        key={`${outerIndex}-${innerIndex}`}
        className="relative -top-[0.75em] -mb-[1em] inline-block overflow-hidden"
      >
        <motion.span
          custom={outerIndex + innerIndex}
          variants={variants}
          initial={isJavaScriptEnabled ? 'hidden' : 'visible'}
          animate="visible"
          className="inline-block"
        >
          {segment}&nbsp;
        </motion.span>
      </span>
    ));
  };

  return (
    <Paragraph {...props}>
      {words.map((word, index) =>
        typeof word === 'string' ? (
          renderWord(word, index)
        ) : (
          <motion.span
            key={index}
            custom={index}
            variants={variants}
            initial={isJavaScriptEnabled ? 'hidden' : 'visible'}
            animate="visible"
            className="inline-block"
          >
            {word}
          </motion.span>
        ),
      )}
    </Paragraph>
  );
};

export default FancyParagraph;
