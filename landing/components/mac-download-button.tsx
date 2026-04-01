"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface MacDownloadButtonProps {
  downloadUrl: string;
  /** When true, we have a direct asset URL - show modal. When false, it's the releases page - just navigate. */
  isDirectDownload: boolean;
}

export function MacDownloadButton({
  downloadUrl,
  isDirectDownload,
}: MacDownloadButtonProps) {
  const [open, setOpen] = useState(false);

  const handleDownload = () => {
    if (isDirectDownload) {
      // Start the download
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = downloadUrl.split("/").pop() ?? "Openanime.zip";
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Show the modal with setup steps
      setOpen(true);
    } else {
      // Fallback: navigate to releases page
      window.open(downloadUrl, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <>
      <Button
        size="lg"
        className="rounded-full gap-2 px-6 h-12 text-base cursor-pointer"
        onClick={handleDownload}
      >
        Download for Mac
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Almost there!</DialogTitle>
            <DialogDescription>
              Since the app isn&apos;t signed by Apple, you need to run one
              command before opening it.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <p className="text-sm font-medium mb-2">
                1. Extract the zip and move Openanime to Applications
              </p>
              <p className="text-sm text-muted-foreground">
                Drag Openanime.app into your Applications folder.
              </p>
            </div>

            <div>
              <p className="text-sm font-medium mb-2">
                2. Run this command in Terminal
              </p>
              <code className="block w-full rounded-md bg-muted px-4 py-3 text-sm font-mono text-foreground break-all">
                xattr -cr /Applications/Openanime.app
              </code>
              <p className="text-xs text-muted-foreground mt-2">
                Copies this command so you can paste it in Terminal
              </p>
            </div>

            <div>
              <p className="text-sm font-medium mb-2">Why is this needed?</p>
              <p className="text-sm text-muted-foreground">
                macOS adds a quarantine flag to apps downloaded outside the App
                Store. This command removes it so the app can run.
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={() => {
                navigator.clipboard.writeText(
                  "xattr -cr /Applications/Openanime.app",
                );
                setOpen(false);
              }}
            >
              Copy command &amp; close
            </Button>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
