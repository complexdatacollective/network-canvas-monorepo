"use client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { Event } from "@/db/types";

export function MetadataDialog({ event }: { event: Event }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">Details</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Event Details</DialogTitle>
        </DialogHeader>
        <DialogDescription>{event.event}</DialogDescription>
        <div className="bg-secondary p-2 rounded-sm">
          {JSON.stringify(event.metadata)}
        </div>
      </DialogContent>
    </Dialog>
  );
}
