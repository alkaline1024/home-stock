import { blobStore } from "../lib/blob.js";
import { createAlertHandlers } from "../lib/alerts.js";
const handlers = createAlertHandlers(blobStore);
export const GET = handlers.GET;
export const POST = handlers.POST;
