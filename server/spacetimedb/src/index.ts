// ─── SpacetimeDB Server Module: Ocean Gang Multiplayer ───
import { schema, table, t } from 'spacetimedb/server';

const spacetimedb = schema({
  // ── World state ──
  player: table(
    { public: true },
    {
      identity: t.identity().primaryKey(),
      x: t.f32(),
      y: t.f32(),
      z: t.f32(),
      rx: t.f32(),
      ry: t.f32(),
      rz: t.f32(),
      online: t.bool(),
    }
  ),

  // ── Chat ──
  chatMessage: table(
    { public: true },
    {
      id: t.u64().primaryKey().autoInc(),
      sender: t.identity(),
      text: t.string(),
      timestamp: t.u64(),
    }
  ),

  // ── Generic object system ──

  // Base definition for each editable object type ("ship", "tavern", etc.)
  gameObject: table(
    { public: true },
    {
      id: t.string().primaryKey(),
      category: t.string(),
      baseState: t.string(), // JSON of default part positions
    }
  ),

  // Each player's live state per object type (what others see in-game)
  playerObject: table(
    { public: true },
    {
      id: t.u64().primaryKey().autoInc(),
      owner: t.identity().index('btree'),
      objectId: t.string(),
      liveState: t.string(), // JSON of current modifications
    }
  ),

  // Named presets saved by players
  playerPreset: table(
    { public: true },
    {
      id: t.u64().primaryKey().autoInc(),
      owner: t.identity().index('btree'),
      objectId: t.string(),
      name: t.string(),
      state: t.string(), // JSON snapshot
    }
  ),
});

export default spacetimedb;

// ── Lifecycle ──

export const init = spacetimedb.init(_ctx => {});

export const onConnect = spacetimedb.clientConnected(ctx => {
  const existing = ctx.db.player.identity.find(ctx.sender);
  if (existing) {
    ctx.db.player.identity.update({ ...existing, online: true });
  } else {
    ctx.db.player.insert({
      identity: ctx.sender,
      x: 0, y: 0, z: 0,
      rx: 0, ry: 0, rz: 0,
      online: true,
    });
  }
});

export const onDisconnect = spacetimedb.clientDisconnected(ctx => {
  const player = ctx.db.player.identity.find(ctx.sender);
  if (player) {
    ctx.db.player.identity.update({ ...player, online: false });
  }
});

// ── Position sync ──

export const updatePosition = spacetimedb.reducer(
  {
    x: t.f32(), y: t.f32(), z: t.f32(),
    rx: t.f32(), ry: t.f32(), rz: t.f32(),
  },
  (ctx, { x, y, z, rx, ry, rz }) => {
    const player = ctx.db.player.identity.find(ctx.sender);
    if (player) {
      ctx.db.player.identity.update({ ...player, x, y, z, rx, ry, rz });
    }
  }
);

// ── Chat ──

export const sendChat = spacetimedb.reducer(
  { text: t.string() },
  (ctx, { text }) => {
    if (text.length === 0 || text.length > 200) return;
    ctx.db.chatMessage.insert({
      id: 0n,
      sender: ctx.sender,
      text,
      timestamp: BigInt(Date.now()),
    });
  }
);

// ── Game objects ──

// Seed or update a base object definition
export const seedGameObject = spacetimedb.reducer(
  { id: t.string(), category: t.string(), baseState: t.string() },
  (ctx, { id, category, baseState }) => {
    if (baseState.length > 100000) return;
    const existing = ctx.db.gameObject.id.find(id);
    if (existing) {
      ctx.db.gameObject.id.update({ ...existing, category, baseState });
    } else {
      ctx.db.gameObject.insert({ id, category, baseState });
    }
  }
);

// Update a player's live object state
export const updateLiveState = spacetimedb.reducer(
  { objectId: t.string(), liveState: t.string() },
  (ctx, { objectId, liveState }) => {
    if (liveState.length > 50000) return;
    // Find existing playerObject for this owner + objectId
    let found = null;
    for (const row of ctx.db.playerObject.iter()) {
      if (row.owner.isEqual(ctx.sender) && row.objectId === objectId) {
        found = row;
        break;
      }
    }
    if (found) {
      ctx.db.playerObject.id.update({ ...found, liveState });
    } else {
      ctx.db.playerObject.insert({ id: 0n, owner: ctx.sender, objectId, liveState });
    }
  }
);

// Restore to base default
export const restoreDefault = spacetimedb.reducer(
  { objectId: t.string() },
  (ctx, { objectId }) => {
    const gameObj = ctx.db.gameObject.id.find(objectId);
    if (!gameObj) return;
    for (const row of ctx.db.playerObject.iter()) {
      if (row.owner.isEqual(ctx.sender) && row.objectId === objectId) {
        ctx.db.playerObject.id.update({ ...row, liveState: gameObj.baseState });
        return;
      }
    }
    // No row yet — create one with base state
    ctx.db.playerObject.insert({ id: 0n, owner: ctx.sender, objectId, liveState: gameObj.baseState });
  }
);

// Save a named preset
export const savePreset = spacetimedb.reducer(
  { objectId: t.string(), name: t.string(), state: t.string() },
  (ctx, { objectId, name, state }) => {
    if (state.length > 50000 || name.length > 100) return;
    // Limit to 20 presets per object per player
    let count = 0;
    for (const row of ctx.db.playerPreset.iter()) {
      if (row.owner.isEqual(ctx.sender) && row.objectId === objectId) count++;
    }
    if (count >= 20) return;
    ctx.db.playerPreset.insert({ id: 0n, owner: ctx.sender, objectId, name, state });
  }
);

// Load a preset into live state
export const loadPreset = spacetimedb.reducer(
  { presetId: t.u64() },
  (ctx, { presetId }) => {
    const preset = ctx.db.playerPreset.id.find(presetId);
    if (!preset || !preset.owner.isEqual(ctx.sender)) return;
    // Find or create playerObject
    for (const row of ctx.db.playerObject.iter()) {
      if (row.owner.isEqual(ctx.sender) && row.objectId === preset.objectId) {
        ctx.db.playerObject.id.update({ ...row, liveState: preset.state });
        return;
      }
    }
    ctx.db.playerObject.insert({ id: 0n, owner: ctx.sender, objectId: preset.objectId, liveState: preset.state });
  }
);

// Delete a preset
export const deletePreset = spacetimedb.reducer(
  { presetId: t.u64() },
  (ctx, { presetId }) => {
    const preset = ctx.db.playerPreset.id.find(presetId);
    if (!preset || !preset.owner.isEqual(ctx.sender)) return;
    ctx.db.playerPreset.id.delete(presetId);
  }
);
