import { prisma } from "@/lib/prisma"
import { Confederation, Stage } from "@/lib/generated/prisma"

const API_BASE = process.env.FOOTBALL_DATA_BASE_URL!
const API_KEY = process.env.FOOTBALL_DATA_API_KEY!
const WC_CODE = "WC"

// Static mapping from team TLA to confederation (2026 WC qualified teams)
const TLA_CONFEDERATION: Record<string, Confederation> = {
  GER: "UEFA", ESP: "UEFA", FRA: "UEFA", ENG: "UEFA", BEL: "UEFA",
  CRO: "UEFA", CZE: "UEFA", AUT: "UEFA", NED: "UEFA", NOR: "UEFA",
  POR: "UEFA", SCO: "UEFA", SUI: "UEFA", SWE: "UEFA", TUR: "UEFA", BIH: "UEFA",
  ARG: "CONMEBOL", BRA: "CONMEBOL", COL: "CONMEBOL", ECU: "CONMEBOL",
  PAR: "CONMEBOL", URY: "CONMEBOL",
  CAN: "CONCACAF", MEX: "CONCACAF", USA: "CONCACAF",
  PAN: "CONCACAF", HAI: "CONCACAF", CUW: "CONCACAF",
  AUS: "AFC", IRN: "AFC", IRQ: "AFC", JPN: "AFC", JOR: "AFC",
  KOR: "AFC", KSA: "AFC", QAT: "AFC", UZB: "AFC",
  ALG: "CAF", CIV: "CAF", COD: "CAF", CPV: "CAF", EGY: "CAF",
  GHA: "CAF", MAR: "CAF", RSA: "CAF", SEN: "CAF", TUN: "CAF",
  NZL: "OFC",
}

// API returns LAST_32/LAST_16; schema uses R32/R16
const STAGE_MAP: Record<string, Stage> = {
  GROUP_STAGE: "GROUP", LAST_32: "R32", LAST_16: "R16",
  QUARTER_FINALS: "QF", SEMI_FINALS: "SF",
  THIRD_PLACE: "THIRD_PLACE", FINAL: "FINAL",
}

const STAGE_POINTS: Record<Stage, number> = {
  GROUP: 1, R32: 3, R16: 6, QF: 12, SF: 25, THIRD_PLACE: 10, FINAL: 60,
}

// Run promise-returning functions in parallel chunks to stay pool-friendly
async function batch<T>(fns: (() => Promise<T>)[], size = 8): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < fns.length; i += size) {
    out.push(...await Promise.all(fns.slice(i, i + size).map((f) => f())))
  }
  return out
}

async function fdFetch(path: string) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "X-Auth-Token": API_KEY },
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`football-data.org ${path}: ${res.status} ${res.statusText}`)
  return res.json()
}

export async function syncTeamsFromApi(): Promise<string> {
  const tournament = await prisma.tournament.findUnique({ where: { year: 2026 } })
  if (!tournament) throw new Error("Tournament not found — run seed first")

  const { teams } = await fdFetch(`/competitions/${WC_CODE}/teams`)

  await batch(
    teams.map((t: { tla: string; name: string; crest?: string }) => {
      const confederation: Confederation = TLA_CONFEDERATION[t.tla] ?? "UEFA"
      return () => prisma.team.upsert({
        where: { code: t.tla },
        update: { name: t.name, flagUrl: t.crest ?? "" },
        create: { name: t.name, code: t.tla, flagUrl: t.crest ?? "", confederation },
      })
    })
  )
  return `${teams.length} teams upserted`
}

export async function syncMatchesFromApi(): Promise<string> {
  const tournament = await prisma.tournament.findUnique({ where: { year: 2026 } })
  if (!tournament) throw new Error("Tournament not found — run seed first")

  const { matches } = await fdFetch(`/competitions/${WC_CODE}/matches`)
  const groups = await prisma.tournamentGroup.findMany({ where: { tournamentId: tournament.id } })
  const groupByLetter = Object.fromEntries(groups.map((g: { letter: string; id: string }) => [g.letter, g]))

  const allTeams = await prisma.team.findMany({ select: { id: true, code: true } })
  const teamsByCode = Object.fromEntries(allTeams.map((t: { id: string; code: string }) => [t.code, t.id]))

  // Build per-match functions then run in parallel batches (pool-safe, no long-held transaction)
  type MatchFn = () => Promise<unknown>
  const fns: MatchFn[] = []

  for (const m of matches) {
    const stage: Stage = STAGE_MAP[m.stage] ?? "GROUP"
    const groupLetter = m.group ? m.group.replace(/^GROUP_/, "") : null
    const group = groupLetter ? groupByLetter[groupLetter] : null
    const homeTeamId = m.homeTeam?.tla ? (teamsByCode[m.homeTeam.tla] ?? null) : null
    const awayTeamId = m.awayTeam?.tla ? (teamsByCode[m.awayTeam.tla] ?? null) : null

    let winnerId: string | null = null
    let isDraw: boolean | null = null
    let homeScore: number | null = null
    let awayScore: number | null = null

    if (m.score?.fullTime) {
      homeScore = m.score.fullTime.home
      awayScore = m.score.fullTime.away
      if (homeScore !== null && awayScore !== null) {
        isDraw = homeScore === awayScore
        if (!isDraw) winnerId = homeScore > awayScore ? homeTeamId : awayTeamId
      }
    }

    const homeTeamPlaceholder = homeTeamId ? null : (m.homeTeam?.name ?? null)
    const awayTeamPlaceholder = awayTeamId ? null : (m.awayTeam?.name ?? null)

    fns.push(() => prisma.match.upsert({
      where: { tournamentId_matchNumber: { tournamentId: tournament.id, matchNumber: m.id } },
      update: { homeTeamId, awayTeamId, homeTeamPlaceholder, awayTeamPlaceholder, homeScore, awayScore, isDraw, winnerId },
      create: {
        tournamentId: tournament.id,
        matchNumber: m.id,
        stage,
        groupId: group?.id ?? null,
        kickoff: new Date(m.utcDate),
        stadium: m.venue ?? "TBC",
        homeTeamId,
        awayTeamId,
        homeTeamPlaceholder,
        awayTeamPlaceholder,
        homeScore,
        awayScore,
        isDraw,
        winnerId,
        pointsAvailable: STAGE_POINTS[stage],
      },
    }))

    if (stage === "GROUP" && group) {
      if (homeTeamId) fns.push(() => prisma.groupTeam.upsert({
        where: { groupId_teamId: { groupId: group.id, teamId: homeTeamId } },
        update: {},
        create: { groupId: group.id, teamId: homeTeamId },
      }))
      if (awayTeamId) fns.push(() => prisma.groupTeam.upsert({
        where: { groupId_teamId: { groupId: group.id, teamId: awayTeamId } },
        update: {},
        create: { groupId: group.id, teamId: awayTeamId },
      }))
    }
  }

  await batch(fns)
  return `${matches.length} matches upserted`
}
