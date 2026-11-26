import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';

export function isPortFree(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', () => resolve(false));
    srv.listen({ port, host }, () => {
      srv.close(() => resolve(true));
    });
  });
}

export async function findFreePort(preferredPort = 4173, strict = false, host = '127.0.0.1') {
  if (await isPortFree(preferredPort, host)) {
    return preferredPort;
  }
  if (strict) {
    throw new Error(`Preferred port ${preferredPort} is in use and --strict-port was specified.`);
  }
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen({ port: 0, host }, () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

export function killProcessTree(child) {
  if (!child || !child.pid || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      });
    } catch {
      // Child already terminated (exit 128)
    }
  } else {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      try {
        child.kill('SIGKILL');
      } catch {
        // Ignore
      }
    }
  }
}

export async function waitForHttpReady(url, { timeoutMs = 15000, intervalMs = 150, child = null } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastErr = null;
  while (Date.now() < deadline) {
    if (child && child.exitCode !== null) {
      throw new Error(`Server process exited early with code ${child.exitCode}`);
    }
    try {
      const res = await fetch(url, { method: 'GET' });
      if (res.status >= 200 && res.status < 500) {
        return;
      }
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Timed out waiting for ${url}: ${lastErr ? lastErr.message : 'unknown error'}`);
}

export async function startViteServer({
  rootDir,
  mode = 'preview',
  port = 4173,
  strictPort = false,
  host = '127.0.0.1',
} = {}) {
  const viteBin = path.resolve(rootDir, 'node_modules/vite/bin/vite.js');
  if (!fs.existsSync(viteBin)) {
    throw new Error(`Vite binary not found at ${viteBin}. Run npm install first.`);
  }

  const chosenPort = await findFreePort(port, strictPort, host);
  const args = [viteBin, mode, '--port', String(chosenPort), '--strictPort', '--host', host];

  const child = spawn(process.execPath, args, {
    cwd: rootDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    detached: process.platform !== 'win32',
  });

  let logs = '';
  child.stdout?.on('data', (chunk) => {
    logs += chunk.toString();
  });
  child.stderr?.on('data', (chunk) => {
    logs += chunk.toString();
  });

  const cleanup = () => killProcessTree(child);
  const onSigInt = () => {
    cleanup();
    process.exit(130);
  };
  const onSigTerm = () => {
    cleanup();
    process.exit(143);
  };
  process.once('exit', cleanup);
  process.once('SIGINT', onSigInt);
  process.once('SIGTERM', onSigTerm);

  const url = `http://${host}:${chosenPort}`;
  try {
    await waitForHttpReady(url, { timeoutMs: 20000, intervalMs: 150, child });
  } catch (err) {
    cleanup();
    process.removeListener('exit', cleanup);
    process.removeListener('SIGINT', onSigInt);
    process.removeListener('SIGTERM', onSigTerm);
    throw new Error(`${err.message}\nVite output:\n${logs}`);
  }

  const stop = async () => {
    cleanup();
    process.removeListener('exit', cleanup);
    process.removeListener('SIGINT', onSigInt);
    process.removeListener('SIGTERM', onSigTerm);
  };

  return { url, port: chosenPort, child, stop, getLogs: () => logs };
}
