import { cn } from '~/lib/cn';
import type { ProtocolStage } from '~/lib/protocolStages';
import { stageColorClass } from '~/lib/stageTypes';

export function StageBar({
  stages,
  className,
}: {
  stages: ProtocolStage[];
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        'flex h-2 w-full gap-px overflow-hidden rounded-full',
        className,
      )}
    >
      {stages.map((stage, index) => (
        <span
          key={`${index}-${stage.type}`}
          className={cn('min-w-0 flex-1', stageColorClass(stage.type))}
        />
      ))}
    </div>
  );
}
