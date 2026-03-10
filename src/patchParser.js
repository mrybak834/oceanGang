function titleCase(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function splitArgs(args) {
  const parts = [];
  let current = '';
  let depth = 0;
  let quote = null;

  for (let i = 0; i < args.length; i++) {
    const char = args[i];
    const prev = args[i - 1];

    if (quote) {
      current += char;
      if (char === quote && prev !== '\\') quote = null;
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      current += char;
      continue;
    }

    if (char === '(' || char === '[' || char === '{') depth++;
    if (char === ')' || char === ']' || char === '}') depth--;

    if (char === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  if (current.trim()) parts.push(current.trim());
  return parts;
}

function findCallSource(code, callName) {
  const callPattern = `${callName}(`;
  const start = code.indexOf(callPattern);
  if (start === -1) return null;

  let depth = 0;
  let quote = null;
  let end = -1;
  for (let i = start + callPattern.length - 1; i < code.length; i++) {
    const char = code[i];
    const prev = code[i - 1];

    if (quote) {
      if (char === quote && prev !== '\\') quote = null;
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }

    if (char === '(') depth++;
    if (char === ')') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  if (end === -1) return null;
  return code.slice(start, end + 1);
}

function extractStackOrder(code) {
  const stackCall = findCallSource(code, 'stack');
  if (!stackCall) return [];
  const args = stackCall.slice('stack('.length, -1);
  return splitArgs(args).map((part) => part.replace(/^\$:/, '').trim()).filter(Boolean);
}

function extractSynthType(block) {
  const soundMatch = block.match(/\bsound\(\s*["'`]([^"'`]+)["'`]\s*\)/);
  if (soundMatch) return soundMatch[1];

  const shortMatch = block.match(/\.s\(\s*["'`]([^"'`]+)["'`]\s*\)/);
  if (shortMatch) return shortMatch[1];

  const sampleMatch = block.match(/\bs\(\s*["'`]([^"'`]+)["'`]\s*\)/);
  return sampleMatch ? sampleMatch[1] : null;
}

function extractParams(block) {
  const params = {};
  const regex = /\.([a-zA-Z_]\w*)\(([^()]*(?:\([^)]*\)[^()]*)*)\)/g;
  for (const match of block.matchAll(regex)) {
    const [, method, rawValue] = match;
    if (method === 's') continue;
    const value = rawValue.trim();
    params[method] = {
      value,
      dynamic: /(perlin|sine|cosine|rand|slider|segment|range|slow|fast|sometimes|jux|rev|\=\>)/.test(value),
    };
  }
  return params;
}

function buildCost(index, complexity) {
  const tier = index === 0 ? 0 : index <= 2 ? 1 : index <= 4 ? 2 : 3;
  const baseCost = Math.max(4, 4 + complexity * 2);
  if (tier === 0) return {};
  if (tier === 1) return { Wood: baseCost, Stone: Math.round(baseCost * 0.6) };
  if (tier === 2) return { Stone: Math.round(baseCost * 0.8), Iron: baseCost };
  return { Iron: Math.round(baseCost * 0.6), Gold: baseCost };
}

export function parseStrudelPatch(code) {
  const stackOrder = extractStackOrder(code);
  const blocks = [...code.matchAll(/^let\s+(\w+)\s*=\s*([\s\S]*?)(?=^\s*let\s+\w+\s*=|^\s*stack\(|\s*$)/gm)];
  const stackIndexByName = new Map(stackOrder.map((name, index) => [name, index]));

  return blocks.map((match, fallbackIndex) => {
    const varName = match[1];
    const codeBlock = match[0].trim();
    const params = extractParams(codeBlock);
    const complexity = Object.keys(params).length;
    const stackIndex = stackIndexByName.has(varName) ? stackIndexByName.get(varName) : fallbackIndex;

    return {
      varName,
      codeBlock,
      synthType: extractSynthType(codeBlock),
      hasNotes: /\bnote\(/.test(codeBlock),
      params,
      displayName: titleCase(varName),
      complexity,
      stackIndex,
      cost: buildCost(stackIndex, complexity),
    };
  }).sort((a, b) => a.stackIndex - b.stackIndex);
}
