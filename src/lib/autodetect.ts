import type { PayloadFields, QrMode } from "./payloads";

export interface DetectionResult {
  mode: QrMode;
  fields: PayloadFields;
  confidence: "high" | "medium" | "low";
  label: string;
}

type CoordinatePair = {
  latitude: string;
  longitude: string;
};

function clean(value: string): string {
  return value.trim();
}

function stripPrefix(value: string, prefix: string): string {
  return value.slice(prefix.length);
}

function decodeLoose(value: string): string {
  const normalized = value.replace(/\+/g, " ");
  try {
    return decodeURIComponent(normalized);
  } catch {
    return normalized;
  }
}

function splitEscaped(value: string, separator: string): string[] {
  const parts: string[] = [];
  let cell = "";
  let escaped = false;
  for (const char of value) {
    if (escaped) {
      cell += char;
      escaped = false;
    } else if (char === "\\") {
      escaped = true;
    } else if (char === separator) {
      parts.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }
  parts.push(cell);
  return parts;
}

function parseQuery(value: string): URLSearchParams {
  const query = value.includes("?") ? value.slice(value.indexOf("?") + 1) : value;
  return new URLSearchParams(query);
}

function parseMailto(raw: string): PayloadFields {
  const withoutScheme = stripPrefix(raw, "mailto:");
  const [email, queryString = ""] = withoutScheme.split("?");
  const params = new URLSearchParams(queryString);
  return {
    email: decodeURIComponent(email),
    subject: params.get("subject") ?? "",
    body: params.get("body") ?? "",
  };
}

function parseWifi(raw: string): PayloadFields {
  const body = raw.replace(/^WIFI:/i, "").replace(/;;$/, "");
  const fields: PayloadFields = { auth: "WPA", hidden: false };
  for (const part of splitEscaped(body, ";")) {
    const key = part.slice(0, 2).toUpperCase();
    const value = part.slice(2);
    if (key === "T:") fields.auth = value || "nopass";
    if (key === "S:") fields.ssid = value;
    if (key === "P:") fields.password = value;
    if (key === "H:") fields.hidden = /^true$/i.test(value);
  }
  return fields;
}

function parseVCard(raw: string): PayloadFields {
  const fields: PayloadFields = {};
  for (const line of raw.split(/\r?\n/)) {
    const [name, ...rest] = line.split(":");
    const value = rest.join(":").replace(/\\n/g, "\n").replace(/\\([,;\\])/g, "$1");
    const upper = name.toUpperCase();
    if (upper === "FN") fields.fullName = value;
    if (upper === "N") {
      const [lastName = "", firstName = ""] = value.split(";");
      fields.firstName = firstName;
      fields.lastName = lastName;
    }
    if (upper.startsWith("ORG")) fields.company = value;
    if (upper.startsWith("TITLE")) fields.title = value;
    if (upper.startsWith("TEL")) fields.phone = value;
    if (upper.startsWith("EMAIL")) fields.email = value;
    if (upper.startsWith("URL")) fields.website = value;
    if (upper.startsWith("NOTE")) fields.note = value;
  }
  return fields;
}

function parseSms(raw: string): PayloadFields {
  if (/^smsto:/i.test(raw)) {
    const [, phone = "", message = ""] = raw.match(/^smsto:([^:]*):(.*)$/i) ?? [];
    return { phone, message };
  }
  const parsed = new URL(raw);
  return { phone: parsed.pathname, message: parsed.searchParams.get("body") ?? "" };
}

function parseEvent(raw: string): PayloadFields {
  const fields: PayloadFields = {};
  for (const line of raw.split(/\r?\n/)) {
    const [name, ...rest] = line.split(":");
    const value = rest.join(":").replace(/\\n/g, "\n").replace(/\\([,;\\])/g, "$1");
    const upper = name.toUpperCase();
    if (upper === "SUMMARY") fields.title = value;
    if (upper === "DTSTART") fields.startsAt = value;
    if (upper === "DTEND") fields.endsAt = value;
    if (upper === "LOCATION") fields.location = value;
    if (upper === "DESCRIPTION") fields.description = value;
  }
  return fields;
}

function parseGeo(raw: string): PayloadFields {
  const match = raw.match(/^geo:([^,?]+),([^?]+)(?:\?q=.*\((.*)\))?/i);
  if (!match) return { text: raw };
  return {
    latitude: decodeURIComponent(match[1]),
    longitude: decodeURIComponent(match[2]),
    label: match[3] ? decodeURIComponent(match[3]) : "",
  };
}

function parseUpi(raw: string): PayloadFields {
  const params = parseQuery(raw);
  return {
    payeeAddress: params.get("pa") ?? "",
    payeeName: params.get("pn") ?? "",
    amount: params.get("am") ?? "",
    currency: params.get("cu") ?? "INR",
    note: params.get("tn") ?? "",
  };
}

function parseUrlLike(raw: string): URL | null {
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(withScheme);
  } catch {
    return null;
  }
}

function isCoordinate(latitude: number, longitude: number): boolean {
  return Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
}

function readCoordinatePair(source: string | null): CoordinatePair | null {
  if (!source) return null;
  const decoded = decodeLoose(source);
  const pairs = decoded.matchAll(/(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/g);
  for (const match of pairs) {
    const latitude = Number(match[1]);
    const longitude = Number(match[2]);
    if (isCoordinate(latitude, longitude)) {
      return { latitude: match[1], longitude: match[2] };
    }
  }
  return null;
}

function readGoogleDataCoordinate(source: string): CoordinatePair | null {
  const latLon = source.match(/!3d(-?\d{1,3}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/i);
  if (latLon && isCoordinate(Number(latLon[1]), Number(latLon[2]))) {
    return { latitude: latLon[1], longitude: latLon[2] };
  }

  const lonLat = source.match(/!2d(-?\d{1,3}(?:\.\d+)?)!3d(-?\d{1,3}(?:\.\d+)?)/i);
  if (lonLat && isCoordinate(Number(lonLat[2]), Number(lonLat[1]))) {
    return { latitude: lonLat[2], longitude: lonLat[1] };
  }

  return null;
}

function isGoogleMap(parsed: URL): boolean {
  const host = parsed.hostname.toLowerCase();
  return host === "maps.app.goo.gl" || (host === "goo.gl" && parsed.pathname.startsWith("/maps")) || host.startsWith("maps.google.") || (/\bgoogle\./.test(host) && parsed.pathname.startsWith("/maps"));
}

function isAppleMap(parsed: URL): boolean {
  return parsed.hostname.toLowerCase() === "maps.apple.com";
}

function isShortMapLink(parsed: URL): boolean {
  const host = parsed.hostname.toLowerCase();
  return host === "maps.app.goo.gl" || (host === "goo.gl" && parsed.pathname.startsWith("/maps"));
}

function firstUsableLabel(...values: Array<string | null>): string {
  for (const value of values) {
    if (!value) continue;
    const decoded = decodeLoose(value).trim();
    if (decoded && !readCoordinatePair(decoded) && !/^https?:\/\//i.test(decoded)) return decoded;
  }
  return "";
}

function labelFromMapPath(parsed: URL): string {
  const segments = parsed.pathname.split("/").filter(Boolean);
  const markerIndex = segments.findIndex((segment) => ["place", "search"].includes(segment.toLowerCase()));
  if (markerIndex < 0) return "";
  const segment = segments[markerIndex + 1];
  if (!segment || segment.startsWith("@")) return "";
  return decodeLoose(segment).trim();
}

function parseMapLink(raw: string): DetectionResult | null {
  if (!/^(https?:\/\/|www\.|maps\.|goo\.gl|google\.)/i.test(raw)) return null;
  const parsed = parseUrlLike(raw);
  if (!parsed || (!isGoogleMap(parsed) && !isAppleMap(parsed))) return null;

  if (isShortMapLink(parsed)) {
    return { mode: "url", fields: { url: raw }, confidence: "low", label: "Map short link" };
  }

  const params = parsed.searchParams;
  const pathLabel = labelFromMapPath(parsed);
  const queryLabel = firstUsableLabel(params.get("q"), params.get("query"), params.get("destination"), params.get("daddr"), params.get("address"), pathLabel);
  const coordinates =
    readCoordinatePair(params.get("ll")) ??
    readCoordinatePair(params.get("sll")) ??
    readCoordinatePair(params.get("center")) ??
    readCoordinatePair(params.get("q")) ??
    readCoordinatePair(params.get("query")) ??
    readCoordinatePair(params.get("destination")) ??
    readCoordinatePair(params.get("daddr")) ??
    readCoordinatePair(parsed.pathname) ??
    readCoordinatePair(parsed.hash) ??
    readGoogleDataCoordinate(raw) ??
    readCoordinatePair(raw);

  if (coordinates) {
    return {
      mode: "geo",
      fields: { ...coordinates, label: queryLabel },
      confidence: "high",
      label: isAppleMap(parsed) ? "Apple Maps location" : "Google Maps location",
    };
  }

  if (queryLabel) {
    return { mode: "geo", fields: { label: queryLabel }, confidence: "medium", label: "Map location search" };
  }

  return { mode: "url", fields: { url: raw }, confidence: "low", label: "Map link" };
}

export function detectQrContent(input: string): DetectionResult {
  const value = clean(input);
  const lower = value.toLowerCase();

  if (!value) {
    return { mode: "text", fields: { text: "" }, confidence: "low", label: "No content yet" };
  }

  if (/^wifi:/i.test(value)) {
    return { mode: "wifi", fields: parseWifi(value), confidence: "high", label: "Wi-Fi QR string" };
  }
  if (/^begin:vcard/i.test(value)) {
    return { mode: "vcard", fields: parseVCard(value), confidence: "high", label: "vCard contact" };
  }
  if (/^begin:vcalendar/i.test(value)) {
    return { mode: "event", fields: parseEvent(value), confidence: "high", label: "Calendar event" };
  }
  if (/^upi:\/\/pay/i.test(value)) {
    return { mode: "upi", fields: parseUpi(value), confidence: "high", label: "UPI payment" };
  }
  if (/^geo:/i.test(value)) {
    return { mode: "geo", fields: parseGeo(value), confidence: "high", label: "Geo location" };
  }
  if (/^mailto:/i.test(value)) {
    return { mode: "email", fields: parseMailto(value), confidence: "high", label: "Email link" };
  }
  if (/^(sms:|smsto:)/i.test(value)) {
    return { mode: "sms", fields: parseSms(value), confidence: "high", label: "SMS link" };
  }
  if (/^tel:/i.test(value)) {
    return { mode: "phone", fields: { phone: stripPrefix(value, value.slice(0, 4)) }, confidence: "high", label: "Phone link" };
  }
  if (/^-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/.test(value)) {
    const [latitude, longitude] = value.split(",").map((part) => part.trim());
    return { mode: "geo", fields: { latitude, longitude }, confidence: "medium", label: "Latitude and longitude" };
  }

  const mapDetection = parseMapLink(value);
  if (mapDetection) return mapDetection;

  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return { mode: "email", fields: { email: value }, confidence: "medium", label: "Email address" };
  }
  if (/^(https?:\/\/|www\.)/i.test(value) || /^[a-z0-9.-]+\.[a-z]{2,}(?:\/.*)?$/i.test(value)) {
    return { mode: "url", fields: { url: value }, confidence: "medium", label: "URL" };
  }
  if (/^[+]?[(]?\d[\d\s().-]{6,}\d$/.test(value)) {
    return { mode: "phone", fields: { phone: value }, confidence: "medium", label: "Phone number" };
  }
  if (lower.includes("@upi") || /^[a-z0-9._-]+@[a-z0-9]+$/i.test(value)) {
    return { mode: "upi", fields: { payeeAddress: value, currency: "INR" }, confidence: "medium", label: "UPI ID" };
  }

  return { mode: "text", fields: { text: value }, confidence: "low", label: "Plain text" };
}