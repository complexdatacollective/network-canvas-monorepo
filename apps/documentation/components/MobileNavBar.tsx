import { Button } from '@acme/ui';
import { X as CloseMenu, Menu as HamburgerMenu } from 'lucide-react';
import { useState } from 'react';
import { cn } from '~/lib/utils';
import DocSearchComponent from './DocSearchComponent';
import MobileSidebarDialog from './MobileSidebarDialog';
import ProjectSwitcher from './ProjectSwitcher';

const MobileNavBar = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <>
      <nav
        className={cn(
          'sticky top-0 z-50 mb-4 flex max-h-[120px] w-full max-w-[1433px] flex-auto items-center justify-between gap-3 bg-sea-green-dark px-6 lg:hidden',
        )}
      >
        {isMenuOpen ? (
          <Button
            onClick={() => setIsMenuOpen(false)}
            variant="outline"
            className="rounded-full px-5 py-5"
          >
            <CloseMenu className="shrink-0 transition-transform duration-300" />
          </Button>
        ) : (
          <Button
            onClick={() => setIsMenuOpen(true)}
            variant="outline"
            className="rounded-full px-5 py-5"
          >
            <HamburgerMenu className="shrink-0 transition-transform duration-300" />
          </Button>
        )}

        <ProjectSwitcher />
        <DocSearchComponent />
      </nav>
      <MobileSidebarDialog open={isMenuOpen} setOpen={setIsMenuOpen} />
    </>
  );
};

export default MobileNavBar;
