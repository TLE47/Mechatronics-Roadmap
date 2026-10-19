/// <reference types="vite/client" />

/**
 * Cloud sync is optional. A build with neither variable set ships the workbench exactly as before:
 * progress lives in this browser only, and the account panel says so.
 */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
