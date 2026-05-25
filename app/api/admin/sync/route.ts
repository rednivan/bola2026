import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { Confederation, Stage } from "@/lib/generated/prisma"

const API_BASE = process.env.FOOTBALL_DATA_BASE_URL!
const API_KEY = process.env.FOOTBALL_DATA_API_KEY!
const WC_CODE = "WC" // football-data.org competition code for World Cup

// Map football-data.org area codes to our Confederation enum
const CONFEDERATION_MAP: Record<string, Confederation> = {
  EUR: "UEFA",
  SAM: "CONMEBOL",
  CONMEBOL: "CONMEBOL",
  CONCACAF: "CONCACAF",
  AFC: "AFC",
  CAF: "CAF",
  OFC: "OFC",
}

// Map football-data.org stage strings to our Stage enum
const STAGE_MAP: Record<string, Stage> = {
  GROUP_STAGE: "GROUP",
  ROUND_OF_32: "R32",
  ROUND_OF_16: "R16",
  QUARTER_FINALS: "QF",
  SEMI_FINALS: "SF",
  THIRD_PLACE: "THIRD_PLACE",
  FINAL: "FINAL",
}

// Points per stage
const STAGE_POINTS: Record<Stage, number> = {
  GROUP: 1,
  R32: 3,
  R16: 6,
  QF: 12,
  SF: 20,
  THIRD_PLACE: 10,
  FINAL: 35,
}

async function fdFetch(path: string) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "X-Auth-Token": API_KEY },
    next: { revalidate: 0 },
  })
  if (!res.ok) throw new Error(`football-data.org ${path}: ${res.status}`)
  return res.json()
}

export async function POST(request: Request) {
  // Admin-only guard
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const dbUser = await prisma.user.findUnique({ where: { id: user.id } })
  if (dbUser?.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const mode = body.mode ?? "all" // "teams" | "matches" | "all"

  const tournament = await prisma.tournament.findUnique({ where: { year: 2026 } })
  if (!tournament) {
    return NextResponse.json({ error: "Tournament not found — run seed first" }, { status: 400 })
  }

  const results: Record<string, unknown> = {}

  // ── Sync teams ────────────────────────────────────────────────────────────
  if (mode === "teams" || mode === "all") {
    const { teams } = await fdFetch(`/competitions/${WC_CODE}/teams`)
    const groups = await prisma.tournamentGroup.findMany({
      where: { tournamentId: tournament.id },
    })
    const groupByLetter = Object.fromEntries(groups.map((g) => [g.letter, g]))

    let teamsCreated = 0
    for (const t of teams) {
      const confederation: Confederation =
        CONFEDERATION_MAP[t.area?.code] ?? "UEFA"

      const team = await prisma.team.upsert({
        where: { code: t.tla },
        update: { name: t.name, flagUrl: t.crest ?? "", fifaRanking: null },
        create: {
          name: t.name,
          code: t.tla,
          flagUrl: t.crest ?? "",
          confederation,
        },
      })

      // Link team to its group if the API provides group info
      if (t.group) {
        const letter = t.group.replace("Group ", "").trim()
        const group = groupByLetter[letter]
        if (group) {
          await prisma.groupTeam.upsert({
            where: { groupId_teamId: { groupId: group.id, teamId: team.id } },
            update: {},
            create: { groupId: group.id, teamId: team.id },
          })
        }
      }
      teamsCreated++
    }
    results.teams = `${teamsCreated} teams upserted`
  }

  // ── Sync matches ──────────────────────────────────────────────────────────
  if (mode === "matches" || mode === "all") {
    const { matches } = await fdFetch(`/competitions/${WC_CODE}/matches`)
    const groups = await prisma.tournamentGroup.findMany({
      where: { tournamentId: tournament.id },
    })
    const groupByLetter = Object.fromEntries(groups.map((g) => [g.letter, g]))
    const teamsByCode: Record<string, string> = {}
    const allTeams = await prisma.team.findMany({ select: { id: true, code: true } })
    allTeams.forEach((t) => { teamsByCode[t.code] = t.id })

    let matchesCreated = 0
    for (const m of matches) {
      const stage: Stage = STAGE_MAP[m.stage] ?? "GROUP"
      const groupLetter = m.group?.replace("Group ", "").trim() ?? null
      const group = groupLetter ? groupByLetter[groupLetter] : null

      const homeTeamId = m.homeTeam?.tla ? teamsByCode[m.homeTeam.tla] : null
      const awayTeamId = m.awayTeam?.tla ? teamsByCode[m.awayTeam.tla] : null

      // Resolve actual result if match played
      let winnerId: string | null = null
      let isDraw: boolean | null = null
      let homeScore: number | null = null
      let awayScore: number | null = null

      if (m.score?.fullTime) {
        homeScore = m.score.fullTime.home
        awayScore = m.score.fullTime.away
        if (homeScore !== null && awayScore !== null) {
          isDraw = homeScore === awayScore
          if (!isDraw) {
            winnerId = homeScore > awayScore ? homeTeamId : awayTeamId
          }
        }
      }

      await prisma.match.upsert({
        where: { tournamentId_matchNumber: { tournamentId: tournament.id, matchNumber: m.id } },
        update: { homeTeamId, awayTeamId, homeScore, awayScore, isDraw, winnerId },
        create: {
          tournamentId: tournament.id,
          matchNumber: m.id,
          stage,
          groupId: group?.id ?? null,
          kickoff: new Date(m.utcDate),
          stadium: m.venue ?? "TBC",
          homeTeamId,
          awayTeamId,
          homeTeamPlaceholder: homeTeamId ? null : (m.homeTeam?.name ?? null),
          awayTeamPlaceholder: awayTeamId ? null : (m.awayTeam?.name ?? null),
          homeScore,
          awayScore,
          isDraw,
          winnerId,
          pointsAvailable: STAGE_POINTS[stage],
        },
      })
      matchesCreated++
    }
    results.matches = `${matchesCreated} matches upserted`
  }

  return NextResponse.json({ ok: true, ...results })
}
