import "katex/dist/katex.min.css";
import "./style.css";
import { mountApplication } from "./ui/main-view";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("App root not found");
mountApplication(root);
if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js");
