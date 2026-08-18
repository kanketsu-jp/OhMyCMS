"use client";

import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { RotateCcw, Save } from "lucide-react";

import { SHORTCUTS, formatShortcut, type ShortcutName } from "@/components/admin/shortcuts";
import { useIsMac } from "@/components/admin/use-shortcut";
import { PageAction } from "@/components/admin/page-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/i18n/client";
import { useSubmitOnce } from "@/hooks/use-submit-once";

type ShortcutState = Record<ShortcutName, string>;
type PreferenceState = Record<ShortcutName, string | null>;

const shortcutNames = Object.keys(SHORTCUTS) as ShortcutName[];

function emptyState(): PreferenceState {
  return Object.fromEntries(shortcutNames.map((name) => [name, null])) as PreferenceState;
}

function shortcutLabel(
  t: ReturnType<typeof useT>,
  name: ShortcutName,
): string {
  switch (name) {
    case "search":
      return t("shortcut_search");
    case "back":
      return t("shortcut_back");
    case "save":
      return t("shortcut_save_operation");
    case "submit":
      return t("shortcut_submit");
    case "toggleLeftSidebar":
      return t("shortcut_toggleLeftSidebar");
    case "toggleRightSidebar":
      return t("shortcut_toggleRightSidebar");
  }
}

function comboFromEvent(event: KeyboardEvent<HTMLInputElement>, isMac: boolean): string | null {
  const key = event.key.toLowerCase();
  if (["control", "meta", "shift", "alt"].includes(key)) return null;
  const parts: string[] = [];
  if (isMac ? event.metaKey : event.ctrlKey) parts.push("mod");
  if (event.altKey) parts.push("alt");
  if (event.shiftKey) parts.push("shift");
  if (event.key === " ") parts.push("space");
  else parts.push(key);
  return parts.join("+");
}

export function ShortcutSettingsManager() {
  const t = useT("settings");
  const isMac = useIsMac();
  const [saved, setSaved] = useState<PreferenceState>(emptyState);
  const [draft, setDraft] = useState<ShortcutState>(() => ({ ...SHORTCUTS }));
  const [reserved, setReserved] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetch("/api/auth/preferences")
      .then(async (response) => {
        if (!response.ok) throw new Error("load");
        return (await response.json()) as {
          data?: Record<string, unknown>;
          reservedShortcuts?: string[];
        };
      })
      .then((payload) => {
        if (!active) return;
        const preferences = emptyState();
        for (const name of shortcutNames) {
          const value = payload.data?.[`shortcut.${name}`];
          if (typeof value === "string") preferences[name] = value;
        }
        setSaved(preferences);
        setDraft(
          Object.fromEntries(
            shortcutNames.map((name) => [name, preferences[name] ?? SHORTCUTS[name]]),
          ) as ShortcutState,
        );
        setReserved(payload.reservedShortcuts ?? []);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setError(t("shortcut_load_failed"));
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [t]);

  const dirty = useMemo(
    () => shortcutNames.some((name) => (draft[name] === SHORTCUTS[name] ? null : draft[name]) !== saved[name]),
    [draft, saved],
  );

  function change(name: ShortcutName, value: string) {
    setDraft((current) => ({ ...current, [name]: value }));
    setError(null);
  }

  function reset(name: ShortcutName) {
    change(name, SHORTCUTS[name]);
  }

  const save = useSubmitOnce(async () => {
    setError(null);
    for (const name of shortcutNames) {
      const next = draft[name] === SHORTCUTS[name] ? null : draft[name];
      if (next === saved[name]) continue;
      const response = await fetch("/api/auth/preferences", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: `shortcut.${name}`, value: next }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: { code?: string } } | null;
        setError(
          payload?.error?.code === "SHORTCUT_CONFLICT"
            ? t("shortcut_duplicate")
            : t("shortcut_save_failed"),
        );
        return;
      }
    }
    const nextSaved = Object.fromEntries(
      shortcutNames.map((name) => [name, draft[name] === SHORTCUTS[name] ? null : draft[name]]),
    ) as PreferenceState;
    setSaved(nextSaved);
  });

  if (loading) return null;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{t("shortcuts_title")}</h2>
        <p className="text-sm text-muted-foreground">{t("shortcuts_description")}</p>
      </div>
      {error ? <p className="border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive">{error}</p> : null}
      <div className="space-y-5">
        {shortcutNames.map((name) => {
          const conflict = reserved.includes(draft[name].toLowerCase());
          return (
            <div key={name} className="grid gap-2">
              <Label htmlFor={`shortcut-${name}`}>{shortcutLabel(t, name)}</Label>
              <div className="flex items-center gap-2">
                <Input
                  id={`shortcut-${name}`}
                  value={formatShortcut(draft[name], isMac)}
                  aria-invalid={conflict}
                  onChange={(event) => change(name, event.target.value)}
                  onKeyDown={(event) => {
                    const combo = comboFromEvent(event, isMac);
                    if (!combo) return;
                    event.preventDefault();
                    change(name, combo);
                  }}
                />
                <Button type="button" variant="ghost" size="sm" onClick={() => reset(name)} disabled={draft[name] === SHORTCUTS[name]}>
                  <RotateCcw />
                  {t("shortcut_reset")}
                </Button>
              </div>
              {conflict ? <p className="text-sm text-destructive">{t("shortcut_editor_conflict")}</p> : null}
            </div>
          );
        })}
      </div>
      <PageAction
        role="primary"
        label={t("shortcut_save_button")}
        icon={<Save />}
        pending={save.pending}
        disabled={!dirty || save.pending}
        onClick={() => void save.run()}
      />
    </div>
  );
}
