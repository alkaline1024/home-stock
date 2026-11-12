# แผนฟีเจอร์ home-stock

## แผนปรับโครงสร้างหน้าจอเป็น Vue 3 + Vite

เป้าหมาย: ให้แก้แต่ละหน้าจอและฟอร์มได้ในไฟล์ของตัวเอง โดยรักษา API, ข้อมูลใน Blob/SQLite, URL, PWA และพฤติกรรมที่ใช้อยู่ปัจจุบัน การย้ายจะทำทีละ Task และแต่ละ Task ต้อง build และผ่านเทสต์ก่อน commit/push

1. **แยกโค้ดหน้าจอเดิมตามฟีเจอร์** — เสร็จแล้ว: ย้ายต้นฉบับ `app.js` ไป `src/app/` และประกอบเป็น `public/app.js` ตอน build, test และ local dev โดยผลลัพธ์ JavaScript ต้องเหมือนเดิมทุกตัวอักษร
2. **ย้าย CSS ทั้งหมดไป Tailwind CSS** — กำลังทำ: แยก CSS เดิมตามส่วนงานและตั้ง build Tailwind ก่อน จากนั้นแปลงสไตล์ใน HTML/JavaScript เป็น utility classes และย้ายค่ากลางไป `@theme` จนไม่เหลือไฟล์ CSS เดิม ตรวจหน้าจอมือถือ, dialog, animation และหน้าตัวอย่าง `/home-stock.html` ทุกช่วง
3. **ติดตั้ง Vue 3 + Vite แบบทยอยย้าย** — กำลังทำ: build Vue เป็น static asset แล้วและย้ายตัวเลขรายการซื้อเป็น component แรก ขั้นต่อไปให้ frontend build เป็น static assets ทั้งชุด, local dev เรียก API เดิมได้ และ Vercel ยังใช้ `api/` เดิม ตรวจ login, การโหลดข้อมูล, service worker และ build production
4. **ย้ายหน้าจอทีละส่วน** — เริ่มจากหน้าของในบ้าน/รายการซื้อ แล้วหน้าหลัก แผนอาหาร การตั้งค่า และฟอร์ม/ไดอะล็อก แยก component, state และ API client ให้มีเจ้าของชัดเจน ทดสอบก่อน commit/push ของแต่ละส่วน
5. **เก็บงานหลังย้ายครบ** — ลบโค้ด render/event เดิมที่ไม่มีผู้ใช้แล้ว ตรวจการนำเข้า Excel, รูป, บาร์โค้ด, ใบเสร็จ, การแจ้งเตือน, ขนาดมือถือ และข้อมูลเดิมใน local/production

ระหว่าง Task 1–4 `public/app.js` เป็นไฟล์ที่สร้างจากต้นฉบับใน `src/app/`; ห้ามแก้ไฟล์ที่สร้างโดยตรง Tailwind CLI รวมกฎที่ยังไม่ย้ายและ utility classes เป็น `public/tailwind.css` ไฟล์เดียว
