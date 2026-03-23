import React, { useEffect, useState } from "react";

export function AppFooter() {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const w = window as Window & { app?: { version?: () => Promise<string> } };
    if (typeof w.app?.version === "function") {
      void w.app
        .version()
        .then((v) => {
          if (!cancelled) setVersion(v);
        })
        .catch(() => {
          /* ignore */
        });
    }
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <footer className="w-full mt-auto pb-4">
      <div className="container mx-auto px-4 py-3">
        <p className="text-center text-xs text-muted-foreground">
          made with ❤️ + 🍵
          {version && <> · v{version}</>}
        </p>
      </div>
    </footer>
  );
}
