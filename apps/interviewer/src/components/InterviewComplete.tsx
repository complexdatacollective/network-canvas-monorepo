import Button from '@codaco/fresco-ui/Button';
import Surface from '@codaco/fresco-ui/layout/Surface';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

export function InterviewComplete({ onExit }: { onExit: () => void }) {
  return (
    <div
      className="mx-auto flex h-full max-w-lg items-center justify-center p-8"
      data-testid="interview-complete"
    >
      <Surface
        floating
        spacing="lg"
        shadow="lg"
        className="flex flex-col items-center gap-4 text-center"
      >
        <Heading level="h1">Interview complete</Heading>
        <Paragraph>
          Thank you. This interview is finished and its responses can no longer
          be changed. Please hand the device back to the researcher.
        </Paragraph>
        <Button onClick={onExit} data-testid="interview-complete-exit">
          Exit
        </Button>
      </Surface>
    </div>
  );
}
