import React from "react";
import { useLocation } from "react-router-dom";

import { cn } from "@/renderer/lib/utils";

import { ThemePicker } from "./theme-picker";

export function Titlebar({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  const location = useLocation();

  const isHomePage = location.pathname === "/";

  return (
    <div className={cn("flex w-screen min-h-12 fixed z-10 bg-background draglayer", className)}>
      <div className="flex items-center gap-2 px-4 pl-20 w-full">
        {children}
        {isHomePage && (
          <div className="flex flex-auto justify-end gap-2">
            <ThemePicker className="clickable" isIconFormat />
          </div>
        )}
      </div>
    </div>
  );
}
