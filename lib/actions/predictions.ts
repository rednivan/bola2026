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

export async function renamePrediction(
  _prev: { ok?: boolean; message?: string },
  formData: FormData,
): Promise<{ ok: boolean; message: string }> {
  const userId = await getAuthUserId()
  const predictionId = formData.get("predictionId") as string
  const name = (formData.get("name") as string)?.trim()

  if (!name) return { ok: false, message: "Name cannot be empty." }
  if (name.length > 50) return { ok: false, message: "Name must be 50 characters or less." }

  try {
    await prisma.prediction.update({
      where: { id: predictionId, userId },
      data: { name },
    })
    revalidatePath("/predictions")
    return { ok: true, message: name }
  } catch (e: unknown) {
    if ((e as { code?: string })?.code === "P2002") {
      return { ok: false, message: `You already have a prediction called "${name}".` }
    }
    return { ok: false, message: "Failed to rename prediction." }
  }
}

export async function createPrediction(
  _prev: { error?: string },
  formData: FormData
): Promise<{ error?: string }> {
  const userId = await getAuthUserId()
  const name = (formData.get("name") as string)?.trim() || "My Prediction"

  const tournament = await prisma.tournament.findUnique({ where: { year: 2026 } })
  if (!tournament) return { error: "Tournament not found — contact an admin." }

  if (isPast(tournament.groupStageStart)) {
    return { error: "Group stage has started — predictions are closed." }
  }

  let prediction
  try {
    prediction = await prisma.prediction.create({
      data: { userId, tournamentId: tournament.id, name },
    })
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code
    if (code === "P2002") {
      return { error: `You already have a prediction called "${name}". Choose a different name.` }
    }
    return { error: "Something went wrong — please try again." }
  }

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

    await prisma.$transaction([
      prisma.groupStandingPrediction.deleteMany({ where: { predictionId } }),
      prisma.groupStandingPrediction.createMany({
        data: groups.flatMap(({ groupId, teams }) =>
          teams.map(({ teamId, position }) => ({ predictionId, groupId, teamId, predictedPosition: position }))
        ),
      }),
    ])

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

    await prisma.$transaction([
      prisma.thirdPlacePrediction.deleteMany({ where: { predictionId } }),
      prisma.thirdPlacePrediction.createMany({
        data: groupIds.map((groupId) => ({ predictionId, groupId })),
      }),
    ])

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
