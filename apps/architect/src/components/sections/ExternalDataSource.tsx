import { useEffect, useRef } from 'react';
import { compose } from 'react-recompose';

import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Section } from '~/components/EditorLayout';
import ArchitectField from '~/components/Form/ArchitectField';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import { useStageRestoreVersion } from '~/components/StageEditor/StageFormBridge';
import { useStageFormContext } from '~/components/StageEditor/stageFormContext';
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
  const { draft } = useStageFormContext();
  const dataSource = useStageFormValue<string | undefined>('dataSource');
  const initialDataSource = useStageInitialValue<string>('dataSource');
  // Guards against firing on mount: `dataSource` also "changes" from its
  // unregistered state to its initial value on the field's first render, and
  // this must only reset the dependent sections on a genuine user edit, never
  // when an existing stage is simply loaded into the editor.
  const previousDataSourceRef = useRef(dataSource);
  const restoreVersion = useStageRestoreVersion();
  const previousRestoreVersionRef = useRef(restoreVersion);
  useEffect(() => {
    const previousDataSource = previousDataSourceRef.current;
    previousDataSourceRef.current = dataSource;
    const previousRestoreVersion = previousRestoreVersionRef.current;
    previousRestoreVersionRef.current = restoreVersion;
    if (previousDataSource === dataSource) return;

    // An undo/redo restores the data source *and* the configuration that
    // belongs with it; clearing here would immediately undo that half of the
    // restore, and leave the user unable to recover the old source's setup.
    if (previousRestoreVersion !== restoreVersion) return;

    // Clear every LEAF path each dependent section actually registers —
    // `cardOptions`/`sortOptions`/`searchOptions` are never fields in their
    // own right (only their children are), and the store has no
    // hierarchical relationship between a path and its sub-paths, so writing
    // the parent would not reach any of them.
    //
    // As ONE gesture: four of these leaves are arrays, which snapshot on the
    // write, so clearing them one at a time would put four half-cleared
    // states — the new roster still carrying some of the old roster's
    // attribute references — on the undo timeline, where they are reachable
    // and saveable.
    draft.runGesture(() => {
      setStageValue('cardOptions.additionalProperties', undefined);
      setStageValue('sortOptions.sortOrder', undefined);
      setStageValue('sortOptions.sortableProperties', undefined);
      setStageValue('searchOptions.matchProperties', undefined);
      setStageValue('searchOptions.fuzziness', undefined);
    });
  }, [dataSource, draft, restoreVersion, setStageValue]);

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
      <>
        <ArchitectField
          component={DataSource}
          name="dataSource"
          initialValue={initialDataSource}
          label="Roster data source"
          validation={{ required: true }}
        />
      </>
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
