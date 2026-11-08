import { blobStore } from '../lib/blob.js';
import { createPhotoHandlers } from '../lib/photo.js';

const handlers = createPhotoHandlers(blobStore);
export const GET = handlers.GET;
export const POST = handlers.POST;
