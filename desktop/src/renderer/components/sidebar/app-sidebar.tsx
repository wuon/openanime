import React from "react";

import { Sidebar, SidebarContent } from "@/renderer/components/ui/sidebar";

import { NavMain } from "./nav-main";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" {...props} className="pt-12 bg-sidebar z-0">
      <SidebarContent>
        <NavMain />
      </SidebarContent>
    </Sidebar>
  );
}
