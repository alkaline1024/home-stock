<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";

const host = document.querySelector("#shopping-vue");
const snapshot = ref(host?.stockSnapshot || { items: [], shopping: [] });
const amountFormat = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 3 });
const iconIds = new Set([
  "box",
  "vegetables",
  "fruit",
  "meat",
  "fish",
  "egg",
  "milk",
  "bottle",
  "grain",
  "meal",
  "snowflake",
]);
const iconColors = {
  green: "#386641",
  blue: "#25658a",
  teal: "#167d79",
  coral: "#c4513d",
  orange: "#bd6d1e",
  berry: "#a73e5a",
  purple: "#7451a6",
  slate: "#48525b",
};
const iconBackgrounds = {
  mint: "#e2efe1",
  cream: "#f2eadb",
  sky: "#e0eef4",
  rose: "#f7e6e7",
  lilac: "#ede8f7",
  peach: "#f8e6d9",
  butter: "#f4edcf",
  white: "#ffffff",
};
const items = computed(() => snapshot.value.items);
const shopping = computed(() => snapshot.value.shopping);
const key = (value) =>
  String(value || "")
    .trim()
    .normalize("NFC")
    .toLocaleLowerCase();
const formatAmount = (item) => `${amountFormat.format(item.qty)} ${item.unit}`;
const totalFor = (item) =>
  items.value
    .filter((entry) => key(entry.name) === key(item.name) && key(entry.unit) === key(item.unit))
    .reduce((sum, entry) => sum + entry.qty, 0);
const color = (value, palette, fallback) =>
  /^#[0-9a-f]{6}$/i.test(value || "") ? value : palette[value] || palette[fallback];
const mediaStyle = (item) => ({
  "--item-icon-color": color(item.iconColor, iconColors, "green"),
  "--item-icon-bg": color(item.iconBackground, iconBackgrounds, "mint"),
});
const update = (event) => {
  snapshot.value = event.detail;
};

onMounted(() => {
  host.addEventListener("home-stock:shopping", update);
  host.dataset.vueMounted = "true";
  if (location.hash === "#shopping") {
    document.querySelector("#content").hidden = true;
    host.hidden = false;
  }
});
onUnmounted(() => {
  host.removeEventListener("home-stock:shopping", update);
  delete host.dataset.vueMounted;
});
</script>

<template>
  <section v-if="shopping.length" class="mb-[26px]">
    <div class="mb-[3px] flex items-center justify-between gap-3 border-b border-line pb-[9px]">
      <h2 class="text-[1.18rem] tracking-[-0.025em]">ของที่จะซื้อ</h2>
      <span class="text-[0.87rem] text-muted">{{ shopping.length }} รายการ</span>
    </div>
    <div>
      <article
        v-for="item in shopping"
        :key="item.id"
        class="grid grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-[14px] border-b border-line py-[14px] max-[650px]:grid-cols-[43px_minmax(0,1fr)] max-[650px]:gap-[9px] max-[650px]:py-3"
      >
        <img
          v-if="item.photo"
          class="h-[52px] w-12 shrink-0 rounded-[7px] object-cover max-[650px]:h-12 max-[650px]:w-[43px]"
          decoding="async"
          loading="lazy"
          alt=""
          :src="`/api/photo?id=${encodeURIComponent(item.photo)}`"
        />
        <span
          v-else
          class="grid h-[52px] w-12 shrink-0 place-items-center rounded-[7px] bg-[var(--item-icon-bg,#e7eadb)] font-[var(--serif)] text-[1.18rem] text-[var(--item-icon-color,#567353)] max-[650px]:h-12 max-[650px]:w-[43px]"
          aria-hidden="true"
          :style="mediaStyle(item)"
        >
          <svg
            v-if="iconIds.has(item.icon)"
            class="h-7 w-7"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <use :href="`/item-icons.svg#item-icon-${item.icon}`" />
          </svg>
          <template v-else>{{ [...item.name][0] || "·" }}</template>
        </span>
        <div class="min-w-0 [overflow-wrap:anywhere]">
          <div class="text-[1.09rem] font-[650] [overflow-wrap:anywhere]">
            {{ item.name }}
            <span class="text-[0.94rem] font-medium">· ซื้อ {{ formatAmount(item) }}</span>
          </div>
          <div class="text-[0.87rem] text-muted">
            ที่บ้านเหลือ {{ amountFormat.format(totalFor(item)) }} {{ item.unit }}
          </div>
        </div>
        <div
          class="flex flex-wrap items-center justify-end gap-[7px] max-[650px]:col-start-2 max-[650px]:justify-start"
        >
          <button
            type="button"
            class="min-h-[44px] rounded-[9px] border border-line bg-surface px-3 py-[5px] text-[0.91rem] font-semibold hover:border-[#7c9580]"
            data-action="receive"
            :data-id="item.id"
          >
            <span class="inline-flex max-w-full min-w-0 items-center gap-[7px] align-middle"
              ><span class="relative inline-grid h-6 w-7 flex-none items-center justify-items-start"
                ><svg
                  class="h-5 w-5 flex-none"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="m3 7 9-4 9 4-9 4-9-4Z" />
                  <path d="M3 7v10l9 4 9-4V7" />
                  <path d="M12 11v10" /></svg
                ><svg
                  class="absolute top-0 right-0 h-3 w-3"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fill-rule="evenodd"
                    d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM7 4h2v3h3v2H9v3H7V9H4V7h3Z"
                  /></svg></span
              ><span class="min-w-0">ซื้อแล้ว</span></span
            >
          </button>
          <button
            type="button"
            class="min-h-[44px] rounded-[9px] border border-line bg-transparent px-3 py-[5px] text-[0.91rem] font-semibold hover:border-[#7c9580]"
            data-action="edit-shopping"
            :data-id="item.id"
          >
            แก้ไข
          </button>
        </div>
      </article>
    </div>
  </section>
  <section v-else class="mt-2 mb-[22px] rounded-[14px] bg-mint p-[clamp(20px,4vw,36px)]">
    <h2 class="text-[clamp(21px,3vw,29px)] tracking-[-0.04em]">รายการซื้อยังว่างอยู่</h2>
    <p class="mt-[6px] text-[#3f5e4e]">จดสิ่งที่ต้องการซื้อ แล้วกด “ซื้อแล้ว” เพื่อนำเข้าของในบ้าน</p>
    <button type="button" class="secondary mt-4" data-action="new-shopping">จดรายการแรก</button>
  </section>
</template>
