import React from "react";
import { useNavigate } from "react-router-dom";

import LogoRoundedSquareLight from "@/renderer/assets/logo-rounded-square-light.svg";
import LogoRoundedSquare from "@/renderer/assets/logo-rounded-square.svg";
import { Button } from "@/renderer/components/ui/button";
import { cn } from "@/renderer/lib/utils";

import { TitlebarNavSearchHelper } from "./titlebar-nav-search-helper";
import { Separator } from "./ui/separator";

export function MacTitlebar({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  const navigate = useNavigate();

  return (
    <div className={cn("flex w-screen min-h-12 fixed z-10 bg-background draglayer", className)}>
      <div className="flex items-center gap-2 px-4 pl-20 w-full">
        <Button
          type="button"
          variant="ghost"
          size="sm"
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
        </Button>

        <Separator orientation="vertical" className="h-4" />

        <TitlebarNavSearchHelper />

        {children}
      </div>
    </div>
  );
}
