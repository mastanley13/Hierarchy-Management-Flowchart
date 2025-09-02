/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIRM_ID: string
  readonly VITE_SURELC_USER: string
  readonly VITE_SURELC_PASS: string
  readonly VITE_SURELC_BASE: string
  readonly VITE_INITIAL_SNAPSHOT_DATE: string
  readonly VITE_PAGE_LIMIT: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
