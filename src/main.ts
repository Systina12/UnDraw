import { createAppShell } from './ui/app';
import './ui/styles.css';
import 'katex/dist/katex.min.css';
import {registerSW} from 'virtual:pwa-register';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Missing app root');
createAppShell(root);
void registerSW({immediate:true});
