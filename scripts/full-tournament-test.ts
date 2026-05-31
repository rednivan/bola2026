/**
 * Full-tournament integration test.
 *
 * Simulates all 104 matches (72 group + 32 KO) with a deterministic
 * "all home wins" rule, creates 10 test users × 2 predictions each
 * across four scoring categories, verifies every expected score,
 * then purges all test data.
 *
 * Run: npx tsx scripts/full-tournament-test.ts
 *
 * Scoring rules baked into this test (mirrors what should go into lib/scoring.ts):
 *   Group match result:  1 pt per correct 1/X/2 outcome
 *   Group standing pos1-4: 1 pt each (flat) per correct position
 *   Third-place advance: 1 pt per correctly predicted advancing group
 *   KO bracket:         pointsAvailable on each match (3/6/12/20/10/35 pts)
 */

import "dotenv/config"
import { PrismaClient } from "../lib/generated/prisma"

const prisma = new PrismaClient()

// ─── Colours ─────────────────────────────────────────────────────────────────

const PASS  = "\x1b[32m✓\x1b[0m"
const FAIL  = "\x1b[31m✗\x1b[0m"
const INFO  = "\x1b[36m·\x1b[0m"
const TEST_TAG = "ft__"

let failures = 0

function assert(ok: boolean, msg: string) {
  console.log(`  ${ok ? PASS : FAIL} ${msg}`)
  if (!ok) failures++
}
function header(t: string) { console.log(`\n\x1b[1m── ${t} ──\x1b[0m`) }
function info(m: string)   { console.log(`  ${INFO} ${m}`) }

// ─── Scoring constants ────────────────────────────────────────────────────────

const STANDING_PTS: Record<number, number> = { 1: 1, 2: 1, 3: 1, 4: 1 }
const THIRD_PLACE_PTS = 1        // per correctly predicted advancing 3rd-place group
const KO_MAX = 3*16 + 6*8 + 12*4 + 25*2 + 10*1 + 60*1  // 264 (SF=25, FINAL=60)
const GROUP_MATCH_MAX = 72       // 72 matches × 1 pt

// ─── Scoring engine ───────────────────────────────────────────────────────────

async function recalcPrediction(predId: string): Promise<void> {
  const allMatchPreds = await prisma.matchPrediction.findMany({
    where: { predictionId: predId },
    select: { pointsEarned: true, matchId: true },
  })
  const matchScore      = allMatchPreds.reduce((s, r) => s + r.pointsEarned, 0)
  const { _sum: ss }    = await prisma.groupStandingPrediction.aggregate({ where: { predictionId: predId }, _sum: { pointsEarned: true } })
  const { _sum: ts }    = await prisma.thirdPlacePrediction.aggregate({ where: { predictionId: predId }, _sum: { pointsEarned: true } })
  const totalScore      = matchScore + (ss.pointsEarned ?? 0) + (ts.pointsEarned ?? 0)

  // matchAccuracy = correct group picks / group picks with results
  const scoredGroupIds = await prisma.match
    .findMany({ where: { stage: "GROUP", homeScore: { not: null } }, select: { id: true } })
    .then(rows => new Set(rows.map(r => r.id)))
  const groupPicks = allMatchPreds.filter(p => scoredGroupIds.has(p.matchId))
  const correctGroup   = groupPicks.filter(p => p.pointsEarned > 0).length
  const matchAccuracy  = groupPicks.length > 0 ? (correctGroup / groupPicks.length) * 100 : 0

  await prisma.prediction.update({ where: { id: predId }, data: { totalScore, matchAccuracy } })
}

async function scoreMatchBatch(matchIds: string[]): Promise<void> {
  if (!matchIds.length) return
  const matches = await prisma.match.findMany({
    where: { id: { in: matchIds }, homeScore: { not: null } },
    select: { id: true, winnerId: true, isDraw: true, pointsAvailable: true },
  })
  for (const m of matches) {
    const preds = await prisma.matchPrediction.findMany({
      where: { matchId: m.id },
      select: { id: true, predictedWinnerId: true, isDraw: true },
    })
    for (const pred of preds) {
      const correct = m.isDraw ? pred.isDraw : (!m.isDraw && m.winnerId && pred.predictedWinnerId === m.winnerId)
      await prisma.matchPrediction.update({ where: { id: pred.id }, data: { pointsEarned: correct ? m.pointsAvailable : 0 } })
    }
  }
  const affectedPredIds = await prisma.matchPrediction
    .findMany({ where: { matchId: { in: matchIds } }, select: { predictionId: true }, distinct: ["predictionId"] })
    .then(rows => rows.map(r => r.predictionId))
  for (const id of affectedPredIds) await recalcPrediction(id)
}

async function scoreGroupStandings(
  standings: Map<string, { teamId: string; position: number }[]>
): Promise<void> {
  const affectedPredIds = new Set<string>()
  for (const [groupId, ranked] of standings) {
    const actualPos = new Map(ranked.map(r => [r.teamId, r.position]))
    const preds = await prisma.groupStandingPrediction.findMany({ where: { groupId } })
    for (const pred of preds) {
      const actual = actualPos.get(pred.teamId)
      const pts = actual === pred.predictedPosition ? (STANDING_PTS[pred.predictedPosition] ?? 0) : 0
      await prisma.groupStandingPrediction.update({ where: { id: pred.id }, data: { pointsEarned: pts } })
      affectedPredIds.add(pred.predictionId)
    }
  }
  for (const id of affectedPredIds) await recalcPrediction(id)
}

async function scoreThirdPlacePredictions(advancingGroupIds: Set<string>): Promise<void> {
  const preds = await prisma.thirdPlacePrediction.findMany()
  for (const pred of preds) {
    const pts = advancingGroupIds.has(pred.groupId) ? THIRD_PLACE_PTS : 0
    await prisma.thirdPlacePrediction.update({ where: { id: pred.id }, data: { pointsEarned: pts } })
  }
  const affectedPredIds = [...new Set(preds.map(p => p.predictionId))]
  for (const id of affectedPredIds) await recalcPrediction(id)
}

// ─── Group standings computation ──────────────────────────────────────────────

type TeamStat = {
  teamId: string; code: string; pts: number; gf: number; ga: number; gd: number
  wins: number; losses: number
}

async function computeGroupStandings(
  groups: { id: string; letter: string; teams: { teamId: string; team: { code: string } }[] }[],
  matchResults: { homeTeamId: string | null; awayTeamId: string | null; winnerId: string | null; isDraw: boolean | null }[]
): Promise<Map<string, { teamId: string; position: number }[]>> {
  const result = new Map<string, { teamId: string; position: number }[]>()

  for (const g of groups) {
    const stats = new Map<string, TeamStat>()
    for (const gt of g.teams) {
      stats.set(gt.teamId, { teamId: gt.teamId, code: gt.team.code, pts: 0, gf: 0, ga: 0, gd: 0, wins: 0, losses: 0 })
    }

    for (const m of matchResults) {
      const h = m.homeTeamId && stats.has(m.homeTeamId) ? m.homeTeamId : null
      const a = m.awayTeamId && stats.has(m.awayTeamId) ? m.awayTeamId : null
      if (!h || !a) continue

      const hs = stats.get(h)!
      const as_ = stats.get(a)!
      // all results are 1-0 home wins in our simulation
      hs.pts += 3; hs.gf += 1; hs.ga += 0; hs.gd += 1; hs.wins++
      as_.pts += 0; as_.gf += 0; as_.ga += 1; as_.gd -= 1; as_.losses++
    }

    // Sort: pts → GD → GF → code alphabetical
    const sorted = [...stats.values()].sort((a, b) =>
      b.pts !== a.pts ? b.pts - a.pts :
      b.gd  !== a.gd  ? b.gd  - a.gd  :
      b.gf  !== a.gf  ? b.gf  - a.gf  :
      a.code.localeCompare(b.code)
    )

    // Handle head-to-head tie for teams with identical pts/GD/GF
    // (simplified: no head-to-head lookup — code order used as tiebreaker)
    result.set(g.id, sorted.map((s, i) => ({ teamId: s.teamId, position: i + 1 })))
  }

  return result
}

// ─── KO bracket helpers ───────────────────────────────────────────────────────

const GROUP_PAIRS: [string, string][] = [
  ["A","B"],["C","D"],["E","F"],["G","H"],["I","J"],["K","L"],
]

function buildR32Seedings(
  groupStandings: Map<string, { teamId: string; position: number }[]>,
  groupByLetter: Map<string, string>,   // letter → groupId
  advancing3rd: { teamId: string; code: string }[]  // sorted alphabetically by code
): { home: string; away: string }[] {  // 16 R32 slots
  function pick(letter: string, pos: number): string {
    const gId = groupByLetter.get(letter)!
    const ranked = groupStandings.get(gId)!
    return ranked.find(r => r.position === pos)!.teamId
  }

  const slots: { home: string; away: string }[] = []
  for (const [g1, g2] of GROUP_PAIRS) {
    slots.push({ home: pick(g1, 1), away: pick(g2, 2) })
    slots.push({ home: pick(g2, 1), away: pick(g1, 2) })
  }
  // 4 3rd-place matchups (paired sequentially)
  for (let i = 0; i < 4; i++) {
    slots.push({
      home: advancing3rd[i * 2]?.teamId ?? "",
      away: advancing3rd[i * 2 + 1]?.teamId ?? "",
    })
  }
  return slots
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

async function cleanup(
  testUserIds: string[],
  simulatedMatchIds: string[]   // group + KO matches we set results on
): Promise<void> {
  header("Cleanup")

  // Restore all match results and team assignments set during simulation
  if (simulatedMatchIds.length) {
    await prisma.match.updateMany({
      where: { id: { in: simulatedMatchIds } },
      data: { homeScore: null, awayScore: null, isDraw: null, winnerId: null },
    })
    // Also clear homeTeamId/awayTeamId we set on KO matches
    const koIds = simulatedMatchIds.filter(id => !groupMatchIds.has(id))
    if (koIds.length) {
      await prisma.match.updateMany({
        where: { id: { in: koIds } },
        data: { homeTeamId: null, awayTeamId: null },
      })
    }
    // Reset pointsEarned on match predictions
    await prisma.matchPrediction.updateMany({
      where: { matchId: { in: simulatedMatchIds } },
      data: { pointsEarned: 0 },
    })
  }

  const preds = await prisma.prediction.findMany({
    where: { userId: { in: testUserIds } },
    select: { id: true },
  })
  const predIds = preds.map(p => p.id)
  if (predIds.length) {
    await prisma.leagueMembership.deleteMany({ where: { predictionId: { in: predIds } } })
    await prisma.matchPrediction.deleteMany({ where: { predictionId: { in: predIds } } })
    await prisma.groupStandingPrediction.deleteMany({ where: { predictionId: { in: predIds } } })
    await prisma.thirdPlacePrediction.deleteMany({ where: { predictionId: { in: predIds } } })
    await prisma.prediction.deleteMany({ where: { id: { in: predIds } } })
  }
  await prisma.user.deleteMany({ where: { id: { in: testUserIds } } })

  info(`Deleted ${testUserIds.length} test users, ${predIds.length} predictions`)
  info(`Restored ${simulatedMatchIds.length} match results`)
}

// Group match IDs collected during simulation (for cleanup scope)
const groupMatchIds = new Set<string>()

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n\x1b[1mBola2026 Full-Tournament Integration Test\x1b[0m")
  console.log("=".repeat(55))

  // ── PRE-FLIGHT ────────────────────────────────────────────────────────────

  header("Pre-flight")

  const tournament = await prisma.tournament.findUnique({ where: { year: 2026 } })
  assert(!!tournament, "Tournament 2026 exists")

  const groups = await prisma.tournamentGroup.findMany({
    include: { teams: { include: { team: { select: { id: true, code: true } } } } },
    orderBy: { letter: "asc" },
  })
  assert(groups.length === 12, `12 groups loaded (got ${groups.length})`)
  assert(groups.every(g => g.teams.length === 4), "Each group has 4 teams")

  const groupByLetter = new Map(groups.map(g => [g.letter, g.id]))
  const groupById     = new Map(groups.map(g => [g.id, g]))

  const allGroupMatches = await prisma.match.findMany({
    where: { stage: "GROUP" },
    include: {
      homeTeam: { select: { id: true, code: true } },
      awayTeam: { select: { id: true, code: true } },
    },
    orderBy: { kickoff: "asc" },
  })
  assert(allGroupMatches.length === 72, `72 group matches loaded (got ${allGroupMatches.length})`)

  const allKOMatches = await prisma.match.findMany({
    where: { stage: { in: ["R32","R16","QF","SF","THIRD_PLACE","FINAL"] } },
    orderBy: [{ kickoff: "asc" }, { matchNumber: "asc" }],
  })
  assert(allKOMatches.length === 32, `32 KO matches loaded (got ${allKOMatches.length})`)

  const koByStage = new Map<string, typeof allKOMatches>()
  for (const m of allKOMatches) {
    if (!koByStage.has(m.stage)) koByStage.set(m.stage, [])
    koByStage.get(m.stage)!.push(m)
  }

  if (!tournament) { await prisma.$disconnect(); process.exit(1) }

  // ── SIMULATE GROUP STAGE ──────────────────────────────────────────────────

  header("Simulating group stage (72 matches, home wins 1-0)")

  const simulatedMatchIds: string[] = []

  for (const m of allGroupMatches) {
    if (!m.homeTeamId || !m.awayTeamId) {
      info(`SKIP match ${m.matchNumber} — no teams assigned yet`)
      continue
    }
    await prisma.match.update({
      where: { id: m.id },
      data: { homeScore: 1, awayScore: 0, isDraw: false, winnerId: m.homeTeamId },
    })
    simulatedMatchIds.push(m.id)
    groupMatchIds.add(m.id)
  }
  assert(simulatedMatchIds.length === 72, `All 72 group results set (got ${simulatedMatchIds.length})`)

  // ── COMPUTE GROUP STANDINGS ───────────────────────────────────────────────

  header("Computing group standings")

  const matchResults = allGroupMatches.map(m => ({
    homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId,
    winnerId: m.homeTeamId, isDraw: false,
  }))

  const groupStandings = await computeGroupStandings(groups, matchResults)

  // Determine actual standings for display
  let standingsMaxPts = 0
  for (const [groupId, ranked] of groupStandings) {
    const letter = groupById.get(groupId)!.letter
    const orderedCodes = ranked
      .sort((a, b) => a.position - b.position)
      .map(r => {
        const team = groupById.get(groupId)!.teams.find(t => t.teamId === r.teamId)
        return team?.team.code ?? "?"
      })
    standingsMaxPts += ranked.reduce((s, r) => s + (STANDING_PTS[r.position] ?? 0), 0)
    info(`Group ${letter}: ${orderedCodes.join(" > ")}`)
  }
  assert(standingsMaxPts === 48, `Max standings pts = 48 (got ${standingsMaxPts})`)

  // ── DETERMINE 3RD-PLACE ADVANCING TEAMS ──────────────────────────────────

  header("Determining 8 advancing 3rd-place teams")

  // All 3rd-place teams have identical stats (1W, 2L, 1GF, 2GA).
  // Tiebreaker: alphabetical by team code.
  const thirdPlaceTeams: { groupId: string; teamId: string; code: string }[] = []
  for (const [groupId, ranked] of groupStandings) {
    const third = ranked.find(r => r.position === 3)!
    const group = groupById.get(groupId)!
    const team = group.teams.find(t => t.teamId === third.teamId)!
    thirdPlaceTeams.push({ groupId, teamId: third.teamId, code: team.team.code })
  }
  thirdPlaceTeams.sort((a, b) => a.code.localeCompare(b.code))
  const advancing3rd = thirdPlaceTeams.slice(0, 8)
  const notAdvancing3rd = thirdPlaceTeams.slice(8)
  const advancing3rdGroupIds = new Set(advancing3rd.map(t => t.groupId))
  const tpMaxPts = advancing3rd.length * THIRD_PLACE_PTS

  info(`Advancing 3rd (alphabetical): ${advancing3rd.map(t => t.code).join(", ")}`)
  info(`Not advancing: ${notAdvancing3rd.map(t => t.code).join(", ")}`)
  assert(advancing3rd.length === 8, `Exactly 8 3rd-place teams advancing (got ${advancing3rd.length})`)
  assert(tpMaxPts === 8, `3rd-place max pts = 8 (got ${tpMaxPts})`)

  // ── SIMULATE KO BRACKET ───────────────────────────────────────────────────

  header("Simulating KO bracket (32 matches, home wins)")

  const r32Slots = buildR32Seedings(groupStandings, groupByLetter, advancing3rd)
  const r32 = koByStage.get("R32")!
  assert(r32.length === 16, `16 R32 matches (got ${r32.length})`)

  // Assign teams to R32 and set results
  const koWinnerMap = new Map<string, string>()   // matchId → winning teamId
  const koLoserMap  = new Map<string, string>()   // matchId → losing teamId

  for (let i = 0; i < r32.length; i++) {
    const m = r32[i]
    const slot = r32Slots[i]
    if (!slot?.home || !slot?.away) { info(`SKIP R32 slot ${i} — missing team`); continue }
    await prisma.match.update({
      where: { id: m.id },
      data: {
        homeTeamId: slot.home, awayTeamId: slot.away,
        homeScore: 1, awayScore: 0, isDraw: false, winnerId: slot.home,
      },
    })
    koWinnerMap.set(m.id, slot.home)
    koLoserMap.set(m.id, slot.away)
    simulatedMatchIds.push(m.id)
  }
  info(`R32: ${r32.length} matches assigned and scored`)

  // For each subsequent round: winner of match 2i and 2i+1 → next round match i
  async function simulateRound(
    feeders: typeof allKOMatches,
    roundMatches: typeof allKOMatches,
    stage: string
  ) {
    for (let i = 0; i < roundMatches.length; i++) {
      const m = roundMatches[i]
      const home = koWinnerMap.get(feeders[i * 2]?.id ?? "")
      const away = koWinnerMap.get(feeders[i * 2 + 1]?.id ?? "")
      if (!home || !away) { info(`SKIP ${stage} slot ${i} — missing feeder winner`); continue }
      await prisma.match.update({
        where: { id: m.id },
        data: { homeTeamId: home, awayTeamId: away, homeScore: 1, awayScore: 0, isDraw: false, winnerId: home },
      })
      koWinnerMap.set(m.id, home)
      koLoserMap.set(m.id, away)
      simulatedMatchIds.push(m.id)
    }
    info(`${stage}: ${roundMatches.length} matches assigned and scored`)
  }

  const r16   = koByStage.get("R16")!
  const qf    = koByStage.get("QF")!
  const sf    = koByStage.get("SF")!
  const tp    = koByStage.get("THIRD_PLACE")!
  const final = koByStage.get("FINAL")!

  await simulateRound(r32, r16, "R16")
  await simulateRound(r16, qf, "QF")
  await simulateRound(qf, sf, "SF")

  // Third place: losers of SF
  const tpMatch = tp[0]
  const tpHome = koLoserMap.get(sf[0]?.id ?? "")
  const tpAway = koLoserMap.get(sf[1]?.id ?? "")
  if (tpHome && tpAway) {
    await prisma.match.update({
      where: { id: tpMatch.id },
      data: { homeTeamId: tpHome, awayTeamId: tpAway, homeScore: 1, awayScore: 0, isDraw: false, winnerId: tpHome },
    })
    koWinnerMap.set(tpMatch.id, tpHome)
    simulatedMatchIds.push(tpMatch.id)
    info(`THIRD_PLACE: 1 match assigned and scored`)
  }

  // Final: winners of SF
  const finalMatch = final[0]
  const finHome = koWinnerMap.get(sf[0]?.id ?? "")
  const finAway = koWinnerMap.get(sf[1]?.id ?? "")
  if (finHome && finAway) {
    await prisma.match.update({
      where: { id: finalMatch.id },
      data: { homeTeamId: finHome, awayTeamId: finAway, homeScore: 1, awayScore: 0, isDraw: false, winnerId: finHome },
    })
    koWinnerMap.set(finalMatch.id, finHome)
    simulatedMatchIds.push(finalMatch.id)
    info(`FINAL: 1 match assigned and scored`)
  }

  assert(simulatedMatchIds.length === 104, `All 104 matches simulated (got ${simulatedMatchIds.length})`)

  // Maximum possible score
  const maxScore = GROUP_MATCH_MAX + standingsMaxPts + tpMaxPts + KO_MAX
  info(`Max possible score: ${GROUP_MATCH_MAX} + ${standingsMaxPts} + ${tpMaxPts} + ${KO_MAX} = ${maxScore} pts`)

  // ── CREATE TEST USERS & PREDICTIONS ──────────────────────────────────────

  header("Creating 10 test users × 2 predictions")

  // Three prediction archetypes:
  //   PERFECT   — home picks, correct standings, correct 3rd-place, correct KO (all home)
  //   WRONG_GRP — away picks for group (wrong), correct standings, correct 3rd-place, correct KO
  //   WRONG_KO  — home picks (correct), correct standings, correct 3rd-place, away KO picks (wrong)
  //
  // Score relationships:
  //   PERFECT   = GROUP_MATCH_MAX + standingsMaxPts + tpMaxPts + KO_MAX = maxScore
  //   WRONG_GRP = 0               + standingsMaxPts + tpMaxPts + KO_MAX = maxScore - 72
  //   WRONG_KO  = GROUP_MATCH_MAX + standingsMaxPts + tpMaxPts + 0      = maxScore - KO_MAX

  const testUserIds: string[] = []

  // Maps predictionId → expected { totalScore, accuracy }
  const predExpected = new Map<string, { totalScore: number; accuracy: number }>()

  type Archetype = "PERFECT" | "WRONG_GRP" | "WRONG_KO"
  const ARCHETYPE_CONFIG: Record<Archetype, { score: number; accuracy: number }> = {
    PERFECT:   { score: maxScore,        accuracy: 100 },
    WRONG_GRP: { score: maxScore -  72,  accuracy:   0 },
    WRONG_KO:  { score: maxScore - KO_MAX,  accuracy: 100 },
  }

  // Assignment: 10 users × 2 archetypes
  const USER_ARCHETYPES: [Archetype, Archetype][] = [
    ["PERFECT",   "WRONG_GRP"],   // user 1
    ["PERFECT",   "WRONG_GRP"],   // user 2
    ["PERFECT",   "WRONG_GRP"],   // user 3
    ["PERFECT",   "WRONG_GRP"],   // user 4
    ["PERFECT",   "WRONG_GRP"],   // user 5
    ["PERFECT",   "WRONG_KO" ],   // user 6
    ["PERFECT",   "WRONG_KO" ],   // user 7
    ["PERFECT",   "WRONG_KO" ],   // user 8
    ["WRONG_GRP", "WRONG_KO" ],   // user 9
    ["WRONG_GRP", "WRONG_KO" ],   // user 10
  ]

  // Helpers for inserting predictions
  async function insertGroupPicks(predId: string, archetype: Archetype) {
    const picks = []
    for (const m of allGroupMatches) {
      if (!m.homeTeamId || !m.awayTeamId) continue
      const isWrongGrp = archetype === "WRONG_GRP"
      picks.push({
        predictionId: predId,
        matchId: m.id,
        predictedWinnerId: isWrongGrp ? m.awayTeamId : m.homeTeamId,
        isDraw: false,
      })
    }
    await prisma.matchPrediction.createMany({ data: picks })
  }

  async function insertStandings(predId: string) {
    // All archetypes get CORRECT standings
    const rows = []
    for (const [groupId, ranked] of groupStandings) {
      for (const r of ranked) {
        rows.push({ predictionId: predId, groupId, teamId: r.teamId, predictedPosition: r.position })
      }
    }
    await prisma.groupStandingPrediction.createMany({ data: rows })
  }

  async function insertThirdPlace(predId: string) {
    // All archetypes pick the CORRECT advancing 8 groups
    const rows = [...advancing3rdGroupIds].map(groupId => ({ predictionId: predId, groupId }))
    await prisma.thirdPlacePrediction.createMany({ data: rows })
  }

  async function insertKOPicks(predId: string, archetype: Archetype) {
    const isWrongKO = archetype === "WRONG_KO"
    const picks = []
    for (const [matchId, winnerId] of koWinnerMap) {
      const loserId = koLoserMap.get(matchId)
      picks.push({
        predictionId: predId,
        matchId,
        predictedWinnerId: isWrongKO ? (loserId ?? null) : winnerId,
        isDraw: false,
      })
    }
    await prisma.matchPrediction.createMany({ data: picks })
  }

  for (let u = 0; u < 10; u++) {
    const userId = `ft-test-${String(u + 1).padStart(3, "0")}-0000-0000-000000000000`
    testUserIds.push(userId)
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, email: `${TEST_TAG}user${u + 1}@example.com`, displayName: `${TEST_TAG}User ${u + 1}` },
    })

    for (const [pIdx, archetype] of USER_ARCHETYPES[u].entries()) {
      const pred = await prisma.prediction.create({
        data: { userId, tournamentId: tournament.id, name: `${TEST_TAG}P${pIdx + 1}` },
      })
      await insertGroupPicks(pred.id, archetype)
      await insertStandings(pred.id)
      await insertThirdPlace(pred.id)
      await insertKOPicks(pred.id, archetype)
      predExpected.set(pred.id, ARCHETYPE_CONFIG[archetype])
    }
  }

  const predCount = await prisma.prediction.count({ where: { name: { startsWith: TEST_TAG } } })
  assert(predCount === 20, `20 test predictions created (got ${predCount})`)
  info(`Users: 5×(PERFECT+WRONG_GRP) + 3×(PERFECT+WRONG_KO) + 2×(WRONG_GRP+WRONG_KO)`)

  // ── RUN SCORING ───────────────────────────────────────────────────────────

  header("Running full scoring pipeline")

  // Group matches
  await scoreMatchBatch([...groupMatchIds])
  info(`Group match scoring done (72 matches)`)

  // Group standings
  await scoreGroupStandings(groupStandings)
  info(`Group standings scoring done (12 groups × 4 teams)`)

  // Third place
  await scoreThirdPlacePredictions(advancing3rdGroupIds)
  info(`Third-place scoring done (8 advancing groups × ${THIRD_PLACE_PTS} pts)`)

  // KO matches
  const koMatchIds = allKOMatches.map(m => m.id)
  await scoreMatchBatch(koMatchIds)
  info(`KO bracket scoring done (32 matches)`)

  // ── VERIFY ────────────────────────────────────────────────────────────────

  header("Verifying all 20 predictions")

  const testPreds = await prisma.prediction.findMany({
    where: { name: { startsWith: TEST_TAG } },
    orderBy: [{ userId: "asc" }, { name: "asc" }],
  })

  let checked = 0
  for (const pred of testPreds) {
    const expected = predExpected.get(pred.id)
    if (!expected) continue
    const uNum  = testUserIds.indexOf(pred.userId) + 1
    const pNum  = pred.name.endsWith("1") ? 1 : 2
    const label = `User${uNum} P${pNum}`

    assert(
      pred.totalScore === expected.score,
      `${label}: totalScore = ${expected.score} (got ${pred.totalScore})`
    )
    assert(
      Math.round(pred.matchAccuracy) === expected.accuracy,
      `${label}: matchAccuracy = ${expected.accuracy}% (got ${Math.round(pred.matchAccuracy)}%)`
    )
    checked++
  }
  info(`Checked ${checked} predictions`)

  // ── CROSS-CHECKS ──────────────────────────────────────────────────────────

  header("Cross-checks")

  // Verify score relationships
  const perfectScore   = testPreds.find(p => predExpected.get(p.id)?.score === maxScore)?.totalScore
  const wrongGrpScore  = testPreds.find(p => predExpected.get(p.id)?.score === maxScore - 72)?.totalScore
  const wrongKOScore   = testPreds.find(p => predExpected.get(p.id)?.score === maxScore - KO_MAX)?.totalScore

  assert(perfectScore  === maxScore,        `PERFECT total = ${maxScore} (got ${perfectScore})`)
  assert(wrongGrpScore === maxScore - 72,   `WRONG_GRP total = maxScore - 72 (got ${wrongGrpScore})`)
  assert(wrongKOScore  === maxScore - KO_MAX,  `WRONG_KO total = maxScore - KO_MAX (got ${wrongKOScore})`)
  assert((perfectScore ?? 0) - (wrongGrpScore ?? 0) === 72,  `PERFECT - WRONG_GRP = 72 group pts`)
  assert((perfectScore ?? 0) - (wrongKOScore  ?? 0) === KO_MAX, `PERFECT - WRONG_KO = ${KO_MAX} KO pts`)

  // Count archetypes
  const perfectCount  = testPreds.filter(p => predExpected.get(p.id)?.score === maxScore).length
  const wrongGrpCount = testPreds.filter(p => predExpected.get(p.id)?.score === maxScore - 72).length
  const wrongKOCount  = testPreds.filter(p => predExpected.get(p.id)?.score === maxScore - KO_MAX).length
  assert(perfectCount  === 8,  `8 PERFECT predictions (got ${perfectCount})`)
  assert(wrongGrpCount === 7,  `7 WRONG_GRP predictions (got ${wrongGrpCount})`)
  assert(wrongKOCount  === 5,  `5 WRONG_KO predictions (got ${wrongKOCount})`)

  // Score breakdown validation (PERFECT pred)
  const perfectPred = testPreds.find(p => predExpected.get(p.id)?.score === maxScore)
  if (perfectPred) {
    const groupPts    = await prisma.matchPrediction.aggregate({
      where: { predictionId: perfectPred.id, match: { stage: "GROUP" } },
      _sum: { pointsEarned: true },
    })
    const koPts       = await prisma.matchPrediction.aggregate({
      where: { predictionId: perfectPred.id, match: { stage: { in: ["R32","R16","QF","SF","THIRD_PLACE","FINAL"] } } },
      _sum: { pointsEarned: true },
    })
    const standPts    = await prisma.groupStandingPrediction.aggregate({
      where: { predictionId: perfectPred.id }, _sum: { pointsEarned: true },
    })
    const tpPts       = await prisma.thirdPlacePrediction.aggregate({
      where: { predictionId: perfectPred.id }, _sum: { pointsEarned: true },
    })
    assert(groupPts._sum.pointsEarned === 72,                          `PERFECT group sub-score = 72 (got ${groupPts._sum.pointsEarned})`)
    assert(koPts._sum.pointsEarned    === KO_MAX,                      `PERFECT KO sub-score = ${KO_MAX} (got ${koPts._sum.pointsEarned})`)
    assert(standPts._sum.pointsEarned === standingsMaxPts,             `PERFECT standings sub-score = ${standingsMaxPts} (got ${standPts._sum.pointsEarned})`)
    assert(tpPts._sum.pointsEarned    === tpMaxPts,                    `PERFECT 3rd-place sub-score = ${tpMaxPts} (got ${tpPts._sum.pointsEarned})`)
    info(`Score breakdown: ${groupPts._sum.pointsEarned} + ${standPts._sum.pointsEarned} + ${tpPts._sum.pointsEarned} + ${koPts._sum.pointsEarned} = ${perfectPred.totalScore}`)
  }

  // ── SUMMARY ───────────────────────────────────────────────────────────────

  header("Summary")
  if (failures === 0) {
    console.log(`\n  ${PASS} All assertions passed!\n`)
  } else {
    console.log(`\n  ${FAIL} ${failures} assertion(s) failed!\n`)
  }

  // ── CLEANUP ───────────────────────────────────────────────────────────────

  await cleanup(testUserIds, simulatedMatchIds)

  // Final checks
  const remUsers = await prisma.user.count({ where: { id: { in: testUserIds } } })
  const remPreds = await prisma.prediction.count({ where: { name: { startsWith: TEST_TAG } } })
  const remScores = await prisma.match.count({
    where: { id: { in: simulatedMatchIds }, homeScore: { not: null } },
  })
  assert(remUsers  === 0, `Test users deleted (${remUsers} remaining)`)
  assert(remPreds  === 0, `Test predictions deleted (${remPreds} remaining)`)
  assert(remScores === 0, `Match results restored (${remScores} remaining)`)

  if (failures === 0) {
    console.log(`\n\x1b[1m\x1b[32m✓ Full-tournament integration test PASSED — database is clean\x1b[0m\n`)
  } else {
    console.log(`\n\x1b[1m\x1b[31m✗ Full-tournament test FAILED (${failures} failures)\x1b[0m\n`)
  }
}

main()
  .catch(async e => { console.error("\n\x1b[31mFatal:\x1b[0m", e.message); process.exit(1) })
  .finally(() => prisma.$disconnect())
