import { DependenciesRequiredDialog } from "@/renderer/components/dependencies-required-dialog";
import { initI18n } from "@/renderer/helpers/i18n/i18n";
import { updateAppLanguage } from "@/renderer/helpers/i18n/language-helpers";
import { syncThemeWithLocal } from "@/renderer/helpers/theme/theme-helper";
import BaseLayout from "@/renderer/layouts/base-layout";
import { AnimeDetailsPage } from "@/renderer/pages/anime-details-page";
import { AnimeSearchPage } from "@/renderer/pages/anime-search-page";
import { PlayerPage } from "@/renderer/pages/player-page";
import { WatchPage } from "@/renderer/pages/watch-page";
import { WelcomePage } from "@/renderer/pages/welcome-page";
import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { useTranslation } from "react-i18next";
import { HashRouter, Route, Routes } from "react-router-dom";

export default function App() {
  const { i18n } = useTranslation();

  useEffect(() => {
    void syncThemeWithLocal();
    void updateAppLanguage(i18n);
  }, []);

  return (
    <HashRouter>
      <DependenciesRequiredDialog />
      <Routes>
        <Route element={<BaseLayout />}>
          <Route path="/" element={<WelcomePage />} />
          <Route path="/anime/:id" element={<AnimeDetailsPage />} />
          <Route path="/anime" element={<AnimeSearchPage />} />
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
