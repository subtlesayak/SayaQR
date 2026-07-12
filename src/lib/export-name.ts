import { safeFileName } from "./csv";
import type { PayloadFields, QrMode } from "./payloads";

function field(fields: PayloadFields, key: string): string {
  const value = fields[key];
  return typeof value === "string" ? value.trim() : "";
}

function withSuffix(value: string, suffix: string, fallback: string): string {
  const base = safeFileName(value.toLowerCase(), "");
  return base ? safeFileName(base + "-" + suffix, fallback) : fallback;
}

function urlHost(value: string): string {
  if (!value) return "";
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : "https://" + value;
  try {
    const parsed = new URL(withScheme);
    return parsed.hostname.replace(/^www\./i, "") || value;
  } catch {
    return value;
  }
}

export function suggestExportName(mode: QrMode, fields: PayloadFields, fallback = "sayaqr-qr"): string {
  const safeFallback = safeFileName(fallback.toLowerCase(), "sayaqr-qr");

  switch (mode) {
    case "text":
      return withSuffix(field(fields, "text").slice(0, 40) || "text", "qr", safeFallback);
    case "url":
      return withSuffix(urlHost(field(fields, "url")), "qr", safeFallback);
    case "wifi":
      return withSuffix(field(fields, "ssid"), "wifi-qr", safeFallback);
    case "email":
      return withSuffix(field(fields, "email"), "email-qr", safeFallback);
    case "sms":
      return withSuffix(field(fields, "phone"), "sms-qr", safeFallback);
    case "phone":
      return withSuffix(field(fields, "phone"), "phone-qr", safeFallback);
    case "vcard": {
      const name =
        field(fields, "fullName") ||
        [field(fields, "firstName"), field(fields, "lastName")].filter(Boolean).join(" ") ||
        field(fields, "company");
      return withSuffix(name, "contact-qr", safeFallback);
    }
    case "upi":
      return withSuffix(field(fields, "payeeName") || field(fields, "payeeAddress"), "upi-qr", safeFallback);
    case "event":
      return withSuffix(field(fields, "title"), "event-qr", safeFallback);
    case "geo":
      return withSuffix(
        field(fields, "label") || [field(fields, "latitude"), field(fields, "longitude")].filter(Boolean).join("-"),
        "location-qr",
        safeFallback,
      );
    default: {
      const exhaustive: never = mode;
      return exhaustive;
    }
  }
}
