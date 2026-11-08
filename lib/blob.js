import {
  BlobNotFoundError,
  BlobPreconditionFailedError,
  del,
  get,
  head,
  put,
} from "@vercel/blob";
import { HttpError } from "./http.js";

const readOptions = { access: "private", useCache: false };
const conflict = () => new HttpError(409, "ข้อมูลเปลี่ยนแล้ว กรุณาโหลดใหม่");
const validVersion = (value) =>
  typeof value === "string" && value.length > 0 && !value.startsWith("W/");

export function createBlobStore(sdk = { del, get, head, put }) {
  async function metadata(path) {
    try {
      const result = await sdk.head(path);
      if (!validVersion(result.etag))
        throw new HttpError(503, "อ่านเวอร์ชันข้อมูลจากที่เก็บไม่ได้ กรุณาลองอีกครั้ง");
      return result;
    } catch (error) {
      if (error instanceof BlobNotFoundError) return null;
      throw error;
    }
  }

  return {
    async read(path) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const before = await metadata(path);
        if (!before) return null;
        const result = await sdk.get(path, readOptions);
        if (!result) continue;
        const bytes = new Uint8Array(await new Response(result.stream).arrayBuffer());
        const after = await metadata(path);
        // Download ETags can describe a compressed HTTP representation, not the stored object.
        if (after && before.etag === after.etag)
          return { bytes, version: after.etag };
      }
      throw conflict();
    },

    async write(path, bytes, { version, contentType }) {
      if (version !== null && !validVersion(version))
        throw new HttpError(503, "เวอร์ชันข้อมูลสำหรับบันทึกไม่ถูกต้อง กรุณาโหลดใหม่");
      try {
        const result = await sdk.put(path, bytes, {
          access: "private",
          contentType,
          addRandomSuffix: false,
          allowOverwrite: version !== null,
          ...(version !== null && { ifMatch: version }),
        });
        return result.etag;
      } catch (error) {
        if (error instanceof BlobPreconditionFailedError) throw conflict();
        // The SDK's create-only collision may be a generic BlobError.
        if (version === null) {
          const existing = await sdk.get(path, readOptions);
          if (existing) {
            await existing.stream?.cancel();
            throw conflict();
          }
        }
        throw error;
      }
    },

    async remove(path) {
      await sdk.del(path);
    },
  };
}

export const blobStore = createBlobStore();
