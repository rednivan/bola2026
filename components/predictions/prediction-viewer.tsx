"use client"

import { Eye, Lock } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { MatchResultsEditor } from "./match-results-editor"
import { GroupStageEditor } from "./group-stage-editor"
import { ThirdPlacePicker } from "./third-place-picker"
import { KOBracketEditor, type KOMatch, type KOPick } from "./ko-bracket-editor"
import {
  initGroupOrders,
  initPicks,
  initKOPicksIterative,
  computeKOBracket,
  type GroupData,
  type GroupMatch,
  type Team,
} from "./prediction-editor"

type Props = {
  predictionId: string
  groups: GroupData[]
  matchesByGroup: { letter: string; groupId: string; matches: GroupMatch[] }[]
  savedStandings: Record<string, Record<string, number>>
  savedPicksMap: Record<string, { predictedWinnerId: string | null; isDraw: boolean }>
  pointsByMatch?: Record<string, number>
  savedThirdPlaceGroupIds: string[]
  koMatches: KOMatch[]
  savedKOPicksMap: Record<string, { predictedWinnerId: string | null; pointsEarned: number }>
  savedJokerPicks?: Record<string, string>
  actualGroupOrders?: Record<string, Team[]>
  actualThirdPlaceGroupIds?: string[]
  // Server-computed timestamp — used to decide which KO picks have kicked off
  now: number
}

const noop = () => {}

export function PredictionViewer({
  predictionId,
  groups,
  matchesByGroup,
  savedStandings,
  savedPicksMap,
  pointsByMatch = {},
  savedThirdPlaceGroupIds,
  koMatches,
  savedKOPicksMap,
  savedJokerPicks = {},
  actualGroupOrders,
  actualThirdPlaceGroupIds,
  now,
}: Props) {
  const groupOrders = initGroupOrders(groups, savedStandings)
  const effectiveGroupOrders = actualGroupOrders ? { ...groupOrders, ...actualGroupOrders } : groupOrders
  const picks = initPicks(matchesByGroup, savedPicksMap, groups)
  const thirdPlaceGroupIds = new Set(savedThirdPlaceGroupIds)

  const koPicks = initKOPicksIterative(koMatches, savedKOPicksMap, groups, effectiveGroupOrders, thirdPlaceGroupIds)

  // Only reveal KO picks for matches that have already kicked off — keeps later
  // rounds (and whoever is leading) from being copyable before they lock.
  const revealedKOIds = new Set(koMatches.filter((m) => m.kickoff.getTime() <= now).map((m) => m.id))
  const visibleKOPicks = Object.fromEntries(
    Object.entries(koPicks).filter(([id]) => revealedKOIds.has(id))
  ) as Record<string, KOPick>
  const visibleKOJokers = Object.fromEntries(
    Object.entries(savedJokerPicks).filter(([, matchId]) => revealedKOIds.has(matchId))
  )
  // Display only confirmed standings/qualifiers — until the admin saves a group's final
  // standings or the 3rd-place qualifiers, show TBD rather than this prediction's own pick.
  const confirmedThirdPlaceGroupIds = new Set(actualThirdPlaceGroupIds ?? [])
  const resolvedKOTeams = computeKOBracket(koMatches, groups, actualGroupOrders ?? {}, confirmedThirdPlaceGroupIds, visibleKOPicks)

  const groupsWithThird = groups.map((g) => ({
    ...g,
    thirdPlaceTeam: groupOrders[g.id]?.[2] ?? null,
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 bg-[#0D1333] border border-[#1E2B6E] rounded-xl px-4 py-3">
        <Eye className="w-4 h-4 text-[#474A4A] shrink-0" />
        <p className="text-[#D1D4D1]/70 text-sm">
          Read only — picks lock once the group stage starts and can&apos;t be changed.
        </p>
      </div>

      <Tabs defaultValue="matches" className="space-y-6">
        <div className="overflow-x-auto [scrollbar-width:none] [-webkit-overflow-scrolling:touch]">
          <TabsList className="bg-[#0D1333] border border-[#1E2B6E] p-1 h-auto w-max min-w-full">
            <TabsTrigger
              value="matches"
              className="data-[state=active]:bg-[#2A398D] data-[state=active]:text-white text-[#D1D4D1]/60 rounded-md px-3 py-2 text-sm font-medium flex-none"
            >
              <span className="sm:hidden">Matches</span>
              <span className="hidden sm:inline">Match Results</span>
            </TabsTrigger>
            <TabsTrigger
              value="standings"
              className="data-[state=active]:bg-[#2A398D] data-[state=active]:text-white text-[#D1D4D1]/60 rounded-md px-3 py-2 text-sm font-medium flex-none"
            >
              <span className="sm:hidden">Standings</span>
              <span className="hidden sm:inline">Group Standings</span>
            </TabsTrigger>
            <TabsTrigger
              value="thirdplace"
              className="data-[state=active]:bg-[#2A398D] data-[state=active]:text-white text-[#D1D4D1]/60 rounded-md px-3 py-2 text-sm font-medium flex-none"
            >
              <span className="sm:hidden">3rd Place</span>
              <span className="hidden sm:inline">Third Place</span>
            </TabsTrigger>
            <TabsTrigger
              value="ko"
              className="data-[state=active]:bg-[#2A398D] data-[state=active]:text-white text-[#D1D4D1]/60 rounded-md px-3 py-2 text-sm font-medium flex-none"
            >
              <span className="sm:hidden">KO</span>
              <span className="hidden sm:inline">KO Bracket</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="matches" className="mt-0">
          <MatchResultsEditor
            predictionId={predictionId}
            matchesByGroup={matchesByGroup}
            picks={picks}
            onPickChange={noop}
            locked
            jokerMatchId={savedJokerPicks["GROUP"] ?? null}
            pointsByMatch={pointsByMatch}
          />
        </TabsContent>

        <TabsContent value="standings" className="mt-0">
          <GroupStageEditor
            predictionId={predictionId}
            groups={groupsWithThird}
            groupOrders={groupOrders}
            onReorder={noop}
            locked
            actualGroupOrders={actualGroupOrders}
          />
        </TabsContent>

        <TabsContent value="thirdplace" className="mt-0">
          <ThirdPlacePicker
            predictionId={predictionId}
            groups={groupsWithThird}
            savedGroupIds={savedThirdPlaceGroupIds}
            locked
            actualQualifiedGroupIds={actualThirdPlaceGroupIds}
          />
        </TabsContent>

        <TabsContent value="ko" className="mt-0">
          <div className="space-y-4">
            {revealedKOIds.size < koMatches.length && (
              <p className="flex items-center gap-1.5 text-[#D1D4D1]/60 text-xs">
                <Lock className="w-3 h-3" />
                Picks for rounds that haven&apos;t kicked off yet stay hidden.
              </p>
            )}
            <KOBracketEditor
              predictionId={predictionId}
              koMatches={koMatches}
              picks={visibleKOPicks}
              onPickChange={noop}
              resolvedTeams={resolvedKOTeams}
              locked
              jokerMatchIds={visibleKOJokers}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
