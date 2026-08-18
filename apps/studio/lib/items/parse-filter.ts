export type FilterCondition = { field: string; operator: string; value: unknown };

function isCondition(value: unknown): value is FilterCondition {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const entries = Object.entries(record);
  if (entries.length !== 1 || typeof entries[0]?.[0] !== "string") return false;
  const expression = entries[0]?.[1];
  if (expression === null || typeof expression !== "object" || Array.isArray(expression)) return false;
  return Object.keys(expression).length === 1;
}

export function parseFilter(value: string | undefined): { conditions: FilterCondition[]; invalid: boolean } {
  if (!value) return { conditions: [], invalid: false };
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { conditions: [], invalid: true };
    const root = parsed as { _and?: unknown };
    if (!Array.isArray(root._and) || root._and.length === 0 || !root._and.every(isCondition)) {
      return { conditions: [], invalid: true };
    }
    const conditions = root._and.map((condition) => {
      const [field, expression] = Object.entries(condition)[0];
      const [operator, conditionValue] = Object.entries(expression as Record<string, unknown>)[0] ?? [];
      return { field, operator, value: conditionValue };
    });
    if (conditions.some((condition) => !condition.operator?.startsWith("_") || typeof condition.value === "object" && !Array.isArray(condition.value))) {
      return { conditions: [], invalid: true };
    }
    return { conditions, invalid: false };
  } catch {
    return { conditions: [], invalid: true };
  }
}
