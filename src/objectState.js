// ─── Object State Utilities ───
// Unified format for editable object state. Bridges between the old split
// editor/designer format and the new unified format stored in SpacetimeDB.

// Unified format:
// {
//   "Main Mast": { "pos": { "x": 0, "y": 6.1, "z": -0.5 } },
//   "Helm Wheel": {
//     "pos": { "x": 0, "y": 1.4, "z": 3.8 },
//     "children": { "_0": { "x": 0.1, "y": 0, "z": 0 } }
//   }
// }

// Split unified format back into editor + designer for apply functions
export function splitState(unified) {
  if (!unified || typeof unified !== 'object') return { editor: null, designer: null };
  const editor = {};
  const designer = {};
  for (const [name, data] of Object.entries(unified)) {
    if (data.pos) editor[name] = data.pos;
    if (data.children) designer[name] = data.children;
  }
  return { editor, designer };
}

// Build unified state from a boat's editable objects (current live positions)
export function buildUnifiedState(editableObjects) {
  const state = {};
  for (const obj of editableObjects) {
    const entry = {
      pos: {
        x: +obj.position.x.toFixed(4),
        y: +obj.position.y.toFixed(4),
        z: +obj.position.z.toFixed(4),
      },
    };
    // Capture child positions
    const children = {};
    let hasChildren = false;
    let idx = 0;
    obj.traverse((child) => {
      if (child === obj) return;
      const key = `_${idx}`;
      idx++;
      if (!child.isMesh) return;
      children[key] = {
        x: +child.position.x.toFixed(4),
        y: +child.position.y.toFixed(4),
        z: +child.position.z.toFixed(4),
      };
      hasChildren = true;
    });
    if (hasChildren) entry.children = children;
    state[obj.name] = entry;
  }
  return state;
}

// Apply unified state to a boat (snap — no interpolation)
export function applyUnifiedState(boat, unified) {
  if (!unified || typeof unified !== 'object') return;
  const { editor, designer } = splitState(unified);
  if (editor && boat.userData.applyEditorState) boat.userData.applyEditorState(editor);
  if (designer && boat.userData.applyDesignerState) boat.userData.applyDesignerState(designer);
}
