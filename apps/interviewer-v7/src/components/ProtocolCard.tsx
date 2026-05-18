import { Calendar, Hash, Users } from 'lucide-react';

import Surface from '@codaco/fresco-ui/layout/Surface';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { ProtocolWithCounts } from '~/lib/db/types';

type ProtocolCardProps = {
  protocol: ProtocolWithCounts;
  prominent?: boolean;
};

export function ProtocolCard({ protocol, prominent }: ProtocolCardProps) {
  return (
    <Surface
      level={prominent ? 2 : 1}
      spacing="md"
      className="flex flex-col gap-2"
    >
      <Heading level="h3" margin="none">
        {protocol.name}
      </Heading>
      {protocol.description ? (
        <Paragraph emphasis="muted">{protocol.description}</Paragraph>
      ) : null}
      <dl className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <div className="flex items-center gap-1">
          <Calendar className="size-3" aria-hidden />
          <dt className="sr-only">Imported</dt>
          <dd>Imported {new Date(protocol.importedAt).toLocaleDateString()}</dd>
        </div>
        <div className="flex items-center gap-1">
          <Users className="size-3" aria-hidden />
          <dt className="sr-only">Interviews</dt>
          <dd>
            {protocol.sessionCount} interview
            {protocol.sessionCount === 1 ? '' : 's'}
          </dd>
        </div>
        <div className="flex items-center gap-1">
          <Hash className="size-3" aria-hidden />
          <dt className="sr-only">Schema version</dt>
          <dd>Schema v{protocol.schemaVersion}</dd>
        </div>
      </dl>
    </Surface>
  );
}
