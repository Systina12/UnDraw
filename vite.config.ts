import { defineConfig } from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig({
  base:'./',
  plugins:[VitePWA({
    registerType:'prompt',
    injectRegister:null,
    manifest:false,
    workbox:{skipWaiting:false,clientsClaim:false,
      globPatterns:['**/*.{js,css,html,woff,woff2,ttf,svg,webmanifest}'],
      maximumFileSizeToCacheInBytes:5*1024*1024},
  })],
});
