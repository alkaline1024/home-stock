import { BlobPreconditionFailedError, del, get, put } from '@vercel/blob';
import { HttpError } from './http.js';

const readOptions = { access: 'private', useCache: false };
const conflict = () => new HttpError(409, 'ข้อมูลเปลี่ยนแล้ว กรุณาโหลดใหม่');

export const blobStore = {
  async read(path) {
    const result = await get(path, readOptions);
    if (!result) return null;
    return {
      bytes: new Uint8Array(await new Response(result.stream).arrayBuffer()),
      version: result.blob.etag,
    };
  },

  async write(path, bytes, { version, contentType }) {
    try {
      const result = await put(path, bytes, {
        access: 'private',
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
        const existing = await get(path, readOptions);
        if (existing) {
          await existing.stream?.cancel();
          throw conflict();
        }
      }
      throw error;
    }
  },

  async remove(path) {
    await del(path);
  },
};
