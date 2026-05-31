/**
 * Tournament phase simulator — hands-on tool for testing the full flow.
 *
 * Commands:
 *   status               Show current phase, match results, and top scores
 *   phase <name>         Shift tournament dates to simulate a phase:
 *                          pre        predictions open, group stage not started
 *                          group      group stage in progress (group picks locked)
 *                          window2    group done, KO window open
 *                          knockout   KO stage in progress (all picks locked)
 *                          done       tournament over
 *   simulate-group       Set all 72 group match results (home wins 1-0)
 *   simulate-draw        Assign R32 teams from group standings (no scores) — models the official draw
 *   simulate-ko          Set all KO match results from existing R32 team assignments
 *   score                Run full scoring: match pts + standings + 3rd-place + KO + recalc totals
 *   leaderboard [N]      Show top N predictions (default 10)
 *   reset-results        DESTRUCTIVE: clear all match results, team assignments, and scores
 *
 * Recommended test flow:
 *   1. phase pre          → predictions open
 *   2. simulate-group     → set group results (auto-scores group matches)
 *   3. score              → score group standings + 3rd place (needs actualPosition set by simulate-draw)
 *   4. phase window2      → group done, KO bracket editable
 *   5. simulate-draw      → assign R32 teams + set actualPosition/3rd-place qualifiers
 *   6. score              → score group standings + 3rd place now that positions are known
 *   7. phase knockout     → lock KO bracket
 *   8. simulate-ko        → play KO matches (auto-scores everything)
 *   9. leaderboard        → view results
 *  10. reset-results      → wipe everything back to clean state
 *
 * Run: npx tsx scripts/simulate-tournament.ts <command> [args]
 *
 * WARNING: This script modifies live DB data — tournament dates and match results.
 * Only use for testing. Use 'reset-results' + 'phase pre' to restore before launch.
 */

import "dotenv/config"
import { PrismaClient } from "../lib/generated/prisma"

const prisma = new PrismaClient()
const PASS  = "\x1b[32m✓\x1b[0m"
const FAIL  = "\x1b[31m✗\x1b[0m"
const INFO  = "\x1b[36m·\x1b[0m"
const BOLD  = (s: string) => `\x1b[1m${s}\x1b[0m`
const GREEN = (s: string) => `\x1b[32m${s}\x1b[0m`
const RED   = (s: string) => `\x1b[31m${s}\x1b[0m`
const CYAN  = (s: string) => `\x1b[36m${s}\x1b[0m`

function info(m: string) { console.log(`  ${INFO} ${m}`) }
function ok(m: string)   { console.log(`  ${PASS} ${m}`) }
function fail(m: string) { console.log(`  ${FAIL} ${m}`) }
function header(t: string) { console.log(`\n${BOLD("── " + t + " ──")}`) }

// ─── Phase date offsets ───────────────────────────────────────────────────────

function phaseDate(offsetDays: number): Date {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d
}

const PHASES: Record<string, { groupStageStart: Date; groupStageEnd: Date; knockoutStageStart: Date; label: string }> = {
  pre: {
    groupStageStart:    phaseDate(30),
    groupStageEnd:      phaseDate(50),
    knockoutStageStart: phaseDate(55),
    label: "PRE-TOURNAMENT (predictions open, all picks editable)",
  },
  group: {
    groupStageStart:    phaseDate(-1),
    groupStageEnd:      phaseDate(20),
    knockoutStageStart: phaseDate(25),
    label: "GROUP STAGE (group picks locked, KO picks still editable)",
  },
  window2: {
    groupStageStart:    phaseDate(-25),
    groupStageEnd:      phaseDate(-1),
    knockoutStageStart: phaseDate(5),
    label: "WINDOW 2 (group done, KO picks editable until knockoutStageStart)",
  },
  knockout: {
    groupStageStart:    phaseDate(-30),
    groupStageEnd:      phaseDate(-6),
    knockoutStageStart: phaseDate(-1),
    label: "KNOCKOUT STAGE (all picks locked)",
  },
  done: {
    groupStageStart:    phaseDate(-45),
    groupStageEnd:      phaseDate(-21),
    knockoutStageStart: phaseDate(-16),
    label: "TOURNAMENT DONE",
  },
}

// ─── Group standings helper ───────────────────────────────────────────────────

type GroupStanding = { teamId: string; position: number }

async function computeGroupStandings(
  groups: { id: string; letter: string; teams: { teamId: string; team: { code: string } }[] }[]
): Promise<Map<string, GroupStanding[]>> {
  const result = new Map<string, GroupStanding[]>()

  for (const g of groups) {
    const stats = new Map<string, { pts: number; gf: number; ga: number; code: string }>()
    for (const gt of g.teams) {
      stats.set(gt.teamId, { pts: 0, gf: 0, ga: 0, code: gt.team.code })
    }

    const matches = await prisma.match.findMany({
      where: { stage: "GROUP", groupId: g.id, homeScore: { not: null } },
      select: { homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true, winnerId: true, isDraw: true },
    })

    for (const m of matches) {
      if (!m.homeTeamId || !m.awayTeamId) continue
      const h = stats.get(m.homeTeamId)
      const a = stats.get(m.awayTeamId)
      if (!h || !a) continue
      if (m.isDraw) {
        h.pts += 1; a.pts += 1
      } else if (m.winnerId === m.homeTeamId) {
        h.pts += 3
      } else {
        a.pts += 3
      }
      h.gf += m.homeScore!; h.ga += m.awayScore!
      a.gf += m.awayScore!; a.ga += m.homeScore!
    }

    const sorted = Array.from(stats.entries())
      .map(([teamId, s]) => ({ teamId, ...s, gd: s.gf - s.ga }))
      .sort((a, b) =>
        b.pts !== a.pts ? b.pts - a.pts :
        b.gd  !== a.gd  ? b.gd  - a.gd  :
        b.gf  !== a.gf  ? b.gf  - a.gf  :
        a.code.localeCompare(b.code)
      )

    result.set(g.id, sorted.map((s, i) => ({ teamId: s.teamId, position: i + 1 })))
  }

  return result
}

// ─── Commands ─────────────────────────────────────────────────────────────────

async function cmdStatus() {
  header("Tournament Status")

  const t = await prisma.tournament.findUnique({ where: { year: 2026 } })
  if (!t) { fail("Tournament 2026 not found"); return }

  const now = new Date()
  let phase = "PRE-TOURNAMENT"
  if (now >= t.knockoutStageStart) phase = "KNOCKOUT STAGE"
  else if (now >= t.groupStageEnd)  phase = "WINDOW 2 (KO picks open)"
  else if (now >= t.groupStageStart) phase = "GROUP STAGE"

  console.log(`\n  ${BOLD("Phase:")} ${GREEN(phase)}`)
  info(`groupStageStart:    ${t.groupStageStart.toISOString().replace("T", " ").slice(0, 16)} UTC`)
  info(`groupStageEnd:      ${t.groupStageEnd.toISOString().replace("T", " ").slice(0, 16)} UTC`)
  info(`knockoutStageStart: ${t.knockoutStageStart.toISOString().replace("T", " ").slice(0, 16)} UTC`)

  const groupResults = await prisma.match.count({ where: { stage: "GROUP", homeScore: { not: null } } })
  const groupTotal   = await prisma.match.count({ where: { stage: "GROUP" } })
  const koResults    = await prisma.match.count({ where: { stage: { in: ["R32","R16","QF","SF","THIRD_PLACE","FINAL"] }, homeScore: { not: null } } })
  const koTotal      = await prisma.match.count({ where: { stage: { in: ["R32","R16","QF","SF","THIRD_PLACE","FINAL"] } } })
  const predCount    = await prisma.prediction.count()

  info(`Group results:   ${groupResults}/${groupTotal}`)
  info(`KO results:      ${koResults}/${koTotal}`)
  info(`Predictions:     ${predCount}`)

  const topPreds = await prisma.prediction.findMany({
    take: 3,
    orderBy: { totalScore: "desc" },
    include: { user: { select: { displayName: true } } },
  })
  if (topPreds.length > 0) {
    info(`Top scores: ${topPreds.map(p => `${p.user.displayName} (${p.totalScore}pts)`).join(", ")}`)
  }
}

async function cmdPhase(name: string) {
  const config = PHASES[name]
  if (!config) {
    console.log(`\nUnknown phase: ${name}. Use: pre | group | window2 | knockout | done`)
    process.exit(1)
  }

  header(`Setting phase: ${name}`)

  const t = await prisma.tournament.findUnique({ where: { year: 2026 } })
  if (!t) { fail("Tournament 2026 not found"); return }

  await prisma.tournament.update({
    where: { year: 2026 },
    data: {
      groupStageStart:    config.groupStageStart,
      groupStageEnd:      config.groupStageEnd,
      knockoutStageStart: config.knockoutStageStart,
    },
  })

  ok(`Phase set to: ${config.label}`)
  info(`groupStageStart:    ${config.groupStageStart.toISOString().replace("T", " ").slice(0, 16)} UTC`)
  info(`groupStageEnd:      ${config.groupStageEnd.toISOString().replace("T", " ").slice(0, 16)} UTC`)
  info(`knockoutStageStart: ${config.knockoutStageStart.toISOString().replace("T", " ").slice(0, 16)} UTC`)
}

async function cmdSimulateGroup() {
  header("Simulating group stage (home wins 1-0)")

  const matches = await prisma.match.findMany({
    where: { stage: "GROUP", homeTeamId: { not: null }, awayTeamId: { not: null } },
    select: { id: true, homeTeamId: true, matchNumber: true },
  })

  if (matches.length === 0) {
    fail("No group matches with teams assigned — run sync first")
    return
  }

  const alreadyDone = await prisma.match.count({ where: { stage: "GROUP", homeScore: { not: null } } })
  if (alreadyDone > 0) {
    info(`${alreadyDone} group matches already have results — overwriting all`)
  }

  for (const m of matches) {
    await prisma.match.update({
      where: { id: m.id },
      data: { homeScore: 1, awayScore: 0, isDraw: false, winnerId: m.homeTeamId },
    })
  }

  ok(`Set results for ${matches.length} group matches (all home wins 1-0)`)
}

async function cmdSimulateDraw() {
  header("Simulating official draw (assigning R32 teams, no scores)")

  const groupCount = await prisma.match.count({ where: { stage: "GROUP", homeScore: { not: null } } })
  if (groupCount < 72) {
    fail(`Only ${groupCount}/72 group results set — run simulate-group first`)
    return
  }

  const groups = await prisma.tournamentGroup.findMany({
    include: { teams: { include: { team: { select: { id: true, code: true } } } } },
    orderBy: { letter: "asc" },
  })
  if (groups.length !== 12) { fail(`Expected 12 groups, found ${groups.length}`); return }

  const groupByLetter = new Map(groups.map(g => [g.letter, g.id]))
  const groupById     = new Map(groups.map(g => [g.id, g]))
  const standings     = await computeGroupStandings(groups)

  // Write actualPosition to GroupTeam
  for (const [groupId, ranked] of Array.from(standings)) {
    for (const { teamId, position } of ranked) {
      await prisma.groupTeam.update({
        where: { groupId_teamId: { groupId, teamId } },
        data: { actualPosition: position },
      })
    }
  }
  ok("Group standings written (actualPosition set)")

  // Determine 8 advancing 3rd-place teams (best 8 by code alphabetical as tiebreaker)
  const thirdPlace: { groupId: string; teamId: string; code: string }[] = []
  for (const [groupId, ranked] of Array.from(standings)) {
    const third = ranked.find(r => r.position === 3)
    const g     = groupById.get(groupId)!
    const gt    = g.teams.find(t => t.teamId === third?.teamId)
    if (third && gt) thirdPlace.push({ groupId, teamId: third.teamId, code: gt.team.code })
  }
  thirdPlace.sort((a, b) => a.code.localeCompare(b.code))
  const advancing3rd = thirdPlace.slice(0, 8)

  await prisma.groupTeam.updateMany({ data: { thirdPlaceQualified: false } })
  for (const { groupId, teamId } of advancing3rd) {
    await prisma.groupTeam.update({
      where: { groupId_teamId: { groupId, teamId } },
      data: { thirdPlaceQualified: true },
    })
  }
  ok(`3rd-place qualifiers set: ${advancing3rd.map(t => t.code).join(", ")}`)

  // Build R32 bracket slots
  const GROUP_PAIRS: [string, string][] = [
    ["A","B"],["C","D"],["E","F"],["G","H"],["I","J"],["K","L"],
  ]
  function pick(letter: string, pos: number): string {
    const gId = groupByLetter.get(letter)!
    return standings.get(gId)!.find(r => r.position === pos)!.teamId
  }
  const r32Slots: { home: string; away: string }[] = []
  for (const [g1, g2] of GROUP_PAIRS) {
    r32Slots.push({ home: pick(g1, 1), away: pick(g2, 2) })
    r32Slots.push({ home: pick(g2, 1), away: pick(g1, 2) })
  }
  for (let i = 0; i < 4; i++) {
    r32Slots.push({ home: advancing3rd[i * 2]?.teamId ?? "", away: advancing3rd[i * 2 + 1]?.teamId ?? "" })
  }

  // Assign teams to R32 matches — no scores, no winners
  const r32Matches = await prisma.match.findMany({
    where: { stage: "R32" },
    orderBy: [{ kickoff: "asc" }, { matchNumber: "asc" }],
  })
  let assigned = 0
  for (let i = 0; i < r32Matches.length; i++) {
    const m    = r32Matches[i]
    const slot = r32Slots[i]
    if (!slot?.home || !slot?.away) continue
    await prisma.match.update({
      where: { id: m.id },
      data: { homeTeamId: slot.home, awayTeamId: slot.away },
    })
    assigned++
  }

  ok(`R32: ${assigned}/${r32Matches.length} matches assigned — teams visible, no scores set`)
  info("Run 'phase window2' to open the KO bracket for editing")
}

async function cmdSimulateKO() {
  header("Simulating KO results (home wins, using existing team assignments)")

  const r32Assigned = await prisma.match.count({ where: { stage: "R32", homeTeamId: { not: null } } })
  if (r32Assigned === 0) {
    fail("No R32 teams assigned — run simulate-draw first")
    return
  }

  type KOMatch = Awaited<ReturnType<typeof prisma.match.findMany>>[number]
  const koByStage = new Map<string, KOMatch[]>()
  const allKO = await prisma.match.findMany({
    where: { stage: { in: ["R32","R16","QF","SF","THIRD_PLACE","FINAL"] } },
    orderBy: [{ kickoff: "asc" }, { matchNumber: "asc" }],
  })
  for (const m of allKO) {
    if (!koByStage.has(m.stage)) koByStage.set(m.stage, [])
    koByStage.get(m.stage)!.push(m)
  }

  const winnerOf = new Map<string, string>()
  const loserOf  = new Map<string, string>()

  // R32 — teams already assigned by simulate-draw, just set results
  const r32 = koByStage.get("R32") ?? []
  for (const m of r32) {
    if (!m.homeTeamId || !m.awayTeamId) continue
    await prisma.match.update({
      where: { id: m.id },
      data: { homeScore: 1, awayScore: 0, isDraw: false, winnerId: m.homeTeamId },
    })
    winnerOf.set(m.id, m.homeTeamId); loserOf.set(m.id, m.awayTeamId)
  }
  info(`R32: ${r32.length} matches`)

  async function simRound(feeders: typeof r32, round: typeof r32, stage: string) {
    for (let i = 0; i < round.length; i++) {
      const m    = round[i]
      const home = winnerOf.get(feeders[i * 2]?.id ?? "")
      const away = winnerOf.get(feeders[i * 2 + 1]?.id ?? "")
      if (!home || !away) continue
      await prisma.match.update({
        where: { id: m.id },
        data: { homeTeamId: home, awayTeamId: away, homeScore: 1, awayScore: 0, isDraw: false, winnerId: home },
      })
      winnerOf.set(m.id, home); loserOf.set(m.id, away)
    }
    info(`${stage}: ${round.length} matches`)
  }

  const r16 = koByStage.get("R16") ?? []; await simRound(r32, r16, "R16")
  const qf  = koByStage.get("QF")  ?? []; await simRound(r16, qf,  "QF")
  const sf  = koByStage.get("SF")  ?? []; await simRound(qf,  sf,  "SF")

  const tp = (koByStage.get("THIRD_PLACE") ?? [])[0]
  if (tp) {
    const h = loserOf.get(sf[0]?.id ?? ""); const a = loserOf.get(sf[1]?.id ?? "")
    if (h && a) {
      await prisma.match.update({ where: { id: tp.id }, data: { homeTeamId: h, awayTeamId: a, homeScore: 1, awayScore: 0, isDraw: false, winnerId: h } })
      winnerOf.set(tp.id, h); info("THIRD_PLACE: 1 match")
    }
  }

  const fin = (koByStage.get("FINAL") ?? [])[0]
  if (fin) {
    const h = winnerOf.get(sf[0]?.id ?? ""); const a = winnerOf.get(sf[1]?.id ?? "")
    if (h && a) {
      await prisma.match.update({ where: { id: fin.id }, data: { homeTeamId: h, awayTeamId: a, homeScore: 1, awayScore: 0, isDraw: false, winnerId: h } })
      info("FINAL: 1 match")
    }
  }

  ok("KO bracket simulated")
  await cmdScore()
}

async function cmdScore() {
  header("Running full scoring pipeline")

  const completedMatches = await prisma.match.findMany({
    where: { homeScore: { not: null } },
    select: { id: true, isDraw: true, winnerId: true, pointsAvailable: true },
  })
  if (completedMatches.length === 0) { fail("No match results set — run simulate-group first"); return }

  // Reset
  await prisma.matchPrediction.updateMany({
    where: { matchId: { in: completedMatches.map(m => m.id) } },
    data: { pointsEarned: 0 },
  })

  // Award match points
  for (const m of completedMatches) {
    if (m.isDraw) {
      await prisma.matchPrediction.updateMany({
        where: { matchId: m.id, isDraw: true },
        data: { pointsEarned: m.pointsAvailable },
      })
    } else if (m.winnerId) {
      await prisma.matchPrediction.updateMany({
        where: { matchId: m.id, predictedWinnerId: m.winnerId },
        data: { pointsEarned: m.pointsAvailable },
      })
    }
  }

  // Joker doubling
  const jokerPicks = await prisma.jokerPick.findMany({
    where: { matchId: { in: completedMatches.map(m => m.id) } },
    select: { predictionId: true, matchId: true },
  })
  for (const jp of jokerPicks) {
    await prisma.matchPrediction.updateMany({
      where: { predictionId: jp.predictionId, matchId: jp.matchId, pointsEarned: { gt: 0 } },
      data: { pointsEarned: { multiply: 2 } },
    })
  }
  if (jokerPicks.length > 0) info(`Applied joker doubling to ${jokerPicks.length} joker pick(s)`)

  // Group standings scoring (1pt per correct position)
  const actualPositions = await prisma.groupTeam.findMany({
    where: { actualPosition: { not: null } },
    select: { groupId: true, teamId: true, actualPosition: true },
  })
  if (actualPositions.length > 0) {
    await prisma.groupStandingPrediction.updateMany({ data: { pointsEarned: 0 } })
    for (const a of actualPositions) {
      await prisma.groupStandingPrediction.updateMany({
        where: { groupId: a.groupId, teamId: a.teamId, predictedPosition: a.actualPosition! },
        data: { pointsEarned: 1 },
      })
    }
    info(`Group standings: scored ${actualPositions.length} positions`)
  } else {
    info("Group standings: no actualPosition set (set via admin console)")
  }

  // Third-place scoring (1pt per correct qualifying group)
  const qualified = await prisma.groupTeam.findMany({
    where: { thirdPlaceQualified: true },
    select: { groupId: true },
  })
  if (qualified.length > 0) {
    await prisma.thirdPlacePrediction.updateMany({ data: { pointsEarned: 0 } })
    await prisma.thirdPlacePrediction.updateMany({
      where: { groupId: { in: qualified.map(q => q.groupId) } },
      data: { pointsEarned: 1 },
    })
    info(`Third-place: scored ${qualified.length} qualifying groups`)
  } else {
    info("Third-place: no qualified groups set (set via admin console)")
  }

  // Recompute totalScore
  const preds = await prisma.prediction.findMany({ select: { id: true } })
  for (const pred of preds) {
    const [mAgg, sAgg, tAgg, totalPredicted, correctPredicted] = await Promise.all([
      prisma.matchPrediction.aggregate({ where: { predictionId: pred.id }, _sum: { pointsEarned: true } }),
      prisma.groupStandingPrediction.aggregate({ where: { predictionId: pred.id }, _sum: { pointsEarned: true } }),
      prisma.thirdPlacePrediction.aggregate({ where: { predictionId: pred.id }, _sum: { pointsEarned: true } }),
      prisma.matchPrediction.count({ where: { predictionId: pred.id, match: { homeScore: { not: null } } } }),
      prisma.matchPrediction.count({ where: { predictionId: pred.id, pointsEarned: { gt: 0 } } }),
    ])
    await prisma.prediction.update({
      where: { id: pred.id },
      data: {
        totalScore: (mAgg._sum.pointsEarned ?? 0) + (sAgg._sum.pointsEarned ?? 0) + (tAgg._sum.pointsEarned ?? 0),
        matchAccuracy: totalPredicted > 0 ? (correctPredicted / totalPredicted) * 100 : 0,
      },
    })
  }

  // Recompute league ranks
  const leagues = await prisma.league.findMany({ select: { id: true } })
  for (const league of leagues) {
    const members = await prisma.leagueMembership.findMany({
      where: { leagueId: league.id },
      include: { prediction: { select: { totalScore: true } } },
      orderBy: { prediction: { totalScore: "desc" } },
    })
    for (let i = 0; i < members.length; i++) {
      await prisma.leagueMembership.update({ where: { id: members[i].id }, data: { currentRank: i + 1 } })
    }
  }

  ok(`Scored ${completedMatches.length} matches, ${preds.length} predictions, ${leagues.length} leagues`)
  info("Run 'leaderboard' to see scores")
}

async function cmdLeaderboard(limit: number) {
  header(`Leaderboard (top ${limit})`)

  const preds = await prisma.prediction.findMany({
    take: limit,
    orderBy: { totalScore: "desc" },
    include: { user: { select: { displayName: true } } },
  })

  if (preds.length === 0) { info("No predictions yet"); return }

  const maxScore = preds[0].totalScore
  let rank = 0
  for (const p of preds) {
    rank++
    const bar = maxScore > 0 ? "█".repeat(Math.round((p.totalScore / maxScore) * 20)) : ""
    console.log(`  ${String(rank).padStart(3)}. ${p.user.displayName.padEnd(25)} ${String(p.totalScore).padStart(4)}pts  ${CYAN(bar)}`)
  }
}

async function cmdResetResults() {
  header("Resetting all match results, team assignments, and scores")

  const matchesWithResults = await prisma.match.count({ where: { homeScore: { not: null } } })
  const koTeamsAssigned    = await prisma.match.count({ where: { stage: { in: ["R32","R16","QF","SF","THIRD_PLACE","FINAL"] }, homeTeamId: { not: null } } })

  console.log(`\n  ${RED("WARNING:")} This will clear ${matchesWithResults} match results, ${koTeamsAssigned} KO team assignments, and reset ALL prediction scores.`)
  console.log("  Press Ctrl+C to cancel, or wait 5 seconds to continue...\n")

  await new Promise(resolve => setTimeout(resolve, 5000))

  // Clear all KO match team assignments and results (covers simulate-draw + simulate-ko)
  await prisma.match.updateMany({
    where: { stage: { in: ["R32","R16","QF","SF","THIRD_PLACE","FINAL"] } },
    data: { homeTeamId: null, awayTeamId: null, homeScore: null, awayScore: null, isDraw: null, winnerId: null },
  })

  // Clear group match results
  await prisma.match.updateMany({
    where: { stage: "GROUP", homeScore: { not: null } },
    data: { homeScore: null, awayScore: null, isDraw: null, winnerId: null },
  })

  // Reset all prediction points and scores
  await prisma.matchPrediction.updateMany({ data: { pointsEarned: 0 } })
  await prisma.groupStandingPrediction.updateMany({ data: { pointsEarned: 0 } })
  await prisma.thirdPlacePrediction.updateMany({ data: { pointsEarned: 0 } })
  await prisma.prediction.updateMany({ data: { totalScore: 0, matchAccuracy: 0 } })
  await prisma.groupTeam.updateMany({ data: { actualPosition: null, thirdPlaceQualified: false } })

  ok(`Cleared ${matchesWithResults} match results, ${koTeamsAssigned} KO team assignments, reset all scores`)
  info("Run 'phase pre' to restore tournament dates if needed")
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const [cmd, arg] = process.argv.slice(2)

  if (!cmd) {
    console.log("\nUsage: npx tsx scripts/simulate-tournament.ts <command> [arg]")
    console.log("\nCommands:")
    console.log("  status               Current phase + stats")
    console.log("  phase <name>         Set phase: pre | group | window2 | knockout | done")
    console.log("  simulate-group       Set all group match results (home wins 1-0)")
    console.log("  simulate-draw        Assign R32 teams from standings (no scores) — models the draw")
    console.log("  simulate-ko          Set all KO match results (uses existing R32 team assignments)")
    console.log("  score                Run full scoring pipeline")
    console.log("  leaderboard [N]      Show top N predictions (default 10)")
    console.log("  reset-results        DESTRUCTIVE: clear all match results + scores")
    process.exit(0)
  }

  switch (cmd) {
    case "status":        await cmdStatus(); break
    case "phase":
      if (!arg) { console.log("Usage: phase <pre|group|window2|knockout|done>"); process.exit(1) }
      await cmdPhase(arg); break
    case "simulate-group": await cmdSimulateGroup(); break
    case "simulate-draw":  await cmdSimulateDraw(); break
    case "simulate-ko":    await cmdSimulateKO(); break
    case "score":          await cmdScore(); break
    case "leaderboard":    await cmdLeaderboard(parseInt(arg ?? "10") || 10); break
    case "reset-results":  await cmdResetResults(); break
    default:
      console.log(`Unknown command: ${cmd}`)
      process.exit(1)
  }
}

main()
  .catch(e => { console.error("\nFatal:", e.message); process.exit(1) })
  .finally(() => prisma.$disconnect())
