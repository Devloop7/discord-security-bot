// src/core/auditlog.js
// Finds who performed a moderation-relevant action. The audit-log entry can lag
// the gateway event slightly, so we retry briefly.
async function fetchExecutor(guild, type, targetId = null) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const logs = await guild.fetchAuditLogs({ type, limit: 6 });
      const entry = logs.entries.find(
        (e) => (!targetId || e.target?.id === targetId) && Date.now() - e.createdTimestamp < 10_000,
      );
      if (entry) return { executorId: entry.executor?.id ?? null, executor: entry.executor ?? null };
    } catch {
      /* missing View Audit Log permission or transient error */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return null;
}

module.exports = { fetchExecutor };
