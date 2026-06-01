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

// Groups with teams — static tournament structure, safe to cache for 24 h
export const getCachedGroups = unstable_cache(
  () => prisma.tournamentGroup.findMany({
    where: { tournament: { year: 2026 } },
    include: {
      teams: { include: { team: { select: { id: true, name: true, code: true, flagUrl: true } } } },
    },
    orderBy: { letter: "asc" },
  }),
  ["groups-2026"],
  { revalidate: 86400 },
)

// Group-stage matches — structure is fixed; scores not selected so 24 h is safe
export const getCachedGroupMatches = unstable_cache(
  () => prisma.match.findMany({
    where: { tournament: { year: 2026 }, stage: "GROUP" },
    select: {
      id: true,
      groupId: true,
      kickoff: true,
      homeTeam: { select: { id: true, name: true, code: true, flagUrl: true } },
      awayTeam: { select: { id: true, name: true, code: true, flagUrl: true } },
      group: { select: { letter: true } },
    },
    orderBy: [{ group: { letter: "asc" } }, { kickoff: "asc" }],
  }),
  ["group-matches-2026"],
  { revalidate: 86400 },
)

// KO matches — includes homeScore/awayScore/winnerId which update during the tournament,
// so revalidate every 5 minutes to keep results fresh without hammering the DB
export const getCachedKOMatches = unstable_cache(
  () => prisma.match.findMany({
    where: { tournament: { year: 2026 }, stage: { in: ["R32", "R16", "QF", "SF", "THIRD_PLACE", "FINAL"] } },
    select: {
      id: true,
      stage: true,
      matchNumber: true,
      kickoff: true,
      pointsAvailable: true,
      homeTeam: { select: { id: true, name: true, code: true, flagUrl: true } },
      awayTeam: { select: { id: true, name: true, code: true, flagUrl: true } },
      homeTeamPlaceholder: true,
      awayTeamPlaceholder: true,
      homeScore: true,
      awayScore: true,
      winnerId: true,
    },
    orderBy: [{ kickoff: "asc" }, { matchNumber: "asc" }],
  }),
  ["ko-matches-2026"],
  { revalidate: 300 },
)
