import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../src/app/dialogs-and-media.js", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const dialogIds = [...html.matchAll(/<dialog id="([^"]+)"/g)].map((match) => match[1]);
const sheetSource = source.slice(
  source.indexOf("function initializeDialogSheets()"),
  source.indexOf("function renderPhoto()"),
);

function sheets() {
  class Surface extends EventTarget {
    constructor() {
      super();
      this.properties = new Map();
      this.classes = new Set();
      this.style = {
        setProperty: (key, value) => this.properties.set(key, value),
        removeProperty: (key) => this.properties.delete(key),
      };
      this.classList = {
        add: (name) => this.classes.add(name),
        remove: (name) => this.classes.delete(name),
      };
      this.open = true;
      this.offsetHeight = 400;
    }
    setAttribute() {}
    closest() {
      return null;
    }
    prepend(handle) {
      this.handle = handle;
    }
    querySelector() {
      return this.head;
    }
    setPointerCapture(id) {
      this.pointer = id;
    }
    hasPointerCapture(id) {
      return this.pointer === id;
    }
    releasePointerCapture() {
      this.pointer = null;
      this.dispatchEvent(new Event("lostpointercapture"));
    }
    close() {
      this.open = false;
      this.dispatchEvent(new Event("close"));
    }
  }
  const dialogs = dialogIds.map((id) => {
    const dialog = new Surface();
    dialog.id = id;
    dialog.head = new Surface();
    return dialog;
  });
  const mobile = Object.assign(new EventTarget(), { matches: true });
  const context = vm.createContext({
    Event,
    busy: false,
    window: { matchMedia: () => mobile },
    document: {
      querySelectorAll: () => dialogs,
      createElement: () => new Surface(),
    },
  });
  vm.runInContext(sheetSource, context);
  const pointer = (surface, type, x, y, extra = {}) => {
    surface.dispatchEvent(
      Object.assign(new Event(type), {
        pointerId: 1,
        isPrimary: true,
        button: 0,
        clientX: x,
        clientY: y,
        ...extra,
      }),
    );
  };
  const drag = (surface, distance, end = "pointerup", x = 0) => {
    pointer(surface, "pointerdown", 0, 0);
    pointer(surface, "pointermove", x, distance);
    pointer(surface, end, x, distance);
  };
  return { dialogs, mobile, context, pointer, drag };
}

test("all modal opening paths use dialogs covered by the shared sheet initializer", () => {
  const openedIds = [...appSource.matchAll(/\$\("#([^"]+)"\)\.showModal\(\)/g)].map(
    (match) => match[1],
  );
  assert.deepEqual([...new Set(openedIds)].sort(), [...dialogIds].sort());
  assert.equal(dialogIds.length, 6);
  const { dialogs } = sheets();
  for (const dialog of dialogs) {
    assert.equal(dialog.handle.className, "sheet-handle", dialog.id);
  }
});

test("every dialog supports dragging and closes through cancel and close events", () => {
  const { dialogs, drag } = sheets();
  for (const dialog of dialogs) {
    let cancelled = 0,
      closed = 0;
    dialog.addEventListener("cancel", () => cancelled++);
    dialog.addEventListener("close", () => closed++);
    drag(dialog.handle, 100);
    assert.equal(dialog.open, false);
    assert.equal(cancelled, 1);
    assert.equal(closed, 1);
    assert.equal(dialog.properties.size, 0);
    assert.equal(dialog.classes.size, 0);
  }
});

test("short, upward, horizontal and cancelled drags snap back without click dismissal", () => {
  const {
    dialogs: [dialog],
    drag,
  } = sheets();
  for (const [dy, end, dx] of [
    [30, "pointerup", 0],
    [-100, "pointerup", 0],
    [100, "pointerup", 150],
    [100, "pointercancel", 0],
  ]) {
    drag(dialog.handle, dy, end, dx);
    dialog.handle.dispatchEvent(new Event("click", { cancelable: true }));
    assert.equal(dialog.open, true);
    assert.equal(dialog.properties.size, 0);
    assert.equal(dialog.classes.size, 0);
  }
});

test("desktop and busy dialogs cannot be dragged closed; resizing resets a drag", () => {
  const {
    dialogs: [dialog],
    context,
    mobile,
    drag,
    pointer,
  } = sheets();
  mobile.matches = false;
  drag(dialog.handle, 150);
  assert.equal(dialog.open, true);
  mobile.matches = true;
  context.busy = true;
  drag(dialog.handle, 150);
  dialog.handle.dispatchEvent(new Event("click"));
  assert.equal(dialog.open, true);
  context.busy = false;
  pointer(dialog.head, "pointerdown", 0, 0);
  pointer(dialog.head, "pointermove", 0, 40);
  assert.equal(dialog.properties.get("--sheet-offset"), "40px");
  mobile.matches = false;
  mobile.dispatchEvent(new Event("change"));
  assert.equal(dialog.properties.size, 0);
  assert.equal(dialog.classes.size, 0);
  pointer(dialog.head, "pointerup", 0, 150);
  assert.equal(dialog.open, true);
});

test("cancel vetoes dismissals and a later click remains keyboard accessible", () => {
  const {
    dialogs: [dialog],
    drag,
  } = sheets();
  const veto = (event) => event.preventDefault();
  dialog.addEventListener("cancel", veto);
  drag(dialog.handle, 100);
  assert.equal(dialog.open, true);
  dialog.handle.dispatchEvent(new Event("click"));
  dialog.removeEventListener("cancel", veto);
  dialog.handle.dispatchEvent(new Event("click"));
  assert.equal(dialog.open, false);
});

test("secondary pointers and header buttons do not start a gesture", () => {
  const {
    dialogs: [dialog],
    pointer,
  } = sheets();
  pointer(dialog.handle, "pointerdown", 0, 0, { isPrimary: false });
  pointer(dialog.handle, "pointermove", 0, 150);
  assert.equal(dialog.properties.size, 0);
  dialog.head.closest = () => dialog.head;
  pointer(dialog.head, "pointerdown", 0, 0);
  pointer(dialog.head, "pointermove", 0, 150);
  assert.equal(dialog.properties.size, 0);
});

test("keyboard dismissal works after a cancelled gesture and busy cancels an active drag", () => {
  const {
    dialogs: [dialog],
    context,
    pointer,
    drag,
  } = sheets();
  pointer(dialog.handle, "pointerdown", 0, 0);
  context.busy = true;
  pointer(dialog.handle, "pointermove", 0, 150);
  pointer(dialog.handle, "pointerup", 0, 150);
  assert.equal(dialog.open, true);
  assert.equal(dialog.properties.size, 0);
  context.busy = false;
  drag(dialog.handle, 40, "pointercancel");
  dialog.handle.dispatchEvent(Object.assign(new Event("click"), { detail: 0 }));
  assert.equal(dialog.open, false);
});
