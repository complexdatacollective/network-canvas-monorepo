import { Badge } from '@codaco/fresco-ui/Badge';

type SkipDestinationBadgeProps = {
  destinationLabel: string;
};

const SkipDestinationBadge = ({
  destinationLabel,
}: SkipDestinationBadgeProps) => (
  <Badge variant="outline" className="max-w-md min-w-0 whitespace-normal">
    <span className="min-w-0 wrap-break-word">
      If skipped: {destinationLabel}
    </span>
  </Badge>
);

export default SkipDestinationBadge;
