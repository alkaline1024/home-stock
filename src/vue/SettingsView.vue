<script setup>
import { nextTick, onMounted, onUnmounted, ref } from "vue";

const host = document.querySelector("#settings-vue");
const snapshot = ref(
  host?.settingsSnapshot || { items: [], recentItems: [], minLevels: [], animationMode: "full" },
);
const choices = [
  ["full", "เต็ม", "เปิดประตู ซูมเข้า และขยายเนื้อหาแบบ parallax"],
  ["minimal", "แบบย่อ", "แสดงประตูกับลูกบิดหมุนระหว่างโหลด แล้วค่อย ๆ จางหาย"],
  ["off", "ปิด", "ไม่แสดงฉากแอนิเมชันตอนโหลด"],
];
const key = (value) =>
  String(value || "")
    .trim()
    .normalize("NFC")
    .toLocaleLowerCase();
const minimumItems = () => {
  const names = new Map();
  for (const item of [...snapshot.value.recentItems, ...snapshot.value.items])
    names.set(`${key(item.name)}\u0000${key(item.unit)}`, item);
  return [...names.values()].sort((a, b) => a.name.localeCompare(b.name, "th"));
};
const levelFor = (item) =>
  snapshot.value.minLevels.find(
    (entry) => key(entry.name) === key(item.name) && key(entry.unit) === key(item.unit),
  );
async function update(event) {
  snapshot.value = event.detail;
  await nextTick();
  window.loadAlertSettings();
}
onMounted(() => {
  host.addEventListener("home-stock:settings", update);
  host.dataset.vueMounted = "true";
  if (location.hash === "#settings") {
    document.querySelector("#content").hidden = true;
    host.hidden = false;
    window.loadAlertSettings();
  }
});
onUnmounted(() => {
  host.removeEventListener("home-stock:settings", update);
  delete host.dataset.vueMounted;
});
</script>

<template>
  <section
    class="mx-auto max-w-[680px] rounded-[14px] border border-line bg-surface p-[clamp(18px,4vw,30px)]"
  >
    <h2 class="text-[1.2rem]">แอนิเมชันตอนเปิดแอป</h2>
    <p class="form-help mt-[5px]">เลือกรูปแบบฉากระหว่างรอโหลด และระบบจะจดจำการตั้งค่านี้ไว้ในอุปกรณ์</p>
    <fieldset class="mt-[22px] grid gap-[10px] border-0 p-0">
      <legend class="mb-[10px] text-[0.9rem] font-semibold">รูปแบบแอนิเมชัน</legend>
      <label
        v-for="[value, title, description] in choices"
        :key="value"
        class="m-0 flex cursor-pointer items-start gap-3 rounded-[10px] border border-line bg-white p-[14px] has-[:checked]:border-green has-[:checked]:bg-[#f0f5ed]"
      >
        <input
          type="radio"
          name="animation-mode"
          :value="value"
          :checked="snapshot.animationMode === value"
          class="mt-[2px] h-[18px] min-h-[18px] w-[18px] flex-none accent-green"
        />
        <span class="block"
          ><strong>{{ title }}</strong
          ><small class="mt-[3px] block text-[0.86rem] font-normal text-muted">{{
            description
          }}</small></span
        >
      </label>
    </fieldset>
    <p id="settings-error" class="error" role="alert"></p>
    <section class="my-[1.3rem]">
      <h2 class="mb-[0.7rem] text-[1.1rem]">จำนวนขั้นต่ำ</h2>
      <p class="form-help">เมื่อของเหลือน้อยกว่าที่ตั้งไว้ แอปจะแสดงในรายการซื้อ</p>
      <template v-if="minimumItems().length">
        <label
          v-for="item in minimumItems()"
          :key="`${key(item.name)}\u0000${key(item.unit)}`"
          class="flex max-w-full items-center justify-between gap-4 py-[0.6rem]"
          ><span>{{ item.name }} · {{ item.unit }}</span
          ><input
            type="number"
            inputmode="decimal"
            min="0"
            max="999999"
            step=".001"
            placeholder="ไม่ตั้ง"
            :value="levelFor(item)?.qty ?? ''"
            :data-min-name="item.name"
            :data-min-unit="item.unit"
            class="w-28"
        /></label>
      </template>
      <p v-else class="form-help">เพิ่มของชิ้นแรกก่อนตั้งจำนวนขั้นต่ำ</p>
    </section>
    <section class="my-[1.3rem]">
      <h2 class="mb-[0.7rem] text-[1.1rem]">แจ้งเตือนของใกล้หมดอายุ</h2>
      <p class="form-help">
        ส่งวันละครั้งประมาณ 09:00 น. ค่าใน Settings เป็นค่าเริ่มต้น; รายการที่กำหนดวันเตือนเองจะใช้ค่านั้นแทน
      </p>
      <label class="max-w-full"
        >เตือนล่วงหน้า<select id="alert-days" class="my-[0.45rem] block">
          <option value="0">ปิด</option>
          <option value="1">1 วัน</option>
          <option value="3">3 วัน</option>
          <option value="7">7 วัน</option>
        </select></label
      >
      <button type="button" class="secondary" data-action="save-alerts">บันทึกการแจ้งเตือน</button>
      <div class="mt-[0.8rem] grid justify-items-start gap-3">
        <button type="button" class="secondary" data-action="test-alert-now">
          [ทดสอบ] ส่งการแจ้งเตือน
        </button>
        <div class="alert-test-delay">
          <label for="alert-test-seconds">[ทดสอบ] ส่งการแจ้งเตือนในอีก</label>
          <input
            id="alert-test-seconds"
            type="number"
            inputmode="numeric"
            min="1"
            max="3600"
            step="1"
            value="5"
          />
          วินาที
          <button type="button" class="secondary" data-action="test-alert-later">เริ่มจับเวลา</button>
        </div>
      </div>
      <p id="alert-status" class="form-help" role="status"></p>
    </section>
    <button type="button" class="secondary mt-[22px]" data-action="logout">ออกจากระบบ</button>
  </section>
</template>
