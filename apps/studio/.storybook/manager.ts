import { addons } from "storybook/manager-api";
import { create } from "storybook/theming";

import { DEFAULT_PROJECT_NAME } from "./whitelabel.ts";

// main.ts の managerHead が埋め込んだ値。manager は preview と別バンドルなので
// `env` が届かず、window 経由で受け取る。
declare global {
  interface Window {
    __OHMYCMS_PROJECT_NAME__?: string;
    __OHMYCMS_PROJECT_LOGO_URL__?: string;
  }
}

const name = window.__OHMYCMS_PROJECT_NAME__ || DEFAULT_PROJECT_NAME;
const logoUrl = window.__OHMYCMS_PROJECT_LOGO_URL__ || "";

addons.setConfig({
  // ホワイトラベル: Storybook のロゴ・リンクを差し替える。
  // brandUrl を空にしているのは、外部サイト(storybook.js.org)への導線を作らないため。
  theme: create({
    base: "light",
    brandTitle: `${name} Storybook`,
    brandUrl: undefined,
    brandImage: logoUrl || undefined,
    brandTarget: "_self",
  }),

  showToolbar: true,
  enableShortcuts: true,
  sidebar: {
    showRoots: true,
  },
});

// ブラウザのタブに出る文字列。Storybook は story を切り替えるたびに
// `<story名> - Storybook` へ書き換えるので、後ろの製品名だけ差し替える。
// (managerHead に <title> を足しても、既定の <title> が先に来るので効かない)
const VENDOR_SUFFIX = /(\s[-⋅]\s)Storybook$/;
const rebrandTitle = () => {
  if (VENDOR_SUFFIX.test(document.title)) {
    document.title = document.title.replace(VENDOR_SUFFIX, `$1${name}`);
  }
};
const titleEl = document.querySelector("title");
if (titleEl) {
  new MutationObserver(rebrandTitle).observe(titleEl, {
    childList: true,
    characterData: true,
    subtree: true,
  });
}
rebrandTitle();
