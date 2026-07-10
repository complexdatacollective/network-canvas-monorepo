import { Component } from 'react';

import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import ExternalLink from '../../ExternalLink';
import EditEgoRule from './EditEgoRule';
import EditEntityRule from './EditEntityRule';

type EditRuleProps = {
  rule?: {
    type?: string;
    options?: Record<string, unknown>;
  };
  codebook: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
  onSave: () => void;
  onCancel: () => void;
};

class EditRule extends Component<EditRuleProps> {
  static defaultProps = {
    rule: undefined,
  };
  get TypeComponent() {
    const { rule } = this.props;
    if (rule?.type === 'ego') {
      return EditEgoRule;
    }

    return EditEntityRule;
  }

  handleSave = () => {
    const { onSave } = this.props;
    onSave();
  };

  render() {
    const { rule, codebook, onChange, onCancel, onSave } = this.props;

    return (
      <Dialog
        open={!!rule}
        closeDialog={onCancel}
        title="Construct a Rule"
        size="editor"
        footer={
          <>
            <Button onClick={onCancel}>Cancel</Button>
            <Button color="primary" onClick={onSave}>
              Finish and Close
            </Button>
          </>
        }
      >
        <div>
          <Paragraph>
            For help with constructing rules, see our documentation articles on{' '}
            <ExternalLink href="https://documentation.networkcanvas.com/key-concepts/skip-logic/">
              skip logic
            </ExternalLink>{' '}
            and{' '}
            <ExternalLink href="https://documentation.networkcanvas.com/key-concepts/network-filtering/">
              network filtering
            </ExternalLink>
            .
          </Paragraph>
          {rule?.type && (
            <this.TypeComponent
              rule={rule}
              codebook={codebook}
              onChange={onChange}
            />
          )}
        </div>
      </Dialog>
    );
  }
}

export default EditRule;
