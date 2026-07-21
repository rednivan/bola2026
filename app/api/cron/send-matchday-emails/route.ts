import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { findActiveTournament } from "@/lib/tournament"
import { sendMatchdayEmail, matchdayDateString, getMatchdayContext, type LeagueTableRow } from "@/lib/emails/daily-results"

const JOB = "send-matchday-emails"

export const maxDuration = 60

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 })
  }

  try {
    const tournament = await findActiveTournament()
    if (!tournament) {
      await prisma.cronLog.create({ data: { job: JOB, ok: true, message: "No tournament found" } })
      return NextResponse.json({ ok: true, message: "No tournament found", sent: 0 })
    }

    const allMatches = await prisma.match.findMany({
      where: { tournamentId: tournament.id },
      select: { kickoff: true, homeScore: true },
    })

    const byDate = new Map<string, { total: number; completed: number }>()
    for (const m of allMatches) {
      const date = matchdayDateString(m.kickoff, tournament.matchdayTzOffsetHours)
      const entry = byDate.get(date) ?? { total: 0, completed: 0 }
      entry.total++
      if (m.homeScore !== null) entry.completed++
      byDate.set(date, entry)
    }

    const completedMatchdays = [...byDate.entries()]
      .filter(([, { total, completed }]) => total > 0 && total === completed)
      .map(([date]) => date)
      .sort()

    if (completedMatchdays.length === 0) {
      await prisma.cronLog.create({ data: { job: JOB, ok: true, message: "No completed match days yet" } })
      return NextResponse.json({ ok: true, message: "No completed match days yet", sent: 0 })
    }

    const allUsers = await prisma.user.findMany({
      where: { predictions: { some: { tournamentId: tournament.id } }, emailOptOut: false },
      select: { id: true, email: true },
    })

    const todayStart = new Date()
    todayStart.setUTCHours(0, 0, 0, 0)
    const sentTodayRows = await prisma.matchdayEmailLog.findMany({
      where: { sentAt: { gte: todayStart } },
      select: { userId: true },
    })
    const sentTodayIds = new Set(sentTodayRows.map((r) => r.userId))

    let totalSent = 0
    const errors: string[] = []
    const leagueTableCache = new Map<string, LeagueTableRow[]>()

    for (const matchday of completedMatchdays) {
      const alreadySent = await prisma.matchdayEmailLog.findMany({
        where: { matchday },
        select: { userId: true },
      })
      const sentForMatchdayIds = new Set(alreadySent.map((r) => r.userId))

      const pending = allUsers.filter(
        (u) => !sentForMatchdayIds.has(u.id) && !sentTodayIds.has(u.id)
      )
      if (pending.length === 0) continue

      const context = await getMatchdayContext(tournament.id, matchday)

      for (const user of pending) {
        try {
          await sendMatchdayEmail(user.email, user.id, matchday, tournament.id, context, leagueTableCache)
          await prisma.matchdayEmailLog.create({ data: { userId: user.id, matchday } })
          sentTodayIds.add(user.id)
          totalSent++
        } catch (e) {
          errors.push(`${user.email}: ${(e as Error).message}`)
        }
      }
    }

    const message = errors.length > 0
      ? `Sent ${totalSent} emails. Errors: ${errors.join("; ")}`
      : `Sent ${totalSent} emails`

    await prisma.cronLog.create({ data: { job: JOB, ok: errors.length === 0, message } })

    return NextResponse.json({ ok: true, sent: totalSent, ...(errors.length > 0 && { errors }) })
  } catch (e) {
    const message = (e as Error).message
    await prisma.cronLog.create({ data: { job: JOB, ok: false, message } }).catch(() => {})
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
