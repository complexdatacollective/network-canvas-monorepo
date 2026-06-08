'use client';

import { NavigationMenu } from '@base-ui/react/navigation-menu';
import { ChevronDown } from 'lucide-react';
import { motion } from 'motion/react';

import { cn } from '~/lib/cn';
import type { Project } from '~/lib/content';
import { projects } from '~/lib/content';

/**
 * Brand gradients for each project card. Keyed by the project's accent colour
 * so the cards echo the colours used by the on-page Projects section while
 * adding depth for the popover treatment.
 */
const gradients: Record<Project['color'], string> = {
  'slate-blue': 'from-slate-blue to-cyber-grape',
  'cerulean-blue': 'from-cerulean-blue to-slate-blue',
  'neon-coral': 'from-neon-coral to-purple-pizazz',
};

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

function ProjectCard({ project }: { project: Project }) {
  return (
    <NavigationMenu.Link
      href={project.href}
      target="_blank"
      rel="noreferrer"
      closeOnClick
      className="focusable block rounded-[1.75rem]"
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
        variants={cardVariants}
        transition={{ type: 'spring', stiffness: 320, damping: 26 }}
        className={cn(
          'relative flex h-72 w-56 flex-col justify-end overflow-hidden rounded-[1.75rem] bg-linear-to-br p-6 text-white shadow-lg',
          gradients[project.color],
        )}
      >
        <motion.img
          src={project.illustration}
          alt=""
          aria-hidden
          variants={imageVariants}
          transition={{ type: 'spring', stiffness: 220, damping: 20 }}
          className="pointer-events-none absolute inset-x-0 top-5 mx-auto size-32 drop-shadow-xl select-none"
        />

        {/* Scrim keeps the title and description legible over the artwork. */}
        <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/30 via-black/5 to-transparent" />

        <div className="relative">
          <h3 className="font-heading text-2xl font-bold">{project.name}</h3>
          <motion.p
            variants={descriptionVariants}
            transition={{ duration: 0.28, ease: 'easeOut' }}
            className="[display:-webkit-box] overflow-hidden text-sm leading-relaxed text-white/90 [-webkit-box-orient:vertical] [-webkit-line-clamp:4]"
          >
            {project.description}
          </motion.p>
          <span className="font-heading mt-3 inline-flex items-center gap-1 text-xs font-bold tracking-[0.12em] uppercase">
            Learn more
            <ChevronDown className="size-3.5 -rotate-90" />
          </span>
        </div>
      </motion.div>
    </NavigationMenu.Link>
  );
}

/**
 * The desktop "Projects" navigation entry. Hovering (or focusing) the trigger
 * reveals a popover of project cards built on Base UI's Navigation Menu, with
 * Framer Motion driving the per-card hover reveal of each description.
 *
 * Rendered as a `<div>` rather than its default `<nav>` so it can be embedded
 * inside the header's existing `<nav>` without nesting landmark regions.
 */
export function ProjectsMenu() {
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
            Projects
            <ChevronDown className="size-4 transition-transform duration-200 group-data-[popup-open]:rotate-180" />
          </NavigationMenu.Trigger>
          <NavigationMenu.Content className="transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0">
            <ul className="flex gap-4 p-2">
              {projects.map((project) => (
                <li key={project.name}>
                  <ProjectCard project={project} />
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
