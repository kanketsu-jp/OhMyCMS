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
  uploaded_on: string;
  width: number | null;
  height: number | null;
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

export function requestPreview(id: string): void {
  previewNonce += 1;
  previewRequest = { id, nonce: previewNonce };
  emitPreview();
}

export function usePreviewRequest(): PreviewRequest | null {
  return useSyncExternalStore(
    subscribePreview,
    getPreviewSnapshot,
    getServerPreviewSnapshot,
  );
}
