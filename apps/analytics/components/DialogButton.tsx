// DialogButton.tsx
import React, { ReactNode } from "react";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";

interface DialogButtonProps {
  buttonLabel: string;
  title: string;
  description: string;
  content: ReactNode;
}

export function DialogButton({
  buttonLabel,
  title,
  description,
  content,
}: DialogButtonProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button className="border border-white">{buttonLabel}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <DialogDescription>{description}</DialogDescription>
        <div className="bg-secondary p-2 rounded-sm break-all">{content}</div>
      </DialogContent>
    </Dialog>
  );
}
