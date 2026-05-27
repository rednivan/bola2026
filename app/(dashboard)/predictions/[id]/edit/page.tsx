import { notFound, redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { PredictionEditor } from "@/components/predictions/prediction-editor"
import { HowToGuide } from "@/components/how-to-guide"
import { Badge } from "@/components/ui/badge"
import { Trophy, Lock } from "lucide-react"

async function getPredictionData(predictionId: string) {
  const [prediction, groups, groupMatches, koMatches, groupStandings, matchPredictions, koMatchPredictions, thirdPlacePicks] =
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
    ])

  return { prediction, groups, groupMatches, koMatches, groupStandings, matchPredictions, koMatchPredictions, thirdPlacePicks }
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

  const { prediction, groups, groupMatches, koMatches, groupStandings, matchPredictions, koMatchPredictions, thirdPlacePicks } =
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

  // savedKOPicksMap: matchId → { predictedWinnerId }
  const savedKOPicksMap: Record<string, { predictedWinnerId: string | null }> = {}
  for (const kp of koMatchPredictions) {
    savedKOPicksMap[kp.matchId] = { predictedWinnerId: kp.predictedWinnerId }
  }

  const isGroupLocked = prediction.groupLocked
  const isKOLocked = prediction.koLocked

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

        <div className="flex items-center gap-2">
          <HowToGuide variant="predictions" />
          {isGroupLocked && (
            <div className="flex items-center gap-2 bg-[#131D42] border border-[#1E2B6E] rounded-lg px-3 py-2">
              <Lock className="w-4 h-4 text-[#474A4A]" />
              <span className="text-[#D1D4D1]/60 text-sm">Group stage locked</span>
            </div>
          )}
        </div>
      </div>

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
      />
    </div>
  )
}
