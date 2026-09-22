import { createAppShell } from './ui/app';
import './ui/styles.css';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Missing app root');
createAppShell(root);
