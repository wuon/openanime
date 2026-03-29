import React, { useEffect, useState } from "react";

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

/**
 * On startup, if GitHub’s latest release is newer than this build, prompt to open the release page.
 */
export function UpdateAvailableDialog() {
  const [open, setOpen] = useState(false);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [releaseUrl, setReleaseUrl] = useState<string | null>(null);

  useEffect(() => {
    void window.app.dependenciesRequired().then((required) => {
      if (required) return;
      void window.app.checkForUpdate().then((result) => {
        if (result.updateAvailable && result.releaseUrl && result.latestVersion) {
          setLatestVersion(result.latestVersion);
          setCurrentVersion(result.currentVersion);
          setReleaseUrl(result.releaseUrl);
          setOpen(true);
        }
      });
    });
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="[&>button]:hidden">
        <DialogHeader>
          <DialogTitle>Update available</DialogTitle>
          <DialogDescription>
            A newer version is available on GitHub
            {latestVersion ? ` (v${latestVersion})` : ""}.
            {currentVersion ? ` You are on v${currentVersion}.` : ""}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Later</Button>
          </DialogClose>
          <Button
            onClick={() => {
              if (releaseUrl) void window.urlOpener.openUrl(releaseUrl);
              setOpen(false);
            }}
          >
            View release
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
