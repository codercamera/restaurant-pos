/** Thai mobile numbers: 0[689]XXXXXXXX (10 digits). Accepts +66 / 66 prefixes, spaces and dashes. Returns the 10-digit local form or null. */
export function normalizeThaiPhone(input: string | null | undefined): string | null {
  let d = String(input ?? "").replace(/[\s\-().]/g, "");
  if (d.startsWith("+66")) d = "0" + d.slice(3);
  else if (d.startsWith("66") && d.length === 11) d = "0" + d.slice(2);
  return /^0[689]\d{8}$/.test(d) ? d : null;
}

/** 0812345678 -> 081-234-5678 */
export function formatPhone(p: string): string {
  return /^\d{10}$/.test(p) ? `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}` : p;
}

/** 081-xxx-5678, for receipts. */
export function maskPhone(p: string): string {
  return /^\d{10}$/.test(p) ? `${p.slice(0, 3)}-xxx-${p.slice(6)}` : p;
}
