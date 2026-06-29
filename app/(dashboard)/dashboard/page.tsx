import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { getCachedTournament, getCachedUser, getCachedUpcomingMatches, getCachedRecentMatches } from "@/lib/cache"
import { formatDistanceToNow, isPast } from "date-fns"
import { LocalDate } from "@/components/local-date"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Trophy, Clock, Calendar, Users, TrendingUp, AlertCircle, ArrowRight, Shield } from "lucide-react"
import Link from "next/link"
import { HowToGuide } from "@/components/how-to-guide"
import { CollapsibleCard } from "@/components/collapsible-card"

async function getDashboardData(userId: string) {
  // Phase 1: tournament ID from cache (~0 ms) — needed to avoid JOIN filters below
  const tournament = await getCachedTournament()
  if (!tournament) return {
    tournament: null, predictions: [], leagues: [], upcomingMatches: [], recentMatches: [],
    pointsByMatch: {} as Record<string, number>, predictedWinnerByMatch: {} as Record<string, string | null>,
    finalizedGroups: [] as { groupId: string; letter: string; teams: { id: string; name: string; code: string; flagUrl: string }[] }[],
    thirdPlaceQualifiers: [] as { groupId: string; letter: string; team: { id: string; name: string; code: string; flagUrl: string } }[],
    groupPointsByPrediction: {} as Record<string, Record<string, number>>,
    thirdPlacePointsByPrediction: {} as Record<string, number>,
  }

  // Phase 2: user-specific queries use tournamentId directly (no JOIN);
  // match queries are served from cache
  const [predictions, leagues, upcomingMatches, recentMatches] = await Promise.all([
    prisma.prediction.findMany({
      where: { userId, tournamentId: tournament.id },
      select: { id: true, name: true, status: true, totalScore: true, matchAccuracy: true },
      orderBy: { name: "asc" },
    }),
    prisma.leagueMembership.findMany({
      where: { prediction: { userId, tournamentId: tournament.id } },
      include: {
        league: { select: { id: true, name: true } },
        prediction: { select: { totalScore: true } },
      },
      take: 3,
    }),
    getCachedUpcomingMatches(tournament.id),
    getCachedRecentMatches(tournament.id),
  ])

  // Points the user scored on each recent result, summed across their prediction(s)
  let pointsByMatch: Record<string, number> = {}
  if (predictions.length > 0 && recentMatches.length > 0) {
    const matchPoints = await prisma.matchPrediction.groupBy({
      by: ["matchId"],
      where: { prediction: { userId, tournamentId: tournament.id }, matchId: { in: recentMatches.map((m) => m.id) } },
      _sum: { pointsEarned: true },
    })
    pointsByMatch = Object.fromEntries(matchPoints.map((m) => [m.matchId, m._sum.pointsEarned ?? 0]))
  }

  // Predicted winner for each upcoming/live match (null = draw or no prediction)
  let predictedWinnerByMatch: Record<string, string | null> = {}
  if (predictions.length > 0 && upcomingMatches.length > 0) {
    const preds = await prisma.matchPrediction.findMany({
      where: {
        prediction: { userId, tournamentId: tournament.id },
        matchId: { in: upcomingMatches.map((m) => m.id) },
      },
      select: { matchId: true, predictedWinnerId: true, isDraw: true },
      distinct: ["matchId"],
    })
    predictedWinnerByMatch = Object.fromEntries(
      preds.map((mp) => [mp.matchId, mp.isDraw ? null : mp.predictedWinnerId])
    )
  }

  // Admin-confirmed final group standings — only groups where all 4 positions are saved
  const actualGroupTeams = await prisma.groupTeam.findMany({
    where: { group: { tournamentId: tournament.id }, actualPosition: { not: null } },
    select: {
      groupId: true,
      actualPosition: true,
      team: { select: { id: true, name: true, code: true, flagUrl: true } },
      group: { select: { letter: true } },
    },
    orderBy: [{ groupId: "asc" }, { actualPosition: "asc" }],
  })
  const groupedByGroupId = new Map<string, typeof actualGroupTeams>()
  for (const gt of actualGroupTeams) {
    if (!groupedByGroupId.has(gt.groupId)) groupedByGroupId.set(gt.groupId, [])
    groupedByGroupId.get(gt.groupId)!.push(gt)
  }
  const finalizedGroups = [...groupedByGroupId.entries()]
    .filter(([, rows]) => rows.length === 4)
    .map(([groupId, rows]) => ({ groupId, letter: rows[0].group.letter, teams: rows.map((r) => r.team) }))
    .sort((a, b) => a.letter.localeCompare(b.letter))

  // Admin-confirmed final 3rd-place qualifiers — only meaningful once exactly 8 are saved
  const qualifiedThirdPlaceRows = await prisma.groupTeam.findMany({
    where: { group: { tournamentId: tournament.id }, thirdPlaceQualified: true },
    select: { groupId: true, team: { select: { id: true, name: true, code: true, flagUrl: true } }, group: { select: { letter: true } } },
    orderBy: { group: { letter: "asc" } },
  })
  const thirdPlaceQualifiers = qualifiedThirdPlaceRows.length === 8
    ? qualifiedThirdPlaceRows.map((r) => ({ groupId: r.groupId, letter: r.group.letter, team: r.team }))
    : []

  // Per-prediction points: x/4 per finalized group, x/8 for 3rd-place qualifiers
  let groupPointsByPrediction: Record<string, Record<string, number>> = {}
  let thirdPlacePointsByPrediction: Record<string, number> = {}
  if (predictions.length > 0 && (finalizedGroups.length > 0 || thirdPlaceQualifiers.length > 0)) {
    const predictionIds = predictions.map((p) => p.id)

    if (finalizedGroups.length > 0) {
      const actualPosByGroupTeam = new Map<string, number>()
      for (const gt of actualGroupTeams) actualPosByGroupTeam.set(`${gt.groupId}:${gt.team.id}`, gt.actualPosition!)

      const standingPreds = await prisma.groupStandingPrediction.findMany({
        where: { predictionId: { in: predictionIds }, groupId: { in: finalizedGroups.map((g) => g.groupId) } },
        select: { predictionId: true, groupId: true, teamId: true, predictedPosition: true },
      })
      for (const sp of standingPreds) {
        const actualPos = actualPosByGroupTeam.get(`${sp.groupId}:${sp.teamId}`)
        if (actualPos !== sp.predictedPosition) continue
        if (!groupPointsByPrediction[sp.predictionId]) groupPointsByPrediction[sp.predictionId] = {}
        groupPointsByPrediction[sp.predictionId][sp.groupId] = (groupPointsByPrediction[sp.predictionId][sp.groupId] ?? 0) + 1
      }
    }

    if (thirdPlaceQualifiers.length > 0) {
      const qualifiedSet = new Set(thirdPlaceQualifiers.map((q) => q.groupId))
      const thirdPlacePreds = await prisma.thirdPlacePrediction.findMany({
        where: { predictionId: { in: predictionIds } },
        select: { predictionId: true, groupId: true },
      })
      for (const tp of thirdPlacePreds) {
        if (!qualifiedSet.has(tp.groupId)) continue
        thirdPlacePointsByPrediction[tp.predictionId] = (thirdPlacePointsByPrediction[tp.predictionId] ?? 0) + 1
      }
    }
  }

  return {
    tournament, predictions, leagues, upcomingMatches, recentMatches, pointsByMatch, predictedWinnerByMatch,
    finalizedGroups, thirdPlaceQualifiers, groupPointsByPrediction, thirdPlacePointsByPrediction,
  }
}

const STAGE_LABEL: Record<string, string> = {
  GROUP: "Group", R32: "R32", R16: "R16", QF: "QF", SF: "SF",
  THIRD_PLACE: "3rd Place", FINAL: "Final",
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect("/login")
  const authUser = session.user

  const [dbUser, data] = await Promise.all([
    getCachedUser(authUser.id),
    getDashboardData(authUser.id),
  ])
  if (!dbUser) redirect("/login")

  const {
    tournament, predictions, leagues, upcomingMatches, recentMatches, pointsByMatch, predictedWinnerByMatch,
    finalizedGroups, thirdPlaceQualifiers, groupPointsByPrediction, thirdPlacePointsByPrediction,
  } = data

  const now = new Date()
  const tournamentStarted = tournament ? isPast(tournament.groupStageStart) : false
  const groupStageEnded = tournament ? isPast(tournament.groupStageEnd) : false
  const koStarted = tournament ? isPast(tournament.knockoutStageStart) : false
  const window1Open = tournament && !tournamentStarted
  const window2Open = tournament && groupStageEnded && !koStarted
  const teamsLoaded = upcomingMatches.length > 0 || recentMatches.length > 0 || tournamentStarted

  return (
    <div className="p-6 lg:p-8 space-y-6 text-white">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            Welcome back, {dbUser.displayName}
          </h1>
          <p className="text-[#D1D4D1]/70 text-sm mt-1">
            {tournament
              ? tournamentStarted
                ? koStarted
                  ? "KO stage is live — predictions are locked!"
                  : groupStageEnded
                  ? "Window 2 open — update your KO bracket before it locks!"
                  : "Group stage is live!"
                : `Tournament starts ${formatDistanceToNow(tournament.groupStageStart, { addSuffix: true })}`
              : "Loading tournament data…"}
          </p>
        </div>
        <HowToGuide variant="dashboard" />
      </div>

      {/* Admin notice */}
      {dbUser.role === "ADMIN" && !teamsLoaded && (
        <Alert className="border-amber-600/50 bg-amber-950/30">
          <AlertCircle className="h-4 w-4 text-amber-400" />
          <AlertDescription className="text-amber-300 flex items-center justify-between">
            <span>No teams or matches loaded yet. Run the admin sync first.</span>
            <Link href="/admin">
              <Button size="sm" variant="outline" className="border-amber-600 text-amber-300 hover:bg-amber-900/30 ml-4">
                <Shield className="w-3.5 h-3.5 mr-1.5" /> Admin Sync
              </Button>
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {/* Prediction CTA / list */}
      {predictions.length === 0 ? (
        <Card className="bg-[#2A398D]/30 border-[#2A398D]">
          <CardContent className="flex items-center justify-between py-5">
            <div>
              <p className="text-white font-semibold">You don't have a prediction yet</p>
              <p className="text-[#D1D4D1]/70 text-sm mt-0.5">
                {window1Open
                  ? "Window 1 is open — predict the group stage before it kicks off!"
                  : window2Open
                  ? "Window 2 is open — predict the KO bracket now!"
                  : tournamentStarted
                  ? "Group stage is live — predictions are locked."
                  : "Create your prediction to get started."}
              </p>
            </div>
            {(window1Open || window2Open) && (
              <Link href="/predictions/new">
                <Button className="bg-[#E61D25] hover:bg-[#CC1920] shrink-0 ml-4 font-semibold">
                  Make prediction <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-[#0D1333] border-[#1E2B6E]">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-white text-base flex items-center gap-2">
                <Trophy className="w-4 h-4 text-[#E61D25]" />
                My Predictions
              </CardTitle>
              <Link href="/predictions">
                <Button variant="ghost" size="sm" className="text-[#D1D4D1]/60 hover:text-white text-xs">
                  View all <ArrowRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {predictions.map((p) => (
              <Link key={p.id} href={`/predictions/${p.id}/edit`} className="flex items-center justify-between group">
                <div className="flex items-center gap-3 min-w-0">
                  <Badge className={
                    p.status === "COMPLETE" ? "bg-[#3CAC3B] text-white shrink-0" :
                    p.status === "GROUP_COMPLETE" ? "bg-[#2A398D] text-white shrink-0" :
                    "bg-amber-700 text-white shrink-0"
                  }>
                    {p.status.replace("_", " ")}
                  </Badge>
                  <span className="text-white text-sm font-medium truncate group-hover:text-[#E61D25] transition-colors">
                    {p.name}
                  </span>
                </div>
                <div className="flex flex-col items-end shrink-0 ml-3 gap-0.5">
                  <span className="text-[#E61D25] font-bold text-sm tabular-nums">{p.totalScore} pts</span>
                  <span className="text-[#D1D4D1]/50 text-xs tabular-nums">{Math.round(p.matchAccuracy)}%</span>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Group stage results — only once admin has saved final standings / 3rd-place qualifiers */}
      {predictions.length > 0 && (finalizedGroups.length > 0 || thirdPlaceQualifiers.length > 0) && (
        <CollapsibleCard
          title="Group Stage Results"
          icon={<Trophy className="w-4 h-4 text-[#3CAC3B]" />}
          contentClassName="space-y-5"
        >
            {predictions.map((p) => (
              <div key={p.id} className="space-y-3">
                {predictions.length > 1 && (
                  <p className="text-white text-sm font-semibold">{p.name}</p>
                )}

                {finalizedGroups.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                    {finalizedGroups.map((g) => {
                      const pts = groupPointsByPrediction[p.id]?.[g.groupId] ?? 0
                      return (
                        <div key={g.groupId} className="bg-[#131D42] border border-[#1E2B6E] rounded-lg p-2.5">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[#D1D4D1]/60 text-xs font-medium">Group {g.letter}</span>
                            <span className={`text-xs font-bold tabular-nums ${pts > 0 ? "text-[#3CAC3B]" : "text-[#474A4A]"}`}>
                              {pts}/4
                            </span>
                          </div>
                          <div className="space-y-0.5">
                            {g.teams.map((t, i) => (
                              <div key={t.id} className="flex items-center gap-1.5 text-xs">
                                <span className="text-[#474A4A] w-3 shrink-0">{i + 1}</span>
                                {t.flagUrl && <img src={t.flagUrl} alt={t.code} className="w-4 h-3 object-cover rounded-sm shrink-0" />}
                                <span className="text-white truncate">{t.code}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {thirdPlaceQualifiers.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[#D1D4D1]/60 text-xs font-medium">3rd-Place Qualifiers</span>
                      <span className={`text-xs font-bold tabular-nums ${(thirdPlacePointsByPrediction[p.id] ?? 0) > 0 ? "text-[#3CAC3B]" : "text-[#474A4A]"}`}>
                        {thirdPlacePointsByPrediction[p.id] ?? 0}/8
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {thirdPlaceQualifiers.map((q) => (
                        <span key={q.groupId} className="flex items-center gap-1 bg-[#131D42] border border-[#1E2B6E] rounded-full px-2 py-1 text-xs text-white">
                          {q.team.flagUrl && <img src={q.team.flagUrl} alt={q.team.code} className="w-4 h-3 object-cover rounded-sm" />}
                          {q.team.code}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
        </CollapsibleCard>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Tournament", value: "2026", sub: "USA · CAN · MEX", icon: Trophy },
          { label: "My Leagues", value: leagues.length || "—", sub: leagues.length ? "active" : "join or create one", icon: Users },
          { label: "My Score", value: predictions.length ? Math.max(...predictions.map(p => p.totalScore)) : "—", sub: predictions.length > 1 ? "best prediction" : "points", icon: TrendingUp },
          {
            label: "Window",
            value: window1Open ? "1 Open" : window2Open ? "2 Open" : tournamentStarted ? "Locked" : "Soon",
            sub: window1Open ? "Group predictions" : window2Open ? "KO bracket" : "",
            icon: Clock,
          },
        ].map(({ label, value, sub, icon: Icon }) => (
          <Card key={label} className="bg-[#0D1333] border-[#1E2B6E]">
            <CardContent className="py-4 px-5">
              <div className="flex items-center gap-2 mb-2">
                <Icon className="w-3.5 h-3.5 text-[#3CAC3B]" />
                <span className="text-[#D1D4D1]/60 text-xs">{label}</span>
              </div>
              <p className="text-xl font-bold text-white">{value}</p>
              {sub && <p className="text-[#474A4A] text-xs mt-0.5">{sub}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming matches */}
        <Card className="bg-[#0D1333] border-[#1E2B6E]">
          <CardHeader className="pb-3">
            <CardTitle className="text-white text-base flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#3CAC3B]" />
              Upcoming Matches
            </CardTitle>
          </CardHeader>
          <CardContent>
            {upcomingMatches.length === 0 ? (
              <p className="text-[#474A4A] text-sm py-4 text-center">
                {teamsLoaded ? "No upcoming matches" : "Run admin sync to load matches"}
              </p>
            ) : (
              <div className="space-y-3">
                {upcomingMatches.map((match) => {
                  const isLive = match.kickoff <= now
                  const predictedWinner = predictedWinnerByMatch[match.id] ?? null
                  const homeColor = predictedWinner === match.homeTeamId ? "text-amber-400" : "text-white"
                  const awayColor = predictedWinner === match.awayTeamId ? "text-amber-400" : "text-white"
                  return (
                    <div key={match.id} className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <span className={`truncate ${homeColor}`}>{match.homeTeam?.code ?? "TBD"}</span>
                          <span className="text-[#474A4A] shrink-0 font-light">vs</span>
                          <span className={`truncate ${awayColor}`}>{match.awayTeam?.code ?? "TBD"}</span>
                        </div>
                        <p className="text-[#D1D4D1]/50 text-xs mt-0.5">
                          {isLive
                            ? match.group ? `Group ${match.group.letter}` : STAGE_LABEL[match.stage]
                            : <><LocalDate date={match.kickoff} fmt="d MMM · HH:mm" />{match.group && ` · Group ${match.group.letter}`}</>
                          }
                        </p>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        {isLive
                          ? <Badge className="bg-[#E61D25] text-white text-xs animate-pulse">LIVE</Badge>
                          : <Badge variant="outline" className="border-[#1E2B6E] text-[#D1D4D1]/70 text-xs">{STAGE_LABEL[match.stage]}</Badge>
                        }
                        <p className="text-[#3CAC3B] text-xs mt-1">{match.pointsAvailable} pts</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent results */}
        <Card className="bg-[#0D1333] border-[#1E2B6E]">
          <CardHeader className="pb-3">
            <CardTitle className="text-white text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#3CAC3B]" />
              Recent Results
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentMatches.length === 0 ? (
              <p className="text-[#474A4A] text-sm py-4 text-center">No results yet</p>
            ) : (
              <div className="space-y-3">
                {recentMatches.map((match) => {
                  const pts = pointsByMatch[match.id] ?? 0
                  return (
                    <div key={match.id} className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-sm font-medium text-white">
                          <span className={match.winnerId === match.homeTeamId ? "text-[#3CAC3B]" : ""}>
                            {match.homeTeam?.code}
                          </span>
                          <span className="text-[#D1D4D1] font-bold shrink-0 tabular-nums">
                            {match.homeScore} – {match.awayScore}
                          </span>
                          <span className={match.winnerId === match.awayTeamId ? "text-[#3CAC3B]" : ""}>
                            {match.awayTeam?.code}
                          </span>
                        </div>
                        <p className="text-[#D1D4D1]/50 text-xs mt-0.5">
                          <LocalDate date={match.kickoff} fmt="d MMM" />
                          {match.group && ` · Group ${match.group.letter}`}
                        </p>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <Badge variant="outline" className="border-[#1E2B6E] text-[#D1D4D1]/70 text-xs">
                          {STAGE_LABEL[match.stage]}
                        </Badge>
                        {predictions.length > 0 && (
                          <p className={`text-xs mt-1 tabular-nums ${pts > 0 ? "text-[#3CAC3B]" : "text-[#474A4A]"}`}>
                            +{pts} pts
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Leagues */}
      {leagues.length > 0 && (
        <Card className="bg-[#0D1333] border-[#1E2B6E]">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-white text-base flex items-center gap-2">
                <Users className="w-4 h-4 text-[#3CAC3B]" />
                My Leagues
              </CardTitle>
              <Link href="/leagues">
                <Button variant="ghost" size="sm" className="text-[#D1D4D1]/60 hover:text-white text-xs">
                  View all <ArrowRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {leagues.map((m) => (
                <Link key={m.id} href={`/leagues/${m.league.id}`} className="flex items-center justify-between group">
                  <p className="text-white text-sm font-medium group-hover:text-[#E61D25] transition-colors">{m.league.name}</p>
                  <div className="flex items-center gap-3">
                    <span className="text-[#D1D4D1]/60 text-xs">Rank</span>
                    <Badge className="bg-[#131D42] border border-[#1E2B6E] text-white">
                      #{m.currentRank || "—"}
                    </Badge>
                    <span className="text-[#E61D25] font-bold text-sm">
                      {m.prediction.totalScore} pts
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
