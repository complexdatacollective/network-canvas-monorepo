import { useId, useMemo } from 'react';

import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { CurrentProtocolSchema } from '@codaco/protocol-validation';
import { useAppSelector } from '~/ducks/hooks';
import { getActiveProtocolId } from '~/ducks/modules/app';
import { useSyntheticFeasibility } from '~/hooks/useSyntheticFeasibility';
import { getProtocol } from '~/selectors/protocol';

import { buildStageRows } from './stageRows';
import { SyntheticStageTable } from './SyntheticStageTable';
import { SyntheticVariableTable } from './SyntheticVariableTable';
import { SyntheticVerdict } from './SyntheticVerdict';
import { buildVariableRows } from './variableRows';

/**
 * The read-only "Synthetic data" overview (spec, Surfaces §4).
 *
 * Two readings of the same protocol, side by side, because each answers a
 * question the other cannot. The PARSE supplies every effective value — the
 * schema's prefaults, defaults and transforms are what resolve them, so what is
 * shown here is what generation would do — while the SAVED DOCUMENT says which
 * of those values a human actually wrote, which is the whole content of the
 * authored/default badges.
 *
 * Nothing on this screen edits anything: every row links to the editor that
 * owns its values.
 */

const STAGES_HEADING = 'Stages';
const STAGES_DESCRIPTION =
  'What each stage contributes to a generated interview. Open a stage to change its synthetic parameters.';
const VARIABLES_HEADING = 'Attributes';
const VARIABLES_DESCRIPTION =
  'The values synthetic generation produces for each attribute in your codebook. Open the Codebook to change them.';

export function SyntheticOverview() {
  const protocol = useAppSelector(getProtocol);
  const protocolId = useAppSelector(getActiveProtocolId);
  const stagesHeadingId = useId();
  const variablesHeadingId = useId();

  const feasibility = useSyntheticFeasibility({
    document: protocol,
    protocolId,
  });

  // The saved protocol is admitted through validation before it can be edited,
  // so this normally succeeds; a draft that has since stopped parsing reports
  // itself through the verdict above rather than through half-built tables.
  const parsed = useMemo(
    () =>
      protocol === null ? undefined : CurrentProtocolSchema.safeParse(protocol),
    [protocol],
  );

  const stageRows = useMemo(
    () =>
      parsed?.success === true
        ? buildStageRows(parsed.data, protocol, feasibility.conflicts)
        : [],
    [parsed, protocol, feasibility.conflicts],
  );

  const variableRows = useMemo(
    () =>
      parsed?.success === true ? buildVariableRows(parsed.data, protocol) : [],
    [parsed, protocol],
  );

  return (
    <div className="mx-auto my-10 flex w-full max-w-7xl flex-col gap-10">
      <SyntheticVerdict feasibility={feasibility} />
      {parsed?.success === true && (
        <>
          <section
            aria-labelledby={stagesHeadingId}
            className="flex flex-col gap-4"
          >
            <Heading id={stagesHeadingId} level="h2" margin="none">
              {STAGES_HEADING}
            </Heading>
            <Paragraph margin="none" className="text-muted">
              {STAGES_DESCRIPTION}
            </Paragraph>
            <SyntheticStageTable
              rows={stageRows}
              labelledBy={stagesHeadingId}
            />
          </section>
          <section
            aria-labelledby={variablesHeadingId}
            className="flex flex-col gap-4"
          >
            <Heading id={variablesHeadingId} level="h2" margin="none">
              {VARIABLES_HEADING}
            </Heading>
            <Paragraph margin="none" className="text-muted">
              {VARIABLES_DESCRIPTION}
            </Paragraph>
            <SyntheticVariableTable
              rows={variableRows}
              labelledBy={variablesHeadingId}
            />
          </section>
        </>
      )}
    </div>
  );
}
