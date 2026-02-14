/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface DesktopBridge {
  onUpdateStatus: (callback: (status: string) => void) => void;
  getDeviceId: () => Promise<string>;
}

interface Window {
  desktop?: DesktopBridge;
}
