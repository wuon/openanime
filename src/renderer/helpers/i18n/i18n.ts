import { use } from "i18next";
import { initReactI18next } from "react-i18next";

import en_US from "./translations/en_US.json";
import pt_BR from "./translations/pt_BR.json";

export async function initI18n() {
  await use(initReactI18next).init({
    fallbackLng: "en-US",
    lng: "en-US",
    resources: {
      "en-US": {
        translation: en_US,
      },
      "pt-BR": {
        translation: pt_BR,
      },
    },
  });
}
