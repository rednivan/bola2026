import { createHmac } from "crypto"

export function unsubscribeUrl(userId: string, appUrl: string): string {
  const secret = process.env.UNSUBSCRIBE_SECRET ?? process.env.CRON_SECRET ?? "default-secret"
  const token = createHmac("sha256", secret).update(userId).digest("hex").slice(0, 32)
  return `${appUrl}/api/email/unsubscribe?uid=${userId}&token=${token}`
}
