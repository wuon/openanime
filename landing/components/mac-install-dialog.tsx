"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const XATTR_COMMAND = "xattr -cr /Applications/Openanime.app";

interface MacInstallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MacInstallDialog({ open, onOpenChange }: MacInstallDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Almost there!</DialogTitle>
          <DialogDescription>
            Since the app isn&apos;t signed by Apple, you need to run one command
            before opening it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <p className="mb-2 text-sm font-medium">
              1. Extract the zip and move Openanime to Applications
            </p>
            <p className="text-sm text-muted-foreground">
              Drag Openanime.app into your Applications folder.
            </p>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">
              2. Run this command in Terminal
            </p>
            <code className="block w-full break-all rounded-md bg-muted px-4 py-3 font-mono text-sm text-foreground">
              {XATTR_COMMAND}
            </code>
            <p className="mt-2 text-xs text-muted-foreground">
              Copies this command so you can paste it in Terminal
            </p>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Why is this needed?</p>
            <p className="text-sm text-muted-foreground">
              macOS adds a quarantine flag to apps downloaded outside the App
              Store. This command removes it so the app can run.
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={() => {
              void navigator.clipboard.writeText(XATTR_COMMAND);
              onOpenChange(false);
            }}
          >
            Copy command &amp; close
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function triggerMacDownload(downloadUrl: string) {
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = downloadUrl.split("/").pop() ?? "Openanime.zip";
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
