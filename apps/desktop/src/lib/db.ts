import Database from "@tauri-apps/plugin-sql";
import type { ProductDto, TerminalConfig } from "@market/shared";

let db: Database | null = null;

export async function getDb() {
  if (!db) {
    db = await Database.load("sqlite:market_pos.db");
    await migrate(db);
  }
  return db;
}

async function migrate(database: Database) {
  await database.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  await database.execute(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      sku TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      price_cents INTEGER NOT NULL,
      category_id TEXT,
      stock_qty INTEGER NOT NULL DEFAULT 0,
      version INTEGER NOT NULL DEFAULT 1,
      is_active INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    )
  `);

  await database.execute(`
    CREATE TABLE IF NOT EXISTS cart_lines (
      product_id TEXT PRIMARY KEY,
      quantity INTEGER NOT NULL,
      unit_cents INTEGER NOT NULL,
      line_cents INTEGER NOT NULL
    )
  `);

  await database.execute(`
    CREATE TABLE IF NOT EXISTS sales_outbox (
      local_id TEXT PRIMARY KEY,
      sold_at TEXT NOT NULL,
      total_cents INTEGER NOT NULL,
      lines_json TEXT NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      conflict_json TEXT,
      created_at TEXT NOT NULL
    )
  `);
}

export async function getSetting(key: string): Promise<string | null> {
  const database = await getDb();
  const rows = await database.select<{ value: string }[]>(
    "SELECT value FROM settings WHERE key = $1",
    [key],
  );
  return rows[0]?.value ?? null;
}

export async function setSetting(key: string, value: string) {
  const database = await getDb();
  await database.execute(
    "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2",
    [key, value],
  );
}

export async function getTerminalConfig(): Promise<TerminalConfig | null> {
  const apiBaseUrl = await getSetting("apiBaseUrl");
  const apiKey = await getSetting("apiKey");
  const terminalId = await getSetting("terminalId");
  const terminalName = await getSetting("terminalName");
  if (!apiBaseUrl || !apiKey) return null;
  return {
    apiBaseUrl,
    apiKey,
    terminalId: terminalId ?? "",
    terminalName: terminalName ?? "POS",
  };
}

export async function saveTerminalConfig(config: {
  apiBaseUrl: string;
  apiKey: string;
  terminalId?: string;
  terminalName?: string;
}) {
  await setSetting("apiBaseUrl", config.apiBaseUrl);
  await setSetting("apiKey", config.apiKey);
  if (config.terminalId) await setSetting("terminalId", config.terminalId);
  if (config.terminalName) await setSetting("terminalName", config.terminalName);
}

export async function upsertProducts(products: ProductDto[]) {
  const database = await getDb();
  for (const p of products) {
    await database.execute(
      `INSERT INTO products (id, sku, name, description, price_cents, category_id, stock_qty, version, is_active, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT(id) DO UPDATE SET
         sku = $2, name = $3, description = $4, price_cents = $5, category_id = $6,
         stock_qty = $7, version = $8, is_active = $9, updated_at = $10`,
      [
        p.id,
        p.sku,
        p.name,
        p.description,
        p.priceCents,
        p.categoryId,
        p.stockQty,
        p.version,
        p.isActive ? 1 : 0,
        p.updatedAt,
      ],
    );
  }
}

export async function listProducts(): Promise<ProductDto[]> {
  const database = await getDb();
  const rows = await database.select<
    Array<{
      id: string;
      sku: string;
      name: string;
      description: string | null;
      price_cents: number;
      category_id: string | null;
      stock_qty: number;
      version: number;
      is_active: number;
      updated_at: string;
    }>
  >("SELECT * FROM products WHERE is_active = 1 ORDER BY name ASC");

  return rows.map((r) => ({
    id: r.id,
    sku: r.sku,
    name: r.name,
    description: r.description,
    priceCents: r.price_cents,
    categoryId: r.category_id,
    stockQty: r.stock_qty,
    version: r.version,
    isActive: r.is_active === 1,
    updatedAt: r.updated_at,
  }));
}

export interface CartLine {
  productId: string;
  name: string;
  quantity: number;
  unitCents: number;
  lineCents: number;
}

export async function getCart(): Promise<CartLine[]> {
  const database = await getDb();
  const rows = await database.select<
    Array<{
      product_id: string;
      quantity: number;
      unit_cents: number;
      line_cents: number;
      name: string;
    }>
  >(
    `SELECT c.product_id, c.quantity, c.unit_cents, c.line_cents, p.name
     FROM cart_lines c
     JOIN products p ON p.id = c.product_id
     ORDER BY p.name ASC`,
  );

  return rows.map((r) => ({
    productId: r.product_id,
    name: r.name,
    quantity: r.quantity,
    unitCents: r.unit_cents,
    lineCents: r.line_cents,
  }));
}

export async function addToCart(product: ProductDto) {
  const database = await getDb();
  const existing = await database.select<Array<{ quantity: number }>>(
    "SELECT quantity FROM cart_lines WHERE product_id = $1",
    [product.id],
  );

  const nextQty = (existing[0]?.quantity ?? 0) + 1;
  const lineCents = nextQty * product.priceCents;

  await database.execute(
    `INSERT INTO cart_lines (product_id, quantity, unit_cents, line_cents)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT(product_id) DO UPDATE SET
       quantity = $2, unit_cents = $3, line_cents = $4`,
    [product.id, nextQty, product.priceCents, lineCents],
  );
}

export async function clearCart() {
  const database = await getDb();
  await database.execute("DELETE FROM cart_lines");
}

export async function completeSale(localId: string) {
  const database = await getDb();
  const cart = await getCart();
  if (cart.length === 0) return null;

  const totalCents = cart.reduce((sum, line) => sum + line.lineCents, 0);
  const soldAt = new Date().toISOString();
  const lines = cart.map((line) => ({
    productId: line.productId,
    quantity: line.quantity,
    unitCents: line.unitCents,
    lineCents: line.lineCents,
  }));

  await database.execute(
    `INSERT INTO sales_outbox (local_id, sold_at, total_cents, lines_json, sync_status, created_at)
     VALUES ($1, $2, $3, $4, 'pending', $5)`,
    [localId, soldAt, totalCents, JSON.stringify(lines), soldAt],
  );

  for (const line of cart) {
    await database.execute(
      "UPDATE products SET stock_qty = CASE WHEN stock_qty - $1 < 0 THEN 0 ELSE stock_qty - $1 END WHERE id = $2",
      [line.quantity, line.productId],
    );
  }

  await clearCart();
  return { localId, soldAt, totalCents, lines };
}

export async function getPendingSales() {
  const database = await getDb();
  return database.select<
    Array<{
      local_id: string;
      sold_at: string;
      total_cents: number;
      lines_json: string;
      sync_status: string;
    }>
  >("SELECT * FROM sales_outbox WHERE sync_status = 'pending' ORDER BY sold_at ASC");
}

export async function markSaleSynced(localId: string) {
  const database = await getDb();
  await database.execute(
    "UPDATE sales_outbox SET sync_status = 'synced' WHERE local_id = $1",
    [localId],
  );
}

export async function markSaleConflict(localId: string, conflictJson: string) {
  const database = await getDb();
  await database.execute(
    "UPDATE sales_outbox SET sync_status = 'conflict', conflict_json = $2 WHERE local_id = $1",
    [localId, conflictJson],
  );
}

export async function countPendingSales() {
  const database = await getDb();
  const rows = await database.select<Array<{ count: number }>>(
    "SELECT COUNT(*) as count FROM sales_outbox WHERE sync_status = 'pending'",
  );
  return rows[0]?.count ?? 0;
}
