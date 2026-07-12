'use client';

import { Menu, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { Variants } from 'motion/react';
import Link from 'next/link';
import { useState } from 'react';

import { ProjectsMenu } from '~/components/layout/ProjectsMenu';
import { ButtonLink } from '~/components/ui/ButtonLink';
import { Container } from '~/components/ui/Container';
import { Logo } from '~/components/ui/Logo';
import { navLinks, projects } from '~/lib/content';

const linkClasses =
  'font-heading text-cyber-grape hover:text-neon-coral text-sm font-bold tracking-[0.12em] uppercase transition-colors';

const topLevelLinks = navLinks.filter((link) => link.href !== '/download');

function DesktopLinks() {
  return (
    <>
      {topLevelLinks.map((link) => (
        <Link
          key={link.label}
          href={link.href}
          target={link.external ? '_blank' : undefined}
          rel={link.external ? 'noreferrer' : undefined}
          className={linkClasses}
        >
          {link.label}
        </Link>
      ))}
    </>
  );
}

function MobileLinks({ onNavigate }: { onNavigate: () => void }) {
  return (
    <>
      {topLevelLinks.map((link) => (
        <Link
          key={link.label}
          href={link.href}
          target={link.external ? '_blank' : undefined}
          rel={link.external ? 'noreferrer' : undefined}
          onClick={onNavigate}
          className={linkClasses}
        >
          {link.label}
        </Link>
      ))}

      <div className="flex flex-col gap-3">
        <span className="font-heading text-cyber-grape/60 text-xs font-bold tracking-[0.12em] uppercase">
          Projects
        </span>
        {projects.map((project) => (
          <a
            key={project.name}
            href={project.href}
            target="_blank"
            rel="noreferrer"
            onClick={onNavigate}
            className={`${linkClasses} pl-3`}
          >
            {project.name}
          </a>
        ))}
      </div>
    </>
  );
}

export function Header({ entranceVariants }: { entranceVariants?: Variants }) {
  const [open, setOpen] = useState(false);

  return (
    <motion.header variants={entranceVariants} className="relative z-50">
      <Container className="flex items-center justify-between py-6">
        <Link href="/" aria-label="Network Canvas home">
          <Logo />
        </Link>

        <nav className="tablet-landscape:flex hidden items-center gap-9">
          <DesktopLinks />
          <ProjectsMenu />
          <ButtonLink href="/download" color="primary" className="rounded-full">
            Download
          </ButtonLink>
        </nav>

        <button
          type="button"
          aria-label="Toggle menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="focusable text-cyber-grape tablet-landscape:hidden rounded-full p-2"
        >
          {open ? <X className="size-7" /> : <Menu className="size-7" />}
        </button>
      </Container>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="bg-surface tablet-landscape:hidden absolute inset-x-4 top-full z-50 rounded-[1.75rem] p-6 shadow-xl"
          >
            <nav className="flex flex-col gap-5">
              <MobileLinks onNavigate={() => setOpen(false)} />
              <ButtonLink
                href="/download"
                color="primary"
                className="rounded-full"
                onClick={() => setOpen(false)}
              >
                Download
              </ButtonLink>
            </nav>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.header>
  );
}
