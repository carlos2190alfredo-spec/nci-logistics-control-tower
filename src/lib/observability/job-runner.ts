import { getDb } from "@/lib/server/db";
import { logger } from "./logger";
import { safeSerializeError } from "./errors";

export type JobResult = {
  id: string;
  jobName: string;
  status: "SUCCESS" | "FAILED" | "PARTIAL";
  durationMs: number;
  summary?: Record<string, unknown>;
  errorCode?: string;
  safeErrorMessage?: string;
};

export async function runObservedJob(
  jobName: string,
  fn: () => Promise<Record<string, unknown> | void>,
  opts?: { triggeredBy?: string; requestId?: string },
): Promise<JobResult> {
  const db = getDb();
  const startedAt = new Date();

  const run = await db.jobRun.create({
    data: {
      jobName,
      status: "RUNNING",
      startedAt,
      triggeredBy: opts?.triggeredBy ?? "system",
      requestId: opts?.requestId,
    },
  });

  logger.job("job.started", {
    service: "jobs",
    component: jobName,
    requestId: opts?.requestId,
  });

  try {
    const summary = await fn();
    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();

    await db.jobRun.update({
      where: { id: run.id },
      data: {
        status: "SUCCESS",
        finishedAt,
        durationMs,
        summaryJson: summary ? JSON.parse(JSON.stringify(summary)) : undefined,
      },
    });

    logger.job("job.completed", {
      service: "jobs",
      component: jobName,
      outcome: "SUCCESS",
      durationMs,
      requestId: opts?.requestId,
    });

    return { id: run.id, jobName, status: "SUCCESS", durationMs, summary: summary ?? undefined };
  } catch (err) {
    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();
    const serialized = safeSerializeError(err);

    await db.jobRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        finishedAt,
        durationMs,
        errorCode: serialized.name,
        safeErrorMessage: serialized.message,
      },
    });

    logger.error("job.failed", {
      service: "jobs",
      component: jobName,
      outcome: "FAILED",
      durationMs,
      errorCode: serialized.name,
      safeMessage: serialized.message,
      requestId: opts?.requestId,
    });

    return {
      id: run.id,
      jobName,
      status: "FAILED",
      durationMs,
      errorCode: serialized.name,
      safeErrorMessage: serialized.message,
    };
  }
}
