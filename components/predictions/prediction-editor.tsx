"use client"

import { useState } from "react"
import { CheckCircle2, Circle } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { GroupStageEditor } from "./group-stage-editor"
import { MatchResultsEditor } from "./match-results-editor"
import { ThirdPlacePicker } from "./third-place-picker"
import { KOBracketEditor, type KOMatch, type KOPick } from "./ko-bracket-editor"

export type ResultChoice = "home" | "draw" | "away" | null

export type Team = { id: string; name: string; code: string; flagUrl: string }

export type GroupMatch = {
  id: string
  groupId: string
  kickoff: Date
  homeTeam: Team | null
  awayTeam: Team | null
}

export type GroupData = {
  id: string
  letter: string
  teams: Team[]
  thirdPlaceTeam?: Team | null
}

type Props = {
  predictionId: string
  groups: GroupData[]
  matchesByGroup: { letter: string; groupId: string; matches: GroupMatch[] }[]
  savedStandings: Record<string, Record<string, number>>
  savedPicksMap: Record<string, { predictedWinnerId: string | null; isDraw: boolean }>
  savedThirdPlaceGroupIds: string[]
  standingsTotal: number
  matchTotal: number
  locked: boolean
  koMatches: KOMatch[]
  savedKOPicksMap: Record<string, { predictedWinnerId: string | null }>
  koLocked: boolean
}

// ─── Group-stage helpers ───────────────────────────────────────────────────

function initGroupOrders(
  groups: GroupData[],
  savedStandings: Record<string, Record<string, number>>
): Record<string, Team[]> {
  const init: Record<string, Team[]> = {}
  for (const g of groups) {
    const saved = savedStandings[g.id]
    if (saved && Object.keys(saved).length === g.teams.length) {
      init[g.id] = [...g.teams].sort((a, b) => (saved[a.id] ?? 99) - (saved[b.id] ?? 99))
    } else {
      init[g.id] = [...g.teams]
    }
  }
  return init
}

function initPicks(
  matchesByGroup: Props["matchesByGroup"],
  savedPicksMap: Props["savedPicksMap"],
  groups: GroupData[]
): Record<string, ResultChoice> {
  const result: Record<string, ResultChoice> = {}
  for (const { matches } of matchesByGroup) {
    for (const m of matches) {
      const saved = savedPicksMap[m.id]
      if (!saved) { result[m.id] = null; continue }
      if (saved.isDraw) { result[m.id] = "draw"; continue }
      if (saved.predictedWinnerId === m.homeTeam?.id) { result[m.id] = "home"; continue }
      if (saved.predictedWinnerId === m.awayTeam?.id) { result[m.id] = "away"; continue }
      result[m.id] = null
    }
  }
  return result
}

function recalcGroupOrder(
  currentOrder: Team[],
  matches: GroupMatch[],
  picks: Record<string, ResultChoice>
): Team[] {
  const pts: Record<string, number> = Object.fromEntries(currentOrder.map((t) => [t.id, 0]))
  for (const m of matches) {
    const pick = picks[m.id]
    if (!pick || !m.homeTeam?.id || !m.awayTeam?.id) continue
    if (pick === "home") pts[m.homeTeam.id] += 3
    else if (pick === "away") pts[m.awayTeam.id] += 3
    else { pts[m.homeTeam.id] += 1; pts[m.awayTeam.id] += 1 }
  }
  return [...currentOrder].sort((a, b) => (pts[b.id] ?? 0) - (pts[a.id] ?? 0))
}

// ─── KO-bracket helpers ───────────────────────────────────────────────────

// Iteratively resolves saved KO picks stage-by-stage.
// Pre-tournament, KO matches have null DB teams, so we match predictedWinnerId
// against the bracket-derived teams (from group predictions) instead.
// Each stage's picks feed the cascade so the next stage can be resolved too.
function initKOPicksIterative(
  koMatches: KOMatch[],
  savedMap: Props["savedKOPicksMap"],
  groups: GroupData[],
  groupOrders: Record<string, Team[]>,
  thirdPlaceGroupIds: Set<string>
): Record<string, KOPick> {
  const STAGES = ["R32", "R16", "QF", "SF", "THIRD_PLACE", "FINAL"]
  let currentPicks: Record<string, KOPick> = {}

  for (const stage of STAGES) {
    const bracket = computeKOBracket(koMatches, groups, groupOrders, thirdPlaceGroupIds, currentPicks)
    for (const m of koMatches.filter((m) => m.stage === stage)) {
      const saved = savedMap[m.id]
      if (!saved || saved.predictedWinnerId === null) continue
      const resolved = bracket[m.id]
      // Match against DB teams (post-group-stage) or bracket-derived teams (pre-tournament)
      if (
        saved.predictedWinnerId === m.homeTeam?.id ||
        (resolved?.home && saved.predictedWinnerId === resolved.home.id)
      ) {
        currentPicks = { ...currentPicks, [m.id]: "home" }
      } else if (
        saved.predictedWinnerId === m.awayTeam?.id ||
        (resolved?.away && saved.predictedWinnerId === resolved.away.id)
      ) {
        currentPicks = { ...currentPicks, [m.id]: "away" }
      }
    }
  }
  return currentPicks
}

// Adjacent group pairs for the R32 bracket (A↔B, C↔D, E↔F, G↔H, I↔J, K↔L).
// Within each pair: 1st of left vs 2nd of right, and 1st of right vs 2nd of left.
// Last 4 slots (indices 12–15) are the 3rd-place matchups.
const GROUP_PAIRS: [string, string][] = [
  ["A", "B"], ["C", "D"], ["E", "F"],
  ["G", "H"], ["I", "J"], ["K", "L"],
]

function computeKOBracket(
  koMatches: KOMatch[],
  groups: GroupData[],
  groupOrders: Record<string, Team[]>,
  thirdPlaceGroupIds: Set<string>,
  koPicks: Record<string, KOPick>
): Record<string, { home: Team | null; away: Team | null }> {
  const byDate = (ms: KOMatch[]) => [...ms].sort((a, b) => a.kickoff.getTime() - b.kickoff.getTime())

  const r32 = byDate(koMatches.filter((m) => m.stage === "R32"))
  const r16 = byDate(koMatches.filter((m) => m.stage === "R16"))
  const qf  = byDate(koMatches.filter((m) => m.stage === "QF"))
  const sf  = byDate(koMatches.filter((m) => m.stage === "SF"))
  const thirdPlaceMatch = koMatches.find((m) => m.stage === "THIRD_PLACE")
  const finalMatch      = koMatches.find((m) => m.stage === "FINAL")

  const groupByLetter: Record<string, GroupData> = Object.fromEntries(groups.map((g) => [g.letter, g]))

  function groupTeam(letter: string, pos: number): Team | null {
    const g = groupByLetter[letter]
    if (!g) return null
    return (groupOrders[g.id] ?? g.teams)[pos - 1] ?? null
  }

  // 3rd-place teams that advance, sorted alphabetically by group letter
  const advancing3rd: Team[] = groups
    .filter((g) => thirdPlaceGroupIds.has(g.id))
    .sort((a, b) => a.letter.localeCompare(b.letter))
    .map((g) => (groupOrders[g.id] ?? g.teams)[2] ?? null)
    .filter((t): t is Team => t !== null)

  // Build R32 slot definitions (16 entries)
  type Slot = { home: Team | null; away: Team | null }
  const r32Slots: Slot[] = []
  for (const [g1, g2] of GROUP_PAIRS) {
    r32Slots.push({ home: groupTeam(g1, 1), away: groupTeam(g2, 2) })
    r32Slots.push({ home: groupTeam(g2, 1), away: groupTeam(g1, 2) })
  }
  // Remaining 4 slots are 3rd-place vs 3rd-place (sequential pairing)
  for (let i = 0; i < 4; i++) {
    r32Slots.push({ home: advancing3rd[i * 2] ?? null, away: advancing3rd[i * 2 + 1] ?? null })
  }

  const result: Record<string, Slot> = {}

  // R32: map date-sorted slots to derived predictions
  for (let i = 0; i < r32.length; i++) {
    const m = r32[i]
    const slot = r32Slots[i]
    result[m.id] = {
      home: m.homeTeam ?? slot?.home ?? null,
      away: m.awayTeam ?? slot?.away ?? null,
    }
  }

  function winner(matchId: string): Team | null {
    const pick = koPicks[matchId]
    if (!pick) return null
    const slot = result[matchId]
    return slot ? (pick === "home" ? slot.home : slot.away) : null
  }
  function loser(matchId: string): Team | null {
    const pick = koPicks[matchId]
    if (!pick) return null
    const slot = result[matchId]
    return slot ? (pick === "home" ? slot.away : slot.home) : null
  }

  // Cascade: each round pairs sequential matches from the previous round
  function cascade(roundMatches: KOMatch[], feeders: KOMatch[]) {
    for (let i = 0; i < roundMatches.length; i++) {
      const m = roundMatches[i]
      result[m.id] = {
        home: m.homeTeam ?? (feeders[i * 2] ? winner(feeders[i * 2].id) : null),
        away: m.awayTeam ?? (feeders[i * 2 + 1] ? winner(feeders[i * 2 + 1].id) : null),
      }
    }
  }

  cascade(r16, r32)
  cascade(qf, r16)
  cascade(sf, qf)

  if (finalMatch) {
    result[finalMatch.id] = {
      home: finalMatch.homeTeam ?? (sf[0] ? winner(sf[0].id) : null),
      away: finalMatch.awayTeam ?? (sf[1] ? winner(sf[1].id) : null),
    }
  }
  if (thirdPlaceMatch) {
    result[thirdPlaceMatch.id] = {
      home: thirdPlaceMatch.homeTeam ?? (sf[0] ? loser(sf[0].id) : null),
      away: thirdPlaceMatch.awayTeam ?? (sf[1] ? loser(sf[1].id) : null),
    }
  }

  return result
}

// ─── Component ────────────────────────────────────────────────────────────

export function PredictionEditor({
  predictionId,
  groups,
  matchesByGroup,
  savedStandings,
  savedPicksMap,
  savedThirdPlaceGroupIds,
  standingsTotal,
  matchTotal,
  locked,
  koMatches,
  savedKOPicksMap,
  koLocked,
}: Props) {
  const [picks, setPicks] = useState<Record<string, ResultChoice>>(() =>
    initPicks(matchesByGroup, savedPicksMap, groups)
  )
  const [groupOrders, setGroupOrders] = useState<Record<string, Team[]>>(() =>
    initGroupOrders(groups, savedStandings)
  )
  const [thirdPlaceGroupIds, setThirdPlaceGroupIds] = useState<Set<string>>(
    () => new Set(savedThirdPlaceGroupIds)
  )
  const [koPicks, setKOPicks] = useState<Record<string, KOPick>>(() => {
    // Bootstrap: compute initial bracket from saved group/3rd-place data, then
    // walk stage-by-stage so each stage's picks cascade into the next.
    const initOrders = initGroupOrders(groups, savedStandings)
    const initThirdIds = new Set(savedThirdPlaceGroupIds)
    return initKOPicksIterative(koMatches, savedKOPicksMap, groups, initOrders, initThirdIds)
  })

  // Saved counts — initialised from server props, updated optimistically when saves succeed
  const [savedMatchCount, setSavedMatchCount] = useState(
    () => Object.keys(savedPicksMap).length
  )
  const [savedStandingsCount, setSavedStandingsCount] = useState(
    () => Object.values(savedStandings).reduce((sum, g) => sum + Object.keys(g).length, 0)
  )
  const [savedThirdPlaceCount, setSavedThirdPlaceCount] = useState(
    () => savedThirdPlaceGroupIds.length
  )
  const [savedKOCount, setSavedKOCount] = useState(
    () => Object.keys(savedKOPicksMap).length
  )

  const matchesByGroupId = Object.fromEntries(
    matchesByGroup.map(({ groupId, matches }) => [groupId, matches])
  )

  function handlePickChange(matchId: string, choice: ResultChoice, groupId: string) {
    setPicks((prev) => {
      const next = { ...prev, [matchId]: choice }
      const groupMatches = matchesByGroupId[groupId] ?? []
      setGroupOrders((prevOrders) => ({
        ...prevOrders,
        [groupId]: recalcGroupOrder(prevOrders[groupId] ?? [], groupMatches, next),
      }))
      return next
    })
  }

  function handleReorder(groupId: string, teams: Team[]) {
    setGroupOrders((prev) => ({ ...prev, [groupId]: teams }))
  }

  function handleThirdPlaceChange(groupIds: string[]) {
    setThirdPlaceGroupIds(new Set(groupIds))
  }

  function handleKOPickChange(matchId: string, pick: KOPick) {
    setKOPicks((prev) => ({ ...prev, [matchId]: pick }))
  }

  // In-memory fill counts (for tab badges)
  const filledPicks = Object.values(picks).filter(Boolean).length
  const filledKO = Object.values(koPicks).filter(Boolean).length

  // Overall completion — based on what has been saved to the DB
  const totalItems = matchTotal + standingsTotal + 8 + koMatches.length
  const savedItems = savedMatchCount + savedStandingsCount + savedThirdPlaceCount + savedKOCount
  const completionPct = totalItems > 0 ? Math.round((savedItems / totalItems) * 100) : 0
  const isFullySubmitted = savedItems === totalItems && totalItems > 0

  const groupsWithThird = groups.map((g) => ({
    ...g,
    thirdPlaceTeam: groupOrders[g.id]?.[2] ?? null,
  }))

  // KO bracket: compute resolved teams for each KO match slot
  const resolvedKOTeams = computeKOBracket(koMatches, groups, groupOrders, thirdPlaceGroupIds, koPicks)

  function badge(filled: number, total: number) {
    const done = filled === total
    return (
      <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${
        done ? "bg-[#3CAC3B]/20 text-[#3CAC3B]" : "bg-[#1E2B6E] text-[#474A4A]"
      }`}>
        {filled}/{total}
      </span>
    )
  }

  return (
    <div className="space-y-6">
      {/* ── Completion widget ── */}
      <div className={`rounded-xl border p-5 transition-colors ${
        isFullySubmitted
          ? "bg-[#0D1F0D] border-[#3CAC3B]/40"
          : "bg-[#0D1333] border-[#1E2B6E]"
      }`}>
        {isFullySubmitted ? (
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-[#3CAC3B]/20 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5 text-[#3CAC3B]" />
            </div>
            <div>
              <p className="text-white font-bold text-base">Prediction fully submitted!</p>
              <p className="text-[#3CAC3B] text-sm">All sections complete — good luck!</p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2">
              <span className="text-white font-semibold text-sm">Overall completion</span>
              <span className="text-[#D1D4D1]/60 text-sm font-mono tabular-nums">{completionPct}%</span>
            </div>
            <div className="h-2.5 bg-[#1E2B6E] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#E61D25] rounded-full transition-all duration-500"
                style={{ width: `${completionPct}%` }}
              />
            </div>
          </>
        )}

        {/* Section breakdown */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3 mt-4">
          {[
            { label: "Match Results",   saved: savedMatchCount,       total: matchTotal,        filled: filledPicks },
            { label: "Group Standings", saved: savedStandingsCount,   total: standingsTotal,    filled: savedStandingsCount },
            { label: "Third Place",     saved: savedThirdPlaceCount,  total: 8,                 filled: thirdPlaceGroupIds.size },
            { label: "KO Bracket",      saved: savedKOCount,          total: koMatches.length,  filled: filledKO },
          ].map(({ label, saved, total, filled }) => {
            const savedDone = saved === total
            const hasUnsaved = filled > saved
            return (
              <div key={label} className="space-y-1.5">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[#D1D4D1]/60 text-xs truncate">{label}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    {savedDone
                      ? <CheckCircle2 className="w-3 h-3 text-[#3CAC3B]" />
                      : <Circle className="w-3 h-3 text-[#474A4A]" />
                    }
                    <span className={`text-xs font-mono tabular-nums ${savedDone ? "text-[#3CAC3B]" : "text-[#474A4A]"}`}>
                      {saved}/{total}
                    </span>
                  </div>
                </div>
                <div className="h-1 bg-[#1E2B6E] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${savedDone ? "bg-[#3CAC3B]" : "bg-[#E61D25]"}`}
                    style={{ width: total > 0 ? `${Math.round((saved / total) * 100)}%` : "0%" }}
                  />
                </div>
                {hasUnsaved && !savedDone && (
                  <p className="text-[#474A4A] text-xs">{filled - saved} filled, not saved</p>
                )}
              </div>
            )
          })}
        </div>
      </div>

    <Tabs defaultValue="matches" className="space-y-6">
      <TabsList className="bg-[#0D1333] border border-[#1E2B6E] p-1 h-auto flex-nowrap overflow-x-auto w-full [scrollbar-width:none] [-webkit-overflow-scrolling:touch]">
        <TabsTrigger
          value="matches"
          className="data-[state=active]:bg-[#2A398D] data-[state=active]:text-white text-[#D1D4D1]/60 rounded-md px-4 py-2 text-sm font-medium"
        >
          Match Results
          {badge(filledPicks, matchTotal)}
        </TabsTrigger>

        <TabsTrigger
          value="standings"
          className="data-[state=active]:bg-[#2A398D] data-[state=active]:text-white text-[#D1D4D1]/60 rounded-md px-4 py-2 text-sm font-medium"
        >
          Group Standings
          {badge(savedStandingsCount, standingsTotal)}
        </TabsTrigger>

        <TabsTrigger
          value="thirdplace"
          className="data-[state=active]:bg-[#2A398D] data-[state=active]:text-white text-[#D1D4D1]/60 rounded-md px-4 py-2 text-sm font-medium"
        >
          Third Place
          {badge(thirdPlaceGroupIds.size, 8)}
        </TabsTrigger>

        <TabsTrigger
          value="ko"
          className="data-[state=active]:bg-[#2A398D] data-[state=active]:text-white text-[#D1D4D1]/60 rounded-md px-4 py-2 text-sm font-medium"
        >
          KO Bracket
          {badge(filledKO, koMatches.length)}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="matches" className="mt-0">
        <MatchResultsEditor
          predictionId={predictionId}
          matchesByGroup={matchesByGroup}
          picks={picks}
          onPickChange={handlePickChange}
          onSaveSuccess={(count) => setSavedMatchCount(count)}
          locked={locked}
        />
      </TabsContent>

      <TabsContent value="standings" className="mt-0">
        <GroupStageEditor
          predictionId={predictionId}
          groups={groupsWithThird}
          groupOrders={groupOrders}
          onReorder={handleReorder}
          onSaveSuccess={() => setSavedStandingsCount(standingsTotal)}
          locked={locked}
        />
      </TabsContent>

      <TabsContent value="thirdplace" className="mt-0">
        <ThirdPlacePicker
          predictionId={predictionId}
          groups={groupsWithThird}
          savedGroupIds={savedThirdPlaceGroupIds}
          locked={locked}
          onSelectionChange={handleThirdPlaceChange}
          onSaveSuccess={() => setSavedThirdPlaceCount(8)}
        />
      </TabsContent>

      <TabsContent value="ko" className="mt-0">
        <KOBracketEditor
          predictionId={predictionId}
          koMatches={koMatches}
          picks={koPicks}
          onPickChange={handleKOPickChange}
          onSaveSuccess={(count) => setSavedKOCount(count)}
          resolvedTeams={resolvedKOTeams}
          locked={koLocked}
        />
      </TabsContent>
    </Tabs>
    </div>
  )
}
