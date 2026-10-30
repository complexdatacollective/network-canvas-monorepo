import { stageTypeStyle } from '../lib/stageTypes.ts';
import type { StageSummary } from '../shared/api.ts';

type Props = {
  stages: StageSummary[];
  variant: 'night' | 'paper';
  // Compare: stage types the other run does not have.
  onlyHere?: ReadonlySet<string>;
};

export const StageList = ({ stages, variant, onlyHere }: Props) => {
  if (variant === 'night') {
    return (
      <ol className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(230px,100%),1fr))] gap-2.5 p-0">
        {stages.map((stage, index) => {
          const style = stageTypeStyle(stage.type);
          return (
            <li
              key={`${index}-${stage.label}`}
              className="bg-night-tile flex items-center gap-3 rounded-2xl px-3 py-2.5"
            >
              <span
                aria-hidden="true"
                className="font-display grid size-9 flex-none place-items-center rounded-xl text-[0.9375rem] font-black"
                style={style.swatch}
              >
                {index + 1}
              </span>
              <span className="flex min-w-0 flex-col leading-[1.3]">
                <span className="text-[0.9375rem] font-bold break-words">
                  {stage.label}
                </span>
                <span className="text-night-muted text-[0.8125rem]">
                  {style.label}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    );
  }

  return (
    <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
      {stages.map((stage, index) => {
        const style = stageTypeStyle(stage.type);
        const unique = onlyHere?.has(stage.type) ?? false;
        return (
          <li
            key={`${index}-${stage.label}`}
            className="border-paper-rule flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border bg-white px-2.5 py-2"
          >
            <span
              aria-hidden="true"
              className="grid size-7 flex-none place-items-center rounded-[9px] text-[0.8125rem] font-extrabold"
              style={style.swatch}
            >
              {index + 1}
            </span>
            <span className="min-w-0 flex-1 text-[0.9375rem] font-semibold break-words">
              {stage.label}
            </span>
            <span className="text-ink-muted text-[0.8125rem]">
              {style.label}
            </span>
            {unique && (
              <span className="bg-mustard-tag text-mustard-ink flex-none rounded-full px-2 py-0.5 text-xs font-bold">
                Only here
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
};
