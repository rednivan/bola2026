"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

async function getAuthUserId(): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")
  return user.id
}

function randomCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

const createSchema = z.object({
  name: z.string().min(2).max(40),
  isPublic: z.boolean().default(false),
})

export type LeagueState = { error?: string; fieldErrors?: Record<string, string[]> }

export async function createLeague(
  _prev: LeagueState,
  formData: FormData
): Promise<LeagueState> {
  try {
    const userId = await getAuthUserId()

    const parsed = createSchema.safeParse({
      name: formData.get("name"),
      isPublic: formData.get("isPublic") === "on",
    })
    if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors }

    const prediction = await prisma.prediction.findFirst({
      where: { userId, tournament: { year: 2026 } },
    })
    if (!prediction) return { error: "Create a prediction before joining a league." }

    const tournament = await prisma.tournament.findUnique({ where: { year: 2026 } })
    if (!tournament) return { error: "Tournament not found." }

    // Generate a unique join code
    let joinCode = randomCode()
    while (await prisma.league.findUnique({ where: { joinCode } })) {
      joinCode = randomCode()
    }

    const league = await prisma.league.create({
      data: {
        tournamentId: tournament.id,
        name: parsed.data.name,
        creatorId: userId,
        joinCode,
        isPublic: parsed.data.isPublic,
        memberships: {
          create: { predictionId: prediction.id },
        },
      },
    })

    revalidatePath("/leagues")
    return {}
  } catch (e) {
    return { error: (e as Error).message }
  }
}

const joinSchema = z.object({
  code: z.string().length(6),
})

export async function joinLeague(
  _prev: LeagueState,
  formData: FormData
): Promise<LeagueState> {
  try {
    const userId = await getAuthUserId()

    const parsed = joinSchema.safeParse({
      code: (formData.get("code") as string)?.trim().toUpperCase(),
    })
    if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors }

    const prediction = await prisma.prediction.findFirst({
      where: { userId, tournament: { year: 2026 } },
    })
    if (!prediction) return { error: "Create a prediction before joining a league." }

    const league = await prisma.league.findUnique({ where: { joinCode: parsed.data.code } })
    if (!league) return { error: "League not found — check the code and try again." }

    const existing = await prisma.leagueMembership.findUnique({
      where: { leagueId_predictionId: { leagueId: league.id, predictionId: prediction.id } },
    })
    if (existing) return { error: "You've already joined this league." }

    await prisma.leagueMembership.create({
      data: { leagueId: league.id, predictionId: prediction.id },
    })

    revalidatePath("/leagues")
    return {}
  } catch (e) {
    return { error: (e as Error).message }
  }
}
