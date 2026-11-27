/**
 * Single-Fetch Binary Preflight Asset Probe
 *
 * Guards GLB and HDR fetches against Vite's 200 OK text/html SPA fallback
 * and validates binary magic headers before passing buffers to Three.js loaders.
 * Integrates with THREE.LoadingManager without triggering itemError on optional
 * missing assets so the loading progress indicator reaches 100% cleanly.
 */

export const MAGIC_SIGNATURES = Object.freeze({
  glb: Object.freeze([0x67, 0x6c, 0x54, 0x46]), // 'glTF'
  hdr: Object.freeze([0x23, 0x3f]), // '#?'
});

/**
 * Checks whether leading bytes look like HTML/XML markup (even with leading whitespace or UTF-8 BOM).
 * @param {Uint8Array} bytes
 * @returns {boolean}
 */
function looksLikeHtml(bytes) {
  if (!bytes || bytes.length === 0) return false;
  let i = 0;
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    i = 3;
  }
  while (
    i < bytes.length &&
    (bytes[i] === 0x20 || bytes[i] === 0x09 || bytes[i] === 0x0a || bytes[i] === 0x0d)
  ) {
    i += 1;
  }
  return i < bytes.length && bytes[i] === 0x3c; // '<'
}

/**
 * Fetches an optional binary asset once, validates HTTP status, Content-Type,
 * minimum byte length, and binary magic bytes.
 *
 * @param {string} url
 * @param {object} [options]
 * @param {'glb'|'hdr'} [options.expectedType]
 * @param {number[]} [options.magicBytes]
 * @param {number} [options.minBytes=12]
 * @param {import('three').LoadingManager|null} [options.loadingManager=null]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{ ok: true, buffer: ArrayBuffer, contentType: string, url: string } | { ok: false, reason: string, status: number, contentType: string, url: string }>}
 */
export async function probeBinaryAsset(
  url,
  { expectedType, magicBytes, minBytes = 12, loadingManager = null, signal = undefined } = {}
) {
  if (loadingManager && typeof loadingManager.itemStart === 'function') {
    loadingManager.itemStart(url);
  }

  try {
    const res = await fetch(url, { signal, cache: 'default' });
    const contentType = (res.headers.get('content-type') || '').toLowerCase();

    if (!res.ok) {
      return {
        ok: false,
        reason: 'http-error',
        status: res.status,
        contentType,
        url,
      };
    }

    if (
      contentType.includes('text/html') ||
      contentType.includes('application/xhtml+xml')
    ) {
      return {
        ok: false,
        reason: 'html-fallback',
        status: res.status,
        contentType,
        url,
      };
    }

    const buffer = await res.arrayBuffer();
    if (buffer.byteLength < minBytes) {
      return {
        ok: false,
        reason: 'truncated',
        status: res.status,
        contentType,
        url,
      };
    }

    const bytes = new Uint8Array(buffer, 0, Math.min(32, buffer.byteLength));
    if (bytes[0] === 0x3c || looksLikeHtml(bytes)) {
      return {
        ok: false,
        reason: 'html-fallback',
        status: res.status,
        contentType,
        url,
      };
    }

    if (expectedType === 'glb') {
      const sig = MAGIC_SIGNATURES.glb;
      const validMagic =
        bytes[0] === sig[0] &&
        bytes[1] === sig[1] &&
        bytes[2] === sig[2] &&
        bytes[3] === sig[3];
      const version = new DataView(buffer).getUint32(4, true);
      if (!validMagic || version !== 2) {
        return {
          ok: false,
          reason: 'invalid-magic',
          status: res.status,
          contentType,
          url,
        };
      }
    } else if (expectedType === 'hdr') {
      const sig = MAGIC_SIGNATURES.hdr;
      const validMagic = bytes[0] === sig[0] && bytes[1] === sig[1];
      if (!validMagic) {
        return {
          ok: false,
          reason: 'invalid-magic',
          status: res.status,
          contentType,
          url,
        };
      }
    } else if (Array.isArray(magicBytes) && magicBytes.length > 0) {
      const validCustom = magicBytes.every((b, idx) => bytes[idx] === b);
      if (!validCustom) {
        return {
          ok: false,
          reason: 'invalid-magic',
          status: res.status,
          contentType,
          url,
        };
      }
    }

    return {
      ok: true,
      buffer,
      contentType,
      url,
    };
  } catch (err) {
    return {
      ok: false,
      reason: err?.name === 'AbortError' ? 'aborted' : 'network-error',
      status: 0,
      contentType: '',
      url,
    };
  } finally {
    if (loadingManager && typeof loadingManager.itemEnd === 'function') {
      loadingManager.itemEnd(url);
    }
  }
}

/**
 * Probes an optional glTF binary (.glb) asset.
 * @param {string} url
 * @param {import('three').LoadingManager|null} [loadingManager=null]
 * @param {AbortSignal} [signal]
 */
export function probeModelAsset(url, loadingManager = null, signal = undefined) {
  return probeBinaryAsset(url, {
    expectedType: 'glb',
    minBytes: 12,
    loadingManager,
    signal,
  });
}

/**
 * Probes an optional Radiance RGBE (.hdr) environment map asset.
 * @param {string} url
 * @param {import('three').LoadingManager|null} [loadingManager=null]
 * @param {AbortSignal} [signal]
 */
export function probeHdrAsset(url, loadingManager = null, signal = undefined) {
  return probeBinaryAsset(url, {
    expectedType: 'hdr',
    minBytes: 16,
    loadingManager,
    signal,
  });
}
