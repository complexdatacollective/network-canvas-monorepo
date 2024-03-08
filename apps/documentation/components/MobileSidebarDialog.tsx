'use client';

import { useLocale } from 'next-intl';
import { usePathname } from 'next/navigation';
import { NavigationMenuMobile } from '~/components/SharedNav/Menu';
import { Sheet, SheetContent } from '~/components/ui/sheet';
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

  const onClickLink = () => setOpen(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent className="bg-platinum" side={'left'}>
        <LogoComponent className="mx-4 my-2 block" />
        <NavigationMenuMobile />
        {!isHomePage && <Sidebar onClickLink={onClickLink} />}
      </SheetContent>
    </Sheet>
  );
}
