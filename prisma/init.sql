-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";
-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('PLAYER', 'ADMIN');
-- CreateEnum
CREATE TYPE "Stage" AS ENUM ('GROUP', 'R32', 'R16', 'QF', 'SF', 'THIRD_PLACE', 'FINAL');
-- CreateEnum
CREATE TYPE "PredictionStatus" AS ENUM ('DRAFT', 'GROUP_COMPLETE', 'COMPLETE');
-- CreateEnum
CREATE TYPE "Confederation" AS ENUM ('UEFA', 'CONMEBOL', 'CONCACAF', 'CAF', 'AFC', 'OFC');
-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'PLAYER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "Tournament" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "host" TEXT NOT NULL,
    "groupStageStart" TIMESTAMP(3) NOT NULL,
    "groupStageEnd" TIMESTAMP(3) NOT NULL,
    "knockoutStageStart" TIMESTAMP(3) NOT NULL,
    "totalTeams" INTEGER NOT NULL DEFAULT 48,
    "totalGroups" INTEGER NOT NULL DEFAULT 12,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Tournament_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" CHAR(3) NOT NULL,
    "flagUrl" TEXT NOT NULL,
    "confederation" "Confederation" NOT NULL,
    "fifaRanking" INTEGER,
    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "TournamentGroup" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "letter" CHAR(1) NOT NULL,
    CONSTRAINT "TournamentGroup_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "GroupTeam" (
    "groupId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    CONSTRAINT "GroupTeam_pkey" PRIMARY KEY ("groupId","teamId")
);
-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "stage" "Stage" NOT NULL,
    "groupId" TEXT,
    "matchNumber" INTEGER NOT NULL,
    "kickoff" TIMESTAMP(3) NOT NULL,
    "stadium" TEXT NOT NULL,
    "homeTeamId" TEXT,
    "awayTeamId" TEXT,
    "homeTeamPlaceholder" TEXT,
    "awayTeamPlaceholder" TEXT,
    "homeScore" INTEGER,
    "awayScore" INTEGER,
    "isDraw" BOOLEAN,
    "winnerId" TEXT,
    "pointsAvailable" INTEGER NOT NULL,
    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "Prediction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "PredictionStatus" NOT NULL DEFAULT 'DRAFT',
    "groupLocked" BOOLEAN NOT NULL DEFAULT false,
    "koLocked" BOOLEAN NOT NULL DEFAULT false,
    "totalScore" INTEGER NOT NULL DEFAULT 0,
    "matchAccuracy" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Prediction_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "GroupStandingPrediction" (
    "id" TEXT NOT NULL,
    "predictionId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "predictedPosition" INTEGER NOT NULL,
    "pointsEarned" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "GroupStandingPrediction_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "MatchPrediction" (
    "id" TEXT NOT NULL,
    "predictionId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "predictedWinnerId" TEXT,
    "isDraw" BOOLEAN NOT NULL DEFAULT false,
    "pointsEarned" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "MatchPrediction_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "ThirdPlacePrediction" (
    "id" TEXT NOT NULL,
    "predictionId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "pointsEarned" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ThirdPlacePrediction_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "JokerPick" (
    "id" TEXT NOT NULL,
    "predictionId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "stage" "Stage" NOT NULL,
    CONSTRAINT "JokerPick_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "League" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "joinCode" CHAR(6) NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "League_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "LeagueMembership" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "predictionId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentRank" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "LeagueMembership_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "LeagueRankSnapshot" (
    "id" TEXT NOT NULL,
    "leagueMembershipId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "totalScore" INTEGER NOT NULL,
    "snapshotAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeagueRankSnapshot_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
-- CreateIndex
CREATE UNIQUE INDEX "Tournament_year_key" ON "Tournament"("year");
-- CreateIndex
CREATE UNIQUE INDEX "Team_name_key" ON "Team"("name");
-- CreateIndex
CREATE UNIQUE INDEX "Team_code_key" ON "Team"("code");
-- CreateIndex
CREATE UNIQUE INDEX "TournamentGroup_tournamentId_letter_key" ON "TournamentGroup"("tournamentId", "letter");
-- CreateIndex
CREATE UNIQUE INDEX "Match_tournamentId_matchNumber_key" ON "Match"("tournamentId", "matchNumber");
-- CreateIndex
CREATE UNIQUE INDEX "Prediction_userId_tournamentId_name_key" ON "Prediction"("userId", "tournamentId", "name");
-- CreateIndex
CREATE UNIQUE INDEX "GroupStandingPrediction_predictionId_groupId_teamId_key" ON "GroupStandingPrediction"("predictionId", "groupId", "teamId");
-- CreateIndex
CREATE UNIQUE INDEX "MatchPrediction_predictionId_matchId_key" ON "MatchPrediction"("predictionId", "matchId");
-- CreateIndex
CREATE UNIQUE INDEX "ThirdPlacePrediction_predictionId_groupId_key" ON "ThirdPlacePrediction"("predictionId", "groupId");
-- CreateIndex
CREATE UNIQUE INDEX "JokerPick_predictionId_stage_key" ON "JokerPick"("predictionId", "stage");
-- CreateIndex
CREATE UNIQUE INDEX "League_joinCode_key" ON "League"("joinCode");
-- CreateIndex
CREATE UNIQUE INDEX "LeagueMembership_leagueId_predictionId_key" ON "LeagueMembership"("leagueId", "predictionId");
-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
-- AddForeignKey
ALTER TABLE "TournamentGroup" ADD CONSTRAINT "TournamentGroup_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "GroupTeam" ADD CONSTRAINT "GroupTeam_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "TournamentGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "GroupTeam" ADD CONSTRAINT "GroupTeam_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "TournamentGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "Prediction" ADD CONSTRAINT "Prediction_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "GroupStandingPrediction" ADD CONSTRAINT "GroupStandingPrediction_predictionId_fkey" FOREIGN KEY ("predictionId") REFERENCES "Prediction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "GroupStandingPrediction" ADD CONSTRAINT "GroupStandingPrediction_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "TournamentGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "GroupStandingPrediction" ADD CONSTRAINT "GroupStandingPrediction_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "MatchPrediction" ADD CONSTRAINT "MatchPrediction_predictionId_fkey" FOREIGN KEY ("predictionId") REFERENCES "Prediction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "MatchPrediction" ADD CONSTRAINT "MatchPrediction_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "MatchPrediction" ADD CONSTRAINT "MatchPrediction_predictedWinnerId_fkey" FOREIGN KEY ("predictedWinnerId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "ThirdPlacePrediction" ADD CONSTRAINT "ThirdPlacePrediction_predictionId_fkey" FOREIGN KEY ("predictionId") REFERENCES "Prediction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "ThirdPlacePrediction" ADD CONSTRAINT "ThirdPlacePrediction_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "TournamentGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "JokerPick" ADD CONSTRAINT "JokerPick_predictionId_fkey" FOREIGN KEY ("predictionId") REFERENCES "Prediction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "JokerPick" ADD CONSTRAINT "JokerPick_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "League" ADD CONSTRAINT "League_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "League" ADD CONSTRAINT "League_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "LeagueMembership" ADD CONSTRAINT "LeagueMembership_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "LeagueMembership" ADD CONSTRAINT "LeagueMembership_predictionId_fkey" FOREIGN KEY ("predictionId") REFERENCES "Prediction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "LeagueRankSnapshot" ADD CONSTRAINT "LeagueRankSnapshot_leagueMembershipId_fkey" FOREIGN KEY ("leagueMembershipId") REFERENCES "LeagueMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
