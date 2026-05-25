import "dotenv/config"
import { PrismaClient } from "../lib/generated/prisma"

const prisma = new PrismaClient()

async function main() {
  console.log("Seeding tournament structure...")

  const tournament = await prisma.tournament.upsert({
    where: { year: 2026 },
    update: {},
    create: {
      name: "FIFA World Cup 2026",
      year: 2026,
      host: "USA / Canada / Mexico",
      // Group stage: Jun 11 – Jun 27 (first match locks predictions)
      groupStageStart: new Date("2026-06-11T18:00:00Z"),
      // Group stage ends, KO window opens
      groupStageEnd: new Date("2026-06-27T21:00:00Z"),
      // Round of 32 starts (KO predictions lock)
      knockoutStageStart: new Date("2026-07-01T18:00:00Z"),
      totalTeams: 48,
      totalGroups: 12,
    },
  })

  console.log(`Tournament: ${tournament.name}`)

  // Create 12 groups A–L
  const groupLetters = ["A","B","C","D","E","F","G","H","I","J","K","L"]

  for (const letter of groupLetters) {
    await prisma.tournamentGroup.upsert({
      where: { tournamentId_letter: { tournamentId: tournament.id, letter } },
      update: {},
      create: { tournamentId: tournament.id, letter },
    })
  }

  console.log("Created 12 groups (A–L)")
  console.log("Seed complete. Run the admin sync to import teams and matches.")
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
