---
description: "Use when changing searchable select or datalist dropdowns, their focus behavior, or option selection in the inventory UI."
applyTo: ["public/app.js", "public/app.css", "tests/stock-import.test.mjs"]
---

# Search Dropdown Guidelines

- Search dropdown behavior is implemented in both `enhanceSelect` and `enhanceDatalist` in `public/app.js`. When changing shared behavior such as focus, opening/closing, outside taps, or option selection, update and verify both implementations; do not assume changing `enhanceSelect` also changes datalists.
- Datalists provide searchable suggestions for fields such as item names, units, and locations. Keep their value restore, keyboard dismissal, and mobile keyboard behavior consistent with searchable selects.
- Add or update regression tests in `tests/stock-import.test.mjs` for behavior changes.
