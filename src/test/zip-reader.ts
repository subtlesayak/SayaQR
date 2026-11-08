export async function zipText(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer(), bytes = new Uint8Array(buffer), view = new DataView(buffer);
  const output: string[] = [];
  for (let offset = 0; view.getUint32(offset, true) === 0x04034b50;) {
    const method = view.getUint16(offset + 8, true), size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true), extra = view.getUint16(offset + 28, true);
    const start = offset + 30 + nameLength + extra;
    output.push(new TextDecoder().decode(bytes.slice(offset + 30, offset + 30 + nameLength)));
    const data = new Blob([bytes.slice(start, start + size)]);
    output.push(method === 8 ? await new Response(data.stream().pipeThrough(new DecompressionStream("deflate-raw"))).text() : await data.text());
    offset = start + size;
  }
  return output.join("\n");
}
