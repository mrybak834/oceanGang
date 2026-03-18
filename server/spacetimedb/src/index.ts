// ─── SpacetimeDB Server Module: Ocean Gang Multiplayer ───
import { schema, table, t } from 'spacetimedb/server';

const spacetimedb = schema({
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
      shipState: t.string().optional(),
    }
  ),
  chatMessage: table(
    { public: true },
    {
      id: t.u64().primaryKey().autoInc(),
      sender: t.identity(),
      text: t.string(),
      timestamp: t.u64(),
    }
  ),
});

export default spacetimedb;

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
      shipState: undefined,
    });
  }
});

export const onDisconnect = spacetimedb.clientDisconnected(ctx => {
  const player = ctx.db.player.identity.find(ctx.sender);
  if (player) {
    ctx.db.player.identity.update({ ...player, online: false });
  }
});

export const updateShipState = spacetimedb.reducer(
  { shipState: t.string() },
  (ctx, { shipState }) => {
    if (shipState.length > 50000) return; // sanity limit
    const player = ctx.db.player.identity.find(ctx.sender);
    if (player) {
      ctx.db.player.identity.update({ ...player, shipState });
    }
  }
);

export const sendChat = spacetimedb.reducer(
  { text: t.string() },
  (ctx, { text }) => {
    if (text.length === 0 || text.length > 200) return;
    ctx.db.chatMessage.insert({
      id: 0n, // auto-incremented
      sender: ctx.sender,
      text,
      timestamp: BigInt(Date.now()),
    });
  }
);

export const updatePosition = spacetimedb.reducer(
  {
    x: t.f32(),
    y: t.f32(),
    z: t.f32(),
    rx: t.f32(),
    ry: t.f32(),
    rz: t.f32(),
  },
  (ctx, { x, y, z, rx, ry, rz }) => {
    const player = ctx.db.player.identity.find(ctx.sender);
    if (player) {
      ctx.db.player.identity.update({ ...player, x, y, z, rx, ry, rz });
    }
  }
);
