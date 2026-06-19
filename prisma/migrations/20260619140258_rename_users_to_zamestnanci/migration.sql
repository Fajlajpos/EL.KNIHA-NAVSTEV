-- CreateEnum
CREATE TYPE "Role" AS ENUM ('EMPLOYEE', 'MANAGER', 'CEO', 'ADMIN');

-- CreateEnum
CREATE TYPE "LogType" AS ENUM ('WORK', 'LUNCH', 'DOCTOR', 'BUSINESS_TRIP', 'BREAK');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('OK', 'OPEN', 'ERROR', 'MANUALLY_EDITED');

-- CreateEnum
CREATE TYPE "AbsenceType" AS ENUM ('VACATION', 'SICK_LEAVE', 'COMPENSATORY_LEAVE');

-- CreateEnum
CREATE TYPE "AbsenceStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CorrectionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "navstevy" (
    "id" SERIAL NOT NULL,
    "jmeno" TEXT NOT NULL,
    "prijmeni" TEXT NOT NULL,
    "organizace" TEXT,
    "spz" TEXT,
    "prichod" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "odchod" TIMESTAMPTZ,

    CONSTRAINT "navstevy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zamestnanci" (
    "id" SERIAL NOT NULL,
    "employee_number" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT,
    "department" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'EMPLOYEE',
    "pin_hash" TEXT,
    "rfid_card_uid" TEXT,
    "hourly_fund" DOUBLE PRECISION NOT NULL DEFAULT 40.0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "zamestnanci_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_logs" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "check_in" TIMESTAMPTZ NOT NULL,
    "check_out" TIMESTAMPTZ,
    "log_type" "LogType" NOT NULL DEFAULT 'WORK',
    "status" "AttendanceStatus" NOT NULL DEFAULT 'OPEN',
    "edited_by" INTEGER,
    "note" TEXT,
    "original_check_in" TIMESTAMPTZ,
    "original_check_out" TIMESTAMPTZ,

    CONSTRAINT "attendance_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "absences" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "absence_type" "AbsenceType" NOT NULL,
    "approved_by" INTEGER,
    "status" "AbsenceStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "absences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "correction_requests" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "attendance_log_id" INTEGER,
    "requested_check_in" TIMESTAMPTZ,
    "requested_check_out" TIMESTAMPTZ,
    "requested_log_type" "LogType" NOT NULL DEFAULT 'WORK',
    "reason" TEXT NOT NULL,
    "status" "CorrectionStatus" NOT NULL DEFAULT 'PENDING',
    "approved_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "correction_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "note" TEXT,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "zamestnanci_employee_number_key" ON "zamestnanci"("employee_number");

-- CreateIndex
CREATE UNIQUE INDEX "zamestnanci_email_key" ON "zamestnanci"("email");

-- CreateIndex
CREATE UNIQUE INDEX "zamestnanci_rfid_card_uid_key" ON "zamestnanci"("rfid_card_uid");

-- AddForeignKey
ALTER TABLE "attendance_logs" ADD CONSTRAINT "attendance_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "zamestnanci"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_logs" ADD CONSTRAINT "attendance_logs_edited_by_fkey" FOREIGN KEY ("edited_by") REFERENCES "zamestnanci"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "absences" ADD CONSTRAINT "absences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "zamestnanci"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "absences" ADD CONSTRAINT "absences_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "zamestnanci"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correction_requests" ADD CONSTRAINT "correction_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "zamestnanci"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correction_requests" ADD CONSTRAINT "correction_requests_attendance_log_id_fkey" FOREIGN KEY ("attendance_log_id") REFERENCES "attendance_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correction_requests" ADD CONSTRAINT "correction_requests_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "zamestnanci"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "zamestnanci"("id") ON DELETE CASCADE ON UPDATE CASCADE;
