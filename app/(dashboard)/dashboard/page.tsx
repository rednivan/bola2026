import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { formatDistanceToNow, format, isPast } from "date-fns"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Trophy, Clock, Calendar, Users, TrendingUp, AlertCircle, ArrowRight, Shield } from "lucide-react"
import Link from "next/link"
import { HowToGuide } from "@/components/how-to-guide"

async function getDashboardData(userId: string) {
  const [tournament, prediction, leagues, upcomingMatches, recentMatches] = await Promise.all([
    prisma.tournament.findUnique({ where: { year: 2026 } }),

    prisma.prediction.findFirst({
      where: { userId, tournament: { year: 2026 } },
      select: { id: true, name: true, status: true, totalScore: true, matchAccuracy: true },
    }),

    prisma.leagueMembership.findMany({
      where: { prediction: { userId, tournament: { year: 2026 } } },
      include: {
        league: { select: { name: true } },
        prediction: { select: { totalScore: true } },
      },
      take: 3,
    }),

    prisma.match.findMany({
      where: { tournament: { year: 2026 }, kickoff: { gt: new Date() }, homeTeamId: { not: null } },
      include: {
        homeTeam: { select: { name: true, code: true, flagUrl: true } },
        awayTeam: { select: { name: true, code: true, flagUrl: true } },
        group: { select: { letter: true } },
      },
      orderBy: { kickoff: "asc" },
      take: 5,
    }),

    prisma.match.findMany({
      where: {
        tournament: { year: 2026 },
        kickoff: { lt: new Date() },
        homeScore: { not: null },
        homeTeamId: { not: null },
      },
      include: {
        homeTeam: { select: { name: true, code: true } },
        awayTeam: { select: { name: true, code: true } },
        group: { select: { letter: true } },
      },
      orderBy: { kickoff: "desc" },
      take: 5,
    }),
  ])

  return { tournament, prediction, leagues, upcomingMatches, recentMatches }
}

const STAGE_LABEL: Record<string, string> = {
  GROUP: "Group", R32: "R32", R16: "R16", QF: "QF", SF: "SF",
  THIRD_PLACE: "3rd Place", FINAL: "Final",
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect("/login")

  const [dbUser, data] = await Promise.all([
    prisma.user.findUnique({ where: { id: authUser.id } }),
    getDashboardData(authUser.id),
  ])
  if (!dbUser) redirect("/login")

  const { tournament, prediction, leagues, upcomingMatches, recentMatches } = data

  const now = new Date()
  const tournamentStarted = tournament ? isPast(tournament.groupStageStart) : false
  const groupStageEnded = tournament ? isPast(tournament.groupStageEnd) : false
  const window1Open = tournament && !tournamentStarted
  const window2Open = tournament && groupStageEnded && !isPast(tournament.knockoutStageStart)
  const teamsLoaded = upcomingMatches.length > 0 || recentMatches.length > 0

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
                ? groupStageEnded ? "KO stage is live — update your bracket!" : "Group stage is live!"
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

      {/* Prediction CTA */}
      {!prediction ? (
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
                My Prediction — {prediction.name}
              </CardTitle>
              <Badge className={
                prediction.status === "COMPLETE" ? "bg-[#3CAC3B] text-white" :
                prediction.status === "GROUP_COMPLETE" ? "bg-[#2A398D] text-white" :
                "bg-amber-700 text-white"
              }>
                {prediction.status.replace("_", " ")}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-3xl font-bold text-[#E61D25]">{prediction.totalScore}</p>
                <p className="text-[#D1D4D1]/60 text-xs mt-0.5">Total points</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-white">
                  {Math.round(prediction.matchAccuracy)}%
                </p>
                <p className="text-[#D1D4D1]/60 text-xs mt-0.5">Match accuracy</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Tournament", value: "2026", sub: "USA · CAN · MEX", icon: Trophy },
          { label: "My Leagues", value: leagues.length || "—", sub: leagues.length ? "active" : "join or create one", icon: Users },
          { label: "My Score", value: prediction?.totalScore ?? "—", sub: "points", icon: TrendingUp },
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
                {upcomingMatches.map((match) => (
                  <div key={match.id} className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-sm font-medium text-white">
                        <span className="truncate">{match.homeTeam?.code}</span>
                        <span className="text-[#474A4A] shrink-0 font-light">vs</span>
                        <span className="truncate">{match.awayTeam?.code}</span>
                      </div>
                      <p className="text-[#D1D4D1]/50 text-xs mt-0.5">
                        {format(match.kickoff, "d MMM · HH:mm")}
                        {match.group && ` · Group ${match.group.letter}`}
                      </p>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <Badge variant="outline" className="border-[#1E2B6E] text-[#D1D4D1]/70 text-xs">
                        {STAGE_LABEL[match.stage]}
                      </Badge>
                      <p className="text-[#3CAC3B] text-xs mt-1">{match.pointsAvailable} pts</p>
                    </div>
                  </div>
                ))}
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
                {recentMatches.map((match) => (
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
                        {format(match.kickoff, "d MMM")}
                        {match.group && ` · Group ${match.group.letter}`}
                      </p>
                    </div>
                    <Badge variant="outline" className="border-[#1E2B6E] text-[#D1D4D1]/70 text-xs shrink-0 ml-3">
                      {STAGE_LABEL[match.stage]}
                    </Badge>
                  </div>
                ))}
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
                <div key={m.id} className="flex items-center justify-between">
                  <p className="text-white text-sm font-medium">{m.league.name}</p>
                  <div className="flex items-center gap-3">
                    <span className="text-[#D1D4D1]/60 text-xs">Rank</span>
                    <Badge className="bg-[#131D42] border border-[#1E2B6E] text-white">
                      #{m.currentRank || "—"}
                    </Badge>
                    <span className="text-[#E61D25] font-bold text-sm">
                      {m.prediction.totalScore} pts
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
