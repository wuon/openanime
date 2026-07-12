import { ExternalLinkIcon } from "lucide-react";
import React, { useCallback, useState } from "react";

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

const NEW_ISSUE_URL = "https://github.com/wuon/openanime/issues/new";

function openExternalUrl(url: string) {
  if (window.urlOpener) {
    void window.urlOpener.openUrl(url);
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

interface SubmitBugDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SubmitBugDialog({ open, onOpenChange }: SubmitBugDialogProps) {
  const [openLogsBusy, setOpenLogsBusy] = useState(false);
  const [openLogsError, setOpenLogsError] = useState<string | null>(null);

  const onOpenLogs = useCallback(async () => {
    setOpenLogsBusy(true);
    setOpenLogsError(null);
    try {
      await window.app.openLogsDirectory();
    } catch (error) {
      setOpenLogsError(error instanceof Error ? error.message : "Could not open log directory.");
    } finally {
      setOpenLogsBusy(false);
    }
  }, []);

  const onContinue = useCallback(() => {
    openExternalUrl(NEW_ISSUE_URL);
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setOpenLogsError(null);
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Before you report a bug</DialogTitle>
          <DialogDescription>
            A clear report helps maintainers reproduce and fix the issue faster. Please include the
            following when you open a GitHub issue.
          </DialogDescription>
        </DialogHeader>

        <ol className="list-decimal space-y-4 pl-5 text-sm">
          <li className="space-y-1">
            <p className="font-medium text-foreground">Write a good description</p>
            <p className="text-muted-foreground">
              What you expected, what happened instead, and the steps to reproduce. Mention your OS
              and app version if you can.
            </p>
          </li>
          <li className="space-y-1">
            <p className="font-medium text-foreground">Add screenshots</p>
            <p className="text-muted-foreground">
              Capture the UI, error message, or unexpected playback state when it helps explain the
              bug.
            </p>
          </li>
          <li className="space-y-1">
            <p className="font-medium text-foreground">Upload logs</p>
            <p className="text-muted-foreground">
              Attach recent log files from the app log folder so we can see stack traces and
              provider errors.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              disabled={openLogsBusy}
              onClick={() => {
                void onOpenLogs();
              }}
            >
              {openLogsBusy ? "Opening…" : "Open logs folder"}
            </Button>
            {openLogsError && (
              <p className="text-sm text-destructive" role="alert">
                {openLogsError}
              </p>
            )}
          </li>
        </ol>

        <DialogFooter className="gap-2 sm:gap-0">
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <Button type="button" onClick={onContinue}>
            Continue to GitHub
            <ExternalLinkIcon className="w-4 h-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
