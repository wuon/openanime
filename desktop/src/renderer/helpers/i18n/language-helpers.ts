import type { i18n } from "i18next";

const languageLocalStorageKey = "lang";

export async function setAppLanguage(lang: string, i18n: i18n) {
  localStorage.setItem(languageLocalStorageKey, lang);
  await i18n.changeLanguage(lang);
  document.documentElement.lang = lang;
}

export async function updateAppLanguage(i18n: i18n) {
  const localLang = localStorage.getItem(languageLocalStorageKey);
  if (!localLang) {
    return;
  }

  await i18n.changeLanguage(localLang);
  document.documentElement.lang = localLang;
}
