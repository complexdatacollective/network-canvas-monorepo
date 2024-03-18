import { useLocale } from 'next-intl';
import { usePathname } from 'next/navigation';
import { NavigationMenuMobile } from '~/components/SharedNav/Menu';
import { Sheet, SheetContent } from '~/components/ui/sheet';
import LogoComponent from './SharedNav/LogoComponent';
import { Sidebar } from './Sidebar';
import { Button } from '@codaco/ui';
import { X as CloseMenu } from 'lucide-react';
import { useEffect } from 'react';

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

  // When the path changes, close
  useEffect(() => {
    setOpen(false);
  }, [pathname, setOpen]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        className="flex h-[100vh] w-full flex-col overflow-y-auto bg-background"
        side={'left'}
      >
        <div className="sticky top-2 flex items-center justify-between bg-background">
          <LogoComponent className="mx-4 my-2 block w-fit" />
          <Button
            size={'sm'}
            onClick={() => setOpen(false)}
            variant="ghost"
            className="flex h-10 w-10 items-center justify-center gap-2 rounded-full sm:hidden"
          >
            <CloseMenu className="h-4 w-4 shrink-0" />
          </Button>
        </div>

        <NavigationMenuMobile />
        {!isHomePage && <Sidebar />}
      </SheetContent>
    </Sheet>
  );
}
