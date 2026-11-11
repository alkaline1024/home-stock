import { blobStore } from "../lib/blob.js";
import { createCronHandler } from "../lib/alerts.js";
export const GET = createCronHandler(blobStore);
