import { Button } from '@codaco/ui';
import { X as CloseMenu, Menu as HamburgerMenu } from 'lucide-react';
import DocSearchComponent from './DocSearchComponent';
import MobileSidebarDialog from './MobileSidebarDialog';
import { useState } from 'react';

const MobileNavBar = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <MobileSidebarDialog open={open} setOpen={setOpen} />
      <div className="flex items-center gap-3 lg:hidden">
        <DocSearchComponent className="hidden sm:flex" />
        {open ? (
          <Button
            onClick={() => setOpen(false)}
            variant="ghost"
            size="icon-large"
            className="shrink-0"
          >
            <CloseMenu className="h-8 w-8  transition-transform duration-300" />
          </Button>
        ) : (
          <Button
            onClick={() => setOpen(true)}
            variant="ghost"
            size="icon-large"
            className="shrink-0"
          >
            <HamburgerMenu className="h-8 w-8" />
          </Button>
        )}
      </div>
    </>
  );
};

export default MobileNavBar;
