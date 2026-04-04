import React from "react";
import { useLocation, useNavigate } from "react-router-dom";

import LogoRoundedSquareLight from "@/renderer/assets/logo-rounded-square-light.svg";
import LogoRoundedSquare from "@/renderer/assets/logo-rounded-square.svg";
import { cn } from "@/renderer/lib/utils";

import { Separator } from "./ui/separator";

export function MacTitlebar({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div className={cn("flex w-screen min-h-12 fixed z-10 bg-background draglayer", className)}>
      <div className="flex items-center gap-2 px-4 pl-20 w-full">
        {
          <div className="flex items-center gap-2">
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
            <Separator orientation="vertical" className="mr-2 h-4" />
            <h1 className="text-xs text-muted-foreground">{location.pathname}</h1>
          </div>
        }

        {children}
      </div>
    </div>
  );
}
