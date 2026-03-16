import React from "react";
import { Outlet } from "react-router-dom";

import { Titlebar } from "@/renderer/components/titlebar";

export default function BaseLayout() {
  return (
    <>
      <Titlebar />
      <main className="min-h-screen pt-12">
        <Outlet />
      </main>
    </>
  );
}
