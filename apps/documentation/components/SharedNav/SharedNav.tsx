import { motion } from 'framer-motion';
import MobileNavBar from '../MobileNavBar';
import LogoComponent from './LogoComponent';
import { NavigationMenuDemo as Menu } from './Menu';
import { cn } from '~/lib/utils';
import { useBreakpoint } from '~/hooks/useBreakpoint';

export default function SharedNav() {
  const { isAboveMd } = useBreakpoint('md');
  const { isBelowLg } = useBreakpoint('lg');
  return (
    <motion.nav
      className={cn(
        'sticky top-0 z-50 mx-auto flex w-full flex-auto items-center justify-between gap-4 bg-background/80 px-4 py-2 shadow-md backdrop-blur-sm',
        'lg:relative lg:flex lg:bg-transparent lg:px-6 lg:py-4 lg:shadow-none lg:backdrop-blur-0',
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
      {isAboveMd && <Menu />}
      {isBelowLg && <MobileNavBar />}
    </motion.nav>
  );
}
