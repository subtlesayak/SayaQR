export function isCompleteHexColorEntry(value: string): boolean {
  return /^[#]?[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value.trim());
}
