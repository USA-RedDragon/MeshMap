// SPDX-License-Identifier: AGPL-3.0-or-later
// DMRHub - Run a DMR network server in a single binary
// Copyright (C) 2023-2026 Jacob McSwain
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
// The source code is available at <https://github.com/USA-RedDragon/DMRHub>

import { FetchSource, type RangeResponse, type Source } from 'pmtiles';

import { BlockCachedSource, generationOf } from './blockCache';

/** DEFAULT_BASEMAPS is where the basemap archives and their status live when the config names none. */
export const DEFAULT_BASEMAPS = ['https://tiles.squallar.app'];

/** PROBE_TIMEOUT_MS is how long one basemap may take to answer its probe before the next one is used. */
export const PROBE_TIMEOUT_MS = 3000;

/** PART_BYTES is the size of every part of an archive but the last. */
export const PART_BYTES = 500_000_000;

const MAGIC = 'PMTiles';

/** Span is the bytes of one part that a range covers, end inclusive. */
export type Span = { part: number; start: number; end: number };

/** partName is the suffix of part n of an archive. */
export function partName(n: number): string {
  return `.part${String(n).padStart(3, '0')}`;
}

/** spans splits the range of length bytes at offset into the parts it covers. */
export function spans(offset: number, length: number, partBytes: number): Span[] {
  const out: Span[] = [];
  let at = offset;
  const stop = offset + length;
  while (at < stop) {
    const part = Math.floor(at / partBytes);
    const start = at - part * partBytes;
    const end = Math.min(partBytes, start + (stop - at)) - 1;
    out.push({ part, start, end });
    at += end - start + 1;
  }
  return out;
}

/** PartsSource reads an archive that is published as parts of partBytes each. */
export class PartsSource implements Source {
  constructor(
    readonly url: string,
    readonly partBytes: number = PART_BYTES,
  ) {}

  getKey(): string {
    return this.url;
  }

  async getBytes(offset: number, length: number, signal?: AbortSignal): Promise<RangeResponse> {
    const pieces = await Promise.all(
      spans(offset, length, this.partBytes).map(async (s) => {
        const res = await fetch(this.url + partName(s.part), {
          headers: { Range: `bytes=${s.start}-${s.end}` },
          signal,
          credentials: 'omit',
        });
        if (res.status === 416) {
          return new ArrayBuffer(0);
        }
        if (!res.ok) {
          throw new Error(`Basemap part ${s.part} answered ${res.status}`);
        }
        const buf = await res.arrayBuffer();
        return res.status === 200 ? buf.slice(s.start, s.end + 1) : buf;
      }),
    );
    if (pieces.length === 1) {
      return { data: pieces[0]!, cacheControl: 'max-age=31536000' };
    }
    const total = pieces.reduce((n, p) => n + p.byteLength, 0);
    const out = new Uint8Array(total);
    let at = 0;
    for (const p of pieces) {
      out.set(new Uint8Array(p), at);
      at += p.byteLength;
    }
    return { data: out.buffer, cacheControl: 'max-age=31536000' };
  }
}

type Status = { key?: string; part_bytes?: number };

/** latestKey reads the key of the newest basemap from the status of base. */
export async function latestKey(base: string, signal?: AbortSignal): Promise<{ key: string; partBytes: number }> {
  const res = await fetch(`${base}/status/latest.json`, { cache: 'no-store', credentials: 'omit', signal });
  if (!res.ok) {
    throw new Error(`The basemap status answered ${res.status}`);
  }
  const s = (await res.json()) as Status;
  if (!s.key) {
    throw new Error('The basemap status names no archive');
  }
  return { key: s.key, partBytes: s.part_bytes || PART_BYTES };
}

async function startsWithMagic(url: string, signal?: AbortSignal): Promise<boolean> {
  const res = await fetch(url, { headers: { Range: 'bytes=0-6' }, credentials: 'omit', signal }).catch(() => null);
  if (!res?.ok) {
    return false;
  }
  const head = new Uint8Array(await res.arrayBuffer()).subarray(0, MAGIC.length);
  return new TextDecoder().decode(head) === MAGIC;
}

/** Layout is how an archive is published: in parts of partBytes each, or as one file. */
export type Layout = { parts: boolean; partBytes: number };

/** sourceOf reads archive in layout, through the block cache. */
export function sourceOf(archive: string, layout: Layout): Source {
  const inner = layout.parts ? new PartsSource(archive, layout.partBytes) : new FetchSource(archive);
  return new BlockCachedSource(inner, generationOf(archive));
}

/** archiveLayout probes url for parts, as the publisher's contract asks, then for one file. It throws when neither form holds an archive. */
export async function archiveLayout(url: string, partBytes: number, signal?: AbortSignal): Promise<Layout> {
  if (await startsWithMagic(url + partName(0), signal)) {
    return { parts: true, partBytes };
  }
  if (await startsWithMagic(url, signal)) {
    return { parts: false, partBytes };
  }
  throw new Error(`No basemap archive at ${url}`);
}

/** Basemap is an archive that answered its probe. */
export type Basemap = { archive: string; layout: Layout };

/** absolute resolves a configured basemap against the page, so a relative one works under any base path. */
function absolute(base: string): string {
  return new URL(base, document.baseURI).href.replace(/\/+$/, '');
}

/** openBasemap reads base, which is either a direct .pmtiles URL or a base that serves status/latest.json and the parts it names. */
export async function openBasemap(base: string, signal?: AbortSignal): Promise<Basemap> {
  const url = absolute(base);
  if (/\.pmtiles$/i.test(new URL(url).pathname)) {
    return { archive: url, layout: await archiveLayout(url, PART_BYTES, signal) };
  }
  const { key, partBytes } = await latestKey(url, signal);
  const archive = `${url}/${key.replace(/^\/+/, '')}`;
  return { archive, layout: await archiveLayout(archive, partBytes, signal) };
}

/** PROBE_GIVE_UP_MS is how long any basemap may take to answer at all. */
export const PROBE_GIVE_UP_MS = 20000;

/**
 * chooseBasemap probes every base at once and returns the first in order that answers. A base that has not answered
 * within timeoutMs loses its place to any later base that has, so a dead mesh server does not hold up the map, while
 * a slow page load does not skip a base that is merely late.
 */
export function chooseBasemap(bases: string[], timeoutMs: number = PROBE_TIMEOUT_MS): Promise<Basemap> {
  type Probe = { ctl: AbortController; state: 'pending' | 'ok' | 'failed'; found?: Basemap; error?: string };
  const probes: Probe[] = bases.map(() => ({ ctl: new AbortController(), state: 'pending' }));
  return new Promise((resolve, reject) => {
    let late = false;
    let settled = false;
    const finish = (err: Error | null, found?: Basemap) => {
      settled = true;
      clearTimeout(lateTimer);
      clearTimeout(giveUp);
      probes.forEach((p) => p.state === 'pending' && p.ctl.abort());
      if (err) {
        reject(err);
      } else {
        resolve(found!);
      }
    };
    const check = () => {
      if (settled) {
        return;
      }
      for (const p of probes) {
        if (p.state === 'ok') {
          finish(null, p.found);
          return;
        }
        if (p.state === 'pending' && !late) {
          return;
        }
      }
      if (probes.every((p) => p.state === 'failed')) {
        finish(new Error(`No basemap answered (${bases.map((b, i) => `${b}: ${probes[i]!.error}`).join('; ')})`));
      }
    };
    const lateTimer = setTimeout(() => {
      late = true;
      check();
    }, timeoutMs);
    const giveUp = setTimeout(() => probes.forEach((p) => p.ctl.abort()), PROBE_GIVE_UP_MS);
    bases.forEach((base, i) => {
      const p = probes[i]!;
      openBasemap(base, p.ctl.signal).then(
        (found) => {
          p.state = 'ok';
          p.found = found;
          check();
        },
        (err: unknown) => {
          p.state = 'failed';
          p.error = err instanceof Error ? err.message : String(err);
          check();
        },
      );
    });
    if (!bases.length) {
      finish(new Error('No basemap is configured'));
    }
  });
}

/** clearOldArchives drops the cached blocks of every archive but basemap. */
export async function clearOldArchives(basemap: string): Promise<void> {
  await BlockCachedSource.clearOtherGenerations([generationOf(basemap)]);
}
