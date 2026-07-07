import { useEffect, useState } from "react";
import { v4 as uuid } from "uuid";
import type { ProductDto } from "@market/shared";
import { SYNC_INTERVAL_MS } from "@market/shared";
import {
  addToCart,
  clearCart,
  completeSale,
  countPendingSales,
  getCart,
  getTerminalConfig,
  listProducts,
  saveTerminalConfig,
  type CartLine,
} from "./lib/db";
import { isOnline, pullCatalog, pushPendingSales, runSyncCycle } from "./lib/sync";
import { OfflineBanner } from "./components/OfflineBanner";
import { SettingsScreen } from "./components/SettingsScreen";

export default function App() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [online, setOnline] = useState(isOnline());
  const [pendingCount, setPendingCount] = useState(0);
  const [terminalName, setTerminalName] = useState("POS");
  const [message, setMessage] = useState("");
  const [showSettings, setShowSettings] = useState(false);

  async function refresh() {
    const config = await getTerminalConfig();
    setConfigured(Boolean(config));
    if (!config) return;

    setTerminalName(config.terminalName);
    setProducts(await listProducts());
    setCart(await getCart());
    setPendingCount(await countPendingSales());
  }

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    if (!configured) return;

    const sync = async () => {
      if (!isOnline()) return;
      await runSyncCycle();
      await refresh();
    };

    sync();
    const timer = window.setInterval(sync, SYNC_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [configured]);

  async function handleAdd(product: ProductDto) {
    await addToCart(product);
    setCart(await getCart());
  }

  async function handleCheckout() {
    const localId = uuid();
    const sale = await completeSale(localId);
    if (!sale) return;

    setMessage(`Sale saved (${(sale.totalCents / 100).toFixed(2)})`);
    await refresh();

    if (isOnline()) {
      await pushPendingSales();
      await pullCatalog();
      await refresh();
    }
  }

  async function handleClearCart() {
    await clearCart();
    setCart(await getCart());
  }

  if (configured === null) {
    return <div style={{ padding: "2rem" }}>Loading…</div>;
  }

  if (!configured || showSettings) {
    return (
      <SettingsScreen
        onSaved={async (values) => {
          await saveTerminalConfig(values);
          if (isOnline()) {
            await pullCatalog();
          }
          setShowSettings(false);
          await refresh();
        }}
      />
    );
  }

  const totalCents = cart.reduce((sum, line) => sum + line.lineCents, 0);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <strong>{terminalName}</strong>
          <span style={{ marginLeft: "0.75rem", color: "var(--muted)" }}>Market POS</span>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <span className={`badge ${online ? "badge-online" : "badge-offline"}`}>
            {online ? "Online" : "Offline"}
          </span>
          {pendingCount > 0 && (
            <span className="badge badge-pending">{pendingCount} pending sync</span>
          )}
          <button className="btn btn-secondary" onClick={() => setShowSettings(true)}>
            Settings
          </button>
        </div>
      </header>

      {!online && <OfflineBanner pendingCount={pendingCount} />}

      {message && (
        <div style={{ padding: "0.5rem 1rem", background: "#14532d", color: "#bbf7d0" }}>
          {message}
        </div>
      )}

      <div className="pos-layout">
        <section className="panel">
          <h2 style={{ marginTop: 0 }}>Products</h2>
          <div className="product-grid">
            {products.map((product) => (
              <button
                key={product.id}
                className="product-card"
                onClick={() => handleAdd(product)}
              >
                <div style={{ fontWeight: 600 }}>{product.name}</div>
                <div style={{ color: "var(--muted)", fontSize: "0.875rem" }}>{product.sku}</div>
                <div style={{ marginTop: "0.5rem" }}>
                  ${(product.priceCents / 100).toFixed(2)}
                </div>
                <div style={{ color: "var(--muted)", fontSize: "0.75rem" }}>
                  Stock: {product.stockQty}
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="panel">
          <h2 style={{ marginTop: 0 }}>Cart</h2>
          {cart.length === 0 ? (
            <p style={{ color: "var(--muted)" }}>Tap products to add items.</p>
          ) : (
            <>
              {cart.map((line) => (
                <div key={line.productId} className="cart-line">
                  <div>
                    <div>{line.name}</div>
                    <div style={{ color: "var(--muted)", fontSize: "0.875rem" }}>
                      {line.quantity} × ${(line.unitCents / 100).toFixed(2)}
                    </div>
                  </div>
                  <strong>${(line.lineCents / 100).toFixed(2)}</strong>
                </div>
              ))}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginTop: "1rem",
                  fontSize: "1.25rem",
                  fontWeight: 700,
                }}
              >
                <span>Total</span>
                <span>${(totalCents / 100).toFixed(2)}</span>
              </div>
              <div style={{ display: "grid", gap: "0.5rem", marginTop: "1rem" }}>
                <button className="btn" onClick={handleCheckout}>
                  Complete sale
                </button>
                <button className="btn btn-secondary" onClick={handleClearCart}>
                  Clear cart
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
