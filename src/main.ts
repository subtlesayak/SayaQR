import "./style.css";
import { detectQrContent, type DetectionResult } from "./lib/autodetect";
import { parseCsv, safeFileName, type CsvData } from "./lib/csv";
import { getQrHealthBadge } from "./lib/health";
import { formatPayload, QR_MODES, type PayloadFields, type QrMode } from "./lib/payloads";
import { createQrCode } from "./lib/qr";
import { getScannabilityWarnings } from "./lib/scannability";
import {
  buildSvgFromQr,
  DEFAULT_RENDER_OPTIONS,
  qrPdfBlob,
  qrStickerSheetPdfBlob,
  svgBlob,
  svgToRasterBlob,
  type FinderStyle,
  type QrRenderOptions,
} from "./lib/render";
import {
  QR_STYLE_PRESETS,
  defaultStyleParams,
  getStylePreset,
  type StyleParamControl,
  type StyleParamValue,
  type StyleParams,
} from "./lib/stylePresets";
import type { ZipInputFile } from "./lib/zip";

type FieldConfig = {
  name: string;
  label: string;
  type: "text" | "url" | "email" | "tel" | "number" | "textarea" | "select" | "checkbox" | "datetime-local";
  placeholder?: string;
  defaultValue?: string | boolean;
  rows?: number;
  options?: Array<{ value: string; label: string }>;
};

const AUTO_CATEGORY_VALUE = "auto";
const STYLE_PREF_KEY = "sayaqr-preferred-style";
const BRAND_KIT_KEY = "sayaqr-brand-kit-v1";

type CategorySelection = QrMode | typeof AUTO_CATEGORY_VALUE;
type TemplateId = "" | "whatsapp" | "social" | "deep-link" | "upi-polished" | "wifi-guest" | "vcard-polished";

interface BrandKit {
  colors: string[];
  stylePresetId: string;
  logoDataUrl?: string;
}

const QUICK_FIELD_BY_MODE: Record<QrMode, string> = {
  text: "text",
  url: "url",
  wifi: "ssid",
  email: "email",
  sms: "phone",
  phone: "phone",
  vcard: "fullName",
  upi: "payeeAddress",
  event: "title",
  geo: "label",
};

type QrTemplate = {
  id: TemplateId;
  label: string;
  mode: QrMode;
  fields: PayloadFields;
  quickContent?: string;
};

const QR_TEMPLATES: QrTemplate[] = [
  { id: "", label: "No template", mode: "url", fields: {} },
  { id: "whatsapp", label: "WhatsApp message", mode: "url", quickContent: "https://wa.me/15551234567?text=Hello%20from%20SayaQR", fields: { url: "https://wa.me/15551234567?text=Hello%20from%20SayaQR" } },
  { id: "social", label: "Instagram/social profile", mode: "url", quickContent: "instagram.com/subtlesayak", fields: { url: "instagram.com/subtlesayak" } },
  { id: "deep-link", label: "App deep link", mode: "url", quickContent: "myapp://open/profile/123", fields: { url: "myapp://open/profile/123" } },
  { id: "upi-polished", label: "UPI payment", mode: "upi", fields: { payeeAddress: "name@bank", payeeName: "Subtle Sayak", amount: "250.00", currency: "INR", note: "Payment" } },
  { id: "wifi-guest", label: "Guest Wi-Fi", mode: "wifi", fields: { ssid: "Guest Wi-Fi", auth: "WPA", password: "guest-password", hidden: false } },
  { id: "vcard-polished", label: "vCard contact", mode: "vcard", fields: { firstName: "Subtle", lastName: "Sayak", fullName: "Subtle Sayak", company: "SayaQR", title: "Creator", phone: "+15551234567", email: "hello@example.com", website: "https://subtlesayak.github.io/", note: "Generated locally with SayaQR" } },
];
const MODE_FIELDS: Record<QrMode, FieldConfig[]> = {
  text: [{ name: "text", label: "Text", type: "textarea", rows: 6, defaultValue: "Generated locally by SayaQR" }],
  url: [{ name: "url", label: "URL", type: "url", placeholder: "example.com", defaultValue: "https://github.com/subtlesayak/SayaQR" }],
  wifi: [
    { name: "ssid", label: "Network name", type: "text", placeholder: "Cafe Wi-Fi" },
    {
      name: "auth",
      label: "Security",
      type: "select",
      defaultValue: "WPA",
      options: [
        { value: "WPA", label: "WPA/WPA2" },
        { value: "WEP", label: "WEP" },
        { value: "nopass", label: "No password" },
      ],
    },
    { name: "password", label: "Password", type: "text", placeholder: "password" },
    { name: "hidden", label: "Hidden network", type: "checkbox", defaultValue: false },
  ],
  email: [
    { name: "email", label: "Email", type: "email", placeholder: "hello@example.com" },
    { name: "subject", label: "Subject", type: "text" },
    { name: "body", label: "Body", type: "textarea", rows: 4 },
  ],
  sms: [
    { name: "phone", label: "Phone", type: "tel", placeholder: "+15551234567" },
    { name: "message", label: "Message", type: "textarea", rows: 3 },
  ],
  phone: [{ name: "phone", label: "Phone", type: "tel", placeholder: "+15551234567" }],
  vcard: [
    { name: "firstName", label: "First name", type: "text" },
    { name: "lastName", label: "Last name", type: "text" },
    { name: "fullName", label: "Display name", type: "text" },
    { name: "company", label: "Company", type: "text" },
    { name: "title", label: "Title", type: "text" },
    { name: "phone", label: "Phone", type: "tel" },
    { name: "email", label: "Email", type: "email" },
    { name: "website", label: "Website", type: "url" },
    { name: "street", label: "Street", type: "text" },
    { name: "city", label: "City", type: "text" },
    { name: "region", label: "Region", type: "text" },
    { name: "postalCode", label: "Postal code", type: "text" },
    { name: "country", label: "Country", type: "text" },
    { name: "note", label: "Note", type: "textarea", rows: 3 },
  ],
  upi: [
    { name: "payeeAddress", label: "UPI ID", type: "text", placeholder: "name@bank" },
    { name: "payeeName", label: "Payee name", type: "text" },
    { name: "amount", label: "Amount", type: "number", placeholder: "250.00" },
    { name: "currency", label: "Currency", type: "text", defaultValue: "INR" },
    { name: "note", label: "Payment note", type: "text" },
  ],
  event: [
    { name: "title", label: "Title", type: "text" },
    { name: "startsAt", label: "Starts", type: "datetime-local" },
    { name: "endsAt", label: "Ends", type: "datetime-local" },
    { name: "location", label: "Location", type: "text" },
    { name: "description", label: "Description", type: "textarea", rows: 4 },
  ],
  geo: [
    { name: "latitude", label: "Latitude", type: "number", placeholder: "28.6139" },
    { name: "longitude", label: "Longitude", type: "number", placeholder: "77.2090" },
    { name: "label", label: "Label", type: "text", placeholder: "New Delhi" },
  ],
};

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing app root");
const appRoot = app;

let currentMode: QrMode = "url";
let categorySelection: CategorySelection = AUTO_CATEGORY_VALUE;
let logoDataUrl = "";
let currentPayload = "";
let currentSvg = "";
let batchData: CsvData | null = null;
let currentStylePresetId = localStorage.getItem(STYLE_PREF_KEY) || DEFAULT_RENDER_OPTIONS.stylePresetId || "classic";
let currentStyleParams: StyleParams = defaultStyleParams(currentStylePresetId);

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fieldId(name: string): string {
  return `field-${name}`;
}

function renderField(field: FieldConfig): string {
  const value = typeof field.defaultValue === "string" ? field.defaultValue : "";
  const checked = field.defaultValue === true ? "checked" : "";
  const placeholder = field.placeholder ? ` placeholder="${escapeHtml(field.placeholder)}"` : "";

  if (field.type === "textarea") {
    return `<label class="field field-wide" for="${fieldId(field.name)}"><span>${field.label}</span><textarea id="${fieldId(field.name)}" data-payload-field="${field.name}" rows="${field.rows ?? 4}"${placeholder}>${escapeHtml(value)}</textarea></label>`;
  }

  if (field.type === "select") {
    const options = field.options
      ?.map((option) => `<option value="${escapeHtml(option.value)}" ${option.value === value ? "selected" : ""}>${escapeHtml(option.label)}</option>`)
      .join("") ?? "";
    return `<label class="field" for="${fieldId(field.name)}"><span>${field.label}</span><select id="${fieldId(field.name)}" data-payload-field="${field.name}">${options}</select></label>`;
  }

  if (field.type === "checkbox") {
    return `<label class="switch"><input id="${fieldId(field.name)}" data-payload-field="${field.name}" type="checkbox" ${checked}/><span>${field.label}</span></label>`;
  }

  return `<label class="field" for="${fieldId(field.name)}"><span>${field.label}</span><input id="${fieldId(field.name)}" data-payload-field="${field.name}" type="${field.type}" value="${escapeHtml(value)}"${placeholder}/></label>`;
}

function renderTemplateOptions(): string {
  return QR_TEMPLATES.map((template) => `<option value="${escapeHtml(template.id)}">${escapeHtml(template.label)}</option>`).join("");
}

function renderStylePresetOptions(): string {
  return QR_STYLE_PRESETS.map(
    (preset) => `<option value="${escapeHtml(preset.id)}" ${preset.id === currentStylePresetId ? "selected" : ""}>${escapeHtml(preset.name)}</option>`,
  ).join("");
}

function formatStyleParamValue(control: StyleParamControl, value: StyleParamValue | undefined): string {
  if (typeof value === "boolean") return value ? "On" : "Off";
  if (typeof value !== "number") return String(value ?? "");
  if (["scale", "radius", "opacity"].includes(control.id)) return `${Math.round(value * 100)}%`;
  return value.toFixed(2).replace(/\.00$/, "");
}

function renderStyleParamControl(control: StyleParamControl): string {
  const preset = getStylePreset(currentStylePresetId);
  const value = currentStyleParams[control.id] ?? preset.defaults[control.id];
  const id = `style-param-${control.id}`;
  if (control.type === "checkbox") {
    return `<label class="switch style-param"><input id="${id}" data-style-param="${escapeHtml(control.id)}" type="checkbox" ${value === true ? "checked" : ""}/><span>${escapeHtml(control.label)}</span></label>`;
  }
  if (control.type === "select") {
    const options = control.options?.map((option) => `<option value="${escapeHtml(option.value)}" ${option.value === value ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("") ?? "";
    return `<label class="field style-param" for="${id}"><span>${escapeHtml(control.label)}</span><select id="${id}" data-style-param="${escapeHtml(control.id)}">${options}</select></label>`;
  }
  const numericValue = typeof value === "number" ? value : Number(control.min ?? 0);
  return `<label class="field style-param" for="${id}"><span>${escapeHtml(control.label)} <strong id="${id}-value">${escapeHtml(formatStyleParamValue(control, numericValue))}</strong></span><input id="${id}" data-style-param="${escapeHtml(control.id)}" type="range" min="${control.min ?? 0}" max="${control.max ?? 1}" step="${control.step ?? 0.01}" value="${numericValue}" /></label>`;
}

function renderStyleControlsMarkup(): string {
  const preset = getStylePreset(currentStylePresetId);
  if (preset.controls.length === 0) return `<p class="muted-note">This preset keeps the standard QR shape.</p>`;
  return preset.controls.map(renderStyleParamControl).join("");
}

function loadBrandKit(): BrandKit {
  try {
    const stored = localStorage.getItem(BRAND_KIT_KEY);
    if (!stored) return { colors: [DEFAULT_RENDER_OPTIONS.foreground], stylePresetId: currentStylePresetId };
    const parsed = JSON.parse(stored) as Partial<BrandKit>;
    const colors = Array.isArray(parsed.colors) ? parsed.colors.map((color) => normalizeHexColor(String(color))).filter((color): color is string => Boolean(color)).slice(0, 3) : [];
    return {
      colors: colors.length ? colors : [DEFAULT_RENDER_OPTIONS.foreground],
      stylePresetId: typeof parsed.stylePresetId === "string" ? parsed.stylePresetId : currentStylePresetId,
      logoDataUrl: typeof parsed.logoDataUrl === "string" ? parsed.logoDataUrl : "",
    };
  } catch {
    return { colors: [DEFAULT_RENDER_OPTIONS.foreground], stylePresetId: currentStylePresetId };
  }
}

function saveBrandKit(brandKit: BrandKit): boolean {
  try {
    localStorage.setItem(BRAND_KIT_KEY, JSON.stringify({ ...brandKit, colors: brandKit.colors.slice(0, 3) }));
    return true;
  } catch {
    return false;
  }
}

function renderBrandColorChips(): string {
  const brandKit = loadBrandKit();
  return brandKit.colors.map((color) => `<button class="brand-swatch" type="button" data-brand-color="${escapeHtml(color)}" style="--brand-color: ${escapeHtml(color)}" aria-label="Use brand color ${escapeHtml(color)}"></button>`).join("");
}
function renderApp(): void {
  appRoot.innerHTML = `
    <header class="topbar">
      <div class="topbar-info">
        <div class="brand">
          <div>
            <h1>SayaQR</h1>
            <p>Content -> style -> download</p>
          </div>
        </div>
      </div>
      <div class="mobile-preview-group">
        <button id="mobilePreviewDock" class="mobile-preview-dock" type="button" aria-label="Open QR preview">
          <span id="mobileQrPreview" class="mobile-qr-preview" aria-hidden="true"></span>
          <span class="mobile-preview-copy">
            <strong>Live preview</strong>
            <span id="mobileQrStatus">Ready</span>
          </span>
        </button>
        <div class="mobile-export">
          <button id="mobileExportToggle" class="mobile-export-toggle" type="button" aria-label="Download QR code" aria-haspopup="true" aria-expanded="false"><svg class="download-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v11m0 0 4-4m-4 4-4-4M5 19h14"/></svg><span>Download</span></button>
          <div id="mobileExportMenu" class="mobile-export-menu" role="menu" hidden>
            <button type="button" data-export="svg" role="menuitem">SVG</button>
            <button type="button" data-export="png" role="menuitem">PNG</button>
            <button type="button" data-export="webp" role="menuitem">WebP</button>
            <button type="button" data-export="pdf" role="menuitem">PDF</button>
          </div>
        </div>
      </div>
    </header>
    <main class="workspace">
      <section class="tool-surface controls" aria-label="QR controls">
        <div class="section-heading">
          <h2>QR content</h2>
          <span id="modeHint"></span>
        </div>
        <label class="field field-wide quick-content" for="autoContent"><span>Content</span><textarea id="autoContent" rows="3" placeholder="Paste a URL, Wi-Fi string, email, phone, vCard, UPI ID, event, or coordinates"></textarea></label>
        <div class="simple-grid">
          <label class="field" for="modeSelect"><span>QR type</span><select id="modeSelect" aria-label="QR category"></select></label>
          <label class="field" for="templateSelect"><span>Template</span><select id="templateSelect" aria-label="QR template">${renderTemplateOptions()}</select></label>
          <label class="field" for="stylePreset"><span>Style preset</span><select id="stylePreset">${renderStylePresetOptions()}</select></label>
          <label class="field color-control" for="mainColorHex">
            <span>Main color</span>
            <span class="color-shell">
              <span class="color-swatch-wrap">
                <input id="mainColor" class="native-color-input" type="color" value="${DEFAULT_RENDER_OPTIONS.foreground}" aria-label="Main color picker" />
                <span id="mainColorSwatch" class="color-swatch" style="--swatch-color: ${DEFAULT_RENDER_OPTIONS.foreground}" aria-hidden="true"></span>
              </span>
              <input id="mainColorHex" class="hex-color-input" type="text" value="${DEFAULT_RENDER_OPTIONS.foreground}" inputmode="text" spellcheck="false" aria-label="Main color hex code" />
            </span>
          </label>
          <div class="brand-kit field-wide">
            <div>
              <strong>Brand kit</strong>
              <span id="brandKitStatus">Save up to 3 colors and a preferred style.</span>
            </div>
            <div id="brandColors" class="brand-colors">${renderBrandColorChips()}</div>
            <div class="brand-actions">
              <button id="saveBrandKit" type="button">Save brand</button>
              <button id="useBrandPreset" type="button">Use brand preset</button>
            </div>
          </div>
          <button id="quickDownload" class="primary-download field-wide" type="button" data-export="png"><svg class="download-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v11m0 0 4-4m-4 4-4-4M5 19h14"/></svg><span>Download PNG</span></button>
        </div>
        <p id="autoDetectStatus" class="detect-status" aria-live="polite">Paste content above, then auto-detect its category.</p>
        <p id="presetDescription" class="preset-description">${escapeHtml(getStylePreset(currentStylePresetId).description)}</p>
        <div id="styleControls" class="style-controls">${renderStyleControlsMarkup()}</div>

        <details id="advancedPanel" class="advanced-panel">
          <summary><span>Advanced options</span><small>Error correction, exports, logo, batch CSV</small></summary>
          <div class="advanced-body">
            <div class="section-heading compact"><h2>Mode details</h2><span>Optional structured fields</span></div>
            <form id="payloadForm" class="payload-grid"></form>

            <div class="section-heading compact"><h2>Design details</h2></div>
            <div class="design-grid">
              <label class="field color-mode-field" for="colorMode"><span>Advanced color</span><select id="colorMode"><option value="default" selected>Main color only</option><option value="custom">Custom foreground/background</option></select></label>
              <div id="customColorPanel" class="custom-color-panel" hidden>
                <label class="field design-pair color-control" for="foregroundHex">
                  <span>Foreground</span>
                  <span class="color-shell">
                    <span class="color-swatch-wrap">
                      <input id="foreground" class="native-color-input" type="color" value="${DEFAULT_RENDER_OPTIONS.foreground}" aria-label="Foreground color picker" />
                      <span id="foregroundSwatch" class="color-swatch" style="--swatch-color: ${DEFAULT_RENDER_OPTIONS.foreground}" aria-hidden="true"></span>
                    </span>
                    <input id="foregroundHex" class="hex-color-input" type="text" value="${DEFAULT_RENDER_OPTIONS.foreground}" inputmode="text" spellcheck="false" aria-label="Foreground hex color" />
                  </span>
                </label>
                <label class="field design-pair color-control" for="backgroundHex">
                  <span>Background</span>
                  <span class="color-shell">
                    <span class="color-swatch-wrap">
                      <input id="background" class="native-color-input" type="color" value="${DEFAULT_RENDER_OPTIONS.background}" aria-label="Background color picker" />
                      <span id="backgroundSwatch" class="color-swatch" style="--swatch-color: ${DEFAULT_RENDER_OPTIONS.background}" aria-hidden="true"></span>
                    </span>
                    <input id="backgroundHex" class="hex-color-input" type="text" value="${DEFAULT_RENDER_OPTIONS.background}" inputmode="text" spellcheck="false" aria-label="Background hex color" />
                  </span>
                </label>
                <label class="switch color-alpha-toggle"><input id="transparentBackground" type="checkbox" /><span>Transparent background</span></label>
              </div>
              <label class="field"><span>Quiet zone <strong id="marginValue">4</strong></span><input id="margin" type="range" min="0" max="10" value="4" /></label>
              <label class="field"><span>Module size <strong id="moduleSizeValue">12</strong></span><input id="moduleSize" type="range" min="4" max="28" value="12" /></label>
              <label class="field"><span>Rounded modules <strong id="roundedValue">12%</strong></span><input id="rounded" type="range" min="0" max="1" step="0.05" value="0.12" /></label>
              <label class="field design-pair"><span>Finder style</span><select id="finderStyle"><option value="square">Square</option><option value="rounded" selected>Rounded</option><option value="circle">Circle</option></select></label>
              <label class="field design-pair"><span>Error correction</span><select id="ecc"><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="QUARTILE">Quartile</option><option value="HIGH" selected>High</option></select></label>
              <label class="field field-wide"><span>Center logo</span><input id="logoUpload" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" /></label>
              <label class="field"><span>Logo size <strong id="logoSizeValue">18%</strong></span><input id="logoScale" type="range" min="0.05" max="0.35" step="0.01" value="0.18" /></label>
            </div>

            <div class="section-heading compact"><h2>Export details</h2><span>Everything stays local</span></div>
            <div class="advanced-export-row" aria-label="Advanced export formats">
              <button type="button" data-export="copy-svg">Copy SVG</button>
              <button type="button" data-export="png-transparent">Transparent PNG</button>
              <button type="button" data-export="png-white">White PNG</button>
              <button type="button" data-export="pdf-print">Print PDF</button>
              <button type="button" data-export="pdf-sticker">Sticker sheet PDF</button>
            </div>

            <div class="section-heading compact"><h2>Batch CSV</h2><span id="batchSummary">No CSV loaded</span></div>
            <div class="batch-grid">
              <label class="field field-wide"><span>CSV file</span><input id="csvUpload" type="file" accept=".csv,text/csv" /></label>
              <label class="field"><span>Content column</span><select id="csvContentColumn" disabled></select></label>
              <label class="field"><span>Filename column</span><select id="csvNameColumn" disabled></select></label>
              <label class="field"><span>ZIP format</span><select id="batchFormat"><option value="svg">SVG</option><option value="png">PNG</option><option value="png-transparent">Transparent PNG</option><option value="webp">WebP</option><option value="pdf">PDF</option></select></label>
              <button id="exportZip" type="button" disabled>Export ZIP</button>
            </div>
            <div id="batchPreview" class="batch-preview"></div>
          </div>
        </details>
      </section>

      <section class="tool-surface preview-zone" aria-label="QR preview">
        <div class="preview-header">
          <div>
            <h2>Live preview</h2>
            <p id="qrStats">Ready</p>
          </div>
          <div class="preview-badges">
            <div id="qrHealthBadge" class="health-badge health-good">Good</div>
            <div id="offlineStatus" class="status-pill">Offline ready</div>
          </div>
        </div>
        <div id="qrPreview" class="qr-preview"></div>
        <div id="warnings" class="warnings" aria-live="polite"></div>
        <label class="payload-output" for="payloadOutput"><span>Encoded payload</span><textarea id="payloadOutput" readonly rows="4"></textarea></label>
        <div class="export-row" aria-label="Export formats">
          <button type="button" data-export="svg">SVG</button>
          <button type="button" data-export="png">PNG</button>
          <button type="button" data-export="webp">WebP</button>
          <button type="button" data-export="pdf">PDF</button>
        </div>
      </section>
    </main>
    <footer class="site-footer">
      <div class="footer-privacy" aria-label="Privacy guarantees">
        <span>Generated locally</span>
        <span>No tracking</span>
        <span>No upload</span>
      </div>
      <a class="footer-beta" href="https://subtlesayak.github.io/SayaQR/beta/" target="_blank" rel="noreferrer">Beta</a>
      <p class="footer-credit">
        Built by <a href="https://subtlesayak.github.io/" target="_blank" rel="noreferrer">Subtle Sayak</a>.
        QR encoding by <a href="https://www.nayuki.io/page/qr-code-generator-library" target="_blank" rel="noreferrer">Nayuki's MIT-licensed QR Code generator</a>.
      </p>
    </footer>
  `;
}

function renderModeTabs(): void {
  const select = document.querySelector<HTMLSelectElement>("#modeSelect");
  const hint = document.querySelector<HTMLSpanElement>("#modeHint");
  if (!select || !hint) return;
  const options = QR_MODES.map(
    (mode) => `<option value="${mode.id}" ${mode.id === categorySelection ? "selected" : ""}>${mode.label}</option>`,
  ).join("");
  select.innerHTML = `<option value="${AUTO_CATEGORY_VALUE}" ${categorySelection === AUTO_CATEGORY_VALUE ? "selected" : ""}>Auto category</option>${options}`;
  select.value = categorySelection;
  hint.textContent =
    categorySelection === AUTO_CATEGORY_VALUE
      ? `Auto-detecting as ${QR_MODES.find((mode) => mode.id === currentMode)?.label ?? "Plain text"}`
      : QR_MODES.find((mode) => mode.id === currentMode)?.hint ?? "";
}
function renderPayloadFields(): void {
  const form = document.querySelector<HTMLFormElement>("#payloadForm");
  if (!form) return;
  form.innerHTML = MODE_FIELDS[currentMode].map(renderField).join("");
}
function setPayloadFields(fields: PayloadFields): void {
  document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("[data-payload-field]").forEach((input) => {
    const key = input.dataset.payloadField;
    if (!key || fields[key] === undefined) return;
    const value = fields[key];
    if (input instanceof HTMLInputElement && input.type === "checkbox") {
      input.checked = value === true || value === "true";
    } else {
      input.value = String(value ?? "");
    }
  });
}

function updateDetectionStatus(result?: DetectionResult): void {
  const status = document.querySelector<HTMLParagraphElement>("#autoDetectStatus");
  const input = document.querySelector<HTMLTextAreaElement>("#autoContent");
  if (!status || !input) return;
  const detection = result ?? detectQrContent(input.value);
  status.textContent = input.value.trim()
    ? `Looks like ${detection.label}. Confidence: ${detection.confidence}.`
    : "Paste content above, then auto-detect its category.";
}

function quickFieldsForMode(mode: QrMode, rawValue: string, detection: DetectionResult): PayloadFields {
  if (detection.mode === mode) return detection.fields;

  const fields: PayloadFields = { [QUICK_FIELD_BY_MODE[mode]]: rawValue.trim() };
  if (mode === "wifi") {
    fields.auth = "WPA";
    fields.hidden = false;
  }
  if (mode === "upi") fields.currency = "INR";
  return fields;
}

function applyDetectionResult(detection: DetectionResult): void {
  currentMode = detection.mode;
  renderModeTabs();
  renderPayloadFields();
  setPayloadFields(detection.fields);
  updateDetectionStatus(detection);
  updateQr();
}

function updateFromQuickContent(rawValue: string): void {
  const detection = detectQrContent(rawValue);
  if (categorySelection === AUTO_CATEGORY_VALUE) {
    applyDetectionResult(detection);
    return;
  }

  currentMode = categorySelection;
  renderModeTabs();
  renderPayloadFields();
  setPayloadFields(quickFieldsForMode(currentMode, rawValue, detection));
  updateDetectionStatus(detection);
  updateQr();
}

type ColorControlId = "mainColor" | "foreground" | "background";

function normalizeHexColor(value: string): string | null {
  const cleaned = value.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(cleaned)) {
    return `#${cleaned.split("").map((char) => char + char).join("")}`.toUpperCase();
  }
  if (/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(cleaned)) {
    return `#${cleaned}`.toUpperCase();
  }
  return null;
}

function colorPickerValue(color: string): string {
  return color.slice(0, 7);
}

function readColorControl(id: ColorControlId, fallback: string): string {
  const hexInput = document.querySelector<HTMLInputElement>(`#${id}Hex`);
  const picker = document.querySelector<HTMLInputElement>(`#${id}`);
  return normalizeHexColor(hexInput?.value ?? "") ?? picker?.value ?? fallback;
}

function syncColorControl(id: ColorControlId, source: "picker" | "hex"): boolean {
  const picker = document.querySelector<HTMLInputElement>(`#${id}`);
  const hexInput = document.querySelector<HTMLInputElement>(`#${id}Hex`);
  const swatch = document.querySelector<HTMLSpanElement>(`#${id}Swatch`);
  if (!picker || !hexInput || !swatch) return false;

  const normalized = source === "picker" ? normalizeHexColor(picker.value) : normalizeHexColor(hexInput.value);
  hexInput.setAttribute("aria-invalid", String(!normalized));
  if (!normalized) return false;

  picker.value = colorPickerValue(normalized);
  hexInput.value = normalized;
  swatch.style.setProperty("--swatch-color", normalized);
  return true;
}

function setColorControl(id: ColorControlId, value: string): void {
  const normalized = normalizeHexColor(value);
  if (!normalized) return;
  const picker = document.querySelector<HTMLInputElement>(`#${id}`);
  const hexInput = document.querySelector<HTMLInputElement>(`#${id}Hex`);
  if (picker) picker.value = colorPickerValue(normalized);
  if (hexInput) hexInput.value = normalized;
  syncColorControl(id, "hex");
}

function renderStyleControls(): void {
  const preset = getStylePreset(currentStylePresetId);
  const select = document.querySelector<HTMLSelectElement>("#stylePreset");
  const description = document.querySelector<HTMLParagraphElement>("#presetDescription");
  const controls = document.querySelector<HTMLDivElement>("#styleControls");
  if (select) select.value = preset.id;
  if (description) description.textContent = preset.description;
  if (controls) controls.innerHTML = renderStyleControlsMarkup();
}

function setStylePreset(id: string): void {
  const preset = getStylePreset(id);
  currentStylePresetId = preset.id;
  currentStyleParams = defaultStyleParams(preset.id);
  localStorage.setItem(STYLE_PREF_KEY, preset.id);
  renderStyleControls();
}

function updateStyleParam(input: HTMLInputElement | HTMLSelectElement): void {
  const key = input.dataset.styleParam;
  if (!key) return;
  const preset = getStylePreset(currentStylePresetId);
  const control = preset.controls.find((item) => item.id === key);
  if (!control) return;

  let value: StyleParamValue = input.value;
  if (input instanceof HTMLInputElement && input.type === "checkbox") value = input.checked;
  if (control.type === "range") value = Number(input.value);
  currentStyleParams = { ...currentStyleParams, [key]: value };

  const label = document.querySelector<HTMLElement>(`#style-param-${key}-value`);
  if (label) label.textContent = formatStyleParamValue(control, value);
}

function applyTemplate(templateId: TemplateId): void {
  const template = QR_TEMPLATES.find((item) => item.id === templateId);
  if (!template || !template.id) return;
  const quickInput = document.querySelector<HTMLTextAreaElement>("#autoContent");
  currentMode = template.mode;
  categorySelection = template.mode;
  renderModeTabs();
  renderPayloadFields();
  setPayloadFields(template.fields);
  if (quickInput) quickInput.value = template.quickContent ?? "";
  const status = document.querySelector<HTMLParagraphElement>("#autoDetectStatus");
  if (status) status.textContent = `${template.label} template applied. Edit details below if needed.`;
  updateQr();
}

function collectBrandColors(): string[] {
  const colors = [
    readColorControl("mainColor", DEFAULT_RENDER_OPTIONS.foreground),
    readColorControl("foreground", DEFAULT_RENDER_OPTIONS.foreground),
    readColorControl("background", DEFAULT_RENDER_OPTIONS.background),
  ];
  return Array.from(new Set(colors.map((color) => normalizeHexColor(color)).filter((color): color is string => Boolean(color)))).slice(0, 3);
}

function refreshBrandKitUi(message?: string): void {
  const colors = document.querySelector<HTMLDivElement>("#brandColors");
  const status = document.querySelector<HTMLSpanElement>("#brandKitStatus");
  if (colors) colors.innerHTML = renderBrandColorChips();
  if (status && message) status.textContent = message;
}

function saveCurrentBrandKit(): void {
  const ok = saveBrandKit({ colors: collectBrandColors(), stylePresetId: currentStylePresetId, logoDataUrl: logoDataUrl || undefined });
  refreshBrandKitUi(ok ? "Brand preset saved locally." : "Could not save brand preset in this browser.");
}

function useBrandPreset(): void {
  const brandKit = loadBrandKit();
  if (brandKit.colors[0]) setColorControl("mainColor", brandKit.colors[0]);
  if (brandKit.logoDataUrl) logoDataUrl = brandKit.logoDataUrl;
  setStylePreset(brandKit.stylePresetId);
  refreshBrandKitUi("Brand preset applied.");
  updateQr();
}
function updateCustomColorPanel(): void {
  const colorMode = document.querySelector<HTMLSelectElement>("#colorMode")?.value ?? "default";
  const panel = document.querySelector<HTMLDivElement>("#customColorPanel");
  if (panel) panel.hidden = colorMode !== "custom";
}
function collectPayloadFields(): PayloadFields {
  const fields: PayloadFields = {};
  document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("[data-payload-field]").forEach((input) => {
    const key = input.dataset.payloadField;
    if (!key) return;
    fields[key] = input instanceof HTMLInputElement && input.type === "checkbox" ? input.checked : input.value;
  });
  return fields;
}

function getRenderOptions(): QrRenderOptions {
  const mainColor = readColorControl("mainColor", DEFAULT_RENDER_OPTIONS.foreground);
  const useCustomColors = document.querySelector<HTMLSelectElement>("#colorMode")?.value === "custom";
  const foreground = useCustomColors ? readColorControl("foreground", mainColor) : mainColor;
  const background = useCustomColors ? readColorControl("background", DEFAULT_RENDER_OPTIONS.background) : DEFAULT_RENDER_OPTIONS.background;
  const transparentBackground = useCustomColors ? (document.querySelector<HTMLInputElement>("#transparentBackground")?.checked ?? false) : false;
  const margin = Number(document.querySelector<HTMLInputElement>("#margin")?.value ?? DEFAULT_RENDER_OPTIONS.margin);
  const moduleSize = Number(document.querySelector<HTMLInputElement>("#moduleSize")?.value ?? DEFAULT_RENDER_OPTIONS.moduleSize);
  const rounded = Number(document.querySelector<HTMLInputElement>("#rounded")?.value ?? DEFAULT_RENDER_OPTIONS.rounded);
  const finderStyle = (document.querySelector<HTMLSelectElement>("#finderStyle")?.value ?? DEFAULT_RENDER_OPTIONS.finderStyle) as FinderStyle;
  const ecc = (document.querySelector<HTMLSelectElement>("#ecc")?.value ?? DEFAULT_RENDER_OPTIONS.ecc) as QrRenderOptions["ecc"];
  const logoScale = Number(document.querySelector<HTMLInputElement>("#logoScale")?.value ?? DEFAULT_RENDER_OPTIONS.logoScale);

  return {
    foreground,
    background,
    transparentBackground,
    margin,
    moduleSize,
    rounded,
    finderStyle,
    logoDataUrl,
    logoScale,
    ecc,
    stylePresetId: currentStylePresetId,
    styleParams: currentStyleParams,
  };
}

function updateSliderLabels(): void {
  const margin = document.querySelector<HTMLInputElement>("#margin")?.value ?? "4";
  const moduleSize = document.querySelector<HTMLInputElement>("#moduleSize")?.value ?? "12";
  const rounded = Number(document.querySelector<HTMLInputElement>("#rounded")?.value ?? "0.12");
  const logoScale = Number(document.querySelector<HTMLInputElement>("#logoScale")?.value ?? "0.18");
  document.querySelector("#marginValue")!.textContent = margin;
  document.querySelector("#moduleSizeValue")!.textContent = moduleSize;
  document.querySelector("#roundedValue")!.textContent = `${Math.round(rounded * 100)}%`;
  document.querySelector("#logoSizeValue")!.textContent = `${Math.round(logoScale * 100)}%`;
}

function renderWarnings(options: QrRenderOptions, payloadLength: number, extra: string[] = []): void {
  const warnings = document.querySelector<HTMLDivElement>("#warnings");
  if (!warnings) return;
  const items = getScannabilityWarnings({
    foreground: options.foreground,
    background: options.background,
    transparentBackground: options.transparentBackground,
    margin: options.margin,
    logoScale: options.logoDataUrl ? options.logoScale : 0,
    payloadLength,
  });

  warnings.innerHTML = [...items.map((item) => ({ level: item.level, message: item.message })), ...extra.map((message) => ({ level: "danger", message }))]
    .map((item) => `<div class="warning ${item.level}">${escapeHtml(item.message)}</div>`)
    .join("");
}

function renderHealthBadge(options: QrRenderOptions, payloadLength: number): void {
  const badge = document.querySelector<HTMLDivElement>("#qrHealthBadge");
  if (!badge) return;
  const health = getQrHealthBadge({
    foreground: options.foreground,
    background: options.background,
    transparentBackground: options.transparentBackground,
    margin: options.margin,
    logoScale: options.logoDataUrl ? options.logoScale : 0,
    payloadLength,
  });
  badge.className = `health-badge health-${health.tone}`;
  badge.textContent = `${health.label}: ${health.message}`;
  badge.title = health.warnings.map((warning) => warning.message).join(" ") || health.message;
}
function updateMobilePreview(markup: string, statusText: string, state: "ready" | "empty" | "error"): void {
  const dock = document.querySelector<HTMLButtonElement>("#mobilePreviewDock");
  const preview = document.querySelector<HTMLSpanElement>("#mobileQrPreview");
  const status = document.querySelector<HTMLSpanElement>("#mobileQrStatus");
  if (!dock || !preview || !status) return;

  dock.dataset.state = state;
  preview.innerHTML = markup;
  status.textContent = statusText;
}

function updateQr(): void {
  updateSliderLabels();
  const preview = document.querySelector<HTMLDivElement>("#qrPreview");
  const stats = document.querySelector<HTMLParagraphElement>("#qrStats");
  const output = document.querySelector<HTMLTextAreaElement>("#payloadOutput");
  if (!preview || !stats || !output) return;

  const options = getRenderOptions();
  currentPayload = formatPayload(currentMode, collectPayloadFields());
  output.value = currentPayload;

  if (!currentPayload.trim()) {
    preview.innerHTML = `<div class="empty-state">Enter content to generate a QR code.</div>`;
    stats.textContent = "Waiting for content";
    currentSvg = "";
    updateMobilePreview(`<span class="mini-empty">QR</span>`, "Waiting for content", "empty");
    renderWarnings(options, 0);
    renderHealthBadge(options, 0);
    return;
  }

  try {
    const qr = createQrCode(currentPayload, options.ecc);
    currentSvg = buildSvgFromQr(qr, options);
    preview.innerHTML = currentSvg;
    stats.textContent = `Version ${qr.version} | ${qr.size} x ${qr.size} modules | ${currentPayload.length} chars`;
    updateMobilePreview(currentSvg, `${qr.size} x ${qr.size} modules | ${currentPayload.length} chars`, "ready");
    renderWarnings(options, currentPayload.length);
    renderHealthBadge(options, currentPayload.length);
  } catch (error) {
    currentSvg = "";
    preview.innerHTML = `<div class="empty-state error">This content is too long for a QR code.</div>`;
    stats.textContent = "Data too long";
    updateMobilePreview(`<span class="mini-empty">!</span>`, "Data too long", "error");
    renderWarnings(options, currentPayload.length, [error instanceof Error ? error.message : "QR generation failed"]);
    renderHealthBadge(options, currentPayload.length);
  }
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function buildCurrentSvgWith(overrides: Partial<QrRenderOptions> = {}): string {
  const options = { ...getRenderOptions(), ...overrides };
  return buildSvgFromQr(createQrCode(currentPayload, options.ecc), options);
}

async function exportCurrent(format: string): Promise<void> {
  if (!currentPayload.trim() || !currentSvg) return;
  const name = safeFileName(currentMode, "sayaqr");
  const options = getRenderOptions();

  if (format === "copy-svg") {
    try {
      await navigator.clipboard.writeText(currentSvg);
    } catch {
      downloadBlob(svgBlob(currentSvg), `${name}.svg`);
    }
    return;
  }

  if (format === "svg") downloadBlob(svgBlob(currentSvg), `${name}.svg`);
  if (format === "png") downloadBlob(await svgToRasterBlob(currentSvg, "image/png"), `${name}.png`);
  if (format === "png-transparent") downloadBlob(await svgToRasterBlob(buildCurrentSvgWith({ transparentBackground: true }), "image/png"), `${name}-transparent.png`);
  if (format === "png-white") downloadBlob(await svgToRasterBlob(buildCurrentSvgWith({ background: "#ffffff", transparentBackground: false }), "image/png"), `${name}-white.png`);
  if (format === "webp") downloadBlob(await svgToRasterBlob(currentSvg, "image/webp"), `${name}.webp`);
  if (format === "pdf") downloadBlob(qrPdfBlob(currentPayload, options), `${name}.pdf`);
  if (format === "pdf-print") downloadBlob(qrPdfBlob(currentPayload, { ...options, background: "#ffffff", transparentBackground: false }), `${name}-print.pdf`);
  if (format === "pdf-sticker") downloadBlob(qrStickerSheetPdfBlob(currentPayload, { ...options, background: "#ffffff", transparentBackground: false }), `${name}-stickers.pdf`);
}

function setMobileExportMenu(open: boolean): void {
  const toggle = document.querySelector<HTMLButtonElement>("#mobileExportToggle");
  const menu = document.querySelector<HTMLDivElement>("#mobileExportMenu");
  if (!toggle || !menu) return;
  menu.hidden = !open;
  toggle.setAttribute("aria-expanded", String(open));
}

function toggleMobileExportMenu(): void {
  const menu = document.querySelector<HTMLDivElement>("#mobileExportMenu");
  setMobileExportMenu(Boolean(menu?.hidden));
}

function populateBatchSelectors(data: CsvData): void {
  const content = document.querySelector<HTMLSelectElement>("#csvContentColumn");
  const names = document.querySelector<HTMLSelectElement>("#csvNameColumn");
  const summary = document.querySelector<HTMLSpanElement>("#batchSummary");
  const exportButton = document.querySelector<HTMLButtonElement>("#exportZip");
  const preview = document.querySelector<HTMLDivElement>("#batchPreview");
  if (!content || !names || !summary || !exportButton || !preview) return;

  const options = data.headers.map((header) => `<option value="${escapeHtml(header)}">${escapeHtml(header)}</option>`).join("");
  content.innerHTML = options;
  names.innerHTML = `<option value="">Sequential filenames</option>${options}`;
  content.disabled = data.headers.length === 0;
  names.disabled = data.headers.length === 0;
  exportButton.disabled = data.rows.length === 0;
  summary.textContent = `${data.rows.length} rows loaded`;
  preview.innerHTML = data.rows
    .slice(0, 4)
    .map((row, index) => `<span>${index + 1}. ${escapeHtml(String(Object.values(row)[0] ?? ""))}</span>`)
    .join("");
}

async function exportBatchZip(): Promise<void> {
  if (!batchData) return;
  const contentColumn = document.querySelector<HTMLSelectElement>("#csvContentColumn")?.value;
  const nameColumn = document.querySelector<HTMLSelectElement>("#csvNameColumn")?.value;
  const format = document.querySelector<HTMLSelectElement>("#batchFormat")?.value ?? "svg";
  const button = document.querySelector<HTMLButtonElement>("#exportZip");
  if (!contentColumn || !button) return;

  button.disabled = true;
  button.textContent = "Generating...";
  const options = getRenderOptions();
  const files: ZipInputFile[] = [];
  const extension = format === "png-transparent" ? "png" : format;

  try {
    for (let index = 0; index < batchData.rows.length; index++) {
      const row = batchData.rows[index];
      const payload = row[contentColumn]?.trim() ?? "";
      if (!payload) continue;
      const baseName = safeFileName(nameColumn ? row[nameColumn] ?? "" : "", `qr-${index + 1}`);
      const exportOptions = format === "png-transparent" ? { ...options, transparentBackground: true } : options;
      if (format === "svg") {
        files.push({ name: `${baseName}.svg`, data: buildSvgFromQr(createQrCode(payload, options.ecc), options) });
      } else if (format === "pdf") {
        files.push({ name: `${baseName}.pdf`, data: qrPdfBlob(payload, options) });
      } else {
        const svg = buildSvgFromQr(createQrCode(payload, exportOptions.ecc), exportOptions);
        const mime = format === "webp" ? "image/webp" : "image/png";
        files.push({ name: `${baseName}.${extension}`, data: await svgToRasterBlob(svg, mime) });
      }
    }

    const { createZip } = await import("./lib/zip");
    downloadBlob(await createZip(files), "sayaqr-batch.zip");
  } finally {
    button.disabled = false;
    button.textContent = "Export ZIP";
  }
}

function wireEvents(): void {
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    if (target.closest("#mobileExportToggle")) {
      toggleMobileExportMenu();
      return;
    }

    const brandColorButton = target.closest<HTMLElement>("[data-brand-color]");
    const brandColor = brandColorButton?.dataset.brandColor;
    if (brandColor) {
      setColorControl("mainColor", brandColor);
      updateQr();
      return;
    }

    if (target.closest("#saveBrandKit")) {
      saveCurrentBrandKit();
      return;
    }

    if (target.closest("#useBrandPreset")) {
      useBrandPreset();
      return;
    }
    const exportButton = target.closest<HTMLElement>("[data-export]");
    const exportFormat = exportButton?.dataset.export;
    if (exportFormat) {
      setMobileExportMenu(false);
      void exportCurrent(exportFormat);
      return;
    }

    if (!target.closest(".mobile-export")) setMobileExportMenu(false);

    if (target.closest("#mobilePreviewDock")) {
      document.querySelector("#qrPreview")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });

  document.addEventListener("input", (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
      if (target.id === "autoContent") {
        updateFromQuickContent(target.value);
        return;
      }


      if (target.dataset.styleParam && (target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
        updateStyleParam(target);
        updateQr();
        return;
      }
      if (target.id === "colorMode") {
        updateCustomColorPanel();
        updateQr();
        return;
      }

      if (target.id === "mainColor" || target.id === "foreground" || target.id === "background") {
        syncColorControl(target.id as ColorControlId, "picker");
        updateQr();
        return;
      }

      if (target.id === "mainColorHex" || target.id === "foregroundHex" || target.id === "backgroundHex") {
        if (syncColorControl(target.id.replace("Hex", "") as ColorControlId, "hex")) updateQr();
        return;
      }
      if (target.id !== "csvUpload" && target.id !== "logoUpload") updateQr();
    }
  });

  document.querySelector<HTMLInputElement>("#logoUpload")?.addEventListener("change", (event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      logoDataUrl = "";
      updateQr();
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      logoDataUrl = String(reader.result ?? "");
      updateQr();
    };
    reader.readAsDataURL(file);
  });

  document.querySelector<HTMLInputElement>("#csvUpload")?.addEventListener("change", async (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    batchData = parseCsv(await file.text());
    populateBatchSelectors(batchData);
  });
  document.querySelector<HTMLSelectElement>("#stylePreset")?.addEventListener("change", (event) => {
    setStylePreset((event.target as HTMLSelectElement).value);
    updateQr();
  });

  document.querySelector<HTMLSelectElement>("#templateSelect")?.addEventListener("change", (event) => {
    applyTemplate((event.target as HTMLSelectElement).value as TemplateId);
  });

  document.querySelector<HTMLSelectElement>("#modeSelect")?.addEventListener("change", (event) => {
    categorySelection = (event.target as HTMLSelectElement).value as CategorySelection;
    const quickValue = document.querySelector<HTMLTextAreaElement>("#autoContent")?.value ?? "";
    if (quickValue.trim()) {
      updateFromQuickContent(quickValue);
      return;
    }
    if (categorySelection !== AUTO_CATEGORY_VALUE) currentMode = categorySelection;
    renderModeTabs();
    renderPayloadFields();
    updateQr();
  });
  document.querySelector<HTMLButtonElement>("#exportZip")?.addEventListener("click", () => void exportBatchZip());
}

function registerServiceWorker(): void {
  const status = document.querySelector<HTMLDivElement>("#offlineStatus");
  if (!("serviceWorker" in navigator)) {
    if (status) status.textContent = "Offline unavailable";
    return;
  }

  const hadController = Boolean(navigator.serviceWorker.controller);
  let refreshedForUpdate = false;
  if (hadController) {
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshedForUpdate) return;
      refreshedForUpdate = true;
      window.location.reload();
    });
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then((registration) => {
        if (status) status.textContent = "Offline ready";
        void registration.update();
      })
      .catch(() => {
        if (status) status.textContent = "Offline pending";
      });
  });
}

renderApp();
renderModeTabs();
renderPayloadFields();
wireEvents();
syncColorControl("mainColor", "hex");
renderStyleControls();
refreshBrandKitUi();
updateCustomColorPanel();
updateQr();
registerServiceWorker();
