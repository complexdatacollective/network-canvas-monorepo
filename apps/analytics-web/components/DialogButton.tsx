import { type ReactNode } from 'react';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '~/components/ui/dialog';

type DialogButtonProps = {
  buttonLabel: string;
  title: string;
  description: string;
  content: ReactNode;
};

export function DialogButton({
  buttonLabel,
  title,
  description,
  content,
}: DialogButtonProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">{buttonLabel}</Button>
      </DialogTrigger>
      <DialogContent className="max-h-screen overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <DialogDescription>{description}</DialogDescription>
        <div className="break-all rounded-sm bg-secondary p-2">
          <code>{content}</code>
        </div>
      </DialogContent>
    </Dialog>
  );
}
