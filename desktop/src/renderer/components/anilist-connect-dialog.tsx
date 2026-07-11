import React, { useCallback, useEffect, useState } from "react";

import { Button } from "@/renderer/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/renderer/components/ui/dialog";
import { Textarea } from "@/renderer/components/ui/textarea";

interface AniListConnectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnected?: () => void;
}

export function AniListConnectDialog({
  open,
  onOpenChange,
  onConnected,
}: AniListConnectDialogProps) {
  const [token, setToken] = useState("");
  const [openBusy, setOpenBusy] = useState(false);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setToken("");
      setError(null);
      setOpenBusy(false);
      setSubmitBusy(false);
    }
  }, [open]);

  const onOpenAniList = useCallback(async () => {
    setOpenBusy(true);
    setError(null);
    try {
      await window.anilist.openPinAuthPage();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open AniList.");
    } finally {
      setOpenBusy(false);
    }
  }, []);

  const onSubmit = useCallback(async () => {
    setSubmitBusy(true);
    setError(null);
    try {
      const result = await window.anilist.submitManualToken(token);
      if (result.ok) {
        onOpenChange(false);
        onConnected?.();
      } else {
        const { error: message } = result as { ok: false; error: string };
        setError(message);
      }
    } finally {
      setSubmitBusy(false);
    }
  }, [onConnected, onOpenChange, token]);

  const busy = openBusy || submitBusy;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect AniList</DialogTitle>
          <DialogDescription>
            Follow the steps below to connect your AniList account to Openanime.
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </DialogDescription>
        </DialogHeader>

        <ol className="list-decimal space-y-2 pl-4 text-sm text-muted-foreground">
          <li>Click Open AniList below.</li>
          <Button
            type="button"
            className="w-full"
            disabled={busy}
            onClick={() => {
              void onOpenAniList();
            }}
          >
            {openBusy ? "Opening…" : "Open AniList"}
          </Button>
          <li>Log in to your AniList account if prompted.</li>
          <li>
            On the next page, copy the access token under{" "}
            <span className="text-foreground">
              &ldquo;Copy &amp; Paste the following text into the application to provide account
              access.&rdquo;
            </span>
          </li>
          <li>Paste the token below and click Connect.</li>
          <Textarea
            autoComplete="off"
            spellCheck={false}
            rows={4}
            placeholder="Paste access token"
            value={token}
            disabled={busy}
            className="resize-none font-mono"
            onChange={(e) => {
              setToken(e.target.value);
            }}
          />
        </ol>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy || !token.trim()}
            onClick={() => {
              void onSubmit();
            }}
          >
            {submitBusy ? "Connecting…" : "Connect"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function useAniListConnectDialog(onConnected?: () => void) {
  const [open, setOpen] = useState(false);

  const dialog = (
    <AniListConnectDialog open={open} onOpenChange={setOpen} onConnected={onConnected} />
  );

  const openConnect = useCallback(() => {
    setOpen(true);
  }, []);

  return { dialog, openConnect };
}
