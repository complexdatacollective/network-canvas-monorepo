'use client';

import { useLocale } from 'next-intl';
import { usePathname } from 'next/navigation';
import { NavigationMenuMobile } from '~/components/SharedNav/Menu';
import { Sheet, SheetContent } from '~/components/ui/sheet';
import LogoComponent from './SharedNav/LogoComponent';
import { Sidebar } from './Sidebar';
import { Button } from '@codaco/ui';
import { X as CloseMenu } from 'lucide-react';
import DocSearchComponent from './DocSearchComponent';

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

  const onClickLink = () => setOpen(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent className="w-full bg-background" side={'left'}>
        <div className="absolute right-4 top-4 flex items-center gap-2 sm:hidden">
          <Button
            size={'sm'}
            onClick={() => setOpen(false)}
            variant="outline"
            className="rounded-full px-4"
          >
            <CloseMenu className="h-4 w-4 shrink-0 transition-transform duration-300" />
          </Button>
        </div>

        <LogoComponent className="mx-4 my-2 block w-fit" />
        <NavigationMenuMobile />
        {!isHomePage && <Sidebar onClickLink={onClickLink} />}
      </SheetContent>
    </Sheet>
  );
}
