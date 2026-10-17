// Small, built-in-only admission checks. These settings reduce demand; they are
// not an OS-enforced memory limit for the native inference process.
import { readFileSync } from 'node:fs';
import { availableParallelism, freemem, totalmem } from 'node:os';
import { dirname, join } from 'node:path';

const MiB = 1024 * 1024;
const GiB = 1024 * MiB;
const positive = (value) => Number.isFinite(value) && value > 0;

export function memorySnapshot({ platform = process.platform, read = (file) => readFileSync(file, 'utf8'),
  total = totalmem(), available = freemem() } = {}) {
  let hostTotalBytes = total;
  let hostAvailableBytes = available;
  let cgroupLimitBytes = null;
  let cgroupAvailableBytes = null;
  if (platform === 'linux') {
    try {
      const info = read('/proc/meminfo');
      const totalKiB = Number(info.match(/^MemTotal:\s+(\d+)\s+kB/m)?.[1]);
      const availableKiB = Number(info.match(/^MemAvailable:\s+(\d+)\s+kB/m)?.[1]);
      if (positive(totalKiB)) hostTotalBytes = Math.min(hostTotalBytes, totalKiB * 1024);
      // MemAvailable includes reclaimable caches, unlike os.freemem().
      if (positive(availableKiB)) hostAvailableBytes = availableKiB * 1024;
    } catch { /* Windows/macOS and restricted Linux use OS totals. */ }
    const candidates = [
      ['/sys/fs/cgroup/memory.max', '/sys/fs/cgroup/memory.current'],
      ['/sys/fs/cgroup/memory/memory.limit_in_bytes', '/sys/fs/cgroup/memory/memory.usage_in_bytes'],
    ];
    try {
      for (const line of read('/proc/self/cgroup').split('\n')) {
        const match = line.match(/^\d+:([^:]*):(\/.*)$/);
        if (!match || match[2].split('/').includes('..')) continue;
        const unified = match[1] === '';
        if (!unified && !match[1].split(',').includes('memory')) continue;
        const base = unified ? '/sys/fs/cgroup' : '/sys/fs/cgroup/memory';
        let directory = join(base, match[2]);
        // A systemd unit's real limit is usually below the cgroup mount root.
        // Parent units may impose an additional shared limit.
        while (directory !== base && directory.startsWith(`${base}/`)) {
          candidates.push([join(directory, unified ? 'memory.max' : 'memory.limit_in_bytes'),
            join(directory, unified ? 'memory.current' : 'memory.usage_in_bytes')]);
          directory = dirname(directory);
        }
      }
    } catch { /* A restricted /proc still permits the mount-root checks. */ }
    for (const [limitFile, usageFile] of candidates) {
      try {
        const limit = Number(read(limitFile).trim());
        const usage = Number(read(usageFile).trim());
        if (positive(limit) && limit < hostTotalBytes && Number.isFinite(usage) && usage >= 0) {
          cgroupLimitBytes = Math.min(cgroupLimitBytes ?? limit, limit);
          cgroupAvailableBytes = Math.min(cgroupAvailableBytes ?? limit, Math.max(0, limit - usage));
        }
      } catch { /* No finite cgroup limit on this host. */ }
    }
  }
  hostTotalBytes = Math.max(0, hostTotalBytes);
  hostAvailableBytes = Math.max(0, Math.min(hostTotalBytes, hostAvailableBytes));
  return {
    totalBytes: Math.min(hostTotalBytes, cgroupLimitBytes ?? hostTotalBytes),
    availableBytes: Math.min(hostAvailableBytes, cgroupAvailableBytes ?? hostAvailableBytes),
    hostTotalBytes, hostAvailableBytes, cgroupLimitBytes, cgroupAvailableBytes,
  };
}

function integer(value, fallback, minimum, maximum, name) {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name}: укажите целое число от ${minimum} до ${maximum}.`);
  }
  return parsed;
}

export function resourcePlan({ env = process.env, memory = memorySnapshot(), cpuCount = availableParallelism() } = {}) {
  const requested = env.JANAMEN_RESOURCE_PROFILE || env.ASAR_RESOURCE_PROFILE || 'auto';
  if (!['auto', 'low', 'standard', 'off'].includes(requested)) {
    throw new Error('JANAMEN_RESOURCE_PROFILE: допустимы auto, low, standard, off.');
  }
  const disabled = requested === 'off' || env.ASAR_AI_DISABLED === '1' || env.ASAR_DISABLE_AI === '1';
  const profile = requested === 'standard' ? 'standard' : requested === 'low' || requested === 'off'
    || memory.totalBytes <= 8 * GiB || memory.availableBytes < 4 * GiB ? 'low' : 'standard';
  const minimumAvailableBytes = integer(env.ASAR_AI_MIN_AVAILABLE_MB, 2048, 1536, 65536, 'ASAR_AI_MIN_AVAILABLE_MB') * MiB;
  const minimumCgroupAvailableBytes = (profile === 'low' ? 768 : 1024) * MiB;
  const hostAllowed = (memory.hostAvailableBytes ?? memory.availableBytes) >= minimumAvailableBytes;
  const cgroupAllowed = memory.cgroupAvailableBytes == null || memory.cgroupAvailableBytes >= minimumCgroupAvailableBytes;
  const aiAllowed = !disabled && hostAllowed && cgroupAllowed;
  return {
    profile, aiAllowed, disabled, memory, minimumAvailableBytes, minimumCgroupAvailableBytes,
    reason: disabled ? 'disabled' : !hostAllowed ? 'memory' : !cgroupAllowed ? 'cgroup' : 'ready',
    threads: integer(env.ASAR_AI_THREADS, profile === 'low' ? 1 : Math.max(1, Math.min(2, cpuCount)), 1, 8, 'ASAR_AI_THREADS'),
    context: profile === 'low' ? 1024 : 2048,
    batch: profile === 'low' ? 64 : 128,
    microBatch: profile === 'low' ? 32 : 64,
    predictions: profile === 'low' ? 32 : 96,
    startupMs: profile === 'low' ? 60000 : 90000,
    stopBelowBytes: 768 * MiB,
    stopCgroupBelowBytes: 64 * MiB,
    nodeHeapMiB: 256,
  };
}

export function resourceMessage(plan) {
  if (plan.reason === 'disabled') return '[AI] Локальная модель отключена. Доступен поиск по базе знаний с источниками.';
  if (plan.reason === 'memory') return `[AI] Недостаточно системной памяти (${Math.round((plan.memory.hostAvailableBytes ?? plan.memory.availableBytes) / MiB)} МБ; нужно ${Math.round(plan.minimumAvailableBytes / MiB)} МБ). Доступен поиск по базе знаний с источниками.`;
  if (plan.reason === 'cgroup') return `[AI] Недостаточно памяти в лимите процесса (${Math.round(plan.memory.cgroupAvailableBytes / MiB)} МБ; нужно ${Math.round(plan.minimumCgroupAvailableBytes / MiB)} МБ). Доступен поиск по базе знаний с источниками.`;
  return `[JanaMen] Профиль ${plan.profile}: ИИ — ${plan.threads} поток(а), контекст ${plan.context}. Автоматических загрузок нет.`;
}

export function memoryPressure(plan, snapshot = memorySnapshot()) {
  return (snapshot.hostAvailableBytes ?? snapshot.availableBytes) < plan.stopBelowBytes
    || (snapshot.cgroupAvailableBytes != null && snapshot.cgroupAvailableBytes < plan.stopCgroupBelowBytes);
}
