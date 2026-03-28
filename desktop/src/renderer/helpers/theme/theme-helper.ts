import { Theme } from "@/shared/types/theme";

const THEME_KEY = "theme";

export interface ThemePreferences {
  system: Theme;
  local: Theme | null;
}

export async function getCurrentTheme(): Promise<ThemePreferences> {
  const currentTheme = await window.theme.current();
  const localTheme = localStorage.getItem(THEME_KEY) as Theme | null;

  return {
    system: currentTheme,
    local: localTheme,
  };
}

export async function setTheme(newTheme: Theme) {
  switch (newTheme) {
    case "dark":
      await window.theme.dark();
      updateDocumentTheme(true);
      break;
    case "light":
      await window.theme.light();
      updateDocumentTheme(false);
      break;
    case "system": {
      const isDarkMode = await window.theme.system();
      updateDocumentTheme(isDarkMode);
      break;
    }
  }

  localStorage.setItem(THEME_KEY, newTheme);
}

export async function toggleTheme() {
  const isDarkMode = await window.theme.toggle();
  const newTheme = isDarkMode ? "dark" : "light";

  updateDocumentTheme(isDarkMode);
  localStorage.setItem(THEME_KEY, newTheme);
}

export async function syncThemeWithLocal() {
  const { local } = await getCurrentTheme();
  if (!local) {
    // Default theme for first-time users.
    await setTheme("dark");
    return;
  }

  await setTheme(local);
}

function updateDocumentTheme(isDarkMode: boolean) {
  if (!isDarkMode) {
    document.documentElement.classList.remove("dark");
  } else {
    document.documentElement.classList.add("dark");
  }
}
