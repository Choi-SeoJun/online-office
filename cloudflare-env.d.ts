declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    FEEDBACK_ADMIN_EMAIL?: string;
    FEEDBACK_RATE_SECRET?: string;
    KMA_SERVICE_KEY?: string;
  }
}
