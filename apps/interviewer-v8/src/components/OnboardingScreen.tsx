import { motion } from 'motion/react';
import { useCallback, useRef } from 'react';

import Button from '@codaco/fresco-ui/Button';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import ncMarkUrl from '~/assets/NC-Flat.png';

import { useSetupWizard } from './SetupWizardDialog';

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      when: 'beforeChildren',
      staggerChildren: 0.18,
      delayChildren: 0.05,
    },
  },
  exit: {
    transition: { when: 'afterChildren', staggerChildren: 0.05 },
  },
} as const;

const EASE_OUT = [0.22, 1, 0.36, 1] as const;
const EASE_IN = [0.32, 0, 0.67, 0] as const;

const logoVariants = {
  hidden: { opacity: 0, scale: 0.92 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.6, ease: EASE_OUT },
  },
  exit: {
    opacity: 0,
    y: -180,
    scale: 0.96,
    transition: { duration: 0.7, ease: EASE_IN },
  },
} as const;

const textVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45 } },
  exit: { opacity: 0, y: -40, transition: { duration: 0.55 } },
} as const;

const buttonVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
  exit: { opacity: 0, y: 40, transition: { duration: 0.5 } },
} as const;

export function OnboardingScreenView({ onBegin }: { onBegin: () => void }) {
  return (
    <motion.div
      variants={containerVariants}
      className="fixed inset-0 flex flex-col items-center justify-center gap-6 px-8 text-center"
    >
      <motion.img
        variants={logoVariants}
        src={ncMarkUrl}
        alt=""
        className="size-32"
      />
      <motion.div variants={textVariants}>
        <Heading level="h1" margin="none" className="font-black tracking-tight">
          Welcome to Network Canvas Interviewer 8
        </Heading>
      </motion.div>
      <motion.div variants={textVariants}>
        <Paragraph margin="none">Let's set up this device.</Paragraph>
      </motion.div>
      <motion.div variants={buttonVariants} className="mt-2">
        <Button type="button" color="primary" onClick={onBegin}>
          Get started
        </Button>
      </motion.div>
    </motion.div>
  );
}

export function OnboardingScreen() {
  const { openSetupWizard } = useSetupWizard();
  const openedRef = useRef(false);

  const handleStart = useCallback(() => {
    if (openedRef.current) return;
    openedRef.current = true;
    void openSetupWizard().finally(() => {
      openedRef.current = false;
    });
  }, [openSetupWizard]);

  return <OnboardingScreenView onBegin={handleStart} />;
}
