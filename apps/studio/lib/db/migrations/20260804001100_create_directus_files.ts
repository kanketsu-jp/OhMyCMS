import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("directus_files", (table) => {
    table.uuid("id").primary();
    table.string("storage").notNullable();
    table.string("filename_disk", 255);
    table.string("filename_download", 255).notNullable();
    table.string("title", 255);
    table.string("type", 255);
    table
      .uuid("folder")
      .references("id")
      .inTable("directus_folders")
      .onDelete("SET NULL");
    table
      .uuid("uploaded_by")
      .references("id")
      .inTable("directus_users")
      .onDelete("SET NULL");
    table.timestamp("uploaded_on").notNullable().defaultTo(knex.fn.now());
    table
      .uuid("modified_by")
      .references("id")
      .inTable("directus_users")
      .onDelete("SET NULL");
    table.timestamp("modified_on").notNullable().defaultTo(knex.fn.now());
    table.string("charset", 50);
    table.bigInteger("filesize");
    table.integer("width");
    table.integer("height");
    table.integer("duration");
    table.string("embed", 200);
    table.text("description");
    table.text("location");
    table.text("tags");
    table.json("metadata");
    table.integer("focal_point_x");
    table.integer("focal_point_y");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("directus_files");
}
