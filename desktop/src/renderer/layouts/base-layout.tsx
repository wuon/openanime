import { AppFooter } from "@/renderer/components/app-footer";
import { Titlebar } from "@/renderer/components/titlebar";
import React from "react";
import { Outlet } from "react-router-dom";

export default function BaseLayout() {
  return (
    <div className="min-h-screen flex flex-col">
      <Titlebar />
      <main className="flex-1 pt-12">
        <Outlet />
      </main>
      <AppFooter />
    </div>
  );
}
