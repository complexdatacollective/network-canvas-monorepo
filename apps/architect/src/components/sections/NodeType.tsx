import { get } from 'es-toolkit/compat';

// Screen message listeners removed as part of screen system refactor
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';

import Row from '../EditorLayout/Row';
import Section from '../EditorLayout/Section';
import ValidatedField from '../Form/ValidatedField';
import IssueAnchor from '../IssueAnchor';
import EntitySelectField from './fields/EntitySelectField/EntitySelectField';
import Filter from './Filter';
import useResetStageOnSubjectChange from './useResetStageOnSubjectChange';

type NodeTypeProps = StageEditorSectionProps & {
  withFilter?: boolean;
};
const NodeType = (props: NodeTypeProps) => {
  const { form, interfaceType, withFilter = false } = props;
  const handleResetStage = useResetStageOnSubjectChange(form, interfaceType);
  // TODO: Restore auto-selection of newly created types when type creation dialogs
  // are properly integrated with form state management
  return (
    <Section
      title="Node Type"
      summary={
        <Paragraph>
          Select the type of node that this stage will create.
        </Paragraph>
      }
    >
      <Row>
        <IssueAnchor fieldName="subject" description="Node Type" />
        <ValidatedField
          name="subject"
          entityType="node"
          label="Node type"
          labelHidden
          promptBeforeChange="You attempted to change the node type of a stage that you have already configured. Before you can proceed the stage must be reset, which will remove any existing configuration. Do you want to reset the stage now?"
          component={EntitySelectField}
          onChange={handleResetStage}
          parse={(value) =>
            value == null ? value : { type: value, entity: 'node' }
          }
          format={(value) => get(value, 'type')}
          validation={{ required: true }}
        />
      </Row>
      {withFilter && (
        <Row>
          <Filter />
        </Row>
      )}
    </Section>
  );
};
export const FilteredNodeType = (props: NodeTypeProps) => (
  <NodeType withFilter {...props} />
);
export default NodeType;
