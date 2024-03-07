import { Button } from '@acme/ui';
import { X as CloseMenu, Menu as HamburgerMenu } from 'lucide-react';
import DocSearchComponent from './DocSearchComponent';
import MobileSidebarDialog from './MobileSidebarDialog';

type MobileNavBarProps = {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

const MobileNavBar = ({ open, setOpen }: MobileNavBarProps) => {
  return (
    <>
      <MobileSidebarDialog open={open} setOpen={setOpen} />

      <div className="flex items-center gap-3 lg:hidden">
        <DocSearchComponent />

        {open ? (
          <Button
            size={'sm'}
            onClick={() => setOpen(false)}
            variant="outline"
            className="pointer-events-auto rounded-full"
          >
            <CloseMenu className="h-5 w-5 shrink-0 transition-transform duration-300" />
          </Button>
        ) : (
          <Button
            size={'sm'}
            onClick={() => setOpen(true)}
            variant="outline"
            className="rounded-full"
          >
            <HamburgerMenu className="h-5 w-5 shrink-0 transition-transform duration-300" />
          </Button>
        )}
      </div>
    </>
  );
};

export default MobileNavBar;
