export interface AppContext {
  version: () => Promise<string>;
  os: () => Promise<string>;
}

export function getApp(): AppContext {
  return (window as Window & { app: AppContext }).app;
}

