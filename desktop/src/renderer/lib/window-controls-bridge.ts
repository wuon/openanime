/**
 * Typed bridge to window.windowControls (exposed via preload).
 */
export interface WindowControlsContext {
  minimize: () => Promise<void>;
  close: () => Promise<void>;
  toggleMaximize: () => Promise<boolean>;
  isMaximized: () => Promise<boolean>;
}

export function getWindowControls(): WindowControlsContext {
  return (window as Window & { windowControls: WindowControlsContext }).windowControls;
}

