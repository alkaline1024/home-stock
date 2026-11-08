import { blobStore } from '../lib/blob.js';
import { createStockHandlers } from '../lib/stock.js';

const handlers = createStockHandlers(blobStore);
export const GET = handlers.GET;
export const POST = handlers.POST;
