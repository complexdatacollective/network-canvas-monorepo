/** Detect repeated JSON object members before JSON.parse can overwrite them. */
export function hasDuplicateJsonObjectKeys(source) {
  const stack = [];
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '{') {
      stack.push({ kind: 'object', keys: new Set() });
      continue;
    }
    if (character === '[') {
      stack.push({ kind: 'array' });
      continue;
    }
    if (character === '}' || character === ']') {
      stack.pop();
      continue;
    }
    if (character !== '"') continue;
    const start = index;
    for (index += 1; index < source.length; index += 1) {
      if (source[index] === '\\') {
        index += 1;
        continue;
      }
      if (source[index] === '"') break;
    }
    if (index >= source.length) return false;
    let after = index + 1;
    while (/\s/.test(source[after] ?? '')) after += 1;
    if (source[after] !== ':') continue;
    const frame = stack.at(-1);
    if (frame?.kind !== 'object') continue;
    let key;
    try {
      key = JSON.parse(source.slice(start, index + 1));
    } catch {
      return false;
    }
    if (frame.keys.has(key)) return true;
    frame.keys.add(key);
  }
  return false;
}
