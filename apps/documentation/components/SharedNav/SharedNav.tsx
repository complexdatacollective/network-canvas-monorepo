import { motion } from 'framer-motion';
import MobileNavBar from '../MobileNavBar';
import LogoComponent from './LogoComponent';
import { NavigationMenuDemo as Menu } from './Menu';
import { cn } from '~/lib/utils';

export default function SharedNav() {
  return (
    <motion.nav
      className={cn(
        'sticky top-0 z-50 mx-auto flex w-full flex-auto grow-0 items-center justify-between gap-4 border-b border-border bg-background/50 px-4 py-2 backdrop-blur-sm',
        'lg:relative lg:flex lg:border-none lg:bg-transparent lg:px-6 lg:py-4 lg:backdrop-blur-0',
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
