/// <reference types="vite/client" />

import "katex/dist/katex.min.css";
import "./style.css";
import { mountApplication } from "./ui/main-view";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("App root not found");
mountApplication(root);
if ("serviceWorker" in navigator) {
  const serviceWorkerUrl = new URL(`${import.meta.env.BASE_URL}sw.js`, document.baseURI);
  void navigator.serviceWorker.register(serviceWorkerUrl).catch(() => undefined);
}
