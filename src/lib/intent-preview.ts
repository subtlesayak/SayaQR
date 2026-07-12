import type { PayloadFields, QrMode } from "./payloads";

export interface IntentPreview {
  badge: string;
  title: string;
  details: string[];
  warnings: string[];
}

function field(fields: PayloadFields, key: string): string {
  const value = fields[key];
  return typeof value === "string" ? value.trim() : "";
}

function compact(values: Array<string | undefined>): string[] {
  return values.filter((value): value is string => Boolean(value));
}

function parsedUrl(value: string): URL | null {
  if (!value) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : "https://" + value;
  try {
    return new URL(withScheme);
  } catch {
    return null;
  }
}

function urlWarnings(value: string): string[] {
  const warnings: string[] = [];
  const scheme = value.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
  if (scheme === "http") warnings.push("This link uses HTTP instead of encrypted HTTPS.");
  if (scheme && scheme !== "http" && scheme !== "https") {
    warnings.push("This link uses the custom " + scheme + " scheme. It may only work in a specific app.");
  }
  const url = parsedUrl(value);
  if (url?.hostname.toLowerCase().includes("xn--")) {
    warnings.push("This hostname uses encoded international characters. Check it carefully.");
  }
  return warnings;
}

function readableDate(value: string): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return value;
  return parsed.toLocaleString("en", { dateStyle: "medium", timeStyle: "short" });
}

function comparableDate(value: string): number | null {
  if (!value) return null;
  let normalized = value;
  const compactDate = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (compactDate) {
    normalized =
      compactDate[1] + "-" + compactDate[2] + "-" + compactDate[3] +
      (compactDate[4] ? "T" + compactDate[4] + ":" + compactDate[5] + ":" + compactDate[6] + (compactDate[7] ?? "") : "");
  }
  const timestamp = Date.parse(normalized);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function formatAmount(value: string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return value;
  return Number.isInteger(amount) ? amount.toFixed(0) : amount.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export function buildIntentPreview(mode: QrMode, fields: PayloadFields, payload: string): IntentPreview {
  switch (mode) {
    case "text":
      return {
        badge: "Text",
        title: "Plain text",
        details: [Array.from(payload).length + " characters"],
        warnings: [],
      };
    case "url": {
      const raw = field(fields, "url") || payload;
      const url = parsedUrl(raw);
      const destination = url?.hostname.replace(/^www\./i, "") || raw || "link";
      return {
        badge: "URL",
        title: "Open " + destination,
        details: compact([url?.pathname && url.pathname !== "/" ? url.pathname : undefined]),
        warnings: urlWarnings(raw),
      };
    }
    case "wifi": {
      const ssid = field(fields, "ssid") || "Wi-Fi network";
      const auth = field(fields, "auth") || "WPA";
      const security = auth === "nopass" ? "Open network" : auth === "WEP" ? "WEP security" : "WPA/WPA2 security";
      return {
        badge: "Wi-Fi",
        title: "Join " + ssid,
        details: [security],
        warnings: auth === "nopass" ? ["Open Wi-Fi networks do not require a password."] : [],
      };
    }
    case "email": {
      const email = field(fields, "email") || "recipient";
      const subject = field(fields, "subject");
      return {
        badge: "Email",
        title: "Email " + email,
        details: compact([subject ? "Subject: " + subject : undefined]),
        warnings: [],
      };
    }
    case "sms": {
      const phone = field(fields, "phone") || "phone number";
      const message = field(fields, "message");
      return {
        badge: "SMS",
        title: "Text " + phone,
        details: compact([message ? Array.from(message).length + " message characters" : undefined]),
        warnings: [],
      };
    }
    case "phone":
      return {
        badge: "Phone",
        title: "Call " + (field(fields, "phone") || "phone number"),
        details: [],
        warnings: [],
      };
    case "vcard": {
      const fullName =
        field(fields, "fullName") ||
        [field(fields, "firstName"), field(fields, "lastName")].filter(Boolean).join(" ") ||
        field(fields, "company") ||
        "contact";
      return {
        badge: "Contact",
        title: "Add " + fullName + " to contacts",
        details: compact([field(fields, "phone"), field(fields, "email"), field(fields, "company")]),
        warnings: [],
      };
    }
    case "upi": {
      const address = field(fields, "payeeAddress");
      const name = field(fields, "payeeName");
      const amount = field(fields, "amount");
      const numericAmount = Number(amount);
      const validAmount = amount.length > 0 && Number.isFinite(numericAmount) && numericAmount > 0;
      const recipient = name || address;
      const title = validAmount && recipient
        ? "Pay \u20B9" + formatAmount(amount) + " to " + recipient
        : "Pay with UPI";
      const warnings: string[] = [];
      if (!address) warnings.push("Add a UPI payee address before sharing this QR.");
      if (amount && (!Number.isFinite(numericAmount) || numericAmount <= 0)) {
        warnings.push("UPI amount must be a positive number.");
      }
      return {
        badge: "UPI",
        title,
        details: compact([address, field(fields, "note")]),
        warnings,
      };
    }
    case "event": {
      const title = field(fields, "title") || "event";
      const startsAt = field(fields, "startsAt");
      const endsAt = field(fields, "endsAt");
      const startTime = comparableDate(startsAt);
      const endTime = comparableDate(endsAt);
      const warnings =
        startTime !== null && endTime !== null && endTime < startTime
          ? ["Event end time is before its start time."]
          : [];
      return {
        badge: "Event",
        title: "Add " + title + " to calendar",
        details: compact([
          startsAt ? "Starts " + readableDate(startsAt) : undefined,
          field(fields, "location") ? "At " + field(fields, "location") : undefined,
        ]),
        warnings,
      };
    }
    case "geo": {
      const latitude = field(fields, "latitude");
      const longitude = field(fields, "longitude");
      const label = field(fields, "label") || "location";
      const warnings: string[] = [];
      if (latitude) {
        const value = Number(latitude);
        if (!Number.isFinite(value) || value < -90 || value > 90) warnings.push("Latitude must be between -90 and 90.");
      }
      if (longitude) {
        const value = Number(longitude);
        if (!Number.isFinite(value) || value < -180 || value > 180) warnings.push("Longitude must be between -180 and 180.");
      }
      return {
        badge: "Location",
        title: "Open " + label + " in maps",
        details: compact([latitude && longitude ? latitude + ", " + longitude : undefined]),
        warnings,
      };
    }
    default: {
      const exhaustive: never = mode;
      return exhaustive;
    }
  }
}
