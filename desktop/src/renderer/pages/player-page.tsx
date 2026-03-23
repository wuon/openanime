import { Button } from "@/renderer/components/ui/button";
import { ArrowLeft } from "lucide-react";
import React from "react";
import { Link, useLocation } from "react-router-dom";

export function PlayerPage() {
  const location = useLocation();
  const state = location.state as { playUrl?: string; title?: string } | null;
  const playUrl = state?.playUrl ?? "";
  const title = state?.title ?? "Episode";

  return (
    <div className="fixed inset-0 top-12 z-50 flex flex-col bg-black">
      <div className="flex items-center gap-2 p-2 bg-black/80 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          asChild
          className="text-white hover:text-white hover:bg-white/20"
        >
          <Link to="/anime">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <span className="text-white font-medium truncate">{title}</span>
      </div>
      <div className="flex-1 flex items-center justify-center min-h-0">
        {playUrl ? (
          <video
            key={playUrl}
            className="max-w-full max-h-full w-full h-full object-contain"
            controls
            autoPlay
            playsInline
            src={playUrl}
          />
        ) : (
          <p className="text-white/70">No stream URL. Go back and select an episode.</p>
        )}
      </div>
    </div>
  );
}
