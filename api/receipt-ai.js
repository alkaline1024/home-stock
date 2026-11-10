import {createReceiptAiHandlers} from '../lib/receipt-ai.js';

const handlers = createReceiptAiHandlers();
export const GET = handlers.GET;
export const POST = handlers.POST;
