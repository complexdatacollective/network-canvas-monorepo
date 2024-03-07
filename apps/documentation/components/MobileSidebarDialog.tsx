'use client';

import { Sheet, SheetContent } from '~/components/ui/sheet';
import LogoComponent from './SharedNav/LogoComponent';
import { SidebarMobile } from './Sidebar';
import { NavigationMenuMobile } from '~/components/SharedNav/Menu';

type MobileSidebarDialogProps = {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
};

export default function MobileSidebarDialog({
  open,
  setOpen,
}: MobileSidebarDialogProps) {
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent className="w-fit bg-platinum" side={'left'}>
        <LogoComponent className="mx-4 my-2 block" />
        <NavigationMenuMobile />
        <SidebarMobile />
      </SheetContent>
    </Sheet>
  );
}
