import { motion } from 'motion/react';

import { cx } from '@codaco/fresco-ui/utils/cva';

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
      className={cx(
        'border-outline sticky top-0 z-50 mx-auto flex w-full flex-auto grow-0 items-center justify-between gap-4 border-b px-4 py-2 backdrop-blur-sm',
        'tablet-landscape:relative tablet-landscape:flex tablet-landscape:px-6 tablet-landscape:py-4',
        // The homepage keeps a translucent nav that floats over the hero; every
        // other page gets a solid bar to separate it from page content. The
        // background token auto-swaps: near-white in light mode, dark in dark.
        isHomePage
          ? 'bg-background/50 tablet-landscape:backdrop-blur-0 tablet-landscape:border-none tablet-landscape:bg-transparent'
          : 'bg-background',
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
