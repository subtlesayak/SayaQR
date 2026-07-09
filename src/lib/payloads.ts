export type QrMode =
  | "text"
  | "url"
  | "wifi"
  | "email"
  | "sms"
  | "phone"
  | "vcard"
  | "upi"
  | "event"
  | "geo";

export type PayloadFields = Record<string, string | boolean | undefined>;

export interface ModeOption {
  id: QrMode;
  label: string;
  hint: string;
}

export const QR_MODES: ModeOption[] = [
  { id: "text", label: "Plain text", hint: "Free-form notes, labels, or serials" },
  { id: "url", label: "URL", hint: "Web links with automatic https://" },
  { id: "wifi", label: "Wi-Fi", hint: "Network name, password, and hidden SSID" },
  { id: "email", label: "Email", hint: "Mailto link with subject and body" },
  { id: "sms", label: "SMS", hint: "Phone number and prepared message" },
  { id: "phone", label: "Phone", hint: "Tap-to-call telephone link" },
  { id: "vcard", label: "vCard contact", hint: "Contact details for address books" },
  { id: "upi", label: "UPI payment", hint: "Indian UPI payment URI" },
  { id: "event", label: "Event/calendar", hint: "VCALENDAR event invite" },
  { id: "geo", label: "Geo location", hint: "Latitude, longitude, and map label" },
];

export function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function escapeWifi(value: string): string {
  return value.replace(/([\\;,:])/g, "\\$1");
}

export function escapeVCard(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function field(fields: PayloadFields, key: string): string {
  const value = fields[key];
  return typeof value === "string" ? value.trim() : "";
}

function checked(fields: PayloadFields, key: string): boolean {
  return fields[key] === true || fields[key] === "true";
}

function query(params: Record<string, string>): string {
  return Object.entries(params)
    .filter(([, value]) => value.trim().length > 0)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value.trim())}`)
    .join("&");
}

function vcardLine(name: string, value: string): string | null {
  const cleaned = value.trim();
  return cleaned ? `${name}:${escapeVCard(cleaned)}` : null;
}

function formatVCard(fields: PayloadFields): string {
  const first = field(fields, "firstName");
  const last = field(fields, "lastName");
  const fullName = field(fields, "fullName") || [first, last].filter(Boolean).join(" ") || field(fields, "company");
  const addressParts = [
    "",
    "",
    field(fields, "street"),
    field(fields, "city"),
    field(fields, "region"),
    field(fields, "postalCode"),
    field(fields, "country"),
  ];

  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${escapeVCard(last)};${escapeVCard(first)};;;`,
    vcardLine("FN", fullName),
    vcardLine("ORG", field(fields, "company")),
    vcardLine("TITLE", field(fields, "title")),
    vcardLine("TEL;TYPE=CELL", field(fields, "phone")),
    vcardLine("EMAIL", field(fields, "email")),
    vcardLine("URL", normalizeUrl(field(fields, "website"))),
    addressParts.some(Boolean) ? `ADR;TYPE=WORK:${addressParts.map(escapeVCard).join(";")}` : null,
    vcardLine("NOTE", field(fields, "note")),
    "END:VCARD",
  ];

  return lines.filter((line): line is string => Boolean(line)).join("\n");
}

function formatCalendarDate(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^\d{8}(T\d{6}Z?)?$/.test(trimmed)) return trimmed;
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.valueOf())) {
    return parsed.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  }
  return trimmed.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function formatEvent(fields: PayloadFields): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SayaQR//Offline QR Generator//EN",
    "BEGIN:VEVENT",
    vcardLine("SUMMARY", field(fields, "title")),
    field(fields, "startsAt") ? `DTSTART:${formatCalendarDate(field(fields, "startsAt"))}` : null,
    field(fields, "endsAt") ? `DTEND:${formatCalendarDate(field(fields, "endsAt"))}` : null,
    vcardLine("LOCATION", field(fields, "location")),
    vcardLine("DESCRIPTION", field(fields, "description")),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.filter((line): line is string => Boolean(line)).join("\n");
}

export function formatPayload(mode: QrMode, fields: PayloadFields): string {
  switch (mode) {
    case "text":
      return field(fields, "text");
    case "url":
      return normalizeUrl(field(fields, "url"));
    case "wifi": {
      const auth = field(fields, "auth") || "WPA";
      const password = field(fields, "password");
      const passwordPart = auth === "nopass" ? "" : `P:${escapeWifi(password)};`;
      return `WIFI:T:${auth};S:${escapeWifi(field(fields, "ssid"))};${passwordPart}H:${checked(fields, "hidden") ? "true" : "false"};;`;
    }
    case "email": {
      const params = query({ subject: field(fields, "subject"), body: field(fields, "body") });
      return `mailto:${field(fields, "email")}${params ? `?${params}` : ""}`;
    }
    case "sms":
      return `SMSTO:${field(fields, "phone")}:${field(fields, "message")}`;
    case "phone":
      return `tel:${field(fields, "phone")}`;
    case "vcard":
      return formatVCard(fields);
    case "upi": {
      const params = query({
        pa: field(fields, "payeeAddress"),
        pn: field(fields, "payeeName"),
        am: field(fields, "amount"),
        cu: field(fields, "currency") || "INR",
        tn: field(fields, "note"),
      });
      return `upi://pay?${params}`;
    }
    case "event":
      return formatEvent(fields);
    case "geo": {
      const lat = field(fields, "latitude");
      const lon = field(fields, "longitude");
      const label = field(fields, "label");
      if (lat && lon) {
        const base = `geo:${lat},${lon}`;
        return label ? `${base}?q=${encodeURIComponent(`${lat},${lon}(${label})`)}` : base;
      }
      return label ? `geo:0,0?q=${encodeURIComponent(label)}` : "";
    }
    default: {
      const exhaustive: never = mode;
      return exhaustive;
    }
  }
}
