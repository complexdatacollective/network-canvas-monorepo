import RichTextField from '../fields/RichTextField.tsx';
import ProtocolField from '../form/ProtocolField.tsx';
import BuilderSection from './BuilderSection.tsx';

/**
 * Notes the interviewer reads while running this stage.
 *
 * Authoring guidance, not participant content: it is never rendered during the
 * interview itself. Optional, so it is a capability the researcher switches
 * on — and switching it off destroys what they wrote, which is why the switch
 * asks first.
 */
export default function InterviewerGuidanceSection() {
  return (
    <BuilderSection
      title="Interviewer guidance"
      description="Create notes or a guide for the interviewer."
      capability={{
        fields: ['interviewScript'],
        confirmClear: {
          title: 'This will clear your interview script',
          description:
            'This will clear your interview script, and delete content you previously entered. Do you want to continue?',
          confirmLabel: 'Clear script',
        },
      }}
    >
      <ProtocolField
        name="interviewScript"
        component={RichTextField}
        label="Interviewer script text"
        placeholder="Enter text for the interviewer here..."
      />
    </BuilderSection>
  );
}
