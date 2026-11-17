/**
 * Guard positional SQLite bindings against silent parameter shifts.
 * Ignore placeholders inside SQL comments and quoted literals/identifiers.
 */
export function countSqlParameterPlaceholders(sql: string): number {
  const withoutComments = String(sql || '')
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const withoutQuotedContent = withoutComments
    .replace(/'(?:''|[^'])*'/g, "''")
    .replace(/"(?:[^"]|"")*"/g, '""');
  return (withoutQuotedContent.match(/\?/g) || []).length;
}

export function assertSqlParameterCount(
  sql: string,
  parameters: readonly unknown[],
  context = 'SQL statement',
): number {
  const expected = countSqlParameterPlaceholders(sql);
  const provided = parameters.length;
  if (expected !== provided) {
    throw new Error(
      `SQL_BIND_PARAMETER_MISMATCH: ${context} expects ${expected} positional values but received ${provided}.`
    );
  }
  return expected;
}
