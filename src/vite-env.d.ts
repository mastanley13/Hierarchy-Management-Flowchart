/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIRM_ID_EQUITA: string
  readonly VITE_FIRM_ID_QUILITY: string
  readonly VITE_FIRM_ID?: string
  // Legacy single-account vars (back-compat)
  readonly VITE_SURELC_USER: string
  readonly VITE_SURELC_PASS: string
  // Dual-account vars for MRFG admin access
  readonly VITE_SURELC_USER_EQUITA: string
  readonly VITE_SURELC_PASS_EQUITA: string
  readonly VITE_SURELC_USER_QUILITY: string
  readonly VITE_SURELC_PASS_QUILITY: string
  readonly VITE_SURELC_BASE: string
  readonly VITE_INITIAL_SNAPSHOT_DATE: string
  readonly VITE_PAGE_LIMIT: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
