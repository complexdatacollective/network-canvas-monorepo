'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { motion, spring } from 'framer-motion';
import { Button, headingVariants } from '@acme/ui';

import { cn } from '~/lib/utils';
import Menu from './Menu';

export default function SharedNav({ active }: { active?: string }) {
  const t = useTranslations('SharedNavigation');

  return (
    <motion.nav
      className="justify-cente relative mx-auto flex w-full max-w-[1433px] flex-auto items-center justify-between px-6 py-4"
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{
        type: 'spring',
        stiffness: 200,
        damping: 30,
        mass: 1,
        // delay: 1.5,
      }}
    >
      <Link href="/" className="focusable flex-shrink-0 pr-10">
        <Image
          src="/images/mark.svg"
          alt="Network Canvas Documentation"
          width={48}
          height={48}
          className="h-9 w-9 lg:hidden"
          priority
        />
        <Image
          src="/images/typemark-negative.svg"
          alt="Network Canvas Documentation"
          height={48} //5.27
          width={275}
          className="hidden h-12 w-auto lg:block"
        />
      </Link>
      <Menu />
    </motion.nav>
  );
}
