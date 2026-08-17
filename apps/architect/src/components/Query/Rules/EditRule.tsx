import { Component, type ComponentProps, type ComponentType } from 'react';

import Button from '@codaco/fresco-ui/Button';
import Dialog from '@codaco/fresco-ui/dialogs/Dialog';
import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { documentationLinks } from '~/utils/documentationLinks';

import ExternalLink from '../../ExternalLink';
import { getDefaultOptions } from './defaultRule';
import EditEgoRule from './EditEgoRule';
import EditEntityRule from './EditEntityRule';
import { templates } from './options';
import RuleField from './RuleField';
const FrescoRadioGroupField = RadioGroupField as ComponentType<
  Record<string, unknown>
>;
type EditRuleProps = {
  open: boolean;
  rule?: {
    id?: string;
    type?: string;
    options?: Record<string, unknown>;
  };
  ruleTypes: Array<{
    label: string;
    value: 'node' | 'edge' | 'ego';
  }>;
  codebook: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
  onSave: () => void;
  onCancel: () => void;
  finalFocus?: ComponentProps<typeof Dialog>['finalFocus'];
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
  handleRuleTypeChange = (type: string) => {
    const { rule, onChange } = this.props;
    if (rule?.type === type) return;

    onChange({
      ...rule,
      type,
      options: getDefaultOptions(
        type === 'ego' ? templates.egoRule : templates.entityTypeRule,
      ),
    });
  };
  render() {
    const {
      open,
      rule,
      ruleTypes,
      codebook,
      onChange,
      onCancel,
      onSave,
      finalFocus,
    } = this.props;
    return (
      <Dialog
        open={open}
        closeDialog={onCancel}
        title="Construct a Rule"
        description={
          <>
            For help with constructing rules, see our documentation articles on{' '}
            <ExternalLink href={documentationLinks.skipLogic}>
              skip logic
            </ExternalLink>{' '}
            and{' '}
            <ExternalLink href={documentationLinks.networkFiltering}>
              network filtering
            </ExternalLink>
            .
          </>
        }
        finalFocus={finalFocus}
        footer={
          <>
            <Button color="default" onClick={onCancel}>
              Cancel
            </Button>
            <Button color="primary" onClick={onSave}>
              Finish and Close
            </Button>
          </>
        }
      >
        <RuleField
          component={FrescoRadioGroupField}
          label="Rule target"
          hint="Which entity type should your rule target?"
          options={ruleTypes}
          value={rule?.type}
          onChange={(_event, value) => {
            if (typeof value === 'string') {
              this.handleRuleTypeChange(value);
            }
          }}
          validation={{ required: true }}
        />

        {rule?.type && (
          <this.TypeComponent
            key={rule.type}
            rule={rule}
            codebook={codebook}
            onChange={onChange}
          />
        )}
      </Dialog>
    );
  }
}
export default EditRule;
