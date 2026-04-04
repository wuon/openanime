import React from "react";
import { Outlet } from "react-router-dom";

import { AppFooter } from "@/renderer/components/app-footer";
import { AppSidebar } from "@/renderer/components/sidebar/app-sidebar";
import { Titlebar } from "@/renderer/components/titlebar";
import { SidebarInset, SidebarProvider } from "@/renderer/components/ui/sidebar";

export default function SidebarLayout() {
  return (
    <SidebarProvider open={false}>
      <Titlebar className="border-border border-b"></Titlebar>
      <AppSidebar />
      <SidebarInset className="pt-12 overflow-x-hidden flex flex-col min-h-screen">
        <main className="flex-1">
          <Outlet />
        </main>
        <AppFooter />
      </SidebarInset>
    </SidebarProvider>
  );
}
