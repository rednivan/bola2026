import { prisma } from "@/lib/prisma"
import { Confederation, Prisma, Stage } from "@/lib/generated/prisma"

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

// Run promise-returning functions sequentially. The production DB connection
// is capped at connection_limit=1, so any concurrency here just queues up
// behind that single connection and eventually trips the 10s pool timeout.
async function batch<T>(fns: (() => Promise<T>)[], size = 1): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < fns.length; i += size) {
    out.push(...await Promise.all(fns.slice(i, i + size).map((f) => f())))
  }
  return out
}

async function fdFetch(path: string) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        headers: { "X-Auth-Token": API_KEY },
        cache: "no-store",
      })
      if (!res.ok) throw new Error(`football-data.org ${path}: ${res.status} ${res.statusText}`)
      return res.json()
    } catch (e) {
      // Retry once after a short delay — transient network blips (e.g. "fetch failed")
      // would otherwise fail the whole sync-and-score cron run.
      if (attempt >= 2) throw e
      await new Promise((r) => setTimeout(r, 1000))
    }
  }
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

  const allTeams = await prisma.team.findMany({ select: { id: true, code: true, name: true } })
  const teamsByCode = Object.fromEntries(allTeams.map((t: { id: string; code: string; name: string }) => [t.code, t.id]))
  // Fallback for TLA mismatches between the teams API and matches API (e.g. URY vs URU)
  const teamsByName = Object.fromEntries(allTeams.map((t: { id: string; code: string; name: string }) => [t.name.toLowerCase(), t.id]))

  type MatchRow = {
    matchNumber: number
    homeTeamId: string | null
    awayTeamId: string | null
    homeTeamPlaceholder: string | null
    awayTeamPlaceholder: string | null
    homeScore: number | null
    awayScore: number | null
    isDraw: boolean | null
    winnerId: string | null
  }

  const matchRows: MatchRow[] = []
  const groupTeamPairs = new Map<string, { groupId: string; teamId: string }>()

  for (const m of matches) {
    const stage: Stage = STAGE_MAP[m.stage] ?? "GROUP"
    const groupLetter = m.group ? m.group.replace(/^GROUP_/, "") : null
    const group = groupLetter ? groupByLetter[groupLetter] : null
    const homeTeamId = (m.homeTeam?.tla ? teamsByCode[m.homeTeam.tla] : null)
      ?? (m.homeTeam?.name ? teamsByName[m.homeTeam.name.toLowerCase()] : null)
      ?? null
    const awayTeamId = (m.awayTeam?.tla ? teamsByCode[m.awayTeam.tla] : null)
      ?? (m.awayTeam?.name ? teamsByName[m.awayTeam.name.toLowerCase()] : null)
      ?? null

    let winnerId: string | null = null
    let isDraw: boolean | null = null
    let homeScore: number | null = null
    let awayScore: number | null = null

    // football-data.org populates score.fullTime with the live score while a match
    // is still IN_PLAY/PAUSED — only treat the result as final once the match has ended.
    const isFinal = m.status === "FINISHED" || m.status === "AWARDED"
    if (isFinal && m.score?.fullTime) {
      homeScore = m.score.fullTime.home
      awayScore = m.score.fullTime.away
      if (homeScore !== null && awayScore !== null) {
        isDraw = homeScore === awayScore
        if (!isDraw) winnerId = homeScore > awayScore ? homeTeamId : awayTeamId
      }
    }

    const homeTeamPlaceholder = homeTeamId ? null : (m.homeTeam?.name ?? null)
    const awayTeamPlaceholder = awayTeamId ? null : (m.awayTeam?.name ?? null)

    matchRows.push({
      matchNumber: m.id,
      homeTeamId, awayTeamId, homeTeamPlaceholder, awayTeamPlaceholder,
      homeScore, awayScore, isDraw, winnerId,
    })

    if (stage === "GROUP" && group) {
      if (homeTeamId) groupTeamPairs.set(`${group.id}:${homeTeamId}`, { groupId: group.id, teamId: homeTeamId })
      if (awayTeamId) groupTeamPairs.set(`${group.id}:${awayTeamId}`, { groupId: group.id, teamId: awayTeamId })
    }
  }

  // Bulk-update existing matches (all 104 are pre-seeded with stage/group/kickoff/
  // stadium/pointsAvailable) in one round trip instead of one upsert per match.
  if (matchRows.length > 0) {
    await prisma.$executeRaw`
      UPDATE "Match" m
      SET
        "homeTeamId" = v."homeTeamId",
        "awayTeamId" = v."awayTeamId",
        "homeTeamPlaceholder" = v."homeTeamPlaceholder",
        "awayTeamPlaceholder" = v."awayTeamPlaceholder",
        "homeScore" = v."homeScore",
        "awayScore" = v."awayScore",
        "isDraw" = v."isDraw",
        "winnerId" = v."winnerId"
      FROM (VALUES ${Prisma.join(matchRows.map((r) => Prisma.sql`(
        ${r.matchNumber}::int, ${r.homeTeamId}::text, ${r.awayTeamId}::text,
        ${r.homeTeamPlaceholder}::text, ${r.awayTeamPlaceholder}::text,
        ${r.homeScore}::int, ${r.awayScore}::int, ${r.isDraw}::bool, ${r.winnerId}::text
      )`))}) AS v("matchNumber", "homeTeamId", "awayTeamId", "homeTeamPlaceholder", "awayTeamPlaceholder", "homeScore", "awayScore", "isDraw", "winnerId")
      WHERE m."tournamentId" = ${tournament.id} AND m."matchNumber" = v."matchNumber"
    `
  }

  if (groupTeamPairs.size > 0) {
    await prisma.$executeRaw`
      INSERT INTO "GroupTeam" ("groupId", "teamId")
      VALUES ${Prisma.join([...groupTeamPairs.values()].map((p) => Prisma.sql`(${p.groupId}::text, ${p.teamId}::text)`))}
      ON CONFLICT ("groupId", "teamId") DO NOTHING
    `
  }

  return `${matches.length} matches upserted`
}
