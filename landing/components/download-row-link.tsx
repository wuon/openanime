"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import {
  MacInstallDialog,
  triggerMacDownload,
} from "@/components/mac-install-dialog";

interface DownloadRowLinkProps {
  platformId: string;
  platformLabel: string;
  format: string;
  architecture: string;
  url: string;
}

export function DownloadRowLink({
  platformId,
  platformLabel,
  format,
  architecture,
  url,
}: DownloadRowLinkProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const label = `Download ${platformLabel} ${format} (${architecture})`;

  if (platformId === "macos") {
    return (
      <>
        <button
          type="button"
          onClick={() => {
            triggerMacDownload(url);
            setDialogOpen(true);
          }}
          className="inline-flex size-4 shrink-0 items-center justify-center text-white/55 transition-colors hover:text-white"
          aria-label={label}
        >
          <Download className="size-4 shrink-0" strokeWidth={1.75} />
        </button>
        <MacInstallDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      </>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex size-4 shrink-0 items-center justify-center text-white/55 transition-colors hover:text-white"
      aria-label={label}
    >
      <Download className="size-4 shrink-0" strokeWidth={1.75} />
    </a>
  );
}
