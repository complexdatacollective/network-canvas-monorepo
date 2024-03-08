'use client';

import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import MobileNavBar from '../MobileNavBar';
import LogoComponent from './LogoComponent';
import { NavigationMenuDemo as Menu } from './Menu';

export default function SharedNav({ active }: { active?: string }) {
  const t = useTranslations('SharedNavigation');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <motion.nav
      className="sticky top-0 z-50 mx-auto flex w-full max-w-[1433px] flex-auto items-center justify-between px-6 py-4 backdrop-blur-md lg:relative lg:backdrop-blur-0"
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
      <LogoComponent invisible={isMobileMenuOpen} />
      <Menu />
      <MobileNavBar open={isMobileMenuOpen} setOpen={setIsMobileMenuOpen} />
    </motion.nav>
  );
}
