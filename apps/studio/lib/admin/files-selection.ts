"use client";

import { useSyncExternalStore } from "react";

// files-selection is the single module-level store shared by the files page and right panel.
export type SelectedFile = {
  id: string;
  filename_download: string;
  title: string | null;
  type: string | null;
  filesize: string | number | null;
  folder: string | null;
  /**
   * 🚨 **フォルダの「名前」。** `folder` は uuid なので**そのままでは画面に出せない**
   *    （決定 `decisions/synthetic-ids-are-not-contacts`）。読む側が引き直さなくて済むよう、
   *    一覧が既に持っている名前をここへ入れる。
   *    🚨 **根に在るファイルは `folder` が null**。そのときは `folder_name` も null。
   *    そこに出す文言は読む側（L2）が決める。
   */
  folder_name: string | null;
  uploaded_on: string;
  /** 更新日時。Directus は created / uploaded / modified を分けている。 */
  modified_on: string | null;
  /** 動画・音声の長さ。無いものは null。 */
  duration: number | null;
  description: string | null;
  width: number | null;
  height: number | null;
  is_public: boolean;
};

type PreviewRequest = {
  id: string;
  nonce: number;
};

const EMPTY_SELECTION: readonly SelectedFile[] = [];
const selectionListeners = new Set<() => void>();
const previewListeners = new Set<() => void>();

let selectedFiles: readonly SelectedFile[] = EMPTY_SELECTION;
let previewRequest: PreviewRequest | null = null;
let previewNonce = 0;
let previewableIds = new Set<string>();

function subscribeSelection(listener: () => void): () => void {
  selectionListeners.add(listener);
  return () => selectionListeners.delete(listener);
}

function subscribePreview(listener: () => void): () => void {
  previewListeners.add(listener);
  return () => previewListeners.delete(listener);
}

function emitSelection(): void {
  for (const listener of selectionListeners) listener();
}

function emitPreview(): void {
  for (const listener of previewListeners) listener();
}

function getSelectionSnapshot(): readonly SelectedFile[] {
  return selectedFiles;
}

function getServerSelectionSnapshot(): readonly SelectedFile[] {
  return EMPTY_SELECTION;
}

function getPreviewSnapshot(): PreviewRequest | null {
  return previewRequest;
}

function getServerPreviewSnapshot(): PreviewRequest | null {
  return null;
}

export function useSelectedFiles(): readonly SelectedFile[] {
  return useSyncExternalStore(
    subscribeSelection,
    getSelectionSnapshot,
    getServerSelectionSnapshot,
  );
}

export function setSelection(files: readonly SelectedFile[]): void {
  selectedFiles = files.length > 0 ? [...files] : EMPTY_SELECTION;
  emitSelection();
}

export function clearSelection(): void {
  if (selectedFiles === EMPTY_SELECTION) return;
  selectedFiles = EMPTY_SELECTION;
  emitSelection();
}

export function setPreviewableIds(ids: readonly string[]): void {
  if (ids.length === previewableIds.size && ids.every((id) => previewableIds.has(id))) return;
  previewableIds = new Set(ids);
}

export function requestPreview(id: string): boolean {
  if (!previewableIds.has(id)) return false;
  previewNonce += 1;
  previewRequest = { id, nonce: previewNonce };
  emitPreview();
  return true;
}

export function usePreviewRequest(): PreviewRequest | null {
  return useSyncExternalStore(
    subscribePreview,
    getPreviewSnapshot,
    getServerPreviewSnapshot,
  );
}
