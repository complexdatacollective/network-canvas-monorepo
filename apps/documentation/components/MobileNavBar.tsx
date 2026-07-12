import { X as CloseMenu, Menu as HamburgerMenu } from 'lucide-react';
import { useLocale } from 'next-intl';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import { IconButton } from '@codaco/fresco-ui/Button';
import { cx } from '@codaco/fresco-ui/utils/cva';

import DocSearchComponent from './DocSearchComponent';
import MobileSidebarDialog from './MobileSidebarDialog';

const MobileNavBar = () => {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const locale = useLocale();

  // Check if we are on the home page by comparing the pathname to our supported locals
  const isHomePage = pathname === `/${locale}`;
  return (
    <div className="flex shrink grow basis-auto items-center gap-4 lg:hidden">
      <MobileSidebarDialog open={open} setOpen={setOpen} />
      <DocSearchComponent />
      {open ? (
        <IconButton
          onClick={() => setOpen(false)}
          variant="text"
          aria-label="Close navigation menu"
          className="shrink-0"
          icon={
            <CloseMenu className="h-8 w-8 transition-transform duration-300" />
          }
        />
      ) : (
        <IconButton
          onClick={() => setOpen(true)}
          variant="text"
          aria-label="Open navigation menu"
          className={cx('shrink-0', isHomePage && 'md:hidden')}
          icon={<HamburgerMenu className="h-8 w-8" />}
        />
      )}
    </div>
  );
};

export default MobileNavBar;
