'use client';

import { Sheet, SheetContent } from '~/components/ui/sheet';
import { SidebarMobile } from './Sidebar';

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
      <SheetContent className="w-fit bg-neon-coral-dark" side={'left'}>
        <SidebarMobile />
      </SheetContent>
    </Sheet>
  );
}
