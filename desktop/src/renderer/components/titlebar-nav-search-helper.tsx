import { ArrowLeft, ArrowRight, Search } from "lucide-react";
import React, { FormEvent, useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { Button } from "./ui/button";
import { Input } from "./ui/input";

type HistoryState = {
  idx: number;
  length: number;
};

function readHistoryState(): HistoryState {
  const state = window.history.state as { idx?: number } | null;
  const idx = typeof state?.idx === "number" ? state.idx : 0;
  const length = window.history.length ?? 0;
  return { idx, length };
}

export function TitlebarNavSearchHelper() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [historyState, setHistoryState] = useState<HistoryState>(() => readHistoryState());
  const [searchText, setSearchText] = useState(() => searchParams.get("q") ?? "");

  useEffect(() => {
    const handlePopState = () => {
      setHistoryState(readHistoryState());
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  useEffect(() => {
    setHistoryState(readHistoryState());
    setSearchText(searchParams.get("q") ?? "");
  }, [location.key, searchParams]);

  const canGoBack = historyState.idx > 0;
  const canGoForward = historyState.idx < historyState.length - 1;

  const handleSearchSubmit = (event: FormEvent) => {
    event.preventDefault();
    const query = searchText.trim();
    const search = query ? `?q=${encodeURIComponent(query)}` : "";
    navigate({ pathname: "/search", search });
  };

  const handleBack = () => {
    if (canGoBack) {
      navigate(-1);
    }
  };

  const handleForward = () => {
    if (canGoForward) {
      navigate(1);
    }
  };

  const isOnSearchPage = location.pathname === "/search";

  return (
    <div className="flex justify-start pl-1">
      <div className="flex items-center max-w-xl w-full clickable gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleBack}
          disabled={!canGoBack}
          aria-label="Go back"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleForward}
          disabled={!canGoForward}
          aria-label="Go forward"
        >
          <ArrowRight className="h-4 w-4" />
        </Button>

        {!isOnSearchPage && (
          <form onSubmit={handleSearchSubmit}>
            <div className="relative w-full min-w-[360px]">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                type="text"
                placeholder="Search"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                className="h-8 pl-7 text-xs bg-muted/70 focus-visible:ring-1"
              />
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
