import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { useTranslation } from "react-i18next";
import { HashRouter, Route, Routes } from "react-router-dom";

import { initI18n } from "@/renderer/helpers/i18n/i18n";
import { updateAppLanguage } from "@/renderer/helpers/i18n/language-helpers";
import { syncThemeWithLocal } from "@/renderer/helpers/theme/theme-helper";
import { ScrollToTop } from "@/renderer/components/scroll-to-top";
import SidebarLayout from "@/renderer/layouts/sidebar-layout";
import { HistoryPage } from "@/renderer/pages/history-page";
import { PlayerPage } from "@/renderer/pages/player-page";
import { SearchPage } from "@/renderer/pages/search-page";
import { SettingsPage } from "@/renderer/pages/settings-page";
import { ShowDetailsPage } from "@/renderer/pages/show-details-page";
import { WatchPage } from "@/renderer/pages/watch-page";
import { WelcomePage } from "@/renderer/pages/welcome-page";

export default function App() {
  const { i18n } = useTranslation();

  useEffect(() => {
    void syncThemeWithLocal();
    void updateAppLanguage(i18n);
  }, []);

  return (
    <HashRouter>
      <ScrollToTop />
      <Routes>
        <Route element={<SidebarLayout />}>
          <Route path="/" element={<WelcomePage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/show/:id" element={<ShowDetailsPage />} />
          <Route path="/watch" element={<WatchPage />} />
          <Route path="/player" element={<PlayerPage />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}

void initI18n();

const root = createRoot(document.getElementById("app"));
root.render(<App />);
