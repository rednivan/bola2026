import { notFound, redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { PredictionEditor } from "@/components/predictions/prediction-editor"
import { HowToGuide } from "@/components/how-to-guide"
import { DeletePredictionButton } from "@/components/predictions/delete-prediction-button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Trophy, Lock, Clock } from "lucide-react"

async function getPredictionData(predictionId: string) {
  const [prediction, groups, groupMatches, koMatches, groupStandings, matchPredictions, koMatchPredictions, thirdPlacePicks, jokerPicks, actualGroupTeams] =
    await Promise.all([
      prisma.prediction.findUnique({
        where: { id: predictionId },
        include: { tournament: true },
      }),

      prisma.tournamentGroup.findMany({
        where: { tournament: { year: 2026 } },
        include: {
          teams: { include: { team: { select: { id: true, name: true, code: true, flagUrl: true } } } },
        },
        orderBy: { letter: "asc" },
      }),

      prisma.match.findMany({
        where: { tournament: { year: 2026 }, stage: "GROUP" },
        select: {
          id: true,
          groupId: true,
          kickoff: true,
          homeTeam: { select: { id: true, name: true, code: true, flagUrl: true } },
          awayTeam: { select: { id: true, name: true, code: true, flagUrl: true } },
          group: { select: { letter: true } },
        },
        orderBy: [{ group: { letter: "asc" } }, { kickoff: "asc" }],
      }),

      prisma.match.findMany({
        where: { tournament: { year: 2026 }, stage: { in: ["R32", "R16", "QF", "SF", "THIRD_PLACE", "FINAL"] } },
        select: {
          id: true,
          stage: true,
          matchNumber: true,
          kickoff: true,
          pointsAvailable: true,
          homeTeam: { select: { id: true, name: true, code: true, flagUrl: true } },
          awayTeam: { select: { id: true, name: true, code: true, flagUrl: true } },
          homeTeamPlaceholder: true,
          awayTeamPlaceholder: true,
          homeScore: true,
          awayScore: true,
          winnerId: true,
        },
        orderBy: [{ kickoff: "asc" }, { matchNumber: "asc" }],
      }),

      prisma.groupStandingPrediction.findMany({ where: { predictionId } }),
      prisma.matchPrediction.findMany({
        where: { predictionId, match: { stage: "GROUP" } },
      }),
      prisma.matchPrediction.findMany({
        where: { predictionId, match: { stage: { in: ["R32", "R16", "QF", "SF", "THIRD_PLACE", "FINAL"] } } },
      }),
      prisma.thirdPlacePrediction.findMany({ where: { predictionId } }),
      prisma.jokerPick.findMany({ where: { predictionId } }),

      // Actual group standings — populated by admin after group stage ends
      prisma.groupTeam.findMany({
        where: { group: { tournament: { year: 2026 } }, actualPosition: { not: null } },
        select: {
          groupId: true,
          actualPosition: true,
          team: { select: { id: true, name: true, code: true, flagUrl: true } },
        },
        orderBy: [{ groupId: "asc" }, { actualPosition: "asc" }],
      }),
    ])

  return { prediction, groups, groupMatches, koMatches, groupStandings, matchPredictions, koMatchPredictions, thirdPlacePicks, jokerPicks, actualGroupTeams }
}

export default async function EditPredictionPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { prediction, groups, groupMatches, koMatches, groupStandings, matchPredictions, koMatchPredictions, thirdPlacePicks, jokerPicks, actualGroupTeams } =
    await getPredictionData(id)

  if (!prediction || prediction.userId !== user.id) notFound()

  // savedStandings: groupId → { teamId → position }
  const savedStandings: Record<string, Record<string, number>> = {}
  for (const sp of groupStandings) {
    if (!savedStandings[sp.groupId]) savedStandings[sp.groupId] = {}
    savedStandings[sp.groupId][sp.teamId] = sp.predictedPosition
  }

  // savedPicksMap: matchId → { predictedWinnerId, isDraw }
  const savedPicksMap: Record<string, { predictedWinnerId: string | null; isDraw: boolean }> = {}
  for (const mp of matchPredictions) {
    savedPicksMap[mp.matchId] = { predictedWinnerId: mp.predictedWinnerId, isDraw: mp.isDraw }
  }

  // Build groups for editors
  const groupsForEditor = groups.map((g) => ({
    id: g.id,
    letter: g.letter,
    teams: g.teams.map((gt) => gt.team),
  }))

  // Group matches by letter + include groupId
  const matchesByGroup = groups.map((g) => ({
    letter: g.letter,
    groupId: g.id,
    matches: groupMatches
      .filter((m) => m.group?.letter === g.letter)
      .map((m) => ({
        id: m.id,
        groupId: g.id,
        kickoff: m.kickoff,
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
      })),
  }))

  // savedKOPicksMap: matchId → { predictedWinnerId, pointsEarned }
  const savedKOPicksMap: Record<string, { predictedWinnerId: string | null; pointsEarned: number }> = {}
  for (const kp of koMatchPredictions) {
    savedKOPicksMap[kp.matchId] = { predictedWinnerId: kp.predictedWinnerId, pointsEarned: kp.pointsEarned }
  }

  const now = new Date()
  const { tournament } = prediction
  const isGroupLocked = prediction.groupLocked || now >= tournament.groupStageStart
  const groupStageEnded = now >= tournament.groupStageEnd
  const koStageStarted = now >= tournament.knockoutStageStart
  // KO bracket is only editable in Window 2: after group stage ends, before KO stage starts
  const isKOLocked = prediction.koLocked || !groupStageEnded || koStageStarted
  const isWindow2 = isGroupLocked && !isKOLocked && groupStageEnded

  // Build actual group standings for KO bracket (available once admin sets positions post-group stage)
  const actualGroupOrdersMap: Record<string, { id: string; name: string; code: string; flagUrl: string }[]> = {}
  for (const gt of actualGroupTeams) {
    if (!actualGroupOrdersMap[gt.groupId]) actualGroupOrdersMap[gt.groupId] = []
    actualGroupOrdersMap[gt.groupId].push(gt.team)
  }
  const hasActualStandings = actualGroupTeams.length > 0

  return (
    <div className="p-6 lg:p-8 space-y-6 text-white">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-full bg-[#E61D25] flex items-center justify-center">
              <Trophy className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-2xl font-bold">{prediction.name}</h1>
            <Badge className={
              prediction.status === "COMPLETE" ? "bg-[#3CAC3B] text-white" :
              prediction.status === "GROUP_COMPLETE" ? "bg-[#2A398D] text-white" :
              "bg-amber-700 text-white"
            }>
              {prediction.status.replace("_", " ")}
            </Badge>
          </div>
          <p className="text-[#D1D4D1]/60 text-sm">
            {prediction.tournament.name} · {prediction.tournament.year}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <HowToGuide variant="predictions" />
          <DeletePredictionButton predictionId={id} />
          {isGroupLocked && !isWindow2 && (
            <div className="flex items-center gap-2 bg-[#131D42] border border-[#1E2B6E] rounded-lg px-3 py-2">
              <Lock className="w-4 h-4 text-[#474A4A]" />
              <span className="text-[#D1D4D1]/60 text-sm">Group stage locked</span>
            </div>
          )}
        </div>
      </div>

      {isWindow2 && (
        <Card className="bg-amber-950/20 border-amber-600/50">
          <CardContent className="py-4 flex items-start gap-3">
            <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-amber-300 text-sm leading-relaxed">
              <span className="font-semibold">Group stage is over — update window open!</span>
              {" "}The real R32 teams are now known. Review and update your KO bracket before the knockout stage begins.{" "}
              <span className="text-amber-400 font-medium">
                Picks lock on {tournament.knockoutStageStart.toLocaleDateString("en-GB", { day: "numeric", month: "long" })}.
              </span>
            </p>
          </CardContent>
        </Card>
      )}

      <PredictionEditor
        predictionId={id}
        groups={groupsForEditor}
        matchesByGroup={matchesByGroup}
        savedStandings={savedStandings}
        savedPicksMap={savedPicksMap}
        savedThirdPlaceGroupIds={thirdPlacePicks.map((t) => t.groupId)}
        standingsTotal={groups.length * 4}
        matchTotal={groupMatches.length}
        locked={isGroupLocked}
        koMatches={koMatches}
        savedKOPicksMap={savedKOPicksMap}
        koLocked={isKOLocked}
        koResultsMode={koStageStarted}
        initialTab={koStageStarted ? "ko" : isWindow2 ? "ko" : undefined}
        savedJokerPicks={Object.fromEntries(jokerPicks.map((j: { stage: string; matchId: string }) => [j.stage, j.matchId]))}
        actualGroupOrders={hasActualStandings ? actualGroupOrdersMap : undefined}
      />
    </div>
  )
}
