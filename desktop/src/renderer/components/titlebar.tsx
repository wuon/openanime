import React, { useEffect, useState } from "react";

import { MacTitlebar } from "./titlebar-mac";
import { WindowsTitlebar } from "./titlebar-windows";
import { getApp } from "@/renderer/lib/app-bridge";

export function Titlebar({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  const [os, setOs] = useState<string | null>(null);

  useEffect(() => {
    void getApp()
      .os()
      .then(setOs)
      .catch(() => setOs(null));
  }, []);

  // Default to mac layout until we know the OS to avoid runtime reliance on `process.platform`
  const isWindows = os === "win32";

  if (isWindows) {
    return <WindowsTitlebar className={className}>{children}</WindowsTitlebar>;
  }

  return <MacTitlebar className={className}>{children}</MacTitlebar>;
}
