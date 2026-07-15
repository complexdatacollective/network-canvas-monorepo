import { PanelLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import { useRef, useState } from 'react';

import { IconButton } from '@codaco/fresco-ui/Button';
import { hasDocumentationSection } from '~/app/types';

import DocSearchComponent from './DocSearchComponent';
import MobileSidebarDialog from './MobileSidebarDialog';

const MobileNavBar = () => {
  const [open, setOpen] = useState(false);
  const documentationMenuButtonRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const t = useTranslations('SharedNavigation');

  const showDocumentationMenu = hasDocumentationSection(pathname);

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <MobileSidebarDialog
        open={open}
        setOpen={setOpen}
        openerRef={documentationMenuButtonRef}
      />
      <DocSearchComponent
        backgroundTarget={showDocumentationMenu}
        className="min-w-0"
      />
      {showDocumentationMenu ? (
        <IconButton
          ref={documentationMenuButtonRef}
          onClick={() => setOpen(true)}
          size="lg"
          variant="text"
          color="dynamic"
          aria-label={t('openDocumentationMenu')}
          aria-haspopup="dialog"
          aria-expanded={open}
          className="text-text shrink-0 border-transparent"
          icon={<PanelLeft aria-hidden className="size-7" />}
        />
      ) : null}
    </div>
  );
};

export default MobileNavBar;
