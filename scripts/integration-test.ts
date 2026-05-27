/**
 * Integration test: 10 users × 2 predictions, 3 simulated match days, scoring verification, cleanup.
 *
 * Run: npx tsx scripts/integration-test.ts
 *
 * The script is self-contained and safe to run against the local DB:
 *  - All test records are tagged with the TEST_TAG prefix on emails/names
 *  - A final cleanup pass deletes everything created here
 *  - It never touches existing (non-test) data
 */

import "dotenv/config"
import { PrismaClient } from "../lib/generated/prisma"

const prisma = new PrismaClient()

// ─── Constants ────────────────────────────────────────────────────────────────

const TEST_TAG = "test__"            // prefixed on every test email/name
const PASS = "\x1b[32m✓\x1b[0m"
const FAIL = "\x1b[31m✗\x1b[0m"
const INFO = "\x1b[36m·\x1b[0m"
const WARN = "\x1b[33m!\x1b[0m"

let failures = 0

// ─── Helpers ─────────────────────────────────────────────────────────────────

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ${PASS} ${msg}`)
  } else {
    console.log(`  ${FAIL} ${msg}`)
    failures++
  }
}

function header(title: string) {
  console.log(`\n\x1b[1m── ${title} ──\x1b[0m`)
}

// ─── Scoring engine ───────────────────────────────────────────────────────────
//
// This is the canonical scoring logic for this app.
// Group stage: 1 pt per correct result (home / draw / away).
// matchAccuracy on a Prediction = correct picks / picks with resolved matches * 100.
// totalScore = sum of all pointsEarned across all prediction sub-tables.

async function scoreMatchResults(matchIds: string[]) {
  if (matchIds.length === 0) return

  // Fetch matches with actual results
  const matches = await prisma.match.findMany({
    where: { id: { in: matchIds }, homeScore: { not: null } },
    select: { id: true, winnerId: true, isDraw: true, pointsAvailable: true },
  })

  for (const m of matches) {
    // Fetch all predictions for this match
    const preds = await prisma.matchPrediction.findMany({
      where: { matchId: m.id },
      select: { id: true, predictedWinnerId: true, isDraw: true },
    })

    for (const pred of preds) {
      let correct = false
      if (m.isDraw && pred.isDraw) correct = true
      else if (!m.isDraw && m.winnerId && pred.predictedWinnerId === m.winnerId) correct = true

      await prisma.matchPrediction.update({
        where: { id: pred.id },
        data: { pointsEarned: correct ? m.pointsAvailable : 0 },
      })
    }
  }

  // Recalculate totalScore + matchAccuracy for every affected prediction
  const affectedPredIds = await prisma.matchPrediction
    .findMany({ where: { matchId: { in: matchIds } }, select: { predictionId: true }, distinct: ["predictionId"] })
    .then((rows) => rows.map((r) => r.predictionId))

  for (const predId of affectedPredIds) {
    const allMatchPreds = await prisma.matchPrediction.findMany({
      where: { predictionId: predId },
      select: { pointsEarned: true, matchId: true },
    })

    // Sum all pointsEarned (match + standings + third-place, but only match is relevant here)
    const matchScore = allMatchPreds.reduce((s, r) => s + r.pointsEarned, 0)

    const standingsScore = await prisma.groupStandingPrediction
      .aggregate({ where: { predictionId: predId }, _sum: { pointsEarned: true } })
      .then((r) => r._sum.pointsEarned ?? 0)

    const thirdScore = await prisma.thirdPlacePrediction
      .aggregate({ where: { predictionId: predId }, _sum: { pointsEarned: true } })
      .then((r) => r._sum.pointsEarned ?? 0)

    const totalScore = matchScore + standingsScore + thirdScore

    // matchAccuracy: correct picks / picks across ALL group matches with a result
    // (not just the current batch — cumulative across every scored day)
    const allScoredGroupMatchIds = await prisma.match
      .findMany({ where: { stage: "GROUP", homeScore: { not: null } }, select: { id: true } })
      .then((rows) => new Set(rows.map((r) => r.id)))
    const picksWithResults = allMatchPreds.filter((p) => allScoredGroupMatchIds.has(p.matchId))
    const correctPicks = picksWithResults.filter((p) => p.pointsEarned > 0).length
    const matchAccuracy = picksWithResults.length > 0
      ? (correctPicks / picksWithResults.length) * 100
      : 0

    await prisma.prediction.update({
      where: { id: predId },
      data: { totalScore, matchAccuracy },
    })
  }
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

async function cleanup(testUserIds: string[], testMatchIds: string[]) {
  header("Cleanup")

  // Restore match results we set (set back to null)
  if (testMatchIds.length > 0) {
    await prisma.match.updateMany({
      where: { id: { in: testMatchIds } },
      data: { homeScore: null, awayScore: null, isDraw: null, winnerId: null },
    })

    // Also reset any pointsEarned on MatchPredictions for these matches
    await prisma.matchPrediction.updateMany({
      where: { matchId: { in: testMatchIds } },
      data: { pointsEarned: 0 },
    })
  }

  // Delete all test user data (cascades handle most child records)
  // Order: LeagueMembership → Prediction → User
  const preds = await prisma.prediction.findMany({
    where: { userId: { in: testUserIds } },
    select: { id: true },
  })
  const predIds = preds.map((p) => p.id)

  if (predIds.length > 0) {
    await prisma.leagueMembership.deleteMany({ where: { predictionId: { in: predIds } } })
    await prisma.matchPrediction.deleteMany({ where: { predictionId: { in: predIds } } })
    await prisma.groupStandingPrediction.deleteMany({ where: { predictionId: { in: predIds } } })
    await prisma.thirdPlacePrediction.deleteMany({ where: { predictionId: { in: predIds } } })
    await prisma.prediction.deleteMany({ where: { id: { in: predIds } } })
  }

  await prisma.user.deleteMany({ where: { id: { in: testUserIds } } })

  console.log(`  ${INFO} Deleted ${testUserIds.length} test users, ${predIds.length} predictions`)
  console.log(`  ${INFO} Restored ${testMatchIds.length} match results to null`)
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n\x1b[1mBola2026 Integration Test\x1b[0m")
  console.log("=".repeat(50))

  // ── 1. Verify prerequisite data ───────────────────────────────────────────

  header("Pre-flight check")

  const tournament = await prisma.tournament.findUnique({ where: { year: 2026 } })
  assert(!!tournament, "Tournament 2026 exists")

  const teamCount = await prisma.team.count()
  assert(teamCount >= 48, `Teams loaded (found ${teamCount})`)

  const matchCount = await prisma.match.count({ where: { stage: "GROUP" } })
  assert(matchCount >= 72, `Group matches loaded (found ${matchCount})`)

  // ── 2. Load the 6 first-3-day matches ────────────────────────────────────

  // Day 1: Jun 11, Day 2: Jun 12, Day 3: Jun 13
  const day1End = new Date("2026-06-12T00:00:00Z")
  const day2End = new Date("2026-06-13T00:00:00Z")
  const day3End = new Date("2026-06-14T00:00:00Z")

  const allEarlyMatches = await prisma.match.findMany({
    where: { stage: "GROUP", kickoff: { lt: day3End } },
    include: {
      homeTeam: { select: { id: true, code: true } },
      awayTeam: { select: { id: true, code: true } },
      group: { select: { letter: true } },
    },
    orderBy: { kickoff: "asc" },
  })

  assert(allEarlyMatches.length === 6, `Found 6 Day-1..3 matches (found ${allEarlyMatches.length})`)
  console.log("  Matches:")
  allEarlyMatches.forEach((m) => {
    const day = m.kickoff.toISOString().slice(0, 10)
    console.log(`    ${INFO} ${day} | ${m.homeTeam?.code ?? "?"} vs ${m.awayTeam?.code ?? "?"} | Group ${m.group?.letter}`)
  })

  // Simulated results (home, draw, away) for each match in kickoff order:
  //   MEX vs RSA   → MEX wins    (home)
  //   KOR vs CZE   → Draw        (draw)
  //   CAN vs BIH   → CAN wins    (home)
  //   USA vs PAR   → Draw        (draw)
  //   QAT vs SUI   → SUI wins    (away)
  //   BRA vs MAR   → BRA wins    (home)
  const RESULTS: Array<{ homeScore: number; awayScore: number; outcome: "home" | "draw" | "away" }> = [
    { homeScore: 2, awayScore: 1, outcome: "home" },
    { homeScore: 1, awayScore: 1, outcome: "draw" },
    { homeScore: 3, awayScore: 0, outcome: "home" },
    { homeScore: 0, awayScore: 0, outcome: "draw" },
    { homeScore: 0, awayScore: 2, outcome: "away" },
    { homeScore: 2, awayScore: 1, outcome: "home" },
  ]

  if (allEarlyMatches.length !== 6) {
    console.error("Expected exactly 6 early matches; cannot continue.")
    await prisma.$disconnect()
    process.exit(1)
  }

  const matchMeta = allEarlyMatches.map((m, i) => ({
    match: m,
    result: RESULTS[i],
  }))

  const day1Metas = matchMeta.filter((x) => x.match.kickoff < day1End)
  const day2Metas = matchMeta.filter((x) => x.match.kickoff >= day1End && x.match.kickoff < day2End)
  const day3Metas = matchMeta.filter((x) => x.match.kickoff >= day2End && x.match.kickoff < day3End)

  const testMatchIds = allEarlyMatches.map((m) => m.id)

  // ── 3. Create 10 test users + 2 predictions each ─────────────────────────

  header("Creating 10 test users × 2 predictions each")

  if (!tournament) { await prisma.$disconnect(); process.exit(1) }

  const testUserIds: string[] = []

  // Prediction pick patterns (indexed by match order in RESULTS):
  // "h"=home, "d"=draw, "a"=away
  // Correct pattern: ["h","d","h","d","a","h"]
  type Pick = "h" | "d" | "a"

  const CORRECT: Pick[] = ["h", "d", "h", "d", "a", "h"]

  // 10 users × 2 predictions — define pick patterns and expected correct counts
  // Format: [picks for P1, picks for P2]
  const USER_PATTERNS: Array<{ picks1: Pick[]; picks2: Pick[] }> = [
    // User 1: Perfect vs all wrong
    { picks1: ["h","d","h","d","a","h"], picks2: ["a","h","a","h","h","a"] },
    // User 2: 5 right vs 1 right (different miss)
    { picks1: ["h","d","h","d","h","h"], picks2: ["h","h","a","h","a","a"] },
    // User 3: 5 right vs 1 right (different miss)
    { picks1: ["h","d","h","h","a","h"], picks2: ["a","h","a","d","h","a"] },
    // User 4: 5 right vs 1 right (different miss)
    { picks1: ["h","h","h","d","a","h"], picks2: ["a","d","a","h","h","a"] },
    // User 5: 5 right vs 1 right (different miss)
    { picks1: ["h","d","a","d","a","h"], picks2: ["a","h","h","h","h","a"] },
    // User 6: 5 right vs 1 right (different miss)
    { picks1: ["a","d","h","d","a","h"], picks2: ["h","h","a","h","h","a"] },
    // User 7: 5 right vs 1 right (different miss)
    { picks1: ["h","d","h","d","a","a"], picks2: ["a","h","a","h","h","h"] },
    // User 8: Perfect vs 3 right (all home picks)
    { picks1: ["h","d","h","d","a","h"], picks2: ["h","h","h","h","h","h"] },
    // User 9: 2 right (only draws) vs 5 right
    { picks1: ["d","d","d","d","d","d"], picks2: ["h","d","h","d","h","h"] },
    // User 10: 6 right vs 1 right (all away)
    { picks1: ["h","d","h","d","a","h"], picks2: ["a","a","a","a","a","a"] },
  ]

  // Expected scores per prediction: count of indices where pattern matches CORRECT
  function expectedScore(picks: Pick[]): number {
    return picks.filter((p, i) => p === CORRECT[i]).length
  }
  function expectedAccuracy(picks: Pick[]): number {
    const total = picks.length
    const correct = expectedScore(picks)
    return total > 0 ? Math.round((correct / total) * 100) : 0
  }

  // Build prediction-to-picks map for assertions later
  const predExpected: Map<string, { score: number; accuracy: number }> = new Map()

  for (let u = 0; u < 10; u++) {
    const userId = `test-${String(u + 1).padStart(3, "0")}-00000000-0000-0000-0000-000000000000`
    testUserIds.push(userId)

    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: {
        id: userId,
        email: `${TEST_TAG}user${u + 1}@example.com`,
        displayName: `${TEST_TAG}User ${u + 1}`,
      },
    })

    const patterns = USER_PATTERNS[u]
    for (const [pIdx, picks] of [patterns.picks1, patterns.picks2].entries()) {
      const pred = await prisma.prediction.create({
        data: {
          userId,
          tournamentId: tournament.id,
          name: `${TEST_TAG}Prediction ${pIdx + 1}`,
        },
      })

      // Insert MatchPredictions for all 6 matches
      for (let mIdx = 0; mIdx < matchMeta.length; mIdx++) {
        const { match } = matchMeta[mIdx]
        const pick = picks[mIdx]
        const isDraw = pick === "d"
        const predictedWinnerId = pick === "h"
          ? (match.homeTeam?.id ?? null)
          : pick === "a"
          ? (match.awayTeam?.id ?? null)
          : null

        await prisma.matchPrediction.create({
          data: {
            predictionId: pred.id,
            matchId: match.id,
            predictedWinnerId,
            isDraw,
          },
        })
      }

      // Expected score (after all 6 matches resolved)
      predExpected.set(pred.id, {
        score: expectedScore(picks),
        accuracy: expectedAccuracy(picks),
      })
    }
  }

  const predCount = await prisma.prediction.count({
    where: { name: { startsWith: TEST_TAG } },
  })
  assert(predCount === 20, `Created 20 test predictions (found ${predCount})`)
  console.log(`  ${INFO} 10 users created, 2 predictions each (20 total)`)

  // ── 4. Day 1 ─────────────────────────────────────────────────────────────

  header("Day 1 — setting results & scoring")

  for (const { match, result } of day1Metas) {
    const winnerId = result.outcome === "home"
      ? match.homeTeam?.id ?? null
      : result.outcome === "away"
      ? match.awayTeam?.id ?? null
      : null

    await prisma.match.update({
      where: { id: match.id },
      data: {
        homeScore: result.homeScore,
        awayScore: result.awayScore,
        isDraw: result.outcome === "draw",
        winnerId,
      },
    })
    console.log(`  ${INFO} Result set: ${match.homeTeam?.code} ${result.homeScore}–${result.awayScore} ${match.awayTeam?.code} (${result.outcome})`)
  }

  await scoreMatchResults(day1Metas.map((x) => x.match.id))
  console.log(`  ${INFO} Scores recalculated for Day 1`)

  // Spot-check: User 1 P1 should have 1pt (home=correct), P2 should have 0pt
  const [u1p1Day1, u1p2Day1] = await Promise.all([
    prisma.prediction.findFirst({ where: { userId: testUserIds[0], name: `${TEST_TAG}Prediction 1` } }),
    prisma.prediction.findFirst({ where: { userId: testUserIds[0], name: `${TEST_TAG}Prediction 2` } }),
  ])
  assert(u1p1Day1?.totalScore === 1, `User1 P1 score after Day 1 = 1 (got ${u1p1Day1?.totalScore})`)
  assert(u1p2Day1?.totalScore === 0, `User1 P2 score after Day 1 = 0 (got ${u1p2Day1?.totalScore})`)

  // ── 5. Day 2 ─────────────────────────────────────────────────────────────

  header("Day 2 — setting results & scoring")

  for (const { match, result } of day2Metas) {
    const winnerId = result.outcome === "home"
      ? match.homeTeam?.id ?? null
      : result.outcome === "away"
      ? match.awayTeam?.id ?? null
      : null

    await prisma.match.update({
      where: { id: match.id },
      data: {
        homeScore: result.homeScore,
        awayScore: result.awayScore,
        isDraw: result.outcome === "draw",
        winnerId,
      },
    })
    console.log(`  ${INFO} Result set: ${match.homeTeam?.code} ${result.homeScore}–${result.awayScore} ${match.awayTeam?.code} (${result.outcome})`)
  }

  await scoreMatchResults(day2Metas.map((x) => x.match.id))
  console.log(`  ${INFO} Scores recalculated for Day 2`)

  // User 1 P1 (perfect): 3 correct (match 1 home, match 2 draw, match 3 home)
  // User 1 P2 (all wrong): 0 correct
  const [u1p1Day2, u1p2Day2] = await Promise.all([
    prisma.prediction.findFirst({ where: { userId: testUserIds[0], name: `${TEST_TAG}Prediction 1` } }),
    prisma.prediction.findFirst({ where: { userId: testUserIds[0], name: `${TEST_TAG}Prediction 2` } }),
  ])
  assert(u1p1Day2?.totalScore === 3, `User1 P1 score after Day 2 = 3 (got ${u1p1Day2?.totalScore})`)
  assert(u1p2Day2?.totalScore === 0, `User1 P2 score after Day 2 = 0 (got ${u1p2Day2?.totalScore})`)

  // User 9 P1 (all draws): 2 correct so far (draws on matches 2,4 - but match 4 is day 3)
  // Only match 2 (draw) resolved so far → 1 pt
  const u9p1Day2 = await prisma.prediction.findFirst({
    where: { userId: testUserIds[8], name: `${TEST_TAG}Prediction 1` },
  })
  assert(u9p1Day2?.totalScore === 1, `User9 P1 score after Day 2 = 1 (got ${u9p1Day2?.totalScore})`)

  // ── 6. Day 3 ─────────────────────────────────────────────────────────────

  header("Day 3 — setting results & scoring")

  for (const { match, result } of day3Metas) {
    const winnerId = result.outcome === "home"
      ? match.homeTeam?.id ?? null
      : result.outcome === "away"
      ? match.awayTeam?.id ?? null
      : null

    await prisma.match.update({
      where: { id: match.id },
      data: {
        homeScore: result.homeScore,
        awayScore: result.awayScore,
        isDraw: result.outcome === "draw",
        winnerId,
      },
    })
    console.log(`  ${INFO} Result set: ${match.homeTeam?.code} ${result.homeScore}–${result.awayScore} ${match.awayTeam?.code} (${result.outcome})`)
  }

  await scoreMatchResults(day3Metas.map((x) => x.match.id))
  console.log(`  ${INFO} Scores recalculated for Day 3`)

  // ── 7. Full verification of all 20 predictions ───────────────────────────

  header("Full verification — all 20 predictions after Day 3")

  const testPredictions = await prisma.prediction.findMany({
    where: { name: { startsWith: TEST_TAG } },
    orderBy: [{ userId: "asc" }, { name: "asc" }],
  })

  let checkCount = 0
  for (const pred of testPredictions) {
    const expected = predExpected.get(pred.id)
    if (!expected) continue

    const userNum = testUserIds.indexOf(pred.userId) + 1
    const predNum = pred.name.endsWith("1") ? 1 : 2
    const label = `User${userNum} P${predNum}`

    assert(
      pred.totalScore === expected.score,
      `${label}: totalScore = ${expected.score} (got ${pred.totalScore})`
    )
    assert(
      Math.round(pred.matchAccuracy) === expected.accuracy,
      `${label}: matchAccuracy = ${expected.accuracy}% (got ${Math.round(pred.matchAccuracy)}%)`
    )
    checkCount++
  }

  console.log(`  ${INFO} Checked ${checkCount} predictions`)

  // ── 8. Scoring edge-case checks ──────────────────────────────────────────

  header("Edge case checks")

  // User 8 P2: all home picks → correct on matches 1,3,6 (3 home wins), wrong on 2,4,5
  // Expected score = 3, accuracy = 50%
  const u8p2 = await prisma.prediction.findFirst({
    where: { userId: testUserIds[7], name: `${TEST_TAG}Prediction 2` },
  })
  assert(u8p2?.totalScore === 3, `All-home picks score = 3 (got ${u8p2?.totalScore})`)
  assert(Math.round(u8p2?.matchAccuracy ?? 0) === 50, `All-home picks accuracy = 50% (got ${Math.round(u8p2?.matchAccuracy ?? 0)}%)`)

  // User 10 P2: all away picks → correct only on match 5 (QAT/SUI, away wins)
  const u10p2 = await prisma.prediction.findFirst({
    where: { userId: testUserIds[9], name: `${TEST_TAG}Prediction 2` },
  })
  assert(u10p2?.totalScore === 1, `All-away picks score = 1 (got ${u10p2?.totalScore})`)
  assert(Math.round(u10p2?.matchAccuracy ?? 0) === 17, `All-away picks accuracy = 17% (got ${Math.round(u10p2?.matchAccuracy ?? 0)}%)`)

  // User 9 P1: all draw picks → correct on matches 2 and 4 only (2 draws)
  const u9p1Final = await prisma.prediction.findFirst({
    where: { userId: testUserIds[8], name: `${TEST_TAG}Prediction 1` },
  })
  assert(u9p1Final?.totalScore === 2, `All-draw picks score = 2 (got ${u9p1Final?.totalScore})`)
  assert(Math.round(u9p1Final?.matchAccuracy ?? 0) === 33, `All-draw picks accuracy = 33% (got ${Math.round(u9p1Final?.matchAccuracy ?? 0)}%)`)

  // Perfect score: 6 pts, 100%  (User1 P1, User8 P1, User10 P1)
  const perfectPreds = testPredictions.filter((p) => p.totalScore === 6)
  assert(perfectPreds.length === 3, `Exactly 3 perfect predictions (got ${perfectPreds.length})`)

  // Zero score: 0 pts, 0%
  const zeroPreds = testPredictions.filter((p) => p.totalScore === 0)
  assert(zeroPreds.length === 1, `Exactly 1 zero-score prediction (got ${zeroPreds.length})`)

  // Score distribution (sanity check)
  const scoreMap: Record<number, number> = {}
  for (const p of testPredictions) {
    scoreMap[p.totalScore] = (scoreMap[p.totalScore] ?? 0) + 1
  }
  console.log(`  ${INFO} Score distribution:`, Object.entries(scoreMap).sort().map(([s, c]) => `${c}×${s}pts`).join(", "))

  // ── 9. Summary ────────────────────────────────────────────────────────────

  header("Summary")

  if (failures === 0) {
    console.log(`\n  ${PASS} All assertions passed!\n`)
  } else {
    console.log(`\n  ${FAIL} ${failures} assertion(s) failed!\n`)
  }

  // ── 10. Cleanup ───────────────────────────────────────────────────────────

  await cleanup(testUserIds, testMatchIds)

  // Final verification: no test data remains
  const remainingUsers = await prisma.user.count({ where: { id: { in: testUserIds } } })
  const remainingPreds = await prisma.prediction.count({ where: { name: { startsWith: TEST_TAG } } })
  const matchesWithScores = await prisma.match.count({
    where: { id: { in: testMatchIds }, homeScore: { not: null } },
  })

  assert(remainingUsers === 0, `All test users deleted (${remainingUsers} remaining)`)
  assert(remainingPreds === 0, `All test predictions deleted (${remainingPreds} remaining)`)
  assert(matchesWithScores === 0, `All match results restored to null (${matchesWithScores} remaining)`)

  if (failures === 0) {
    console.log(`\n\x1b[1m\x1b[32m✓ Integration test PASSED — database is clean\x1b[0m\n`)
  } else {
    console.log(`\n\x1b[1m\x1b[31m✗ Integration test FAILED (${failures} failures)\x1b[0m\n`)
  }
}

main()
  .catch(async (e) => {
    console.error("\n\x1b[31mUnexpected error:\x1b[0m", e.message)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
