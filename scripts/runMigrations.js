const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

const MIGRATION_TABLE = "__migrations";

function parseMysqlUrl(dbUrl) {
  const u = new URL(dbUrl);
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 3306,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace("/", ""),
  };
}

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

  const opts = parseMysqlUrl(dbUrl);

  // ✅ Connection واحدة تدعم multiple statements
  const conn = await mysql.createConnection({
    ...opts,
    multipleStatements: true,
  });

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

    if (await alreadyApplied(conn, file)) {
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
    await conn.query(sql);
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
