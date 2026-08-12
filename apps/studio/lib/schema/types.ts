import { ApiError } from "./errors";
import type { FieldMeta, FieldSchemaSpec } from "./models";

const DATA_TYPE_TO_FIELD_TYPE: Record<string, string> = {
  "character varying": "string",
  varchar: "string",
  text: "string",
  character: "string",
  char: "string",
  smallint: "integer",
  int2: "integer",
  integer: "integer",
  int4: "integer",
  bigint: "bigInteger",
  int8: "bigInteger",
  numeric: "decimal",
  decimal: "decimal",
  real: "float",
  float4: "float",
  "double precision": "float",
  float8: "float",
  boolean: "boolean",
  bool: "boolean",
  json: "json",
  jsonb: "json",
  uuid: "uuid",
  date: "date",
  "time without time zone": "time",
  "time with time zone": "time",
  time: "time",
  "timestamp without time zone": "dateTime",
  "timestamp with time zone": "dateTime",
  timestamp: "dateTime",
  timestamptz: "dateTime",
};

const FIELD_TYPE_TO_SQL: Record<string, string> = {
  string: "text",
  integer: "integer",
  bigInteger: "bigint",
  decimal: "numeric",
  float: "double precision",
  boolean: "boolean",
  json: "jsonb",
  uuid: "uuid",
  date: "date",
  time: "time",
  dateTime: "timestamp with time zone",
};

export function deriveFieldType(
  dataType: string | null | undefined,
  meta?: Pick<FieldMeta, "special"> | null,
): string {
  const special = meta?.special;
  if (typeof special === "string") {
    const specialTypes = special
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    if (specialTypes.includes("json")) return "json";
    if (specialTypes.includes("uuid")) return "uuid";
  }

  if (!dataType) return "unknown";

  return DATA_TYPE_TO_FIELD_TYPE[dataType.toLowerCase()] ?? "unknown";
}

export function sqlTypeForField(
  type: string,
  schema: FieldSchemaSpec | undefined,
): string {
  if (type === "string" && schema?.max_length) {
    return `varchar(${schema.max_length})`;
  }

  if (type === "decimal") {
    const precision = schema?.numeric_precision;
    const scale = schema?.numeric_scale;
    if (precision && scale !== undefined) {
      return `numeric(${precision}, ${scale})`;
    }
    if (precision) {
      return `numeric(${precision})`;
    }
  }

  const sqlType = FIELD_TYPE_TO_SQL[type];
  if (!sqlType) {
    throw new ApiError(400, "INVALID_FIELD_TYPE", `未対応の型です: ${type}`);
  }

  return sqlType;
}
