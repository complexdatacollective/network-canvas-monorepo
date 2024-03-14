import { Button } from '@codaco/ui';
import { X as CloseMenu, Menu as HamburgerMenu } from 'lucide-react';
import DocSearchComponent from './DocSearchComponent';
import MobileSidebarDialog from './MobileSidebarDialog';
import { useState } from 'react';

const MobileNavBar = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="flex flex-1 items-center gap-4 lg:hidden">
        <MobileSidebarDialog open={open} setOpen={setOpen} />
        <DocSearchComponent />
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
