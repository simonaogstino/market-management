"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuid } from "uuid";
import type { ProductDto } from "@market/shared";
import { SYNC_INTERVAL_MS } from "@market/shared";
import {
  addToCart,
  clearCart,
  completeSale,
  completeReturn,
  countConflictSales,
  countPendingSales,
  decrementCartLine,
  getCart,
  getStaffSession,
  getTerminalConfig,
  incrementCartLine,
  listProducts,
  removeFromCart,
  clearStaffSession,
  type CartLine,
  type CompletedSale,
  type StaffSession,
} from "@/lib/pos-db";
import { isOnline, pullCatalog, pushPendingSales, runSyncCycle, voidLastSale, receiveStock } from "@/lib/pos-sync";
import { PosSetup } from "./PosSetup";
import { PosStaffLogin } from "./PosStaffLogin";
import { PosReceipt } from "./PosReceipt";
import { PosSyncPanel } from "./PosSyncPanel";
import { PosReceiveStock } from "./PosReceiveStock";
import { PosSupplierReturn } from "./PosSupplierReturn";

export function PosApp() {
  const [ready, setReady] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [staff, setStaff] = useState<StaffSession | null>(null);
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [online, setOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [conflictCount, setConflictCount] = useState(0);
  const [terminalName, setTerminalName] = useState("POS");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showSync, setShowSync] = useState(false);
  const [showReceive, setShowReceive] = useState(false);
  const [showSupplierReturn, setShowSupplierReturn] = useState(false);
  const [posMode, setPosMode] = useState<"sale" | "return">("sale");
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string }>>([]);
  const [search, setSearch] = useState("");
  const [receipt, setReceipt] = useState<CompletedSale | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function findProductByCode(code: string) {
    const normalized = code.trim().toLowerCase();
    if (!normalized) return null;
    return products.find((p) => p.sku.toLowerCase() === normalized) ?? null;
  }

  async function submitBarcode(raw: string) {
    const code = raw.trim();
    if (!code) return;

    const product = findProductByCode(code);
    if (product) {
      await handleAdd(product);
      setMessage(`Added: ${product.name}`);
      setError("");
      return;
    }

    setError(`Product not found: ${code}`);
    setMessage("");
  }

  function handleSearchChange(value: string) {
    setSearch(value);
    if (scanTimerRef.current) clearTimeout(scanTimerRef.current);

    const product = findProductByCode(value);
    if (product) {
      scanTimerRef.current = setTimeout(() => {
        void submitBarcode(value);
      }, 120);
    }
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter" && e.key !== "Tab") return;
    e.preventDefault();
    if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
    void submitBarcode(e.currentTarget.value);
  }

  async function refresh() {
    const config = await getTerminalConfig();
    setConfigured(Boolean(config));
    if (!config) return;
    setTerminalName(config.terminalName);
    setStaff(await getStaffSession());
    setProducts(await listProducts());
    setCart(await getCart());
    setPendingCount(await countPendingSales());
    setConflictCount(await countConflictSales());
    if (isOnline()) {
      try {
        const config = await getTerminalConfig();
        if (config) {
          const res = await fetch("/api/pos/suppliers", {
            headers: { "x-terminal-key": config.apiKey },
          });
          if (res.ok) {
            const data = (await res.json()) as { suppliers: Array<{ id: string; name: string }> };
            setSuppliers(data.suppliers);
          }
        }
      } catch {
        /* ignore */
      }
    }
  }

  useEffect(() => {
    setOnline(isOnline());
    refresh().finally(() => setReady(true));
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
    if (!configured || !staff || showSettings) return;
    const sync = async () => {
      if (!isOnline()) return;
      await runSyncCycle();
      await refresh();
    };
    sync();
    const timer = window.setInterval(sync, SYNC_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [configured, staff, showSettings]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q),
    );
  }, [products, search]);

  async function handleAdd(product: ProductDto) {
    await addToCart(product);
    setCart(await getCart());
    setSearch("");
    if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
    searchRef.current?.focus();
  }

  async function handleCheckout() {
    if (!staff) return;
    setError("");
    const cartSnapshot = await getCart();
    const sale = posMode === "return"
      ? await completeReturn(uuid(), staff)
      : await completeSale(uuid(), staff);
    if (!sale) return;
    setReceipt({
      ...sale,
      kind: posMode === "return" ? "RETURN" : "SALE",
      lines: sale.lines.map((line) => ({
        ...line,
        productName: cartSnapshot.find((c) => c.productId === line.productId)?.name ?? "Item",
      })),
    });
    setMessage(posMode === "return" ? "Customer return recorded." : "");
    await refresh();
    if (isOnline()) {
      await pushPendingSales();
      await pullCatalog();
      await refresh();
    }
  }

  async function handleVoid() {
    setError("");
    try {
      await voidLastSale();
      setMessage("Last sale voided.");
      await refresh();
      if (isOnline()) await pullCatalog();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not void sale.");
    }
  }

  async function handleStaffLogout() {
    await clearStaffSession();
    setStaff(null);
    await refresh();
  }

  if (!ready) return <div className="pos-loading">Loading…</div>;
  if (!configured || showSettings) {
    return (
      <PosSetup
        onSaved={async () => {
          setShowSettings(false);
          if (isOnline()) await pullCatalog();
          await refresh();
        }}
      />
    );
  }
  if (!staff) {
    return <PosStaffLogin onLoggedIn={refresh} />;
  }

  const totalCents = cart.reduce((sum, line) => sum + line.lineCents, 0);

  return (
    <div className="pos-shell">
      <header className="pos-topbar">
        <div>
          <strong>{terminalName}</strong>
          <span className="pos-muted"> · {staff.staffName}</span>
        </div>
        <div className="pos-topbar-actions">
          <span className={`badge ${online ? "badge-success" : "badge-warning"}`}>
            {online ? "Online" : "Offline"}
          </span>
          {pendingCount > 0 && (
            <span className="badge badge-warning">{pendingCount} pending</span>
          )}
          {conflictCount > 0 && (
            <button type="button" className="badge badge-danger pos-badge-btn" onClick={() => setShowSync(true)}>
              {conflictCount} conflict{conflictCount > 1 ? "s" : ""}
            </button>
          )}
          <button className="btn btn-secondary" type="button" onClick={() => setShowReceive(true)}>
            Receive stock
          </button>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => setShowSupplierReturn(true)}
            disabled={suppliers.length === 0}
          >
            Return to supplier
          </button>
          <button className="btn btn-secondary" type="button" onClick={() => setShowSync(true)}>
            Sync
          </button>
          <button className="btn btn-secondary" type="button" onClick={handleStaffLogout}>
            Log out
          </button>
          <button className="btn btn-secondary" type="button" onClick={() => setShowSettings(true)}>
            Settings
          </button>
        </div>
      </header>

      {!online && (
        <div className="pos-offline-banner">
          Working offline — sales save locally and sync when internet returns.
        </div>
      )}

      {message && <div className="pos-success-banner">{message}</div>}
      {error && <div className="pos-error-banner">{error}</div>}

      <div className="pos-layout">
        <section className="pos-panel">
          <form
            className="pos-search-row"
            onSubmit={(e) => {
              e.preventDefault();
              if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
              void submitBarcode(searchRef.current?.value ?? "");
            }}
          >
            <h2>Products</h2>
            <input
              ref={searchRef}
              className="pos-search"
              placeholder="Scan barcode (SKU) or search by name…"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              autoComplete="off"
            />
          </form>
          <div className="pos-product-grid">
            {filteredProducts.map((product) => (
              <button key={product.id} className="pos-product-card" onClick={() => handleAdd(product)}>
                <div className="pos-product-name">{product.name}</div>
                <div className="pos-muted">{product.sku}</div>
                <div className="pos-price">${(product.priceCents / 100).toFixed(2)}</div>
                <div className="pos-stock">Stock: {product.stockQty}</div>
              </button>
            ))}
            {filteredProducts.length === 0 && (
              <p className="pos-muted">No products match your search.</p>
            )}
          </div>
        </section>

        <section className="pos-panel">
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
            <button
              type="button"
              className={posMode === "sale" ? "btn" : "btn btn-secondary"}
              onClick={() => setPosMode("sale")}
            >
              Sale
            </button>
            <button
              type="button"
              className={posMode === "return" ? "btn" : "btn btn-secondary"}
              onClick={() => setPosMode("return")}
            >
              Customer return
            </button>
          </div>
          <h2>Cart</h2>
          {cart.length === 0 ? (
            <p className="pos-muted">Tap products or scan a barcode to add items.</p>
          ) : (
            <>
              {cart.map((line) => (
                <div key={line.productId} className="pos-cart-line">
                  <div className="pos-cart-line-info">
                    <div>{line.name}</div>
                    <div className="pos-cart-qty">
                      <button type="button" className="qty-btn" onClick={async () => {
                        await decrementCartLine(line.productId);
                        setCart(await getCart());
                      }}>−</button>
                      <span>{line.quantity}</span>
                      <button type="button" className="qty-btn" onClick={async () => {
                        await incrementCartLine(line.productId);
                        setCart(await getCart());
                      }}>+</button>
                      <button type="button" className="remove-btn" onClick={async () => {
                        await removeFromCart(line.productId);
                        setCart(await getCart());
                      }}>Remove</button>
                    </div>
                  </div>
                  <strong>${(line.lineCents / 100).toFixed(2)}</strong>
                </div>
              ))}
              <div className="pos-total">
                <span>{posMode === "return" ? "Refund total" : "Total"}</span>
                <span>${(totalCents / 100).toFixed(2)}</span>
              </div>
              <div className="pos-actions">
                <button className="btn" type="button" onClick={handleCheckout}>
                  {posMode === "return" ? "Complete return" : "Complete sale"}
                </button>
                <button className="btn btn-secondary" type="button" onClick={async () => {
                  await clearCart();
                  setCart(await getCart());
                }}>
                  Clear cart
                </button>
                <button className="btn btn-secondary" type="button" onClick={handleVoid}>
                  Void last sale
                </button>
              </div>
            </>
          )}
        </section>
      </div>

      {receipt && (
        <PosReceipt
          sale={receipt}
          terminalName={terminalName}
          onClose={() => setReceipt(null)}
        />
      )}
      <PosSyncPanel open={showSync} onClose={() => setShowSync(false)} onChanged={refresh} />
      {showReceive && staff && (
        <PosReceiveStock
          staff={staff}
          products={products}
          onClose={() => setShowReceive(false)}
          onSuccess={async (msg) => {
            setMessage(msg);
            setError("");
            await refresh();
          }}
        />
      )}
      {showSupplierReturn && staff && (
        <PosSupplierReturn
          staff={staff}
          products={products}
          suppliers={suppliers}
          onClose={() => setShowSupplierReturn(false)}
          onSuccess={async (msg) => {
            setMessage(msg);
            setError("");
            await refresh();
          }}
        />
      )}
    </div>
  );
}
