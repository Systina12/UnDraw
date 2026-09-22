import { createAppShell } from './ui/app';
import './ui/styles.css';
import 'katex/dist/katex.min.css';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Missing app root');
createAppShell(root);
