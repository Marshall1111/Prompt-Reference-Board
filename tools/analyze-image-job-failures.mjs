// 历史生图任务失败分析工具
//
// 用途：扫描 data/image-jobs 下的所有任务记录，对失败任务做归类，
//       区分「API 供应商自身问题」与「用户图片问题」，并输出统计报告。
//
// 运行：node tools/analyze-image-job-failures.mjs
// 可选参数：
//   --limit N         只输出前 N 条失败任务明细（默认 30）
//   --json            输出 JSON 格式完整结果
//
// 注意：本脚本的分类逻辑与 server/index.js 中的
//       isProviderCausedAttemptFailure 保持一致。

import path from "node:path";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const jobsRoot = path.join(rootDir, "data", "image-jobs");

const DEMOTION_THRESHOLD = 2;
const DEMOTION_WINDOW_MS = 60 * 60 * 1000;

const args = process.argv.slice(2);
const limitArg = args.find((item) => item.startsWith("--limit=")) || args.find((item) => item === "--limit");
const detailLimit = Number((args.find((item) => item.startsWith("--limit=")) || "").split("=")[1] || (limitArg === "--limit" ? (args[args.indexOf("--limit") + 1] ?? 30) : 30)) || 30;
const asJson = args.includes("--json");

function classifyAttempt(attempt) {
  if (!attempt || typeof attempt !== "object") return "unknown";
  if (attempt.status === "succeeded") return "success";
  if (attempt.status === "aborted") return "aborted";
  return isProviderCausedAttemptFailure(attempt) ? "provider" : "not-provider";
}

function isProviderCausedAttemptFailure(attempt) {
  if (!attempt || !attempt.provider) return false;
  if (attempt.status === "aborted") return false;
  const status = Number(attempt.statusCode) || 0;
  const message = String(attempt.message || "").toLowerCase();
  const hasInfrastructureKeyword =
    /fetch failed|econn|network|socket|timed out|timeout|gateway|upstream|unavailable|internal server|bad gateway|service temporarily|temporarily unavailable|html|tengine|nginx|cloudflare|could not|too many requests|quota|rate limit|insufficient|billing|payment|balance|account|server error/i.test(
      message
    );
  if (status >= 500 || status === 429 || status === 408) return true;
  if (hasInfrastructureKeyword) return true;
  if (status === 401 || status === 403 || status === 404) return true;
  if (status >= 400 && status < 500) {
    const userInputKeyword =
      /image|photo|reference|input_image|attachment|file|invalid_request_error|content|moderation|safety|violat|banned|bad request|unsupported image|corrupt|decod|too large|安全|政策|被拦截|不适合|违规|审核|不安全|not allowed|policy/i.test(
        message
      );
    return !userInputKeyword;
  }
  return false;
}

// 对于没有 attempts 的旧任务，仅凭最终错误信息做粗略归类。
function classifyFinalMessage(message) {
  const text = String(message || "").toLowerCase();
  if (/fetch failed|econn|network|socket|timed out|timeout|gateway|upstream|unavailable|internal server|bad gateway|html|tengine|nginx|cloudflare|quota|rate limit|balance|account/i.test(text)) return "provider";
  if (/image|photo|reference|moderation|safety|violat|banned|unsupported image|corrupt|too large|content policy|安全|政策|被拦截|不适合|违规|审核|不安全/i.test(text)) return "user-image";
  return "unknown";
}

function classifyFailedJob(job) {
  const attempts = Array.isArray(job?.telemetry?.attempts) ? job.telemetry.attempts : [];
  if (attempts.length) {
    const labels = attempts.map(classifyAttempt);
    const failures = labels.filter((label) => label !== "success");
    if (failures.some((label) => label === "provider")) return { category: "provider", reason: "存在供应商自身原因导致的失败尝试" };
    if (failures.some((label) => label === "not-provider")) {
      return { category: "user-image", reason: "失败尝试均指向图片/请求内容问题" };
    }
    return { category: "aborted", reason: "任务被中止（用户取消/系统超时终止）" };
  }
  const finalMessage = job?.telemetry?.finalError || job?.message || "";
  const label = classifyFinalMessage(finalMessage);
  return {
    category: label === "provider" ? "provider" : label === "user-image" ? "user-image" : "unknown",
    reason: "旧任务无 attempts，依据最终错误信息粗略归类"
  };
}

async function loadJobs() {
  const entries = await readdir(jobsRoot, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json"));
  const jobs = [];
  for (const file of files) {
    try {
      const raw = await readFile(path.join(jobsRoot, file.name), "utf-8");
      const job = JSON.parse(raw);
      if (job && job.jobId) jobs.push(job);
    } catch {
      // 跳过无法解析的文件
    }
  }
  return jobs;
}

function summarizeMessage(message) {
  const text = String(message || "").trim();
  if (!text) return "(空)";
  if (text.length <= 90) return text;
  return `${text.slice(0, 90)}…`;
}

async function main() {
  const jobs = await loadJobs();
  const failed = jobs.filter((job) => job.status === "failed");
  const succeeded = jobs.filter((job) => job.status === "succeeded");
  // 成功但过程中发生过失败尝试的任务（说明曾被某个供应商坑过、靠兜底救回）
  const recoveredViaFallback = succeeded.filter((job) =>
    (job?.telemetry?.attempts || []).some((attempt) => attempt.status === "failed")
  );

  const categoryCounts = { provider: 0, "user-image": 0, unknown: 0, aborted: 0 };
  const providerStats = new Map(); // providerId -> { name, attempts, providerFailures, notProviderFailures, successes }
  const messageBuckets = new Map(); // 归一化失败信息 -> { count, example }
  const classified = [];

  for (const job of failed) {
    const { category, reason } = classifyFailedJob(job);
    categoryCounts[category] += 1;
    const attempts = job?.telemetry?.attempts || [];
    for (const attempt of attempts) {
      const providerId = attempt.provider?.id || "?";
      const stat = providerStats.get(providerId) || { name: attempt.provider?.name || providerId, attempts: 0, providerFailures: 0, notProviderFailures: 0, successes: 0 };
      stat.attempts += 1;
      if (attempt.status === "succeeded") stat.successes += 1;
      else if (classifyAttempt(attempt) === "provider") stat.providerFailures += 1;
      else if (attempt.status !== "aborted") stat.notProviderFailures += 1;
      providerStats.set(providerId, stat);
    }
    const key = String(job?.telemetry?.finalError || job?.message || "(未知)").replace(/\s+/g, " ").slice(0, 120);
    const bucket = messageBuckets.get(key) || { count: 0, example: summarizeMessage(job?.message) };
    bucket.count += 1;
    messageBuckets.set(key, bucket);
    classified.push({
      jobId: job.jobId,
      status: job.status,
      category,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
      mode: job.mode,
      providerId: job.provider?.id || "",
      providerName: job.provider?.name || "",
      message: summarizeMessage(job?.message || job?.telemetry?.finalError || ""),
      attemptLabels: (job?.telemetry?.attempts || []).map((attempt) => ({
        provider: attempt.provider?.name || attempt.provider?.id || "",
        status: attempt.status,
        statusCode: attempt.statusCode ?? null,
        providerCaused: classifyAttempt(attempt) === "provider",
        message: summarizeMessage(attempt.message)
      }))
    });
  }

  const total = jobs.length;
  const report = {
    summary: {
      totalJobs: total,
      succeeded: succeeded.length,
      failed: failed.length,
      recoveredViaFallback: recoveredViaFallback.length,
      successRate: total ? Math.round((succeeded.length / total) * 1000) / 10 : 0
    },
    failureClassification: categoryCounts,
    failureClassificationPercent: total ? {
      provider: total ? Math.round((categoryCounts.provider / failed.length) * 1000) / 10 : 0,
      "user-image": failed.length ? Math.round((categoryCounts["user-image"] / failed.length) * 1000) / 10 : 0,
      unknown: failed.length ? Math.round((categoryCounts.unknown / failed.length) * 1000) / 10 : 0,
      aborted: failed.length ? Math.round((categoryCounts.aborted / failed.length) * 1000) / 10 : 0
    } : {},
    providerStats: Array.from(providerStats.entries()).map(([id, stat]) => ({ id, ...stat })).sort((a, b) => b.providerFailures - a.providerFailures),
    topFailureMessages: Array.from(messageBuckets.entries()).map(([message, bucket]) => ({ message, ...bucket })).sort((a, b) => b.count - a.count).slice(0, 15),
    samples: classified.slice(0, detailLimit)
  };

  if (asJson) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }

  const pad = (text, width = 12) => String(text).padEnd(width);
  console.log("=".repeat(70));
  console.log("历史生图任务失败分析报告");
  console.log("=".repeat(70));
  console.log(`总任务：${report.summary.totalJobs}  成功：${report.summary.succeeded}  失败：${report.summary.failed}`);
  console.log(`成功率：${report.summary.successRate}%  通过兜底最终成功的任务：${report.summary.recoveredViaFallback}`);
  console.log("");
  console.log("失败任务归类（区分 API 问题 / 用户图片问题）：");
  console.log(`  [API 供应商自身问题]  ${pad(categoryCounts.provider)}  占比 ${report.failureClassificationPercent.provider}%`);
  console.log(`  [用户图片问题]        ${pad(categoryCounts["user-image"])}  占比 ${report.failureClassificationPercent["user-image"]}%`);
  console.log(`  [任务被中止]          ${pad(categoryCounts.aborted)}  占比 ${report.failureClassificationPercent.aborted}%`);
  console.log(`  [无法判断]            ${pad(categoryCounts.unknown)}  占比 ${report.failureClassificationPercent.unknown}%`);
  console.log("");
  console.log("各供应商尝试统计（供应商自身失败次数越多，越值得关注）：");
  console.log(`  ${pad("供应商", 18)}${pad("尝试", 8)}${pad("自身失败", 10)}${pad("内容问题", 10)}${pad("成功", 8)}`);
  for (const stat of report.providerStats) {
    console.log(`  ${pad(stat.name || stat.id, 18)}${pad(stat.attempts, 8)}${pad(stat.providerFailures, 10)}${pad(stat.notProviderFailures, 10)}${pad(stat.successes, 8)}`);
  }
  if (!report.providerStats.length) console.log("  （无可用尝试数据）");
  console.log("");
  console.log("高频失败信息 Top 15：");
  report.topFailureMessages.forEach((item, index) => {
    console.log(`  ${pad(index + 1, 3)} x${item.count}  ${item.message}`);
  });
  console.log("");
  console.log(`失败任务明细（前 ${report.samples.length} 条）：`);
  for (const sample of report.samples) {
    console.log(`  - [${sample.category}] ${sample.jobId}  ${sample.providerName || sample.providerId}  ${sample.createdAt || ""}`);
    for (const attempt of sample.attemptLabels) {
      console.log(`      尝试 ${attempt.provider} HTTP ${attempt.statusCode ?? "-"} ${attempt.status}${attempt.providerCaused ? " [供应商问题]" : ""}  ${attempt.message}`);
    }
    if (!sample.attemptLabels.length) console.log(`      最终错误：${sample.message}`);
  }
  console.log("");
  console.log("降级阈值：连续（1 小时内）2 次供应商自身错误触发临时降级，窗口 1 小时。");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
