import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { prisma } from "@/lib/prisma"
import { getCachedGroups, getCachedGroupMatches, getCachedKOMatches } from "@/lib/cache"
import { PredictionViewer } from "@/components/predictions/prediction-viewer"

export default async function MemberPredictionPage({
  params,
}: {
  params: Promise<{ id: string; predictionId: string }>
}) {
  const { id, predictionId } = await params

  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect("/login")
  const user = session.user

  const league = await prisma.league.findUnique({
    where: { id },
    include: {
      tournament: { select: { name: true, year: true, groupStageStart: true, thirdPlaceQualifiers: true } },
      memberships: {
        include: {
          prediction: { select: { id: true, name: true, userId: true, totalScore: true } },
        },
      },
    },
  })
  if (!league) notFound()

  const isMember = league.memberships.some((m) => m.prediction.userId === user.id)
  if (!isMember) notFound()

  const targetMembership = league.memberships.find((m) => m.prediction.id === predictionId)
  if (!targetMembership) notFound()

  // Members' predictions only become viewable once the group stage is frozen
  const now = new Date()
  if (now < league.tournament.groupStageStart) redirect(`/leagues/${id}`)

  const [groups, groupMatches, koMatches] = await Promise.all([
    getCachedGroups(),
    getCachedGroupMatches(),
    getCachedKOMatches(),
  ])
  const groupMatchesHydrated = groupMatches.map((m) => ({ ...m, kickoff: new Date(m.kickoff) }))
  const koMatchesHydrated = koMatches.map((m) => ({ ...m, kickoff: new Date(m.kickoff) }))
  const koMatchIds = new Set(koMatchesHydrated.map((m) => m.id))

  const [groupStandings, allMatchPredictions, thirdPlacePicks, jokerPicks, actualGroupTeams, qualifiedThirdPlaceGroups] = await Promise.all([
    prisma.groupStandingPrediction.findMany({ where: { predictionId } }),
    prisma.matchPrediction.findMany({ where: { predictionId } }),
    prisma.thirdPlacePrediction.findMany({ where: { predictionId } }),
    prisma.jokerPick.findMany({ where: { predictionId } }),
    prisma.groupTeam.findMany({
      where: { group: { tournamentId: league.tournamentId }, actualPosition: { not: null } },
      select: {
        groupId: true,
        actualPosition: true,
        team: { select: { id: true, name: true, code: true, flagUrl: true } },
      },
      orderBy: [{ groupId: "asc" }, { actualPosition: "asc" }],
    }),
    prisma.groupTeam.findMany({
      where: { group: { tournamentId: league.tournamentId }, thirdPlaceQualified: true },
      select: { groupId: true },
    }),
  ])

  const matchPredictions = allMatchPredictions.filter((mp) => !koMatchIds.has(mp.matchId))
  const koMatchPredictions = allMatchPredictions.filter((mp) => koMatchIds.has(mp.matchId))

  const savedStandings: Record<string, Record<string, number>> = {}
  for (const sp of groupStandings) {
    if (!savedStandings[sp.groupId]) savedStandings[sp.groupId] = {}
    savedStandings[sp.groupId][sp.teamId] = sp.predictedPosition
  }

  const savedPicksMap: Record<string, { predictedWinnerId: string | null; isDraw: boolean }> = {}
  const pointsByMatch: Record<string, number> = {}
  for (const mp of matchPredictions) {
    savedPicksMap[mp.matchId] = { predictedWinnerId: mp.predictedWinnerId, isDraw: mp.isDraw }
    pointsByMatch[mp.matchId] = mp.pointsEarned
  }

  const savedKOPicksMap: Record<string, { predictedWinnerId: string | null; pointsEarned: number }> = {}
  for (const kp of koMatchPredictions) {
    savedKOPicksMap[kp.matchId] = { predictedWinnerId: kp.predictedWinnerId, pointsEarned: kp.pointsEarned }
  }

  const groupsForViewer = groups.map((g) => ({
    id: g.id,
    letter: g.letter,
    teams: g.teams.map((gt) => gt.team),
  }))

  const matchesByGroup = groups.map((g) => ({
    letter: g.letter,
    groupId: g.id,
    matches: groupMatchesHydrated
      .filter((m) => m.group?.letter === g.letter)
      .map((m) => ({
        id: m.id,
        groupId: g.id,
        kickoff: m.kickoff,
        homeTeam: m.homeTeam,
        awayTeam: m.awayTeam,
        homeScore: m.homeScore,
        awayScore: m.awayScore,
        winnerId: m.winnerId,
      })),
  }))

  const actualGroupOrdersMap: Record<string, { id: string; name: string; code: string; flagUrl: string }[]> = {}
  for (const gt of actualGroupTeams) {
    if (!actualGroupOrdersMap[gt.groupId]) actualGroupOrdersMap[gt.groupId] = []
    actualGroupOrdersMap[gt.groupId].push(gt.team)
  }
  const hasActualStandings = actualGroupTeams.length > 0
  const actualThirdPlaceGroupIds = qualifiedThirdPlaceGroups.map((g) => g.groupId)

  return (
    <div className="p-6 lg:p-8 space-y-6 text-white">
      <div className="flex items-center gap-3">
        <Link
          href={`/leagues/${id}`}
          className="flex items-center gap-1.5 text-[#D1D4D1]/60 hover:text-white text-sm transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to {league.name}
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold">{targetMembership.prediction.name}</h1>
        <p className="text-[#D1D4D1]/60 text-sm mt-1">
          {targetMembership.prediction.totalScore} pts · Rank #{targetMembership.currentRank || "—"}
        </p>
      </div>

      <PredictionViewer
        predictionId={predictionId}
        groups={groupsForViewer}
        matchesByGroup={matchesByGroup}
        savedStandings={savedStandings}
        savedPicksMap={savedPicksMap}
        pointsByMatch={pointsByMatch}
        savedThirdPlaceGroupIds={thirdPlacePicks.map((t) => t.groupId)}
        thirdPlaceQualifiers={league.tournament.thirdPlaceQualifiers}
        koMatches={koMatchesHydrated}
        savedKOPicksMap={savedKOPicksMap}
        savedJokerPicks={Object.fromEntries(jokerPicks.map((j: { stage: string; matchId: string }) => [j.stage, j.matchId]))}
        actualGroupOrders={hasActualStandings ? actualGroupOrdersMap : undefined}
        actualThirdPlaceGroupIds={actualThirdPlaceGroupIds.length === league.tournament.thirdPlaceQualifiers ? actualThirdPlaceGroupIds : undefined}
      />
    </div>
  )
}
