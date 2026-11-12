// Web entry (Vite). Native entry is /index.js.
import { AppRegistry } from 'react-native';

import App from '../App';
import { name as appName } from '../app.json';

// Touch screens: a long press opens the browser's context menu (copy / save image) and cancels the press,
// so press-and-hold actions (e.g. holding the TH EDU logo) never fire. Suppress that menu for touch input
// on interactive elements only — right-click with a mouse keeps working everywhere.
let lastPointer = 'mouse';
window.addEventListener('pointerdown', (e) => (lastPointer = e.pointerType), { capture: true, passive: true });
window.addEventListener(
  'contextmenu',
  (e) => {
    const target = e.target as Element | null;
    if (lastPointer !== 'mouse' && target?.closest?.('[role="button"], [role="header"], [role="link"], [role="tab"], img')) {
      e.preventDefault();
    }
  },
  { capture: true },
);

AppRegistry.registerComponent(appName, () => App);
AppRegistry.runApplication(appName, { rootTag: document.getElementById('root') });
