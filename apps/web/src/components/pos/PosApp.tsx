"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuid } from "uuid";
import type { ProductDto, StoreSettingsDto } from "@market/shared";
import { SYNC_INTERVAL_MS, discountedUnitCents, effectivePosPriceCents, formatMoney, hasActiveProductDiscount } from "@market/shared";
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
  listPosCatalogProducts,
  posDb,
  removeFromCart,
  clearStaffSession,
  getStoreSettings,
  repriceCart,
  applyCartDiscount,
  type CartLine,
  type CompletedSale,
  type StaffSession,
} from "@/lib/pos-db";
import { isOnline, pullCatalog, pushPendingSales, runSyncCycle, voidLastSale, receiveStock } from "@/lib/pos-sync";
import { DEFAULT_POS_PERMISSIONS, hasPosPermission, type PosPermission } from "@/lib/permissions";
import { PosSetup } from "./PosSetup";
import { PosStaffLogin } from "./PosStaffLogin";
import { PosReceipt } from "./PosReceipt";
import { PosSyncPanel } from "./PosSyncPanel";
import { PosReceiveStock } from "./PosReceiveStock";
import { PosSupplierReturn } from "./PosSupplierReturn";
import { PosCashPanel } from "./PosCashPanel";
import { PAYMENT_METHODS, type PaymentMethodCode } from "@/lib/cash";

export function PosApp() {
  const [ready, setReady] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [staff, setStaff] = useState<StaffSession | null>(null);
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [catalogProducts, setCatalogProducts] = useState<ProductDto[]>([]);
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
  const [showCash, setShowCash] = useState(false);
  const [cashOpen, setCashOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodCode>("CASH");
  const [posMode, setPosMode] = useState<"sale" | "return" | "owner">("sale");
  const [discountPercent, setDiscountPercent] = useState(0);
  const [discountInput, setDiscountInput] = useState("");
  const [discountError, setDiscountError] = useState("");
  const [discountUpdating, setDiscountUpdating] = useState(false);
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string }>>([]);
  const [search, setSearch] = useState("");
  const [receipt, setReceipt] = useState<CompletedSale | null>(null);
  const [storeSettings, setStoreSettings] = useState<StoreSettingsDto | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const discountQueueRef = useRef<Promise<void>>(Promise.resolve());
  const discountRequestRef = useRef(0);

  function can(permission: PosPermission) {
    if (!staff) return false;
    const perms =
      staff.permissions?.length > 0 ? staff.permissions : [...DEFAULT_POS_PERMISSIONS];
    return hasPosPermission("STAFF", perms, permission);
  }

  useEffect(() => {
    if (!staff) return;
    if (can("pos:sell")) setPosMode("sale");
    else if (can("pos:return")) setPosMode("return");
    else if (can("pos:owner_sale")) setPosMode("owner");
  }, [staff?.staffId, staff?.permissions?.join(",")]);

  async function switchMode(next: "sale" | "return" | "owner") {
    discountRequestRef.current++;
    await discountQueueRef.current.catch(() => undefined);
    setPosMode(next);
    setDiscountPercent(0);
    setDiscountInput("");
    setDiscountError("");
    setDiscountUpdating(false);
    await repriceCart(next, 0);
    setCart(await getCart());
  }

  const maxDiscountPercent = storeSettings?.maxDiscountPercent ?? 0;
  const canDiscount =
    can("pos:discount") && posMode === "sale" && maxDiscountPercent > 0;

  function updateDiscountFromInput(value: string) {
    if (!canDiscount) return;
    setDiscountInput(value);

    const raw = value.trim() === "" ? 0 : Number.parseFloat(value);
    if (Number.isNaN(raw) || raw < 0) {
      setDiscountError("Enter a valid discount percent.");
      return;
    }

    const capped = Math.min(Math.round(raw * 100) / 100, maxDiscountPercent);
    if (raw > maxDiscountPercent) {
      setDiscountError(`Maximum discount is ${maxDiscountPercent}%. Applied at the maximum.`);
    } else {
      setDiscountError("");
    }

    setDiscountPercent(capped);
    const requestId = ++discountRequestRef.current;
    setDiscountUpdating(true);

    discountQueueRef.current = discountQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        await applyCartDiscount(capped);
        const nextCart = await getCart();
        if (requestId === discountRequestRef.current) {
          setCart(nextCart);
          setDiscountUpdating(false);
        }
      })
      .catch(() => {
        if (requestId === discountRequestRef.current) {
          setDiscountError("Could not update the cart discount. Try again.");
          setDiscountUpdating(false);
        }
      });
  }

  function findProductByCode(code: string) {
    const normalized = code.trim().toLowerCase();
    if (!normalized) return null;
    return catalogProducts.find((p) => p.sku.toLowerCase() === normalized) ?? null;
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
    setCatalogProducts(await listPosCatalogProducts());
    setCart(await getCart());
    setPendingCount(await countPendingSales());
    setConflictCount(await countConflictSales());
    setStoreSettings(await getStoreSettings());
    if (isOnline()) {
      try {
        const config = await getTerminalConfig();
        if (config) {
          const cashRes = await fetch("/api/pos/cash/session", {
            headers: { "x-terminal-key": config.apiKey },
          });
          if (cashRes.ok) {
            const cashData = (await cashRes.json()) as { session: unknown };
            setCashOpen(Boolean(cashData.session));
          }
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
    if (!q) return catalogProducts;
    return catalogProducts.filter(
      (p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q),
    );
  }, [catalogProducts, search]);

  async function handleAdd(product: ProductDto) {
    const listOrCost =
      posMode === "owner" ? product.costCents : effectivePosPriceCents(product);
    const unitCents =
      posMode === "sale" && discountPercent > 0
        ? discountedUnitCents(effectivePosPriceCents(product), discountPercent)
        : listOrCost;
    await addToCart(product, unitCents);
    setCart(await getCart());
    setSearch("");
    if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
    searchRef.current?.focus();
  }

  async function handleCheckout() {
    if (!staff) return;
    setError("");
    if (posMode === "return" && !can("pos:return")) {
      setError("You do not have permission for customer returns.");
      return;
    }
    if (posMode === "sale" && !can("pos:sell")) {
      setError("You do not have permission to complete sales.");
      return;
    }
    if (posMode === "owner" && !can("pos:owner_sale")) {
      setError("You do not have permission for owner / family sales.");
      return;
    }
    if (posMode === "sale" && discountPercent > 0) {
      if (!can("pos:discount")) {
        setError("You do not have permission to apply discounts.");
        return;
      }
      if (discountPercent > maxDiscountPercent) {
        setError(`Discount exceeds store maximum of ${maxDiscountPercent}%.`);
        return;
      }
    }
    if (!cashOpen) {
      setError("Open the cash drawer before completing sales.");
      setShowCash(true);
      return;
    }
    const method = posMode === "owner" ? "CASH" : paymentMethod;
    const appliedDiscount = posMode === "sale" ? discountPercent : 0;
    const cartSnapshot = await getCart();
    const sale =
      posMode === "return"
        ? await completeReturn(uuid(), staff, method)
        : await completeSale(
            uuid(),
            staff,
            posMode === "owner" ? "OWNER" : "SALE",
            appliedDiscount,
            method,
          );
    if (!sale) return;
    let receiptNumber: string | null = null;
    if (isOnline()) {
      await pushPendingSales();
      const row = await posDb.salesOutbox.get(sale.localId);
      receiptNumber = row?.receiptNumber ?? null;
    }
    setReceipt({
      ...sale,
      kind: posMode === "return" ? "RETURN" : posMode === "owner" ? "OWNER" : "SALE",
      receiptNumber,
      lines: sale.lines.map((line) => ({
        ...line,
        productName: cartSnapshot.find((c) => c.productId === line.productId)?.name ?? "Item",
      })),
    });
    setDiscountPercent(0);
    setDiscountInput("");
    setMessage(
      posMode === "return"
        ? "Customer return recorded."
        : posMode === "owner"
          ? "Owner / family sale recorded at cost."
          : appliedDiscount > 0
            ? `Sale recorded with ${appliedDiscount}% discount.`
            : "",
    );
    await refresh();
    if (isOnline()) {
      await pushPendingSales();
      await pullCatalog();
      await refresh();
    }
  }

  async function handleVoid() {
    if (!staff || !can("pos:void")) {
      setError("You do not have permission to void sales.");
      return;
    }
    setError("");
    try {
      await voidLastSale(staff.staffId);
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
  const subtotalCents =
    posMode === "sale"
      ? cart.reduce((sum, line) => {
          const product = products.find((p) => p.id === line.productId);
          const unitCents = product ? effectivePosPriceCents(product) : line.unitCents;
          return sum + line.quantity * unitCents;
        }, 0)
      : totalCents;
  const discountAmountCents =
    posMode === "sale" ? Math.max(0, subtotalCents - totalCents) : 0;

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
          {conflictCount > 0 && can("pos:view_sync") && (
            <button type="button" className="badge badge-danger pos-badge-btn" onClick={() => setShowSync(true)}>
              {conflictCount} conflict{conflictCount > 1 ? "s" : ""}
            </button>
          )}
          {can("pos:cash_session") && (
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => setShowCash(true)}
            >
              Cash drawer {cashOpen ? "(open)" : "(closed)"}
            </button>
          )}
          {can("pos:receive_stock") && (
            <button className="btn btn-secondary" type="button" onClick={() => setShowReceive(true)}>
              Receive stock
            </button>
          )}
          {can("pos:supplier_return") && (
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => setShowSupplierReturn(true)}
              disabled={suppliers.length === 0}
            >
              Return to supplier
            </button>
          )}
          {can("pos:view_sync") && (
            <button className="btn btn-secondary" type="button" onClick={() => setShowSync(true)}>
              Sync
            </button>
          )}
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
                <div className="pos-price">
                  {posMode === "owner" ? (
                    <>
                      {formatMoney(product.costCents)}
                      <span className="pos-muted" style={{ display: "block", fontSize: "0.7rem" }}>
                        at cost
                      </span>
                    </>
                  ) : hasActiveProductDiscount(product) ? (
                    <>
                      {formatMoney(product.discountPriceCents!)}
                      <span
                        className="pos-muted"
                        style={{
                          display: "block",
                          fontSize: "0.7rem",
                          textDecoration: "line-through",
                        }}
                      >
                        {formatMoney(product.priceCents)}
                      </span>
                      <span className="pos-muted" style={{ display: "block", fontSize: "0.7rem" }}>
                        Promo · {product.discountQtyLeft} left
                      </span>
                    </>
                  ) : (
                    formatMoney(product.priceCents)
                  )}
                </div>
                <div className="pos-stock">Stock: {product.stockQty}</div>
              </button>
            ))}
            {filteredProducts.length === 0 && (
              <p className="pos-muted">No products match your search.</p>
            )}
          </div>
        </section>

        <section className="pos-panel">
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
            {can("pos:sell") && (
              <button
                type="button"
                className={posMode === "sale" ? "btn" : "btn btn-secondary"}
                onClick={() => void switchMode("sale")}
              >
                Sale
              </button>
            )}
            {can("pos:return") && (
              <button
                type="button"
                className={posMode === "return" ? "btn" : "btn btn-secondary"}
                onClick={() => void switchMode("return")}
              >
                Customer return
              </button>
            )}
            {can("pos:owner_sale") && (
              <button
                type="button"
                className={posMode === "owner" ? "btn" : "btn btn-secondary"}
                onClick={() => void switchMode("owner")}
              >
                Owner / family
              </button>
            )}
          </div>
          <h2>Cart</h2>
          {canDiscount && (
            <div className={`pos-discount-row${discountPercent > 0 ? " is-active" : ""}`}>
              <label className="pos-discount-label">
                Cart discount
                <span className="pos-muted"> (percentage, max {maxDiscountPercent}%)</span>
              </label>
              <div className="pos-discount-controls">
                <input
                  type="number"
                  min={0}
                  max={maxDiscountPercent}
                  step={0.5}
                  inputMode="decimal"
                  placeholder="0"
                  value={discountInput}
                  aria-label="Cart discount percentage"
                  onChange={(e) => updateDiscountFromInput(e.target.value)}
                />
                <span className="pos-discount-percent">%</span>
                <span className="pos-muted">Applied automatically · enter 0 to clear</span>
              </div>
              {discountError && <div className="pos-discount-error">{discountError}</div>}
              {discountPercent > 0 && (
                <div className="pos-discount-active">
                  <strong>{discountPercent}% discount applied</strong>
                  {discountUpdating && <span>Updating cart…</span>}
                </div>
              )}
            </div>
          )}
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
                  <strong>{formatMoney(line.lineCents)}</strong>
                </div>
              ))}
              <div className="pos-pricing-summary">
                {posMode === "sale" && discountPercent > 0 && (
                  <>
                    <div className="pos-pricing-row">
                      <span>Subtotal</span>
                      <span>{formatMoney(subtotalCents)}</span>
                    </div>
                    <div className="pos-pricing-row pos-discount-deduction">
                      <span>Discount deducted ({discountPercent}%)</span>
                      <strong>−{formatMoney(discountAmountCents)}</strong>
                    </div>
                  </>
                )}
                <div className="pos-total">
                  <span>
                    {posMode === "return"
                      ? "Refund total"
                      : posMode === "owner"
                        ? "Total at cost"
                        : discountPercent > 0
                          ? "Final total"
                          : "Total"}
                  </span>
                  <span>{formatMoney(totalCents)}</span>
                </div>
              </div>
              {posMode !== "owner" && (
                <div className="pos-payment-methods">
                  <span className="pos-muted">Payment</span>
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    {PAYMENT_METHODS.map((m) => (
                      <button
                        key={m.value}
                        type="button"
                        className={paymentMethod === m.value ? "btn" : "btn btn-secondary"}
                        onClick={() => setPaymentMethod(m.value)}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="pos-actions">
                {(posMode === "sale"
                  ? can("pos:sell")
                  : posMode === "return"
                    ? can("pos:return")
                    : can("pos:owner_sale")) && (
                  <button
                    className="btn pos-complete-sale-btn"
                    type="button"
                    onClick={handleCheckout}
                    disabled={discountUpdating}
                  >
                    {posMode === "return"
                      ? "Complete return"
                      : posMode === "owner"
                        ? "Complete owner / family"
                        : "Complete sale"}
                  </button>
                )}
                <button className="btn pos-clear-cart-btn" type="button" disabled={discountUpdating} onClick={async () => {
                  discountRequestRef.current++;
                  await discountQueueRef.current.catch(() => undefined);
                  await clearCart();
                  setDiscountPercent(0);
                  setDiscountInput("");
                  setDiscountError("");
                  setDiscountUpdating(false);
                  setCart(await getCart());
                }}>
                  Clear cart
                </button>
                {can("pos:void") && (
                  <button className="btn btn-secondary" type="button" onClick={handleVoid}>
                    Void last sale
                  </button>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      {receipt && (
        <PosReceipt
          sale={receipt}
          terminalName={terminalName}
          store={storeSettings}
          onClose={() => setReceipt(null)}
        />
      )}
      {showReceive && staff && can("pos:receive_stock") && (
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
      {showSupplierReturn && staff && can("pos:supplier_return") && (
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
      {showCash && staff && can("pos:cash_session") && (
        <PosCashPanel
          staff={staff}
          onClose={() => setShowCash(false)}
          onChanged={async () => {
            await refresh();
          }}
        />
      )}
      {showSync && can("pos:view_sync") && (
        <PosSyncPanel open={showSync} onClose={() => setShowSync(false)} onChanged={refresh} />
      )}
    </div>
  );
}
