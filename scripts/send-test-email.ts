import "dotenv/config"
import { sendDailyResults } from "@/lib/emails/daily-results"

async function main() {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.error("Missing GMAIL_USER or GMAIL_APP_PASSWORD in .env")
    process.exit(1)
  }

  console.log("Sending daily results email to navinw@gmail.com…")
  const messageId = await sendDailyResults("navinw@gmail.com")
  console.log("Sent! Message ID:", messageId)
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })
