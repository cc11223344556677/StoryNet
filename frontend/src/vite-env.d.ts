/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_DEV_API_PROXY_TARGET?: string;
  readonly VITE_GRAPH_RENDERER?: "cytoscape" | "vis";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
