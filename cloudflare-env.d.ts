export {};

declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
      ARTIFACTS: R2Bucket;
      ASSETS: Fetcher;
    }
  }
}
