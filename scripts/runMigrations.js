const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

const MIGRATION_TABLE = "__migrations";

async function ensureMigrationsTable(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS ${MIGRATION_TABLE} (
      id INT AUTO_INCREMENT PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function alreadyApplied(conn, filename) {
  const [rows] = await conn.query(
    `SELECT filename FROM ${MIGRATION_TABLE} WHERE filename = ? LIMIT 1`,
    [filename]
  );
  return rows.length > 0;
}

async function markApplied(conn, filename) {
  await conn.query(`INSERT INTO ${MIGRATION_TABLE} (filename) VALUES (?)`, [
    filename,
  ]);
}

async function run() {
  const dbUrl = process.env.MYSQL_URL || process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("MYSQL_URL is not set in Railway Variables");

  const conn = await mysql.createConnection(dbUrl);

  // الملفات بالترتيب اللي انت بعته
  const files = [
    "schema.sql",
    "complete_setup.sql",
    "add_user_fields.sql",
    "add_material_to_items.sql",
    "add_item_fields.sql",
    "add_categories.sql",
    "migration_add_material.sql",
  ];

  await ensureMigrationsTable(conn);

  for (const file of files) {
    const filePath = path.join(__dirname, "..", "database", file);
    if (!fs.existsSync(filePath)) {
      console.log(`⏭️  Skip missing file: ${file}`);
      continue;
    }

    const applied = await alreadyApplied(conn, file);
    if (applied) {
      console.log(`✅ Already applied: ${file}`);
      continue;
    }

    const sql = fs.readFileSync(filePath, "utf8").trim();
    if (!sql) {
      console.log(`⏭️  Empty file: ${file}`);
      await markApplied(conn, file);
      continue;
    }

    console.log(`🚀 Applying: ${file}`);
    // mysql2 يسمح بتنفيذ multiple statements لو sql فيه كذا statement
    // لكن لازم نفعّل multipleStatements في الـ connection:
    // أسهل: نفتح connection جديد بالـ option ده:
    const conn2 = await mysql.createConnection({
      uri: dbUrl,
      multipleStatements: true,
    });
    await conn2.query(sql);
    await conn2.end();

    await markApplied(conn, file);
    console.log(`✅ Applied: ${file}`);
  }

  await conn.end();
  console.log("🎉 All migrations done");
}

run().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
