import { createReceiptOcrHandlers } from "../lib/receipt-ocr.js";
const handlers = createReceiptOcrHandlers();
export const GET = handlers.GET;
export const POST = handlers.POST;
export const maxDuration = 60;
