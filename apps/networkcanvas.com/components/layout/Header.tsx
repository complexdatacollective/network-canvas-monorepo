'use client';

import { Menu, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { Variants } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { IconButton } from '@codaco/fresco-ui/Button';
import { LanguageSelector } from '~/components/layout/LanguageSelector';
import { SoftwareMenu } from '~/components/layout/SoftwareMenu';
import { ButtonLink } from '~/components/ui/ButtonLink';
import { Container } from '~/components/ui/Container';
import { Logo } from '~/components/ui/Logo';
import { navLinks, tools } from '~/lib/content';
import { GET_STARTED_PATH } from '~/lib/getStarted';
import { Link } from '~/lib/i18n/navigation';

const linkClasses =
  'font-heading text-cyber-grape hover:text-neon-coral text-sm font-bold tracking-[0.12em] uppercase transition-colors';

const topLevelLinks = navLinks.filter((link) => link.id !== 'getStarted');

function DesktopLinks() {
  const t = useTranslations('Navigation');

  return (
    <>
      {topLevelLinks.map((link) => (
        <a
          key={link.id}
          href={link.href}
          target="_blank"
          rel="noreferrer"
          className={linkClasses}
        >
          {t(link.id)}
        </a>
      ))}
    </>
  );
}

function MobileLinks({ onNavigate }: { onNavigate: () => void }) {
  const t = useTranslations('Navigation');

  return (
    <>
      {topLevelLinks.map((link) => (
        <a
          key={link.id}
          href={link.href}
          target="_blank"
          rel="noreferrer"
          onClick={onNavigate}
          className={linkClasses}
        >
          {t(link.id)}
        </a>
      ))}

      <div className="flex flex-col gap-3">
        <span className="font-heading text-cyber-grape/60 text-xs font-bold tracking-[0.12em] uppercase">
          {t('software')}
        </span>
        {tools.map((tool) => (
          <a
            key={tool.name}
            href={tool.href}
            target="_blank"
            rel="noreferrer"
            onClick={onNavigate}
            className={`${linkClasses} pl-3`}
          >
            {tool.name}
          </a>
        ))}
      </div>
    </>
  );
}

export function Header({ entranceVariants }: { entranceVariants?: Variants }) {
  const t = useTranslations('Navigation');
  const [open, setOpen] = useState(false);

  return (
    <motion.header variants={entranceVariants} className="relative z-50">
      <Container className="flex items-center justify-between py-6">
        <Link href="/" aria-label={t('home')}>
          <Logo />
        </Link>

        <nav className="tablet-landscape:flex hidden items-center gap-9">
          <DesktopLinks />
          <SoftwareMenu />
          <LanguageSelector />
          <ButtonLink
            href={GET_STARTED_PATH}
            color="primary"
            className="rounded-full"
          >
            {t('getStarted')}
          </ButtonLink>
        </nav>

        <IconButton
          icon={
            open ? (
              <X aria-hidden className="size-7" />
            ) : (
              <Menu aria-hidden className="size-7" />
            )
          }
          aria-label={open ? t('closeMenu') : t('openMenu')}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          variant="text"
          color="dynamic"
          size="sm"
          className="text-cyber-grape tablet-landscape:hidden size-11 border-transparent"
        />
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
              <LanguageSelector onNavigate={() => setOpen(false)} />
              <ButtonLink
                href={GET_STARTED_PATH}
                color="primary"
                className="rounded-full"
                onClick={() => setOpen(false)}
              >
                {t('getStarted')}
              </ButtonLink>
            </nav>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.header>
  );
}
