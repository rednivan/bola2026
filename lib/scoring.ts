import { prisma } from "@/lib/prisma"

// Rewritten as a handful of bulk SQL statements (instead of per-row loops).
// Production's DB connection is capped at connection_limit=1, and the old
// loop issued 400+ sequential round trips (one per prediction/membership),
// which blew past the sync-and-score cron's invocation timeout.
export async function recalculateAllScores(): Promise<{ predictions: number; leagues: number }> {
  await prisma.$transaction([
    // 1. Score every match prediction against its match result
    prisma.$executeRaw`
      UPDATE "MatchPrediction" mp
      SET "pointsEarned" = CASE
        WHEN m."homeScore" IS NULL THEN 0
        WHEN m."isDraw" THEN (CASE WHEN mp."isDraw" THEN m."pointsAvailable" ELSE 0 END)
        ELSE (CASE WHEN mp."predictedWinnerId" = m."winnerId" THEN m."pointsAvailable" ELSE 0 END)
      END
      FROM "Match" m
      WHERE mp."matchId" = m.id
    `,
    // 2. Double the score for each prediction's joker pick
    prisma.$executeRaw`
      UPDATE "MatchPrediction" mp
      SET "pointsEarned" = mp."pointsEarned" * 2
      FROM "JokerPick" jp
      WHERE mp."predictionId" = jp."predictionId"
        AND mp."matchId" = jp."matchId"
        AND mp."pointsEarned" > 0
    `,
    // 3. Roll match + standings + third-place points into each prediction's total
    prisma.$executeRaw`
      WITH agg AS (
        SELECT
          p.id,
          COALESCE(ma.match_sum, 0) AS match_sum,
          COALESCE(sa.standing_sum, 0) AS standing_sum,
          COALESCE(ta.third_sum, 0) AS third_sum,
          COALESCE(ma.total_predicted, 0) AS total_predicted,
          COALESCE(ma.correct_predicted, 0) AS correct_predicted
        FROM "Prediction" p
        LEFT JOIN (
          SELECT mp."predictionId" AS id,
            SUM(mp."pointsEarned") AS match_sum,
            COUNT(*) FILTER (WHERE m."homeScore" IS NOT NULL) AS total_predicted,
            COUNT(*) FILTER (WHERE mp."pointsEarned" > 0) AS correct_predicted
          FROM "MatchPrediction" mp
          JOIN "Match" m ON m.id = mp."matchId"
          GROUP BY mp."predictionId"
        ) ma ON ma.id = p.id
        LEFT JOIN (
          SELECT "predictionId" AS id, SUM("pointsEarned") AS standing_sum
          FROM "GroupStandingPrediction" GROUP BY "predictionId"
        ) sa ON sa.id = p.id
        LEFT JOIN (
          SELECT "predictionId" AS id, SUM("pointsEarned") AS third_sum
          FROM "ThirdPlacePrediction" GROUP BY "predictionId"
        ) ta ON ta.id = p.id
      )
      UPDATE "Prediction" p
      SET
        "totalScore" = (agg.match_sum + agg.standing_sum + agg.third_sum)::int,
        "matchAccuracy" = CASE WHEN agg.total_predicted > 0
          THEN (agg.correct_predicted::float / agg.total_predicted) * 100
          ELSE 0 END
      FROM agg
      WHERE agg.id = p.id
    `,
    // 4. Recompute each league's standings, ranked by total score (ties share a rank, e.g. 1,1,3)
    prisma.$executeRaw`
      UPDATE "LeagueMembership" lm
      SET "currentRank" = ranked.rnk
      FROM (
        SELECT lm2.id, (RANK() OVER (
          PARTITION BY lm2."leagueId" ORDER BY p."totalScore" DESC
        ))::int AS rnk
        FROM "LeagueMembership" lm2
        JOIN "Prediction" p ON p.id = lm2."predictionId"
      ) ranked
      WHERE lm.id = ranked.id
    `,
  ])

  const [predictions, leagues] = await Promise.all([prisma.prediction.count(), prisma.league.count()])

  return { predictions, leagues }
}
