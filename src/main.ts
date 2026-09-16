import "./style.css";
import { detectQrContent, type DetectionResult } from "./lib/autodetect";
import { buildIntentPreview, type IntentPreview } from "./lib/intent-preview";
import { decodeQrImageFile, rasterizeImageFileToPng } from "./lib/qr-decoder";
import {
  calculateAutoFixValues,
  chooseAutoFixErrorCorrection,
  LatestScanRun,
  testQrSvg,
  type ScanConfidenceResult,
} from "./lib/scan-confidence";
import { parseCsv, parseTextList, type CsvData } from "./lib/csv";
import { isCompleteHexColorEntry } from "./lib/color-input";
import {
  BatchCancellationController,
  buildBatchReportCsv,
  suggestContentColumn,
  suggestFilenameColumn,
  validateBatchRows,
  type BatchValidationResult,
  type BatchValidationRow,
} from "./lib/batch";
import {
  clearDesignPreferences,
  loadDesignPreferences,
  saveDesignPreferences,
  type DesignPreferences,
} from "./lib/design-preferences";
import { formatPayload, QR_MODES, type PayloadFields, type QrMode } from "./lib/payloads";
import { createQrCode } from "./lib/qr";
import { getScannabilityWarnings } from "./lib/scannability";
import {
  exportFilename,
  isShareCancellation,
  makeShareData,
  removeShareTargetParams,
  selectShareTargetValue,
  supportsPngClipboard,
  supportsPngFileShare,
  type ExportExtension,
} from "./lib/share";
import { detectLogoPresetFromText, getLogoMismatchWarning, getLogoPreset, LOGO_PRESETS, logoPresetToDataUrl, type LogoPresetId } from "./lib/logo-presets";
import {
  buildSvgFromQr,
  DEFAULT_RENDER_OPTIONS,
  svgBlob,
  svgToPdfBlob,
  svgToRasterBlob,
  type FinderStyle,
  type LogoBackgroundMode,
  type ModuleStyle,
  type QrRenderOptions,
} from "./lib/render";
import { COASTER_SIZE_PRESETS, getQr3dPrintabilityWarnings, objZipBlob, QR3D_PRINT_PROFILES, qr3dOptionsFromRenderOptions, stlBlob, threeMfBlob, validateQr3dMesh, type Qr3dModelOptions } from "./lib/model3d";
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
const APP_VERSION = "2.0.0";
type CategorySelection = QrMode | typeof AUTO_CATEGORY_VALUE;
type ExportFormat = "png" | "svg" | "webp" | "pdf" | "stl" | "3mf" | "obj";

const EXPORT_FORMAT_GUIDANCE: Record<ExportFormat, string> = {
  png: "Recommended for everyday use",
  svg: "Best for design and scalable printing",
  webp: "Compact web image",
  pdf: "Print-ready; transparent backgrounds become white",
  stl: "Print-ready coaster geometry; STL is single-material",
  "3mf": "Print-ready coaster model with selected colors",
  obj: "Blender-ready coaster ZIP with OBJ and color MTL",
};

const MODULE_STYLE_HINTS: Record<ModuleStyle, string> = {
  classic: "Full square modules. The most reliable everyday QR style.",
  dots: "Turns data modules into dots while keeping finder corners clear.",
  pixel: "Slightly inset blocky modules for a crisp pixel-art look.",
  "soft-square": "Uses smaller rounded squares for a softer printed feel.",
  neon: "Adds a visible cyan accent around modules while keeping the dark QR readable.",
  "split-finders": "Uses finder color for outer corners and module color for finder centers. Set different module and finder colors to see it.",
  sticker: "Adds a rounded sticker-style outer border. Change finder color to customize the border.",
};

const COLOR_DEPENDENT_MODULE_STYLES = new Set<ModuleStyle>(["split-finders", "sticker"]);

const DEFAULT_QUICK_CONTENT_PLACEHOLDER = "Paste a URL, Wi-Fi string, email, phone, vCard, UPI ID, event, or coordinates";
const DEFAULT_QUICK_CONTENT_VALUE = "example.com";
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
let selectedExportFormat: ExportFormat = "png";
let selected3dFormat: "" | "stl" | "3mf" | "obj" = "";
let model3dDragState: { x: number; y: number; pitch: number; yaw: number } | null = null;
let batchData: CsvData | null = null;
let batchValidation: BatchValidationResult | null = null;
let batchGenerating = false;
const batchCancellation = new BatchCancellationController();
let pendingQrFrame = 0;
let pendingScanTimer = 0;
let eccChangedManually = false;
const latestScanRun = new LatestScanRun();

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
            <button type="button" data-export="stl" role="menuitem" disabled>STL</button>
            <button type="button" data-export="3mf" role="menuitem" disabled>3MF</button>
            <button type="button" data-export="obj" role="menuitem" disabled>OBJ</button>
          </div>
        </div>
      </div>
    </header>
    <main class="workspace">
      <div class="control-column">
        <section class="tool-surface controls" aria-label="QR controls">
        <div class="section-heading">
          <h2>Create QR</h2>
          <span id="modeHint"></span>
        </div>
        <div id="quickContentDropZone" class="field field-wide quick-content">
          <div class="quick-content-heading">
            <label for="autoContent">Quick content</label>
            <label class="import-qr-action" for="qrImport">
              <svg class="import-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h4M4 5v4M20 5h-4M20 5v4M4 19h4M4 19v-4M20 19h-4M20 19v-4M9 9h6v6H9z"/></svg>
              <span>Import QR image</span>
              <input id="qrImport" type="file" accept="image/*" />
            </label>
          </div>
          <textarea id="autoContent" rows="3" placeholder="${escapeHtml(DEFAULT_QUICK_CONTENT_PLACEHOLDER)}">${escapeHtml(DEFAULT_QUICK_CONTENT_VALUE)}</textarea>
        </div>
        <p id="qrImportStatus" class="import-status" aria-live="polite"></p>
        <p id="autoDetectStatus" class="detect-status" aria-live="polite">Type or paste content; SayaQR detects the QR type automatically.</p>

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
            <div class="customize-group field-wide">
              <h3>Appearance</h3>
              <p>Pick the QR colors first. Custom colors stay local.</p>
            </div>
            <div class="appearance-options-row field-wide">
              <label class="field color-mode-field" for="colorMode"><span>Color mode</span><select id="colorMode"><option value="default" selected>Default</option><option value="logo">Logo</option><option value="custom">Custom</option></select></label>
              <label class="switch color-alpha-toggle"><input id="transparentBackground" type="checkbox" /><span>Transparent background</span></label>
            </div>
            <div id="customColorPanel" class="custom-color-panel" hidden>
              <label class="field design-pair color-control" for="foregroundHex">
                <span>Modules</span>
                <span class="color-shell">
                  <span class="color-swatch-wrap">
                    <input id="foreground" class="native-color-input" type="color" value="${DEFAULT_RENDER_OPTIONS.foreground}" aria-label="Module color picker" />
                    <span id="foregroundSwatch" class="color-swatch" style="--swatch-color: ${DEFAULT_RENDER_OPTIONS.foreground}" aria-hidden="true"></span>
                  </span>
                  <input id="foregroundHex" class="hex-color-input" type="text" value="${DEFAULT_RENDER_OPTIONS.foreground}" inputmode="text" spellcheck="false" aria-label="Module hex color" />
                </span>
              </label>
              <label class="field design-pair color-control" for="finderColorHex">
                <span>Finders</span>
                <span class="color-shell">
                  <span class="color-swatch-wrap">
                    <input id="finderColor" class="native-color-input" type="color" value="${DEFAULT_RENDER_OPTIONS.finderColor}" aria-label="Finder color picker" />
                    <span id="finderColorSwatch" class="color-swatch" style="--swatch-color: ${DEFAULT_RENDER_OPTIONS.finderColor}" aria-hidden="true"></span>
                  </span>
                  <input id="finderColorHex" class="hex-color-input" type="text" value="${DEFAULT_RENDER_OPTIONS.finderColor}" inputmode="text" spellcheck="false" aria-label="Finder hex color" />
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
            </div>

            <div class="customize-group field-wide">
              <h3>Shape</h3>
              <p>Decorative styles may scan less reliably. Test before printing.</p>
            </div>
            <label class="field"><span>Rounded modules <strong id="roundedValue">12%</strong></span><input id="rounded" type="range" min="0" max="1" step="0.05" value="0.12" /></label>
            <label class="field design-pair"><span>Finder style</span><select id="finderStyle"><option value="square" selected>Square</option><option value="rounded">Rounded</option><option value="circle">Circle</option></select></label>
            <label class="field field-wide module-style-field" for="moduleStyle"><span>Decorative style</span><select id="moduleStyle"><option value="classic" selected>Classic</option><option value="dots">Module dots</option><option value="pixel">Pixel blocks</option><option value="soft-square">Soft squares</option><option value="neon">Neon glow</option><option value="split-finders">Split-color finders</option><option value="sticker">Sticker border</option></select><span class="module-style-support"><span id="moduleStyleSample" class="module-style-sample" data-style="classic" aria-hidden="true"><span></span><span></span><span></span><span></span></span><small id="moduleStyleHint" class="control-hint">${escapeHtml(MODULE_STYLE_HINTS.classic)}</small><button id="customizeStyleColors" class="inline-link-button" type="button" hidden>Customize colors</button></span></label>

            <details class="nested-disclosure logo-disclosure field-wide">
              <summary>Logo</summary>
              <div class="nested-body logo-picker">
              <div class="logo-select-row">
                <span id="logoPresetPreview" class="logo-preset-preview" aria-hidden="true">${renderSelectedLogoPreview()}</span>
                <label class="field logo-select-field" for="logoPresetSelect"><span>Logo preset</span><select id="logoPresetSelect" aria-label="Logo preset">${renderLogoPresetOptions()}</select></label>
              </div>
              <p class="logo-source-note">SVG marks stay local. Brand trademarks belong to their owners.</p>
              <label class="logo-upload-field" for="logoUpload">
                <span>Upload custom</span>
                <span class="logo-upload-control">
                  <svg class="upload-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m0 0-4 4m4-4 4 4M5 14v5h14v-5"/></svg>
                  <span id="logoUploadName" class="logo-upload-name">Choose an image</span>
                </span>
                <input id="logoUpload" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" />
              </label>
              <p id="logoUploadStatus" class="logo-upload-status" aria-live="polite"></p>
              <div class="logo-render-options">
                <label class="field" for="logoBackground"><span>Logo background</span><select id="logoBackground"><option value="padded" selected>Padded background</option><option value="none">No background</option></select></label>
                <label class="switch"><input id="logoStroke" type="checkbox" /><span>Logo stroke</span></label>
                <label id="logoStrokeColorField" class="field color-control" for="logoStrokeColorHex" hidden>
                  <span>Stroke color</span>
                  <span class="color-shell">
                    <span class="color-swatch-wrap">
                      <input id="logoStrokeColor" class="native-color-input" type="color" value="${DEFAULT_RENDER_OPTIONS.logoStrokeColor}" aria-label="Logo stroke color picker" />
                      <span id="logoStrokeColorSwatch" class="color-swatch" style="--swatch-color: ${DEFAULT_RENDER_OPTIONS.logoStrokeColor}" aria-hidden="true"></span>
                    </span>
                    <input id="logoStrokeColorHex" class="hex-color-input" type="text" value="${DEFAULT_RENDER_OPTIONS.logoStrokeColor}" inputmode="text" spellcheck="false" aria-label="Logo stroke hex color" />
                  </span>
                </label>
              </div>
              <label class="field"><span>Logo size <strong id="logoSizeValue">18%</strong></span><input id="logoScale" type="range" min="0.05" max="0.35" step="0.01" value="0.18" /></label>
              </div>
            </details>

            <details class="nested-disclosure advanced-design field-wide">
              <summary>Advanced scan settings</summary>
              <div class="nested-body advanced-grid">
                <div class="advanced-size-row field-wide">
                  <label class="field"><span>Quiet zone <strong id="marginValue">4</strong></span><input id="margin" type="range" min="0" max="10" value="4" /></label>
                  <label class="field"><span>Export resolution <strong id="moduleSizeValue">12</strong></span><input id="moduleSize" type="range" min="4" max="28" value="12" /><small class="control-hint">Changes downloaded image dimensions. The preview scales to fit.</small></label>
                </div>
                <div class="advanced-preference-row field-wide">
                  <label class="field"><span>Error correction</span><select id="ecc"><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="QUARTILE">Quartile</option><option value="HIGH" selected>High</option></select></label>
                  <label class="switch design-save"><input id="rememberDesign" type="checkbox" /><span>Use this design next time</span></label>
                  <button id="resetDesign" class="secondary-action reset-design-action" type="button">Reset design</button>
                </div>
                <p id="designMemoryStatus" class="design-memory-status field-wide" aria-live="polite"></p>
              </div>
            </details>
          </div>
        </details>
        <details class="disclosure model3d-disclosure" id="model3dDetails">
          <summary>3D coaster export</summary>
          <div class="disclosure-body model3d-settings">
              <p class="control-hint">Raised QR coaster in millimetres. The default is a cup-coaster size.</p>
            <div class="model3d-settings-grid">
              <label class="field field-wide"><span>Print profile</span><select id="model3dProfile">${QR3D_PRINT_PROFILES.map((profile) => `<option value="${profile.id}"${profile.id === "bambu-ams" ? " selected" : ""}>${profile.name}</option>`).join("")}</select><small id="model3dProfileHint" class="control-hint">${QR3D_PRINT_PROFILES[0].description}</small></label>
              <label class="field"><span>Coaster size</span><select id="model3dSize">${COASTER_SIZE_PRESETS.map((preset) => `<option value="${preset.value}"${preset.value === 100 ? " selected" : ""}>${preset.label}</option>`).join("")}</select></label>
              <label class="field"><span>Base thickness <strong id="model3dBaseValue">2.0 mm</strong></span><input id="model3dBase" type="range" min="1" max="4" step="0.1" value="2" /></label>
              <label class="field"><span>Top relief height <strong id="model3dHeightValue">1.2 mm</strong></span><input id="model3dHeight" type="range" min="0.4" max="3" step="0.1" value="1.2" /></label>
              <label class="field"><span>Bottom QR thickness <strong id="model3dBottomValue">0.4 mm · 2 layers</strong></span><input id="model3dBottom" type="range" min="0.2" max="1" step="0.2" value="0.4" /></label>
              <label class="field"><span>Relief</span><select id="model3dReliefMode"><option value="raised" selected>Raised QR</option><option value="engraved">Engraved QR</option></select></label>
              <label class="field field-wide"><span>Color strategy</span><select id="model3dColorStrategy"><option value="single">Single color</option><option value="two">Base + QR two-color</option><option value="three" selected>Base + modules + finders</option></select></label>
            </div>
            <p id="model3dGuidance" class="model3d-guidance" aria-live="polite">Select a 3D format to see print guidance.</p>
          </div>
        </details>
      </section>


      <details class="tool-surface batch-zone disclosure batch-disclosure" aria-label="Batch mode">
        <summary><span>Batch generate</span><span id="batchSummary">No file loaded</span></summary>
        <div class="disclosure-body">
          <div class="batch-intro">
            <p>Use CSV columns or a TXT list. Files are read and generated only in this browser.</p>
            <button id="downloadSampleCsv" class="secondary-action" type="button">Download sample CSV</button>
          </div>
          <div class="batch-grid">
            <label id="batchFileDropZone" class="field field-wide batch-file-drop" for="csvUpload">
              <span>CSV or TXT file</span>
              <span class="batch-file-control">
                <svg class="upload-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m0 0-4 4m4-4 4 4M5 14v5h14v-5"/></svg>
                <span class="batch-file-copy"><strong id="batchFileName">Drop CSV or TXT here</strong><small>or click to choose a file</small></span>
              </span>
              <input id="csvUpload" type="file" accept=".csv,.txt,text/csv,text/plain" />
            </label>
            <label class="field"><span>Content column</span><select id="csvContentColumn" disabled></select></label>
            <label class="field"><span>Filename column</span><select id="csvNameColumn" disabled></select></label>
            <label class="field"><span>ZIP format</span><select id="batchFormat"><option value="svg">SVG</option><option value="png">PNG</option><option value="webp">WebP</option><option value="pdf">PDF</option><option value="stl">STL coaster</option><option value="3mf">3MF color coaster</option><option value="obj">OBJ Blender coaster</option></select></label>
            <button id="exportZip" type="button" disabled>Export ZIP</button>
          </div>
          <div id="batchProgress" class="batch-progress" hidden>
            <progress id="batchProgressBar" value="0" max="1"></progress>
            <div class="batch-progress-copy" aria-live="polite">
              <span id="batchGeneratedCount">0 generated</span>
              <span id="batchSkippedCount">0 skipped</span>
            </div>
            <button id="cancelBatch" class="secondary-action" type="button">Cancel</button>
          </div>
          <div id="batchPreview" class="batch-preview"></div>
          <details id="batchReportDetails" class="batch-report-details" hidden>
            <summary>Full validation report</summary>
            <textarea id="batchFullReport" readonly rows="8" aria-label="Full batch validation report"></textarea>
          </details>
        </div>
      </details>
      </div>

      <section class="tool-surface preview-zone" aria-label="QR preview">
        <div class="preview-header">
          <div>
            <h2>Preview</h2>
            <p id="qrStats">Waiting for content</p>
          </div>
          <div id="offlineStatus" class="status-pill">Offline ready</div>
        </div>
        <div id="qrPreview" class="qr-preview"></div>
        <div id="model3dPreviewPanel" class="model3d-preview-wrap" hidden>
          <div class="model3d-preview-toolbar">
            <span><strong>3D preview</strong> Drag to rotate</span>
            <button id="model3dResetView" class="secondary-action" type="button">Reset view</button>
          </div>
          <canvas id="model3dPreview" width="720" height="420" aria-label="Isometric 3D QR coaster preview"></canvas>
          <div class="model3d-preview-readout">
            <span id="model3dDimensions" aria-live="polite">100 × 100 × 3.2 mm</span>
            <span>Pitch <strong id="model3dPitchValue">35°</strong> · Yaw <strong id="model3dYawValue">-35°</strong></span>
          </div>
          <div class="model3d-preview-sliders" aria-label="3D preview angle controls">
            <label class="field"><span>Pitch</span><input id="model3dPitch" type="range" min="-180" max="180" value="35" /></label>
            <label class="field"><span>Yaw</span><input id="model3dYaw" type="range" min="-180" max="180" value="-35" /></label>
          </div>
        </div>
        <section id="intentPreview" class="intent-preview is-empty" aria-live="polite">
          <span class="intent-badge">Ready</span>
          <h3>Your QR intent will appear here</h3>
        </section>
        <section id="scanChecks" class="scan-checks" data-state="empty">
          <div class="scan-checks-heading">
            <h3>Scan checks</h3>
            <span id="scanCheckStatus">Waiting for content</span>
          </div>
          <div class="local-scan-row">
            <span id="scanConfidenceBadge" class="scan-confidence-badge" data-level="unavailable">Local scan check: Waiting for QR</span>
            <button id="autoFixButton" class="auto-fix-button" type="button" hidden>Fix automatically</button>
          </div>
          <details id="scanTestDetails" class="scan-test-details" hidden>
            <summary>Scan test details</summary>
            <p>Advisory local simulations, not a scan guarantee.</p>
            <ul id="scanCaseResults"></ul>
          </details>
          <div id="warnings" class="warnings" aria-live="polite"></div>
        </section>
        <p id="formatGuidance" class="format-info" aria-live="polite" aria-atomic="true"><strong id="formatGuidanceName">PNG</strong><span id="formatGuidanceText">Recommended for everyday use</span></p>
        <div class="export-actions" aria-label="Export and share QR code">
          <div class="format-action-row" role="group" aria-label="Choose export format">
            <div class="alternate-format-actions">
              <button type="button" data-export="png" aria-describedby="formatGuidance" aria-pressed="true" disabled>PNG</button>
              <button type="button" data-export="svg" aria-describedby="formatGuidance" aria-pressed="false" disabled>SVG</button>
              <button type="button" data-export="webp" aria-describedby="formatGuidance" aria-pressed="false" disabled>WebP</button>
              <button type="button" data-export="pdf" aria-describedby="formatGuidance" aria-pressed="false" disabled>PDF</button>
              <button type="button" data-export="stl" aria-describedby="formatGuidance" aria-pressed="false" disabled>STL</button>
              <button type="button" data-export="3mf" aria-describedby="formatGuidance" aria-pressed="false" disabled>3MF</button>
              <button type="button" data-export="obj" aria-describedby="formatGuidance" aria-pressed="false" disabled>OBJ</button>
            </div>
          </div>
          <div id="nativeExportActions" class="secondary-export-actions" data-count="0" hidden>
            <button id="copyImage" class="secondary-export-action" type="button" hidden disabled>Copy</button>
            <button id="shareImage" class="secondary-export-action" type="button" hidden disabled>Share</button>
            <button id="downloadSelectedButton" class="primary-export" type="button" aria-describedby="formatGuidance" hidden disabled><svg class="download-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v11m0 0 4-4m-4 4-4-4M5 19h14"/></svg><span id="downloadSelectedLabel">Download PNG</span></button>
          </div>
        </div>
        <p id="exportStatus" class="export-status" aria-live="polite"></p>
        <details class="technical-payload">
          <summary>Technical payload</summary>
          <label class="payload-output" for="payloadOutput"><span>Encoded payload</span><textarea id="payloadOutput" readonly rows="4"></textarea></label>
        </details>
      </section>


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
      <a class="footer-support" href="https://www.buymeacoffee.com/subtlesayak" target="_blank" rel="noopener noreferrer">Buy me a coffee</a>
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
  const hasQuickContent = Boolean(document.querySelector<HTMLTextAreaElement>("#autoContent")?.value.trim());
  const detectedLabel = QR_MODES.find((mode) => mode.id === currentMode)?.label ?? "Plain text";
  hint.textContent =
    categorySelection === AUTO_CATEGORY_VALUE
      ? hasQuickContent
        ? `Detected: ${detectedLabel}`
        : "Automatic type detection"
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
    : "Type or paste content; SayaQR detects the QR type automatically.";
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

type ColorControlId = "foreground" | "finderColor" | "background" | "logoStrokeColor";

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

function markIncompleteHexColor(id: ColorControlId): void {
  const hexInput = document.querySelector<HTMLInputElement>(`#${id}Hex`);
  if (hexInput) hexInput.setAttribute("aria-invalid", "false");
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

function updateLogoUploadName(fileName = ""): void {
  const name = document.querySelector<HTMLSpanElement>("#logoUploadName");
  if (!name) return;
  name.textContent = fileName || "Choose an image";
  name.title = fileName;
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
  updateLogoUploadName();
  updateLogoPresetState();
}

function clearCenterLogo(suppressAuto = false): void {
  logoDataUrl = "";
  logoSelection = "none";
  logoAutoApplied = false;
  logoAutoSuppressedFor = suppressAuto ? (document.querySelector<HTMLTextAreaElement>("#autoContent")?.value.trim() ?? "") : "";
  const upload = document.querySelector<HTMLInputElement>("#logoUpload");
  if (upload) upload.value = "";
  updateLogoUploadName();
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

const DESIGN_CONTROL_IDS = new Set([
  "colorMode",
  "foreground",
  "foregroundHex",
  "finderColor",
  "finderColorHex",
  "background",
  "backgroundHex",
  "transparentBackground",
  "margin",
  "moduleSize",
  "rounded",
  "moduleStyle",
  "finderStyle",
  "ecc",
  "logoBackground",
  "logoStroke",
  "logoStrokeColor",
  "logoStrokeColorHex",
  "logoScale",
  "model3dSize",
  "model3dBase",
  "model3dHeight",
  "model3dReliefMode",
  "model3dColorStrategy",
  "model3dProfile",
  "model3dPitch",
  "model3dYaw",
]);

function readDesignPreferencesFromControls(): DesignPreferences {
  const colorModeValue = document.querySelector<HTMLSelectElement>("#colorMode")?.value;
  const colorMode = colorModeValue === "logo" || colorModeValue === "custom" ? colorModeValue : "default";
  const finderValue = document.querySelector<HTMLSelectElement>("#finderStyle")?.value;
  const finderStyle: FinderStyle =
    finderValue === "rounded" || finderValue === "circle" ? finderValue : DEFAULT_RENDER_OPTIONS.finderStyle;
  const moduleValue = document.querySelector<HTMLSelectElement>("#moduleStyle")?.value;
  const moduleStyle: ModuleStyle =
    moduleValue === "dots" ||
    moduleValue === "pixel" ||
    moduleValue === "soft-square" ||
    moduleValue === "neon" ||
    moduleValue === "split-finders" ||
    moduleValue === "sticker"
      ? moduleValue
      : DEFAULT_RENDER_OPTIONS.moduleStyle;
  const eccValue = document.querySelector<HTMLSelectElement>("#ecc")?.value;
  const ecc: QrRenderOptions["ecc"] =
    eccValue === "LOW" || eccValue === "MEDIUM" || eccValue === "QUARTILE" ? eccValue : "HIGH";
  const logoBackgroundValue = document.querySelector<HTMLSelectElement>("#logoBackground")?.value;
  const logoBackground: LogoBackgroundMode = logoBackgroundValue === "none" ? "none" : "padded";

  return {
    colorMode,
    foreground: readColorControl("foreground", DEFAULT_RENDER_OPTIONS.foreground),
    finderColor: readColorControl("finderColor", DEFAULT_RENDER_OPTIONS.finderColor),
    background: readColorControl("background", DEFAULT_RENDER_OPTIONS.background),
    transparentBackground: document.querySelector<HTMLInputElement>("#transparentBackground")?.checked ?? false,
    margin: Number(document.querySelector<HTMLInputElement>("#margin")?.value ?? DEFAULT_RENDER_OPTIONS.margin),
    moduleSize: Number(document.querySelector<HTMLInputElement>("#moduleSize")?.value ?? DEFAULT_RENDER_OPTIONS.moduleSize),
    rounded: Number(document.querySelector<HTMLInputElement>("#rounded")?.value ?? DEFAULT_RENDER_OPTIONS.rounded),
    moduleStyle,
    finderStyle,
    logoBackground,
    logoStroke: document.querySelector<HTMLInputElement>("#logoStroke")?.checked ?? DEFAULT_RENDER_OPTIONS.logoStroke,
    logoStrokeColor: readColorControl("logoStrokeColor", DEFAULT_RENDER_OPTIONS.logoStrokeColor),
    ecc,
    logoScale: Number(document.querySelector<HTMLInputElement>("#logoScale")?.value ?? DEFAULT_RENDER_OPTIONS.logoScale),
  };
}

function applyDesignPreferences(preferences: DesignPreferences): void {
  const colorMode = document.querySelector<HTMLSelectElement>("#colorMode");
  const transparent = document.querySelector<HTMLInputElement>("#transparentBackground");
  const margin = document.querySelector<HTMLInputElement>("#margin");
  const moduleSize = document.querySelector<HTMLInputElement>("#moduleSize");
  const rounded = document.querySelector<HTMLInputElement>("#rounded");
  const finderStyle = document.querySelector<HTMLSelectElement>("#finderStyle");
  const moduleStyle = document.querySelector<HTMLSelectElement>("#moduleStyle");
  const ecc = document.querySelector<HTMLSelectElement>("#ecc");
  const logoScale = document.querySelector<HTMLInputElement>("#logoScale");
  const logoBackground = document.querySelector<HTMLSelectElement>("#logoBackground");
  const logoStroke = document.querySelector<HTMLInputElement>("#logoStroke");

  if (colorMode) colorMode.value = preferences.colorMode;
  writeColorControl("foreground", preferences.foreground);
  writeColorControl("finderColor", preferences.finderColor);
  writeColorControl("background", preferences.background);
  if (transparent) transparent.checked = preferences.transparentBackground;
  if (margin) margin.value = String(preferences.margin);
  if (moduleSize) moduleSize.value = String(preferences.moduleSize);
  if (rounded) rounded.value = String(preferences.rounded);
  if (moduleStyle) moduleStyle.value = preferences.moduleStyle;
  if (finderStyle) finderStyle.value = preferences.finderStyle;
  if (ecc) ecc.value = preferences.ecc;
  if (logoScale) logoScale.value = String(preferences.logoScale);
  if (logoBackground) logoBackground.value = preferences.logoBackground;
  if (logoStroke) logoStroke.checked = preferences.logoStroke;
  writeColorControl("logoStrokeColor", preferences.logoStrokeColor);
  updateCustomColorPanel();
  updateLogoStrokeColorVisibility();
  updateModuleStyleHint();
  updateSliderLabels();
}

function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function persistDesignIfEnabled(): void {
  const remember = document.querySelector<HTMLInputElement>("#rememberDesign");
  if (!remember?.checked) return;
  const status = document.querySelector<HTMLParagraphElement>("#designMemoryStatus");
  const storage = browserStorage();
  const saved = storage ? saveDesignPreferences(storage, readDesignPreferencesFromControls()) : false;
  if (status) status.textContent = saved ? "Design saved locally" : "Browser storage is unavailable";
}

function restoreDesignPreferences(): void {
  const storage = browserStorage();
  const preferences = storage ? loadDesignPreferences(storage) : null;
  const remember = document.querySelector<HTMLInputElement>("#rememberDesign");
  const status = document.querySelector<HTMLParagraphElement>("#designMemoryStatus");
  if (!preferences) {
    if (remember) remember.checked = false;
    return;
  }
  applyDesignPreferences(preferences);
  if (remember) remember.checked = true;
  if (status) status.textContent = "Saved design applied";
}

function handleDesignMemoryToggle(enabled: boolean): void {
  const status = document.querySelector<HTMLParagraphElement>("#designMemoryStatus");
  if (enabled) {
    persistDesignIfEnabled();
    return;
  }
  const storage = browserStorage();
  if (storage) clearDesignPreferences(storage);
  if (status) status.textContent = "Design memory off";
}

function resetDesignControls(): void {
  const storage = browserStorage();
  if (storage) clearDesignPreferences(storage);
  const remember = document.querySelector<HTMLInputElement>("#rememberDesign");
  if (remember) remember.checked = false;
  applyDesignPreferences({
    colorMode: "default",
    foreground: DEFAULT_RENDER_OPTIONS.foreground,
    finderColor: DEFAULT_RENDER_OPTIONS.finderColor,
    background: DEFAULT_RENDER_OPTIONS.background,
    transparentBackground: false,
    margin: DEFAULT_RENDER_OPTIONS.margin,
    moduleSize: DEFAULT_RENDER_OPTIONS.moduleSize,
    rounded: DEFAULT_RENDER_OPTIONS.rounded,
    moduleStyle: DEFAULT_RENDER_OPTIONS.moduleStyle,
    finderStyle: DEFAULT_RENDER_OPTIONS.finderStyle,
    logoBackground: DEFAULT_RENDER_OPTIONS.logoBackground,
    logoStroke: DEFAULT_RENDER_OPTIONS.logoStroke,
    logoStrokeColor: DEFAULT_RENDER_OPTIONS.logoStrokeColor,
    ecc: DEFAULT_RENDER_OPTIONS.ecc,
    logoScale: DEFAULT_RENDER_OPTIONS.logoScale,
  });
  const status = document.querySelector<HTMLParagraphElement>("#designMemoryStatus");
  if (status) status.textContent = "Design reset. Nothing is saved.";
  refreshBatchValidation();
  scheduleQrUpdate();
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
  const finderColor = useCustomColors
    ? readColorControl("finderColor", foreground)
    : foreground;
  const background = useCustomColors ? readColorControl("background", DEFAULT_RENDER_OPTIONS.background) : DEFAULT_RENDER_OPTIONS.background;
  const transparentBackground = document.querySelector<HTMLInputElement>("#transparentBackground")?.checked ?? false;
  const margin = Number(document.querySelector<HTMLInputElement>("#margin")?.value ?? DEFAULT_RENDER_OPTIONS.margin);
  const moduleSize = Number(document.querySelector<HTMLInputElement>("#moduleSize")?.value ?? DEFAULT_RENDER_OPTIONS.moduleSize);
  const rounded = Number(document.querySelector<HTMLInputElement>("#rounded")?.value ?? DEFAULT_RENDER_OPTIONS.rounded);
  const moduleStyle = (document.querySelector<HTMLSelectElement>("#moduleStyle")?.value ?? DEFAULT_RENDER_OPTIONS.moduleStyle) as ModuleStyle;
  const finderStyle = (document.querySelector<HTMLSelectElement>("#finderStyle")?.value ?? DEFAULT_RENDER_OPTIONS.finderStyle) as FinderStyle;
  const logoBackground = (document.querySelector<HTMLSelectElement>("#logoBackground")?.value ?? DEFAULT_RENDER_OPTIONS.logoBackground) as LogoBackgroundMode;
  const ecc = (document.querySelector<HTMLSelectElement>("#ecc")?.value ?? DEFAULT_RENDER_OPTIONS.ecc) as QrRenderOptions["ecc"];
  const logoScale = Number(document.querySelector<HTMLInputElement>("#logoScale")?.value ?? DEFAULT_RENDER_OPTIONS.logoScale);

  return {
    foreground,
    finderColor,
    background,
    transparentBackground,
    margin,
    moduleSize,
    rounded,
    moduleStyle,
    finderStyle,
    logoDataUrl,
    logoBackground: logoBackground === "none" ? "none" : "padded",
    logoStroke: document.querySelector<HTMLInputElement>("#logoStroke")?.checked ?? DEFAULT_RENDER_OPTIONS.logoStroke,
    logoStrokeColor: readColorControl("logoStrokeColor", DEFAULT_RENDER_OPTIONS.logoStrokeColor),
    logoScale,
    ecc,
  };
}

function updateSliderLabels(): void {
  const margin = document.querySelector<HTMLInputElement>("#margin")?.value ?? "4";
  const moduleSize = document.querySelector<HTMLInputElement>("#moduleSize")?.value ?? "12";
  const rounded = Number(document.querySelector<HTMLInputElement>("#rounded")?.value ?? "0.12");
  const logoScale = Number(document.querySelector<HTMLInputElement>("#logoScale")?.value ?? "0.18");
  const model3dBase = Number(document.querySelector<HTMLInputElement>("#model3dBase")?.value ?? "2");
  const model3dHeight = Number(document.querySelector<HTMLInputElement>("#model3dHeight")?.value ?? "1.2");
  const model3dBottom = Number(document.querySelector<HTMLInputElement>("#model3dBottom")?.value ?? "0.4");
  const model3dPitch = Number(document.querySelector<HTMLInputElement>("#model3dPitch")?.value ?? "35");
  const model3dYaw = Number(document.querySelector<HTMLInputElement>("#model3dYaw")?.value ?? "-35");
  document.querySelector("#marginValue")!.textContent = margin;
  document.querySelector("#moduleSizeValue")!.textContent = moduleSize;
  document.querySelector("#roundedValue")!.textContent = `${Math.round(rounded * 100)}%`;
  document.querySelector("#logoSizeValue")!.textContent = `${Math.round(logoScale * 100)}%`;
  document.querySelector("#model3dBaseValue")!.textContent = `${model3dBase.toFixed(1)} mm`;
  document.querySelector("#model3dHeightValue")!.textContent = `${model3dHeight.toFixed(1)} mm`;
  document.querySelector("#model3dBottomValue")!.textContent = `${model3dBottom.toFixed(1)} mm · ${Math.round(model3dBottom / 0.2)} layers`;
  document.querySelector("#model3dPitchValue")!.textContent = `${model3dPitch}°`;
  document.querySelector("#model3dYawValue")!.textContent = `${model3dYaw}°`;
}

function get3dOptions(renderOptions: QrRenderOptions) {
  const colorStrategy = (document.querySelector<HTMLSelectElement>("#model3dColorStrategy")?.value ?? "three") as "single" | "two" | "three";
  const baseOptions = qr3dOptionsFromRenderOptions(renderOptions);
  return {
    ...baseOptions,
    profile: (document.querySelector<HTMLSelectElement>("#model3dProfile")?.value ?? "bambu-ams") as Qr3dModelOptions["profile"],
    colorStrategy,
    reliefMode: (document.querySelector<HTMLSelectElement>("#model3dReliefMode")?.value ?? "raised") as "raised" | "engraved",
    moduleColor: colorStrategy === "single" ? baseOptions.baseColor : baseOptions.moduleColor,
    finderColor: colorStrategy === "three" ? baseOptions.finderColor : colorStrategy === "two" ? baseOptions.moduleColor : baseOptions.baseColor,
    hasLogo: Boolean(renderOptions.logoDataUrl),
    stylized: renderOptions.moduleStyle !== "classic" || renderOptions.rounded > 0 || renderOptions.finderStyle !== "square",
    sizeMm: Number(document.querySelector<HTMLSelectElement>("#model3dSize")?.value ?? 100),
    baseHeightMm: Number(document.querySelector<HTMLInputElement>("#model3dBase")?.value ?? 2),
    moduleHeightMm: Number(document.querySelector<HTMLInputElement>("#model3dHeight")?.value ?? 1.2),
    undersideThicknessMm: Number(document.querySelector<HTMLInputElement>("#model3dBottom")?.value ?? 0.4),
  };
}

function update3dGuidance(): void {
  const guidance = document.querySelector<HTMLElement>("#model3dGuidance");
  if (!guidance || !currentPayload.trim()) {
    if (guidance) guidance.textContent = "Select a 3D format to see print guidance.";
    return;
  }
  try {
    const options = get3dOptions(getRenderOptions());
    const qr = createQrCode(currentPayload, getRenderOptions().ecc);
    const warnings = getQr3dPrintabilityWarnings(qr, options);
    const topology = validateQr3dMesh(qr, options);
    if (!topology.watertight) warnings.push({ level: "warning", message: `Mesh check: ${topology.boundaryEdges} open edge${topology.boundaryEdges === 1 ? "" : "s"}, ${topology.nonManifoldEdges} non-manifold edge${topology.nonManifoldEdges === 1 ? "" : "s"}. Repair before printing.` });
    guidance.textContent = warnings.map((warning) => warning.message).join(" ");
    guidance.dataset.level = warnings.some((warning) => warning.level === "warning") ? "warning" : "info";
  } catch {
    guidance.textContent = "3D settings will be checked when the QR is generated.";
  }
}

function update3dProfile(): void {
  const select = document.querySelector<HTMLSelectElement>("#model3dProfile");
  const preset = QR3D_PRINT_PROFILES.find((profile) => profile.id === select?.value);
  if (!preset) return;
  const base = document.querySelector<HTMLInputElement>("#model3dBase");
  const height = document.querySelector<HTMLInputElement>("#model3dHeight");
  if (base) base.value = String(preset.baseHeightMm);
  if (height) height.value = String(preset.moduleHeightMm);
  const hint = document.querySelector<HTMLElement>("#model3dProfileHint");
  if (hint) hint.textContent = `${preset.description} ${preset.materialNote}`;
  updateSliderLabels();
}

function draw3dPreview(): void {
  const panel = document.querySelector<HTMLElement>("#model3dPreviewPanel");
  const canvas = document.querySelector<HTMLCanvasElement>("#model3dPreview");
  if (!panel || panel.hidden || !canvas || !currentPayload.trim()) return;
  const renderOptions = getRenderOptions();
  const modelOptions = get3dOptions(renderOptions);
  const qr = createQrCode(currentPayload, renderOptions.ecc);
  const context = canvas.getContext("2d");
  if (!context) return;
  const width = canvas.clientWidth || 720;
  const height = Math.max(280, width * (420 / 720));
  const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
  const backingWidth = Math.round(width * pixelRatio);
  const backingHeight = Math.round(height * pixelRatio);
  if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
    canvas.width = backingWidth;
    canvas.height = backingHeight;
  }
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, width, height);
  context.imageSmoothingEnabled = true;
  context.fillStyle = "#f7fafc";
  context.fillRect(0, 0, width, height);

  const pitch = (Number(document.querySelector<HTMLInputElement>("#model3dPitch")?.value ?? 35) * Math.PI) / 180;
  const yaw = (Number(document.querySelector<HTMLInputElement>("#model3dYaw")?.value ?? -35) * Math.PI) / 180;
  const sinYaw = Math.sin(yaw);
  const cosYaw = Math.cos(yaw);
  const sinPitch = Math.sin(pitch);
  const cosPitch = Math.cos(pitch);
  const totalCells = qr.size + Math.floor(modelOptions.quietZone ?? 4) * 2;
  const cell = 1 / totalCells;
  const scale = Math.min(width, height) * 0.72;
  const project = (x: number, y: number, z: number): [number, number] => {
    const rotatedX = x * cosYaw - y * sinYaw;
    const rotatedY = x * sinYaw + y * cosYaw;
    return [width / 2 + rotatedX * scale, height / 2 + rotatedY * sinPitch * scale - z * cosPitch * scale];
  };
  const point = (x: number, y: number, z: number): [number, number] => project(x - 0.5, y - 0.5, z);
  const polygon = (points: Array<[number, number]>, fill: string): void => {
    context.beginPath();
    context.moveTo(points[0][0], points[0][1]);
    for (const [x, y] of points.slice(1)) context.lineTo(x, y);
    context.closePath();
    context.fillStyle = fill;
    context.fill();
    context.strokeStyle = "rgba(15, 23, 42, 0.16)";
    context.lineWidth = 1;
    context.stroke();
  };
  const slabDepth = Math.max(0.012, (modelOptions.baseHeightMm ?? 2) / (modelOptions.sizeMm ?? 100));
  const relief = Math.max(0.004, (modelOptions.moduleHeightMm ?? 1.2) / (modelOptions.sizeMm ?? 100));
  const base = [point(0, 0, 0), point(1, 0, 0), point(1, 1, 0), point(0, 1, 0)];
  const baseTop = [point(0, 0, slabDepth), point(1, 0, slabDepth), point(1, 1, slabDepth), point(0, 1, slabDepth)];
  polygon([base[0], base[1], base[2], base[3]], "#cbd5e1");
  polygon([base[0], base[1], baseTop[1], baseTop[0]], "#94a3b8");
  polygon([base[1], base[2], baseTop[2], baseTop[1]], "#64748b");
  polygon(baseTop, modelOptions.baseColor ?? "#ffffff");

  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (!qr.getModule(x, y)) continue;
      const left = (x + (modelOptions.quietZone ?? 4)) * cell;
      const top = (y + (modelOptions.quietZone ?? 4)) * cell;
      const right = left + cell;
      const bottom = top + cell;
      const z = modelOptions.reliefMode === "engraved" ? slabDepth - relief : slabDepth + relief;
      const fill = isFinderPreviewCell(x, y, qr.size) ? (modelOptions.finderColor ?? "#0f172a") : (modelOptions.moduleColor ?? "#0f172a");
      polygon([point(left, top, z), point(right, top, z), point(right, bottom, z), point(left, bottom, z)], fill);
    }
  }
  const dimensions = document.querySelector<HTMLElement>("#model3dDimensions");
  if (dimensions) dimensions.textContent = `${modelOptions.sizeMm ?? 100} × ${modelOptions.sizeMm ?? 100} × ${((modelOptions.baseHeightMm ?? 2) + (modelOptions.moduleHeightMm ?? 1.2)).toFixed(1)} mm`;
}

function update3dPreviewVisibility(format: string): void {
  selected3dFormat = format === "stl" || format === "3mf" || format === "obj" ? format : "";
  const panel = document.querySelector<HTMLElement>("#model3dPreviewPanel");
  const qrPreview = document.querySelector<HTMLElement>("#qrPreview");
  const previewZone = document.querySelector<HTMLElement>(".preview-zone");
  if (panel) panel.hidden = !selected3dFormat;
  if (qrPreview) qrPreview.hidden = Boolean(selected3dFormat);
  if (previewZone) previewZone.dataset.previewMode = selected3dFormat ? "3d" : "qr";
  if (selected3dFormat) draw3dPreview();
}

function wire3dPreviewControls(): void {
  const canvas = document.querySelector<HTMLCanvasElement>("#model3dPreview");
  if (!canvas) return;
  canvas.addEventListener("pointerdown", (event) => {
    if (!selected3dFormat) return;
    const pitch = Number(document.querySelector<HTMLInputElement>("#model3dPitch")?.value ?? 35);
    const yaw = Number(document.querySelector<HTMLInputElement>("#model3dYaw")?.value ?? -35);
    model3dDragState = { x: event.clientX, y: event.clientY, pitch, yaw };
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add("is-dragging");
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!model3dDragState) return;
    const pitch = wrapPreviewAngle(model3dDragState.pitch - (event.clientY - model3dDragState.y) * 0.35);
    const yaw = wrapPreviewAngle(model3dDragState.yaw + (event.clientX - model3dDragState.x) * 0.5);
    const pitchInput = document.querySelector<HTMLInputElement>("#model3dPitch");
    const yawInput = document.querySelector<HTMLInputElement>("#model3dYaw");
    if (pitchInput) pitchInput.value = String(Math.round(pitch));
    if (yawInput) yawInput.value = String(Math.round(yaw));
    updateSliderLabels();
    draw3dPreview();
  });
  const endDrag = (): void => {
    model3dDragState = null;
    canvas.classList.remove("is-dragging");
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  document.querySelector<HTMLButtonElement>("#model3dResetView")?.addEventListener("click", () => {
    const pitch = document.querySelector<HTMLInputElement>("#model3dPitch");
    const yaw = document.querySelector<HTMLInputElement>("#model3dYaw");
    if (pitch) pitch.value = "35";
    if (yaw) yaw.value = "-35";
    updateSliderLabels();
    draw3dPreview();
  });
}

function wrapPreviewAngle(value: number): number {
  const wrapped = ((value + 180) % 360 + 360) % 360 - 180;
  return Math.round(wrapped);
}

function isFinderPreviewCell(x: number, y: number, size: number): boolean {
  return (x < 7 && y < 7) || (x >= size - 7 && y < 7) || (x < 7 && y >= size - 7);
}

function updateLogoStrokeColorVisibility(): void {
  const stroke = document.querySelector<HTMLInputElement>("#logoStroke");
  const strokeColor = document.querySelector<HTMLElement>("#logoStrokeColorField");
  if (strokeColor) strokeColor.hidden = !(stroke?.checked ?? false);
}

function updateModuleStyleHint(): void {
  const select = document.querySelector<HTMLSelectElement>("#moduleStyle");
  const hint = document.querySelector<HTMLElement>("#moduleStyleHint");
  const sample = document.querySelector<HTMLElement>("#moduleStyleSample");
  const colorButton = document.querySelector<HTMLButtonElement>("#customizeStyleColors");
  const colorMode = document.querySelector<HTMLSelectElement>("#colorMode")?.value ?? "default";
  const style = (select?.value ?? DEFAULT_RENDER_OPTIONS.moduleStyle) as ModuleStyle;
  if (hint) hint.textContent = MODULE_STYLE_HINTS[style] ?? MODULE_STYLE_HINTS.classic;
  if (sample) sample.dataset.style = style;
  if (colorButton) colorButton.hidden = !COLOR_DEPENDENT_MODULE_STYLES.has(style) || colorMode === "custom";
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
    finderColor: options.finderColor,
    background: options.background,
    transparentBackground: options.transparentBackground,
    margin: options.margin,
    logoScale: options.logoDataUrl ? options.logoScale : 0,
    payloadLength,
  });

  const renderedItems = items.map((item) => ({ level: item.level, message: item.message }));
  const logoWarning = getLogoMismatchWarning(logoSelection, currentPayload);
  if (logoWarning) renderedItems.push({ level: "warning", message: logoWarning });
  if (currentPayload.trim() && options.logoDataUrl && options.logoBackground === "none") {
    renderedItems.push({ level: "info", message: "Logo background is off. Use high error correction and test the scan." });
  }
  if (currentPayload.trim() && options.moduleStyle !== "classic") {
    renderedItems.push({ level: "warning", message: "Stylized modules may scan less reliably. Test with a phone before printing." });
  }
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


function confidenceLabel(result: ScanConfidenceResult): string {
  return result.level.charAt(0).toUpperCase() + result.level.slice(1);
}

function renderScanConfidence(result: ScanConfidenceResult | null, checking = false): void {
  const badge = document.querySelector<HTMLSpanElement>("#scanConfidenceBadge");
  const fixButton = document.querySelector<HTMLButtonElement>("#autoFixButton");
  const details = document.querySelector<HTMLDetailsElement>("#scanTestDetails");
  const caseList = document.querySelector<HTMLUListElement>("#scanCaseResults");
  if (!badge || !fixButton || !details || !caseList) return;

  if (checking) {
    badge.dataset.level = "checking";
    badge.textContent = "Checking locally...";
    fixButton.hidden = true;
    details.hidden = true;
    return;
  }

  if (!result) {
    badge.dataset.level = "unavailable";
    badge.textContent = "Local scan check: Waiting for QR";
    fixButton.hidden = true;
    details.hidden = true;
    caseList.innerHTML = "";
    return;
  }

  badge.dataset.level = result.level;
  badge.textContent = result.level === "unavailable"
    ? "Local scan check: Unavailable"
    : `Local scan check: ${confidenceLabel(result)} \u2014 passed ${result.passed} of ${result.total} simulations`;
  fixButton.hidden = result.level !== "risky" && result.level !== "poor";
  details.hidden = result.cases.length === 0;
  caseList.innerHTML = result.cases
    .map((item) => `<li><span>${escapeHtml(item.label)}</span><strong>${item.passed ? "Passed" : "Failed"}</strong></li>`)
    .join("");
}

function scheduleLocalScanCheck(): void {
  if (pendingScanTimer) window.clearTimeout(pendingScanTimer);
  pendingScanTimer = 0;
  const runId = latestScanRun.next();
  const svg = currentSvg;
  const payload = currentPayload;

  if (!svg || !payload.trim()) {
    renderScanConfidence(null);
    return;
  }

  renderScanConfidence(null);
  pendingScanTimer = window.setTimeout(async () => {
    pendingScanTimer = 0;
    if (!latestScanRun.isCurrent(runId)) return;
    renderScanConfidence(null, true);
    const result = await testQrSvg(svg, payload);
    if (!latestScanRun.isCurrent(runId)) return;
    renderScanConfidence(result);
  }, 550);
}

function writeColorControl(id: ColorControlId, value: string): void {
  const picker = document.querySelector<HTMLInputElement>(`#${id}`);
  const hex = document.querySelector<HTMLInputElement>(`#${id}Hex`);
  const swatch = document.querySelector<HTMLSpanElement>(`#${id}Swatch`);
  if (picker) picker.value = value.slice(0, 7);
  if (hex) {
    hex.value = value;
    hex.setAttribute("aria-invalid", "false");
  }
  if (swatch) swatch.style.setProperty("--swatch-color", value);
}

function applyAutomaticFix(): void {
  if (!currentPayload.trim()) return;
  const options = getRenderOptions();
  const fixed = calculateAutoFixValues({
    margin: options.margin,
    ecc: chooseAutoFixErrorCorrection(currentPayload, options.ecc, eccChangedManually),
    logoScale: options.logoScale,
    rounded: options.rounded,
    transparentBackground: options.transparentBackground,
    foreground: options.foreground,
    finderColor: options.finderColor,
    background: options.background,
  });

  const margin = document.querySelector<HTMLInputElement>("#margin");
  const ecc = document.querySelector<HTMLSelectElement>("#ecc");
  const logoScale = document.querySelector<HTMLInputElement>("#logoScale");
  const rounded = document.querySelector<HTMLInputElement>("#rounded");
  const transparent = document.querySelector<HTMLInputElement>("#transparentBackground");
  if (margin) margin.value = String(fixed.margin);
  if (ecc) ecc.value = fixed.ecc;
  if (logoScale) logoScale.value = String(fixed.logoScale);
  if (rounded) rounded.value = String(fixed.rounded);
  if (transparent) transparent.checked = false;
  if (fixed.ecc !== options.ecc) eccChangedManually = false;

  if (
    fixed.foreground !== options.foreground ||
    fixed.finderColor !== options.finderColor ||
    fixed.background !== options.background
  ) {
    const colorMode = document.querySelector<HTMLSelectElement>("#colorMode");
    if (colorMode) colorMode.value = "custom";
    writeColorControl("foreground", fixed.foreground);
    writeColorControl("finderColor", fixed.finderColor);
    writeColorControl("background", fixed.background);
    updateCustomColorPanel();
  }

  updateQr();
}

async function importQrImage(file: File): Promise<void> {
  const status = document.querySelector<HTMLParagraphElement>("#qrImportStatus");
  const quickContent = document.querySelector<HTMLTextAreaElement>("#autoContent");
  if (!status || !quickContent) return;

  status.textContent = "Reading QR locally...";
  try {
    const decoded = await decodeQrImageFile(file);
    if (!decoded) {
      status.textContent = "No QR code found. Current content kept.";
      return;
    }

    const detection = detectQrContent(decoded.data);
    quickContent.value = decoded.data;
    categorySelection = AUTO_CATEGORY_VALUE;
    syncLogoFromQuickContent(decoded.data);
    applyDetectionResult(detection);
    status.textContent = "QR imported locally";
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "This QR image could not be read.";
  } finally {
    const picker = document.querySelector<HTMLInputElement>("#qrImport");
    if (picker) picker.value = "";
  }
}

function isExportFormat(value: string | undefined): value is ExportFormat {
  return value !== undefined && value in EXPORT_FORMAT_GUIDANCE;
}

function updateFormatGuidance(format: ExportFormat): void {
  const name = document.querySelector<HTMLElement>("#formatGuidanceName");
  const text = document.querySelector<HTMLElement>("#formatGuidanceText");
  if (name) name.textContent = format.toUpperCase();
  if (text) text.textContent = EXPORT_FORMAT_GUIDANCE[format];
}

function selectExportFormat(format: ExportFormat): void {
  selectedExportFormat = format;
  updateFormatGuidance(format);
  document.querySelectorAll<HTMLButtonElement>("[data-export]").forEach((button) => {
    const selected = button.dataset.export === format;
    button.setAttribute("aria-pressed", String(selected));
    button.classList.toggle("is-selected", selected);
  });
  const label = document.querySelector<HTMLElement>("#downloadSelectedLabel");
  if (label) label.textContent = `Download ${format.toUpperCase()}`;
  update3dPreviewVisibility(format);
}

function updateExportAvailability(available: boolean): void {
  document.querySelectorAll<HTMLButtonElement>("[data-export]").forEach((button) => {
    button.disabled = !available;
  });
  const mobileToggle = document.querySelector<HTMLButtonElement>("#mobileExportToggle");
  if (mobileToggle) mobileToggle.disabled = !available;
  const downloadButton = document.querySelector<HTMLButtonElement>("#downloadSelectedButton");
  if (downloadButton) {
    downloadButton.disabled = !available;
    downloadButton.hidden = !available;
  }
  const copyButton = document.querySelector<HTMLButtonElement>("#copyImage");
  const shareButton = document.querySelector<HTMLButtonElement>("#shareImage");
  if (copyButton) copyButton.disabled = !available;
  if (shareButton) shareButton.disabled = !available;
  updateNativeActionLayout();
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
  update3dGuidance();
  draw3dPreview();
  const previewZone = document.querySelector<HTMLElement>(".preview-zone");
  if (previewZone) previewZone.dataset.contentState = currentPayload.trim() ? "ready" : "empty";
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
    scheduleLocalScanCheck();
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
    scheduleLocalScanCheck();
  } catch (error) {
    if (previewZone) previewZone.dataset.contentState = "error";
    currentSvg = "";
    preview.innerHTML = "<div class=\"empty-state error\">This content is too long for a QR code.</div>";
    stats.textContent = "Data too long";
    updateMobilePreview("<span class=\"mini-empty\">!</span>", "Data too long", "error");
    updateExportAvailability(false);
    renderWarnings(options, currentPayload.length, [error instanceof Error ? error.message : "QR generation failed"]);
    scheduleLocalScanCheck();
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

  const extension = format as ExportExtension;
  const filename = exportFilename(currentMode, collectPayloadFields(), extension);
  if (status) status.textContent = "Preparing " + format.toUpperCase() + "...";

  try {
    const renderOptions = getRenderOptions();
    let downloadedFilename = filename;
    if (format === "svg") downloadBlob(svgBlob(currentSvg), filename);
    if (format === "png") downloadBlob(await svgToRasterBlob(currentSvg, "image/png"), filename);
    if (format === "webp") downloadBlob(await svgToRasterBlob(currentSvg, "image/webp"), filename);
    if (format === "pdf") downloadBlob(await svgToPdfBlob(currentSvg), filename);
    if (format === "stl") downloadBlob(stlBlob(createQrCode(currentPayload, renderOptions.ecc), get3dOptions(renderOptions)), filename);
    if (format === "3mf") downloadBlob(await threeMfBlob(createQrCode(currentPayload, renderOptions.ecc), get3dOptions(renderOptions)), filename);
    if (format === "obj") {
      downloadedFilename = filename.replace(/\.obj$/i, "-obj.zip");
      downloadBlob(await objZipBlob(createQrCode(currentPayload, renderOptions.ecc), get3dOptions(renderOptions)), downloadedFilename);
    }
    if (status) status.textContent = "Downloaded " + downloadedFilename + ".";
  } catch {
    if (status) status.textContent = "Export failed. Try another format.";
  }
}


function updateNativeActionLayout(): void {
  const actions = document.querySelector<HTMLDivElement>("#nativeExportActions");
  const copyButton = document.querySelector<HTMLButtonElement>("#copyImage");
  const shareButton = document.querySelector<HTMLButtonElement>("#shareImage");
  if (!actions) return;
  const downloadButton = document.querySelector<HTMLButtonElement>("#downloadSelectedButton");
  const visibleCount = Number(Boolean(copyButton && !copyButton.hidden)) + Number(Boolean(shareButton && !shareButton.hidden)) + Number(Boolean(downloadButton && !downloadButton.hidden));
  actions.dataset.count = String(visibleCount);
  actions.hidden = visibleCount === 0;
}

function updateNativeActionVisibility(): void {
  const copyButton = document.querySelector<HTMLButtonElement>("#copyImage");
  const shareButton = document.querySelector<HTMLButtonElement>("#shareImage");
  if (copyButton) copyButton.hidden = !supportsPngClipboard();
  if (shareButton) {
    if (typeof File === "undefined") {
      shareButton.hidden = true;
    } else {
      const probe = new File([new Uint8Array()], "sayaqr.png", { type: "image/png" });
      shareButton.hidden = !supportsPngFileShare(probe);
    }
  }
  updateNativeActionLayout();
}

async function copyCurrentImage(): Promise<void> {
  const status = document.querySelector<HTMLParagraphElement>("#exportStatus");
  if (!currentSvg || !currentPayload.trim() || !supportsPngClipboard()) return;
  if (status) status.textContent = "Copying PNG...";
  try {
    const png = await svgToRasterBlob(currentSvg, "image/png");
    await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
    if (status) status.textContent = "QR image copied";
  } catch {
    if (status) status.textContent = "Image clipboard is unavailable in this browser.";
  }
}

async function shareCurrentImage(): Promise<void> {
  const status = document.querySelector<HTMLParagraphElement>("#exportStatus");
  if (!currentSvg || !currentPayload.trim()) return;
  try {
    const png = await svgToRasterBlob(currentSvg, "image/png");
    const file = new File(
      [png],
      exportFilename(currentMode, collectPayloadFields(), "png"),
      { type: "image/png" },
    );
    if (!supportsPngFileShare(file)) {
      const button = document.querySelector<HTMLButtonElement>("#shareImage");
      if (button) button.hidden = true;
      updateNativeActionLayout();
      return;
    }
    if (status) status.textContent = "Opening share sheet...";
    await navigator.share(makeShareData(file));
    if (status) status.textContent = "QR image shared";
  } catch (error) {
    if (isShareCancellation(error)) {
      if (status) status.textContent = "";
      return;
    }
    if (status) status.textContent = "Sharing is unavailable in this browser.";
  }
}

function applyShareTargetFromUrl(): boolean {
  const params = new URLSearchParams(window.location.search);
  const hasShareParams = ["title", "text", "url"].some((key) => params.has(key));
  if (!hasShareParams) return false;

  const value = selectShareTargetValue(params);
  window.history.replaceState(null, "", removeShareTargetParams(window.location.href));
  if (!value) return false;

  const quickContent = document.querySelector<HTMLTextAreaElement>("#autoContent");
  if (!quickContent) return false;
  quickContent.value = value;
  categorySelection = AUTO_CATEGORY_VALUE;
  updateFromQuickContent(value);
  return true;
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

function canEncodeBatchPayload(payload: string): boolean {
  const ecc = getRenderOptions().ecc;
  try {
    createQrCode(payload, ecc);
    return true;
  } catch {
    return false;
  }
}

function batchSummaryText(result: BatchValidationResult): string {
  const parts = [`${result.generatableCount} ready`];
  if (result.counts.empty) parts.push(`${result.counts.empty} empty`);
  if (result.counts.invalid) parts.push(`${result.counts.invalid} invalid`);
  if (result.counts.duplicateFilename) parts.push(`${result.counts.duplicateFilename} renamed`);
  if (result.counts.tooLong) parts.push(`${result.counts.tooLong} too long`);
  return parts.join(", ");
}

function fullBatchReport(rows: BatchValidationRow[]): string {
  const header = "row\tstatus\treason\trequested filename\toutput filename";
  const lines = rows.map((row) =>
    [row.row, row.status, row.reason, row.requestedFilename, row.outputFilename].join("\t"),
  );
  return [header, ...lines].join("\n");
}

function renderBatchValidation(result: BatchValidationResult): void {
  const summary = document.querySelector<HTMLSpanElement>("#batchSummary");
  const exportButton = document.querySelector<HTMLButtonElement>("#exportZip");
  const preview = document.querySelector<HTMLDivElement>("#batchPreview");
  const details = document.querySelector<HTMLDetailsElement>("#batchReportDetails");
  const report = document.querySelector<HTMLTextAreaElement>("#batchFullReport");
  if (!summary || !exportButton || !preview || !details || !report) return;

  summary.textContent = batchSummaryText(result);
  exportButton.disabled = batchGenerating || result.generatableCount === 0;
  const examples = [
    ...result.rows.filter((row) => row.status !== "ready"),
    ...result.rows.filter((row) => row.status === "ready"),
  ].slice(0, 5);
  preview.innerHTML = examples.map((row) => {
    const snippet = row.payload.length > 72 ? `${row.payload.slice(0, 69)}...` : row.payload || "(empty)";
    return `<span class="batch-example" data-status="${row.status}"><strong>Row ${row.row}: ${escapeHtml(row.status.replace(/-/g, " "))}</strong><small>${escapeHtml(snippet)} · ${escapeHtml(row.reason)}</small></span>`;
  }).join("");
  details.hidden = result.rows.length === 0;
  report.value = fullBatchReport(result.rows);
}

function refreshBatchValidation(): BatchValidationResult | null {
  const contentColumn = document.querySelector<HTMLSelectElement>("#csvContentColumn")?.value ?? "";
  const filenameColumn = document.querySelector<HTMLSelectElement>("#csvNameColumn")?.value ?? "";
  if (!batchData || !contentColumn) {
    batchValidation = null;
    return null;
  }
  batchValidation = validateBatchRows(batchData, contentColumn, filenameColumn, canEncodeBatchPayload);
  renderBatchValidation(batchValidation);
  return batchValidation;
}

async function loadBatchFile(file: File): Promise<void> {
  const fileName = document.querySelector<HTMLElement>("#batchFileName");
  const summary = document.querySelector<HTMLSpanElement>("#batchSummary");
  const lowerName = file.name.toLowerCase();
  const isCsv = lowerName.endsWith(".csv") || file.type === "text/csv";
  const isTextList = lowerName.endsWith(".txt") || (!isCsv && file.type === "text/plain");
  if (!isTextList && !isCsv) {
    if (summary) summary.textContent = "Choose CSV or TXT";
    return;
  }

  if (fileName) {
    fileName.textContent = file.name;
    fileName.title = file.name;
  }
  try {
    const text = await file.text();
    batchData = isTextList ? parseTextList(text) : parseCsv(text);
    populateBatchSelectors(batchData);
  } catch {
    if (summary) summary.textContent = "File could not be read";
  }
}

function populateBatchSelectors(data: CsvData): void {
  const content = document.querySelector<HTMLSelectElement>("#csvContentColumn");
  const names = document.querySelector<HTMLSelectElement>("#csvNameColumn");
  const summary = document.querySelector<HTMLSpanElement>("#batchSummary");
  if (!content || !names || !summary) return;

  const options = data.headers.map((header) => `<option value="${escapeHtml(header)}">${escapeHtml(header)}</option>`).join("");
  content.innerHTML = options;
  names.innerHTML = `<option value="">Sequential filenames</option>${options}`;
  content.disabled = data.headers.length === 0;
  names.disabled = data.headers.length === 0;
  content.value = suggestContentColumn(data.headers);
  names.value = suggestFilenameColumn(data.headers);
  summary.textContent = `${data.rows.length} rows loaded`;
  refreshBatchValidation();
}

function downloadSampleCsv(): void {
  const sample = "content,filename\r\nhttps://example.com,example\r\nHello from SayaQR,greeting\r\n";
  downloadBlob(new Blob([sample], { type: "text/csv;charset=utf-8" }), "sayaqr-sample.csv");
}

function updateBatchProgress(processed: number, total: number, generated: number, skipped: number): void {
  const progress = document.querySelector<HTMLProgressElement>("#batchProgressBar");
  const generatedLabel = document.querySelector<HTMLSpanElement>("#batchGeneratedCount");
  const skippedLabel = document.querySelector<HTMLSpanElement>("#batchSkippedCount");
  if (progress) {
    progress.max = Math.max(1, total);
    progress.value = processed;
  }
  if (generatedLabel) generatedLabel.textContent = `${generated} generated`;
  if (skippedLabel) skippedLabel.textContent = `${skipped} skipped`;
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

async function exportBatchZip(): Promise<void> {
  const validation = refreshBatchValidation();
  const format = document.querySelector<HTMLSelectElement>("#batchFormat")?.value ?? "svg";
  const button = document.querySelector<HTMLButtonElement>("#exportZip");
  const progressPanel = document.querySelector<HTMLDivElement>("#batchProgress");
  const cancelButton = document.querySelector<HTMLButtonElement>("#cancelBatch");
  if (!batchData || !validation || !button || batchGenerating || validation.generatableCount === 0) return;

  batchGenerating = true;
  batchCancellation.reset();
  button.disabled = true;
  button.textContent = "Generating...";
  if (progressPanel) progressPanel.hidden = false;
  if (cancelButton) cancelButton.hidden = false;

  const options = getRenderOptions();
  const files: ZipInputFile[] = [];
  const runtimeSkipped: BatchValidationRow[] = [];
  let processed = 0;
  let generated = 0;
  let skipped = 0;
  updateBatchProgress(0, validation.rows.length, 0, 0);

  try {
    for (const row of validation.rows) {
      if (batchCancellation.isCancelled) break;
      processed += 1;

      if (!row.generatable) {
        skipped += 1;
      } else {
        try {
          const qr = createQrCode(row.payload, options.ecc);
          const svg = buildSvgFromQr(qr, options);
          if (format === "svg") {
            files.push({ name: `${row.outputFilename}.svg`, data: svg });
          } else if (format === "pdf") {
            files.push({ name: `${row.outputFilename}.pdf`, data: await svgToPdfBlob(svg) });
          } else if (format === "stl") {
            files.push({ name: `${row.outputFilename}.stl`, data: stlBlob(qr, get3dOptions(options)) });
          } else if (format === "3mf") {
            files.push({ name: `${row.outputFilename}.3mf`, data: await threeMfBlob(qr, get3dOptions(options)) });
          } else if (format === "obj") {
            const bundle = await objZipBlob(qr, get3dOptions(options));
            files.push({ name: `${row.outputFilename}-obj.zip`, data: bundle });
          } else {
            const mime = format === "webp" ? "image/webp" : "image/png";
            files.push({ name: `${row.outputFilename}.${format}`, data: await svgToRasterBlob(svg, mime) });
          }
          generated += 1;
        } catch {
          skipped += 1;
          runtimeSkipped.push({ ...row, status: "invalid", reason: "Generation failed", generatable: false });
        }
      }

      updateBatchProgress(processed, validation.rows.length, generated, skipped);
      if (processed % 8 === 0) await yieldToBrowser();
    }

    if (batchCancellation.isCancelled) {
      const remaining = validation.rows.length - processed;
      updateBatchProgress(processed, validation.rows.length, generated, skipped + remaining);
      button.textContent = `Cancelled after ${generated}`;
      return;
    }

    const reportRows = [...validation.rows, ...runtimeSkipped];
    if (validation.skippedCount > 0 || runtimeSkipped.length > 0) {
      files.push({ name: "batch-report.csv", data: buildBatchReportCsv(reportRows) });
    }
    downloadBlob(await createZip(files), "sayaqr-batch.zip");
    button.textContent = `Exported ${generated}`;
  } catch {
    button.textContent = "Export failed";
  } finally {
    batchGenerating = false;
    batchCancellation.reset();
    if (cancelButton) cancelButton.hidden = true;
    window.setTimeout(() => {
      button.textContent = "Export ZIP";
      button.disabled = (batchValidation?.generatableCount ?? 0) === 0;
    }, 1200);
  }
}

function wireEvents(): void {
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    if (target.closest("#resetDesign")) {
      resetDesignControls();
      return;
    }

    if (target.closest("#downloadSampleCsv")) {
      downloadSampleCsv();
      return;
    }

    if (target.closest("#cancelBatch")) {
      batchCancellation.cancel();
      return;
    }

    if (target.closest("#autoFixButton")) {
      applyAutomaticFix();
      return;
    }

    if (target.closest("#copyImage")) {
      void copyCurrentImage();
      return;
    }

    if (target.closest("#shareImage")) {
      void shareCurrentImage();
      return;
    }

    if (target.closest("#downloadSelectedButton")) {
      void exportCurrent(selectedExportFormat);
      return;
    }

    if (target.closest("#mobileExportToggle")) {
      toggleMobileExportMenu();
      return;
    }

    const exportButton = target.closest<HTMLElement>("[data-export]");
    const exportFormat = exportButton?.dataset.export;
    if (isExportFormat(exportFormat)) {
      selectExportFormat(exportFormat);
      setMobileExportMenu(false);
      return;
    }

    if (!target.closest(".mobile-export")) setMobileExportMenu(false);

    if (target.closest("#mobilePreviewDock")) {
      document.querySelector("#qrPreview")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }


  });
  const formatActionRow = document.querySelector<HTMLDivElement>(".format-action-row");
  const showFormatGuidance = (target: EventTarget | null): void => {
    if (!(target instanceof Element)) return;
    const format = target.closest<HTMLButtonElement>("[data-export]")?.dataset.export;
    if (isExportFormat(format)) updateFormatGuidance(format);
  };
  formatActionRow?.addEventListener("pointerover", (event) => {
    showFormatGuidance(event.target);
  });
  formatActionRow?.addEventListener("pointerleave", () => {
    if (!formatActionRow.contains(document.activeElement)) updateFormatGuidance(selectedExportFormat);
  });
  formatActionRow?.addEventListener("focusin", (event) => {
    showFormatGuidance(event.target);
  });
  formatActionRow?.addEventListener("focusout", () => {
    queueMicrotask(() => {
      if (!formatActionRow.contains(document.activeElement)) updateFormatGuidance(selectedExportFormat);
    });
  });


  document.addEventListener("input", (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
      if (target.id === "autoContent") {
        updateFromQuickContent(target.value);
        return;
      }

      if (target.id === "rememberDesign") {
        handleDesignMemoryToggle((target as HTMLInputElement).checked);
        return;
      }

      if (target.id === "colorMode") {
        updateCustomColorPanel();
        updateModuleStyleHint();
        scheduleQrUpdate();
        persistDesignIfEnabled();
        return;
      }

      if (target.id === "model3dProfile") {
        update3dProfile();
        scheduleQrUpdate();
        return;
      }

      if (target.id === "foreground" || target.id === "finderColor" || target.id === "background" || target.id === "logoStrokeColor") {
        syncColorControl(target.id, "picker");
        scheduleQrUpdate();
        persistDesignIfEnabled();
        return;
      }

      if (target.id === "foregroundHex" || target.id === "finderColorHex" || target.id === "backgroundHex" || target.id === "logoStrokeColorHex") {
        const colorId = target.id.replace("Hex", "") as ColorControlId;
        if (!isCompleteHexColorEntry(target.value)) {
          markIncompleteHexColor(colorId);
          return;
        }
        if (syncColorControl(colorId, "hex")) {
          scheduleQrUpdate();
          persistDesignIfEnabled();
        }
        return;
      }

      const payloadField = target.getAttribute("data-payload-field");
      if (payloadField === "url" || payloadField === "website" || payloadField === "payeeAddress") {
        syncLogoFromQuickContent(target.value);
      }

      if (DESIGN_CONTROL_IDS.has(target.id)) {
        if (target.id === "ecc") eccChangedManually = true;
        if (target.id === "moduleStyle") updateModuleStyleHint();
        persistDesignIfEnabled();
        if (target.id === "ecc") refreshBatchValidation();
      }

      const excluded = ["csvUpload", "logoUpload", "qrImport", "csvContentColumn", "csvNameColumn", "batchFormat"];
      if (target.id === "logoStroke") updateLogoStrokeColorVisibility();
      if (!excluded.includes(target.id)) scheduleQrUpdate();
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

  document.querySelector<HTMLButtonElement>("#customizeStyleColors")?.addEventListener("click", () => {
    const colorMode = document.querySelector<HTMLSelectElement>("#colorMode");
    if (colorMode) colorMode.value = "custom";
    updateCustomColorPanel();
    updateModuleStyleHint();
    document.querySelector<HTMLInputElement>("#foregroundHex")?.focus();
    scheduleQrUpdate();
    persistDesignIfEnabled();
  });

  document.querySelector<HTMLInputElement>("#logoUpload")?.addEventListener("change", async (event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    const status = document.querySelector<HTMLParagraphElement>("#logoUploadStatus");
    if (!file) {
      clearCenterLogo(true);
      updateLogoUploadName();
      if (status) status.textContent = "";
      return;
    }

    updateLogoUploadName(file.name);
    if (status) status.textContent = "Processing logo locally...";
    try {
      logoDataUrl = await rasterizeImageFileToPng(file);
      logoSelection = "custom";
      logoAutoApplied = false;
      logoAutoSuppressedFor = "";
      updateLogoPresetState();
      if (status) status.textContent = "Custom logo rasterized locally.";
      scheduleQrUpdate();
    } catch (error) {
      input.value = "";
      updateLogoUploadName();
      if (status) status.textContent = error instanceof Error ? error.message : "This logo could not be decoded.";
    }
  });

  document.querySelector<HTMLInputElement>("#qrImport")?.addEventListener("change", (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) void importQrImage(file);
  });

  const quickDropZone = document.querySelector<HTMLDivElement>("#quickContentDropZone");
  quickDropZone?.addEventListener("dragenter", (event) => {
    event.preventDefault();
    quickDropZone.classList.add("is-dragging");
  });
  quickDropZone?.addEventListener("dragover", (event) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    quickDropZone.classList.add("is-dragging");
  });
  quickDropZone?.addEventListener("dragleave", (event) => {
    const next = event.relatedTarget;
    if (!(next instanceof Node) || !quickDropZone.contains(next)) quickDropZone.classList.remove("is-dragging");
  });
  quickDropZone?.addEventListener("drop", (event) => {
    event.preventDefault();
    quickDropZone.classList.remove("is-dragging");
    const file = Array.from(event.dataTransfer?.files ?? []).find((item) => item.type.startsWith("image/"));
    if (file) void importQrImage(file);
    else {
      const status = document.querySelector<HTMLParagraphElement>("#qrImportStatus");
      if (status) status.textContent = "Drop a supported QR image.";
    }
  });

  document.querySelector<HTMLTextAreaElement>("#autoContent")?.addEventListener("paste", (event) => {
    const imageItem = Array.from(event.clipboardData?.items ?? []).find((item) => item.type.startsWith("image/"));
    const file = imageItem?.getAsFile();
    if (!file) return;
    event.preventDefault();
    void importQrImage(file);
  });

  document.querySelector<HTMLInputElement>("#csvUpload")?.addEventListener("change", (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) void loadBatchFile(file);
  });
  const batchFileDropZone = document.querySelector<HTMLElement>("#batchFileDropZone");
  batchFileDropZone?.addEventListener("dragenter", (event) => {
    event.preventDefault();
    batchFileDropZone.classList.add("is-dragging");
  });
  batchFileDropZone?.addEventListener("dragover", (event) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    batchFileDropZone.classList.add("is-dragging");
  });
  batchFileDropZone?.addEventListener("dragleave", (event) => {
    if (!(event.relatedTarget instanceof Node) || !batchFileDropZone.contains(event.relatedTarget)) {
      batchFileDropZone.classList.remove("is-dragging");
    }
  });
  batchFileDropZone?.addEventListener("drop", (event) => {
    event.preventDefault();
    batchFileDropZone.classList.remove("is-dragging");
    const file = event.dataTransfer?.files[0];
    if (file) void loadBatchFile(file);
  });
  document.querySelector<HTMLSelectElement>("#csvContentColumn")?.addEventListener("change", refreshBatchValidation);
  document.querySelector<HTMLSelectElement>("#csvNameColumn")?.addEventListener("change", refreshBatchValidation);
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
restoreDesignPreferences();
wireEvents();
wire3dPreviewControls();
updateCustomColorPanel();
updateLogoStrokeColorVisibility();
updateModuleStyleHint();
updateNativeActionVisibility();
const hasShareTargetContent = applyShareTargetFromUrl();
if (!hasShareTargetContent) {
  updateFromQuickContent(document.querySelector<HTMLTextAreaElement>("#autoContent")?.value ?? "");
}
updateQr();
registerServiceWorker();



