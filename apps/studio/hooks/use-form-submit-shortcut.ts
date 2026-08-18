"use client";

import { useShortcut } from "@/components/admin/use-shortcut";

type Options = {
  pending?: boolean;
  disabled?: boolean;
};

export function useFormSubmitShortcut(formId: string, options?: Options): void {
  const pending = options?.pending ?? false;
  const disabled = options?.disabled ?? false;

  useShortcut(
    "save",
    () => {
      if (pending || disabled) return;

      const target = document.getElementById(formId);
      if (!(target instanceof HTMLFormElement)) return;

      if (document.querySelector('[role="dialog"][data-state="open"]')) return;

      const active = document.activeElement;
      const activeForm = active instanceof Element ? active.closest("form") : null;
      if (activeForm && activeForm !== target) return;

      target.requestSubmit();
    },
    { whileTyping: true },
  );
}
