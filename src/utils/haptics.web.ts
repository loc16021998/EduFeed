// Browsers have no reliable haptics API — keep the same interface as haptics.ts as no-ops.
const noop = () => {};

export const haptics = { light: noop, medium: noop, success: noop };
