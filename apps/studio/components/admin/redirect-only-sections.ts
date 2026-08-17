/**
 * **それ自体のページを持たず、転送するだけの区画**。
 *
 * 由来: 司令塔の決定（2026-08-17・案 A）。schema が見つけ、私（header）が実装した分。
 * `/admin/content` は最初のコレクションへ転送する（K3）ので、ここを「上の階層」にすると
 * **無関係なコレクションに着く**（実測: `/admin/content/zz_probe_actions` から
 * `/admin/content/acc_748015_pl` へ着いた）。
 *
 * 🚨 **なぜ 1 本のファイルにしたか。** 使う所が **2 つ**ある（`header-back.tsx` の行き先と、
 * `breadcrumbs.tsx` の押せる/押せないの判定）。片方だけ直すと、
 * **「もどる」と「パンくず」で行き先が食い違う**——実際に 1 度その状態を作った
 * （もどるは `/admin/collections` へ行くのに、パンくずの「コンテンツ」は転送を踏んでいた）。
 *
 * 🚨 **ページを持つ区画を足さないこと。** `/admin/files` のような本物の一覧を入れると、
 * 一覧へ戻れずに根まで飛ぶ（実測で確かめた悪化の形）。
 * 🚨 **転送はサーバ側で起きる**ので、画面からは知りようがない。だから**手で持つ**。
 * 増えたらここに 1 行足す。
 */
export const REDIRECT_ONLY_SECTIONS = ["/admin/content"];

/** その行き先が「転送するだけの区画」か。 */
export function isRedirectOnlySection(href: string): boolean {
  return REDIRECT_ONLY_SECTIONS.includes(href);
}
