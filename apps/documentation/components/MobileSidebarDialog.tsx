import { X as CloseMenu } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import { useEffect, type RefObject } from 'react';

import { IconButton } from '@codaco/fresco-ui/Button';
import { hasDocumentationSection } from '~/app/types';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '~/components/ui/sheet';
import WorkflowNav from '~/components/WorkflowNav';
import { Link } from '~/navigation';

import LogoComponent from './SharedNav/LogoComponent';
import { Sidebar } from './Sidebar';

type MobileSidebarDialogProps = {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  openerRef: RefObject<HTMLButtonElement | null>;
};

export default function MobileSidebarDialog({
  open,
  setOpen,
  openerRef,
}: MobileSidebarDialogProps) {
  const pathname = usePathname();
  const t = useTranslations('SharedNavigation');

  // biome-ignore lint/correctness/useExhaustiveDependencies: close when the path changes
  useEffect(() => {
    setOpen(false);
  }, [pathname, setOpen]);

  // The drawer can remain open for one render while a client navigation moves
  // back to the docs home page. Avoid mounting Sidebar without a valid section
  // during that transition; the pathname effect above then resets open state.
  if (!hasDocumentationSection(pathname)) return null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        className="bg-background flex h-screen w-full flex-col overflow-y-auto px-4 py-0"
        side="left"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          openerRef.current?.focus();
        }}
      >
        <SheetTitle className="sr-only">
          {t('documentationNavigation')}
        </SheetTitle>
        <SheetDescription className="sr-only">
          {t('documentationNavigationDescription')}
        </SheetDescription>
        <div className="bg-background sticky top-0 z-10 flex items-center justify-between">
          <Link
            href="/"
            aria-label={t('documentationHome')}
            className="focusable mx-4 my-2 block w-fit rounded-sm"
          >
            <LogoComponent />
          </Link>
          <IconButton
            size="sm"
            onClick={() => setOpen(false)}
            variant="text"
            color="dynamic"
            aria-label={t('closeDocumentationMenu')}
            icon={<CloseMenu aria-hidden className="size-4 shrink-0" />}
          />
        </div>

        <WorkflowNav variant="collapsed" className="my-2" />
        <Sidebar />
      </SheetContent>
    </Sheet>
  );
}
