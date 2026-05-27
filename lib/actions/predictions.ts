"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
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
    if (prediction.groupLocked) return { ok: false, message: "Predictions are locked" }

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
    if (prediction.groupLocked) return { ok: false, message: "Predictions are locked" }
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
    if (prediction.groupLocked) return { ok: false, message: "Group predictions are locked" }

    for (const { matchId, predictedWinnerId, isDraw } of predictions) {
      await prisma.matchPrediction.upsert({
        where: { predictionId_matchId: { predictionId, matchId } },
        update: { predictedWinnerId, isDraw },
        create: { predictionId, matchId, predictedWinnerId, isDraw },
      })
    }

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
    if (prediction.koLocked) return { ok: false, message: "KO predictions are locked" }

    for (const { matchId, predictedWinnerId, isDraw } of predictions) {
      await prisma.matchPrediction.upsert({
        where: { predictionId_matchId: { predictionId, matchId } },
        update: { predictedWinnerId, isDraw },
        create: { predictionId, matchId, predictedWinnerId, isDraw },
      })
    }

    revalidatePath(`/predictions/${predictionId}/edit`)
    return { ok: true }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}
