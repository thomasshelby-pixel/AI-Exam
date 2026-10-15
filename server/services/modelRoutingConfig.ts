export interface ModelRoutingConfiguration {
  primaryModel: string;
  fallbackOrder: string[];
  updatedAt?: string;
  updatedBy?: string;
}

export interface ModelRoutingRow {
  id: string;
  is_primary: number;
  is_enabled: number;
  fallback_order: number;
}

export function validateModelRoutingConfiguration(
  value: unknown,
  approvedModelIds: readonly string[]
): { valid: true; config: ModelRoutingConfiguration } | { valid: false; error: string } {
  if (!value || typeof value !== 'object') {
    return { valid: false, error: 'Model routing configuration is missing or malformed.' };
  }

  const candidate = value as Partial<ModelRoutingConfiguration>;
  const approved = new Set(approvedModelIds);
  if (typeof candidate.primaryModel !== 'string' || !approved.has(candidate.primaryModel)) {
    return { valid: false, error: 'The saved primary model is not in the approved registry.' };
  }
  if (!Array.isArray(candidate.fallbackOrder) || candidate.fallbackOrder.some((id) => typeof id !== 'string')) {
    return { valid: false, error: 'The saved fallback order is malformed.' };
  }
  if (new Set(candidate.fallbackOrder).size !== candidate.fallbackOrder.length) {
    return { valid: false, error: 'The saved fallback order contains duplicate models.' };
  }
  if (candidate.fallbackOrder.includes(candidate.primaryModel)) {
    return { valid: false, error: 'The primary model cannot also appear in its fallback order.' };
  }
  if (candidate.fallbackOrder.some((id) => !approved.has(id))) {
    return { valid: false, error: 'The saved fallback order contains a model outside the approved registry.' };
  }

  return {
    valid: true,
    config: {
      primaryModel: candidate.primaryModel,
      fallbackOrder: [...candidate.fallbackOrder],
      ...(typeof candidate.updatedAt === 'string' ? { updatedAt: candidate.updatedAt } : {}),
      ...(typeof candidate.updatedBy === 'string' ? { updatedBy: candidate.updatedBy } : {}),
    },
  };
}

export function buildModelRoutingConfiguration(
  rows: ModelRoutingRow[],
  approvedModelIds: readonly string[]
): ModelRoutingConfiguration {
  const approved = new Set(approvedModelIds);
  const primaries = rows.filter((row) => row.is_primary === 1);
  if (primaries.length !== 1 || !approved.has(primaries[0]?.id)) {
    throw new Error('Exactly one approved primary model must be selected before routing can be persisted.');
  }
  const primaryModel = primaries[0].id;
  const fallbackOrder = rows
    .filter((row) => row.id !== primaryModel && row.is_enabled === 1 && approved.has(row.id))
    .sort((a, b) => a.fallback_order - b.fallback_order || a.id.localeCompare(b.id))
    .map((row) => row.id);
  return { primaryModel, fallbackOrder };
}

export function applyModelRoutingConfiguration(
  database: { prepare: (sql: string) => { run: (...args: unknown[]) => unknown } },
  config: ModelRoutingConfiguration,
  approvedModelIds: readonly string[]
): void {
  database.prepare('UPDATE model_configs SET is_primary = 0').run();
  if (approvedModelIds.length > 0) {
    const placeholders = approvedModelIds.map(() => '?').join(',');
    database.prepare(`UPDATE model_configs SET is_enabled = 0 WHERE id IN (${placeholders})`).run(...approvedModelIds);
  }
  database.prepare('UPDATE model_configs SET is_primary = 1, is_enabled = 1 WHERE id = ?').run(config.primaryModel);
  config.fallbackOrder.forEach((modelId, index) => {
    database.prepare('UPDATE model_configs SET is_enabled = 1, fallback_order = ? WHERE id = ?').run(index + 1, modelId);
  });
}
