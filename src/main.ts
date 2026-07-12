import "./style.css";
import { detectQrContent, type DetectionResult } from "./lib/autodetect";
import { suggestExportName } from "./lib/export-name";
import { buildIntentPreview, type IntentPreview } from "./lib/intent-preview";
import { parseCsv, parseTextList, safeFileName, type CsvData } from "./lib/csv";
import { formatPayload, QR_MODES, type PayloadFields, type QrMode } from "./lib/payloads";
import { createQrCode } from "./lib/qr";
import { getScannabilityWarnings } from "./lib/scannability";
import { detectLogoPresetFromText, getLogoMismatchWarning, getLogoPreset, LOGO_PRESETS, logoPresetToDataUrl, type LogoPresetId } from "./lib/logo-presets";
import {
  buildSvgFromQr,
  DEFAULT_RENDER_OPTIONS,
  qrPdfBlob,
  svgBlob,
  svgToRasterBlob,
  type FinderStyle,
  type QrRenderOptions,
} from "./lib/render";
import { createZip, type ZipInputFile } from "./lib/zip";

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
const APP_VERSION = "1.9";
type CategorySelection = QrMode | typeof AUTO_CATEGORY_VALUE;

const DEFAULT_QUICK_CONTENT_PLACEHOLDER = "Paste a URL, Wi-Fi string, email, phone, vCard, UPI ID, event, or coordinates";
const QUICK_CONTENT_PLACEHOLDERS: Record<QrMode, string> = {
  text: "Type plain text, notes, serial numbers, or any short message",
  url: "example.com/path or https://example.com/path",
  wifi: "WIFI:T:WPA;S:Network name;P:password;; or just the network name",
  email: "name@example.com or mailto:name@example.com?subject=Hello",
  sms: "+15551234567 or SMSTO:+15551234567:Message",
  phone: "+15551234567 or tel:+15551234567",
  vcard: "Paste a vCard or start with a contact name",
  upi: "name@bank or upi://pay?pa=name@bank&pn=Name&am=250",
  event: "Meeting title or BEGIN:VEVENT calendar text",
  geo: "28.6139,77.2090 or a full Google/Apple Maps link with coordinates",
};

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
const MODE_FIELDS: Record<QrMode, FieldConfig[]> = {
  text: [{ name: "text", label: "Text", type: "textarea", rows: 6 }],
  url: [{ name: "url", label: "URL", type: "url", placeholder: "example.com" }],
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

let currentMode: QrMode = "text";
let categorySelection: CategorySelection = AUTO_CATEGORY_VALUE;
let logoDataUrl = "";
let logoSelection: LogoPresetId | "custom" | "none" = "none";
let logoAutoApplied = false;
let logoAutoSuppressedFor = "";
let currentPayload = "";
let currentSvg = "";
let batchData: CsvData | null = null;
let pendingQrFrame = 0;

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

function renderLogoPresetOptions(): string {
  const presetOptions = LOGO_PRESETS.map((preset) => {
    const selected = preset.id === logoSelection ? "selected" : "";
    return "<option value=\"" + escapeHtml(preset.id) + "\" " + selected + ">" + escapeHtml(preset.name) + "</option>";
  }).join("");
  const customOption = logoSelection === "custom" ? "<option value=\"custom\" selected>Custom upload</option>" : "";
  return "<option value=\"none\" " + (logoSelection === "none" ? "selected" : "") + ">None</option>" + presetOptions + customOption;
}

function renderSelectedLogoPreview(): string {
  if (logoSelection === "custom") return "<span class=\"logo-empty-mark\">Custom</span>";
  if (logoSelection === "none") return "<span class=\"logo-empty-mark\">None</span>";
  return getLogoPreset(logoSelection)?.svg ?? "<span class=\"logo-empty-mark\">None</span>";
}

function renderApp(): void {
  appRoot.innerHTML = `
    <header class="topbar">
      <div class="topbar-info">
        <div class="brand">
          <div>
            <h1>SayaQR</h1>
            <p>Offline QR generator</p>
          </div>
        </div>
      </div>
      <div class="mobile-preview-group">
        <button id="mobilePreviewDock" class="mobile-preview-dock" type="button" aria-label="Open QR preview">
          <span id="mobileQrPreview" class="mobile-qr-preview" aria-hidden="true"></span>
          <span class="mobile-preview-copy">
            <strong>Live preview</strong>
            <span id="mobileQrStatus">Waiting for content</span>
          </span>
        </button>
        <div class="mobile-export">
          <button id="mobileExportToggle" class="mobile-export-toggle" type="button" aria-label="Download QR code" aria-haspopup="true" aria-expanded="false" disabled><svg class="download-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v11m0 0 4-4m-4 4-4-4M5 19h14"/></svg><span>Download</span></button>
          <div id="mobileExportMenu" class="mobile-export-menu" role="menu" hidden>
            <button type="button" data-export="png" role="menuitem" disabled>PNG</button>
            <button type="button" data-export="svg" role="menuitem" disabled>SVG</button>
            <button type="button" data-export="webp" role="menuitem" disabled>WebP</button>
            <button type="button" data-export="pdf" role="menuitem" disabled>PDF</button>
          </div>
        </div>
      </div>
    </header>
    <main class="workspace">
      <section class="tool-surface controls" aria-label="QR controls">
        <div class="section-heading">
          <h2>Create QR</h2>
          <span id="modeHint"></span>
        </div>
        <label class="field field-wide quick-content" for="autoContent"><span>Quick content</span><textarea id="autoContent" rows="3" placeholder="${escapeHtml(DEFAULT_QUICK_CONTENT_PLACEHOLDER)}"></textarea></label>
        <p id="autoDetectStatus" class="detect-status" aria-live="polite">Paste content above, then auto-detect its category.</p>

        <details class="disclosure" id="editDetails">
          <summary>Edit details</summary>
          <div class="disclosure-body">
            <div class="category-row">
              <label class="field category-select" for="modeSelect"><span>Category</span><select id="modeSelect" aria-label="QR category"></select></label>
            </div>
            <form id="payloadForm" class="payload-grid"></form>
          </div>
        </details>

        <details class="disclosure" id="customizeDetails">
          <summary>Customize</summary>
          <div class="disclosure-body design-grid">
            <label class="field color-mode-field" for="colorMode"><span>Color</span><select id="colorMode"><option value="default" selected>Default</option><option value="logo">Logo</option><option value="custom">Custom</option></select></label>
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
            <div class="field field-wide logo-picker">
              <div class="logo-picker-header"><span>Center logo</span></div>
              <div class="logo-select-row">
                <span id="logoPresetPreview" class="logo-preset-preview" aria-hidden="true">${renderSelectedLogoPreview()}</span>
                <label class="field logo-select-field" for="logoPresetSelect"><span>Logo preset</span><select id="logoPresetSelect" aria-label="Logo preset">${renderLogoPresetOptions()}</select></label>
              </div>
              <p class="logo-source-note">SVG marks stay local. Brand trademarks belong to their owners.</p>
              <label class="logo-upload-field"><span>Upload custom</span><input id="logoUpload" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" /></label>
            </div>
            <label class="field"><span>Logo size <strong id="logoSizeValue">18%</strong></span><input id="logoScale" type="range" min="0.05" max="0.35" step="0.01" value="0.18" /></label>
          </div>
        </details>
      </section>

      <section class="tool-surface preview-zone" aria-label="QR preview">
        <div class="preview-header">
          <div>
            <h2>Preview</h2>
            <p id="qrStats">Waiting for content</p>
          </div>
          <div id="offlineStatus" class="status-pill">Offline ready</div>
        </div>
        <div id="qrPreview" class="qr-preview"></div>
        <section id="intentPreview" class="intent-preview is-empty" aria-live="polite">
          <span class="intent-badge">Ready</span>
          <h3>Your QR intent will appear here</h3>
        </section>
        <section id="scanChecks" class="scan-checks" data-state="empty">
          <div class="scan-checks-heading">
            <h3>Scan checks</h3>
            <span id="scanCheckStatus">Waiting for content</span>
          </div>
          <div id="warnings" class="warnings" aria-live="polite"></div>
        </section>
        <div class="export-actions" aria-label="Export QR code">
          <button class="primary-export" type="button" data-export="png" disabled><svg class="download-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v11m0 0 4-4m-4 4-4-4M5 19h14"/></svg><span>Download PNG</span></button>
          <details class="more-formats">
            <summary>More formats</summary>
            <div class="more-format-list">
              <button type="button" data-export="svg" disabled>SVG</button>
              <button type="button" data-export="webp" disabled>WebP</button>
              <button type="button" data-export="pdf" disabled>PDF</button>
            </div>
          </details>
        </div>
        <p id="exportStatus" class="export-status" aria-live="polite"></p>
        <details class="technical-payload">
          <summary>Technical payload</summary>
          <label class="payload-output" for="payloadOutput"><span>Encoded payload</span><textarea id="payloadOutput" readonly rows="4"></textarea></label>
        </details>
      </section>

      <details class="tool-surface batch-zone disclosure batch-disclosure" aria-label="Batch mode">
        <summary><span>Batch generate</span><span id="batchSummary">No file loaded</span></summary>
        <div class="disclosure-body">
          <div class="batch-grid">
            <label class="field field-wide"><span>CSV or TXT file</span><input id="csvUpload" type="file" accept=".csv,.txt,text/csv,text/plain" /></label>
            <label class="field"><span>Content column</span><select id="csvContentColumn" disabled></select></label>
            <label class="field"><span>Filename column</span><select id="csvNameColumn" disabled></select></label>
            <label class="field"><span>ZIP format</span><select id="batchFormat"><option value="svg">SVG</option><option value="png">PNG</option><option value="webp">WebP</option><option value="pdf">PDF</option></select></label>
            <button id="exportZip" type="button" disabled>Export ZIP</button>
          </div>
          <div id="batchPreview" class="batch-preview"></div>
        </div>
      </details>
    </main>
    <footer class="site-footer">
      <div class="footer-privacy" aria-label="Privacy guarantees">
        <span>Generated locally</span>
        <span>No tracking</span>
        <span>No upload</span>
      </div>
      <p class="footer-credit">
        Built by <a href="https://subtlesayak.github.io/" target="_blank" rel="noreferrer">Subtle Sayak</a>. <a href="https://github.com/subtlesayak/SayaQR" target="_blank" rel="noreferrer">GitHub</a>.
        QR encoding by <a href="https://www.nayuki.io/page/qr-code-generator-library" target="_blank" rel="noreferrer">Nayuki's MIT-licensed QR Code generator</a>.
      </p>
      <p class="footer-version">SayaQR v${APP_VERSION}</p>
    </footer>
  `;
}

function quickContentPlaceholder(): string {
  return categorySelection === AUTO_CATEGORY_VALUE ? DEFAULT_QUICK_CONTENT_PLACEHOLDER : QUICK_CONTENT_PLACEHOLDERS[categorySelection];
}

function updateQuickContentPlaceholder(): void {
  const input = document.querySelector<HTMLTextAreaElement>("#autoContent");
  if (input) input.placeholder = quickContentPlaceholder();
}

function renderModeTabs(): void {
  const select = document.querySelector<HTMLSelectElement>("#modeSelect");
  if (!select) return;
  const options = QR_MODES.map(
    (mode) => `<option value="${mode.id}" ${mode.id === categorySelection ? "selected" : ""}>${escapeHtml(mode.label)}</option>`,
  ).join("");
  select.innerHTML = `<option value="${AUTO_CATEGORY_VALUE}" ${categorySelection === AUTO_CATEGORY_VALUE ? "selected" : ""}>Auto category</option>${options}`;
  select.value = categorySelection;
  updateModeHint();
  updateQuickContentPlaceholder();
}

function updateModeHint(): void {
  const hint = document.querySelector<HTMLSpanElement>("#modeHint");
  if (!hint) return;
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

function syncPayloadMode(mode: QrMode): void {
  const modeChanged = currentMode !== mode;
  currentMode = mode;
  if (modeChanged) {
    renderModeTabs();
    renderPayloadFields();
    return;
  }
  updateModeHint();
  updateQuickContentPlaceholder();
}

function setPayloadFields(fields: PayloadFields, clearMissing = false): void {
  document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("[data-payload-field]").forEach((input) => {
    const key = input.dataset.payloadField;
    if (!key) return;
    if (fields[key] === undefined) {
      if (!clearMissing) return;
      if (input instanceof HTMLInputElement && input.type === "checkbox") {
        input.checked = false;
      } else {
        input.value = "";
      }
      return;
    }
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
  if (categorySelection === "geo" && detection.mode === "url") {
    const isShortMapLink = /^(https?:\/\/)?(maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(input.value.trim());
    status.textContent = isShortMapLink
      ? "Short map links cannot be resolved offline. Paste a full link with coordinates or use URL."
      : "Geo needs coordinates or a searchable place label. Use URL for web links.";
    return;
  }
  status.textContent = input.value.trim()
    ? `Looks like ${detection.label}. Confidence: ${detection.confidence}.`
    : "Paste content above, then auto-detect its category.";
}

function quickFieldsForMode(mode: QrMode, rawValue: string, detection: DetectionResult): PayloadFields {
  if (detection.mode === mode) return detection.fields;

  if (mode === "geo" && detection.mode === "url") {
    return {};
  }

  const fields: PayloadFields = { [QUICK_FIELD_BY_MODE[mode]]: rawValue.trim() };
  if (mode === "wifi") {
    fields.auth = "WPA";
    fields.hidden = false;
  }
  if (mode === "upi") fields.currency = "INR";
  return fields;
}

function applyDetectionResult(detection: DetectionResult): void {
  syncPayloadMode(detection.mode);
  setPayloadFields(detection.fields, true);
  updateDetectionStatus(detection);
  scheduleQrUpdate();
}

function updateFromQuickContent(rawValue: string): void {
  syncLogoFromQuickContent(rawValue);
  const detection = detectQrContent(rawValue);
  if (categorySelection === AUTO_CATEGORY_VALUE) {
    applyDetectionResult(detection);
    return;
  }

  syncPayloadMode(categorySelection);
  setPayloadFields(quickFieldsForMode(currentMode, rawValue, detection), true);
  updateDetectionStatus(detection);
  scheduleQrUpdate();
}

type ColorControlId = "foreground" | "background";

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

function updateCustomColorPanel(): void {
  const colorMode = document.querySelector<HTMLSelectElement>("#colorMode")?.value ?? "default";
  const panel = document.querySelector<HTMLDivElement>("#customColorPanel");
  if (panel) panel.hidden = colorMode !== "custom";
}

function updateLogoPresetState(): void {
  const select = document.querySelector<HTMLSelectElement>("#logoPresetSelect");
  if (select) select.innerHTML = renderLogoPresetOptions();
  const preview = document.querySelector<HTMLSpanElement>("#logoPresetPreview");
  if (preview) preview.innerHTML = renderSelectedLogoPreview();
}

function applyLogoPreset(presetId: LogoPresetId, auto: boolean): void {
  const preset = getLogoPreset(presetId);
  if (!preset) return;
  logoDataUrl = logoPresetToDataUrl(preset);
  logoSelection = preset.id;
  logoAutoApplied = auto;
  if (!auto) logoAutoSuppressedFor = "";
  const upload = document.querySelector<HTMLInputElement>("#logoUpload");
  if (upload) upload.value = "";
  updateLogoPresetState();
}

function clearCenterLogo(suppressAuto = false): void {
  logoDataUrl = "";
  logoSelection = "none";
  logoAutoApplied = false;
  logoAutoSuppressedFor = suppressAuto ? (document.querySelector<HTMLTextAreaElement>("#autoContent")?.value.trim() ?? "") : "";
  const upload = document.querySelector<HTMLInputElement>("#logoUpload");
  if (upload) upload.value = "";
  updateLogoPresetState();
  scheduleQrUpdate();
}

function syncLogoFromQuickContent(rawValue: string): void {
  const value = rawValue.trim();
  if (logoSelection === "custom" || (!logoAutoApplied && logoSelection !== "none")) return;
  if (logoAutoSuppressedFor && value === logoAutoSuppressedFor) return;
  if (logoAutoSuppressedFor && value !== logoAutoSuppressedFor) logoAutoSuppressedFor = "";

  const preset = detectLogoPresetFromText(value);
  if (preset) {
    applyLogoPreset(preset.id, true);
    return;
  }

  if (logoAutoApplied) clearCenterLogo(false);
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
  const colorMode = document.querySelector<HTMLSelectElement>("#colorMode")?.value ?? "default";
  const useCustomColors = colorMode === "custom";
  const logoColor = logoSelection !== "none" && logoSelection !== "custom" ? getLogoPreset(logoSelection)?.color : undefined;
  const foreground = useCustomColors
    ? readColorControl("foreground", DEFAULT_RENDER_OPTIONS.foreground)
    : colorMode === "logo"
      ? logoColor ?? DEFAULT_RENDER_OPTIONS.foreground
      : DEFAULT_RENDER_OPTIONS.foreground;
  const background = useCustomColors ? readColorControl("background", DEFAULT_RENDER_OPTIONS.background) : DEFAULT_RENDER_OPTIONS.background;
  const transparentBackground = useCustomColors ? (document.querySelector<HTMLInputElement>("#transparentBackground")?.checked ?? false) : false;
  const margin = Number(document.querySelector<HTMLInputElement>("#margin")?.value ?? DEFAULT_RENDER_OPTIONS.margin);
  const moduleSize = Number(document.querySelector<HTMLInputElement>("#moduleSize")?.value ?? DEFAULT_RENDER_OPTIONS.moduleSize);
  const rounded = Number(document.querySelector<HTMLInputElement>("#rounded")?.value ?? DEFAULT_RENDER_OPTIONS.rounded);
  const finderStyle = (document.querySelector<HTMLSelectElement>("#finderStyle")?.value ?? DEFAULT_RENDER_OPTIONS.finderStyle) as FinderStyle;
  const ecc = (document.querySelector<HTMLSelectElement>("#ecc")?.value ?? DEFAULT_RENDER_OPTIONS.ecc) as QrRenderOptions["ecc"];
  const logoScale = Number(document.querySelector<HTMLInputElement>("#logoScale")?.value ?? DEFAULT_RENDER_OPTIONS.logoScale);

  return { foreground, background, transparentBackground, margin, moduleSize, rounded, finderStyle, logoDataUrl, logoScale, ecc };
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

function renderIntentPreview(preview: IntentPreview, payload: string): void {
  const container = document.querySelector<HTMLElement>("#intentPreview");
  if (!container) return;

  if (!payload.trim()) {
    container.classList.add("is-empty");
    container.innerHTML = "<span class=\"intent-badge\">Ready</span><h3>Your QR intent will appear here</h3>";
    return;
  }

  container.classList.remove("is-empty");
  const details = preview.details.length
    ? "<ul class=\"intent-details\">" + preview.details.map((item) => "<li>" + escapeHtml(item) + "</li>").join("") + "</ul>"
    : "";
  const warnings = preview.warnings.length
    ? "<ul class=\"intent-warnings\">" + preview.warnings.map((item) => "<li><strong>Check:</strong> " + escapeHtml(item) + "</li>").join("") + "</ul>"
    : "";

  container.innerHTML =
    "<span class=\"intent-badge\">" + escapeHtml(preview.badge) + "</span>" +
    "<h3>" + escapeHtml(preview.title) + "</h3>" +
    details +
    warnings;
}

function renderWarnings(options: QrRenderOptions, payloadLength: number, extra: string[] = []): void {
  const warnings = document.querySelector<HTMLDivElement>("#warnings");
  const status = document.querySelector<HTMLSpanElement>("#scanCheckStatus");
  const section = document.querySelector<HTMLElement>("#scanChecks");
  if (!warnings || !status || !section) return;
  const items = getScannabilityWarnings({
    foreground: options.foreground,
    background: options.background,
    transparentBackground: options.transparentBackground,
    margin: options.margin,
    logoScale: options.logoDataUrl ? options.logoScale : 0,
    payloadLength,
  });

  const renderedItems = items.map((item) => ({ level: item.level, message: item.message }));
  const logoWarning = getLogoMismatchWarning(logoSelection, currentPayload);
  if (logoWarning) renderedItems.push({ level: "warning", message: logoWarning });
  for (const message of extra) renderedItems.push({ level: "danger", message });

  section.dataset.state = !currentPayload.trim() ? "empty" : renderedItems.length ? "issues" : "clear";
  status.textContent = !currentPayload.trim()
    ? "Waiting for content"
    : renderedItems.length
      ? renderedItems.length + (renderedItems.length === 1 ? " issue" : " issues")
      : "No issues found";
  warnings.innerHTML = renderedItems
    .map((item) => "<div class=\"warning " + item.level + "\"><strong>" + (item.level === "danger" ? "Error:" : item.level === "warning" ? "Warning:" : "Note:") + "</strong> " + escapeHtml(item.message) + "</div>")
    .join("");
}

function updateExportAvailability(available: boolean): void {
  document.querySelectorAll<HTMLButtonElement>("[data-export]").forEach((button) => {
    button.disabled = !available;
  });
  const mobileToggle = document.querySelector<HTMLButtonElement>("#mobileExportToggle");
  if (mobileToggle) mobileToggle.disabled = !available;
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
  const exportStatus = document.querySelector<HTMLParagraphElement>("#exportStatus");
  if (!preview || !stats || !output) return;

  const options = getRenderOptions();
  const fields = collectPayloadFields();
  currentPayload = formatPayload(currentMode, fields);
  output.value = currentPayload;
  renderIntentPreview(buildIntentPreview(currentMode, fields, currentPayload), currentPayload);
  if (exportStatus) exportStatus.textContent = "";

  if (!currentPayload.trim()) {
    preview.innerHTML = "<div class=\"empty-state\">Enter content to generate a QR code.</div>";
    stats.textContent = "Waiting for content";
    currentSvg = "";
    updateMobilePreview("<span class=\"mini-empty\">QR</span>", "Waiting for content", "empty");
    updateExportAvailability(false);
    renderWarnings(options, 0);
    return;
  }

  try {
    const qr = createQrCode(currentPayload, options.ecc);
    currentSvg = buildSvgFromQr(qr, options);
    preview.innerHTML = currentSvg;
    stats.textContent = "Version " + qr.version + " | " + qr.size + " x " + qr.size + " modules | " + currentPayload.length + " chars";
    updateMobilePreview(currentSvg, qr.size + " x " + qr.size + " modules | " + currentPayload.length + " chars", "ready");
    updateExportAvailability(true);
    renderWarnings(options, currentPayload.length);
  } catch (error) {
    currentSvg = "";
    preview.innerHTML = "<div class=\"empty-state error\">This content is too long for a QR code.</div>";
    stats.textContent = "Data too long";
    updateMobilePreview("<span class=\"mini-empty\">!</span>", "Data too long", "error");
    updateExportAvailability(false);
    renderWarnings(options, currentPayload.length, [error instanceof Error ? error.message : "QR generation failed"]);
  }
}

function scheduleQrUpdate(): void {
  if (pendingQrFrame) return;
  pendingQrFrame = window.requestAnimationFrame(() => {
    pendingQrFrame = 0;
    updateQr();
  });
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

async function exportCurrent(format: string): Promise<void> {
  const status = document.querySelector<HTMLParagraphElement>("#exportStatus");
  if (!currentPayload.trim() || !currentSvg) {
    if (status) status.textContent = "Enter content before downloading.";
    return;
  }

  const name = suggestExportName(currentMode, collectPayloadFields());
  const filename = name + "." + format;
  if (status) status.textContent = "Preparing " + format.toUpperCase() + "...";

  try {
    if (format === "svg") downloadBlob(svgBlob(currentSvg), filename);
    if (format === "png") downloadBlob(await svgToRasterBlob(currentSvg, "image/png"), filename);
    if (format === "webp") downloadBlob(await svgToRasterBlob(currentSvg, "image/webp"), filename);
    if (format === "pdf") downloadBlob(qrPdfBlob(currentPayload, getRenderOptions()), filename);
    if (status) status.textContent = "Downloaded " + filename + ".";
  } catch {
    if (status) status.textContent = "Export failed. Try another format.";
  }
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
  const extension = format === "jpeg" ? "jpg" : format;

  try {
    for (let index = 0; index < batchData.rows.length; index++) {
      const row = batchData.rows[index];
      const payload = row[contentColumn]?.trim() ?? "";
      if (!payload) continue;
      const baseName = safeFileName(nameColumn ? row[nameColumn] ?? "" : "", `qr-${index + 1}`);
      if (format === "svg") {
        files.push({ name: `${baseName}.svg`, data: buildSvgFromQr(createQrCode(payload, options.ecc), options) });
      } else if (format === "pdf") {
        files.push({ name: `${baseName}.pdf`, data: qrPdfBlob(payload, options) });
      } else {
        const svg = buildSvgFromQr(createQrCode(payload, options.ecc), options);
        const mime = format === "webp" ? "image/webp" : "image/png";
        files.push({ name: `${baseName}.${extension}`, data: await svgToRasterBlob(svg, mime) });
      }
    }

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

      if (target.id === "colorMode") {
        updateCustomColorPanel();
        scheduleQrUpdate();
        return;
      }

      if (target.id === "foreground" || target.id === "background") {
        syncColorControl(target.id, "picker");
        scheduleQrUpdate();
        return;
      }

      if (target.id === "foregroundHex" || target.id === "backgroundHex") {
        if (syncColorControl(target.id.replace("Hex", "") as ColorControlId, "hex")) scheduleQrUpdate();
        return;
      }

      const payloadField = target.getAttribute("data-payload-field");
      if (payloadField === "url" || payloadField === "website" || payloadField === "payeeAddress") {
        syncLogoFromQuickContent(target.value);
      }

      if (target.id !== "csvUpload" && target.id !== "logoUpload") scheduleQrUpdate();
    }
  });

  document.querySelector<HTMLSelectElement>("#logoPresetSelect")?.addEventListener("change", (event) => {
    const value = (event.target as HTMLSelectElement).value;
    if (value === "none") {
      clearCenterLogo(true);
      return;
    }
    const preset = getLogoPreset(value);
    if (preset) {
      applyLogoPreset(preset.id, false);
      scheduleQrUpdate();
    }
  });

  document.querySelector<HTMLInputElement>("#logoUpload")?.addEventListener("change", (event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      clearCenterLogo(true);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      logoDataUrl = String(reader.result ?? "");
      logoSelection = "custom";
      logoAutoApplied = false;
      logoAutoSuppressedFor = "";
      updateLogoPresetState();
      scheduleQrUpdate();
    };
    reader.readAsDataURL(file);
  });

  document.querySelector<HTMLInputElement>("#csvUpload")?.addEventListener("change", async (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const text = await file.text();
    const isTextList = file.name.toLowerCase().endsWith(".txt") || file.type === "text/plain";
    batchData = isTextList ? parseTextList(text) : parseCsv(text);
    populateBatchSelectors(batchData);
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
    scheduleQrUpdate();
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
updateCustomColorPanel();
updateQr();
registerServiceWorker();



