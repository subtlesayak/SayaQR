import "./style.css";
import { detectQrContent, type DetectionResult } from "./lib/autodetect";
import { parseCsv, safeFileName, type CsvData } from "./lib/csv";
import { formatPayload, QR_MODES, type PayloadFields, type QrMode } from "./lib/payloads";
import { createQrCode } from "./lib/qr";
import { getScannabilityWarnings } from "./lib/scannability";
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
let logoDataUrl = "";
let currentPayload = "";
let currentSvg = "";
let batchData: CsvData | null = null;

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

function renderApp(): void {
  appRoot.innerHTML = `
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true"></span>
        <div>
          <h1>SayaQR</h1>
          <p>Offline QR generator</p>
        </div>
      </div>
      <div class="privacy-strip" aria-label="Privacy guarantees">
        <span>Generated locally</span>
        <span>No tracking</span>
        <span>No upload</span>
      </div>
    </header>

    <main class="workspace">
      <section class="tool-surface controls" aria-label="QR controls">
        <div class="section-heading">
          <h2>Content</h2>
          <span id="modeHint"></span>
        </div>
        <label class="field field-wide quick-content" for="autoContent"><span>Quick content</span><textarea id="autoContent" rows="3" placeholder="Paste a URL, Wi-Fi string, email, phone, vCard, UPI ID, event, or coordinates"></textarea></label>
        <div class="category-row">
          <label class="field category-select" for="modeSelect"><span>Category</span><select id="modeSelect" aria-label="QR category"></select></label>
          <button id="autoCategory" type="button">Auto category</button>
        </div>
        <p id="autoDetectStatus" class="detect-status" aria-live="polite">Paste content above, then auto-detect its category.</p>
        <form id="payloadForm" class="payload-grid"></form>

        <div class="section-heading compact"><h2>Design</h2></div>
        <div class="design-grid">
          <label class="field"><span>Foreground</span><input id="foreground" type="color" value="${DEFAULT_RENDER_OPTIONS.foreground}" /></label>
          <label class="field"><span>Background</span><input id="background" type="color" value="${DEFAULT_RENDER_OPTIONS.background}" /></label>
          <label class="switch"><input id="transparentBackground" type="checkbox" /><span>Transparent background</span></label>
          <label class="field"><span>Quiet zone <strong id="marginValue">4</strong></span><input id="margin" type="range" min="0" max="10" value="4" /></label>
          <label class="field"><span>Module size <strong id="moduleSizeValue">12</strong></span><input id="moduleSize" type="range" min="4" max="28" value="12" /></label>
          <label class="field"><span>Rounded modules <strong id="roundedValue">12%</strong></span><input id="rounded" type="range" min="0" max="1" step="0.05" value="0.12" /></label>
          <label class="field"><span>Finder style</span><select id="finderStyle"><option value="square">Square</option><option value="rounded" selected>Rounded</option><option value="circle">Circle</option></select></label>
          <label class="field"><span>Error correction</span><select id="ecc"><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="QUARTILE">Quartile</option><option value="HIGH" selected>High</option></select></label>
          <label class="field field-wide"><span>Center logo</span><input id="logoUpload" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" /></label>
          <label class="field"><span>Logo size <strong id="logoSizeValue">18%</strong></span><input id="logoScale" type="range" min="0.05" max="0.35" step="0.01" value="0.18" /></label>
        </div>
      </section>

      <section class="tool-surface preview-zone" aria-label="QR preview">
        <div class="preview-header">
          <div>
            <h2>Preview</h2>
            <p id="qrStats">Ready</p>
          </div>
          <div id="offlineStatus" class="status-pill">Offline ready</div>
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

      <section class="tool-surface batch-zone" aria-label="Batch mode">
        <div class="section-heading"><h2>Batch CSV</h2><span id="batchSummary">No CSV loaded</span></div>
        <div class="batch-grid">
          <label class="field field-wide"><span>CSV file</span><input id="csvUpload" type="file" accept=".csv,text/csv" /></label>
          <label class="field"><span>Content column</span><select id="csvContentColumn" disabled></select></label>
          <label class="field"><span>Filename column</span><select id="csvNameColumn" disabled></select></label>
          <label class="field"><span>ZIP format</span><select id="batchFormat"><option value="svg">SVG</option><option value="png">PNG</option><option value="webp">WebP</option><option value="pdf">PDF</option></select></label>
          <button id="exportZip" type="button" disabled>Export ZIP</button>
        </div>
        <div id="batchPreview" class="batch-preview"></div>
      </section>
    </main>
  `;
}

function renderModeTabs(): void {
  const select = document.querySelector<HTMLSelectElement>("#modeSelect");
  const hint = document.querySelector<HTMLSpanElement>("#modeHint");
  if (!select || !hint) return;
  select.innerHTML = QR_MODES.map(
    (mode) => `<option value="${mode.id}" ${mode.id === currentMode ? "selected" : ""}>${mode.label}</option>`,
  ).join("");
  select.value = currentMode;
  hint.textContent = QR_MODES.find((mode) => mode.id === currentMode)?.hint ?? "";
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

function applyAutoCategory(): void {
  const input = document.querySelector<HTMLTextAreaElement>("#autoContent");
  if (!input) return;
  const detection = detectQrContent(input.value);
  currentMode = detection.mode;
  renderModeTabs();
  renderPayloadFields();
  setPayloadFields(detection.fields);
  updateDetectionStatus(detection);
  updateQr();
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
  const foreground = document.querySelector<HTMLInputElement>("#foreground")?.value || DEFAULT_RENDER_OPTIONS.foreground;
  const background = document.querySelector<HTMLInputElement>("#background")?.value || DEFAULT_RENDER_OPTIONS.background;
  const transparentBackground = document.querySelector<HTMLInputElement>("#transparentBackground")?.checked ?? false;
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
    renderWarnings(options, 0);
    return;
  }

  try {
    const qr = createQrCode(currentPayload, options.ecc);
    currentSvg = buildSvgFromQr(qr, options);
    preview.innerHTML = currentSvg;
    stats.textContent = `Version ${qr.version} | ${qr.size} x ${qr.size} modules | ${currentPayload.length} chars`;
    renderWarnings(options, currentPayload.length);
  } catch (error) {
    currentSvg = "";
    preview.innerHTML = `<div class="empty-state error">This content is too long for a QR code.</div>`;
    stats.textContent = "Data too long";
    renderWarnings(options, currentPayload.length, [error instanceof Error ? error.message : "QR generation failed"]);
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

async function exportCurrent(format: string): Promise<void> {
  if (!currentPayload.trim() || !currentSvg) return;
  const name = safeFileName(currentMode, "sayaqr");
  if (format === "svg") downloadBlob(svgBlob(currentSvg), `${name}.svg`);
  if (format === "png") downloadBlob(await svgToRasterBlob(currentSvg, "image/png"), `${name}.png`);
  if (format === "webp") downloadBlob(await svgToRasterBlob(currentSvg, "image/webp"), `${name}.webp`);
  if (format === "pdf") downloadBlob(qrPdfBlob(currentPayload, getRenderOptions()), `${name}.pdf`);
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
    if (!(target instanceof HTMLElement)) return;
    const exportFormat = target.dataset.export;
    if (exportFormat) void exportCurrent(exportFormat);
  });

  document.addEventListener("input", (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
      if (target.id === "autoContent") {
        updateDetectionStatus();
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

  document.querySelector<HTMLButtonElement>("#autoCategory")?.addEventListener("click", () => applyAutoCategory());
  document.querySelector<HTMLSelectElement>("#modeSelect")?.addEventListener("change", (event) => {
    currentMode = (event.target as HTMLSelectElement).value as QrMode;
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
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then(() => {
        if (status) status.textContent = "Offline ready";
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
updateQr();
registerServiceWorker();
