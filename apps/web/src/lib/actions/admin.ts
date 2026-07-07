"use server";

import { revalidatePath } from "next/cache";
import { hash, compare } from "bcryptjs";
import { prisma } from "@/lib/db";
import { ALL_PERMISSIONS } from "@/lib/permissions";
import {
  requireAdminRole,
  requireAdminSession,
  requirePermission,
} from "@/lib/admin-session";

function permissionsFromForm(formData: FormData) {
  return ALL_PERMISSIONS.filter((key) => formData.get(`perm_${key}`) === "on");
}

function validatePin(pin: string) {
  if (!/^\d{6}$/.test(pin)) {
    return "POS PIN must be exactly 6 digits.";
  }
  return null;
}

async function isPinInUse(storeId: string, pin: string, excludeUserId?: string) {
  const staff = await prisma.user.findMany({
    where: {
      storeId,
      role: "STAFF",
      pinHash: { not: null },
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
  });
  for (const user of staff) {
    if (user.pinHash && (await compare(pin, user.pinHash))) {
      return true;
    }
  }
  return false;
}

// ——— Products ———

export async function createProduct(formData: FormData) {
  const session = await requirePermission("products:manage");
  const sku = String(formData.get("sku") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const costDollars = parseFloat(String(formData.get("cost") ?? "0"));
  const priceDollars = parseFloat(String(formData.get("price") ?? "0"));
  const stockQty = parseInt(String(formData.get("stockQty") ?? "0"), 10);
  const categoryId = String(formData.get("categoryId") ?? "").trim() || null;
  const supplierId = String(formData.get("supplierId") ?? "").trim() || null;

  if (!sku || !name || Number.isNaN(costDollars) || costDollars < 0) {
    return { error: "SKU, name, and a valid purchase price are required." };
  }
  if (Number.isNaN(priceDollars) || priceDollars < 0) {
    return { error: "A valid sale price is required." };
  }

  const costCents = Math.round(costDollars * 100);
  const priceCents = Math.round(priceDollars * 100);
  const existing = await prisma.product.findUnique({
    where: { storeId_sku: { storeId: session.user.storeId, sku } },
  });
  if (existing) return { error: `SKU "${sku}" already exists.` };

  if (supplierId) {
    const supplier = await prisma.supplier.findFirst({
      where: { id: supplierId, storeId: session.user.storeId, isActive: true },
    });
    if (!supplier) return { error: "Supplier not found." };
  }

  await prisma.$transaction(async (tx) => {
    const product = await tx.product.create({
      data: {
        sku,
        name,
        description,
        costCents,
        priceCents,
        stockQty: Math.max(0, stockQty),
        categoryId,
        supplierId,
        storeId: session.user.storeId,
      },
    });

    if (stockQty > 0) {
      await tx.stockMovement.create({
        data: {
          productId: product.id,
          storeId: session.user.storeId,
          type: "RECEIVE",
          quantity: stockQty,
          note: "Initial stock on product create",
          userId: session.user.id,
        },
      });
    }
  });

  revalidatePath("/admin/products");
  revalidatePath("/admin");
  revalidatePath("/admin/stock");
  return { success: true };
}

export async function updateProduct(productId: string, formData: FormData) {
  const session = await requirePermission("products:manage");
  const sku = String(formData.get("sku") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const costDollars = parseFloat(String(formData.get("cost") ?? "0"));
  const priceDollars = parseFloat(String(formData.get("price") ?? "0"));
  const categoryId = String(formData.get("categoryId") ?? "").trim() || null;
  const supplierId = String(formData.get("supplierId") ?? "").trim() || null;
  const isActive = formData.get("isActive") === "on";

  if (!sku || !name || Number.isNaN(costDollars) || costDollars < 0) {
    return { error: "SKU, name, and a valid purchase price are required." };
  }
  if (Number.isNaN(priceDollars) || priceDollars < 0) {
    return { error: "A valid sale price is required." };
  }

  const product = await prisma.product.findFirst({
    where: { id: productId, storeId: session.user.storeId },
  });
  if (!product) return { error: "Product not found." };

  if (supplierId) {
    const supplier = await prisma.supplier.findFirst({
      where: { id: supplierId, storeId: session.user.storeId, isActive: true },
    });
    if (!supplier) return { error: "Supplier not found." };
  }

  const duplicate = await prisma.product.findFirst({
    where: { storeId: session.user.storeId, sku, id: { not: productId } },
  });
  if (duplicate) return { error: `SKU "${sku}" is already used by another product.` };

  await prisma.product.update({
    where: { id: productId },
    data: {
      sku,
      name,
      description,
      costCents: Math.round(costDollars * 100),
      priceCents: Math.round(priceDollars * 100),
      categoryId,
      supplierId,
      isActive,
      version: { increment: 1 },
    },
  });

  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${productId}/edit`);
  revalidatePath("/admin");
  return { success: true };
}

export async function toggleProductActiveForm(formData: FormData) {
  const session = await requirePermission("products:manage");
  const productId = String(formData.get("productId") ?? "");
  await toggleProductActive(productId, session.user.storeId);
}

async function toggleProductActive(productId: string, storeId: string) {
  const product = await prisma.product.findFirst({
    where: { id: productId, storeId },
  });
  if (!product) return { error: "Product not found." };

  await prisma.product.update({
    where: { id: productId },
    data: { isActive: !product.isActive, version: { increment: 1 } },
  });

  revalidatePath("/admin/products");
  revalidatePath("/admin");
  return { success: true };
}

export async function deactivateSampleProductsForm() {
  await deactivateSampleProducts();
}

async function deactivateSampleProducts() {
  await requirePermission("products:manage");
  const session = await requireAdminSession();
  const result = await prisma.product.updateMany({
    where: { storeId: session.user.storeId, sku: { startsWith: "SKU-" } },
    data: { isActive: false },
  });

  revalidatePath("/admin/products");
  revalidatePath("/admin");
  return { success: true, count: result.count };
}

// ——— Stock ———

export async function adjustStock(formData: FormData) {
  const session = await requirePermission("stock:manage");
  const productId = String(formData.get("productId") ?? "");
  const type = String(formData.get("type") ?? "") as "RECEIVE" | "ADJUSTMENT";
  const quantity = parseInt(String(formData.get("quantity") ?? "0"), 10);
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!productId || !["RECEIVE", "ADJUSTMENT"].includes(type)) {
    return { error: "Product and movement type are required." };
  }
  if (!quantity || Number.isNaN(quantity)) {
    return { error: "Quantity is required." };
  }

  const product = await prisma.product.findFirst({
    where: { id: productId, storeId: session.user.storeId },
  });
  if (!product) return { error: "Product not found." };

  const delta = type === "RECEIVE" ? Math.abs(quantity) : quantity;
  if (type === "RECEIVE" && delta <= 0) {
    return { error: "Receive quantity must be positive." };
  }
  if (type === "ADJUSTMENT" && delta === 0) {
    return { error: "Adjustment quantity cannot be zero." };
  }

  const newStock = product.stockQty + delta;
  if (newStock < 0) {
    return { error: `Cannot reduce stock below zero (current: ${product.stockQty}).` };
  }

  await prisma.$transaction(async (tx) => {
    await tx.product.update({
      where: { id: productId },
      data: { stockQty: newStock, version: { increment: 1 } },
    });
    await tx.stockMovement.create({
      data: {
        productId,
        storeId: session.user.storeId,
        type,
        quantity: delta,
        note,
        userId: session.user.id,
      },
    });
  });

  revalidatePath("/admin/stock");
  revalidatePath("/admin/products");
  revalidatePath("/admin");
  return { success: true };
}

// ——— POS Staff ———

export async function createStaff(formData: FormData) {
  const session = await requirePermission("staff:manage");
  const name = String(formData.get("name") ?? "").trim();
  const emailRaw = String(formData.get("email") ?? "").trim().toLowerCase();
  const email = emailRaw || null;
  const pin = String(formData.get("pin") ?? "").trim();

  if (!name) return { error: "Name is required." };
  const pinError = validatePin(pin);
  if (pinError) return { error: pinError };

  if (email) {
    const existingEmail = await prisma.user.findUnique({ where: { email } });
    if (existingEmail) return { error: "Email is already in use." };
  }

  if (await isPinInUse(session.user.storeId, pin)) {
    return { error: "This PIN is already assigned to another staff member." };
  }

  const passwordSeed = email ?? `${name}-${Date.now()}`;
  const [passwordHash, pinHash] = await Promise.all([
    hash(`staff-${passwordSeed}`, 10),
    hash(pin, 10),
  ]);

  await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      pinHash,
      role: "STAFF",
      isActive: true,
      storeId: session.user.storeId,
    },
  });

  revalidatePath("/admin/staff");
  return { success: true };
}

export async function updateStaff(userId: string, formData: FormData) {
  const session = await requirePermission("staff:manage");
  const name = String(formData.get("name") ?? "").trim();
  const emailRaw = String(formData.get("email") ?? "").trim().toLowerCase();
  const email = emailRaw || null;
  const pin = String(formData.get("pin") ?? "").trim();
  const isActive = formData.get("isActive") === "on";

  if (!name) return { error: "Name is required." };

  const user = await prisma.user.findFirst({
    where: { id: userId, storeId: session.user.storeId, role: "STAFF" },
  });
  if (!user) return { error: "Staff member not found." };

  if (email) {
    const duplicateEmail = await prisma.user.findFirst({
      where: { email, id: { not: userId } },
    });
    if (duplicateEmail) return { error: "Email is already in use." };
  }

  const data: { name: string; email: string | null; isActive: boolean; pinHash?: string } = {
    name,
    email,
    isActive,
  };

  if (pin) {
    const pinError = validatePin(pin);
    if (pinError) return { error: pinError };
    if (await isPinInUse(session.user.storeId, pin, userId)) {
      return { error: "This PIN is already assigned to another staff member." };
    }
    data.pinHash = await hash(pin, 10);
  } else if (isActive && !user.pinHash) {
    return { error: "Set a 6-digit PIN before activating this staff member." };
  }

  await prisma.user.update({ where: { id: userId }, data });

  revalidatePath("/admin/staff");
  revalidatePath(`/admin/staff/${userId}/edit`);
  return { success: true };
}

export async function toggleStaffActiveForm(formData: FormData) {
  await requirePermission("staff:manage");
  const userId = String(formData.get("userId") ?? "");
  const session = await requireAdminSession();

  const user = await prisma.user.findFirst({
    where: { id: userId, storeId: session.user.storeId, role: "STAFF" },
  });
  if (!user) return;
  if (!user.pinHash && !user.isActive) {
    return;
  }

  await prisma.user.update({
    where: { id: userId },
    data: { isActive: !user.isActive },
  });

  revalidatePath("/admin/staff");
}

// ——— Office users ———

export async function createOfficeUser(formData: FormData) {
  const session = await requirePermission("users:manage");
  const name = String(formData.get("name") ?? "").trim();
  const jobTitle = String(formData.get("jobTitle") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const permissions = permissionsFromForm(formData);

  if (!name || !email || !password) {
    return { error: "Name, email, and password are required." };
  }
  if (password.length < 6) {
    return { error: "Password must be at least 6 characters." };
  }
  if (permissions.length === 0) {
    return { error: "Select at least one privilege." };
  }

  const existingEmail = await prisma.user.findUnique({ where: { email } });
  if (existingEmail) return { error: "Email is already in use." };

  const displayName = jobTitle ? `${name} (${jobTitle})` : name;
  const passwordHash = await hash(password, 10);

  await prisma.user.create({
    data: {
      name: displayName,
      email,
      passwordHash,
      role: "OFFICE",
      permissions: JSON.stringify(permissions),
      isActive: true,
      storeId: session.user.storeId,
    },
  });

  revalidatePath("/admin/users");
  return { success: true };
}

export async function updateOfficeUser(userId: string, formData: FormData) {
  const session = await requirePermission("users:manage");
  const name = String(formData.get("name") ?? "").trim();
  const jobTitle = String(formData.get("jobTitle") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const permissions = permissionsFromForm(formData);
  const isActive = formData.get("isActive") === "on";

  if (!name || !email) return { error: "Name and email are required." };
  if (permissions.length === 0) return { error: "Select at least one privilege." };

  const user = await prisma.user.findFirst({
    where: { id: userId, storeId: session.user.storeId, role: "OFFICE" },
  });
  if (!user) return { error: "User not found." };

  const duplicateEmail = await prisma.user.findFirst({
    where: { email, id: { not: userId } },
  });
  if (duplicateEmail) return { error: "Email is already in use." };

  const displayName = jobTitle ? `${name} (${jobTitle})` : name;
  const data: {
    name: string;
    email: string;
    isActive: boolean;
    permissions: string;
    passwordHash?: string;
  } = {
    name: displayName,
    email,
    isActive,
    permissions: JSON.stringify(permissions),
  };

  if (password) {
    if (password.length < 6) return { error: "Password must be at least 6 characters." };
    data.passwordHash = await hash(password, 10);
  }

  await prisma.user.update({ where: { id: userId }, data });

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}/edit`);
  return { success: true };
}

export async function toggleOfficeUserActiveForm(formData: FormData) {
  await requirePermission("users:manage");
  const userId = String(formData.get("userId") ?? "");
  const session = await requireAdminSession();

  const user = await prisma.user.findFirst({
    where: { id: userId, storeId: session.user.storeId, role: "OFFICE" },
  });
  if (!user) return;

  await prisma.user.update({
    where: { id: userId },
    data: { isActive: !user.isActive },
  });

  revalidatePath("/admin/users");
}
