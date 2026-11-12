import { createApp, h, ref, onMounted, onUnmounted } from "vue";
import ShoppingView from "./ShoppingView.vue";

const host = document.querySelector("#shopping-count");
if (host) {
  const initialCount = Number(host.textContent) || 0;
  createApp({
    setup() {
      const count = ref(initialCount);
      const update = (event) => {
        count.value = event.detail;
      };
      onMounted(() => {
        host.addEventListener("home-stock:shopping-count", update);
        host.dataset.vueMounted = "true";
      });
      onUnmounted(() => {
        host.removeEventListener("home-stock:shopping-count", update);
        delete host.dataset.vueMounted;
      });
      return () => h("span", count.value);
    },
  }).mount(host);
}

const shoppingView = document.querySelector("#shopping-vue");
if (shoppingView) createApp(ShoppingView).mount(shoppingView);
