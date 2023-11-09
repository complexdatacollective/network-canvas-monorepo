// DialogButton.tsx
import React, { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface DialogButtonProps {
  buttonLabel: string;
  children: ReactNode;
  title: string;
  description: string;
  content: ReactNode;
}

export function DialogButton({
  buttonLabel,
  children,
  title,
  description,
  content,
}: DialogButtonProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">{buttonLabel}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <DialogDescription>{description}</DialogDescription>
        <div className="bg-secondary p-2 rounded-sm">{content}</div>
      </DialogContent>
    </Dialog>
  );
}
