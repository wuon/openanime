import { Home, type LucideIcon, Search, Settings } from "lucide-react";
import React from "react";
import { Link, useLocation } from "react-router-dom";

import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/renderer/components/ui/sidebar";

type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
};

const navbarItems: NavItem[] = [
  {
    title: "Home",
    href: "/",
    icon: Home,
  },
  {
    title: "Search",
    href: "/search",
    icon: Search,
  },
  {
    title: "Settings",
    href: "/settings",
    icon: Settings,
  },
];

export function NavMain() {
  const location = useLocation();

  const renderNavItem = (item: NavItem) => {
    const isActive = location.pathname === item.href;

    return (
      <SidebarMenuItem key={item.href}>
        <SidebarMenuButton asChild isActive={isActive} tooltip={item.title}>
          <Link to={item.href}>
            <item.icon />
            <span>{item.title}</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  return (
    <SidebarGroup>
      <SidebarMenu>{navbarItems.map((item) => renderNavItem(item))}</SidebarMenu>
    </SidebarGroup>
  );
}
