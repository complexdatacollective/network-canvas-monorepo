import { X as CloseMenu } from 'lucide-react';
import { useLocale } from 'next-intl';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

import { IconButton } from '@codaco/fresco-ui/Button';
import { NavigationMenuMobile } from '~/components/SharedNav/Menu';
import { Sheet, SheetContent } from '~/components/ui/sheet';
import WorkflowNav from '~/components/WorkflowNav';

import LogoComponent from './SharedNav/LogoComponent';
import { Sidebar } from './Sidebar';

type MobileSidebarDialogProps = {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

export default function MobileSidebarDialog({
  open,
  setOpen,
}: MobileSidebarDialogProps) {
  const pathname = usePathname();
  const locale = useLocale();

  // Check if we are on the home page by comparing the pathname to our supported locals
  const isHomePage = pathname === `/${locale}`;

  // biome-ignore lint/correctness/useExhaustiveDependencies: close when the path changes
  useEffect(() => {
    setOpen(false);
  }, [pathname, setOpen]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        className="bg-background flex h-screen w-full flex-col overflow-y-auto px-4 py-0"
        side={'left'}
      >
        <div className="bg-background sticky top-0 z-10 flex items-center justify-between">
          <LogoComponent className="mx-4 my-2 block w-fit" />
          <IconButton
            size="sm"
            onClick={() => setOpen(false)}
            variant="text"
            aria-label="Close navigation menu"
            className="sm:hidden"
            icon={<CloseMenu className="h-4 w-4 shrink-0" />}
          />
        </div>

        <NavigationMenuMobile />
        {!isHomePage && <WorkflowNav variant="collapsed" className="my-2" />}
        {!isHomePage && <Sidebar />}
      </SheetContent>
    </Sheet>
  );
}
