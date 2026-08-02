"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuid } from "uuid";
import {
  ArrowLeftRight,
  Banknote,
  Check,
  CreditCard,
  History,
  LogOut,
  PackageMinus,
  PackagePlus,
  RefreshCw,
  Settings,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import type { ProductDto, StoreSettingsDto } from "@market/shared";
import { SYNC_INTERVAL_MS, discountedUnitCents, effectivePosPriceCents, formatMoney, hasActiveProductDiscount } from "@market/shared";
import {
  addToCart,
  applyCartDiscount,
  clearCart,
  clearStaffSession,
  completeReturn,
  completeSale,
  countConflictSales,
  countPendingSales,
  decrementCartLine,
  getCart,
  getStaffSession,
  getStoreSettings,
  getTerminalConfig,
  incrementCartLine,
  listPosCatalogProducts,
  listProducts,
  posDb,
  removeFromCart,
  repriceCart,
  setCartLineQuantity,
  type CartLine,
  type CompletedSale,
  type StaffSession,
} from "@/lib/pos-db";
import { isOnline, pullCatalog, pushPendingSales, runSyncCycle } from "@/lib/pos-sync";
import { DEFAULT_POS_PERMISSIONS, hasPosPermission, type PosPermission } from "@/lib/permissions";
import { PosSetup } from "./PosSetup";
import { PosStaffLogin } from "./PosStaffLogin";
import { PosReceipt } from "./PosReceipt";
import { PosSyncPanel } from "./PosSyncPanel";
import { PosHistoryPanel } from "./PosHistoryPanel";
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
  const [showHistory, setShowHistory] = useState(false);
  const [showReceive, setShowReceive] = useState(false);
  const [showSupplierReturn, setShowSupplierReturn] = useState(false);
  const [showCash, setShowCash] = useState(false);
  const [cashOpen, setCashOpen] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [showCashTender, setShowCashTender] = useState(false);
  const [tenderInput, setTenderInput] = useState("");
  const [tenderError, setTenderError] = useState("");
  const tenderInputRef = useRef<HTMLInputElement>(null);
  const [editingQtyId, setEditingQtyId] = useState<string | null>(null);
  const [editingQtyValue, setEditingQtyValue] = useState("");
  const [posMode, setPosMode] = useState<"sale" | "return" | "owner">("sale");
  const [discountPercent, setDiscountPercent] = useState(0);
  const [discountInput, setDiscountInput] = useState("");
  const [discountError, setDiscountError] = useState("");
  const [discountUpdating, setDiscountUpdating] = useState(false);
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string }>>([]);
  const [search, setSearch] = useState("");
  const [receipt, setReceipt] = useState<CompletedSale | null>(null);
  const [receiptIsReprint, setReceiptIsReprint] = useState(false);
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
    setShowCashTender(false);
    setTenderInput("");
    setTenderError("");
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

  /** Supports `SKU*5`, `5*SKU`, `SKU x 5`, `5×SKU`. */
  function parseBarcodeWithQty(raw: string): { code: string; qty: number } {
    const s = raw.trim();
    let m = s.match(/^(\d+)\s*[x×*]\s*(.+)$/i);
    if (m) {
      const qty = Math.max(1, Number.parseInt(m[1], 10) || 1);
      return { qty, code: m[2].trim() };
    }
    m = s.match(/^(.+?)\s*[x×*]\s*(\d+)$/i);
    if (m) {
      const qty = Math.max(1, Number.parseInt(m[2], 10) || 1);
      return { qty, code: m[1].trim() };
    }
    return { qty: 1, code: s };
  }

  async function submitBarcode(raw: string) {
    const { code, qty: parsedQty } = parseBarcodeWithQty(raw);
    if (!code) return;

    const product = findProductByCode(code);
    if (product) {
      const qty = parsedQty > 1 ? parsedQty : 1;
      await handleAdd(product, qty);
      setMessage(qty > 1 ? `Added ${qty}× ${product.name}` : `Added: ${product.name}`);
      setError("");
      return;
    }

    setError(`Product not found: ${code}`);
    setMessage("");
  }

  function handleSearchChange(value: string) {
    setSearch(value);
    if (scanTimerRef.current) clearTimeout(scanTimerRef.current);

    const { code } = parseBarcodeWithQty(value);
    const product = findProductByCode(code);
    if (product && !value.includes("*") && !/[x×]/i.test(value)) {
      // Auto-add only for plain SKU scans (not while typing qty*sku patterns).
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

  async function handleAdd(product: ProductDto, qty = 1) {
    const listOrCost =
      posMode === "owner" ? product.costCents : effectivePosPriceCents(product);
    const unitCents =
      posMode === "sale" && discountPercent > 0
        ? discountedUnitCents(effectivePosPriceCents(product), discountPercent)
        : listOrCost;
    await addToCart(product, unitCents, qty);
    setCart(await getCart());
    setSearch("");
    setEditingQtyId(null);
    if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
    searchRef.current?.focus();
  }

  async function applyLineQty(productId: string, raw: string) {
    const qty = Number.parseInt(raw, 10);
    if (Number.isNaN(qty)) {
      setEditingQtyId(null);
      return;
    }
    await setCartLineQuantity(productId, qty);
    setCart(await getCart());
    setEditingQtyId(null);
    setEditingQtyValue("");
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

    function isTypingTarget(target: EventTarget | null) {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // Escape: cancel / close layers (works even while typing).
      if (e.key === "Escape") {
        e.preventDefault();
        if (receipt) {
          setReceipt(null);
          setReceiptIsReprint(false);
          return;
        }
        if (showCashTender) {
          setShowCashTender(false);
          setTenderInput("");
          setTenderError("");
          return;
        }
        if (showCash) {
          setShowCash(false);
          return;
        }
        if (showReceive) {
          setShowReceive(false);
          return;
        }
        if (showSupplierReturn) {
          setShowSupplierReturn(false);
          return;
        }
        if (showHistory) {
          setShowHistory(false);
          return;
        }
        if (showSync) {
          setShowSync(false);
          return;
        }
        if (editingQtyId) {
          setEditingQtyId(null);
          setEditingQtyValue("");
          return;
        }
        if (search.trim()) {
          setSearch("");
          searchRef.current?.focus();
          return;
        }
        searchRef.current?.focus();
        return;
      }

      // Enter = Next on the post-sale toast (same as the Next button).
      if (e.key === "Enter" && receipt && !receiptIsReprint) {
        const searchHasCode =
          e.target === searchRef.current && (searchRef.current?.value.trim() ?? "") !== "";
        setReceipt(null);
        setReceiptIsReprint(false);
        if (searchHasCode) {
          // Let the search/barcode handler submit the next item.
          return;
        }
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }

      const isFunctionKey = /^F\d{1,2}$/.test(e.key);

      // Don't steal normal keys while typing; F-keys and Esc still work.
      if (isTypingTarget(e.target) && !isFunctionKey) return;
      // Reprint modal still blocks; quick post-sale toast does not (Esc already handled).
      if (
        receiptIsReprint ||
        showCash ||
        showReceive ||
        showSupplierReturn ||
        showHistory ||
        showSync ||
        checkoutBusy ||
        discountUpdating
      ) {
        return;
      }

      const canPay =
        cart.length > 0 &&
        (posMode === "sale"
          ? can("pos:sell")
          : posMode === "return"
            ? can("pos:return")
            : can("pos:owner_sale"));

      if (e.key === "F2") {
        e.preventDefault();
        if (!canPay) return;
        if (showCashTender) confirmCashTender();
        else void beginCheckout();
        return;
      }
      if (e.key === "F3") {
        e.preventDefault();
        if (!canPay || posMode === "owner" || showCashTender) return;
        void completeCheckout("CARD");
        return;
      }
      if (e.key === "F4") {
        e.preventDefault();
        if (!canPay || posMode === "owner" || showCashTender) return;
        void completeCheckout("TRANSFER");
        return;
      }
      if (e.key === "F5") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      if (e.key === "F8") {
        e.preventDefault();
        if (cart.length === 0 || checkoutBusy) return;
        void (async () => {
          discountRequestRef.current++;
          await discountQueueRef.current.catch(() => undefined);
          await clearCart();
          setShowCashTender(false);
          setTenderInput("");
          setTenderError("");
          setDiscountPercent(0);
          setDiscountInput("");
          setDiscountError("");
          setDiscountUpdating(false);
          setCart(await getCart());
        })();
        return;
      }

      // Quantity chips for next item removed — use barcode SKU*N or cart line qty.
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    configured,
    staff,
    showSettings,
    receipt,
    receiptIsReprint,
    showCashTender,
    showCash,
    showReceive,
    showSupplierReturn,
    showHistory,
    showSync,
    editingQtyId,
    search,
    cart,
    tenderInput,
    posMode,
    checkoutBusy,
    discountUpdating,
    staff?.permissions,
  ]);

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

  function checkoutIsValid() {
    if (!staff) return;
    setError("");
    if (posMode === "return" && !can("pos:return")) {
      setError("You do not have permission for customer returns.");
      return false;
    }
    if (posMode === "sale" && !can("pos:sell")) {
      setError("You do not have permission to complete sales.");
      return false;
    }
    if (posMode === "owner" && !can("pos:owner_sale")) {
      setError("You do not have permission for owner / family sales.");
      return false;
    }
    if (posMode === "sale" && discountPercent > 0) {
      if (!can("pos:discount")) {
        setError("You do not have permission to apply discounts.");
        return false;
      }
      if (discountPercent > maxDiscountPercent) {
        setError(`Discount exceeds store maximum of ${maxDiscountPercent}%.`);
        return false;
      }
    }
    if (!cashOpen) {
      setError("Open the cash drawer before completing sales.");
      setShowCash(true);
      return false;
    }
    return true;
  }

  async function beginCheckout() {
    if (!checkoutIsValid()) return;
    // Sale cash: collect tender + show change before completing.
    if (posMode === "sale") {
      setTenderError("");
      setTenderInput("");
      setShowCashTender(true);
      queueMicrotask(() => tenderInputRef.current?.focus());
      return;
    }
    await completeCheckout("CASH");
  }

  async function completeCheckout(
    method: PaymentMethodCode,
    cashTender?: { tenderCents: number; changeCents: number },
  ) {
    if (!staff || checkoutBusy || !checkoutIsValid()) return;
    setCheckoutBusy(true);
    const completedMode = posMode;
    const appliedDiscount = completedMode === "sale" ? discountPercent : 0;
    const cartSnapshot = await getCart();
    try {
      const sale =
        completedMode === "return"
          ? await completeReturn(uuid(), staff, method)
          : await completeSale(
              uuid(),
              staff,
              completedMode === "owner" ? "OWNER" : "SALE",
              appliedDiscount,
              method,
            );
      if (!sale) {
        setCheckoutBusy(false);
        return;
      }

      // Show receipt immediately — don't wait on sync before the next customer.
      setReceipt({
        ...sale,
        kind:
          completedMode === "return"
            ? "RETURN"
            : completedMode === "owner"
              ? "OWNER"
              : "SALE",
        receiptNumber: null,
        tenderCents: cashTender?.tenderCents,
        changeCents: cashTender?.changeCents,
        lines: sale.lines.map((line) => ({
          ...line,
          productName: cartSnapshot.find((c) => c.productId === line.productId)?.name ?? "Item",
        })),
      });
      setReceiptIsReprint(false);
      setShowCashTender(false);
      setTenderInput("");
      setTenderError("");
      setDiscountPercent(0);
      setDiscountInput("");
      setMessage(
        completedMode === "return"
          ? "Customer return recorded."
          : completedMode === "owner"
            ? "Owner / family sale recorded at cost."
            : appliedDiscount > 0
              ? `Sale recorded with ${appliedDiscount}% discount.`
              : "",
      );
      setCheckoutBusy(false);
      queueMicrotask(() => {
        searchRef.current?.focus();
        searchRef.current?.select();
      });

      // Sync + receipt number + catalog refresh in the background.
      void (async () => {
        try {
          await refresh();
          if (isOnline()) {
            await pushPendingSales();
            const row = await posDb.salesOutbox.get(sale.localId);
            const receiptNumber = row?.receiptNumber ?? null;
            if (receiptNumber) {
              setReceipt((prev) =>
                prev && prev.localId === sale.localId ? { ...prev, receiptNumber } : prev,
              );
            }
            await pullCatalog();
            await refresh();
          }
          if (can("pos:sell") && completedMode !== "sale") {
            await switchMode("sale");
          } else if (can("pos:sell")) {
            setPosMode("sale");
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : "Sale saved, but sync failed.");
        }
      })();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not complete checkout.");
      setCheckoutBusy(false);
    }
  }

  function confirmCashTender() {
    const dueCents = cart.reduce((sum, line) => sum + line.lineCents, 0);
    const totalDinars = Math.round(dueCents / 100);
    const raw = tenderInput.trim() === "" ? NaN : Number.parseFloat(tenderInput);
    if (Number.isNaN(raw) || raw < 0) {
      setTenderError("Enter the cash amount received.");
      return;
    }
    const tenderDinars = Math.round(raw);
    if (tenderDinars < totalDinars) {
      setTenderError(
        `Not enough cash. Need ${formatMoney(dueCents)} (short ${formatMoney((totalDinars - tenderDinars) * 100)}).`,
      );
      return;
    }
    const tenderCents = tenderDinars * 100;
    const changeCents = tenderCents - dueCents;
    void completeCheckout("CASH", { tenderCents, changeCents });
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

  const tenderDinarsPreview =
    tenderInput.trim() === "" ? null : Number.parseFloat(tenderInput);
  const tenderCentsPreview =
    tenderDinarsPreview != null && !Number.isNaN(tenderDinarsPreview)
      ? Math.round(tenderDinarsPreview) * 100
      : null;
  const changeCentsPreview =
    tenderCentsPreview != null ? tenderCentsPreview - totalCents : null;

  const tenderSuggestions = (() => {
    const totalDinars = Math.round(totalCents / 100);
    const suggestions = new Set<number>([totalDinars]);
    for (const step of [250, 500, 1000, 5000, 10000, 25000, 50000]) {
      const rounded = Math.ceil(totalDinars / step) * step;
      if (rounded > totalDinars) suggestions.add(rounded);
    }
    return [...suggestions].sort((a, b) => a - b).slice(0, 6);
  })();

  return (
    <div className="pos-shell">
      <header className="pos-topbar">
        <div>
          <strong>{terminalName}</strong>
          <span className="pos-muted"> · {staff.staffName}</span>
        </div>
        <div className="pos-topbar-actions">
          <label className="pos-mode-menu">
            <span>Mode</span>
            <select
              value={posMode}
              disabled={discountUpdating}
              onChange={(e) =>
                void switchMode(e.target.value as "sale" | "return" | "owner")
              }
            >
              {can("pos:sell") && <option value="sale">Sale</option>}
              {can("pos:return") && <option value="return">Customer return</option>}
              {can("pos:owner_sale") && <option value="owner">Owner / family</option>}
            </select>
          </label>
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
              <Wallet className="pos-ico" aria-hidden />
              Cash drawer {cashOpen ? "(open)" : "(closed)"}
            </button>
          )}
          {can("pos:receive_stock") && (
            <button className="btn btn-secondary" type="button" onClick={() => setShowReceive(true)}>
              <PackagePlus className="pos-ico" aria-hidden />
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
              <PackageMinus className="pos-ico" aria-hidden />
              Return to supplier
            </button>
          )}
          {can("pos:view_sync") && (
            <button className="btn btn-secondary" type="button" onClick={() => setShowSync(true)}>
              <RefreshCw className="pos-ico" aria-hidden />
              Sync
            </button>
          )}
          <button className="btn btn-secondary" type="button" onClick={() => setShowHistory(true)}>
            <History className="pos-ico" aria-hidden />
            History
          </button>
          <button
            className="btn btn-secondary btn-icon-only"
            type="button"
            onClick={handleStaffLogout}
            title="Log out"
            aria-label="Log out"
          >
            <LogOut className="pos-ico" aria-hidden />
          </button>
          <button
            className="btn btn-secondary btn-icon-only"
            type="button"
            onClick={() => setShowSettings(true)}
            title="Settings"
            aria-label="Settings"
          >
            <Settings className="pos-ico" aria-hidden />
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
              placeholder="Scan SKU, or SKU*5 / 5*SKU for quantity…"
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

        <section className="pos-panel pos-cart-panel">
          <h2>Cart</h2>
          <p className="pos-shortcuts-hint">
            F2 Cash · F3 Card · F4 Transfer · F5 Search · F8 Clear · Esc Cancel
          </p>
          {canDiscount && (
            <div className={`pos-discount-row${discountPercent > 0 ? " is-active" : ""}`}>
              <div className="pos-discount-controls">
                <label className="pos-discount-label" htmlFor="pos-cart-discount">
                  Discount
                </label>
                <input
                  id="pos-cart-discount"
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
                <span className="pos-muted">Max {maxDiscountPercent}% · 0 clears</span>
                {discountPercent > 0 && (
                  <strong className="pos-discount-active">
                    Applied
                    {discountUpdating && "…"}
                  </strong>
                )}
              </div>
              {discountError && <div className="pos-discount-error">{discountError}</div>}
            </div>
          )}
          {cart.length === 0 ? (
            <p className="pos-muted">Tap products or scan a barcode to add items.</p>
          ) : (
            <>
              <div className="pos-cart-items">
                {cart.map((line) => (
                  <div key={line.productId} className="pos-cart-line">
                    <div className="pos-cart-line-info">
                      <div>{line.name}</div>
                      <div className="pos-cart-qty">
                        <button
                          type="button"
                          className="qty-btn"
                          aria-label="Decrease quantity"
                          onClick={async () => {
                            await decrementCartLine(line.productId);
                            setCart(await getCart());
                          }}
                        >
                          −
                        </button>
                        {editingQtyId === line.productId ? (
                          <input
                            className="pos-qty-input"
                            type="number"
                            min={1}
                            inputMode="numeric"
                            value={editingQtyValue}
                            autoFocus
                            onChange={(e) => setEditingQtyValue(e.target.value)}
                            onBlur={() => void applyLineQty(line.productId, editingQtyValue)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                void applyLineQty(line.productId, editingQtyValue);
                              }
                              if (e.key === "Escape") {
                                setEditingQtyId(null);
                                setEditingQtyValue("");
                              }
                            }}
                          />
                        ) : (
                          <button
                            type="button"
                            className="pos-qty-value"
                            title="Tap to type quantity"
                            onClick={() => {
                              setEditingQtyId(line.productId);
                              setEditingQtyValue(String(line.quantity));
                            }}
                          >
                            {line.quantity}
                          </button>
                        )}
                        <button
                          type="button"
                          className="qty-btn"
                          aria-label="Increase quantity"
                          onClick={async () => {
                            await incrementCartLine(line.productId);
                            setCart(await getCart());
                          }}
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <div className="pos-cart-line-total">
                      <strong>{formatMoney(line.lineCents)}</strong>
                      <button
                        type="button"
                        className="remove-btn"
                        aria-label={`Remove ${line.name} from cart`}
                        title="Remove from cart"
                        onClick={async () => {
                          await removeFromCart(line.productId);
                          setCart(await getCart());
                        }}
                      >
                        <Trash2 className="pos-ico" aria-hidden />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="pos-cart-footer">
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
                <div className="pos-actions">
                  {(posMode === "sale"
                    ? can("pos:sell")
                    : posMode === "return"
                      ? can("pos:return")
                      : can("pos:owner_sale")) && (
                    <>
                      {!showCashTender && (
                        <>
                          <button
                            className="btn pos-complete-sale-btn pos-cash-btn"
                            type="button"
                            onClick={() => void beginCheckout()}
                            disabled={discountUpdating || checkoutBusy}
                          >
                            <Banknote className="pos-ico pos-ico-lg" aria-hidden />
                            {checkoutBusy
                              ? "Processing…"
                              : posMode === "return"
                                ? "CASH REFUND"
                                : posMode === "owner"
                                  ? "COMPLETE (CASH)"
                                  : "CASH"}
                          </button>
                          {posMode !== "owner" && (
                            <div className="pos-alt-payments" role="group" aria-label="Other payment methods">
                              {PAYMENT_METHODS.filter((m) => m.value !== "CASH").map((method) => (
                                <button
                                  key={method.value}
                                  type="button"
                                  className="btn btn-secondary pos-alt-payment-btn"
                                  disabled={discountUpdating || checkoutBusy}
                                  onClick={() => void completeCheckout(method.value)}
                                >
                                  {method.value === "CARD" ? (
                                    <CreditCard className="pos-ico" aria-hidden />
                                  ) : (
                                    <ArrowLeftRight className="pos-ico" aria-hidden />
                                  )}
                                  {method.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </>
                      )}

                      {showCashTender && posMode === "sale" && (
                        <div className="pos-cash-tender" role="group" aria-label="Cash tender">
                          <div className="pos-cash-tender-row">
                            <span>Amount due</span>
                            <strong>{formatMoney(totalCents)}</strong>
                          </div>
                          <label className="pos-cash-tender-label">
                            Cash received (IQD)
                            <input
                              ref={tenderInputRef}
                              type="number"
                              min={0}
                              step={1}
                              inputMode="numeric"
                              value={tenderInput}
                              onChange={(e) => {
                                setTenderInput(e.target.value);
                                setTenderError("");
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  confirmCashTender();
                                }
                              }}
                              placeholder="Enter amount…"
                            />
                          </label>
                          <div className="pos-tender-suggestions">
                            {tenderSuggestions.map((dinars) => (
                              <button
                                key={dinars}
                                type="button"
                                className="btn btn-secondary pos-tender-chip"
                                disabled={checkoutBusy}
                                onClick={() => {
                                  setTenderInput(String(dinars));
                                  setTenderError("");
                                }}
                              >
                                {dinars === Math.round(totalCents / 100)
                                  ? `Exact ${formatMoney(totalCents)}`
                                  : formatMoney(dinars * 100)}
                              </button>
                            ))}
                          </div>
                          <div
                            className={`pos-cash-tender-row pos-change-row ${
                              changeCentsPreview != null && changeCentsPreview < 0
                                ? "pos-change-short"
                                : ""
                            }`}
                          >
                            <span>Change due</span>
                            <strong>
                              {changeCentsPreview == null
                                ? "—"
                                : changeCentsPreview < 0
                                  ? `Short ${formatMoney(-changeCentsPreview)}`
                                  : formatMoney(changeCentsPreview)}
                            </strong>
                          </div>
                          {tenderError && <p className="pos-error">{tenderError}</p>}
                          <div className="pos-tender-actions">
                            <button
                              className="btn pos-complete-sale-btn pos-cash-btn"
                              type="button"
                              disabled={checkoutBusy}
                              onClick={() => confirmCashTender()}
                            >
                              <Check className="pos-ico pos-ico-lg" aria-hidden />
                              {checkoutBusy ? "Processing…" : "Confirm cash"}
                            </button>
                            <button
                              className="btn btn-secondary"
                              type="button"
                              disabled={checkoutBusy}
                              onClick={() => {
                                setShowCashTender(false);
                                setTenderInput("");
                                setTenderError("");
                              }}
                            >
                              <X className="pos-ico" aria-hidden />
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                  <button className="btn pos-clear-cart-btn" type="button" disabled={discountUpdating || checkoutBusy} onClick={async () => {
                    discountRequestRef.current++;
                    await discountQueueRef.current.catch(() => undefined);
                    await clearCart();
                    setShowCashTender(false);
                    setTenderInput("");
                    setTenderError("");
                    setDiscountPercent(0);
                    setDiscountInput("");
                    setDiscountError("");
                    setDiscountUpdating(false);
                    setCart(await getCart());
                  }}>
                    <Trash2 className="pos-ico" aria-hidden />
                    Clear cart
                  </button>
                </div>
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
          reprint={receiptIsReprint}
          onClose={() => {
            setReceipt(null);
            setReceiptIsReprint(false);
          }}
        />
      )}
      <PosHistoryPanel
        open={showHistory}
        timezone={storeSettings?.timezone}
        onClose={() => setShowHistory(false)}
        onReprint={(sale) => {
          setShowHistory(false);
          setReceiptIsReprint(true);
          setReceipt(sale);
        }}
      />
      {showReceive && staff && can("pos:receive_stock") && (
        <PosReceiveStock
          staff={staff}
          products={products}
          suppliers={suppliers}
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
