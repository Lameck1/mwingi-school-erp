/// <reference types="vite/client" />
declare module '*.css';

import type { ElectronAPI } from './types/electron-api';

declare global {
  var electronAPI: ElectronAPI;
}
