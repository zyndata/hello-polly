/// <reference types="svelte" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The release tag a production build serves its pictures from (deploy.yml); empty otherwise. */
  readonly VITE_CONTENT_REF?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
