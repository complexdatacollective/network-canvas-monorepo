import { motion } from 'framer-motion';
import { Heading, type HeadingProps } from '@acme/ui';
import { Children } from 'react';

// FancyHeading is a component that animates the words in a heading.
const FancyHeading = (props: HeadingProps) => {
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
          initial="hidden"
          animate="visible"
          className="inline-block"
        >
          {segment}&nbsp;
        </motion.span>
      </span>
    ));
  };

  return (
    <Heading {...props}>
      {words.map((word, index) =>
        typeof word === 'string' ? (
          renderWord(word, index)
        ) : (
          <motion.span
            key={index}
            custom={index}
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
