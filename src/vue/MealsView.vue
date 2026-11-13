<script setup>
import { computed, onMounted, onUnmounted, ref } from "vue";

const host = document.querySelector("#meals-vue");
const snapshot = ref(host?.mealsSnapshot || { plans: [], items: [] });
const numberFormat = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 3 });
const dateFormat = new Intl.DateTimeFormat("th-TH", {
  day: "numeric",
  month: "short",
  year: "numeric",
});
const key = (value) =>
  String(value || "")
    .trim()
    .normalize("NFC")
    .toLocaleLowerCase();
const round = (number) => Math.round(number * 1000) / 1000;
const plans = computed(() => {
  const planned = snapshot.value.plans
    .filter((plan) => plan.status === "planned")
    .sort((a, b) => a.date.localeCompare(b.date));
  const cooked = snapshot.value.plans
    .filter((plan) => plan.status !== "planned")
    .sort((a, b) => b.date.localeCompare(a.date));
  return [...planned, ...cooked];
});
const amount = (item) => `${numberFormat.format(item.qty)} ${item.unit}`;
const dateLabel = (value) => dateFormat.format(new Date(`${value}T12:00:00`));
function shortages(plan) {
  if (plan.status !== "planned") return [];
  const required = new Map();
  for (const ingredient of plan.ingredients) {
    const groupKey = `${key(ingredient.name)}\u0000${key(ingredient.unit)}`;
    const group = required.get(groupKey) || {
      name: ingredient.name,
      unit: ingredient.unit,
      qty: 0,
    };
    group.qty = round(group.qty + ingredient.qty);
    required.set(groupKey, group);
  }
  return [...required.values()]
    .map((ingredient) => {
      const available = round(
        snapshot.value.items
          .filter(
            (item) =>
              key(item.name) === key(ingredient.name) && key(item.unit) === key(ingredient.unit),
          )
          .reduce((sum, item) => sum + item.qty, 0),
      );
      return { ...ingredient, missing: round(ingredient.qty - available) };
    })
    .filter((ingredient) => ingredient.missing > 0.0001);
}
const statusLabel = (plan) =>
  plan.status === "completed" ? "เสร็จสิ้นแล้ว" : plan.status === "cooked" ? "ทำแล้ว" : "วางแผน";
const update = (event) => {
  snapshot.value = event.detail;
};
onMounted(() => {
  host.addEventListener("home-stock:meals", update);
  host.dataset.vueMounted = "true";
  if (location.hash === "#meals") {
    document.querySelector("#content").hidden = true;
    host.hidden = false;
  }
});
onUnmounted(() => {
  host.removeEventListener("home-stock:meals", update);
  delete host.dataset.vueMounted;
});
</script>

<template>
  <section class="mb-[26px]">
    <div class="mb-[3px] flex items-center justify-between gap-3 border-b border-line pb-[9px]">
      <h2 class="text-[1.18rem] tracking-[-0.025em]">แผนทำอาหาร</h2>
      <span class="text-[0.87rem] text-muted">{{ plans.length }} รายการ</span>
    </div>
    <div v-if="plans.length" class="mt-1 grid">
      <article
        v-for="plan in plans"
        :key="plan.id"
        class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-[18px] border-b border-line py-[14px] max-[680px]:grid-cols-1 max-[680px]:gap-[10px]"
      >
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <h3 class="text-base [overflow-wrap:anywhere]">🍲 {{ plan.name }}</h3>
            <span
              class="flex-none rounded-full px-2 py-[2px] text-xs font-semibold"
              :class="
                plan.status === 'planned'
                  ? 'bg-[#e7f1e4] text-[#355d37]'
                  : 'bg-[#edf0eb] text-muted'
              "
              >{{ statusLabel(plan) }}</span
            >
          </div>
          <p class="mt-[5px] text-[0.85rem] text-muted [overflow-wrap:anywhere]">
            {{ dateLabel(plan.date) }} · {{ plan.servings }} ที่ ·
            {{ plan.ingredients.map((item) => `${item.name} ${amount(item)}`).join(" · ") }}
          </p>
          <p
            v-if="shortages(plan).length"
            class="mt-[7px] text-[0.85rem] font-semibold text-[#963d32] [overflow-wrap:anywhere]"
          >
            ของขาด:
            {{
              shortages(plan)
                .map((item) => `${item.name} ${numberFormat.format(item.missing)} ${item.unit}`)
                .join(" · ")
            }}
          </p>
          <p
            v-else-if="plan.status === 'planned'"
            class="mt-[7px] text-[0.85rem] font-semibold text-[#355d37]"
          >
            วัตถุดิบครบ
          </p>
        </div>
        <div
          class="flex flex-wrap items-center justify-end gap-[6px] max-[680px]:min-w-0 max-[680px]:justify-start max-[680px]:[&>button]:max-w-full"
        >
          <template v-if="plan.status === 'planned'">
            <button type="button" class="secondary" data-action="edit-meal-plan" :data-id="plan.id">
              แก้ไขแผน
            </button>
            <details v-if="shortages(plan).length" class="relative">
              <summary
                class="secondary inline-flex min-h-[44px] cursor-pointer list-none items-center rounded-lg border border-line px-[13px] py-2 text-[0.9rem] font-semibold hover:border-[#9db39e] hover:bg-mint"
              >
                เพิ่มของที่ขาด
              </summary>
              <div
                role="menu"
                class="absolute top-[calc(100%+5px)] right-0 z-[25] grid min-w-[180px] gap-[2px] rounded-lg border border-line bg-white p-[5px] shadow-[0_8px_24px_rgb(25_54_39_/_16%)]"
              >
                <button
                  type="button"
                  class="min-h-[42px] w-full rounded-[5px] px-[10px] py-2 text-left hover:bg-mint"
                  data-action="add-shortages-inventory"
                  :data-id="plan.id"
                >
                  เพิ่มของในบ้าน</button
                ><button
                  type="button"
                  class="min-h-[42px] w-full rounded-[5px] px-[10px] py-2 text-left hover:bg-mint"
                  data-action="add-shortages-shopping"
                  :data-id="plan.id"
                >
                  จดรายการซื้อ
                </button>
              </div>
            </details>
            <button
              v-else
              type="button"
              class="primary"
              data-action="mark-meal-cooked"
              :data-id="plan.id"
            >
              ทำอาหารแล้ว
            </button>
          </template>
          <template v-else-if="plan.status === 'cooked'"
            ><button
              v-if="!plan.cookedItemCreated"
              type="button"
              class="secondary"
              data-action="create-cooked-stock"
              :data-id="plan.id"
            >
              เพิ่มเข้ารายการปรุงสุก</button
            ><button
              type="button"
              class="primary"
              data-action="complete-meal-plan"
              :data-id="plan.id"
            >
              เสร็จสิ้น
            </button></template
          >
          <button
            type="button"
            class="text-button text-[#983a28]"
            data-action="remove-meal-plan"
            :data-id="plan.id"
          >
            ลบแผน
          </button>
        </div>
      </article>
    </div>
    <p v-else>ยังไม่มีแผนทำอาหาร กด “วางแผนทำอาหาร” เพื่อเริ่ม</p>
  </section>
</template>
