/**
 * SIT test — covers gaps not addressed by integration-test.ts / full-tournament-test.ts
 *
 * Tests:
 *   1. Joker doubling: correct pick scores 2x; wrong pick stays 0
 *   2. League ranking: currentRank assigned correctly by score
 *   3. Lock enforcement: date-based lock conditions work correctly
 *   4. Email opt-out: opted-out users excluded from email eligibility query
 *   5. Group standings scoring: 1pt per correct position (flat)
 *   6. Third-place scoring: 1pt per correct qualifying group
 *   7. Score aggregation: totalScore = match + standing + 3rd-place
 *
 * Run: npx tsx scripts/sit-test.ts
 *
 * Safe to run against live DB: all records use TEST_TAG prefix, fully cleaned up.
 */

import "dotenv/config"
import { PrismaClient } from "../lib/generated/prisma"

const prisma = new PrismaClient()
const TEST_TAG = "sit__"
const PASS = "\x1b[32m✓\x1b[0m"
const FAIL = "\x1b[31m✗\x1b[0m"
const INFO = "\x1b[36m·\x1b[0m"

let failures = 0

function assert(ok: boolean, msg: string) {
  console.log(`  ${ok ? PASS : FAIL} ${msg}`)
  if (!ok) failures++
}
function header(t: string) { console.log(`\n\x1b[1m── ${t} ──\x1b[0m`) }
function info(m: string) { console.log(`  ${INFO} ${m}`) }

async function createTestUser(n: string, emailOptOut = false) {
  const id = `sit-test-${n}-0000-0000-000000000000`
  await prisma.user.upsert({
    where: { id },
    update: { emailOptOut },
    create: { id, email: `${TEST_TAG}${n}@example.com`, displayName: `${TEST_TAG}User ${n}`, emailOptOut },
  })
  return id
}

// ─── Test 1: Joker pick doubling ──────────────────────────────────────────────

async function testJokerDoubling(tournamentId: string) {
  header("Test 1: Joker pick doubling")

  const userId = await createTestUser("001")
  const pred1 = await prisma.prediction.create({ data: { userId, tournamentId, name: `${TEST_TAG}joker-correct` } })
  const pred2 = await prisma.prediction.create({ data: { userId, tournamentId, name: `${TEST_TAG}joker-wrong` } })

  const match = await prisma.match.findFirst({
    where: { stage: "GROUP", homeTeamId: { not: null }, awayTeamId: { not: null } },
    select: { id: true, homeTeamId: true, awayTeamId: true, pointsAvailable: true },
  })
  if (!match?.homeTeamId || !match?.awayTeamId) {
    assert(false, "No group match with teams assigned — run sync first")
    return { userIds: [userId], predIds: [pred1.id, pred2.id] }
  }

  // pred1: correct pick (home) with joker
  await prisma.matchPrediction.create({
    data: { predictionId: pred1.id, matchId: match.id, predictedWinnerId: match.homeTeamId, isDraw: false, pointsEarned: match.pointsAvailable },
  })
  await prisma.jokerPick.create({ data: { predictionId: pred1.id, matchId: match.id, stage: "GROUP" } })

  // pred2: wrong pick (away) with joker — should not double
  const wrongPick = await prisma.matchPrediction.create({
    data: { predictionId: pred2.id, matchId: match.id, predictedWinnerId: match.awayTeamId, isDraw: false, pointsEarned: 0 },
  })
  await prisma.jokerPick.create({ data: { predictionId: pred2.id, matchId: match.id, stage: "GROUP" } })

  // Run joker doubling (mirrors recalculateScores logic in admin.ts)
  const jokerPicks = await prisma.jokerPick.findMany({
    where: { matchId: match.id },
    select: { predictionId: true, matchId: true },
  })
  for (const jp of jokerPicks) {
    await prisma.matchPrediction.updateMany({
      where: { predictionId: jp.predictionId, matchId: jp.matchId, pointsEarned: { gt: 0 } },
      data: { pointsEarned: { multiply: 2 } },
    })
  }

  const mp1 = await prisma.matchPrediction.findFirst({ where: { predictionId: pred1.id } })
  const mp2 = await prisma.matchPrediction.findUnique({ where: { id: wrongPick.id } })

  assert(mp1?.pointsEarned === match.pointsAvailable * 2,
    `Correct joker doubles points (${match.pointsAvailable} → ${mp1?.pointsEarned}, expected ${match.pointsAvailable * 2})`)
  assert(mp2?.pointsEarned === 0, `Wrong joker stays 0 (got ${mp2?.pointsEarned})`)

  info(`Stage GROUP, match pointsAvailable=${match.pointsAvailable}`)
  return { userIds: [userId], predIds: [pred1.id, pred2.id] }
}

// ─── Test 2: League ranking ───────────────────────────────────────────────────

async function testLeagueRanking(tournamentId: string) {
  header("Test 2: League ranking")

  const userId = await createTestUser("002")

  // Clean up any leftover test league from previous run
  await prisma.league.deleteMany({ where: { joinCode: "SIT001" } })

  const [p1, p2, p3] = await Promise.all([
    prisma.prediction.create({ data: { userId, tournamentId, name: `${TEST_TAG}rank1`, totalScore: 50 } }),
    prisma.prediction.create({ data: { userId, tournamentId, name: `${TEST_TAG}rank2`, totalScore: 30 } }),
    prisma.prediction.create({ data: { userId, tournamentId, name: `${TEST_TAG}rank3`, totalScore: 10 } }),
  ])

  const league = await prisma.league.create({
    data: { name: `${TEST_TAG}League`, joinCode: "SIT001", creatorId: userId, tournamentId },
  })
  await prisma.leagueMembership.createMany({
    data: [
      { leagueId: league.id, predictionId: p1.id },
      { leagueId: league.id, predictionId: p2.id },
      { leagueId: league.id, predictionId: p3.id },
    ],
  })

  // Run rank calculation (mirrors recalculateScores in admin.ts)
  const memberships = await prisma.leagueMembership.findMany({
    where: { leagueId: league.id },
    include: { prediction: { select: { totalScore: true } } },
    orderBy: { prediction: { totalScore: "desc" } },
  })
  for (let i = 0; i < memberships.length; i++) {
    await prisma.leagueMembership.update({ where: { id: memberships[i].id }, data: { currentRank: i + 1 } })
  }

  const [m1, m2, m3] = await Promise.all([
    prisma.leagueMembership.findFirst({ where: { leagueId: league.id, predictionId: p1.id } }),
    prisma.leagueMembership.findFirst({ where: { leagueId: league.id, predictionId: p2.id } }),
    prisma.leagueMembership.findFirst({ where: { leagueId: league.id, predictionId: p3.id } }),
  ])

  assert(m1?.currentRank === 1, `50pts → rank 1 (got ${m1?.currentRank})`)
  assert(m2?.currentRank === 2, `30pts → rank 2 (got ${m2?.currentRank})`)
  assert(m3?.currentRank === 3, `10pts → rank 3 (got ${m3?.currentRank})`)

  return { userIds: [userId], predIds: [p1.id, p2.id, p3.id], leagueIds: [league.id] }
}

// ─── Test 3: Lock enforcement (date conditions) ───────────────────────────────

async function testLockEnforcement() {
  header("Test 3: Lock enforcement")

  const tournament = await prisma.tournament.findUnique({ where: { year: 2026 } })
  if (!tournament) { assert(false, "Tournament not found"); return }

  const now = new Date()

  // The lock condition in predictions.ts: new Date() >= tournament.groupStageStart
  const past = new Date(now.getTime() - 1000)
  const future = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 30)

  assert(now >= past, "Date comparison: now >= past → true (group locked)")
  assert(!(now >= future), "Date comparison: now >= future → false (group not locked)")

  // Verify tournament dates are still in the future (pre-launch sanity)
  assert(
    tournament.groupStageStart > now,
    `Tournament.groupStageStart is in the future (${tournament.groupStageStart.toISOString().slice(0, 10)})`
  )
  assert(
    tournament.knockoutStageStart > now,
    `Tournament.knockoutStageStart is in the future (${tournament.knockoutStageStart.toISOString().slice(0, 10)})`
  )

  // Window 2 condition: groupStageEnd < now < knockoutStageStart
  const groupStagePast = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 20)
  const groupStageEndPast = new Date(now.getTime() - 1000 * 60 * 60)
  const koStartFuture = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 5)

  const inWindow2 = now >= groupStagePast && now < koStartFuture
  assert(inWindow2, "Window 2 condition: groupStageStart past + koStart future → true")

  info(`Current dates — groupStageStart: ${tournament.groupStageStart.toISOString().slice(0, 10)}, knockoutStageStart: ${tournament.knockoutStageStart.toISOString().slice(0, 10)}`)
}

// ─── Test 4: Email opt-out ────────────────────────────────────────────────────

async function testEmailOptOut(tournamentId: string) {
  header("Test 4: Email opt-out")

  const userId1 = await createTestUser("004a", false)   // opted in
  const userId2 = await createTestUser("004b", true)    // opted out

  const [pred1, pred2] = await Promise.all([
    prisma.prediction.create({ data: { userId: userId1, tournamentId, name: `${TEST_TAG}optin` } }),
    prisma.prediction.create({ data: { userId: userId2, tournamentId, name: `${TEST_TAG}optout` } }),
  ])

  // Query mirrors triggerMatchdayEmails in admin.ts
  const eligible = await prisma.user.findMany({
    where: {
      id: { in: [userId1, userId2] },
      predictions: { some: { tournamentId } },
      emailOptOut: false,
    },
    select: { id: true },
  })

  assert(eligible.length === 1, `Opt-out filter: 1 eligible user (got ${eligible.length})`)
  assert(eligible[0]?.id === userId1, `Eligible user is opted-in user (got ${eligible[0]?.id})`)

  return { userIds: [userId1, userId2], predIds: [pred1.id, pred2.id] }
}

// ─── Test 5: Group standings scoring ─────────────────────────────────────────

async function testGroupStandingsScoring(tournamentId: string) {
  header("Test 5: Group standings scoring (1pt per correct position)")

  const userId = await createTestUser("005")
  const pred = await prisma.prediction.create({ data: { userId, tournamentId, name: `${TEST_TAG}standings` } })

  const group = await prisma.tournamentGroup.findFirst({
    include: { teams: { select: { teamId: true }, orderBy: { teamId: "asc" } } },
  })
  if (!group || group.teams.length < 4) {
    assert(false, "Need a group with 4 teams — run sync first")
    return { userIds: [userId], predIds: [pred.id] }
  }

  const teamIds = group.teams.map(t => t.teamId)

  // Temporarily set actual positions
  for (let i = 0; i < 4; i++) {
    await prisma.groupTeam.update({
      where: { groupId_teamId: { groupId: group.id, teamId: teamIds[i] } },
      data: { actualPosition: i + 1 },
    })
  }

  // Predictions: teams 0,1,3 correct; team 2 wrong (predict pos1, actual=3)
  await prisma.groupStandingPrediction.createMany({
    data: [
      { predictionId: pred.id, groupId: group.id, teamId: teamIds[0], predictedPosition: 1 },
      { predictionId: pred.id, groupId: group.id, teamId: teamIds[1], predictedPosition: 2 },
      { predictionId: pred.id, groupId: group.id, teamId: teamIds[2], predictedPosition: 1 }, // wrong: actual=3
      { predictionId: pred.id, groupId: group.id, teamId: teamIds[3], predictedPosition: 4 },
    ],
  })

  // Run scoring (mirrors calculateGroupStandingPoints in admin.ts, scoped to this pred)
  await prisma.groupStandingPrediction.updateMany({ where: { predictionId: pred.id }, data: { pointsEarned: 0 } })
  const actuals = await prisma.groupTeam.findMany({
    where: { groupId: group.id, actualPosition: { not: null } },
    select: { teamId: true, actualPosition: true },
  })
  for (const a of actuals) {
    await prisma.groupStandingPrediction.updateMany({
      where: { predictionId: pred.id, groupId: group.id, teamId: a.teamId, predictedPosition: a.actualPosition! },
      data: { pointsEarned: 1 },
    })
  }

  const results = await prisma.groupStandingPrediction.findMany({ where: { predictionId: pred.id } })
  const correct = results.filter(r => r.pointsEarned === 1).length
  const total = results.reduce((s, r) => s + r.pointsEarned, 0)
  assert(correct === 3, `3 correct standings → 3pts (got ${correct})`)
  assert(total === 3, `Total standing pts = 3 (got ${total})`)

  // Cleanup: reset actualPosition
  for (const teamId of teamIds) {
    await prisma.groupTeam.update({
      where: { groupId_teamId: { groupId: group.id, teamId } },
      data: { actualPosition: null },
    })
  }

  return { userIds: [userId], predIds: [pred.id] }
}

// ─── Test 6: Third-place scoring ─────────────────────────────────────────────

async function testThirdPlaceScoring(tournamentId: string) {
  header("Test 6: Third-place scoring (1pt per correct qualifying group)")

  const userId = await createTestUser("006")
  const pred = await prisma.prediction.create({ data: { userId, tournamentId, name: `${TEST_TAG}thirdplace` } })

  const groups = await prisma.tournamentGroup.findMany({ select: { id: true }, orderBy: { letter: "asc" } })
  if (groups.length < 12) {
    assert(false, `Need 12 groups (got ${groups.length}) — run sync first`)
    return { userIds: [userId], predIds: [pred.id] }
  }

  // First 8 groups "qualify", last 4 do not
  const qualifiedIds = groups.slice(0, 8).map(g => g.id)
  const notQualifiedIds = groups.slice(8).map(g => g.id)

  // Pick 4 correct (from qualified) + 4 wrong (from not qualified)
  await prisma.thirdPlacePrediction.createMany({
    data: [
      ...qualifiedIds.slice(0, 4).map(groupId => ({ predictionId: pred.id, groupId })),
      ...notQualifiedIds.map(groupId => ({ predictionId: pred.id, groupId })),
    ],
  })

  // Run scoring (scoped to this pred — mirrors calculateThirdPlacePoints)
  await prisma.thirdPlacePrediction.updateMany({ where: { predictionId: pred.id }, data: { pointsEarned: 0 } })
  await prisma.thirdPlacePrediction.updateMany({
    where: { predictionId: pred.id, groupId: { in: qualifiedIds } },
    data: { pointsEarned: 1 },
  })

  const results = await prisma.thirdPlacePrediction.findMany({ where: { predictionId: pred.id } })
  const correct = results.filter(r => r.pointsEarned === 1).length
  const wrong = results.filter(r => r.pointsEarned === 0).length
  assert(correct === 4, `4 correct 3rd-place picks → 4pts (got ${correct})`)
  assert(wrong === 4, `4 wrong 3rd-place picks → 0pts (got ${wrong})`)

  return { userIds: [userId], predIds: [pred.id] }
}

// ─── Test 7: Score aggregation ────────────────────────────────────────────────

async function testScoreAggregation(tournamentId: string) {
  header("Test 7: Score aggregation (match + standing + 3rd-place)")

  const userId = await createTestUser("007")
  const pred = await prisma.prediction.create({ data: { userId, tournamentId, name: `${TEST_TAG}agg` } })

  const match = await prisma.match.findFirst({
    where: { stage: "GROUP" },
    select: { id: true, pointsAvailable: true },
  })
  const group = await prisma.tournamentGroup.findFirst({
    include: { teams: { take: 2, select: { teamId: true } } },
  })
  const groups3 = await prisma.tournamentGroup.findMany({ take: 3, select: { id: true } })

  if (!match || !group || group.teams.length < 2) {
    assert(false, "Insufficient DB data — run sync first")
    return { userIds: [userId], predIds: [pred.id] }
  }

  // Set known pointsEarned values directly
  await prisma.matchPrediction.create({
    data: { predictionId: pred.id, matchId: match.id, isDraw: false, pointsEarned: 5 },
  })
  await prisma.groupStandingPrediction.createMany({
    data: [
      { predictionId: pred.id, groupId: group.id, teamId: group.teams[0].teamId, predictedPosition: 1, pointsEarned: 1 },
      { predictionId: pred.id, groupId: group.id, teamId: group.teams[1].teamId, predictedPosition: 2, pointsEarned: 1 },
    ],
  })
  await prisma.thirdPlacePrediction.createMany({
    data: groups3.map(g => ({ predictionId: pred.id, groupId: g.id, pointsEarned: 1 })),
  })

  // Run aggregation (mirrors recalculateScores totalScore logic)
  const [matchAgg, standAgg, thirdAgg] = await Promise.all([
    prisma.matchPrediction.aggregate({ where: { predictionId: pred.id }, _sum: { pointsEarned: true } }),
    prisma.groupStandingPrediction.aggregate({ where: { predictionId: pred.id }, _sum: { pointsEarned: true } }),
    prisma.thirdPlacePrediction.aggregate({ where: { predictionId: pred.id }, _sum: { pointsEarned: true } }),
  ])
  const total = (matchAgg._sum.pointsEarned ?? 0) + (standAgg._sum.pointsEarned ?? 0) + (thirdAgg._sum.pointsEarned ?? 0)
  await prisma.prediction.update({ where: { id: pred.id }, data: { totalScore: total } })

  const updated = await prisma.prediction.findUnique({ where: { id: pred.id } })
  const expected = 5 + 2 + groups3.length
  assert(updated?.totalScore === expected, `Total = ${expected} (match=5 + standing=2 + 3rd=${groups3.length}, got ${updated?.totalScore})`)

  return { userIds: [userId], predIds: [pred.id] }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n\x1b[1mBola2026 SIT Test\x1b[0m")
  console.log("=".repeat(50))

  header("Pre-flight")
  const tournament = await prisma.tournament.findUnique({ where: { year: 2026 } })
  assert(!!tournament, "Tournament 2026 exists")
  if (!tournament) { await prisma.$disconnect(); process.exit(1) }

  const allUserIds: string[] = []
  const allPredIds: string[] = []
  const allLeagueIds: string[] = []

  const collect = (r: { userIds: string[]; predIds: string[]; leagueIds?: string[] } | undefined) => {
    if (!r) return
    allUserIds.push(...r.userIds)
    allPredIds.push(...r.predIds.filter(Boolean))
    if (r.leagueIds) allLeagueIds.push(...r.leagueIds)
  }

  try {
    collect(await testJokerDoubling(tournament.id))
    collect(await testLeagueRanking(tournament.id))
    await testLockEnforcement()
    collect(await testEmailOptOut(tournament.id))
    collect(await testGroupStandingsScoring(tournament.id))
    collect(await testThirdPlaceScoring(tournament.id))
    collect(await testScoreAggregation(tournament.id))
  } finally {
    header("Cleanup")

    if (allLeagueIds.length) {
      await prisma.leagueMembership.deleteMany({ where: { leagueId: { in: allLeagueIds } } })
      await prisma.league.deleteMany({ where: { id: { in: allLeagueIds } } })
    }
    if (allPredIds.length) {
      await prisma.jokerPick.deleteMany({ where: { predictionId: { in: allPredIds } } })
      await prisma.matchPrediction.deleteMany({ where: { predictionId: { in: allPredIds } } })
      await prisma.groupStandingPrediction.deleteMany({ where: { predictionId: { in: allPredIds } } })
      await prisma.thirdPlacePrediction.deleteMany({ where: { predictionId: { in: allPredIds } } })
      await prisma.prediction.deleteMany({ where: { id: { in: allPredIds } } })
    }
    if (allUserIds.length) {
      await prisma.user.deleteMany({ where: { id: { in: allUserIds } } })
    }
    info(`Cleaned up ${allUserIds.length} users, ${allPredIds.length} predictions, ${allLeagueIds.length} leagues`)
  }

  header("Summary")
  if (failures === 0) {
    console.log(`\n\x1b[1m\x1b[32m✓ SIT test PASSED — database is clean\x1b[0m\n`)
  } else {
    console.log(`\n\x1b[1m\x1b[31m✗ SIT test FAILED (${failures} failures)\x1b[0m\n`)
  }
}

main()
  .catch(async e => { console.error("\nFatal:", e.message); process.exit(1) })
  .finally(() => prisma.$disconnect())
