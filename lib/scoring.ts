import { prisma } from "@/lib/prisma"

export async function recalculateAllScores(): Promise<{ predictions: number; leagues: number }> {
  const completedMatches = await prisma.match.findMany({
    where: { homeScore: { not: null } },
    select: { id: true, isDraw: true, winnerId: true, pointsAvailable: true },
  })

  await prisma.matchPrediction.updateMany({ data: { pointsEarned: 0 } })

  for (const match of completedMatches) {
    if (match.isDraw) {
      await prisma.matchPrediction.updateMany({
        where: { matchId: match.id, isDraw: true },
        data: { pointsEarned: match.pointsAvailable },
      })
    } else if (match.winnerId) {
      await prisma.matchPrediction.updateMany({
        where: { matchId: match.id, predictedWinnerId: match.winnerId },
        data: { pointsEarned: match.pointsAvailable },
      })
    }
  }

  const jokerPicks = await prisma.jokerPick.findMany({
    where: { matchId: { in: completedMatches.map((m) => m.id) } },
    select: { predictionId: true, matchId: true },
  })
  for (const jp of jokerPicks) {
    await prisma.matchPrediction.updateMany({
      where: { predictionId: jp.predictionId, matchId: jp.matchId, pointsEarned: { gt: 0 } },
      data: { pointsEarned: { multiply: 2 } },
    })
  }

  const predictions = await prisma.prediction.findMany({ select: { id: true } })
  for (const pred of predictions) {
    const [matchAgg, standingAgg, thirdAgg, totalPredicted, correctPredicted] = await Promise.all([
      prisma.matchPrediction.aggregate({ where: { predictionId: pred.id }, _sum: { pointsEarned: true } }),
      prisma.groupStandingPrediction.aggregate({ where: { predictionId: pred.id }, _sum: { pointsEarned: true } }),
      prisma.thirdPlacePrediction.aggregate({ where: { predictionId: pred.id }, _sum: { pointsEarned: true } }),
      prisma.matchPrediction.count({ where: { predictionId: pred.id, match: { homeScore: { not: null } } } }),
      prisma.matchPrediction.count({ where: { predictionId: pred.id, pointsEarned: { gt: 0 } } }),
    ])
    await prisma.prediction.update({
      where: { id: pred.id },
      data: {
        totalScore:
          (matchAgg._sum.pointsEarned ?? 0) +
          (standingAgg._sum.pointsEarned ?? 0) +
          (thirdAgg._sum.pointsEarned ?? 0),
        matchAccuracy: totalPredicted > 0 ? (correctPredicted / totalPredicted) * 100 : 0,
      },
    })
  }

  const leagues = await prisma.league.findMany({ select: { id: true } })
  for (const league of leagues) {
    const memberships = await prisma.leagueMembership.findMany({
      where: { leagueId: league.id },
      include: { prediction: { select: { totalScore: true } } },
      orderBy: { prediction: { totalScore: "desc" } },
    })
    for (let i = 0; i < memberships.length; i++) {
      await prisma.leagueMembership.update({
        where: { id: memberships[i].id },
        data: { currentRank: i + 1 },
      })
    }
  }

  return { predictions: predictions.length, leagues: leagues.length }
}
