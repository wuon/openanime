import React from "react";
import { useLocation, useNavigate } from "react-router-dom";

import LogoRoundedSquareLight from "@/renderer/assets/logo-rounded-square-light.svg";
import LogoRoundedSquare from "@/renderer/assets/logo-rounded-square.svg";
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
  const navigate = useNavigate();

  const isHomePage = location.pathname === "/";

  return (
    <div className={cn("flex w-screen min-h-12 fixed z-10 bg-background draglayer", className)}>
      <div className="flex items-center gap-2 px-4 pl-20 w-full">
        {!isHomePage && (
          <button
            type="button"
            className="flex items-center gap-2 clickable"
            onClick={() => navigate("/")}
          >
            <img
              className="h-5 w-5 shrink-0 rounded dark:hidden select-none pointer-events-none"
              src={LogoRoundedSquare}
              alt=""
              draggable={false}
            />
            <img
              className="h-5 w-5 shrink-0 rounded hidden dark:block select-none pointer-events-none"
              src={LogoRoundedSquareLight}
              alt=""
              draggable={false}
            />
            <span className="text-xs font-semibold tracking-tight">Openanime</span>
          </button>
        )}
        {children}
        <div className="flex flex-auto justify-end gap-2">
          <ThemePicker className="clickable" isIconFormat />
        </div>
      </div>
    </div>
  );
}
