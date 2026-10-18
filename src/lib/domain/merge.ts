/**
 * Merging two family files (PLAN.md "Sync model"). The merge is a join: commutative,
 * associative and idempotent, so two parents' devices converge without ever asking anyone.
 * Every register has a total order (STATE.md decision 15) and the merge keeps the larger.
 *
 * Inputs are never mutated; the result may share unchanged subtrees with them.
 */

import type { ChildProfile, DeviceProgress, FamilyFile, FamilyMember, Lww } from '../types';
import { canonicalJson, compareLww, mergeLww } from './lww';

/** Union of keys; `merge` decides a key both sides have. */
function mergeRecord<V>(a: Record<string, V>, b: Record<string, V>, merge: (x: V, y: V) => V): Record<string, V> {
  const out: Record<string, V> = {};
  for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
    const x = a[key];
    const y = b[key];
    out[key] = x === undefined ? (y as V) : y === undefined ? x : merge(x, y);
  }
  return out;
}

/** A tombstone beats any live profile; otherwise (and among tombstones) last writer wins. */
export function mergeChild(a: Lww<ChildProfile>, b: Lww<ChildProfile>): Lww<ChildProfile> {
  const deadA = a.v.deleted === true;
  const deadB = b.v.deleted === true;
  if (deadA !== deadB) return deadA ? a : b;
  return mergeLww(a, b);
}

/** Only the owning device writes its progress, so the higher `seq` is the newer copy. */
export function mergeDeviceProgress(a: DeviceProgress, b: DeviceProgress): DeviceProgress {
  if (a.seq !== b.seq) return a.seq > b.seq ? a : b;
  return canonicalJson(a) >= canonicalJson(b) ? a : b;
}

const ROLE_RANK = { writer: 0, owner: 1 } as const;

function mergeMembers(a: FamilyMember[] | undefined, b: FamilyMember[] | undefined): FamilyMember[] | undefined {
  if (a === undefined && b === undefined) return undefined;
  const byEmail = new Map<string, FamilyMember>();
  for (const m of [...(a ?? []), ...(b ?? [])]) {
    const seen = byEmail.get(m.email);
    if (!seen || ROLE_RANK[m.role] > ROLE_RANK[seen.role]) byEmail.set(m.email, { email: m.email, role: m.role });
  }
  return [...byEmail.values()].sort((x, y) => (x.email < y.email ? -1 : x.email > y.email ? 1 : 0));
}

export function mergeFamily(a: FamilyFile, b: FamilyFile): FamilyFile {
  const settings = mergeRecord(
    a.settings as Record<string, Lww<unknown>>,
    b.settings as Record<string, Lww<unknown>>,
    (x, y) => (compareLww(x, y) >= 0 ? x : y)
  ) as FamilyFile['settings'];

  const merged: FamilyFile = {
    schema: a.schema,
    familyId: a.familyId <= b.familyId ? a.familyId : b.familyId,
    contentVersion: Math.max(a.contentVersion, b.contentVersion),
    settings,
    children: mergeRecord(a.children, b.children, mergeChild),
    plans: mergeRecord(a.plans, b.plans, mergeLww),
    limits: mergeRecord(a.limits, b.limits, mergeLww),
    progress: mergeRecord(a.progress, b.progress, (x, y) => mergeRecord(x, y, mergeDeviceProgress))
  };
  const members = mergeMembers(a.members, b.members);
  if (members !== undefined) merged.members = members;
  return merged;
}
