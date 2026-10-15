export type DurableDeletionTarget = [collectionName: string, entityId: string, reason: string];
export type DeleteTarget = (collectionName: string, entityId: string, reason: string) => Promise<boolean>;

export function isEntityTombstoned(tombstoneSet: ReadonlySet<string>, collectionName: string, entityId: string): boolean {
  return tombstoneSet.has(`${collectionName}_${entityId}`) ||
    tombstoneSet.has(`${collectionName}:${entityId}`) ||
    tombstoneSet.has(entityId);
}

/**
 * Await each tombstone-backed delete in order and stop on the first failure.
 * Callers must not remove the local account row unless this operation succeeds.
 */
export async function requireConfirmedDeletions(
  targets: DurableDeletionTarget[],
  deleteTarget: DeleteTarget
): Promise<void> {
  for (const [collectionName, entityId, reason] of targets) {
    if (await deleteTarget(collectionName, entityId, reason)) continue;

    const error: any = new Error(
      `Deletion is incomplete: durable deletion could not be confirmed for ${collectionName}/${entityId}. Retry after persistence is available.`
    );
    error.statusCode = 503;
    throw error;
  }
}
