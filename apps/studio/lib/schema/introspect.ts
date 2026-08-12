import { db } from "@/lib/db/knex";
import type { ColumnInfo } from "./models";

type ColumnRow = {
  table_name: string;
  name: string;
  data_type: string;
  is_nullable: "YES" | "NO";
  column_default: string | null;
  max_length: number | null;
  numeric_precision: number | null;
  numeric_scale: number | null;
  is_primary_key: boolean;
  foreign_key_table: string | null;
  foreign_key_column: string | null;
};

const KNEX_TABLES = ["knex_migrations", "knex_migrations_lock"];

function toColumnInfo(row: ColumnRow): ColumnInfo {
  return {
    name: row.name,
    data_type: row.data_type,
    is_nullable: row.is_nullable === "YES",
    column_default: row.column_default,
    max_length: row.max_length,
    numeric_precision: row.numeric_precision,
    numeric_scale: row.numeric_scale,
    is_primary_key: row.is_primary_key,
    foreign_key_table: row.foreign_key_table,
    foreign_key_column: row.foreign_key_column,
  };
}

async function getColumnRows(table?: string): Promise<ColumnRow[]> {
  const tableFilter = table ? "AND c.table_name = ?" : "";
  const bindings = table ? [...KNEX_TABLES, table] : KNEX_TABLES;
  const result = await db.raw<{ rows: ColumnRow[] }>(
    `
      WITH pk AS (
        SELECT
          tc.table_name,
          kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
          AND tc.table_name = kcu.table_name
        WHERE tc.table_schema = 'public'
          AND tc.constraint_type = 'PRIMARY KEY'
      ),
      fk AS (
        SELECT
          tc.table_name,
          kcu.column_name,
          ccu.table_name AS foreign_key_table,
          ccu.column_name AS foreign_key_column
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
          AND tc.table_name = kcu.table_name
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.constraint_schema = tc.constraint_schema
        WHERE tc.table_schema = 'public'
          AND tc.constraint_type = 'FOREIGN KEY'
      )
      SELECT
        c.table_name,
        c.column_name AS name,
        c.data_type,
        c.is_nullable,
        c.column_default,
        c.character_maximum_length AS max_length,
        c.numeric_precision,
        c.numeric_scale,
        (pk.column_name IS NOT NULL) AS is_primary_key,
        fk.foreign_key_table,
        fk.foreign_key_column
      FROM information_schema.columns c
      LEFT JOIN pk
        ON pk.table_name = c.table_name
        AND pk.column_name = c.column_name
      LEFT JOIN fk
        ON fk.table_name = c.table_name
        AND fk.column_name = c.column_name
      WHERE c.table_schema = 'public'
        AND c.table_name NOT IN (?, ?)
        ${tableFilter}
      ORDER BY c.table_name, c.ordinal_position
    `,
    bindings,
  );

  return result.rows;
}

export async function getTables(): Promise<string[]> {
  const result = await db.raw<{ rows: { table_name: string }[] }>(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name NOT IN (?, ?)
      ORDER BY table_name
    `,
    KNEX_TABLES,
  );

  return result.rows.map((row) => row.table_name);
}

export async function getColumns(table: string): Promise<ColumnInfo[]> {
  const rows = await getColumnRows(table);
  return rows.map(toColumnInfo);
}

export async function getSchemaOverview(): Promise<Record<string, ColumnInfo[]>> {
  const rows = await getColumnRows();
  return rows.reduce<Record<string, ColumnInfo[]>>((overview, row) => {
    overview[row.table_name] ??= [];
    overview[row.table_name].push(toColumnInfo(row));
    return overview;
  }, {});
}

