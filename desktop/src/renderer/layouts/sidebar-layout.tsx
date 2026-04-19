import React from "react";
import { Outlet, useLocation } from "react-router-dom";

import { AppFooter } from "@/renderer/components/app-footer";
import { AppSidebar } from "@/renderer/components/sidebar/app-sidebar";
import { Titlebar } from "@/renderer/components/titlebar";
import { SidebarInset, SidebarProvider } from "@/renderer/components/ui/sidebar";
import { cn } from "@/renderer/lib/utils";

export default function SidebarLayout() {
  const { pathname } = useLocation();
  const isWatchPage = pathname === "/watch";

  return (
    <SidebarProvider open={false}>
      <Titlebar className="border-border border-b" />
      <AppSidebar />
      <SidebarInset className="pt-12 overflow-x-hidden flex flex-col h-screen overflow-hidden">
        <main
          className={cn(
            "flex-1 min-h-0",
            isWatchPage ? "flex flex-col overflow-hidden" : "overflow-y-auto"
          )}
        >
          <Outlet />
          {!isWatchPage ? <AppFooter /> : null}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
