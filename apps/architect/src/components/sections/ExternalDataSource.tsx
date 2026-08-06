import { useEffect, useRef } from 'react';
import { compose } from 'react-recompose';

import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Row, Section } from '~/components/EditorLayout';
import ArchitectField from '~/components/Form/ArchitectField';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import {
  useSetStageValue,
  useStageFormValue,
  useStageInitialValue,
  useSubject,
} from '~/components/StageEditor/stageFormHooks';

import withDisabledSubjectRequired from '../enhancers/withDisabledSubjectRequired';
import DataSource from '../Form/Fields/DataSource';

type ExternalDataSourceProps = StageEditorSectionProps & {
  disabled: boolean;
  disabledMessage?: string;
};

const ExternalDataSource = ({
  disabled,
  disabledMessage,
}: ExternalDataSourceProps) => {
  const setStageValue = useSetStageValue();
  const dataSource = useStageFormValue<string | undefined>('dataSource');
  const initialDataSource = useStageInitialValue<string>('dataSource');
  // Guards against firing on mount: `dataSource` also "changes" from its
  // unregistered state to its initial value on the field's first render, and
  // this must only reset the dependent sections on a genuine user edit, never
  // when an existing stage is simply loaded into the editor.
  const previousDataSourceRef = useRef(dataSource);
  useEffect(() => {
    const previousDataSource = previousDataSourceRef.current;
    previousDataSourceRef.current = dataSource;
    if (previousDataSource === dataSource) return;

    // Clear every LEAF path each dependent section actually registers —
    // `cardOptions`/`sortOptions`/`searchOptions` are never fields in their
    // own right (only their children are), and the store has no
    // hierarchical relationship between a path and its sub-paths, so writing
    // the parent would not reach any of them.
    setStageValue('cardOptions.additionalProperties', undefined);
    setStageValue('sortOptions.sortOrder', undefined);
    setStageValue('sortOptions.sortableProperties', undefined);
    setStageValue('searchOptions.matchProperties', undefined);
    setStageValue('searchOptions.fuzziness', undefined);
  }, [dataSource, setStageValue]);

  return (
    <Section
      title="Data source for Roster"
      summary={
        <Paragraph>
          This stage needs a source of nodes to populate the roster. Select a
          network data file to use.
        </Paragraph>
      }
      disabled={disabled}
      disabledMessage={disabledMessage}
    >
      <Row>
        <ArchitectField
          component={DataSource}
          name="dataSource"
          initialValue={initialDataSource}
          label="Roster data source"
          validation={{ required: true }}
        />
      </Row>
    </Section>
  );
};

type GatedProps = StageEditorSectionProps & { type?: string };

/**
 * `withDisabledSubjectRequired` reads `interfaceType`/`type` props — `type`
 * is `useSubject`'s replacement for the deleted `withSubject` enhancer.
 * `compose` is hoisted to module scope so the gated component keeps a stable
 * identity across renders (building it inside the render below would remount
 * `ExternalDataSource`, including its dependent-field-reset effect, on every
 * render).
 */
const GatedExternalDataSource = compose<ExternalDataSourceProps, GatedProps>(
  withDisabledSubjectRequired,
)(ExternalDataSource);

const ExternalDataSourceWithSubject = (props: StageEditorSectionProps) => {
  const { type } = useSubject();
  return <GatedExternalDataSource {...props} type={type ?? undefined} />;
};

export default ExternalDataSourceWithSubject;
