import { AppFooter } from "@/renderer/components/app-footer";
import { AppSidebar } from "@/renderer/components/sidebar/app-sidebar";
import { Titlebar } from "@/renderer/components/titlebar";
import { Separator } from "@/renderer/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/renderer/components/ui/sidebar";
import React from "react";
import { Outlet, useLocation } from "react-router-dom";

export default function SidebarLayout() {
  const location = useLocation();

  return (
    <SidebarProvider>
      <Titlebar className="border-border border-b">
        <div className="flex items-center gap-2">
          <SidebarTrigger className="-ml-1 clickable" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <h1 className="text-xs text-muted-foreground">{location.pathname}</h1>
        </div>
      </Titlebar>
      <AppSidebar />
      <SidebarInset className="pt-12 overflow-x-hidden flex flex-col min-h-screen">
        <main className="pt-4 flex-1">
          <Outlet />
        </main>
        <AppFooter />
      </SidebarInset>
    </SidebarProvider>
  );
}
