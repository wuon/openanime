import React from "react";

import { Button } from "@/renderer/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/renderer/components/ui/dialog";
import { STREAM_PROVIDER_LABELS, type StreamProviderName } from "@/shared/stream-providers";

interface DisabledStreamProviderDialogProps {
  provider: StreamProviderName | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DisabledStreamProviderDialog({
  provider,
  open,
  onOpenChange,
}: DisabledStreamProviderDialogProps) {
  const providerLabel = provider ? STREAM_PROVIDER_LABELS[provider] : "This stream provider";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Stream provider unavailable</DialogTitle>
          <DialogDescription>
            {providerLabel} is currently disabled. This entry was watched using that provider, so it
            can&apos;t be resumed right now.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button>OK</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
