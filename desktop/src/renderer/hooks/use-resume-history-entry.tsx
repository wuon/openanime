import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";

import { DisabledStreamProviderDialog } from "@/renderer/components/disabled-stream-provider-dialog";
import { isHistoryProviderDisabled, type StreamProviderName } from "@/shared/stream-providers";
import type { HistoryEntry } from "@/shared/types";

export function useResumeHistoryEntry() {
  const navigate = useNavigate();
  const [disabledProvider, setDisabledProvider] = useState<StreamProviderName | null>(null);

  const resumeHistoryEntry = useCallback(
    (entry: HistoryEntry) => {
      if (isHistoryProviderDisabled(entry.provider)) {
        setDisabledProvider(entry.provider);
        return;
      }

      navigate("/watch", {
        state: {
          episode: entry.episode,
          providerOverride: entry.provider,
          ...(entry.currentDurationMs > 0 ? { resumeFromMs: entry.currentDurationMs } : {}),
        },
      });
    },
    [navigate]
  );

  const disabledProviderDialog = (
    <DisabledStreamProviderDialog
      provider={disabledProvider}
      open={disabledProvider !== null}
      onOpenChange={(open) => {
        if (!open) {
          setDisabledProvider(null);
        }
      }}
    />
  );

  return { resumeHistoryEntry, disabledProviderDialog };
}
