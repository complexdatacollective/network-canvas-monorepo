import { Alert } from '../Alert';
import Paragraph from '../typography/Paragraph';
import { UnorderedList } from '../typography/UnorderedList';

type FormErrorsProps = {
  errors: string[] | null;
};

export default function FormErrors({ errors }: FormErrorsProps) {
  if (!errors || errors.length === 0) return null;

  return (
    <Alert variant="destructive">
      {errors.length === 1 ? (
        <Paragraph margin="none">{errors[0]}</Paragraph>
      ) : (
        <UnorderedList>
          {errors.map((error, index) => (
            <li key={index}>{error}</li>
          ))}
        </UnorderedList>
      )}
    </Alert>
  );
}
