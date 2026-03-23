import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
} from "@/renderer/components/ui/sidebar";
import { Home, type LucideIcon, PiggyBank, Receipt, Settings, Tv, WalletCards } from "lucide-react";
import React from "react";
import { Link, useLocation } from "react-router-dom";

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
    title: "Anime",
    href: "/anime",
    icon: Tv,
  },
  {
    title: "Accounts",
    href: "/accounts",
    icon: PiggyBank,
  },
  {
    title: "Transactions",
    href: "/transactions",
    icon: Receipt,
  },
  {
    title: "Categories",
    href: "/categories",
    icon: WalletCards,
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
      <SidebarMenuButton key={item.title} asChild isActive={isActive}>
        <Link to={item.href}>
          <item.icon />
          <span>{item.title}</span>
        </Link>
      </SidebarMenuButton>
    );
  };

  return (
    <SidebarGroup>
      <SidebarMenu>{navbarItems.map((item) => renderNavItem(item))}</SidebarMenu>
    </SidebarGroup>
  );
}
