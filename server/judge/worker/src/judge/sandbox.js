const fs = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');
const { randomUUID } = require('crypto');

const readMeta = async (metaPath) => {
  const raw = await fs.readFile(metaPath, 'utf8');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const meta = {};
  for (const line of lines) {
    const [key, ...rest] = line.split(':');
    meta[key] = rest.join(':').trim();
  }
  return meta;
};

const verdictFromMeta = (meta, outputLimitKb) => {
  if (meta.status === 'TO') return 'TLE';
  if (meta.status === 'SG' && Number(meta.exitsig || 0) === 9) return 'MLE';
  if (Number(meta['cg-mem'] || 0) > outputLimitKb * 1024) return 'OLE';
  if (meta.status === 'XX') return 'SE';
  if (meta.exitcode && Number(meta.exitcode) !== 0) return 'RE';
  return 'OK';
};

const runIsolated = async ({
  boxId,
  workDir,
  command,
  args,
  stdinPath,
  stdoutPath,
  stderrPath,
  limits,
  environment = {},
}) => {
  const metaPath = path.join(workDir, `meta-${randomUUID()}.txt`);
  const isolateArgs = [
    '--box-id', String(boxId),
    '--init',
  ];

  await spawnAndWait('isolate', isolateArgs, workDir);

  const boxedRoot = `/var/local/lib/isolate/${boxId}/box`;
  await fs.mkdir(path.join(boxedRoot, 'workspace'), { recursive: true }).catch(() => {});

  const execArgs = [
    '--box-id', String(boxId),
    '--meta', metaPath,
    '--run',
    '--cg',
    '--silent',
    '--share-net=0',
    '--fsize', String(limits.fileSizeKb),
    '--processes', String(limits.processCount),
    '--time', String(Math.ceil(limits.cpuTimeMs / 1000)),
    '--wall-time', String(Math.ceil(limits.realTimeMs / 1000)),
    '--extra-time', '1',
    '--mem', String(limits.memoryKb),
    '--stdout', stdoutPath,
    '--stderr', stderrPath,
    '--dir', `/workspace=${workDir}:rw`,
    '--dir', '/tmp:rw',
    '--env', 'HOME=/tmp',
    '--env', 'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
  ];

  if (stdinPath) {
    execArgs.push('--stdin', stdinPath);
  }

  for (const [key, value] of Object.entries(environment)) {
    execArgs.push('--env', `${key}=${value}`);
  }

  execArgs.push('--');
  execArgs.push(command, ...args);

  await spawnAndWait('isolate', execArgs, workDir, true);
  const meta = await readMeta(metaPath);

  return {
    meta,
    verdict: verdictFromMeta(meta, limits.outputLimitKb),
  };
};

const cleanupBox = async (boxId, workDir) => {
  try {
    await spawnAndWait('isolate', ['--box-id', String(boxId), '--cleanup'], workDir);
  } catch (_error) {
    return;
  }
};

const spawnAndWait = (command, args, cwd, allowExitFailure = false) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  let stdout = '';

  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });

  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  child.on('close', (code) => {
    if (code !== 0 && !allowExitFailure) {
      reject(new Error(stderr.trim() || stdout.trim() || `${command} failed with code ${code}`));
      return;
    }
    resolve({ code, stdout, stderr });
  });

  child.on('error', (error) => reject(error));
});

module.exports = {
  cleanupBox,
  runIsolated,
  spawnAndWait,
};
