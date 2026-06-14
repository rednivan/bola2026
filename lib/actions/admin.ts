"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { syncTeamsFromApi, syncMatchesFromApi } from "@/lib/sync"
import { recalculateAllScores } from "@/lib/scoring"
import { sendMatchdayEmail } from "@/lib/emails/daily-results"
import { sendKOWindowReminder } from "@/lib/emails/ko-reminder"

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")

  const dbUser = await prisma.user.findUnique({ where: { id: user.id } })
  if (dbUser?.role !== "ADMIN") throw new Error("Forbidden")
}

// ─── Sync ─────────────────────────────────────────────────────────────────────

export async function syncTeams(): Promise<{ ok: boolean; message: string }> {
  try {
    await requireAdmin()
    const message = await syncTeamsFromApi()
    return { ok: true, message }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}

export async function syncMatches(): Promise<{ ok: boolean; message: string }> {
  try {
    await requireAdmin()
    const message = await syncMatchesFromApi()
    return { ok: true, message }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}

export async function syncAll(): Promise<{ ok: boolean; message: string }> {
  try {
    await requireAdmin()
    const [teams, matches] = await Promise.all([syncTeamsFromApi(), syncMatchesFromApi()])
    return { ok: true, message: `${teams} · ${matches}` }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}

// ─── Manual score update ──────────────────────────────────────────────────────

export async function updateMatchScore(
  matchId: string,
  homeScore: number,
  awayScore: number,
  winnerIdOverride?: string | null,
): Promise<{ ok: boolean; message: string }> {
  try {
    await requireAdmin()

    const match = await prisma.match.findUnique({
      where: { id: matchId },
      select: { stage: true, homeTeamId: true, awayTeamId: true },
    })
    if (!match) return { ok: false, message: "Match not found." }

    const isGroupStage = match.stage === "GROUP"
    let winnerId: string | null = null
    let isDraw: boolean | null = null

    if (isGroupStage) {
      isDraw = homeScore === awayScore
      winnerId = isDraw ? null : homeScore > awayScore ? match.homeTeamId : match.awayTeamId
    } else {
      isDraw = false
      if (homeScore > awayScore) {
        winnerId = match.homeTeamId
      } else if (awayScore > homeScore) {
        winnerId = match.awayTeamId
      } else {
        if (!winnerIdOverride) {
          return { ok: false, message: "Scores are level — select the winner (pens / AET)." }
        }
        winnerId = winnerIdOverride
      }
    }

    await prisma.match.update({
      where: { id: matchId },
      data: { homeScore, awayScore, isDraw, winnerId },
    })

    revalidatePath("/admin")
    return { ok: true, message: "Score saved." }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}

// ─── Recalculate scores & league ranks ───────────────────────────────────────

export async function recalculateScores(): Promise<{ ok: boolean; message: string }> {
  try {
    await requireAdmin()
    const { predictions, leagues } = await recalculateAllScores()
    revalidatePath("/leagues")
    return { ok: true, message: `Recalculated ${predictions} predictions across ${leagues} leagues.` }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}

// ─── Sync & recalculate now (same as the sync-and-score cron) ────────────────

export async function runSyncAndRecalculate(): Promise<{ ok: boolean; message: string }> {
  try {
    await requireAdmin()
    const syncMessage = await syncMatchesFromApi()
    const { predictions, leagues } = await recalculateAllScores()
    const message = `${syncMessage} · recalculated ${predictions} predictions across ${leagues} leagues`
    await prisma.cronLog.create({ data: { job: "sync-and-score", ok: true, message } })
    revalidatePath("/leagues")
    revalidatePath("/admin")
    return { ok: true, message }
  } catch (e) {
    const message = (e as Error).message
    await prisma.cronLog.create({ data: { job: "sync-and-score", ok: false, message } }).catch(() => {})
    return { ok: false, message }
  }
}

// ─── Trigger matchday emails ──────────────────────────────────────────────────

export async function triggerMatchdayEmails(
  matchday: string,
  force: boolean,
): Promise<{ ok: boolean; message: string }> {
  try {
    await requireAdmin()

    const tournament = await prisma.tournament.findUnique({ where: { year: 2026 } })
    if (!tournament) return { ok: false, message: "Tournament not found." }

    if (force) {
      await prisma.matchdayEmailLog.deleteMany({ where: { matchday } })
    }

    const alreadySent = await prisma.matchdayEmailLog.findMany({
      where: { matchday },
      select: { userId: true },
    })
    const sentIds = new Set(alreadySent.map((r) => r.userId))

    const users = await prisma.user.findMany({
      where: {
        predictions: { some: { tournamentId: tournament.id } },
        emailOptOut: false,
        ...(sentIds.size > 0 ? { NOT: { id: { in: [...sentIds] } } } : {}),
      },
      select: { id: true, email: true },
    })

    if (users.length === 0) {
      return { ok: true, message: "All users already received this matchday's email. Use force resend to override." }
    }

    let sent = 0
    const errors: string[] = []
    for (const user of users) {
      try {
        await sendMatchdayEmail(user.email, user.id, matchday, tournament.id)
        await prisma.matchdayEmailLog.create({ data: { userId: user.id, matchday } })
        sent++
      } catch (e) {
        errors.push(`${user.email}: ${(e as Error).message}`)
      }
    }

    const summary = `Sent ${sent}/${users.length} emails for ${matchday}.`
    return {
      ok: errors.length === 0,
      message: errors.length > 0 ? `${summary} Errors: ${errors.join("; ")}` : summary,
    }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}

// ─── Tournament date editor ───────────────────────────────────────────────────

export async function updateTournamentDates(
  groupStageStart: string,
  groupStageEnd: string,
  knockoutStageStart: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    await requireAdmin()
    const tournament = await prisma.tournament.findUnique({ where: { year: 2026 } })
    if (!tournament) return { ok: false, message: "Tournament not found." }

    await prisma.tournament.update({
      where: { year: 2026 },
      data: {
        groupStageStart: new Date(groupStageStart),
        groupStageEnd: new Date(groupStageEnd),
        knockoutStageStart: new Date(knockoutStageStart),
      },
    })
    revalidatePath("/admin")
    return { ok: true, message: "Tournament dates updated." }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}

// ─── Group standings + 3rd-place admin ───────────────────────────────────────

export async function saveGroupStandings(
  standings: { groupId: string; teamId: string; position: number }[]
): Promise<{ ok: boolean; message: string }> {
  try {
    await requireAdmin()

    for (const s of standings) {
      await prisma.groupTeam.update({
        where: { groupId_teamId: { groupId: s.groupId, teamId: s.teamId } },
        data: { actualPosition: s.position },
      })
    }

    revalidatePath("/admin")
    return { ok: true, message: `Saved ${standings.length} positions.` }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}

export async function calculateGroupStandingPoints(): Promise<{ ok: boolean; message: string }> {
  try {
    await requireAdmin()

    // Fetch actual positions
    const actualPositions = await prisma.groupTeam.findMany({
      where: { actualPosition: { not: null } },
      select: { groupId: true, teamId: true, actualPosition: true },
    })
    const positionMap = new Map(actualPositions.map((p) => [`${p.groupId}:${p.teamId}`, p.actualPosition!]))

    // Reset all standing prediction points
    await prisma.groupStandingPrediction.updateMany({ data: { pointsEarned: 0 } })

    // Award 1pt per correct position
    for (const [key, actualPos] of positionMap) {
      const [groupId, teamId] = key.split(":")
      await prisma.groupStandingPrediction.updateMany({
        where: { groupId, teamId, predictedPosition: actualPos },
        data: { pointsEarned: 1 },
      })
    }

    const updated = await prisma.groupStandingPrediction.count({ where: { pointsEarned: 1 } })
    return { ok: true, message: `Awarded points for ${updated} correct standing predictions.` }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}

export async function saveThirdPlaceQualifiers(
  qualifiedGroupIds: string[]
): Promise<{ ok: boolean; message: string }> {
  try {
    await requireAdmin()

    if (qualifiedGroupIds.length !== 8) {
      return { ok: false, message: `Select exactly 8 groups (got ${qualifiedGroupIds.length}).` }
    }

    // Reset all
    await prisma.groupTeam.updateMany({ data: { thirdPlaceQualified: false } })

    // Mark qualified 3rd-place teams
    for (const groupId of qualifiedGroupIds) {
      await prisma.groupTeam.updateMany({
        where: { groupId, actualPosition: 3 },
        data: { thirdPlaceQualified: true },
      })
    }

    revalidatePath("/admin")
    return { ok: true, message: `Marked 3rd-place qualifiers for ${qualifiedGroupIds.length} groups.` }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}

export async function calculateThirdPlacePoints(): Promise<{ ok: boolean; message: string }> {
  try {
    await requireAdmin()

    // Reset all third-place prediction points
    await prisma.thirdPlacePrediction.updateMany({ data: { pointsEarned: 0 } })

    // Qualified group IDs (where 3rd-place team qualifies)
    const qualified = await prisma.groupTeam.findMany({
      where: { thirdPlaceQualified: true },
      select: { groupId: true },
    })
    const qualifiedGroupIds = qualified.map((q) => q.groupId)

    if (qualifiedGroupIds.length === 0) {
      return { ok: true, message: "No qualified 3rd-place teams set yet." }
    }

    // Award 1pt per correctly predicted qualified group
    await prisma.thirdPlacePrediction.updateMany({
      where: { groupId: { in: qualifiedGroupIds } },
      data: { pointsEarned: 1 },
    })

    const awarded = await prisma.thirdPlacePrediction.count({ where: { pointsEarned: 1 } })
    return { ok: true, message: `Awarded points for ${awarded} correct 3rd-place predictions.` }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}

export async function getTournamentDates(): Promise<{
  groupStageStart: string
  groupStageEnd: string
  knockoutStageStart: string
} | null> {
  const t = await prisma.tournament.findUnique({ where: { year: 2026 } })
  if (!t) return null
  return {
    groupStageStart: t.groupStageStart.toISOString().slice(0, 16),
    groupStageEnd: t.groupStageEnd.toISOString().slice(0, 16),
    knockoutStageStart: t.knockoutStageStart.toISOString().slice(0, 16),
  }
}

// ─── KO window reminder ───────────────────────────────────────────────────────

// Uses matchday sentinel "ko-window-reminder" in MatchdayEmailLog to track sends
const KO_REMINDER_SENTINEL = "ko-window-reminder"

export async function sendKOReminder(
  force: boolean,
): Promise<{ ok: boolean; message: string }> {
  try {
    await requireAdmin()

    const tournament = await prisma.tournament.findUnique({ where: { year: 2026 } })
    if (!tournament) return { ok: false, message: "Tournament not found." }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://bola.wathan.my"

    if (force) {
      await prisma.matchdayEmailLog.deleteMany({ where: { matchday: KO_REMINDER_SENTINEL } })
    }

    const alreadySent = await prisma.matchdayEmailLog.findMany({
      where: { matchday: KO_REMINDER_SENTINEL },
      select: { userId: true },
    })
    const sentIds = new Set(alreadySent.map((r) => r.userId))

    // Fetch users with their predictions so we can include direct links
    const users = await prisma.user.findMany({
      where: {
        predictions: { some: { tournamentId: tournament.id } },
        emailOptOut: false,
        ...(sentIds.size > 0 ? { NOT: { id: { in: [...sentIds] } } } : {}),
      },
      select: {
        id: true,
        email: true,
        predictions: {
          where: { tournamentId: tournament.id },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        },
      },
    })

    if (users.length === 0) {
      return { ok: true, message: "All users have already received the KO reminder. Use force resend to override." }
    }

    let sent = 0
    const errors: string[] = []
    for (const user of users) {
      try {
        await sendKOWindowReminder(user.email, user.id, user.predictions, tournament.knockoutStageStart, appUrl)
        await prisma.matchdayEmailLog.create({ data: { userId: user.id, matchday: KO_REMINDER_SENTINEL } })
        sent++
      } catch (e) {
        errors.push(`${user.email}: ${(e as Error).message}`)
      }
    }

    const summary = `Sent KO reminder to ${sent}/${users.length} users.`
    return {
      ok: errors.length === 0,
      message: errors.length > 0 ? `${summary} Errors: ${errors.join("; ")}` : summary,
    }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}
