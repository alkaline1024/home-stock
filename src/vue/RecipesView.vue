<script setup>
import { onMounted, onUnmounted, ref } from "vue";

const host = document.querySelector("#recipes-vue");
const recipes = ref(host?.recipesSnapshot || []);
const amountFormat = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 3 });
const amount = (item) => `${amountFormat.format(item.qty)} ${item.unit}`;
const update = (event) => {
  recipes.value = event.detail;
};

onMounted(() => {
  host.addEventListener("home-stock:recipes", update);
  host.dataset.vueMounted = "true";
  if (location.hash === "#recipes") {
    document.querySelector("#content").hidden = true;
    host.hidden = false;
  }
});
onUnmounted(() => {
  host.removeEventListener("home-stock:recipes", update);
  delete host.dataset.vueMounted;
});
</script>

<template>
  <section class="mb-[26px]">
    <div class="mb-[3px] flex items-center justify-between gap-3 border-b border-line pb-[9px]">
      <h2 class="text-[1.18rem] tracking-[-0.025em]">เมนูที่บันทึกไว้</h2>
      <span class="text-[0.87rem] text-muted">{{ recipes.length }} รายการ</span>
    </div>
    <div v-if="recipes.length" class="mt-3 grid gap-2">
      <article
        v-for="recipe in recipes"
        :key="recipe.id"
        class="grid gap-[14px] rounded-lg border border-line border-t-2 border-t-green bg-white p-4"
      >
        <div class="flex items-center justify-between gap-3 max-[360px]:items-start">
          <div class="flex min-w-0 items-center gap-[11px]">
            <span
              class="grid h-10 w-10 flex-none place-items-center rounded-lg bg-[#edf3eb] text-[1.15rem]"
              aria-hidden="true"
              >📖</span
            >
            <div>
              <h3 class="mb-1 text-[1.05rem] [overflow-wrap:anywhere]">{{ recipe.name }}</h3>
              <span
                class="rounded-full bg-[#e7f1e4] px-2 py-[2px] text-xs font-semibold text-[#355d37]"
                >เมนูที่บันทึกไว้</span
              >
            </div>
          </div>
          <span
            class="flex-none rounded-full border border-line px-[10px] py-[5px] text-[0.82rem] font-semibold text-muted"
            >{{ recipe.servings }} ที่</span
          >
        </div>
        <div class="flex flex-wrap gap-[7px]">
          <span
            v-for="(item, index) in recipe.ingredients"
            :key="index"
            class="inline-flex min-h-8 items-center gap-2 rounded-md border border-[#e1e6de] bg-[#f7f8f5] px-[9px] py-[5px] text-[0.82rem] text-ink"
          >
            <span>{{ item.name }}</span><strong
              class="whitespace-nowrap text-[0.78rem] text-green"
              >{{ amount(item) }}</strong
            >
          </span>
        </div>
        <div
          class="flex flex-wrap items-center gap-[7px] border-t border-line pt-[11px] max-[360px]:items-stretch max-[360px]:[&>button]:flex-[1_1_auto]"
        >
          <button type="button" class="primary" data-action="plan-recipe" :data-id="recipe.id">
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
                  <path d="M3 11h18" />
                  <path d="M5 11v6a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3v-6" />
                  <path d="M12 3v4" />
                  <path d="M7 4l2 3" />
                  <path d="m17 4-2 3" /></svg
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
              ><span class="min-w-0">วางแผนเมนูนี้</span></span
            >
          </button>
          <button type="button" class="secondary" data-action="edit-recipe" :data-id="recipe.id">
            แก้ไขเมนู
          </button>
          <button
            type="button"
            class="text-button text-[#983a28]"
            data-action="remove-recipe"
            :data-id="recipe.id"
          >
            ลบเมนู
          </button>
        </div>
      </article>
    </div>
    <p v-else>ยังไม่มีเมนูที่บันทึกไว้ วางแผนเมนูแล้วเลือกบันทึกเป็นสูตรต้นแบบได้</p>
  </section>
</template>
