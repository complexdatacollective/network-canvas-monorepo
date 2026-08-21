import { Badge } from '@codaco/fresco-ui/Badge';
import {
  AUTHORED_BADGE_LABEL,
  DEFAULT_BADGE_LABEL,
} from '~/components/Synthetic/SyntheticSection';

import type { ResolvedParameter } from './stageRows';

/**
 * One resolved parameter as the overview shows it: the effective value with
 * the badge saying whether a human wrote it or the schema resolved it (spec
 * governing rule 5, "authored vs default is always visible").
 *
 * The badge words come from `SyntheticSection`, which puts the same badge on
 * the editors these rows link to — one distinction, said one way, wherever a
 * researcher meets it.
 *
 * A parameter the stage does not carry renders as a dash for sighted readers
 * and as the words for a screen reader — a bare "—" is announced as anything
 * from "em dash" to silence, and an empty cell in a table of resolved values
 * would read as a value that failed to load.
 */

const NOT_APPLICABLE_LABEL = 'Not applicable';

export type ParameterValueProps = {
  parameter: ResolvedParameter | undefined;
};

export function ParameterValue({ parameter }: ParameterValueProps) {
  if (parameter === undefined) {
    return (
      <>
        <span aria-hidden className="text-muted">
          —
        </span>
        <span className="sr-only">{NOT_APPLICABLE_LABEL}</span>
      </>
    );
  }

  // A `div` because `Badge` is one: a block element inside a `span` is invalid
  // nesting, and the browser's repair would move it out of the cell.
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span>{parameter.value}</span>
      <Badge variant="outline" className="shrink-0">
        {parameter.authored ? AUTHORED_BADGE_LABEL : DEFAULT_BADGE_LABEL}
      </Badge>
    </div>
  );
}
