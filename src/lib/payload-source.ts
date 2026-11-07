export function originalStructuredPayload(raw: string, automatic: boolean): string | null {
  const value = raw.trim();
  return automatic && /^(?:WIFI:|BEGIN:VCARD|BEGIN:VCALENDAR|upi:\/\/pay|mailto:|sms:|smsto:|tel:|geo:)/i.test(value) ? value : null;
}
