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

// ── Available sounds for swapping ──
export const SOUND_OPTIONS = [
  { value: 'sine', label: 'Sine', group: 'Synth' },
  { value: 'triangle', label: 'Triangle', group: 'Synth' },
  { value: 'sawtooth', label: 'Sawtooth', group: 'Synth' },
  { value: 'square', label: 'Square', group: 'Synth' },
  { value: 'gm_pad_warm', label: 'Warm Pad', group: 'Pad' },
  { value: 'gm_pad_halo', label: 'Halo', group: 'Pad' },
  { value: 'gm_pad_choir', label: 'Choir', group: 'Pad' },
  { value: 'gm_fx_crystal', label: 'Crystal', group: 'Bell' },
  { value: 'gm_celesta', label: 'Celesta', group: 'Bell' },
  { value: 'gm_music_box', label: 'Music Box', group: 'Bell' },
  { value: 'gm_vibraphone', label: 'Vibes', group: 'Bell' },
  { value: 'gm_marimba', label: 'Marimba', group: 'Bell' },
  { value: 'gm_acoustic_guitar_nylon', label: 'Nylon Guitar', group: 'Pluck' },
  { value: 'gm_acoustic_guitar_steel', label: 'Steel Guitar', group: 'Pluck' },
  { value: 'gm_flute', label: 'Flute', group: 'Wind' },
  { value: 'gm_ocarina', label: 'Ocarina', group: 'Wind' },
  { value: 'brown', label: 'Brown Noise', group: 'Noise' },
  { value: 'pink', label: 'Pink Noise', group: 'Noise' },
  { value: 'white', label: 'White Noise', group: 'Noise' },
];

// Replace the .s() or sound() call for a specific instrument variable
export function applySoundSwap(code, varName, newSynth) {
  // NOTE: block terminator must be next `let`, `stack(`, or true end-of-input.
  // `\s*$` would match every line end under the m flag and truncate the block
  // to its first line, so end-of-input is spelled `\s*(?![\s\S])`.
  const blockRe = new RegExp(
    `(^let\\s+${varName}\\s*=\\s*[\\s\\S]*?)(?=^\\s*let\\s+\\w+\\s*=|^\\s*stack\\(|\\s*(?![\\s\\S]))`,
    'gm'
  );
  return code.replace(blockRe, (block) => {
    // sound("...") at start of chain
    if (/\bsound\(/.test(block)) {
      return block.replace(/(\bsound\(\s*["'`])[^"'`]+(["'`]\s*\))/, `$1${newSynth}$2`);
    }
    // .s("...") method in chain
    if (/\.s\(/.test(block)) {
      return block.replace(/(\.s\(\s*["'`])[^"'`]+(["'`]\s*\))/, `$1${newSynth}$2`);
    }
    // standalone s("...") at start
    return block.replace(/(\bs\(\s*["'`])[^"'`]+(["'`])/, `$1${newSynth}$2`);
  });
}

// True if synthType is a simple name that can be swapped
export function isSwappableSynth(synthType) {
  return !!synthType && /^[\w]+$/.test(synthType);
}

// Rebuild scene code with locked instrument blocks removed and the stack()
// call rewritten to only reference unlocked layers. Returns the original code
// untouched when everything is unlocked (preserves comments/formatting).
export function buildGatedCode(code, isUnlocked) {
  if (typeof code !== 'string' || !code) return code;
  const instruments = parseStrudelPatch(code);
  if (!instruments.length) return code;

  let unlocked = instruments.filter((inst) => isUnlocked(inst.varName));
  // Never gate down to silence — the base layer always plays
  if (!unlocked.length) unlocked = [instruments[0]];
  if (unlocked.length === instruments.length) return code;

  let gated = code;
  for (const inst of instruments) {
    if (unlocked.includes(inst)) continue;
    gated = gated.replace(inst.codeBlock, '');
  }

  const stackCall = findCallSource(gated, 'stack');
  if (stackCall) {
    const stackNames = new Set(extractStackOrder(code));
    const names = unlocked
      .filter((inst) => stackNames.has(inst.varName))
      .map((inst) => inst.varName);
    gated = gated.replace(stackCall, `stack(${(names.length ? names : [unlocked[0].varName]).join(', ')})`);
  }

  return gated.replace(/\n{3,}/g, '\n\n').trim();
}

export function parseStrudelPatch(code) {
  const stackOrder = extractStackOrder(code);
  // See applySoundSwap for why end-of-input is `\s*(?![\s\S])` and not `\s*$`
  const blocks = [...code.matchAll(/^let\s+(\w+)\s*=\s*([\s\S]*?)(?=^\s*let\s+\w+\s*=|^\s*stack\(|\s*(?![\s\S]))/gm)];
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
