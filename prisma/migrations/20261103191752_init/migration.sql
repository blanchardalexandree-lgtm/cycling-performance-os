-- CreateEnum
CREATE TYPE "DataOrigin" AS ENUM ('MEASURED', 'ESTIMATED', 'DECLARED', 'ASSUMED');

-- CreateEnum
CREATE TYPE "ActivitySource" AS ENUM ('FILE_FIT', 'FILE_GPX', 'FILE_TCX', 'STRAVA', 'GARMIN', 'NOLIO', 'MANUAL');

-- CreateEnum
CREATE TYPE "WorkoutStatus" AS ENUM ('PLANNED', 'COMPLETED', 'PARTIAL', 'MISSED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "DayRole" AS ENUM ('TRAINING', 'ACTIVE_RECOVERY', 'RACE', 'TEST', 'OFF');

-- CreateEnum
CREATE TYPE "GoalPriority" AS ENUM ('A', 'B', 'C');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Paris',

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "userAgent" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AthleteProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "discipline" TEXT NOT NULL DEFAULT 'Cyclisme sur route',
    "level" TEXT NOT NULL DEFAULT 'Haut niveau amateur — division nationale',
    "specialties" TEXT[],
    "heightCm" DOUBLE PRECISION,
    "generalGoal" TEXT,
    "constraints" TEXT,
    "environment" TEXT[],
    "equipment" TEXT[],
    "birthYear" INTEGER,
    "sex" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AthleteProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetricValue" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "origin" "DataOrigin" NOT NULL,
    "source" TEXT NOT NULL,
    "method" TEXT,
    "uncertainty" DOUBLE PRECISION,
    "activityId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetricValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sport" TEXT NOT NULL DEFAULT 'cycling',
    "startTime" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT,
    "durationS" INTEGER NOT NULL,
    "elapsedS" INTEGER,
    "distanceM" DOUBLE PRECISION,
    "elevationGainM" DOUBLE PRECISION,
    "avgPower" DOUBLE PRECISION,
    "normalizedPower" DOUBLE PRECISION,
    "maxPower" DOUBLE PRECISION,
    "avgHr" DOUBLE PRECISION,
    "maxHr" DOUBLE PRECISION,
    "avgCadence" DOUBLE PRECISION,
    "avgSpeed" DOUBLE PRECISION,
    "work_kJ" DOUBLE PRECISION,
    "tss" DOUBLE PRECISION,
    "intensityFactor" DOUBLE PRECISION,
    "tssMethod" TEXT,
    "hrDriftPct" DOUBLE PRECISION,
    "isRace" BOOLEAN NOT NULL DEFAULT false,
    "isIndoor" BOOLEAN NOT NULL DEFAULT false,
    "rpe" INTEGER,
    "notes" TEXT,
    "hasPower" BOOLEAN NOT NULL DEFAULT false,
    "hasHr" BOOLEAN NOT NULL DEFAULT false,
    "powerSensorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivitySourceRecord" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" "ActivitySource" NOT NULL,
    "externalId" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw" JSONB,
    "restricted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ActivitySourceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityStream" (
    "activityId" TEXT NOT NULL,
    "time" INTEGER[],
    "power" INTEGER[],
    "heartRate" INTEGER[],
    "cadence" INTEGER[],
    "speed" DOUBLE PRECISION[],
    "altitude" DOUBLE PRECISION[],
    "distance" DOUBLE PRECISION[],
    "lat" DOUBLE PRECISION[],
    "lng" DOUBLE PRECISION[],

    CONSTRAINT "ActivityStream_pkey" PRIMARY KEY ("activityId")
);

-- CreateTable
CREATE TABLE "PowerBest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "durationS" INTEGER NOT NULL,
    "watts" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "isRace" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PowerBest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "discipline" TEXT NOT NULL DEFAULT 'Route',
    "kind" TEXT NOT NULL DEFAULT 'course',
    "priority" "GoalPriority" NOT NULL DEFAULT 'C',
    "distanceKm" DOUBLE PRECISION,
    "elevationM" DOUBLE PRECISION,
    "courseType" TEXT,
    "targetResult" TEXT,
    "demands" TEXT[],
    "readiness" TEXT,
    "logistics" TEXT,
    "confirmed" BOOLEAN NOT NULL DEFAULT true,
    "resultRank" TEXT,
    "resultNotes" TEXT,
    "activityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingPhase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "start" TIMESTAMP(3) NOT NULL,
    "end" TIMESTAMP(3) NOT NULL,
    "focus" TEXT,
    "goalId" TEXT,

    CONSTRAINT "TrainingPhase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlannedWorkout" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "dayRole" "DayRole" NOT NULL DEFAULT 'TRAINING',
    "cycleIndex" INTEGER,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "rationale" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 2,
    "durationMin" INTEGER NOT NULL,
    "plannedTss" DOUBLE PRECISION,
    "steps" JSONB NOT NULL,
    "indoor" BOOLEAN NOT NULL DEFAULT false,
    "status" "WorkoutStatus" NOT NULL DEFAULT 'PLANNED',
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "generatedBy" TEXT NOT NULL DEFAULT 'planner',
    "activityId" TEXT,
    "compliance" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlannedWorkout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarConstraint" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "start" TIMESTAMP(3) NOT NULL,
    "end" TIMESTAMP(3) NOT NULL,
    "maxTrainingMin" INTEGER,
    "indoorOnly" BOOLEAN NOT NULL DEFAULT false,
    "noTraining" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CalendarConstraint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyAvailability" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "maxMinutes" INTEGER NOT NULL,
    "outdoorOk" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "WeeklyAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalUserId" TEXT,
    "accessTokenEnc" TEXT,
    "refreshTokenEnc" TEXT,
    "expiresAt" TIMESTAMP(3),
    "scopes" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'connected',
    "lastSyncAt" TIMESTAMP(3),
    "syncCursor" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "imported" INTEGER NOT NULL DEFAULT 0,
    "merged" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,

    CONSTRAINT "SyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WellnessEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'saisie',
    "sleepHours" DOUBLE PRECISION,
    "sleepQuality" INTEGER,
    "hrvMs" DOUBLE PRECISION,
    "restingHr" DOUBLE PRECISION,
    "fatigue" INTEGER,
    "soreness" INTEGER,
    "motivation" INTEGER,
    "stress" INTEGER,
    "illness" BOOLEAN NOT NULL DEFAULT false,
    "pain" TEXT,
    "weightKg" DOUBLE PRECISION,
    "notes" TEXT,

    CONSTRAINT "WellnessEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanProposal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "author" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "changes" JSONB NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'PENDING',
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "PlanProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSettings" (
    "userId" TEXT NOT NULL,
    "cycleAnchorDate" DATE,
    "autoAdaptEnabled" BOOLEAN NOT NULL DEFAULT false,
    "autoAdaptRules" JSONB,
    "shareStravaWithAi" BOOLEAN NOT NULL DEFAULT false,
    "preferredExport" TEXT NOT NULL DEFAULT 'zwo',

    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AthleteProfile_userId_key" ON "AthleteProfile"("userId");

-- CreateIndex
CREATE INDEX "MetricValue_userId_key_date_idx" ON "MetricValue"("userId", "key", "date");

-- CreateIndex
CREATE INDEX "Activity_userId_startTime_idx" ON "Activity"("userId", "startTime");

-- CreateIndex
CREATE INDEX "ActivitySourceRecord_activityId_idx" ON "ActivitySourceRecord"("activityId");

-- CreateIndex
CREATE UNIQUE INDEX "ActivitySourceRecord_userId_source_externalId_key" ON "ActivitySourceRecord"("userId", "source", "externalId");

-- CreateIndex
CREATE INDEX "PowerBest_userId_durationS_watts_idx" ON "PowerBest"("userId", "durationS", "watts");

-- CreateIndex
CREATE UNIQUE INDEX "PowerBest_activityId_durationS_key" ON "PowerBest"("activityId", "durationS");

-- CreateIndex
CREATE INDEX "Goal_userId_date_idx" ON "Goal"("userId", "date");

-- CreateIndex
CREATE INDEX "TrainingPhase_userId_start_idx" ON "TrainingPhase"("userId", "start");

-- CreateIndex
CREATE UNIQUE INDEX "PlannedWorkout_activityId_key" ON "PlannedWorkout"("activityId");

-- CreateIndex
CREATE INDEX "PlannedWorkout_userId_date_idx" ON "PlannedWorkout"("userId", "date");

-- CreateIndex
CREATE INDEX "CalendarConstraint_userId_start_idx" ON "CalendarConstraint"("userId", "start");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyAvailability_userId_weekday_key" ON "WeeklyAvailability"("userId", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationAccount_userId_provider_key" ON "IntegrationAccount"("userId", "provider");

-- CreateIndex
CREATE INDEX "SyncLog_userId_startedAt_idx" ON "SyncLog"("userId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WellnessEntry_userId_date_source_key" ON "WellnessEntry"("userId", "date", "source");

-- CreateIndex
CREATE INDEX "PlanProposal_userId_status_idx" ON "PlanProposal"("userId", "status");

-- CreateIndex
CREATE INDEX "CoachMessage_userId_createdAt_idx" ON "CoachMessage"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AthleteProfile" ADD CONSTRAINT "AthleteProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetricValue" ADD CONSTRAINT "MetricValue_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetricValue" ADD CONSTRAINT "MetricValue_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivitySourceRecord" ADD CONSTRAINT "ActivitySourceRecord_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityStream" ADD CONSTRAINT "ActivityStream_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PowerBest" ADD CONSTRAINT "PowerBest_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingPhase" ADD CONSTRAINT "TrainingPhase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedWorkout" ADD CONSTRAINT "PlannedWorkout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedWorkout" ADD CONSTRAINT "PlannedWorkout_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarConstraint" ADD CONSTRAINT "CalendarConstraint_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyAvailability" ADD CONSTRAINT "WeeklyAvailability_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationAccount" ADD CONSTRAINT "IntegrationAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncLog" ADD CONSTRAINT "SyncLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WellnessEntry" ADD CONSTRAINT "WellnessEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanProposal" ADD CONSTRAINT "PlanProposal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachMessage" ADD CONSTRAINT "CoachMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSettings" ADD CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
