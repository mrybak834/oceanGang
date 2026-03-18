// ─── Chat System ───
// Chat window next to compass + 3D speech bubbles above boats.

import * as THREE from 'three';
import { getPlayerName } from './multiplayer.js';

const MAX_MESSAGES = 50;
const BUBBLE_DURATION = 6000; // ms a bubble stays visible

let connection = null;
let myIdentity = null;
let scene = null;
let camera = null;
let localBoat = null;
let remotePlayers = null; // reference to multiplayer's remotePlayers map

const messages = [];
const bubbles = []; // { sprite, startTime, identity }

// ─── DOM: Chat Window ───

const chatWrap = document.createElement('div');
chatWrap.className = 'chat-wrap';

chatWrap.innerHTML = `
  <div class="chat-messages" id="chat-messages"></div>
  <form class="chat-input-row" id="chat-form">
    <input class="chat-input" id="chat-input" type="text" placeholder="Press Enter to chat..." maxlength="200" autocomplete="off" />
  </form>
`;

document.body.appendChild(chatWrap);

const elMessages = chatWrap.querySelector('#chat-messages');
const elForm = chatWrap.querySelector('#chat-form');
const elInput = chatWrap.querySelector('#chat-input');

// Block game input when typing
chatWrap.addEventListener('keydown', e => e.stopPropagation());
chatWrap.addEventListener('keyup', e => e.stopPropagation());
chatWrap.addEventListener('mousedown', e => e.stopPropagation());
chatWrap.addEventListener('wheel', e => e.stopPropagation());

// Enter to focus input
window.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && document.activeElement !== elInput) {
    e.preventDefault();
    elInput.focus();
  }
});

// Submit chat
elForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = elInput.value.trim();
  if (!text || !connection) return;
  connection.reducers.sendChat({ text });
  elInput.value = '';
  elInput.blur();
});

// ─── Init ───

export function initChat(conn, identity, sceneRef, cameraRef, boat, remotePlayersRef) {
  connection = conn;
  myIdentity = identity;
  scene = sceneRef;
  camera = cameraRef;
  localBoat = boat;
  remotePlayers = remotePlayersRef;

  // Subscribe to chat messages
  conn.db.chatMessage.onInsert((_ctx, msg) => {
    const isSelf = msg.sender.isEqual(myIdentity);
    const name = isSelf ? 'You' : getPlayerName(msg.sender.toHexString());
    addMessage(name, msg.text, isSelf);
    spawnBubble(msg.sender, msg.text);
  });
}

// ─── Chat Messages List ───

function addMessage(sender, text, isSelf) {
  messages.push({ sender, text, isSelf });
  if (messages.length > MAX_MESSAGES) messages.shift();

  const div = document.createElement('div');
  div.className = 'chat-msg' + (isSelf ? ' chat-msg-self' : '');
  div.innerHTML = `<span class="chat-sender">${isSelf ? 'You' : sender}</span> ${escapeHtml(text)}`;
  elMessages.appendChild(div);

  // Trim DOM
  while (elMessages.children.length > MAX_MESSAGES) {
    elMessages.removeChild(elMessages.firstChild);
  }

  elMessages.scrollTop = elMessages.scrollHeight;
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── 3D Speech Bubbles ───

function spawnBubble(senderIdentity, text) {
  // Find the boat for this sender
  let targetBoat = null;
  if (myIdentity && senderIdentity.isEqual(myIdentity)) {
    targetBoat = localBoat;
  } else if (remotePlayers) {
    const key = senderIdentity.toHexString();
    const remote = remotePlayers.get(key);
    if (remote) targetBoat = remote.boat;
  }
  if (!targetBoat) return;

  // Create a canvas texture for the bubble
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const fontSize = 28;
  const padding = 16;
  const maxWidth = 400;

  ctx.font = `${fontSize}px sans-serif`;

  // Word wrap
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';
  for (const word of words) {
    const test = currentLine ? currentLine + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = test;
    }
  }
  if (currentLine) lines.push(currentLine);

  const lineHeight = fontSize * 1.3;
  const textWidth = Math.min(maxWidth, Math.max(...lines.map(l => ctx.measureText(l).width)));
  const w = textWidth + padding * 2;
  const h = lines.length * lineHeight + padding * 2;
  const tailH = 12;

  canvas.width = Math.ceil(w);
  canvas.height = Math.ceil(h + tailH);

  // Draw bubble background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  const r = 12;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(w - r, 0);
  ctx.quadraticCurveTo(w, 0, w, r);
  ctx.lineTo(w, h - r);
  ctx.quadraticCurveTo(w, h, w - r, h);
  // Tail
  ctx.lineTo(w * 0.55, h);
  ctx.lineTo(w * 0.5, h + tailH);
  ctx.lineTo(w * 0.45, h);
  ctx.lineTo(r, h);
  ctx.quadraticCurveTo(0, h, 0, h - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.fill();

  // Draw text
  ctx.font = `${fontSize}px sans-serif`;
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'top';
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], padding, padding + i * lineHeight);
  }

  // Create sprite
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  });
  const sprite = new THREE.Sprite(material);

  // Scale: ~1 pixel = 0.1 world units
  const scale = 0.08;
  sprite.scale.set(canvas.width * scale, canvas.height * scale, 1);

  // Add to scene (not boat — boat has 2.5x scale which distorts children)
  sprite.position.set(
    targetBoat.position.x,
    targetBoat.position.y + 30,
    targetBoat.position.z,
  );
  scene.add(sprite);

  bubbles.push({
    sprite,
    boat: targetBoat,
    startTime: Date.now(),
  });
}

// ─── Update (call each frame) ───

export function updateChat() {
  const now = Date.now();

  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i];
    const age = now - b.startTime;

    if (age > BUBBLE_DURATION) {
      b.boat.remove(b.sprite);
      b.sprite.material.map.dispose();
      b.sprite.material.dispose();
      bubbles.splice(i, 1);
      continue;
    }

    // Follow boat position
    b.sprite.position.set(
      b.boat.position.x,
      b.boat.position.y + 30,
      b.boat.position.z,
    );

    // Fade out in last second
    const fadeStart = BUBBLE_DURATION - 1000;
    if (age > fadeStart) {
      b.sprite.material.opacity = 1 - (age - fadeStart) / 1000;
    }
  }
}
