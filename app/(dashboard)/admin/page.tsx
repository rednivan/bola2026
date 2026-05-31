import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { AdminPanels, type MatchRow, type MatchdayStatus, type KOReminderStatus, type TournamentDates, type GroupData, type CronActivity } from "./admin-panels"

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect("/login")
  const user = session.user

  const dbUser = await prisma.user.findUnique({ where: { id: user.id } })
  if (dbUser?.role !== "ADMIN") redirect("/dashboard")

  const tournament = await prisma.tournament.findUnique({ where: { year: 2026 } })

  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)

  const [rawMatches, emailLogs, koReminderLogs, rawGroups, cronLogs, emailsSentToday] = await Promise.all([
    tournament
      ? prisma.match.findMany({
          where: { tournamentId: tournament.id },
          select: {
            id: true,
            stage: true,
            matchNumber: true,
            kickoff: true,
            homeScore: true,
            awayScore: true,
            homeTeamId: true,
            awayTeamId: true,
            homeTeam: { select: { name: true, code: true } },
            awayTeam: { select: { name: true, code: true } },
            homeTeamPlaceholder: true,
            awayTeamPlaceholder: true,
            group: { select: { letter: true } },
          },
          orderBy: [{ kickoff: "desc" }, { matchNumber: "asc" }],
        })
      : Promise.resolve([]),

    tournament
      ? prisma.matchdayEmailLog.groupBy({
          by: ["matchday"],
          _count: { userId: true },
          where: { user: { predictions: { some: { tournamentId: tournament.id } } } },
        })
      : Promise.resolve([]),

    tournament
      ? prisma.matchdayEmailLog.count({
          where: { matchday: "ko-window-reminder" },
        })
      : Promise.resolve(0),

    tournament
      ? prisma.tournamentGroup.findMany({
          where: { tournamentId: tournament.id },
          include: {
            teams: {
              include: { team: { select: { id: true, name: true, code: true } } },
              orderBy: { actualPosition: "asc" },
            },
          },
          orderBy: { letter: "asc" },
        })
      : Promise.resolve([]),

    prisma.cronLog.findMany({
      where: { createdAt: { gte: todayStart } },
      orderBy: { createdAt: "asc" },
    }),

    tournament
      ? prisma.matchdayEmailLog.count({
          where: {
            sentAt: { gte: todayStart },
            NOT: { matchday: "ko-window-reminder" },
          },
        })
      : Promise.resolve(0),
  ])

  const matches: MatchRow[] = rawMatches.map((m) => ({
    id: m.id,
    stage: m.stage,
    matchNumber: m.matchNumber,
    kickoff: m.kickoff,
    homeTeamId: m.homeTeamId,
    awayTeamId: m.awayTeamId,
    homeTeamName: m.homeTeam?.name ?? null,
    homeTeamCode: m.homeTeam?.code ?? null,
    awayTeamName: m.awayTeam?.name ?? null,
    awayTeamCode: m.awayTeam?.code ?? null,
    homeTeamPlaceholder: m.homeTeamPlaceholder,
    awayTeamPlaceholder: m.awayTeamPlaceholder,
    homeScore: m.homeScore,
    awayScore: m.awayScore,
    group: m.group?.letter ?? null,
  }))

  // Build matchday status: fully completed dates + email counts
  const byDate = new Map<string, number>()
  for (const m of rawMatches) {
    const date = m.kickoff.toISOString().slice(0, 10)
    byDate.set(date, (byDate.get(date) ?? 0) + (m.homeScore !== null ? 1 : 0))
  }
  const totalByDate = new Map<string, number>()
  for (const m of rawMatches) {
    const date = m.kickoff.toISOString().slice(0, 10)
    totalByDate.set(date, (totalByDate.get(date) ?? 0) + 1)
  }

  const emailCountByDate = new Map(emailLogs.map((l) => [l.matchday, l._count.userId]))

  const matchdays: MatchdayStatus[] = [...totalByDate.entries()]
    .filter(([date, total]) => (byDate.get(date) ?? 0) === total && total > 0)
    .sort(([a], [b]) => b.localeCompare(a)) // most recent first
    .map(([date, matchCount]) => ({
      date,
      matchCount,
      emailsSent: emailCountByDate.get(date) ?? 0,
    }))

  const totalUsersWithPredictions = tournament
    ? await prisma.user.count({ where: { predictions: { some: { tournamentId: tournament.id } } } })
    : 0

  const koReminderStatus: KOReminderStatus = {
    sentCount: koReminderLogs,
    totalUsers: totalUsersWithPredictions,
  }

  const tournamentDates: TournamentDates | null = tournament ? {
    groupStageStart: tournament.groupStageStart.toISOString().slice(0, 16),
    groupStageEnd: tournament.groupStageEnd.toISOString().slice(0, 16),
    knockoutStageStart: tournament.knockoutStageStart.toISOString().slice(0, 16),
  } : null

  const groups: GroupData[] = rawGroups.map((g) => ({
    id: g.id,
    letter: g.letter,
    teams: g.teams.map((t) => ({
      teamId: t.teamId,
      name: t.team.name,
      code: t.team.code,
      actualPosition: t.actualPosition,
      thirdPlaceQualified: t.thirdPlaceQualified,
    })),
  }))

  const cronActivity: CronActivity = {
    logs: cronLogs.map((l) => ({
      job: l.job,
      ok: l.ok,
      message: l.message,
      createdAt: l.createdAt,
    })),
    emailsSentToday,
  }

  return (
    <AdminPanels
      matches={matches}
      matchdays={matchdays}
      koReminderStatus={koReminderStatus}
      tournamentDates={tournamentDates}
      groups={groups}
      cronActivity={cronActivity}
    />
  )
}
