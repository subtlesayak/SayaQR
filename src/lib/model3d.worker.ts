import { createQrCode, type ErrorCorrectionLevel } from "./qr";
import { modelTriangles, modelFaces, objZipBlob, stlBlob, threeMfBlob, validateMeshTriangles, type Qr3dModelOptions, type Qr3dMeshValidation } from "./model3d";
import type { MeshFace } from "./mesh-faces";

export interface ModelRequest { payload: string; ecc: ErrorCorrectionLevel; options: Qr3dModelOptions; format: "preview" | "stl" | "3mf" | "obj" }
export interface ModelPreview { faces: MeshFace[]; topology: Qr3dMeshValidation }

self.onmessage = async ({ data }: MessageEvent<ModelRequest>) => {
  try {
    self.postMessage({ stage: "Building mesh" });
    const qr = createQrCode(data.payload, data.ecc);
    if (data.format === "preview") {
      const parts = modelTriangles(qr, data.options);
      self.postMessage({ stage: "Checking topology" });
      const topology = validateMeshTriangles(parts);
      const faces = modelFaces(qr, data.options, false);
      self.postMessage({ result: { faces, topology } satisfies ModelPreview });
    } else {
      self.postMessage({ stage: "Packaging model" });
      const result = data.format === "stl" ? stlBlob(qr, data.options) : data.format === "3mf" ? await threeMfBlob(qr, data.options) : await objZipBlob(qr, data.options);
      self.postMessage({ result });
    }
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : "3D generation failed" });
  }
};
