export function formatReceiptNumber(prefix: string, seq: number, pad = 5) {
  const p = prefix || "";
  return `${p}${String(seq).padStart(pad, "0")}`;
}

export function previewNextReceiptNumber(prefix: string, nextNumber: number) {
  return formatReceiptNumber(prefix, nextNumber);
}
