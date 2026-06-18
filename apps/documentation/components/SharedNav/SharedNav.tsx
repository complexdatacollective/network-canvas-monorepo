import { motion } from 'motion/react';

import { cn } from '~/lib/utils';

import MobileNavBar from '../MobileNavBar';
import LogoComponent from './LogoComponent';
import { NavigationMenuDemo as Menu } from './Menu';

export default function SharedNav({
  isHomePage = false,
}: {
  isHomePage?: boolean;
}) {
  return (
    <motion.nav
      className={cn(
        'border-border sticky top-0 z-50 mx-auto flex w-full flex-auto grow-0 items-center justify-between gap-4 border-b px-4 py-2 backdrop-blur-sm',
        'lg:relative lg:flex lg:px-6 lg:py-4',
        // The homepage keeps a translucent nav that floats over the hero; every
        // other page gets a solid white bar to separate it from page content.
        isHomePage
          ? 'bg-background/50 lg:backdrop-blur-0 lg:border-none lg:bg-transparent'
          : 'bg-white',
      )}
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{
        type: 'spring',
        stiffness: 200,
        damping: 30,
        mass: 1,
      }}
    >
      <LogoComponent />
      <Menu />
      <MobileNavBar />
    </motion.nav>
  );
}
