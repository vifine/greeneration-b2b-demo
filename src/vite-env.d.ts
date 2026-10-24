/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "1" on the server build: the web server already asks for a password, so the demo login is skipped. */
  readonly VITE_SERVER_AUTH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
