import "dotenv/config"
import { PrismaClient } from "../lib/generated/prisma"

const prisma = new PrismaClient()
const email = process.argv[2]

async function main() {
  if (!email) {
    console.error("Usage: npx tsx scripts/make-admin.ts <email>")
    process.exit(1)
  }

  const user = await prisma.user.update({
    where: { email },
    data: { role: "ADMIN" },
  })

  console.log(`✓ ${user.displayName} (${user.email}) is now ADMIN`)
}

main()
  .catch((e) => { console.error(e.message); process.exit(1) })
  .finally(() => prisma.$disconnect())
