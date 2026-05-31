"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { type Stage } from "@/lib/generated/prisma"
import { isPast } from "date-fns"

async function getAuthUserId(): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")
  return user.id
}

async function getPrediction(predictionId: string, userId: string) {
  const prediction = await prisma.prediction.findUnique({
    where: { id: predictionId },
    include: { tournament: true },
  })
  if (!prediction || prediction.userId !== userId) throw new Error("Not found")
  return prediction
}

export async function createPrediction(formData: FormData) {
  const userId = await getAuthUserId()
  const name = (formData.get("name") as string)?.trim()

  const tournament = await prisma.tournament.findUnique({ where: { year: 2026 } })
  if (!tournament) throw new Error("Tournament not found — run seed first")

  if (isPast(tournament.groupStageStart)) {
    throw new Error("Group stage has started — predictions are closed")
  }

  const prediction = await prisma.prediction.create({
    data: { userId, tournamentId: tournament.id, name: name || "My Prediction" },
  })

  redirect(`/predictions/${prediction.id}/edit`)
}

export type GroupPredictionData = {
  groupId: string
  teams: { teamId: string; position: number }[]
}

export async function saveGroupStandings(
  predictionId: string,
  groups: GroupPredictionData[]
): Promise<{ ok: boolean; message?: string }> {
  try {
    const userId = await getAuthUserId()
    const prediction = await getPrediction(predictionId, userId)
    if (prediction.groupLocked || new Date() >= prediction.tournament.groupStageStart) {
      return { ok: false, message: "Group predictions are locked" }
    }

    for (const { groupId, teams } of groups) {
      for (const { teamId, position } of teams) {
        await prisma.groupStandingPrediction.upsert({
          where: { predictionId_groupId_teamId: { predictionId, groupId, teamId } },
          update: { predictedPosition: position },
          create: { predictionId, groupId, teamId, predictedPosition: position },
        })
      }
    }

    revalidatePath(`/predictions/${predictionId}/edit`)
    return { ok: true }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}

export async function saveThirdPlacePicks(
  predictionId: string,
  groupIds: string[]
): Promise<{ ok: boolean; message?: string }> {
  try {
    const userId = await getAuthUserId()
    const prediction = await getPrediction(predictionId, userId)
    if (prediction.groupLocked || new Date() >= prediction.tournament.groupStageStart) {
      return { ok: false, message: "Group predictions are locked" }
    }
    if (groupIds.length !== 8) return { ok: false, message: "Select exactly 8 groups" }

    await prisma.thirdPlacePrediction.deleteMany({ where: { predictionId } })
    await prisma.thirdPlacePrediction.createMany({
      data: groupIds.map((groupId) => ({ predictionId, groupId })),
    })

    revalidatePath(`/predictions/${predictionId}/edit`)
    return { ok: true }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}

export type MatchPredictionData = {
  matchId: string
  predictedWinnerId: string | null
  isDraw: boolean
}

export async function saveMatchPredictions(
  predictionId: string,
  predictions: MatchPredictionData[]
): Promise<{ ok: boolean; message?: string }> {
  try {
    const userId = await getAuthUserId()
    const prediction = await getPrediction(predictionId, userId)
    if (prediction.groupLocked || new Date() >= prediction.tournament.groupStageStart) {
      return { ok: false, message: "Group predictions are locked" }
    }

    await prisma.$transaction([
      prisma.matchPrediction.deleteMany({
        where: { predictionId, match: { stage: "GROUP" } },
      }),
      prisma.matchPrediction.createMany({
        data: predictions.map(({ matchId, predictedWinnerId, isDraw }) => ({
          predictionId, matchId, predictedWinnerId, isDraw,
        })),
      }),
    ])

    revalidatePath(`/predictions/${predictionId}/edit`)
    return { ok: true }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}

export async function saveKOPredictions(
  predictionId: string,
  predictions: MatchPredictionData[]
): Promise<{ ok: boolean; message?: string }> {
  try {
    const userId = await getAuthUserId()
    const prediction = await getPrediction(predictionId, userId)
    const now = new Date()
    if (prediction.koLocked || now < prediction.tournament.groupStageEnd || now >= prediction.tournament.knockoutStageStart) {
      return { ok: false, message: "KO predictions are locked" }
    }

    await prisma.$transaction([
      prisma.matchPrediction.deleteMany({
        where: { predictionId, match: { stage: { in: ["R32", "R16", "QF", "SF", "THIRD_PLACE", "FINAL"] } } },
      }),
      prisma.matchPrediction.createMany({
        data: predictions.map(({ matchId, predictedWinnerId, isDraw }) => ({
          predictionId, matchId, predictedWinnerId, isDraw,
        })),
      }),
    ])

    const koTotal = await prisma.match.count({
      where: {
        tournamentId: prediction.tournamentId,
        stage: { in: ["R32", "R16", "QF", "SF", "THIRD_PLACE", "FINAL"] },
      },
    })
    const koPicked = await prisma.matchPrediction.count({
      where: {
        predictionId,
        match: { stage: { in: ["R32", "R16", "QF", "SF", "THIRD_PLACE", "FINAL"] } },
      },
    })
    if (koPicked >= koTotal && koTotal > 0) {
      await prisma.prediction.update({
        where: { id: predictionId },
        data: { status: "COMPLETE" },
      })
    }

    revalidatePath(`/predictions/${predictionId}/edit`)
    revalidatePath("/predictions")
    return { ok: true }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}

// stage: "GROUP" or KO stage string; matchId: null to clear the joker for that stage
export async function saveJokerPick(
  predictionId: string,
  stage: string,
  matchId: string | null,
): Promise<{ ok: boolean; message?: string }> {
  try {
    const userId = await getAuthUserId()
    const prediction = await getPrediction(predictionId, userId)

    const isKOStage = stage !== "GROUP"
    if (isKOStage) {
      const now = new Date()
      if (prediction.koLocked || now < prediction.tournament.groupStageEnd || now >= prediction.tournament.knockoutStageStart) {
        return { ok: false, message: "KO predictions are locked." }
      }
    } else {
      if (prediction.groupLocked || new Date() >= prediction.tournament.groupStageStart) {
        return { ok: false, message: "Group predictions are locked." }
      }
    }

    const stageEnum = stage as Stage

    if (matchId === null) {
      await prisma.jokerPick.deleteMany({ where: { predictionId, stage: stageEnum } })
    } else {
      await prisma.jokerPick.upsert({
        where: { predictionId_stage: { predictionId, stage: stageEnum } },
        update: { matchId },
        create: { predictionId, matchId, stage: stageEnum },
      })
    }

    revalidatePath(`/predictions/${predictionId}/edit`)
    return { ok: true }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}

// ─── Jules AI predictions ─────────────────────────────────────────────────────

type JulesPick = "home" | "draw" | "away"
type OddsOutcome = { name: string; price: number }
type OddsEvent = {
  home_team: string
  away_team: string
  bookmakers: { markets: { key: string; outcomes: OddsOutcome[] }[] }[]
}

function normName(s: string) { return s.toLowerCase().replace(/[^a-z]/g, "") }
function nameMatch(a: string, b: string) {
  const na = normName(a); const nb = normName(b)
  return na.includes(nb) || nb.includes(na)
}

export async function getJulesPredictions(): Promise<{
  ok: boolean
  picks: Record<string, JulesPick>
  source: "odds" | "fallback"
  message?: string
}> {
  const matches = await prisma.match.findMany({
    where: { stage: "GROUP", homeTeamId: { not: null }, awayTeamId: { not: null } },
    select: { id: true, homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } } },
  })

  const apiKey = process.env.ODDS_API_KEY
  if (!apiKey) {
    return {
      ok: true,
      picks: Object.fromEntries(matches.map(m => [m.id, "home" as JulesPick])),
      source: "fallback",
      message: "No odds data configured — Jules went with the home team for everyone.",
    }
  }

  try {
    const res = await fetch(
      `https://api.the-odds-api.com/v4/sports/soccer_fifa_world_cup/odds/?apiKey=${apiKey}&regions=eu&markets=h2h&oddsFormat=decimal`,
      { next: { revalidate: 3600 } }
    )
    if (!res.ok) throw new Error(`Odds API ${res.status}`)
    const events: OddsEvent[] = await res.json()

    const picks: Record<string, JulesPick> = {}
    let matched = 0

    for (const m of matches) {
      const homeName = m.homeTeam?.name ?? ""
      const awayName = m.awayTeam?.name ?? ""

      const event = events.find(e => nameMatch(e.home_team, homeName) && nameMatch(e.away_team, awayName))
      if (!event) continue

      const market = event.bookmakers.flatMap(b => b.markets).find(mk => mk.key === "h2h")
      if (!market) continue

      const homeOdds = market.outcomes.find(o => nameMatch(o.name, homeName))?.price ?? 999
      const awayOdds = market.outcomes.find(o => nameMatch(o.name, awayName))?.price ?? 999
      const drawOdds = market.outcomes.find(o => o.name === "Draw")?.price ?? 999

      if (homeOdds <= awayOdds && homeOdds <= drawOdds) picks[m.id] = "home"
      else if (awayOdds < homeOdds && awayOdds <= drawOdds) picks[m.id] = "away"
      else picks[m.id] = "draw"
      matched++
    }

    // Fill any matches not found in odds with "home" fallback
    for (const m of matches) {
      if (!picks[m.id]) picks[m.id] = "home"
    }

    // Persist successful fetch so it can be used as fallback later
    if (matched > 0) {
      await prisma.oddsCache.upsert({
        where: { key: "jules_group" },
        update: { picks },
        create: { key: "jules_group", picks },
      })
    }

    const missing = matches.length - matched
    return {
      ok: true,
      picks,
      source: "odds",
      message: missing > 0
        ? `Jules predicted ${matched} matches from live odds — home team used for the other ${missing} (odds not yet available).`
        : undefined,
    }
  } catch {
    // Try DB cache from last successful fetch
    const cached = await prisma.oddsCache.findUnique({ where: { key: "jules_group" } })
    if (cached) {
      const age = Math.round((Date.now() - cached.updatedAt.getTime()) / 1000 / 60 / 60)
      return {
        ok: true,
        picks: cached.picks as Record<string, JulesPick>,
        source: "fallback",
        message: `Live odds unavailable — Jules is using cached odds from ${age}h ago.`,
      }
    }
    return {
      ok: true,
      picks: Object.fromEntries(matches.map(m => [m.id, "home" as JulesPick])),
      source: "fallback",
      message: "Could not reach odds provider — Jules went with the home team for everyone.",
    }
  }
}

export async function deletePrediction(predictionId: string): Promise<{ error?: string }> {
  try {
    const userId = await getAuthUserId()
    await getPrediction(predictionId, userId)

    await prisma.leagueMembership.deleteMany({ where: { predictionId } })
    await prisma.groupStandingPrediction.deleteMany({ where: { predictionId } })
    await prisma.matchPrediction.deleteMany({ where: { predictionId } })
    await prisma.thirdPlacePrediction.deleteMany({ where: { predictionId } })
    await prisma.jokerPick.deleteMany({ where: { predictionId } })
    await prisma.prediction.delete({ where: { id: predictionId } })
  } catch (e) {
    return { error: (e as Error).message }
  }

  redirect("/predictions")
}
