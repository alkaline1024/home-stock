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
  <section v-if="shopping.length" class="section">
    <div class="section-head">
      <h2>ของที่จะซื้อ</h2>
      <span>{{ shopping.length }} รายการ</span>
    </div>
    <div class="item-collection view-list">
      <article v-for="item in shopping" :key="item.id" class="line-item">
        <img
          v-if="item.photo"
          class="thumb"
          decoding="async"
          loading="lazy"
          alt=""
          :src="`/api/photo?id=${encodeURIComponent(item.photo)}`"
        />
        <span v-else class="thumb placeholder" aria-hidden="true" :style="mediaStyle(item)">
          <svg
            v-if="iconIds.has(item.icon)"
            class="item-icon"
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
        <div class="item-info">
          <div class="item-name">
            {{ item.name }} <span class="qty">· ซื้อ {{ formatAmount(item) }}</span>
          </div>
          <div class="meta">ที่บ้านเหลือ {{ amountFormat.format(totalFor(item)) }} {{ item.unit }}</div>
        </div>
        <div class="item-actions">
          <button type="button" class="action" data-action="receive" :data-id="item.id">
            <span class="add-action-label"
              ><span class="add-action-icon-wrap"
                ><svg
                  class="add-action-icon"
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
                  class="add-action-plus"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fill-rule="evenodd"
                    d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM7 4h2v3h3v2H9v3H7V9H4V7h3Z"
                  /></svg></span
              ><span class="add-action-text">ซื้อแล้ว</span></span
            >
          </button>
          <button type="button" class="action small" data-action="edit-shopping" :data-id="item.id">
            แก้ไข
          </button>
        </div>
      </article>
    </div>
  </section>
  <section v-else class="empty">
    <h2>รายการซื้อยังว่างอยู่</h2>
    <p>จดสิ่งที่ต้องการซื้อ แล้วกด “ซื้อแล้ว” เพื่อนำเข้าของในบ้าน</p>
    <button type="button" class="secondary" data-action="new-shopping">จดรายการแรก</button>
  </section>
</template>
