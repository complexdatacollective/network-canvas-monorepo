import { TriangleAlert } from 'lucide-react';

import { Container } from '~/components/ui/Container';
import { type compatibilityWarning } from '~/lib/getStarted';

type CompatibilityNoticeProps = {
  notice: typeof compatibilityWarning;
};

export function CompatibilityNotice({ notice }: CompatibilityNoticeProps) {
  return (
    <Container className="tablet-portrait:py-16 py-10">
      <aside className="bg-mustard/30 border-mustard tablet-portrait:gap-6 tablet-portrait:p-8 flex gap-4 rounded-[2rem] border p-6">
        <span className="bg-mustard text-cyber-grape flex size-11 shrink-0 items-center justify-center rounded-full">
          <TriangleAlert aria-hidden className="size-5" />
        </span>
        <div>
          <p className="font-heading text-cyber-grape text-lg font-black">
            {notice.title}
          </p>
          <p className="text-text/80 mt-2 leading-relaxed">
            {notice.description}
          </p>
        </div>
      </aside>
    </Container>
  );
}
