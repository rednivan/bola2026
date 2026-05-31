import { unstable_cache } from "next/cache"
import { prisma } from "@/lib/prisma"

// Tournament record — shared across all users, changes only when admin edits dates
export const getCachedTournament = unstable_cache(
  () => prisma.tournament.findUnique({ where: { year: 2026 } }),
  ["tournament-2026"],
  { revalidate: 3600 },
)

// Match/group counts — fixed once data is loaded, safe to cache for 24 h
export const getCachedTournamentCounts = unstable_cache(
  async (tournamentId: string) => {
    const [matchTotal, groupCount, koTotal] = await Promise.all([
      prisma.match.count({ where: { tournamentId, stage: "GROUP" } }),
      prisma.tournamentGroup.count({ where: { tournamentId } }),
      prisma.match.count({
        where: { tournamentId, stage: { in: ["R32", "R16", "QF", "SF", "THIRD_PLACE", "FINAL"] } },
      }),
    ])
    return { matchTotal, standingsTotal: groupCount * 4, koTotal, groupCount }
  },
  ["tournament-counts-2026"],
  { revalidate: 86400 },
)
