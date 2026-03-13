/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
  readonly VITE_SUPABASE_PROJECT_ID: string;
  readonly VITE_AI_CHAT_URL: string;
  readonly VITE_PIPER_TTS_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
