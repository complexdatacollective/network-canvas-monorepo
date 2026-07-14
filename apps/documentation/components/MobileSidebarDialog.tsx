import { Drawer } from '@base-ui/react/drawer';
import { X as CloseMenu } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import { useEffect, type RefObject } from 'react';

import { IconButton } from '@codaco/fresco-ui/Button';
import { hasDocumentationSection } from '~/app/types';
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
    <Drawer.Root
      open={open}
      onOpenChange={(nextOpen) => setOpen(nextOpen)}
      swipeDirection="left"
    >
      <Drawer.Portal>
        <Drawer.Backdrop className="bg-overlay publish-colors fixed inset-0 z-40 backdrop-blur-xs transition-opacity duration-300 ease-out data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none" />
        <Drawer.Viewport className="phone-landscape:max-w-sm fixed inset-y-0 left-0 z-50 w-full">
          <Drawer.Popup
            finalFocus={openerRef}
            className="bg-background elevation-medium flex h-dvh w-full transform-[translateX(var(--drawer-swipe-movement-x,0px))] flex-col overflow-y-auto px-4 py-0 transition-transform duration-300 ease-out data-ending-style:transform-[translateX(-100%)] data-starting-style:transform-[translateX(-100%)] data-swiping:duration-0 motion-reduce:transition-none"
          >
            <Drawer.Title className="sr-only">
              {t('documentationNavigation')}
            </Drawer.Title>
            <Drawer.Description className="sr-only">
              {t('documentationNavigationDescription')}
            </Drawer.Description>
            <div className="bg-background sticky top-0 z-10 flex items-center justify-between">
              <Link
                href="/"
                aria-label={t('documentationHome')}
                className="focusable mx-4 my-2 block w-fit rounded-sm"
              >
                <LogoComponent />
              </Link>
              <Drawer.Close
                render={
                  <IconButton
                    size="sm"
                    variant="text"
                    color="dynamic"
                    aria-label={t('closeDocumentationMenu')}
                    icon={<CloseMenu aria-hidden className="size-4 shrink-0" />}
                  />
                }
              />
            </div>

            <WorkflowNav variant="collapsed" className="my-2" />
            <Sidebar />
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
