import { parseReceipt } from './receipt-parser.js';

let libraryPromise;
function loadLibrary() {
  libraryPromise ||= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/ocr/tesseract.min.js';
    script.onload = () => resolve(window.Tesseract);
    script.onerror = () => {
      libraryPromise = null;
      script.remove();
      reject(new Error('โหลดระบบอ่านใบเสร็จไม่ได้'));
    };
    document.head.append(script);
  });
  return libraryPromise;
}

async function prepareImage(file) {
  if (file.size > 20 * 1024 * 1024) throw new Error('รูปใบเสร็จต้องไม่เกิน 20 MB');
  let bitmap;
  let release;
  try {
    bitmap = await createImageBitmap(file);
    release = () => bitmap.close();
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      bitmap = image;
      release = () => URL.revokeObjectURL(url);
    } catch {
      URL.revokeObjectURL(url);
      throw new Error('เปิดรูปไม่ได้ กรุณาลองใช้ไฟล์ JPG หรือ PNG');
    }
  }
  try {
    const scale = Math.min(2, 2600 / Math.max(bitmap.width || bitmap.naturalWidth,
      bitmap.height || bitmap.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d', {willReadFrequently: true});
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < image.data.length; i += 4) {
      const red = image.data[i], green = image.data[i + 1], blue = image.data[i + 2];
      // Remove red approval stamps while retaining black text beneath them.
      if (red > green + 25 && red > blue + 25 && red > 110) {
        image.data[i] = 255;
        image.data[i + 1] = 255;
        image.data[i + 2] = 255;
      }
    }
    context.putImageData(image, 0, 0);
    return await new Promise((resolve, reject) =>
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('เตรียมรูปไม่ได้')),
        'image/png'));
  } finally {
    release();
  }
}

export async function scanReceipt(file, knownItems, progress) {
  const image = await prepareImage(file);
  const tesseract = await loadLibrary();
  const worker = await tesseract.createWorker(['tha', 'eng'], 1, {
    workerPath: '/ocr/worker.min.js', corePath: '/ocr/core', langPath: '/ocr/lang',
    workerBlobURL: false,
    logger: (event) => progress?.(Math.round((event.progress || 0) * 100)),
  });
  try {
    const {data} = await worker.recognize(image);
    return {text: data.text || '', rows: parseReceipt(data.text || '', knownItems)};
  } finally {
    await worker.terminate();
  }
}
