"use client"

import { useState } from "react"
import { toast } from "sonner"
import { CheckCircle2, Circle } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { GroupStageEditor } from "./group-stage-editor"
import { MatchResultsEditor } from "./match-results-editor"
import { ThirdPlacePicker } from "./third-place-picker"
import { KOBracketEditor, type KOMatch, type KOPick } from "./ko-bracket-editor"
import { KOResultsView } from "./ko-results-view"

export type ResultChoice = "home" | "draw" | "away" | null

export type Team = { id: string; name: string; code: string; flagUrl: string }

export type GroupMatch = {
  id: string
  groupId: string
  kickoff: Date
  homeTeam: Team | null
  awayTeam: Team | null
  homeScore: number | null
  awayScore: number | null
  winnerId: string | null
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
  pointsByMatch?: Record<string, number>
  locked: boolean
  koMatches: KOMatch[]
  savedKOPicksMap: Record<string, { predictedWinnerId: string | null; pointsEarned: number }>
  koLocked: boolean
  koResultsMode?: boolean
  initialTab?: "matches" | "standings" | "thirdplace" | "ko"
  // stage → matchId: joker picks keyed by stage name
  savedJokerPicks?: Record<string, string>
  // Actual group standings (set by admin post-group stage). When present, overrides user's
  // group predictions for resolving KO bracket teams.
  actualGroupOrders?: Record<string, Team[]>
  // Admin-confirmed final 8 third-place qualifying groups.
  actualThirdPlaceGroupIds?: string[]
}

// ─── Group-stage helpers ───────────────────────────────────────────────────

export function initGroupOrders(
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

export function initPicks(
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
// Each stage's picks feed the cascade so the next stage can be resolved too.
export function initKOPicksIterative(
  koMatches: KOMatch[],
  savedMap: Props["savedKOPicksMap"],
): Record<string, KOPick> {
  const STAGES = ["R32", "R16", "QF", "SF", "THIRD_PLACE", "FINAL"]
  let currentPicks: Record<string, KOPick> = {}

  for (const stage of STAGES) {
    const bracket = computeKOBracket(koMatches, currentPicks)
    // Pure-cascade bracket ignores real confirmed DB teams so that picks for
    // eliminated teams (whose team ID no longer appears in confirmed R16+ lineups)
    // still resolve to "home"/"away" for display purposes.
    const cascadeBracket = computeKOBracket(koMatches, currentPicks, { pureCascade: true })
    for (const m of koMatches.filter((m) => m.stage === stage)) {
      const saved = savedMap[m.id]
      if (!saved || saved.predictedWinnerId === null) continue
      const resolved = bracket[m.id]
      const cascadeResolved = cascadeBracket[m.id]
      if (
        saved.predictedWinnerId === m.homeTeam?.id ||
        (resolved?.home && saved.predictedWinnerId === resolved.home.id) ||
        (cascadeResolved?.home && saved.predictedWinnerId === cascadeResolved.home.id)
      ) {
        currentPicks = { ...currentPicks, [m.id]: "home" }
      } else if (
        saved.predictedWinnerId === m.awayTeam?.id ||
        (resolved?.away && saved.predictedWinnerId === resolved.away.id) ||
        (cascadeResolved?.away && saved.predictedWinnerId === cascadeResolved.away.id)
      ) {
        currentPicks = { ...currentPicks, [m.id]: "away" }
      }
    }
  }
  return currentPicks
}

// Official Round-of-16-through-Final bracket structure for the 2026 World Cup,
// keyed by each match's stable matchNumber (football-data.org's persistent fixture
// ID — survives re-syncs, unlike DB row ids or kickoff-sorted array position).
//
// The previous implementation paired matches by kickoff-date order within each
// stage, assuming round N's matches feed into round N+1 in that same chronological
// sequence. That's wrong — FIFA's actual bracket tree doesn't follow date order
// (e.g. the real Round of 16 match at NRG Stadium is fed by the Round of 32
// matches at SoFi Stadium June 28 and Estadio BBVA June 30, which aren't adjacent
// in kickoff order). This caused R16+ matchups to not match FIFA's published
// bracket once users picked R32 winners.
//
// Verified by cross-referencing every match's stadium and kickoff time against
// Wikipedia's "2026 FIFA World Cup knockout stage" page: all 8 Round of 16 venues,
// all 4 Quarterfinal venues, both Semifinal venues, and the Final/Third-place
// venues match exactly, and resolving the Round of 32 from confirmed group
// standings (winner/runner-up/3rd-place-wildcard roles) against this feeder graph
// accounts for all 16 real Round of 32 matchups with no conflicts.
const KO_FEEDERS: Record<number, [number, number]> = {
  537376: [537417, 537418], // R16 @ NRG Stadium
  537375: [537415, 537416], // R16 @ Lincoln Financial Field
  537377: [537423, 537424], // R16 @ MetLife Stadium
  537378: [537425, 537426], // R16 @ Estadio Azteca
  537379: [537419, 537420], // R16 @ AT&T Stadium
  537380: [537421, 537422], // R16 @ Lumen Field
  537381: [537427, 537428], // R16 @ Mercedes-Benz Stadium
  537382: [537429, 537430], // R16 @ BC Place
  537383: [537375, 537376], // QF @ Gillette Stadium (confirmed: FRA from 537375 is home, MAR from 537376 is away)
  537384: [537379, 537380], // QF @ SoFi Stadium
  537385: [537377, 537378], // QF @ Hard Rock Stadium
  537386: [537381, 537382], // QF @ Arrowhead Stadium
  537387: [537383, 537384], // SF @ AT&T Stadium
  537388: [537385, 537386], // SF @ Mercedes-Benz Stadium
  537390: [537387, 537388], // Final @ MetLife Stadium (winners)
  537389: [537387, 537388], // Third place @ Hard Rock Stadium (losers)
}
const THIRD_PLACE_MATCH_NUMBER = 537389

export function computeKOBracket(
  koMatches: KOMatch[],
  koPicks: Record<string, KOPick>,
  { pureCascade = false }: { pureCascade?: boolean } = {}
): Record<string, { home: Team | null; away: Team | null }> {
  const byMatchNumber = new Map(koMatches.map((m) => [m.matchNumber, m]))

  type Slot = { home: Team | null; away: Team | null }
  const result: Record<string, Slot> = {}

  // R32 teams come solely from the real synced fixture data (football-data.org).
  // We previously tried to guess each slot from group standings using an assumed
  // "Group A vs Group B" cross-pairing, but FIFA's actual 48-team seeding rule for
  // the 8 wildcard 3rd-place teams doesn't follow that simple pattern — the guess
  // routinely put the same team into two different slots. Showing TBD until the
  // real fixture is confirmed is correct; a wrong guess is worse than no guess.
  for (const m of koMatches.filter((m) => m.stage === "R32")) {
    // R32 always uses real DB teams — they're the base of the cascade, and
    // R32 teams are always directly assigned from the API (never themselves
    // the result of a cascade). pureCascade only affects R16 and beyond.
    result[m.id] = { home: m.homeTeam ?? null, away: m.awayTeam ?? null }
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

  // Process rounds in bracket order so each round's winners are available before
  // the next round looks them up.
  for (const stage of ["R16", "QF", "SF", "FINAL", "THIRD_PLACE"] as const) {
    for (const m of koMatches.filter((x) => x.stage === stage)) {
      const feeders = KO_FEEDERS[m.matchNumber]
      const [matchA, matchB] = feeders
        ? [byMatchNumber.get(feeders[0]) ?? null, byMatchNumber.get(feeders[1]) ?? null]
        : [null, null]
      const resolve = m.matchNumber === THIRD_PLACE_MATCH_NUMBER ? loser : winner
      let cascadeHome = matchA ? resolve(matchA.id) : null
      let cascadeAway = matchB ? resolve(matchB.id) : null
      // When real confirmed teams are available, align the cascade's home/away slots
      // to match reality — our feeder table assigns slot order from a venue-based
      // derivation that may have the home/away sides swapped vs FIFA's actual fixture.
      if (pureCascade && (m.homeTeam || m.awayTeam)) {
        if (m.homeTeam && cascadeAway?.id === m.homeTeam.id) [cascadeHome, cascadeAway] = [cascadeAway, cascadeHome]
        else if (m.awayTeam && cascadeHome?.id === m.awayTeam.id) [cascadeHome, cascadeAway] = [cascadeAway, cascadeHome]
      }
      result[m.id] = {
        home: (pureCascade ? undefined : m.homeTeam) ?? cascadeHome ?? null,
        away: (pureCascade ? undefined : m.awayTeam) ?? cascadeAway ?? null,
      }
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
  pointsByMatch = {},
  locked,
  koMatches,
  savedKOPicksMap,
  koLocked,
  koResultsMode = false,
  initialTab,
  savedJokerPicks = {},
  actualGroupOrders,
  actualThirdPlaceGroupIds,
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
  const [koPicks, setKOPicks] = useState<Record<string, KOPick>>(() =>
    initKOPicksIterative(koMatches, savedKOPicksMap)
  )

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

  const TAB_ORDER = ["matches", "standings", "thirdplace", "ko"] as const
  type TabValue = typeof TAB_ORDER[number]

  function firstIncompleteTab(): TabValue {
    if (Object.keys(savedPicksMap).length < matchTotal) return "matches"
    if (Object.values(savedStandings).reduce((s, g) => s + Object.keys(g).length, 0) < standingsTotal) return "standings"
    if (savedThirdPlaceGroupIds.length < 8) return "thirdplace"
    return "ko"
  }

  const [activeTab, setActiveTab] = useState<TabValue>(() => initialTab ?? firstIncompleteTab())

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

  // Overall completion — based on what has been saved to the DB.
  // When KO bracket is locked, group-only items are the 100% target. When Window 2
  // opens and KO unlocks, the bar resets to ~80% (group items / total items).
  const groupOnlyTotal = matchTotal + standingsTotal + 8
  const savedGroupItems = savedMatchCount + savedStandingsCount + savedThirdPlaceCount
  const savedItems = savedGroupItems + savedKOCount
  const effectiveTotal = koLocked ? groupOnlyTotal : groupOnlyTotal + koMatches.length
  const effectiveSaved = koLocked ? savedGroupItems : savedItems
  const completionPct = effectiveTotal > 0 ? Math.round((effectiveSaved / effectiveTotal) * 100) : 0
  const isFullySubmitted = effectiveTotal > 0 && effectiveSaved >= effectiveTotal

  // Prefer the admin-confirmed actual 3rd-place team once known — showing the
  // viewer's own (possibly wrong) predicted 3rd-place team next to an actually-
  // correct/incorrect highlight is misleading once real standings exist.
  const groupsWithThird = groups.map((g) => ({
    ...g,
    thirdPlaceTeam: actualGroupOrders?.[g.id]?.[2] ?? groupOrders[g.id]?.[2] ?? null,
  }))

  // KO bracket: R32 teams come from the real synced fixture data only (see
  // computeKOBracket) — later rounds cascade from koPicks as before.
  const resolvedKOTeams = computeKOBracket(koMatches, koPicks)
  const resolvedKOCascadeTeams = computeKOBracket(koMatches, koPicks, { pureCascade: true })

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
              <p className="text-white font-bold text-base">
                {koLocked ? "Group stage complete!" : "Prediction fully submitted!"}
              </p>
              <p className="text-[#3CAC3B] text-sm">
                {koLocked ? "KO bracket opens after the group stage — check back then." : "All sections complete — good luck!"}
              </p>
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

    <Tabs value={activeTab} onValueChange={(v) => {
      if (activeTab === "matches" && !locked) {
        const remaining = matchTotal - filledPicks
        if (remaining > 0) {
          toast.warning(`${remaining} match${remaining === 1 ? "" : "es"} still need a pick on the Match Results tab.`)
        }
      }
      setActiveTab(v as TabValue)
    }} className="space-y-6">
      {/* Scroll wrapper is a plain div — keeps Radix's scrollIntoView from fighting user scroll */}
      <div className="overflow-x-auto [scrollbar-width:none] [-webkit-overflow-scrolling:touch]">
      <TabsList className="bg-[#0D1333] border border-[#1E2B6E] p-1 h-auto w-max min-w-full">
        <TabsTrigger
          value="matches"
          className="data-[state=active]:bg-[#2A398D] data-[state=active]:text-white text-[#D1D4D1]/60 rounded-md px-3 py-2 text-sm font-medium flex-none"
        >
          <span className="sm:hidden">Matches</span>
          <span className="hidden sm:inline">Match Results</span>
          {badge(filledPicks, matchTotal)}
        </TabsTrigger>

        <TabsTrigger
          value="standings"
          className="data-[state=active]:bg-[#2A398D] data-[state=active]:text-white text-[#D1D4D1]/60 rounded-md px-3 py-2 text-sm font-medium flex-none"
        >
          <span className="sm:hidden">Standings</span>
          <span className="hidden sm:inline">Group Standings</span>
          {badge(savedStandingsCount, standingsTotal)}
        </TabsTrigger>

        <TabsTrigger
          value="thirdplace"
          className="data-[state=active]:bg-[#2A398D] data-[state=active]:text-white text-[#D1D4D1]/60 rounded-md px-3 py-2 text-sm font-medium flex-none"
        >
          <span className="sm:hidden">3rd Place</span>
          <span className="hidden sm:inline">Third Place</span>
          {badge(thirdPlaceGroupIds.size, 8)}
        </TabsTrigger>

        <TabsTrigger
          value="ko"
          className="data-[state=active]:bg-[#2A398D] data-[state=active]:text-white text-[#D1D4D1]/60 rounded-md px-3 py-2 text-sm font-medium flex-none"
        >
          <span className="sm:hidden">KO</span>
          <span className="hidden sm:inline">KO Bracket</span>
          {badge(filledKO, koMatches.length)}
        </TabsTrigger>
      </TabsList>
      </div>

      <TabsContent value="matches" className="mt-0">
        <MatchResultsEditor
          predictionId={predictionId}
          matchesByGroup={matchesByGroup}
          picks={picks}
          onPickChange={handlePickChange}
          onSaveSuccess={(count) => {
            setSavedMatchCount(count)
            if (count >= matchTotal) setActiveTab("standings")
          }}
          locked={locked}
          jokerMatchId={savedJokerPicks["GROUP"] ?? null}
          pointsByMatch={pointsByMatch}
        />
      </TabsContent>

      <TabsContent value="standings" className="mt-0">
        <GroupStageEditor
          predictionId={predictionId}
          groups={groupsWithThird}
          groupOrders={groupOrders}
          onReorder={handleReorder}
          onSaveSuccess={() => {
            setSavedStandingsCount(standingsTotal)
            setActiveTab("thirdplace")
          }}
          locked={locked}
          actualGroupOrders={actualGroupOrders}
        />
      </TabsContent>

      <TabsContent value="thirdplace" className="mt-0">
        <ThirdPlacePicker
          predictionId={predictionId}
          groups={groupsWithThird}
          savedGroupIds={savedThirdPlaceGroupIds}
          locked={locked}
          onSelectionChange={handleThirdPlaceChange}
          onSaveSuccess={() => {
            setSavedThirdPlaceCount(8)
            setActiveTab("ko")
          }}
          actualQualifiedGroupIds={actualThirdPlaceGroupIds}
        />
      </TabsContent>

      <TabsContent value="ko" className="mt-0">
        {koResultsMode ? (
          <KOResultsView
            koMatches={koMatches}
            savedKOPicksMap={savedKOPicksMap}
            jokerMatchIds={savedJokerPicks}
            resolvedTeams={resolvedKOTeams}
            resolvedCascadeTeams={resolvedKOCascadeTeams}
          />
        ) : (
          <KOBracketEditor
            predictionId={predictionId}
            koMatches={koMatches}
            picks={koPicks}
            onPickChange={handleKOPickChange}
            onSaveSuccess={(count) => setSavedKOCount(count)}
            resolvedTeams={resolvedKOTeams}
            resolvedCascadeTeams={resolvedKOCascadeTeams}
            locked={koLocked}
            jokerMatchIds={savedJokerPicks}
          />
        )}
      </TabsContent>
    </Tabs>
    </div>
  )
}
