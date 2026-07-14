export interface ExactNameDirectoryEntry { id: string; name: string }
export interface ExactNameIdentityMatch {
  idsByName: Record<string, string>;
  matched: string[];
  missing: string[];
  ambiguous: string[];
}

const key = (value: unknown) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();

export function matchExactNamesToUniqueIds(names: string[], entries: ExactNameDirectoryEntry[]): ExactNameIdentityMatch {
  const normalizedNames = [...new Map(names.map((name) => [key(name), String(name).replace(/\s+/g, ' ').trim()])).entries()]
    .filter(([nameKey]) => Boolean(nameKey));
  const entriesByKey = new Map<string, ExactNameDirectoryEntry[]>();
  entries.forEach((entry) => entriesByKey.set(key(entry.name), [...(entriesByKey.get(key(entry.name)) || []), entry]));
  return normalizedNames.reduce<ExactNameIdentityMatch>((result, [nameKey, displayName]) => {
    const matches = entriesByKey.get(nameKey) || [];
    if (matches.length === 1) {
      result.matched.push(displayName);
      result.idsByName[displayName] = matches[0].id;
    } else if (matches.length > 1) result.ambiguous.push(displayName);
    else result.missing.push(displayName);
    return result;
  }, { idsByName: {}, matched: [], missing: [], ambiguous: [] });
}
