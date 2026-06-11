import { AsyncLocalStorage } from "node:async_hooks";

const inboundStore = new AsyncLocalStorage();

export function withInboundSync(fn) {
  return inboundStore.run(true, fn);
}

export function isClevaFarmInboundSync() {
  return inboundStore.getStore() === true;
}
