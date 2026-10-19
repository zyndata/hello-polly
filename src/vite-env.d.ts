/// <reference types="svelte" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The release tag a production build serves its pictures from (deploy.yml); empty otherwise. */
  readonly VITE_CONTENT_REF?: string;
  /** The Google OAuth client id (scope `drive.file`). Public by design; empty disables Drive. */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
