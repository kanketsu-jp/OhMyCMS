"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type MutableRefObject } from "react";

import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";

type Props = {
  /** 下書きを取る <form> の id。`lib/admin/page-actions.ts` の form と同じ値 */
  formId: string;
};

type DraftValues = Record<string, string[]>;
type HideDraft = (draft: string | null) => void;
type DirtyRef = MutableRefObject<boolean>;

const PENDING_KEY = "ohmycms:draft:pending";
const SECRET_FIELD_PATTERN = /password|secret|token|key/i;
const SAVE_DELAY_MS = 300;

export function FormDraft({ formId }: Props) {
  const t = useT("drafts");
  const rawDraft = useSyncExternalStore(
    () => () => {},
    () => readCurrentDraftText(formId),
    () => null,
  );
  const draft = rawDraft ? readDraftText(rawDraft) : null;
  const [hiddenDraft, setHiddenDraft] = useState<string | null>(null);
  const draftKeyRef = useRef("");
  const dirtyRef = useRef(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    const form = document.getElementById(formId);
    if (!(form instanceof HTMLFormElement)) return;

    const draftKey = `ohmycms:draft:${window.location.pathname}:${formId}`;
    draftKeyRef.current = draftKey;

    let saveTimer: number | null = null;
    const scheduleSave = () => {
      dirtyRef.current = true;
      if (saveTimer !== null) window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => {
        saveTimer = null;
        writeDraft(draftKey, serializeDraft(form));
      }, SAVE_DELAY_MS);
    };

    // 🚨 送信したら**その場で下書きを消し、中身は sessionStorage へ退避**する。
    //
    //    最初「成功したページで消す」形にしていたが**成立しない**。実測（2026-08-15）:
    //    保存の成功は `/admin/content/<collection>?notice=item_saved` へ 303 で着地し、
    //    **その一覧ページに `<FormDraft>` は無い**（0 件）。判定する主体が居ないので、
    //    下書きは永久に残り、次にそのレコードを開くと**保存済みの内容を「復元しますか」と聞く**。
    //
    //    → 消すのは送信時。**失敗して戻ってきたときに書き戻す**（下の resolvePendingDraft）。
    //    こうすると「着地先に部品があるか」に依存しない。
    const markSubmitting = (event: SubmitEvent) => {
      submittingRef.current = true;
      const values = readLocalItem(draftKey);
      if (values !== null) {
        writeSessionItem(PENDING_KEY, JSON.stringify({ key: draftKey, values }));
        removeLocalItem(draftKey);
      }
      window.setTimeout(() => {
        // 送信が止められた（バリデーション等でページが消えなかった）なら元へ戻す。
        if (!event.defaultPrevented) return;
        submittingRef.current = false;
        restorePendingDraft();
      }, 0);
    };

    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current || submittingRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };

    const warnNavigation = (event: MouseEvent) => {
      if (!dirtyRef.current || submittingRef.current) return;
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest("a[href]");
      if (!(link instanceof HTMLAnchorElement) || !shouldConfirmLink(link)) return;
      if (window.confirm(t("leave_confirm"))) return;
      event.preventDefault();
      event.stopPropagation();
    };

    form.addEventListener("input", scheduleSave);
    form.addEventListener("change", scheduleSave);
    form.addEventListener("submit", markSubmitting);
    window.addEventListener("beforeunload", warnBeforeUnload);
    document.addEventListener("click", warnNavigation, true);

    return () => {
      if (saveTimer !== null) window.clearTimeout(saveTimer);
      form.removeEventListener("input", scheduleSave);
      form.removeEventListener("change", scheduleSave);
      form.removeEventListener("submit", markSubmitting);
      window.removeEventListener("beforeunload", warnBeforeUnload);
      document.removeEventListener("click", warnNavigation, true);
    };
  }, [formId, t]);

  if (!rawDraft || !draft || rawDraft === hiddenDraft) return null;

  return (
    // 🚨 罫線を持たない。面（Surface）の**中**に描かれるので、`rounded-* + border` を足すと
    //    面が2段になる（`knowledge/decisions/no-nested-surfaces.md` §2-1・`check-surface-nesting` が検出）。
    //    区別は塗り（`bg-muted`）だけで付ける。`bug-report-composer` の注記欄と同じ作り。
    <div className="col-span-full flex flex-wrap items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm">
      <span className="mr-auto text-muted-foreground">{t("restore_prompt")}</span>
      <Button type="button" variant="outline" size="sm" onClick={() => restoreDraft(formId, draft, rawDraft, setHiddenDraft, dirtyRef)}>
        {t("restore_button")}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => discardDraft(draftKeyRef.current, rawDraft, setHiddenDraft, dirtyRef)}>
        {t("discard_button")}
      </Button>
    </div>
  );
}

function readCurrentDraftText(formId: string): string | null {
  resolvePendingDraft();
  return readLocalItem(`ohmycms:draft:${window.location.pathname}:${formId}`);
}

/** 退避してある下書きを読む。壊れていたら null（例外にしない） */
function readPending(): { key: string; values: string } | null {
  const raw = readSessionItem(PENDING_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as { key?: unknown }).key === "string" &&
      typeof (parsed as { values?: unknown }).values === "string"
    ) {
      return parsed as { key: string; values: string };
    }
  } catch {
    // 壊れた退避は無かったことにする。
  }
  return null;
}

/** 退避を**元の鍵へ**書き戻す。送信が止まった場合と、保存に失敗した場合の両方で使う。 */
function restorePendingDraft() {
  const pending = readPending();
  if (!pending) return;
  try {
    window.localStorage.setItem(pending.key, pending.values);
  } catch {
    // localStorage が使えないだけ。画面は動き続ける。
  }
  removeSessionItem(PENDING_KEY);
}

/**
 * 送信のあと、着地したページで決着をつける。
 *
 * 🚨 **書き戻すのは「元の鍵」へ**。いま開いているページの鍵ではない。
 *    失敗の行き先はいつも元の画面とは限らない（実測: アイテムの保存は失敗の分岐によって
 *    **一覧へ `?error=` で飛ぶ**ことがある）。いまの鍵で判定すると、そのとき入力が消える。
 */
function resolvePendingDraft() {
  const pending = readPending();
  if (!pending) return;

  const searchParams = new URLSearchParams(window.location.search);
  if (searchParams.has("error")) {
    // 失敗した。入力を元の鍵へ戻す（そのレコードを開き直せば復元を聞かれる）。
    restorePendingDraft();
    return;
  }
  // 成功、またはどこか別の場所へ移った。送信時に消してあるので、退避を捨てるだけ。
  removeSessionItem(PENDING_KEY);
}

function readDraftText(raw: string): DraftValues | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const draft: DraftValues = {};
    for (const [name, value] of Object.entries(parsed)) {
      if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) return null;
      draft[name] = value;
    }
    return Object.keys(draft).length > 0 ? draft : null;
  } catch {
    return null;
  }
}

function writeDraft(key: string, draft: DraftValues) {
  try {
    window.localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // localStorage can be unavailable or full. The form must keep working.
  }
}

function serializeDraft(form: HTMLFormElement): DraftValues {
  const allowedNames = draftableNames(form);
  const data = new FormData(form);
  const draft: DraftValues = {};

  for (const [name, value] of data.entries()) {
    if (typeof value !== "string" || !allowedNames.has(name)) continue;
    draft[name] = [...(draft[name] ?? []), value];
  }

  return draft;
}

function draftableNames(form: HTMLFormElement): Set<string> {
  const names = new Set<string>();
  for (const element of Array.from(form.elements)) {
    if (!isDraftableControl(element)) continue;
    names.add(element.name);
  }
  return names;
}

function isDraftableControl(
  element: Element,
): element is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  if (
    !(
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement
    )
  ) {
    return false;
  }

  if (!element.name || element.name.startsWith("__") || element.hasAttribute("data-no-draft")) return false;
  if (SECRET_FIELD_PATTERN.test(element.name) || SECRET_FIELD_PATTERN.test(element.id)) return false;
  if (element instanceof HTMLInputElement && (element.type === "password" || element.type === "file")) return false;
  return true;
}

function restoreDraft(
  formId: string,
  draft: DraftValues,
  rawDraft: string,
  setHiddenDraft: HideDraft,
  dirtyRef: DirtyRef,
) {
  const form = document.getElementById(formId);
  if (!(form instanceof HTMLFormElement)) {
    setHiddenDraft(rawDraft);
    return;
  }

  for (const element of Array.from(form.elements)) {
    if (!isDraftableControl(element)) continue;
    const values = draft[element.name];
    if (!values) continue;
    restoreControlValue(element, values);
  }

  dirtyRef.current = true;
  setHiddenDraft(rawDraft);
}

function restoreControlValue(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  values: string[],
) {
  if (element instanceof HTMLInputElement && (element.type === "checkbox" || element.type === "radio")) {
    setNativeChecked(element, values.includes(element.value));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }

  if (element instanceof HTMLSelectElement && element.multiple) {
    for (const option of Array.from(element.options)) {
      option.selected = values.includes(option.value);
    }
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }

  setNativeValue(element, values[0] ?? "");
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value");
  if (descriptor?.set) descriptor.set.call(element, value);
  else element.value = value;
}

function setNativeChecked(element: HTMLInputElement, checked: boolean) {
  const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "checked");
  if (descriptor?.set) descriptor.set.call(element, checked);
  else element.checked = checked;
}

function discardDraft(
  draftKey: string,
  rawDraft: string,
  setHiddenDraft: HideDraft,
  dirtyRef: DirtyRef,
) {
  removeLocalItem(draftKey);
  dirtyRef.current = false;
  setHiddenDraft(rawDraft);
}

function shouldConfirmLink(link: HTMLAnchorElement): boolean {
  if (link.target === "_blank" || link.hasAttribute("download")) return false;

  let destination: URL;
  try {
    destination = new URL(link.href, window.location.href);
  } catch {
    return false;
  }

  if (destination.origin !== window.location.origin) return false;
  if (destination.href === window.location.href) return false;
  return true;
}

function readLocalItem(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function removeLocalItem(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // localStorage can be unavailable. The form must keep working.
  }
}

function readSessionItem(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSessionItem(key: string, value: string) {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // sessionStorage can be unavailable. The form must keep working.
  }
}

function removeSessionItem(key: string) {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // sessionStorage can be unavailable. The form must keep working.
  }
}
