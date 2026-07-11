export type LogoPresetId =
  | "instagram"
  | "whatsapp"
  | "youtube"
  | "x"
  | "linkedin"
  | "github"
  | "facebook"
  | "upi"
  | "tiktok"
  | "telegram"
  | "discord";

export interface LogoPreset {
  id: LogoPresetId;
  name: string;
  label: string;
  svg: string;
}

function badge(fill: string, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" role="img"><rect width="96" height="96" rx="24" fill="${fill}"/>${body}</svg>`;
}

export const LOGO_PRESETS: LogoPreset[] = [
  {
    id: "instagram",
    name: "Instagram",
    label: "Instagram camera badge",
    svg: badge(
      "#e1306c",
      '<rect x="25" y="25" width="46" height="46" rx="14" fill="none" stroke="#fff" stroke-width="7"/><circle cx="48" cy="48" r="12" fill="none" stroke="#fff" stroke-width="7"/><circle cx="63" cy="33" r="4.5" fill="#fff"/>',
    ),
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    label: "WhatsApp chat badge",
    svg: badge(
      "#25d366",
      '<path d="M24 76l5.2-16.2A28 28 0 1 1 40 69.4L24 76Z" fill="none" stroke="#fff" stroke-width="7" stroke-linejoin="round"/><path d="M39 35c2.5 12.5 9.4 19 22 22" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round"/>',
    ),
  },
  {
    id: "youtube",
    name: "YouTube",
    label: "YouTube play badge",
    svg: badge("#ff0033", '<rect x="18" y="29" width="60" height="38" rx="12" fill="#fff"/><path d="M44 39v18l17-9-17-9Z" fill="#ff0033"/>'),
  },
  {
    id: "x",
    name: "X",
    label: "X social badge",
    svg: badge("#111111", '<path d="M27 24l42 48M69 24 27 72" stroke="#fff" stroke-width="10" stroke-linecap="round"/>'),
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    label: "LinkedIn badge",
    svg: badge("#0a66c2", '<circle cx="30" cy="31" r="6" fill="#fff"/><rect x="25" y="42" width="10" height="30" rx="2" fill="#fff"/><path d="M45 42h10v5.2c2-3.6 5.2-6 10-6 7 0 11 4.8 11 13.8v17H66V56.5c0-4-1.7-6-5-6-3.6 0-6 2.5-6 7V72H45V42Z" fill="#fff"/>'),
  },
  {
    id: "github",
    name: "GitHub",
    label: "GitHub code badge",
    svg: badge("#24292f", '<text x="48" y="58" text-anchor="middle" font-family="Arial, sans-serif" font-size="27" font-weight="800" fill="#fff">GH</text>'),
  },
  {
    id: "facebook",
    name: "Facebook",
    label: "Facebook badge",
    svg: badge("#1877f2", '<path d="M55 78V51h9l2-11H55v-7c0-3.2 1.5-6 6.2-6H67V17.5c-3-.4-6-.6-9-.6-9 0-15 5.5-15 15.4V40h-9v11h9v27h12Z" fill="#fff"/>'),
  },
  {
    id: "upi",
    name: "UPI",
    label: "UPI payment badge",
    svg: badge("#0f766e", '<text x="48" y="57" text-anchor="middle" font-family="Arial, sans-serif" font-size="26" font-weight="900" fill="#fff">UPI</text><path d="M67 27l8 21-8 21" fill="none" stroke="#d9f99d" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>'),
  },
  {
    id: "tiktok",
    name: "TikTok",
    label: "TikTok music badge",
    svg: badge("#111111", '<path d="M50 23v30a13 13 0 1 1-10-12" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round"/><path d="M50 24c4 8 9 12 17 13" fill="none" stroke="#25f4ee" stroke-width="6" stroke-linecap="round"/>'),
  },
  {
    id: "telegram",
    name: "Telegram",
    label: "Telegram paper plane badge",
    svg: badge("#229ed9", '<path d="M76 24 63 73c-1 4-4 5-7 3L42 64l-7 7c-1 1-2 2-4 2l1-15 28-25c1-1 0-2-1-1L25 53 11 49c-4-1-4-4 1-6l58-22c4-2 7 1 6 3Z" fill="#fff"/>'),
  },
  {
    id: "discord",
    name: "Discord",
    label: "Discord chat badge",
    svg: badge("#5865f2", '<path d="M31 32c11-5 23-5 34 0l5 28c-9 7-17 8-25 7l-3-5h12l-2-4c-8 3-16 3-24 0l-2 4h12l-3 5c-8 1-16 0-25-7l5-28Z" fill="#fff"/><circle cx="38" cy="49" r="4" fill="#5865f2"/><circle cx="58" cy="49" r="4" fill="#5865f2"/>'),
  },
];

const PLATFORM_PATTERNS: Array<{ id: LogoPresetId; patterns: RegExp[] }> = [
  { id: "instagram", patterns: [/\b(instagram\.com|instagr\.am)\b/i] },
  { id: "whatsapp", patterns: [/\b(wa\.me|whatsapp\.com|api\.whatsapp\.com)\b/i] },
  { id: "youtube", patterns: [/\b(youtube\.com|youtu\.be|youtube-nocookie\.com)\b/i] },
  { id: "x", patterns: [/\b(x\.com|twitter\.com)\b/i] },
  { id: "linkedin", patterns: [/\blinkedin\.com\b/i] },
  { id: "github", patterns: [/\b(github\.com|gist\.github\.com)\b/i] },
  { id: "facebook", patterns: [/\b(facebook\.com|fb\.com|fb\.me|m\.facebook\.com)\b/i] },
  { id: "upi", patterns: [/^upi:\/\/pay\b/i] },
  { id: "tiktok", patterns: [/\b(tiktok\.com|vm\.tiktok\.com)\b/i] },
  { id: "telegram", patterns: [/\b(t\.me|telegram\.me|telegram\.org)\b/i] },
  { id: "discord", patterns: [/\b(discord\.gg|discord\.com|discordapp\.com)\b/i] },
];

export function getLogoPreset(id: string | undefined): LogoPreset | undefined {
  return LOGO_PRESETS.find((preset) => preset.id === id);
}

export function detectLogoPresetFromText(input: string): LogoPreset | undefined {
  const value = input.trim();
  if (!value) return undefined;

  const candidates = [value];
  const withProtocol = /^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withProtocol);
    candidates.push(url.hostname, `${url.hostname}${url.pathname}`, url.href);
  } catch {
    // Plain platform handles can still be matched against the raw value.
  }

  for (const candidate of candidates) {
    for (const matcher of PLATFORM_PATTERNS) {
      if (matcher.patterns.some((pattern) => pattern.test(candidate))) return getLogoPreset(matcher.id);
    }
  }

  return undefined;
}

export function logoPresetToDataUrl(preset: LogoPreset): string {
  return `data:image/svg+xml,${encodeURIComponent(preset.svg)}`;
}
