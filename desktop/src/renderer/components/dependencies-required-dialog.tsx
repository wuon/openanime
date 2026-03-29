import { Check, Copy } from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";

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

const GIT_INSTALL_PAGE = "https://git-scm.com/install/windows";
const WINGET_INSTALL_CMD = "winget install --id Git.Git -e --source winget";

/**
 * When required system dependencies are missing (e.g. Git Bash on Windows), block the UI with
 * install instructions (aligned with the project README).
 */
export function DependenciesRequiredDialog() {
  const [open, setOpen] = useState(false);
  const [wingetCopied, setWingetCopied] = useState(false);

  const copyWingetCommand = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(WINGET_INSTALL_CMD);
      setWingetCopied(true);
      window.setTimeout(() => setWingetCopied(false), 2000);
    } catch {
      // Clipboard may be unavailable; user can still select the command manually.
    }
  }, []);

  useEffect(() => {
    void window.app.dependenciesRequired().then(setOpen);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg [&>button]:hidden">
        <DialogHeader>
          <DialogTitle>Git is required on Windows</DialogTitle>
          <DialogDescription asChild>
            <p>
              The underlying tool relies on Git Bash, so you will need to install Git for this app
              to work.
            </p>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <p className="mb-2 text-sm font-medium text-foreground">Using winget</p>
          <div className="flex items-stretch gap-0 overflow-hidden rounded-md bg-muted">
            <code className="min-w-0 flex-1 break-all px-3 py-2 font-mono text-sm text-foreground">
              {WINGET_INSTALL_CMD}
            </code>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-auto shrink-0 rounded-none border-l border-border px-3"
              onClick={() => void copyWingetCommand()}
              title={wingetCopied ? "Copied" : "Copy command"}
              aria-label={wingetCopied ? "Copied" : "Copy winget command"}
            >
              {wingetCopied ? <Check className="text-green-600 dark:text-green-500" /> : <Copy />}
            </Button>
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium text-foreground">
            Or install manually from{" "}
            <button
              type="button"
              onClick={() => void window.urlOpener.openUrl(GIT_INSTALL_PAGE)}
              className="underline underline-offset-2 text-foreground"
            >
              {GIT_INSTALL_PAGE}
            </button>
            . <br />
          </p>
        </div>

        <DialogFooter className="sm:justify-start">
          <DialogClose asChild>
            <Button type="button">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
