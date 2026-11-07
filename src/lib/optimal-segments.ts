import { qrcodegen } from "./nayuki-qrcodegen";

const { QrSegment, QrCode } = qrcodegen;
const MODES = [QrSegment.Mode.BYTE, QrSegment.Mode.NUMERIC, QrSegment.Mode.ALPHANUMERIC];
// States retain the partial numeric triple/alphanumeric pair so costs are exact.
const STATE_MODE = [0, 1, 1, 1, 2, 2];
const FIRST_STATE = [0, 1, 4];
const NEXT_STATE = [0, 2, 3, 1, 5, 4];
const NEXT_BITS = [0, 3, 3, 4, 5, 6];

export function makeOptimalSegments(text: string, version: number): qrcodegen.QrSegment[] {
  if (!Number.isInteger(version) || version < 1 || version > 40) throw new RangeError("Invalid version");
  const chars = Array.from(text);
  if (chars.length > 7089) throw new RangeError("Data too long");
  if (chars.length === 0) return [];
  // Match the bundled encoder's rejection of unpaired UTF-16 surrogates.
  for (const char of chars) {
    const point = char.codePointAt(0)!;
    if (point >= 0xd800 && point <= 0xdfff) throw new URIError("URI malformed");
  }
  const headers = MODES.map((mode) => 4 + mode.numCharCountBits(version));
  const previous = new Int8Array(chars.length * 6).fill(-1);
  let costs = new Array<number>(6).fill(Infinity);

  for (let index = 0; index < chars.length; index++) {
    const char = chars[index];
    const point = char.codePointAt(0)!;
    const byteBits = (point < 0x80 ? 1 : point < 0x800 ? 2 : point < 0x10000 ? 3 : 4) * 8;
    const allowed = [true, /^[0-9]$/.test(char), QrSegment.isAlphanumeric(char)];
    const next = new Array<number>(6).fill(Infinity);
    const offer = (state: number, cost: number, from: number): void => {
      if (cost < next[state]) {
        next[state] = cost;
        previous[index * 6 + state] = from;
      }
    };
    for (let mode = 0; mode < MODES.length; mode++) {
      if (!allowed[mode]) continue;
      const initialBits = mode === 0 ? byteBits : mode === 1 ? 4 : 6;
      if (index === 0) offer(FIRST_STATE[mode], headers[mode] + initialBits, -1);
      for (let state = 0; state < costs.length; state++) {
        if (!Number.isFinite(costs[state])) continue;
        if (STATE_MODE[state] === mode) {
          offer(NEXT_STATE[state], costs[state] + (mode === 0 ? byteBits : NEXT_BITS[state]), state);
        } else {
          offer(FIRST_STATE[mode], costs[state] + headers[mode] + initialBits, state);
        }
      }
    }
    costs = next;
  }

  let state = costs.indexOf(Math.min(...costs));
  const modes = new Int8Array(chars.length);
  for (let index = chars.length - 1; index >= 0; index--) {
    modes[index] = STATE_MODE[state];
    state = previous[index * 6 + state];
  }
  const segments: qrcodegen.QrSegment[] = [];
  const encoder = new TextEncoder();
  for (let start = 0; start < chars.length;) {
    let end = start + 1;
    while (end < chars.length && modes[end] === modes[start]) end++;
    const part = chars.slice(start, end).join("");
    segments.push(modes[start] === 1 ? QrSegment.makeNumeric(part)
      : modes[start] === 2 ? QrSegment.makeAlphanumeric(part)
        : QrSegment.makeBytes(Array.from(encoder.encode(part))));
    start = end;
  }
  return segments;
}

export function encodeOptimally(text: string, ecc: qrcodegen.QrCode.Ecc): qrcodegen.QrCode {
  // Character-count header widths change only at versions 10 and 27.
  // A segment exceeding a group's count field cannot fit that group's capacity.
  for (const [min, max] of [[1, 9], [10, 26], [27, 40]]) {
    const segments = makeOptimalSegments(text, min);
    try {
      return QrCode.encodeSegments(segments, ecc, min, max);
    } catch (error) {
      if (!(error instanceof RangeError) || error.message !== "Data too long") throw error;
    }
  }
  throw new RangeError("Data too long");
}
