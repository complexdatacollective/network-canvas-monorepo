'use client';

import { NavigationMenu } from '@base-ui/react/navigation-menu';
import { ChevronDown } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import type { Transition } from 'motion/react';

import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { DeviceMockup } from '~/components/ui/DeviceMockup';
import { cn } from '~/lib/cn';
import type { Tool } from '~/lib/content';
import { tools } from '~/lib/content';

const MotionParagraph = motion.create(Paragraph);

const cardVariants = {
  rest: { y: 0 },
  hover: { y: -6 },
};

const imageVariants = {
  rest: { y: 0, scale: 1 },
  hover: { y: -8, scale: 1.06 },
};

const descriptionVariants = {
  rest: { opacity: 0, height: 0, marginTop: 0 },
  hover: { opacity: 1, height: 'auto', marginTop: 10 },
};

const panelVariants = {
  rest: { height: '7.25rem' },
  hover: { height: '100%' },
};

function SoftwareCard({ tool }: { tool: Tool }) {
  const shouldReduceMotion = useReducedMotion();
  const activeCardVariants = shouldReduceMotion
    ? { rest: { y: 0 }, hover: { y: 0 } }
    : cardVariants;
  const activeImageVariants = shouldReduceMotion
    ? { rest: { y: 0, scale: 1 }, hover: { y: 0, scale: 1 } }
    : imageVariants;
  const cardTransition: Transition = shouldReduceMotion
    ? { duration: 0 }
    : { type: 'spring', stiffness: 320, damping: 26 };
  const imageTransition: Transition = shouldReduceMotion
    ? { duration: 0 }
    : { type: 'spring', stiffness: 220, damping: 20 };
  const revealTransition: Transition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.28, ease: 'easeOut' };

  return (
    <NavigationMenu.Link
      href={tool.cta.href}
      target="_blank"
      rel="noreferrer"
      closeOnClick
      className="focusable group block rounded-[1.75rem]"
      // Drive the animation from the focusable element (the link) itself, so
      // keyboard focus triggers the same reveal as pointer hover. Framer Motion
      // propagates the active variant down to the motion children below.
      render={
        <motion.a
          initial="rest"
          animate="rest"
          whileHover="hover"
          whileFocus="hover"
        />
      }
    >
      <motion.div
        variants={activeCardVariants}
        transition={cardTransition}
        className="bg-platinum text-cyber-grape relative flex h-72 w-56 flex-col justify-end overflow-hidden rounded-[1.75rem] p-6 shadow-lg"
      >
        <motion.div
          variants={activeImageVariants}
          transition={imageTransition}
          className="pointer-events-none absolute inset-x-0 top-0 select-none"
        >
          <DeviceMockup
            variant={tool.variant}
            className="tablet-landscape:p-0 rounded-none bg-transparent p-0 shadow-none [&_img]:object-cover [&>div]:rounded-none [&>div]:bg-transparent"
          />
        </motion.div>

        <motion.div
          aria-hidden
          variants={panelVariants}
          transition={revealTransition}
          className="bg-platinum pointer-events-none absolute inset-x-0 bottom-0"
        />

        <div className="relative z-10">
          <Heading
            level="h3"
            margin="none"
            className="font-heading text-2xl font-bold"
          >
            {tool.name}
          </Heading>
          <MotionParagraph
            margin="none"
            variants={descriptionVariants}
            transition={revealTransition}
            className="text-cyber-grape/80 [display:-webkit-box] overflow-hidden text-sm leading-relaxed [-webkit-box-orient:vertical] [-webkit-line-clamp:4]"
          >
            {tool.description}
          </MotionParagraph>
          <span className="font-heading mt-3 inline-flex items-center gap-1 text-xs font-bold tracking-[0.12em] uppercase">
            {tool.cta.label}
            <ChevronDown className="size-3.5 -rotate-90" />
          </span>
        </div>
      </motion.div>
    </NavigationMenu.Link>
  );
}

/**
 * The desktop "Software" navigation entry. Hovering (or focusing) the trigger
 * reveals a popover of software cards built on Base UI's Navigation Menu, with
 * Framer Motion driving the per-card hover reveal of each description.
 *
 * Rendered as a `<div>` rather than its default `<nav>` so it can be embedded
 * inside the header's existing `<nav>` without nesting landmark regions.
 */
export function SoftwareMenu() {
  return (
    <NavigationMenu.Root
      delay={100}
      closeDelay={120}
      render={<div />}
      className="relative"
    >
      <NavigationMenu.List className="flex">
        <NavigationMenu.Item>
          <NavigationMenu.Trigger className="focusable font-heading text-cyber-grape hover:text-neon-coral data-[popup-open]:text-neon-coral group flex items-center gap-1 text-sm font-bold tracking-[0.12em] uppercase transition-colors">
            Software
            <ChevronDown className="size-4 transition-transform duration-200 group-data-[popup-open]:rotate-180" />
          </NavigationMenu.Trigger>
          <NavigationMenu.Content className="transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0">
            <ul className="flex gap-4 p-2">
              {tools.map((tool) => (
                <li key={tool.name}>
                  <SoftwareCard tool={tool} />
                </li>
              ))}
            </ul>
          </NavigationMenu.Content>
        </NavigationMenu.Item>
      </NavigationMenu.List>

      <NavigationMenu.Portal>
        <NavigationMenu.Positioner
          sideOffset={14}
          align="center"
          collisionPadding={16}
          className="z-50 outline-none"
        >
          <NavigationMenu.Popup
            className={cn(
              'bg-surface origin-top rounded-[1.75rem] p-3 shadow-2xl ring-1 ring-black/5',
              'transition-[opacity,transform,scale] duration-200 ease-out',
              'data-[starting-style]:scale-95 data-[starting-style]:opacity-0',
              'data-[ending-style]:scale-95 data-[ending-style]:opacity-0',
            )}
          >
            <NavigationMenu.Viewport />
          </NavigationMenu.Popup>
        </NavigationMenu.Positioner>
      </NavigationMenu.Portal>
    </NavigationMenu.Root>
  );
}
