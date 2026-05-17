import React, { useState, useEffect, useRef, useCallback } from 'react';

// ============================================================================
// カラクリ庭 (Karakuri-tei) v1.0
// 物理連鎖 × 最少手数最適化 × 和テイストのじっくり解くパズル
// ============================================================================

// === 定数 ===
const CELL = 30;
const COLS = 12;
const ROWS = 18;
const W = COLS * CELL;
const H = ROWS * CELL;

const PALETTE = {
  ink:      '#2B2A28',
  inkSoft:  '#4A4844',
  sand:     '#E8DFC9',
  sandPale: '#F2EBD9',
  sandDark: '#D4C9AE',
  moss:     '#5C6F4A',
  mossPale: '#8A9B71',
  vermilion:'#B53E3A',
  vermSoft: '#C76C68',
  shadow:   'rgba(43,42,40,0.18)',
  highlight:'rgba(92,111,74,0.25)',
  invalid:  'rgba(181,62,58,0.20)',
  trail:    'rgba(74,72,68,0.28)',
};

// 物理
const GRAVITY = 1100;       // px/s^2
const BALL_R = 11;
const DT = 1/60;
const MAX_SIM_SECONDS = 30;
const MAX_STEPS = MAX_SIM_SECONDS * 60;

// 永続化キー
const STORAGE_KEY = 'karakuri:state:v1';

// === ピース型 ===
// 各ピースは「線分の集合」と「特殊属性」を持つ
// 動的ピース（振り子、風車）は state を持ち、毎フレーム形状が更新される

const PIECE_DEFS = {
  ramp_s: {
    name: '小傾斜板',
    description: '短い斜面。玉を滑らせる',
    width: 1.6, height: 0.4,
    rotations: [-60, -45, -30, 30, 45, 60],
    flippable: true,
    restitution: 0.25,
    friction: 0.04,
  },
  ramp_l: {
    name: '大傾斜板',
    description: '長い斜面。遠くまで運ぶ',
    width: 3.0, height: 0.4,
    rotations: [-60, -45, -30, 30, 45, 60],
    flippable: true,
    restitution: 0.25,
    friction: 0.04,
  },
  chute_h: {
    name: '竹樋（直）',
    description: '水平の管。玉を水平に運ぶ',
    width: 2.4, height: 0.9,
    rotations: [0],
    flippable: false,
    restitution: 0.1,
    friction: 0.06,
  },
  chute_l: {
    name: '竹樋（曲）',
    description: 'L字の管。方向を90°変える',
    width: 2.0, height: 2.0,
    rotations: [0, 90, 180, 270],
    flippable: false,
    restitution: 0.1,
    friction: 0.06,
  },
  spring: {
    name: '反発ばね',
    description: '当たった玉を強く跳ね返す',
    width: 1.0, height: 0.7,
    rotations: [0, 90, 180, 270],
    flippable: false,
    restitution: 1.6,
    friction: 0.02,
  },
  pendulum: {
    name: '振り子',
    description: '揺れて玉を打ち返す',
    width: 1.6, height: 2.8,
    rotations: [0],
    flippable: false,
    restitution: 0.6,
    friction: 0.04,
    dynamic: true,
  },
  gate: {
    name: '反転扉',
    description: '玉が触れると向きが反転する',
    width: 1.4, height: 0.4,
    rotations: [-30, 0, 30],
    flippable: false,
    restitution: 0.3,
    friction: 0.04,
    stateful: true,
  },
  windmill: {
    name: '風車',
    description: '羽根が回転して玉を弾く',
    width: 2.0, height: 2.0,
    rotations: [0],
    flippable: false,
    restitution: 0.5,
    friction: 0.03,
    dynamic: true,
  },
  stone: {
    name: '補助石',
    description: '玉の進路を変える置き石',
    width: 1.0, height: 1.0,
    rotations: [0],
    flippable: false,
    shapes: ['round', 'triangle_up', 'triangle_left', 'triangle_right'],
    restitution: 0.4,
    friction: 0.05,
  },
};

// === ステージデータ ===
// 座標はグリッドセル単位。中心点で配置
// fixed: 庭の固定オブジェクト（庭石・水盤など）
// goal: ゴール種類と位置
// pieces: 使用可能なピース { type: count }
// targets: 金/銀/銅 基準ピース数

const STAGES = [
  // ===== チュートリアル 1-5 =====
  {
    id: 1,
    name: '一の庭',
    subtitle: '最初の一手',
    tier: 'tutorial',
    instruction: '傾斜板を一枚置いて、玉を鈴まで導きましょう',
    ballStart: { col: 2, row: 1 },
    goal: { type: 'bell', col: 9, row: 13 },
    fixed: [
      { type: 'rock', col: 7, row: 14, w: 5, h: 1 },
      { type: 'sand_edge', col: 0, row: 17, w: 12, h: 1 },
    ],
    pieces: { ramp_l: 1 },
    targets: { gold: 1, silver: 1, bronze: 2 },
    hintPosition: { x: 5, y: 8, radius: 1.5 },
  },
  {
    id: 2,
    name: '二の橋',
    subtitle: '二つの斜面',
    tier: 'tutorial',
    instruction: '二枚の傾斜板で、谷を渡って鈴へ',
    ballStart: { col: 1, row: 1 },
    goal: { type: 'bell', col: 10, row: 14 },
    fixed: [
      { type: 'rock', col: 0, row: 7, w: 4, h: 1 },
      { type: 'rock', col: 8, row: 15, w: 4, h: 1 },
      { type: 'sand_edge', col: 0, row: 17, w: 12, h: 1 },
    ],
    pieces: { ramp_l: 2 },
    targets: { gold: 2, silver: 2, bronze: 3 },
    hintPosition: { x: 4, y: 10, radius: 1.5 },
  },
  {
    id: 3,
    name: '跳ねる音',
    subtitle: '反発ばねを知る',
    tier: 'tutorial',
    instruction: 'ばねで玉を跳ね上げて、高い場所の鈴を鳴らそう',
    ballStart: { col: 2, row: 1 },
    goal: { type: 'bell', col: 9, row: 5 },
    fixed: [
      { type: 'rock', col: 8, row: 6, w: 3, h: 1 },
      { type: 'rock', col: 0, row: 14, w: 12, h: 1 },
      { type: 'sand_edge', col: 0, row: 17, w: 12, h: 1 },
    ],
    pieces: { ramp_l: 1, spring: 1 },
    targets: { gold: 2, silver: 2, bronze: 3 },
    hintPosition: { x: 5, y: 12, radius: 1.5 },
  },
  {
    id: 4,
    name: '曲がり道',
    subtitle: '竹樋で方向を変える',
    tier: 'tutorial',
    instruction: '竹樋の曲がりで、玉の進路を直角に変えてみよう',
    ballStart: { col: 1, row: 1 },
    goal: { type: 'bell', col: 10, row: 13 },
    fixed: [
      { type: 'rock', col: 0, row: 7, w: 5, h: 1 },
      { type: 'rock', col: 8, row: 14, w: 4, h: 1 },
      { type: 'sand_edge', col: 0, row: 17, w: 12, h: 1 },
    ],
    pieces: { ramp_l: 1, chute_l: 1, ramp_s: 1 },
    targets: { gold: 2, silver: 3, bronze: 4 },
    hintPosition: { x: 3, y: 10, radius: 1.5 },
  },
  {
    id: 5,
    name: '置き石',
    subtitle: '進路を整える',
    tier: 'tutorial',
    instruction: '補助石で玉の進路を整えて鈴へ',
    ballStart: { col: 2, row: 1 },
    goal: { type: 'bell', col: 10, row: 14 },
    fixed: [
      { type: 'rock', col: 5, row: 6, w: 2, h: 1 },
      { type: 'rock', col: 0, row: 11, w: 4, h: 1 },
      { type: 'rock', col: 8, row: 15, w: 4, h: 1 },
      { type: 'sand_edge', col: 0, row: 17, w: 12, h: 1 },
    ],
    pieces: { stone: 2, ramp_l: 1 },
    targets: { gold: 2, silver: 3, bronze: 4 },
    hintPosition: { x: 6, y: 9, radius: 1.5 },
  },

  // ===== 初級 6-10 =====
  {
    id: 6,
    name: '橋を架ける',
    subtitle: '傾斜と樋を継ぐ',
    tier: 'beginner',
    instruction: '傾斜板と竹樋を組み合わせ、長い距離を運ぼう',
    ballStart: { col: 1, row: 1 },
    goal: { type: 'bell', col: 10, row: 14 },
    fixed: [
      { type: 'rock', col: 0, row: 5, w: 3, h: 1 },
      { type: 'rock', col: 9, row: 15, w: 3, h: 1 },
      { type: 'sand_edge', col: 0, row: 17, w: 12, h: 1 },
    ],
    pieces: { ramp_l: 2, chute_h: 1, ramp_s: 1 },
    targets: { gold: 3, silver: 4, bronze: 5 },
    hintPosition: { x: 4, y: 8, radius: 1.5 },
  },
  {
    id: 7,
    name: '跳んで運ぶ',
    subtitle: 'ばねの放物線',
    tier: 'beginner',
    instruction: 'ばねで跳ばし、斜面で受け止めて運ぼう',
    ballStart: { col: 1, row: 1 },
    goal: { type: 'bell', col: 10, row: 5 },
    fixed: [
      { type: 'rock', col: 0, row: 14, w: 5, h: 1 },
      { type: 'rock', col: 9, row: 6, w: 3, h: 1 },
      { type: 'sand_edge', col: 0, row: 17, w: 12, h: 1 },
    ],
    pieces: { ramp_l: 1, spring: 1, ramp_s: 2, stone: 1 },
    targets: { gold: 3, silver: 4, bronze: 5 },
    hintPosition: { x: 4, y: 11, radius: 1.5 },
  },
  {
    id: 8,
    name: '振り子の調べ',
    subtitle: '揺れを利用する',
    tier: 'beginner',
    instruction: '振り子は静かに垂れている。玉をぶつけて揺らし、振り戻りの勢いで運ぼう',
    ballStart: { col: 2, row: 1 },
    goal: { type: 'bell', col: 10, row: 12 },
    fixed: [
      { type: 'rock', col: 0, row: 10, w: 4, h: 1 },
      { type: 'rock', col: 8, row: 13, w: 4, h: 1 },
      { type: 'sand_edge', col: 0, row: 17, w: 12, h: 1 },
    ],
    pieces: { ramp_l: 1, pendulum: 1, ramp_s: 1, stone: 1 },
    targets: { gold: 3, silver: 4, bronze: 5 },
    hintPosition: { x: 5, y: 7, radius: 1.5 },
  },
  {
    id: 9,
    name: '迂回',
    subtitle: '障害を越える',
    tier: 'beginner',
    instruction: '障害物を避けつつ、玉をゴールへ運ぼう',
    ballStart: { col: 1, row: 1 },
    goal: { type: 'bell', col: 10, row: 14 },
    fixed: [
      { type: 'rock', col: 5, row: 5, w: 2, h: 2 },
      { type: 'rock', col: 4, row: 11, w: 2, h: 2 },
      { type: 'rock', col: 9, row: 15, w: 3, h: 1 },
      { type: 'sand_edge', col: 0, row: 17, w: 12, h: 1 },
    ],
    pieces: { ramp_l: 2, ramp_s: 2, stone: 2 },
    targets: { gold: 3, silver: 4, bronze: 6 },
    hintPosition: { x: 3, y: 9, radius: 1.5 },
  },
  {
    id: 10,
    name: '反転の扉',
    subtitle: '一度だけの転換',
    tier: 'beginner',
    instruction: '反転扉は玉が当たると角度が変わる。それを計算に入れて',
    ballStart: { col: 2, row: 1 },
    goal: { type: 'bell', col: 9, row: 14 },
    fixed: [
      { type: 'rock', col: 0, row: 8, w: 4, h: 1 },
      { type: 'rock', col: 8, row: 15, w: 4, h: 1 },
      { type: 'sand_edge', col: 0, row: 17, w: 12, h: 1 },
    ],
    pieces: { ramp_l: 1, gate: 1, ramp_s: 2 },
    targets: { gold: 3, silver: 4, bronze: 5 },
    hintPosition: { x: 5, y: 10, radius: 1.5 },
  },

  // ===== 中級 11-15 =====
  {
    id: 11,
    name: 'かけらの庭',
    subtitle: '連鎖の妙',
    tier: 'intermediate',
    instruction: '複数の仕掛けを連動させ、玉を遠くまで運ぼう',
    ballStart: { col: 1, row: 1 },
    goal: { type: 'bell', col: 10, row: 13 },
    fixed: [
      { type: 'rock', col: 4, row: 6, w: 4, h: 1 },
      { type: 'rock', col: 0, row: 11, w: 3, h: 1 },
      { type: 'rock', col: 9, row: 14, w: 3, h: 1 },
      { type: 'sand_edge', col: 0, row: 17, w: 12, h: 1 },
    ],
    pieces: { ramp_l: 2, ramp_s: 2, chute_l: 1, spring: 1, stone: 1 },
    targets: { gold: 4, silver: 5, bronze: 6 },
    hintPosition: { x: 5, y: 9, radius: 1.5 },
  },
  {
    id: 12,
    name: '水琴の音',
    subtitle: '深く落とす',
    tier: 'intermediate',
    instruction: '水琴窟は玉が落下する勢いで響く。落差をうまく作ろう',
    ballStart: { col: 2, row: 1 },
    goal: { type: 'suikinkutsu', col: 9, row: 16 },
    fixed: [
      { type: 'rock', col: 5, row: 5, w: 2, h: 1 },
      { type: 'rock', col: 5, row: 11, w: 2, h: 1 },
      { type: 'sand_edge', col: 0, row: 17, w: 12, h: 1 },
    ],
    pieces: { ramp_l: 2, chute_h: 1, ramp_s: 2, stone: 1 },
    targets: { gold: 4, silver: 5, bronze: 6 },
    hintPosition: { x: 5, y: 9, radius: 1.5 },
  },
  {
    id: 13,
    name: '灯を継ぐ',
    subtitle: '火を運ぶ',
    tier: 'intermediate',
    instruction: 'ろうそくは強い衝突で灯る。ばねの力で点けよう',
    ballStart: { col: 1, row: 1 },
    goal: { type: 'candle', col: 10, row: 11 },
    fixed: [
      { type: 'rock', col: 0, row: 8, w: 5, h: 1 },
      { type: 'rock', col: 9, row: 12, w: 3, h: 1 },
      { type: 'sand_edge', col: 0, row: 17, w: 12, h: 1 },
    ],
    pieces: { ramp_l: 2, spring: 1, ramp_s: 2, chute_l: 1 },
    targets: { gold: 4, silver: 5, bronze: 7 },
    hintPosition: { x: 4, y: 11, radius: 1.5 },
  },
  {
    id: 14,
    name: '機巧の調べ',
    subtitle: '風と振り子',
    tier: 'intermediate',
    instruction: '風車と振り子を連動させ、複雑な経路を抜けよう',
    ballStart: { col: 2, row: 1 },
    goal: { type: 'bell', col: 10, row: 14 },
    fixed: [
      { type: 'rock', col: 5, row: 8, w: 2, h: 1 },
      { type: 'rock', col: 0, row: 12, w: 3, h: 1 },
      { type: 'rock', col: 8, row: 15, w: 4, h: 1 },
      { type: 'sand_edge', col: 0, row: 17, w: 12, h: 1 },
    ],
    pieces: { ramp_l: 2, windmill: 1, pendulum: 1, ramp_s: 2, stone: 1 },
    targets: { gold: 4, silver: 6, bronze: 8 },
    hintPosition: { x: 5, y: 11, radius: 1.5 },
  },
  {
    id: 15,
    name: '春の終曲',
    subtitle: '中の集大成',
    tier: 'intermediate',
    instruction: '今までの仕掛けを全て使い、玉をゴールまで導こう',
    ballStart: { col: 1, row: 1 },
    goal: { type: 'bell', col: 10, row: 15 },
    fixed: [
      { type: 'rock', col: 4, row: 5, w: 3, h: 1 },
      { type: 'rock', col: 0, row: 10, w: 3, h: 1 },
      { type: 'rock', col: 7, row: 12, w: 2, h: 1 },
      { type: 'rock', col: 9, row: 16, w: 3, h: 1 },
      { type: 'sand_edge', col: 0, row: 17, w: 12, h: 1 },
    ],
    pieces: { ramp_l: 2, ramp_s: 2, chute_l: 1, spring: 1, pendulum: 1, stone: 2 },
    targets: { gold: 5, silver: 7, bronze: 9 },
    hintPosition: { x: 4, y: 7, radius: 1.5 },
  },
];

const TIER_LABEL = {
  tutorial: '稽古',
  beginner: '初級',
  intermediate: '中級',
};

// ============================================================================
// 物理エンジン
// ============================================================================

// 円と線分の衝突判定
function circleVsSegment(cx, cy, r, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx*dx + dy*dy;
  if (len2 < 0.0001) return { hit: false };
  let t = ((cx - x1)*dx + (cy - y1)*dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const px = x1 + t*dx, py = y1 + t*dy;
  const ddx = cx - px, ddy = cy - py;
  const d2 = ddx*ddx + ddy*ddy;
  if (d2 < r*r) {
    const d = Math.sqrt(d2);
    if (d < 0.0001) {
      // 中心が線分上、法線を線分から派生
      const lnx = -dy/Math.sqrt(len2), lny = dx/Math.sqrt(len2);
      return { hit: true, nx: lnx, ny: lny, depth: r };
    }
    return { hit: true, nx: ddx/d, ny: ddy/d, depth: r - d };
  }
  return { hit: false };
}

// 円と円の衝突判定
function circleVsCircle(c1x, c1y, r1, c2x, c2y, r2) {
  const dx = c1x - c2x, dy = c1y - c2y;
  const d2 = dx*dx + dy*dy;
  const sumR = r1 + r2;
  if (d2 < sumR*sumR) {
    const d = Math.sqrt(d2);
    if (d < 0.0001) return { hit: true, nx: 0, ny: -1, depth: sumR };
    return { hit: true, nx: dx/d, ny: dy/d, depth: sumR - d };
  }
  return { hit: false };
}

// 衝突応答
function resolve(ball, nx, ny, depth, restitution, friction) {
  // 押し戻し
  ball.x += nx * depth;
  ball.y += ny * depth;
  // 速度の法線成分
  const vdotn = ball.vx * nx + ball.vy * ny;
  if (vdotn < 0) {
    ball.vx -= (1 + restitution) * vdotn * nx;
    ball.vy -= (1 + restitution) * vdotn * ny;
  }
  // 接線成分の減衰
  const tx = -ny, ty = nx;
  const vdott = ball.vx * tx + ball.vy * ty;
  ball.vx -= vdott * tx * friction;
  ball.vy -= vdott * ty * friction;
}

// 配置済みピースから線分（セグメント）のリストを生成
function getPieceSegments(piece, t) {
  // t: time-like state (for dynamic pieces)
  const def = PIECE_DEFS[piece.type];
  const cx = piece.x, cy = piece.y;
  const segs = [];

  if (piece.type === 'ramp_s' || piece.type === 'ramp_l') {
    const len = def.width * CELL;
    const angle = (piece.rotation || 0) * Math.PI / 180;
    const half = len / 2;
    const dx = Math.cos(angle) * half;
    const dy = Math.sin(angle) * half;
    segs.push({
      x1: cx - dx, y1: cy - dy,
      x2: cx + dx, y2: cy + dy,
      restitution: def.restitution,
      friction: def.friction,
    });
  }

  else if (piece.type === 'chute_h') {
    const len = def.width * CELL;
    const half = len / 2;
    const wallY = def.height * CELL / 2;
    // 底と上の2本（厳密にはU字。上は無くてもよいが脱出防止に薄く）
    segs.push({
      x1: cx - half, y1: cy + wallY,
      x2: cx + half, y2: cy + wallY,
      restitution: def.restitution,
      friction: def.friction,
    });
    // 端壁（短い）
    segs.push({
      x1: cx - half, y1: cy + wallY,
      x2: cx - half, y2: cy + wallY - 8,
      restitution: def.restitution,
      friction: def.friction,
    });
    segs.push({
      x1: cx + half, y1: cy + wallY,
      x2: cx + half, y2: cy + wallY - 8,
      restitution: def.restitution,
      friction: def.friction,
    });
  }

  else if (piece.type === 'chute_l') {
    // L字管。回転で方向決定
    const rot = (piece.rotation || 0) * Math.PI / 180;
    const cosR = Math.cos(rot), sinR = Math.sin(rot);
    // ベース形状: 右と下に伸びるL字
    // ローカル座標で点を定義 → 回転 → グローバル化
    const localPoints = [
      // 縦の内側 (右側)
      [-CELL*0.3, -CELL*0.9, -CELL*0.3, CELL*0.3],
      // 縦の外側 (左側)
      [-CELL*0.9, -CELL*0.9, -CELL*0.9, CELL*0.9],
      // 横の上側 (内)
      [-CELL*0.3, CELL*0.3, CELL*0.9, CELL*0.3],
      // 横の下側 (外)
      [-CELL*0.9, CELL*0.9, CELL*0.9, CELL*0.9],
    ];
    localPoints.forEach(p => {
      const x1 = cx + p[0]*cosR - p[1]*sinR;
      const y1 = cy + p[0]*sinR + p[1]*cosR;
      const x2 = cx + p[2]*cosR - p[3]*sinR;
      const y2 = cy + p[2]*sinR + p[3]*cosR;
      segs.push({ x1, y1, x2, y2, restitution: def.restitution, friction: def.friction });
    });
  }

  else if (piece.type === 'spring') {
    // ばね: rotation=0 で上向きに発射（描画と一致）
    // F15: 上面を中央が低い V 字凹みに（玉を中央に集める）
    const rot = (piece.rotation || 0) * Math.PI / 180;
    const w = def.width * CELL;
    const h = def.height * CELL;
    const cosR = Math.cos(rot), sinR = Math.sin(rot);
    const dip = h * 0.18; // 中央の低さ
    // ローカル座標の3点: 左端、中央、右端
    const pts = [
      [-w/2, -h/2],
      [0,    -h/2 + dip],
      [w/2,  -h/2],
    ];
    const wp = pts.map(([lx, ly]) => ({
      x: cx + lx*cosR - ly*sinR,
      y: cy + lx*sinR + ly*cosR,
    }));
    // 2本の線分
    segs.push({
      x1: wp[0].x, y1: wp[0].y, x2: wp[1].x, y2: wp[1].y,
      restitution: def.restitution,
      friction: def.friction,
    });
    segs.push({
      x1: wp[1].x, y1: wp[1].y, x2: wp[2].x, y2: wp[2].y,
      restitution: def.restitution,
      friction: def.friction,
    });
  }

  else if (piece.type === 'pendulum') {
    // 振り子: piece.pendulumAngle を真の状態とする
    const swingAngle = piece.pendulumAngle != null ? piece.pendulumAngle : 0;
    const armLength = CELL * 2.0;
    const bobR = CELL * 0.45;
    const bobX = cx + Math.sin(swingAngle) * armLength;
    const bobY = cy + Math.cos(swingAngle) * armLength;
    // 棒
    segs.push({
      x1: cx, y1: cy,
      x2: bobX, y2: bobY,
      restitution: def.restitution,
      friction: def.friction,
      isPendulumArm: true,
      pieceRef: piece,
      bobX, bobY,
      pivotX: cx, pivotY: cy,
    });
    // 玉（円）として扱うため特殊フラグ
    segs.push({
      isCircle: true,
      cx: bobX, cy: bobY, r: bobR,
      restitution: def.restitution + 0.2,
      friction: def.friction,
      isPendulumBob: true,
      pieceRef: piece,
      pivotX: cx, pivotY: cy,
      armLength,
    });
  }

  else if (piece.type === 'gate') {
    // 反転扉: 角度が状態で反転
    const baseRot = (piece.rotation || 0);
    const effRot = (piece.flipped ? -baseRot : baseRot) * Math.PI / 180;
    const len = def.width * CELL;
    const half = len / 2;
    const dx = Math.cos(effRot) * half;
    const dy = Math.sin(effRot) * half;
    segs.push({
      x1: cx - dx, y1: cy - dy,
      x2: cx + dx, y2: cy + dy,
      restitution: def.restitution,
      friction: def.friction,
      isGate: true,
      pieceRef: piece,
    });
  }

  else if (piece.type === 'windmill') {
    // 風車: piece.windmillAngle を真の状態。未設定時は t * baseRate（プレース中表示）
    const rotSpeed = 1.8;
    const rot = piece.windmillAngle != null ? piece.windmillAngle : (t * rotSpeed + (piece.phase || 0));
    const armLen = CELL * 0.85;
    for (let i = 0; i < 4; i++) {
      const a = rot + i * Math.PI / 2;
      const tipX = cx + Math.cos(a) * armLen;
      const tipY = cy + Math.sin(a) * armLen;
      segs.push({
        x1: cx, y1: cy,
        x2: tipX, y2: tipY,
        restitution: def.restitution,
        friction: def.friction,
        isWindmillArm: true,
        armAngle: a,
        pieceRef: piece,
      });
    }
  }

  else if (piece.type === 'stone') {
    const shape = piece.shape || 'round';
    const r = CELL * 0.42;
    if (shape === 'round') {
      segs.push({
        isCircle: true,
        cx, cy, r,
        restitution: def.restitution,
        friction: def.friction,
      });
    } else {
      // 三角形（向きで方向決定）
      const dir = shape; // triangle_up, triangle_left, triangle_right
      const s = CELL * 0.45;
      let pts;
      if (dir === 'triangle_up') {
        pts = [[cx, cy - s], [cx - s, cy + s*0.6], [cx + s, cy + s*0.6]];
      } else if (dir === 'triangle_left') {
        pts = [[cx - s, cy], [cx + s*0.6, cy - s], [cx + s*0.6, cy + s]];
      } else {
        pts = [[cx + s, cy], [cx - s*0.6, cy - s], [cx - s*0.6, cy + s]];
      }
      for (let i = 0; i < 3; i++) {
        const a = pts[i], b = pts[(i+1)%3];
        segs.push({
          x1: a[0], y1: a[1], x2: b[0], y2: b[1],
          restitution: def.restitution, friction: def.friction,
        });
      }
    }
  }

  return segs;
}

// 固定オブジェクトの線分
function getFixedSegments(fixed) {
  const segs = [];
  fixed.forEach(f => {
    const x1 = f.col * CELL;
    const y1 = f.row * CELL;
    const x2 = (f.col + f.w) * CELL;
    const y2 = (f.row + f.h) * CELL;
    // 上面のみが主な当たり判定（玉が乗る面）
    segs.push({ x1, y1, x2: x2, y2: y1, restitution: 0.2, friction: 0.06 });
    // 横と下面
    segs.push({ x1, y1, x2: x1, y2, restitution: 0.2, friction: 0.06 });
    segs.push({ x1: x2, y1, x2, y2, restitution: 0.2, friction: 0.06 });
    if (f.type !== 'sand_edge') {
      segs.push({ x1, y1: y2, x2, y2, restitution: 0.2, friction: 0.06 });
    } else {
      // 砂縁（最下段）は底面なので別扱い
      segs.push({ x1, y1: y2, x2, y2, restitution: 0.05, friction: 0.5 });
    }
  });
  return segs;
}

// 壁（庭の外周）
function getWallSegments() {
  return [
    // 左壁
    { x1: 0, y1: 0, x2: 0, y2: H, restitution: 0.2, friction: 0.06 },
    // 右壁
    { x1: W, y1: 0, x2: W, y2: H, restitution: 0.2, friction: 0.06 },
    // 上は開いている（玉は上には出ない）
  ];
}

// シミュレーション1ステップ
function simStep(state, t) {
  const { ball, placed, fixed, goal } = state;
  if (!ball.alive) return;

  // 重力
  ball.vy += GRAVITY * DT;

  // 速度上限
  const maxV = 1500;
  const v2 = ball.vx*ball.vx + ball.vy*ball.vy;
  if (v2 > maxV*maxV) {
    const v = Math.sqrt(v2);
    ball.vx = (ball.vx / v) * maxV;
    ball.vy = (ball.vy / v) * maxV;
  }

  // 微小空気抵抗
  ball.vx *= 0.998;
  ball.vy *= 0.999;

  // 移動を分割（高速時の貫通防止）
  const speed = Math.sqrt(ball.vx*ball.vx + ball.vy*ball.vy);
  const sub = Math.max(1, Math.ceil(speed * DT / (BALL_R * 0.6)));
  const subDt = DT / sub;

  for (let s = 0; s < sub; s++) {
    // === 動的ピース（振り子・風車）の物理積分 ===
    placed.forEach(p => {
      if (p.type === 'pendulum') {
        // 単振り子の運動方程式
        // angAccel = -(g/L) * sin(angle) - damping * angVel
        const L = CELL * 2.0;
        const angle = p.pendulumAngle || 0;
        const angVel = p.pendulumAngVel || 0;
        const damping = 0.5; // 減衰係数
        const angAccel = -(GRAVITY / L) * Math.sin(angle) - damping * angVel;
        p.pendulumAngVel = angVel + angAccel * subDt;
        p.pendulumAngle = angle + p.pendulumAngVel * subDt;
      } else if (p.type === 'windmill') {
        // 風車: 角速度を時間で減衰（基本回転速度に戻る）
        const baseSpeed = 1.8;
        const angVel = p.windmillAngVel != null ? p.windmillAngVel : baseSpeed;
        // ベース速度に向けて緩やかに引き戻す
        const newVel = angVel + (baseSpeed - angVel) * 0.5 * subDt;
        p.windmillAngVel = newVel;
        p.windmillAngle = (p.windmillAngle || 0) + newVel * subDt;
      }
    });

    ball.x += ball.vx * subDt;
    ball.y += ball.vy * subDt;

    // 衝突判定（全ピース＋固定＋壁）
    const allSegs = [];
    placed.forEach(p => {
      allSegs.push(...getPieceSegments(p, t).map(seg => ({ ...seg, ownerId: p.id, ownerType: p.type })));
    });
    allSegs.push(...getFixedSegments(fixed));
    allSegs.push(...getWallSegments());

    for (const seg of allSegs) {
      let hit;
      if (seg.isCircle) {
        hit = circleVsCircle(ball.x, ball.y, BALL_R, seg.cx, seg.cy, seg.r);
      } else {
        hit = circleVsSegment(ball.x, ball.y, BALL_R, seg.x1, seg.y1, seg.x2, seg.y2);
      }
      if (hit.hit) {
        resolve(ball, hit.nx, hit.ny, hit.depth, seg.restitution, seg.friction);

        // === 反転扉 ===
        if (seg.isGate && !seg.pieceRef.hasFlipped) {
          seg.pieceRef.flipped = !seg.pieceRef.flipped;
          seg.pieceRef.hasFlipped = true;
          // F9: フラッシュエフェクトを記録
          if (!state.gateFlipEffects) state.gateFlipEffects = [];
          state.gateFlipEffects.push({ x: seg.pieceRef.x, y: seg.pieceRef.y, life: 30, maxLife: 30 });
        }

        // === 風車 ===
        if (seg.isWindmillArm && seg.pieceRef) {
          // 接線方向に強い力（v1.0 の 3倍）
          const a = seg.armAngle + Math.PI/2;
          const force = 280;
          ball.vx += Math.cos(a) * force * subDt * 5;
          ball.vy += Math.sin(a) * force * subDt * 5;
          // 風車の回転速度をブースト
          seg.pieceRef.windmillAngVel = (seg.pieceRef.windmillAngVel || 1.8) + 1.2;
          if (seg.pieceRef.windmillAngVel > 6) seg.pieceRef.windmillAngVel = 6;
        }

        // === 振り子の玉 ===
        if (seg.isPendulumBob && seg.pieceRef) {
          // 衝撃を角運動量に変換
          // 腕方向ベクトル
          const armDx = seg.cx - seg.pivotX;
          const armDy = seg.cy - seg.pivotY;
          // 接線方向（腕に垂直、左回り正）
          const L = seg.armLength;
          const tx = -armDy / L;
          const ty = armDx / L;
          // 玉の速度の接線成分
          const vTan = ball.vx * tx + ball.vy * ty;
          // 角速度に加算（係数で調整）
          seg.pieceRef.pendulumAngVel = (seg.pieceRef.pendulumAngVel || 0) + vTan / L * 0.85;
        }
      }
    }

    // ゴール判定
    const gx = (goal.col + 0.5) * CELL;
    const gy = (goal.row + 0.5) * CELL;
    const dx = ball.x - gx;
    const dy = ball.y - gy;
    const d2 = dx*dx + dy*dy;
    const goalR = CELL * 0.5;
    if (d2 < (goalR + BALL_R)*(goalR + BALL_R)) {
      // ゴール種類で条件分岐
      if (goal.type === 'bell') {
        state.cleared = true;
        ball.alive = false;
        return;
      } else if (goal.type === 'candle') {
        // 強い衝突が必要
        const v = Math.sqrt(ball.vx*ball.vx + ball.vy*ball.vy);
        if (v > 280) {
          state.cleared = true;
          ball.alive = false;
          return;
        }
      } else if (goal.type === 'suikinkutsu') {
        // 落下速度（vy）が必要
        if (ball.vy > 350) {
          state.cleared = true;
          ball.alive = false;
          return;
        }
      }
    }

    // 場外判定（F3: 理由分類）
    if (ball.y > H + 100 || ball.x < -100 || ball.x > W + 100) {
      ball.alive = false;
      state.lost = true;
      state.failReason = 'out_of_bounds';
      state.lastBallPos = { x: ball.x, y: ball.y };
      return;
    }
  }

  // F3: 失速検出（30 px/s 以下が 1.5秒 = 90frame 続いたら失敗）
  const curSpeed = Math.sqrt(ball.vx*ball.vx + ball.vy*ball.vy);
  if (curSpeed < 30) {
    state.stallCount = (state.stallCount || 0) + 1;
    if (state.stallCount >= 90) {
      ball.alive = false;
      state.lost = true;
      state.failReason = 'stalled';
      state.lastBallPos = { x: ball.x, y: ball.y };
      return;
    }
  } else {
    state.stallCount = 0;
  }

  // F3: タイムアウト（MAX_STEPS到達）
  if ((state.steps || 0) >= MAX_STEPS) {
    state.lost = true;
    state.failReason = 'timeout';
    state.lastBallPos = { x: ball.x, y: ball.y };
    ball.alive = false;
  }
}

// ============================================================================
// オーディオ
// ============================================================================
class AudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }
  init() {
    if (!this.ctx) {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC();
      } catch(e) { this.enabled = false; }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }
  tone(freq, duration, vol = 0.15, type = 'sine', attack = 0.005, decay = 0.1) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, this.ctx.currentTime);
    g.gain.linearRampToValueAtTime(vol, this.ctx.currentTime + attack);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    o.connect(g);
    g.connect(this.ctx.destination);
    o.start();
    o.stop(this.ctx.currentTime + duration + 0.05);
  }
  place() { this.tone(220, 0.08, 0.08, 'triangle'); }
  pickup() { this.tone(330, 0.06, 0.06, 'triangle'); }
  remove() { this.tone(180, 0.1, 0.07, 'sawtooth', 0.005, 0.1); }
  hit(intensity = 1) {
    this.tone(80 + Math.random()*40, 0.05, 0.04 * intensity, 'triangle');
  }
  spring() { this.tone(550, 0.12, 0.1, 'square', 0.005, 0.12); }
  bell() {
    this.tone(1320, 1.2, 0.12, 'sine', 0.005, 1.2);
    setTimeout(() => this.tone(1980, 0.9, 0.06, 'sine', 0.005, 0.9), 60);
  }
  candle() {
    this.tone(440, 0.2, 0.08, 'triangle');
    setTimeout(() => this.tone(660, 0.3, 0.07, 'sine'), 100);
  }
  suikinkutsu() {
    this.tone(880, 0.25, 0.08, 'sine');
    setTimeout(() => this.tone(1100, 0.4, 0.06, 'sine'), 80);
    setTimeout(() => this.tone(1320, 0.6, 0.04, 'sine'), 200);
  }
  fail() { this.tone(140, 0.3, 0.05, 'sawtooth', 0.01, 0.3); }
  success(rank) {
    if (rank === 'gold') {
      this.tone(523, 0.18, 0.1, 'sine');
      setTimeout(() => this.tone(659, 0.18, 0.1, 'sine'), 180);
      setTimeout(() => this.tone(784, 0.4, 0.1, 'sine'), 360);
    } else if (rank === 'silver') {
      this.tone(523, 0.18, 0.08, 'sine');
      setTimeout(() => this.tone(659, 0.35, 0.08, 'sine'), 180);
    } else {
      this.tone(523, 0.4, 0.07, 'sine');
    }
  }
}
const audio = new AudioEngine();

// ============================================================================
// 永続化
// ============================================================================
async function loadProgress() {
  try {
    if (window.storage && window.storage.get) {
      const res = await window.storage.get(STORAGE_KEY);
      if (res && res.value) {
        return JSON.parse(res.value);
      }
    }
  } catch(e) {
    console.warn('[karakuri] loadProgress failed:', e);
  }
  return { stages: {}, hintsUsed: {}, version: 1 };
}
// R3-003: 失敗時は例外を再スロー（呼び出し元で UI 通知）
async function saveProgress(p) {
  if (window.storage && window.storage.set) {
    await window.storage.set(STORAGE_KEY, JSON.stringify(p));
  }
}

// ============================================================================
// 描画ユーティリティ
// ============================================================================
function drawBackground(ctx) {
  // 砂地ベース
  ctx.fillStyle = PALETTE.sand;
  ctx.fillRect(0, 0, W, H);

  // 砂紋
  ctx.strokeStyle = PALETTE.sandDark;
  ctx.lineWidth = 0.8;
  ctx.globalAlpha = 0.45;
  for (let y = 28; y < H; y += 16) {
    ctx.beginPath();
    for (let x = 0; x <= W; x += 4) {
      const yy = y + Math.sin(x * 0.025 + y * 0.04) * 2.5;
      if (x === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawGrid(ctx) {
  ctx.fillStyle = PALETTE.sandDark;
  ctx.globalAlpha = 0.25;
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      const x = c * CELL + CELL/2;
      const y = r * CELL + CELL/2;
      ctx.beginPath();
      ctx.arc(x, y, 0.7, 0, Math.PI*2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function drawFixed(ctx, fixed) {
  fixed.forEach(f => {
    const x = f.col * CELL;
    const y = f.row * CELL;
    const w = f.w * CELL;
    const h = f.h * CELL;

    if (f.type === 'sand_edge') {
      // 砂縁
      ctx.fillStyle = PALETTE.sandDark;
      ctx.globalAlpha = 0.5;
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1;
      // 縁線
      ctx.strokeStyle = PALETTE.inkSoft;
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else {
      // 庭石
      ctx.fillStyle = PALETTE.inkSoft;
      ctx.globalAlpha = 0.92;
      ctx.beginPath();
      // やや有機的な石の形
      const seed = f.col * 7 + f.row * 13;
      const rng = (n) => ((Math.sin(seed + n*31) + 1) / 2);
      ctx.moveTo(x + 4, y + 4 + rng(0)*4);
      ctx.lineTo(x + w - 4 - rng(1)*4, y + 2);
      ctx.lineTo(x + w - 2, y + h - 4 - rng(2)*4);
      ctx.lineTo(x + 2 + rng(3)*4, y + h - 2);
      ctx.closePath();
      ctx.fill();
      // 苔のハイライト
      ctx.fillStyle = PALETTE.moss;
      ctx.globalAlpha = 0.35;
      ctx.fillRect(x + 6, y + 2, w - 12, 3);
      ctx.globalAlpha = 1;
    }
  });
}

function drawGoal(ctx, goal, frame) {
  const cx = (goal.col + 0.5) * CELL;
  const cy = (goal.row + 0.5) * CELL;
  const pulse = 1 + Math.sin(frame * 0.06) * 0.06;

  if (goal.type === 'bell') {
    // 鈴を描画
    ctx.fillStyle = PALETTE.vermilion;
    ctx.beginPath();
    ctx.arc(cx, cy, CELL * 0.42 * pulse, 0, Math.PI*2);
    ctx.fill();
    // 中心の穴
    ctx.fillStyle = PALETTE.ink;
    ctx.beginPath();
    ctx.arc(cx, cy + CELL*0.1, CELL * 0.12, 0, Math.PI*2);
    ctx.fill();
    // 紐
    ctx.strokeStyle = PALETTE.inkSoft;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy - CELL*0.42);
    ctx.lineTo(cx, cy - CELL*0.7);
    ctx.stroke();
    // 光彩
    ctx.strokeStyle = PALETTE.vermilion;
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, CELL * 0.55 * pulse, 0, Math.PI*2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  } else if (goal.type === 'candle') {
    // ろうそく
    ctx.fillStyle = PALETTE.sandPale;
    ctx.fillRect(cx - 5, cy - 4, 10, CELL*0.6);
    // 芯
    ctx.fillStyle = PALETTE.ink;
    ctx.fillRect(cx - 1, cy - 10, 2, 6);
    // 炎の指示
    ctx.fillStyle = PALETTE.vermilion;
    ctx.globalAlpha = 0.5 + Math.sin(frame*0.15)*0.2;
    ctx.beginPath();
    ctx.ellipse(cx, cy - 12, 4, 8, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.globalAlpha = 1;
  } else if (goal.type === 'suikinkutsu') {
    // 水琴窟（円形の穴）
    ctx.fillStyle = PALETTE.ink;
    ctx.beginPath();
    ctx.arc(cx, cy, CELL * 0.45, 0, Math.PI*2);
    ctx.fill();
    // 内側のリム
    ctx.strokeStyle = PALETTE.moss;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, CELL * 0.45 - 3, 0, Math.PI*2);
    ctx.stroke();
    // 水面の波紋
    ctx.strokeStyle = PALETTE.mossPale;
    ctx.globalAlpha = 0.4 + Math.sin(frame*0.08)*0.2;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, CELL*0.25 + Math.sin(frame*0.1)*3, 0, Math.PI*2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function drawPiece(ctx, piece, t, highlight = false) {
  const def = PIECE_DEFS[piece.type];
  ctx.save();
  ctx.translate(piece.x, piece.y);
  if (piece.rotation && (piece.type === 'ramp_s' || piece.type === 'ramp_l' || piece.type === 'spring' || piece.type === 'gate')) {
    ctx.rotate(piece.rotation * Math.PI / 180);
  }
  if (piece.rotation && piece.type === 'chute_l') {
    ctx.rotate(piece.rotation * Math.PI / 180);
  }

  if (piece.type === 'ramp_s' || piece.type === 'ramp_l') {
    const w = def.width * CELL;
    const h = def.height * CELL;
    // 板
    ctx.fillStyle = '#8C7355';
    ctx.fillRect(-w/2, -h/2, w, h);
    // 木目
    ctx.strokeStyle = '#6F5C42';
    ctx.lineWidth = 0.5;
    for (let i = -w/2 + 4; i < w/2; i += 6) {
      ctx.beginPath();
      ctx.moveTo(i, -h/2);
      ctx.lineTo(i + 2, h/2);
      ctx.stroke();
    }
    // 縁
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 1;
    ctx.strokeRect(-w/2, -h/2, w, h);
  }

  else if (piece.type === 'chute_h') {
    const w = def.width * CELL;
    const h = def.height * CELL;
    // 竹の地色
    ctx.fillStyle = '#9DAA72';
    ctx.fillRect(-w/2, -h/2, w, h);
    // 内側（彫り込み）
    ctx.fillStyle = PALETTE.sandPale;
    ctx.fillRect(-w/2 + 3, -h/2 + 3, w - 6, h*0.4);
    // 節
    ctx.strokeStyle = '#6F7A52';
    ctx.lineWidth = 1;
    for (let i = -w/2 + 10; i < w/2 - 5; i += 18) {
      ctx.beginPath();
      ctx.moveTo(i, -h/2);
      ctx.lineTo(i, h/2);
      ctx.stroke();
    }
    ctx.strokeStyle = PALETTE.ink;
    ctx.strokeRect(-w/2, -h/2, w, h);
  }

  else if (piece.type === 'chute_l') {
    // L字管: 中心(0,0)を起点に、右と下に伸びる
    ctx.fillStyle = '#9DAA72';
    // 縦の管
    ctx.fillRect(-CELL*0.9, -CELL*0.9, CELL*0.6, CELL*1.8);
    // 横の管
    ctx.fillRect(-CELL*0.9, CELL*0.3, CELL*1.8, CELL*0.6);
    // 節
    ctx.strokeStyle = '#6F7A52';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-CELL*0.6, -CELL*0.9);
    ctx.lineTo(-CELL*0.6, CELL*0.9);
    ctx.moveTo(-CELL*0.9, CELL*0.6);
    ctx.lineTo(CELL*0.9, CELL*0.6);
    ctx.stroke();
    // 縁
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 1;
    ctx.strokeRect(-CELL*0.9, -CELL*0.9, CELL*0.6, CELL*1.8);
    ctx.strokeRect(-CELL*0.9, CELL*0.3, CELL*1.8, CELL*0.6);
  }

  else if (piece.type === 'spring') {
    const sw = CELL;
    const sh = CELL * 0.7;
    const dip = sh * 0.18;
    // 本体（朱色）。上端は V 字
    ctx.fillStyle = PALETTE.vermilion;
    ctx.beginPath();
    ctx.moveTo(-sw/2, -sh/2);
    ctx.lineTo(0, -sh/2 + dip);
    ctx.lineTo(sw/2, -sh/2);
    ctx.lineTo(sw/2, sh/2);
    ctx.lineTo(-sw/2, sh/2);
    ctx.closePath();
    ctx.fill();
    // ばねのコイル線
    ctx.strokeStyle = PALETTE.sandPale;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const ty = -CELL*0.20 + i * (CELL*0.45/4);
      ctx.moveTo(-CELL*0.35, ty);
      ctx.lineTo(CELL*0.35, ty);
    }
    ctx.stroke();
    // 縁
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-sw/2, -sh/2);
    ctx.lineTo(0, -sh/2 + dip);
    ctx.lineTo(sw/2, -sh/2);
    ctx.lineTo(sw/2, sh/2);
    ctx.lineTo(-sw/2, sh/2);
    ctx.closePath();
    ctx.stroke();
    // F8: 噴出方向の矢印
    ctx.fillStyle = PALETTE.sandPale;
    ctx.beginPath();
    ctx.moveTo(0, -sh/2 - CELL*0.25);
    ctx.lineTo(-CELL*0.18, -sh/2 + dip - 4);
    ctx.lineTo(CELL*0.18, -sh/2 + dip - 4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }

  else if (piece.type === 'pendulum') {
    // 支点と棒と振り子（piece状態優先、未設定時は静止）
    const swingAngle = piece.pendulumAngle != null ? piece.pendulumAngle : 0;
    const armLen = CELL * 2.0;
    const bobR = CELL * 0.45;
    const bx = Math.sin(swingAngle) * armLen;
    const by = Math.cos(swingAngle) * armLen;
    // 棒
    ctx.strokeStyle = PALETTE.inkSoft;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(bx, by);
    ctx.stroke();
    // 支点
    ctx.fillStyle = PALETTE.ink;
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI*2);
    ctx.fill();
    // 振り子の玉
    ctx.fillStyle = PALETTE.vermilion;
    ctx.beginPath();
    ctx.arc(bx, by, bobR, 0, Math.PI*2);
    ctx.fill();
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  else if (piece.type === 'gate') {
    const baseRot = piece.rotation || 0;
    // F8: 未反転時、反転後の角度を破線で予告（ctxは既に piece.rotation 分回転済み）
    if (!piece.flipped) {
      ctx.save();
      // 現在の baseRot を打ち消して、反転後の角度に
      ctx.rotate(-baseRot * Math.PI / 180);
      ctx.rotate(-baseRot * Math.PI / 180);
      const w = def.width * CELL;
      const h = def.height * CELL;
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = PALETTE.moss;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-w/2, -h/2, w, h);
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.restore();
    }
    // 本体
    ctx.save();
    const effRot = (piece.flipped ? -baseRot : baseRot) * Math.PI / 180;
    ctx.rotate(-baseRot * Math.PI / 180);
    ctx.rotate(effRot);
    const w = def.width * CELL;
    const h = def.height * CELL;
    ctx.fillStyle = piece.flipped ? PALETTE.moss : PALETTE.inkSoft;
    ctx.fillRect(-w/2, -h/2, w, h);
    // 中央のマーク
    ctx.fillStyle = PALETTE.sandPale;
    ctx.fillRect(-3, -h/2, 6, h);
    // 縁
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 1;
    ctx.strokeRect(-w/2, -h/2, w, h);
    ctx.restore();
  }

  else if (piece.type === 'windmill') {
    // piece.windmillAngle 優先、未設定時は t * baseRate（プレース中の連続回転表示）
    const rotSpeed = 1.8;
    const rot = piece.windmillAngle != null ? piece.windmillAngle : (t * rotSpeed + (piece.phase || 0));
    const armLen = CELL * 0.85;
    // 支柱
    ctx.fillStyle = PALETTE.ink;
    ctx.fillRect(-2, -2, 4, 4);
    // 羽根
    for (let i = 0; i < 4; i++) {
      const a = rot + i * Math.PI / 2;
      ctx.save();
      ctx.rotate(a);
      ctx.fillStyle = i % 2 === 0 ? '#8C7355' : '#A88466';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(armLen, -4);
      ctx.lineTo(armLen, 4);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.restore();
    }
  }

  else if (piece.type === 'stone') {
    const shape = piece.shape || 'round';
    const r = CELL * 0.42;
    ctx.fillStyle = PALETTE.inkSoft;
    if (shape === 'round') {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI*2);
      ctx.fill();
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 1;
      ctx.stroke();
    } else {
      const s = CELL * 0.45;
      let pts;
      if (shape === 'triangle_up') {
        pts = [[0, -s], [-s, s*0.6], [s, s*0.6]];
      } else if (shape === 'triangle_left') {
        pts = [[-s, 0], [s*0.6, -s], [s*0.6, s]];
      } else {
        pts = [[s, 0], [-s*0.6, -s], [-s*0.6, s]];
      }
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      ctx.lineTo(pts[1][0], pts[1][1]);
      ctx.lineTo(pts[2][0], pts[2][1]);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  // ハイライト（選択中・新規配置）
  if (highlight) {
    ctx.strokeStyle = PALETTE.moss;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.6;
    const r = Math.max(def.width, def.height) * CELL * 0.6;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI*2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

function drawBall(ctx, ball) {
  if (!ball.alive) return;
  // 影
  ctx.fillStyle = PALETTE.shadow;
  ctx.beginPath();
  ctx.arc(ball.x + 1, ball.y + 1, BALL_R, 0, Math.PI*2);
  ctx.fill();
  // 玉本体
  const grad = ctx.createRadialGradient(ball.x - 3, ball.y - 3, 1, ball.x, ball.y, BALL_R);
  grad.addColorStop(0, '#7A7570');
  grad.addColorStop(1, '#3A3835');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI*2);
  ctx.fill();
  // ハイライト
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.beginPath();
  ctx.arc(ball.x - 3, ball.y - 3, 2.5, 0, Math.PI*2);
  ctx.fill();
}

function drawTrail(ctx, trail) {
  if (trail.length < 2) return;
  // F6: 古い軌跡ほど薄く
  ctx.lineCap = 'round';
  ctx.lineWidth = 2;
  for (let i = 1; i < trail.length; i++) {
    const alpha = (i / trail.length) * 0.45;
    ctx.strokeStyle = `rgba(74,72,68,${alpha.toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(trail[i-1].x, trail[i-1].y);
    ctx.lineTo(trail[i].x, trail[i].y);
    ctx.stroke();
  }
}

function drawGhost(ctx, type, x, y, rotation, valid) {
  ctx.save();
  ctx.globalAlpha = 0.55;
  drawPiece(ctx, { type, x, y, rotation }, 0);
  ctx.restore();
  // 配置可否の輪
  ctx.strokeStyle = valid ? PALETTE.moss : PALETTE.vermilion;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 1.5;
  const def = PIECE_DEFS[type];
  const r = Math.max(def.width, def.height) * CELL * 0.55;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI*2);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// F2: 回転/形状指定可能なゴースト描画
function drawGhostWithShape(ctx, type, x, y, rotation, shape, valid) {
  ctx.save();
  ctx.globalAlpha = 0.55;
  drawPiece(ctx, { type, x, y, rotation, shape }, 0);
  ctx.restore();
  ctx.strokeStyle = valid ? PALETTE.moss : PALETTE.vermilion;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 1.5;
  const def = PIECE_DEFS[type];
  const r = Math.max(def.width, def.height) * CELL * 0.55;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI*2);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// 配置可否（重なりチェック）。excludeId はドラッグ中の自分自身を除外するため
function canPlaceAt(type, gx, gy, placed, fixed, ballStart, goal, excludeId = null) {
  const def = PIECE_DEFS[type];
  const halfW = def.width * CELL / 2;
  const halfH = def.height * CELL / 2;

  // 庭の境界
  if (gx - halfW < 4 || gx + halfW > W - 4) return false;
  if (gy - halfH < 4 || gy + halfH > H - 4) return false;

  // 既存ピース
  for (const p of placed) {
    if (excludeId != null && p.id === excludeId) continue;
    const pDef = PIECE_DEFS[p.type];
    const pR = Math.max(pDef.width, pDef.height) * CELL * 0.45;
    const myR = Math.max(def.width, def.height) * CELL * 0.45;
    const dx = gx - p.x, dy = gy - p.y;
    if (dx*dx + dy*dy < (pR + myR - 4)*(pR + myR - 4)) return false;
  }

  // 固定オブジェクト
  for (const f of fixed) {
    const fx1 = f.col * CELL;
    const fy1 = f.row * CELL;
    const fx2 = (f.col + f.w) * CELL;
    const fy2 = (f.row + f.h) * CELL;
    // AABB対AABB
    if (gx + halfW > fx1 && gx - halfW < fx2 &&
        gy + halfH > fy1 && gy - halfH < fy2) {
      return false;
    }
  }

  // ボールの開始位置
  const bsx = (ballStart.col + 0.5) * CELL;
  const bsy = (ballStart.row + 0.5) * CELL;
  if (Math.abs(gx - bsx) < halfW + 12 && Math.abs(gy - bsy) < halfH + 12) return false;

  // ゴール
  const gcx = (goal.col + 0.5) * CELL;
  const gcy = (goal.row + 0.5) * CELL;
  if (Math.abs(gx - gcx) < halfW + 10 && Math.abs(gy - gcy) < halfH + 10) return false;

  return true;
}

// ============================================================================
// ランク判定
// ============================================================================
function getRank(used, targets) {
  if (used <= targets.gold) return 'gold';
  if (used <= targets.silver) return 'silver';
  if (used <= targets.bronze) return 'bronze';
  return 'participation';
}
const RANK_LABEL = {
  gold: '金賞',
  silver: '銀賞',
  bronze: '銅賞',
  participation: '参加賞',
};
const RANK_COLOR = {
  gold: '#C8A341',
  silver: '#9AA0A8',
  bronze: '#A6754B',
  participation: '#7A7570',
};

// ============================================================================
// R3-009: モーダル用フォーカストラップフック
// ============================================================================
function useFocusTrap(ref, active) {
  useEffect(() => {
    if (!active) return;
    const root = ref.current;
    if (!root) return;
    const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const getFocusables = () => Array.from(root.querySelectorAll(FOCUSABLE)).filter(el => !el.disabled);
    // 初期フォーカスは最初の要素
    const first = getFocusables()[0];
    const prevActive = document.activeElement;
    first?.focus();
    const onKey = (e) => {
      if (e.key !== 'Tab') return;
      const focusables = getFocusables();
      if (focusables.length === 0) return;
      const f = focusables[0];
      const l = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === f) {
        e.preventDefault();
        l.focus();
      } else if (!e.shiftKey && document.activeElement === l) {
        e.preventDefault();
        f.focus();
      }
    };
    root.addEventListener('keydown', onKey);
    return () => {
      root.removeEventListener('keydown', onKey);
      if (prevActive && prevActive.focus) prevActive.focus();
    };
  }, [ref, active]);
}

// ============================================================================
// メインコンポーネント
// ============================================================================

function App() {
  const [scene, setScene] = useState('title'); // title | select | play | result
  const [prevScene, setPrevScene] = useState('title');
  const [progress, setProgress] = useState({ stages: {}, hintsUsed: {}, version: 1 });
  const [progressLoaded, setProgressLoaded] = useState(false);
  const [currentStageId, setCurrentStageId] = useState(1);
  const [showMenu, setShowMenu] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  // R3-007: 保存状態 idle | saving | saved | failed
  const [saveStatus, setSaveStatus] = useState('idle');
  const saveSeqRef = useRef(0);
  // R3-006: シーン遷移用 visible state
  const [sceneVisible, setSceneVisible] = useState(true);

  // R3-006: scene が変化したら一度フェードアウト → フェードイン
  useEffect(() => {
    if (scene === prevScene) return;
    setSceneVisible(false);
    const id = setTimeout(() => {
      setPrevScene(scene);
      setSceneVisible(true);
    }, 150);
    return () => clearTimeout(id);
  }, [scene, prevScene]);

  // 永続化のロード
  useEffect(() => {
    loadProgress().then(p => {
      setProgress(p);
      setProgressLoaded(true);
    });
  }, []);

  // R3-003 / R3-007: 永続化のセーブ（状態を追跡）
  useEffect(() => {
    if (!progressLoaded) return;
    const seq = ++saveSeqRef.current;
    setSaveStatus('saving');
    saveProgress(progress)
      .then(() => {
        if (saveSeqRef.current === seq) setSaveStatus('saved');
      })
      .catch((err) => {
        console.warn('[karakuri] saveProgress failed:', err);
        if (saveSeqRef.current === seq) setSaveStatus('failed');
      });
  }, [progress, progressLoaded]);

  const updateStageResult = useCallback((stageId, piecesUsed, hintUsed) => {
    let bestInfo = { isNewBest: false, previousBest: null };
    setProgress(prev => {
      const cur = prev.stages[stageId] || { cleared: false, bestPieces: null };
      const prevBest = cur.bestPieces;
      const best = prevBest == null ? piecesUsed : Math.min(prevBest, piecesUsed);
      const isNewBest = prevBest == null || piecesUsed < prevBest;
      bestInfo = { isNewBest, previousBest: prevBest };
      const hintsUsed = { ...prev.hintsUsed };
      if (hintUsed) hintsUsed[stageId] = true;
      return {
        ...prev,
        stages: {
          ...prev.stages,
          [stageId]: { cleared: true, bestPieces: best, lastUsed: piecesUsed },
        },
        hintsUsed,
      };
    });
    return bestInfo;
  }, []);

  const handleClearProgress = useCallback(() => {
    setProgress({ stages: {}, hintsUsed: {}, version: 1 });
    setShowMenu(false);
  }, []);

  const totalStages = STAGES.length;
  const clearedCount = Object.values(progress.stages).filter(s => s.cleared).length;
  const goldCount = STAGES.filter(s => {
    const p = progress.stages[s.id];
    return p && p.bestPieces != null && p.bestPieces <= s.targets.gold && !progress.hintsUsed[s.id];
  }).length;

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#1A1916] font-noto-sans">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@400;500;600;700&family=Noto+Sans+JP:wght@400;500;700&display=swap');
        .font-noto-sans { font-family: 'Noto Sans JP', sans-serif; }
        .font-noto-serif { font-family: 'Noto Serif JP', serif; }
        .vertical-jp {
          writing-mode: vertical-rl;
          text-orientation: mixed;
        }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulseGold { 0%, 100% { box-shadow: 0 0 0 0 rgba(200,163,65,0.4); } 50% { box-shadow: 0 0 0 8px rgba(200,163,65,0); } }
        .fade-in { animation: fadeIn 0.4s ease-out; }
        .pulse-gold { animation: pulseGold 2s ease-in-out infinite; }
        .stage-card { transition: all 0.2s ease; }
        .stage-card:hover { transform: translateY(-2px); }
        .scrollbar-thin::-webkit-scrollbar { width: 4px; height: 4px; }
        .scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
        .scrollbar-thin::-webkit-scrollbar-thumb { background: rgba(232,223,201,0.3); border-radius: 2px; }
      `}</style>

      <div className="w-full max-w-md min-h-screen relative" style={{ background: PALETTE.sand }}>
        {/* R3-006: シーン遷移フェード */}
        <div
          style={{
            opacity: sceneVisible ? 1 : 0,
            transition: 'opacity 250ms ease',
            minHeight: '100vh',
          }}
        >
        {prevScene === 'title' && (
          <TitleScreen
            onStart={() => setScene('select')}
            onAbout={() => setShowAbout(true)}
            clearedCount={clearedCount}
            totalStages={totalStages}
          />
        )}
        {prevScene === 'select' && (
          <SelectScreen
            stages={STAGES}
            progress={progress}
            onSelect={(id) => { setCurrentStageId(id); setScene('play'); }}
            onBack={() => setScene('title')}
            onMenu={() => setShowMenu(true)}
            goldCount={goldCount}
            clearedCount={clearedCount}
          />
        )}
        {prevScene === 'play' && (
          <PlayScreen
            stage={STAGES.find(s => s.id === currentStageId)}
            progress={progress}
            hintUsed={!!progress.hintsUsed[currentStageId]}
            saveStatus={saveStatus}
            onComplete={(piecesUsed, hintUsed) => {
              return updateStageResult(currentStageId, piecesUsed, hintUsed);
            }}
            onBack={() => setScene('select')}
            onNext={() => {
              const idx = STAGES.findIndex(s => s.id === currentStageId);
              if (idx < STAGES.length - 1) {
                setCurrentStageId(STAGES[idx+1].id);
              } else {
                setScene('select');
              }
            }}
          />
        )}
        </div>
        {showMenu && (
          <MenuModal
            onClose={() => setShowMenu(false)}
            onClearProgress={handleClearProgress}
            onAbout={() => { setShowMenu(false); setShowAbout(true); }}
          />
        )}
        {showAbout && (
          <AboutModal onClose={() => setShowAbout(false)} />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// タイトル画面
// ============================================================================
function TitleScreen({ onStart, onAbout, clearedCount, totalStages }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-between px-6 py-12 fade-in" style={{ background: PALETTE.sand }}>
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="text-center mb-2">
          <div className="font-noto-serif text-xs tracking-[0.4em]" style={{ color: PALETTE.inkSoft }}>
            KARAKURI-TEI
          </div>
        </div>
        <h1 className="font-noto-serif text-6xl font-medium mb-8 tracking-wider" style={{ color: PALETTE.ink }}>
          機巧庭
        </h1>
        <div className="w-20 h-px mb-8" style={{ background: PALETTE.inkSoft, opacity: 0.4 }}></div>
        <p className="font-noto-serif text-sm text-center leading-relaxed mb-2" style={{ color: PALETTE.inkSoft }}>
          石の玉を、鈴まで導く<br />
          少ない手数で、美しく
        </p>
        <p className="font-noto-serif text-xs text-center" style={{ color: PALETTE.inkSoft, opacity: 0.6 }}>
          物理連鎖パズル
        </p>
      </div>
      <div className="w-full flex flex-col items-center space-y-3">
        <button
          onClick={() => { audio.init(); onStart(); }}
          className="w-full max-w-[280px] py-4 font-noto-serif text-lg tracking-widest border transition-all hover:scale-[1.02]"
          style={{ background: PALETTE.ink, color: PALETTE.sand, borderColor: PALETTE.ink }}
        >
          始める
        </button>
        <button
          onClick={onAbout}
          className="font-noto-serif text-sm py-2 px-4"
          style={{ color: PALETTE.inkSoft }}
        >
          このゲームについて
        </button>
        {clearedCount > 0 && (
          <div className="font-noto-serif text-xs mt-2" style={{ color: PALETTE.inkSoft }}>
            これまでに {clearedCount} / {totalStages} 庭を解いた
          </div>
        )}
      </div>
      <div className="text-center pt-4">
        <div className="font-noto-serif text-[10px] tracking-widest" style={{ color: PALETTE.inkSoft, opacity: 0.5 }}>
          v1.0
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// ステージ選択画面
// ============================================================================
function SelectScreen({ stages, progress, onSelect, onBack, onMenu, goldCount, clearedCount }) {
  // F7: 次にプレイすべき庭（最も若い未クリアID）
  const nextStage = stages.find(s => !(progress.stages[s.id] && progress.stages[s.id].cleared));
  const allCleared = !nextStage;

  return (
    <div className="min-h-screen flex flex-col fade-in" style={{ background: PALETTE.sand }}>
      <div className="px-5 pt-6 pb-4 flex items-center justify-between">
        <button onClick={onBack} className="font-noto-serif text-sm" style={{ color: PALETTE.inkSoft }}>
          ← 戻る
        </button>
        <h2 className="font-noto-serif text-base tracking-widest" style={{ color: PALETTE.ink }}>
          庭を選ぶ
        </h2>
        <button onClick={onMenu} className="font-noto-serif text-sm" style={{ color: PALETTE.inkSoft }}>
          設定
        </button>
      </div>
      <div className="px-5 pb-3 flex justify-center gap-6">
        <div className="text-center">
          <div className="font-noto-serif text-2xl" style={{ color: PALETTE.ink }}>{clearedCount}</div>
          <div className="font-noto-serif text-[10px] tracking-widest" style={{ color: PALETTE.inkSoft }}>解いた</div>
        </div>
        <div className="w-px" style={{ background: PALETTE.inkSoft, opacity: 0.2 }}></div>
        <div className="text-center">
          <div className="font-noto-serif text-2xl" style={{ color: '#C8A341' }}>{goldCount}</div>
          <div className="font-noto-serif text-[10px] tracking-widest" style={{ color: PALETTE.inkSoft }}>金賞</div>
        </div>
      </div>

      {/* F7: 続きからセクション */}
      {nextStage && (
        <div className="px-5 pb-2">
          <button
            onClick={() => onSelect(nextStage.id)}
            className="w-full text-left p-4 border-2 transition-all hover:scale-[1.01]"
            style={{
              background: PALETTE.ink,
              borderColor: PALETTE.ink,
              color: PALETTE.sandPale,
            }}
          >
            <div className="font-noto-serif text-[10px] tracking-widest mb-1" style={{ opacity: 0.7 }}>
              続きから
            </div>
            <div className="flex items-baseline justify-between">
              <div>
                <span className="font-noto-serif text-xs" style={{ opacity: 0.7 }}>{TIER_LABEL[nextStage.tier]} {nextStage.id}</span>
                <span className="font-noto-serif text-xl ml-2">{nextStage.name}</span>
              </div>
              <span className="font-noto-serif text-sm" style={{ opacity: 0.7 }}>始める →</span>
            </div>
            <div className="font-noto-serif text-xs mt-1" style={{ opacity: 0.6 }}>
              {nextStage.subtitle}
            </div>
          </button>
        </div>
      )}
      {allCleared && (
        <div className="px-5 pb-2">
          <div className="w-full p-4 border-2 text-center" style={{ background: PALETTE.sandPale, borderColor: PALETTE.moss }}>
            <div className="font-noto-serif text-sm tracking-widest" style={{ color: PALETTE.moss }}>
              全15庭を解きました
            </div>
            <div className="font-noto-serif text-xs mt-1" style={{ color: PALETTE.inkSoft }}>
              金賞 {goldCount} / 15 ・ 残り10庭は今後追加予定
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-5 py-4 scrollbar-thin">
        {['tutorial', 'beginner', 'intermediate'].map(tier => {
          const tierStages = stages.filter(s => s.tier === tier);
          return (
            <div key={tier} className="mb-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="font-noto-serif text-sm tracking-widest" style={{ color: PALETTE.inkSoft }}>
                  {TIER_LABEL[tier]}
                </div>
                <div className="flex-1 h-px" style={{ background: PALETTE.inkSoft, opacity: 0.2 }}></div>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {tierStages.map(stage => {
                  const p = progress.stages[stage.id];
                  const hintUsed = !!progress.hintsUsed[stage.id];
                  const cleared = p && p.cleared;
                  const rank = cleared ? getRank(p.bestPieces, stage.targets) : null;
                  // 解禁ロジック
                  const prevId = stage.id - 1;
                  const locked = stage.id > 1 && !(progress.stages[prevId] && progress.stages[prevId].cleared);

                  return (
                    <button
                      key={stage.id}
                      disabled={locked}
                      onClick={() => onSelect(stage.id)}
                      className={`stage-card text-left px-4 py-3 border ${locked ? 'opacity-40' : ''}`}
                      style={{
                        background: cleared ? PALETTE.sandPale : 'transparent',
                        borderColor: PALETTE.inkSoft + '40',
                      }}
                    >
                      <div className="flex items-baseline justify-between">
                        <div className="flex items-baseline gap-2">
                          <span className="font-noto-serif text-xs" style={{ color: PALETTE.inkSoft }}>{stage.id}.</span>
                          <span className="font-noto-serif text-base" style={{ color: PALETTE.ink }}>{stage.name}</span>
                          <span className="font-noto-serif text-xs" style={{ color: PALETTE.inkSoft, opacity: 0.8 }}>{stage.subtitle}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          {rank && !hintUsed && rank !== 'participation' && (
                            <span
                              className="font-noto-serif text-[10px] px-1.5 py-0.5"
                              style={{ background: RANK_COLOR[rank], color: PALETTE.sandPale }}
                            >
                              {RANK_LABEL[rank]}
                            </span>
                          )}
                          {rank === 'participation' && (
                            <span className="font-noto-serif text-[10px]" style={{ color: PALETTE.inkSoft }}>解</span>
                          )}
                          {hintUsed && cleared && (
                            <span className="font-noto-serif text-[10px] px-1.5 py-0.5"
                              style={{ background: PALETTE.mossPale, color: PALETTE.sandPale, opacity: 0.7 }}
                            >
                              灯篭
                            </span>
                          )}
                          {locked && (
                            <span className="font-noto-serif text-xs" style={{ color: PALETTE.inkSoft }}>鍵</span>
                          )}
                        </div>
                      </div>
                      {p && p.bestPieces != null && (
                        <div className="font-noto-serif text-[10px] mt-1" style={{ color: PALETTE.inkSoft }}>
                          ベスト {p.bestPieces} 手 / 金 {stage.targets.gold} 銀 {stage.targets.silver} 銅 {stage.targets.bronze}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// プレイ画面
// ============================================================================
function PlayScreen({ stage, progress, hintUsed: initialHintUsed, saveStatus, onComplete, onBack, onNext }) {
  const canvasRef = useRef(null);
  const [placed, setPlaced] = useState([]); // 配置済みピース
  const [selectedType, setSelectedType] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [ball, setBall] = useState({ x: 0, y: 0, vx: 0, vy: 0, alive: false });
  const [result, setResult] = useState(null); // { cleared, piecesUsed, rank } | { failed: true, reason }
  const [hintUsed, setHintUsed] = useState(initialHintUsed);
  const [hintData, setHintData] = useState(null);
  const [selectedPlaced, setSelectedPlaced] = useState(null); // 配置済みピースを選択中
  // F5: ゴーストの初期位置は画面中央（ピース選択時に置き換え）
  const [pointer, setPointer] = useState({ x: W/2, y: H/2, inside: true });
  const [trail, setTrail] = useState([]);
  const [frame, setFrame] = useState(0);
  // F1: ドラッグ中のピース { id, offsetX, offsetY, currentX, currentY, valid } | null
  const [draggingPiece, setDraggingPiece] = useState(null);
  // F2: 配置前のゴースト回転・形状
  const [ghostRotation, setGhostRotation] = useState(0);
  const [ghostShape, setGhostShape] = useState(null);
  // F18: 整える確認ダイアログ
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const stateRef = useRef({ ball: null, placed: [], fixed: [], goal: null, cleared: false, lost: false });
  const animRef = useRef(null);
  const animTRef = useRef(0); // 累積秒数（動的ピースのフェーズに利用）
  // F1: pointerDown 情報（タップ/ドラッグ判別用）
  const pointerDownRef = useRef(null); // { startX, startY, startTime, targetPieceId, dragMode, longPressTimer }
  // R3-001: 「touchstart で緑/ピース/オーバーレイを掴んでいる」フラグ。
  // touchmove でブラウザのスクロール再開を防ぐために必要。
  const touchConsumingRef = useRef(false);
  // R3-010: ダーティフラグ（一時的な再描画要求）
  const dirtyRef = useRef(true);

  // 残りピース計算
  const pieceCounts = {};
  Object.entries(stage.pieces).forEach(([type, count]) => {
    pieceCounts[type] = count - placed.filter(p => p.type === type).length;
  });
  const totalUsed = placed.length;

  // F2: selectedType が変わったらゴースト回転をリセット
  useEffect(() => {
    if (selectedType) {
      const def = PIECE_DEFS[selectedType];
      setGhostRotation(def.rotations[0]);
      setGhostShape(def.shapes ? def.shapes[0] : null);
    }
  }, [selectedType]);

  // ステージ変更時のリセット
  useEffect(() => {
    setPlaced([]);
    setSelectedType(null);
    setIsRunning(false);
    setResult(null);
    setHintUsed(initialHintUsed);
    setHintData(null);
    setSelectedPlaced(null);
    setDraggingPiece(null);
    setTrail([]);
    pointerDownRef.current = null;
    const bsx = (stage.ballStart.col + 0.5) * CELL;
    const bsy = (stage.ballStart.row + 0.5) * CELL;
    setBall({ x: bsx, y: bsy, vx: 0, vy: 0, alive: false });
  }, [stage.id, initialHintUsed]);

  // 描画
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    drawBackground(ctx);
    drawGrid(ctx);
    drawFixed(ctx, stage.fixed);
    drawGoal(ctx, stage.goal, frame);

    // 軌跡
    drawTrail(ctx, trail);

    // 配置済みピース（実行中は stateRef のミューテートされたコピーを使い、動的ピースをアニメ）
    const t = animTRef.current;
    const piecesToDraw = (isRunning || result?.failed) && stateRef.current.placed ? stateRef.current.placed : placed;
    piecesToDraw.forEach(p => {
      // F1: ドラッグ中のピースは元位置に描画しない（フローティング側で描画）
      if (draggingPiece && p.id === draggingPiece.id) return;
      const isSelected = !isRunning && selectedPlaced && p.id === selectedPlaced.id;
      drawPiece(ctx, p, t, isSelected);
    });

    // F9: 反転扉発動エフェクト
    if (stateRef.current.gateFlipEffects && stateRef.current.gateFlipEffects.length > 0) {
      stateRef.current.gateFlipEffects.forEach(ef => {
        const progress = 1 - ef.life / ef.maxLife;
        const r = 8 + progress * 36;
        const alpha = (1 - progress) * 0.6;
        ctx.strokeStyle = `rgba(181, 62, 58, ${alpha})`;
        ctx.lineWidth = 2.5 * (1 - progress) + 0.5;
        ctx.beginPath();
        ctx.arc(ef.x, ef.y, r, 0, Math.PI*2);
        ctx.stroke();
        // 内側のフラッシュ
        ctx.fillStyle = `rgba(199, 108, 104, ${alpha * 0.5})`;
        ctx.beginPath();
        ctx.arc(ef.x, ef.y, r * 0.5, 0, Math.PI*2);
        ctx.fill();
        ef.life--;
      });
      stateRef.current.gateFlipEffects = stateRef.current.gateFlipEffects.filter(e => e.life > 0);
    }

    // F3: 失敗時、玉の最終停止位置にゴースト
    if (result?.failed && stateRef.current.lastBallPos) {
      const p = stateRef.current.lastBallPos;
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = PALETTE.shadow;
      ctx.beginPath();
      ctx.arc(p.x, p.y, BALL_R, 0, Math.PI*2);
      ctx.fill();
      // × マーク
      ctx.strokeStyle = PALETTE.vermilion;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x - 6, p.y - 6);
      ctx.lineTo(p.x + 6, p.y + 6);
      ctx.moveTo(p.x + 6, p.y - 6);
      ctx.lineTo(p.x - 6, p.y + 6);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // 玉
    if (ball.alive || (!isRunning && !result?.failed)) {
      const bx = ball.alive ? ball.x : (stage.ballStart.col + 0.5) * CELL;
      const by = ball.alive ? ball.y : (stage.ballStart.row + 0.5) * CELL;
      drawBall(ctx, { x: bx, y: by, alive: true });
    }

    // F1: ドラッグ中のピース（フローティング表示）
    if (draggingPiece && !isRunning) {
      const dragged = placed.find(p => p.id === draggingPiece.id);
      if (dragged) {
        const valid = canPlaceAt(
          dragged.type, draggingPiece.currentX, draggingPiece.currentY,
          placed, stage.fixed, stage.ballStart, stage.goal,
          dragged.id
        );
        ctx.save();
        ctx.globalAlpha = 0.75;
        drawPiece(ctx, {
          ...dragged,
          x: draggingPiece.currentX,
          y: draggingPiece.currentY,
        }, t, false);
        ctx.restore();
        // 配置可否の輪
        const def = PIECE_DEFS[dragged.type];
        const r = Math.max(def.width, def.height) * CELL * 0.55;
        ctx.strokeStyle = valid ? PALETTE.moss : PALETTE.vermilion;
        ctx.globalAlpha = 0.65;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(draggingPiece.currentX, draggingPiece.currentY, r, 0, Math.PI*2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // ゴーストピース（配置プレビュー、F5: 常時表示）
    if (selectedType && !isRunning && !draggingPiece) {
      // F13: スナップ位置にゴースト
      const gx = snapToGrid(pointer.x);
      const gy = snapToGrid(pointer.y);
      const valid = canPlaceAt(selectedType, gx, gy, placed, stage.fixed, stage.ballStart, stage.goal);
      drawGhostWithShape(ctx, selectedType, gx, gy, ghostRotation, ghostShape, valid);
    }

    // F10: 選択中ピースのオーバーレイ（左右回転＋削除）
    if (selectedPlaced && !isRunning && !draggingPiece) {
      const p = selectedPlaced;
      const def = PIECE_DEFS[p.type];
      const baseR = Math.max(def.width, def.height) * CELL * 0.5;
      const overlayR = Math.max(baseR + 16, CELL * 1.1);
      const canRotate = def.rotations.length > 1 || def.shapes;

      // ピース上部の × アイコン
      const removeX = p.x;
      const removeY = p.y - overlayR - 10;
      ctx.save();
      ctx.fillStyle = PALETTE.vermilion;
      ctx.globalAlpha = 0.92;
      ctx.beginPath();
      ctx.arc(removeX, removeY, 12, 0, Math.PI*2);
      ctx.fill();
      ctx.strokeStyle = PALETTE.sandPale;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(removeX - 4, removeY - 4);
      ctx.lineTo(removeX + 4, removeY + 4);
      ctx.moveTo(removeX + 4, removeY - 4);
      ctx.lineTo(removeX - 4, removeY + 4);
      ctx.stroke();
      ctx.restore();

      // 左右の半円アイコン
      if (canRotate) {
        // 左半円: ↶
        ctx.save();
        ctx.fillStyle = PALETTE.ink;
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        ctx.arc(p.x, p.y, overlayR, Math.PI/2, Math.PI*3/2);
        ctx.closePath();
        ctx.fill();

        // 左回転アイコン
        ctx.strokeStyle = PALETTE.sandPale;
        ctx.globalAlpha = 0.95;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        const lcx = p.x - overlayR * 0.55;
        const lcy = p.y;
        const arcR = 9;
        ctx.beginPath();
        ctx.arc(lcx, lcy, arcR, Math.PI*0.2, Math.PI*1.6, false);
        ctx.stroke();
        // 矢印先端（左向き、上方向）
        ctx.beginPath();
        const ax = lcx + Math.cos(Math.PI*1.6) * arcR;
        const ay = lcy + Math.sin(Math.PI*1.6) * arcR;
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax - 4, ay - 1);
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax - 1, ay - 5);
        ctx.stroke();
        ctx.restore();

        // 右半円: ↷
        ctx.save();
        ctx.fillStyle = PALETTE.ink;
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        ctx.arc(p.x, p.y, overlayR, -Math.PI/2, Math.PI/2);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = PALETTE.sandPale;
        ctx.globalAlpha = 0.95;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        const rcx = p.x + overlayR * 0.55;
        const rcy = p.y;
        ctx.beginPath();
        ctx.arc(rcx, rcy, arcR, Math.PI*0.8, -Math.PI*0.6, true);
        ctx.stroke();
        // 矢印先端（右向き、上方向）
        ctx.beginPath();
        const bx = rcx + Math.cos(-Math.PI*0.6) * arcR;
        const by = rcy + Math.sin(-Math.PI*0.6) * arcR;
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + 4, by - 1);
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + 1, by - 5);
        ctx.stroke();
        ctx.restore();

        // ピースの輪郭ハイライト
        ctx.strokeStyle = PALETTE.moss;
        ctx.globalAlpha = 0.7;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, overlayR, 0, Math.PI*2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else {
        // 回転不可ピースは輪のみ
        ctx.strokeStyle = PALETTE.moss;
        ctx.globalAlpha = 0.7;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, overlayR, 0, Math.PI*2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // F17: クリア後の余韻波紋
    if (stateRef.current.clearTime && stateRef.current.clearGoalPos) {
      const elapsed = performance.now() - stateRef.current.clearTime;
      if (elapsed < 1200) {
        const gp = stateRef.current.clearGoalPos;
        const goalType = stateRef.current.clearGoalType;
        const color = goalType === 'bell' ? '181, 62, 58'
                    : goalType === 'candle' ? '212, 144, 56'
                    : '92, 111, 74';
        // 3つの波紋を時差で展開
        for (let i = 0; i < 3; i++) {
          const phase = (elapsed - i * 200) / 800;
          if (phase < 0 || phase > 1) continue;
          const r = 18 + phase * 70;
          const alpha = (1 - phase) * 0.55;
          ctx.save();
          ctx.strokeStyle = `rgba(${color}, ${alpha.toFixed(3)})`;
          ctx.lineWidth = 2.5 * (1 - phase) + 0.5;
          ctx.beginPath();
          ctx.arc(gp.x, gp.y, r, 0, Math.PI*2);
          ctx.stroke();
          ctx.restore();
        }
      }
    }

    // F16: ヒント位置の円表示
    if (hintData && hintData.position) {
      const hpx = (hintData.position.x) * CELL;
      const hpy = (hintData.position.y) * CELL;
      const hr = (hintData.position.radius || 1.5) * CELL;
      ctx.save();
      ctx.strokeStyle = PALETTE.moss;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.arc(hpx, hpy, hr, 0, Math.PI*2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // ヒント表示（テキスト）
    if (hintData) {
      ctx.fillStyle = PALETTE.moss;
      ctx.globalAlpha = 0.65;
      ctx.font = '11px "Noto Serif JP"';
      ctx.fillText(`灯篭: ${hintData.type}`, 8, H - 8);
      ctx.globalAlpha = 1;
    }
  }, [placed, ball, frame, pointer, selectedType, selectedPlaced, isRunning, hintData, stage, trail, result, ghostRotation, ghostShape, draggingPiece]);

  // アニメーションループ
  useEffect(() => {
    let lastT = performance.now();
    const loop = (now) => {
      const dt = Math.min(50, now - lastT); // ms, クランプ
      lastT = now;
      animTRef.current += dt / 1000;

      // R3-010: 動画的な再描画が必要な条件を判定（シミュレーション停止中のアイドル化）
      const hasDynamic = placed.some(p => PIECE_DEFS[p.type]?.dynamic);
      const ripple = stateRef.current.clearTime && (performance.now() - stateRef.current.clearTime < 1200);
      const gateFx = stateRef.current.gateFlipEffects && stateRef.current.gateFlipEffects.length > 0;
      const needsTick = isRunning || hasDynamic || ripple || gateFx || dirtyRef.current;
      if (needsTick) {
        setFrame(f => (f + 1) & 0xFFFF); // 描画トリガ
        dirtyRef.current = false;
      }

      if (isRunning) {
        const state = stateRef.current;
        simStep(state, animTRef.current);

        // 同期
        setBall({ ...state.ball });

        // 軌跡
        if (state.ball.alive) {
          setTrail(prev => {
            const next = [...prev, { x: state.ball.x, y: state.ball.y }];
            if (next.length > 80) next.shift();
            return next;
          });
        }

        // 完了判定（一度だけ）
        if (state.cleared && !state.successHandled) {
          state.successHandled = true;
          state.clearTime = performance.now();
          state.clearGoalType = stage.goal.type;
          state.clearGoalPos = { x: (stage.goal.col + 0.5) * CELL, y: (stage.goal.row + 0.5) * CELL };
          // 効果音は即座に
          const rank = getRank(totalUsed, stage.targets);
          audio.success(rank);
          if (stage.goal.type === 'bell') setTimeout(() => audio.bell(), 100);
          else if (stage.goal.type === 'candle') setTimeout(() => audio.candle(), 100);
          else if (stage.goal.type === 'suikinkutsu') setTimeout(() => audio.suikinkutsu(), 100);
          // F17: 800ms 後にリザルト表示
          setTimeout(() => {
            // F19: ベスト更新情報を受け取って結果に含める
            const bestInfo = onComplete(totalUsed, hintUsed) || { isNewBest: false, previousBest: null };
            setIsRunning(false);
            setResult({
              cleared: true,
              piecesUsed: totalUsed,
              rank,
              isNewBest: bestInfo.isNewBest,
              previousBest: bestInfo.previousBest,
            });
          }, 800);
        } else if ((state.lost || state.steps >= MAX_STEPS) && !state.failHandled) {
          state.failHandled = true;
          setIsRunning(false);
          setResult({ failed: true, reason: state.failReason || 'timeout' });
          audio.fail();
        }
        state.steps = (state.steps || 0) + 1;
      }
      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  // eslint-disable-next-line
  }, [isRunning, totalUsed, stage, hintUsed, placed]);

  // R3-010: 状態変化時にダーティ化（再描画を一回保証）
  useEffect(() => { dirtyRef.current = true; }, [
    placed, selectedType, selectedPlaced, draggingPiece,
    pointer, hintData, result, ghostRotation, ghostShape,
  ]);

  // === F1: ポインタイベント（タップ/長押し/ドラッグの判別） ===

  const TAP_MAX_DIST = 5;         // この距離以内ならタップ判定
  const LONG_PRESS_MS = 300;      // この時間で長押し → ドラッグへ
  const DRAG_TRIGGER_DIST = 6;    // 移動量がこれを超えるとドラッグ

  // ポインタ位置をキャンバス座標に変換
  const getCanvasPos = (clientX, clientY) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (W / rect.width),
      y: (clientY - rect.top) * (H / rect.height),
    };
  };

  // 指定位置にあるピースを返す（手前優先）
  const findPieceAt = (x, y) => {
    for (let i = placed.length - 1; i >= 0; i--) {
      const p = placed[i];
      const def = PIECE_DEFS[p.type];
      const r = Math.max(def.width, def.height) * CELL * 0.5;
      const dx = x - p.x, dy = y - p.y;
      if (dx*dx + dy*dy < r*r) return p;
    }
    return null;
  };

  // F10: 選択中ピースのオーバーレイアイコンヒット判定
  // 返り値: 'left' | 'right' | 'remove' | null
  const findOverlayHit = (x, y) => {
    if (!selectedPlaced || isRunning) return null;
    const p = selectedPlaced;
    const def = PIECE_DEFS[p.type];
    const baseR = Math.max(def.width, def.height) * CELL * 0.5;
    const overlayR = Math.max(baseR + 16, CELL * 1.1);
    const dx = x - p.x;
    const dy = y - p.y;
    const dist2 = dx*dx + dy*dy;

    // 上端の × アイコン（小さい円エリア）
    const removeIconX = p.x;
    const removeIconY = p.y - overlayR - 10;
    const rdx = x - removeIconX, rdy = y - removeIconY;
    if (rdx*rdx + rdy*rdy < 14*14) return 'remove';

    // 左右の半円エリア（オーバーレイ円内）
    if (dist2 < overlayR * overlayR) {
      // 回転/形状切替が可能なピースのみ
      if (def.rotations.length > 1 || def.shapes) {
        return dx < 0 ? 'left' : 'right';
      }
    }
    return null;
  };

  // F10: 配置済みピースを回転
  const rotateSelectedPlaced = (direction) => {
    if (!selectedPlaced) return;
    const def = PIECE_DEFS[selectedPlaced.type];
    if (def.rotations.length <= 1 && !def.shapes) return;
    setPlaced(prev => prev.map(p => {
      if (p.id !== selectedPlaced.id) return p;
      if (def.rotations.length > 1) {
        const idx = def.rotations.indexOf(p.rotation);
        const step = direction === 'left' ? -1 : 1;
        const next = def.rotations[(idx + step + def.rotations.length) % def.rotations.length];
        return { ...p, rotation: next };
      } else if (def.shapes) {
        const cur = p.shape || def.shapes[0];
        const idx = def.shapes.indexOf(cur);
        const step = direction === 'left' ? -1 : 1;
        const next = def.shapes[(idx + step + def.shapes.length) % def.shapes.length];
        return { ...p, shape: next };
      }
      return p;
    }));
    setSelectedPlaced(prev => {
      if (!prev) return prev;
      const d = PIECE_DEFS[prev.type];
      if (d.rotations.length > 1) {
        const idx = d.rotations.indexOf(prev.rotation);
        const step = direction === 'left' ? -1 : 1;
        return { ...prev, rotation: d.rotations[(idx + step + d.rotations.length) % d.rotations.length] };
      } else if (d.shapes) {
        const cur = prev.shape || d.shapes[0];
        const idx = d.shapes.indexOf(cur);
        const step = direction === 'left' ? -1 : 1;
        return { ...prev, shape: d.shapes[(idx + step + d.shapes.length) % d.shapes.length] };
      }
      return prev;
    });
    audio.pickup();
  };

  const removeSelectedPlaced = () => {
    if (!selectedPlaced) return;
    setPlaced(prev => prev.filter(p => p.id !== selectedPlaced.id));
    setSelectedPlaced(null);
    audio.remove();
  };

  // F13: 1/4セルへスナップ
  const snapToGrid = (v) => {
    const unit = CELL / 4;
    return Math.round(v / unit) * unit;
  };

  const startDrag = (piece, pointerX, pointerY) => {
    setDraggingPiece({
      id: piece.id,
      offsetX: pointerX - piece.x,
      offsetY: pointerY - piece.y,
      currentX: piece.x,
      currentY: piece.y,
      valid: true,
    });
    setSelectedPlaced(null);
    audio.pickup();
  };

  const handlePointerDown = (clientX, clientY) => {
    if (isRunning) return;
    const pos = getCanvasPos(clientX, clientY);

    // F10: オーバーレイアイコンのヒット判定（最優先）
    const overlayHit = findOverlayHit(pos.x, pos.y);
    if (overlayHit) {
      // pointerDownRef にフラグだけ立てて、Up で実行
      pointerDownRef.current = {
        startX: pos.x, startY: pos.y,
        startTime: performance.now(),
        overlayAction: overlayHit,
        dragMode: false, longPressTimer: null,
      };
      return;
    }

    const target = findPieceAt(pos.x, pos.y);

    // F11+F12: ピース無し かつ ピース選択中でなければ何もしない → ブラウザのスクロール委譲
    if (!target && !selectedType) {
      // ただし、選択中ピースがあるなら、選択解除のためにDown情報を残す
      if (selectedPlaced) {
        pointerDownRef.current = {
          startX: pos.x, startY: pos.y,
          startTime: performance.now(),
          targetPieceId: null, targetPiece: null,
          dragMode: false, longPressTimer: null,
          willDeselect: true,
        };
      } else {
        pointerDownRef.current = null;
      }
      return;
    }

    // 長押しタイマー（ピース上のみ）
    let longPressTimer = null;
    if (target) {
      longPressTimer = setTimeout(() => {
        if (pointerDownRef.current && !pointerDownRef.current.dragMode) {
          const pd = pointerDownRef.current;
          const dx = pd.startX - target.x;
          const dy = pd.startY - target.y;
          // 移動量が少なければドラッグ開始
          pd.dragMode = true;
          startDrag(target, pos.x, pos.y);
        }
      }, LONG_PRESS_MS);
    }

    pointerDownRef.current = {
      startX: pos.x, startY: pos.y,
      startTime: performance.now(),
      targetPieceId: target ? target.id : null,
      targetPiece: target,
      dragMode: false,
      longPressTimer,
    };
  };

  const handlePointerMove = (clientX, clientY) => {
    if (isRunning) return;
    const pos = getCanvasPos(clientX, clientY);
    setPointer({ x: pos.x, y: pos.y, inside: pos.x >= 0 && pos.x <= W && pos.y >= 0 && pos.y <= H });

    const pd = pointerDownRef.current;
    if (!pd) return;

    // F12: オーバーレイアクション中は移動量で確定キャンセル
    if (pd.overlayAction) {
      const dx = pos.x - pd.startX;
      const dy = pos.y - pd.startY;
      if (dx*dx + dy*dy > TAP_MAX_DIST*TAP_MAX_DIST) {
        // 動きすぎたらキャンセル
        pd.overlayAction = null;
      }
      return;
    }

    // ドラッグ中：位置更新
    if (pd.dragMode && draggingPiece) {
      setDraggingPiece(prev => prev ? ({
        ...prev,
        currentX: pos.x - prev.offsetX,
        currentY: pos.y - prev.offsetY,
      }) : prev);
      return;
    }

    // ドラッグ開始判定（移動量で）
    const dx = pos.x - pd.startX;
    const dy = pos.y - pd.startY;
    const dist = Math.sqrt(dx*dx + dy*dy);
    if (!pd.dragMode && dist > DRAG_TRIGGER_DIST && pd.targetPiece) {
      pd.dragMode = true;
      if (pd.longPressTimer) clearTimeout(pd.longPressTimer);
      startDrag(pd.targetPiece, pos.x, pos.y);
    }
  };

  const handlePointerUp = (clientX, clientY) => {
    if (isRunning) {
      pointerDownRef.current = null;
      return;
    }
    const pos = getCanvasPos(clientX, clientY);
    const pd = pointerDownRef.current;
    if (!pd) return;

    if (pd.longPressTimer) clearTimeout(pd.longPressTimer);

    // F10: オーバーレイアクション
    if (pd.overlayAction) {
      if (pd.overlayAction === 'left') rotateSelectedPlaced('left');
      else if (pd.overlayAction === 'right') rotateSelectedPlaced('right');
      else if (pd.overlayAction === 'remove') removeSelectedPlaced();
      pointerDownRef.current = null;
      return;
    }

    // ドラッグ確定（F13: スナップ）
    if (pd.dragMode && draggingPiece) {
      const dragged = placed.find(p => p.id === draggingPiece.id);
      if (dragged) {
        const rawX = pos.x - draggingPiece.offsetX;
        const rawY = pos.y - draggingPiece.offsetY;
        const newX = snapToGrid(rawX);
        const newY = snapToGrid(rawY);
        const valid = canPlaceAt(
          dragged.type, newX, newY,
          placed, stage.fixed, stage.ballStart, stage.goal,
          dragged.id
        );
        if (valid) {
          setPlaced(prev => prev.map(p => p.id === dragged.id ? { ...p, x: newX, y: newY } : p));
          audio.place();
        } else {
          audio.fail();
        }
      }
      setDraggingPiece(null);
      pointerDownRef.current = null;
      return;
    }

    // F11/12: 選択解除の意図
    if (pd.willDeselect) {
      setSelectedPlaced(null);
      pointerDownRef.current = null;
      return;
    }

    // タップ判定
    const dx = pos.x - pd.startX;
    const dy = pos.y - pd.startY;
    const dist = Math.sqrt(dx*dx + dy*dy);
    const isTap = dist <= TAP_MAX_DIST;

    if (isTap) {
      if (pd.targetPiece) {
        // 既存ピースをタップ → 選択（F10オーバーレイ表示）
        setSelectedPlaced(pd.targetPiece);
      } else if (selectedType) {
        // 新規配置（F2: ghostRotation/ghostShape 使用、F13: スナップ）
        const def = PIECE_DEFS[selectedType];
        const sx = snapToGrid(pos.x);
        const sy = snapToGrid(pos.y);
        if (canPlaceAt(selectedType, sx, sy, placed, stage.fixed, stage.ballStart, stage.goal)) {
          const newP = {
            id: Date.now() + Math.random(),
            type: selectedType,
            x: sx, y: sy,
            rotation: ghostRotation,
            shape: ghostShape || (def.shapes ? def.shapes[0] : undefined),
          };
          setPlaced(prev => [...prev, newP]);
          setSelectedPlaced(newP);
          audio.place();
          if (pieceCounts[selectedType] - 1 <= 0) {
            setSelectedType(null);
          }
        } else {
          audio.fail();
        }
      } else {
        setSelectedPlaced(null);
      }
    }

    pointerDownRef.current = null;
  };

  const handlePointerLeave = () => {
    // ドラッグ中は離脱しない（ボタンを押したまま外に出てもドラッグ継続）
    if (!draggingPiece) {
      setPointer(p => ({ ...p, inside: false }));
    }
  };

  // R3-001: ネイティブ passive:false で touchstart/touchmove/touchend/touchcancel を制御
  //
  // 抑制対象（touchConsumingRef = true → スクロール抑制）:
  //   1. ドラッグ中のピース上                 ... draggingPiece が真
  //   2. 配置済みピース選択中（オーバーレイ） ... selectedPlaced が真
  //   3. 配置候補の緑エリア上                 ... selectedType + canPlaceAt が真
  //
  // 上記以外（何も選択していない空白エリア等）はフラグを立てず、
  // touch-action: pan-y によるブラウザの縦スクロールに委ねる（F11 共存）。
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const shouldConsumeTouch = (clientX, clientY) => {
      if (isRunning) return false;

      // 1. すでにドラッグが発生しているピースを動かしている最中
      if (draggingPiece) return true;

      // 2. 配置済みピース選択中（左右回転/削除のオーバーレイUI表示中）
      if (selectedPlaced) return true;

      // 3. ピース種別選択中 かつ 配置候補の緑エリア上
      if (selectedType) {
        const pos = getCanvasPos(clientX, clientY);
        const gx = snapToGrid(pos.x);
        const gy = snapToGrid(pos.y);
        if (canPlaceAt(selectedType, gx, gy, placed, stage.fixed, stage.ballStart, stage.goal)) {
          return true;
        }
      }

      // それ以外（未選択 + 空白 / 緑以外）→ スクロール許可
      return false;
    };

    const handleTouchStart = (e) => {
      if (e.touches.length === 0) return;
      const t = e.touches[0];
      const consume = shouldConsumeTouch(t.clientX, t.clientY);
      touchConsumingRef.current = consume;
      if (consume && e.cancelable) {
        e.preventDefault();
      }
    };

    const handleTouchMove = (e) => {
      // 開始時にフラグを立てた、または途中で長押しドラッグが始まった場合は抑制
      if ((touchConsumingRef.current || draggingPiece) && e.cancelable) {
        e.preventDefault();
      }
    };

    const handleTouchEnd = () => {
      touchConsumingRef.current = false;
    };

    const handleTouchCancel = () => {
      touchConsumingRef.current = false;
    };

    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
    canvas.addEventListener('touchcancel', handleTouchCancel, { passive: false });
    return () => {
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleTouchEnd);
      canvas.removeEventListener('touchcancel', handleTouchCancel);
    };
  }, [selectedType, selectedPlaced, placed, stage, isRunning, draggingPiece]);

  const handleRun = () => {
    if (placed.length === 0) return;
    audio.init();
    // 状態初期化
    const bsx = (stage.ballStart.col + 0.5) * CELL;
    const bsy = (stage.ballStart.row + 0.5) * CELL;
    const ballState = { x: bsx, y: bsy, vx: 0, vy: 0, alive: true };
    // 配置済みピースのstateを初期化（F4: 動的ピースの物理状態）
    const placedCopy = placed.map(p => ({
      ...p,
      flipped: false,
      hasFlipped: false,
      pendulumAngle: 0,
      pendulumAngVel: 0,
      windmillAngle: 0,
      windmillAngVel: 1.8,
    }));
    stateRef.current = {
      ball: ballState,
      placed: placedCopy,
      fixed: stage.fixed,
      goal: stage.goal,
      cleared: false,
      lost: false,
      steps: 0,
      stallCount: 0,
      failReason: null,
      lastBallPos: null,
      successHandled: false,
      failHandled: false,
      gateFlipEffects: [],
      clearTime: null,
      clearGoalType: null,
      clearGoalPos: null,
    };
    setBall({ ...ballState });
    setTrail([]);
    setResult(null);
    setIsRunning(true);
  };

  const handleStop = () => {
    setIsRunning(false);
    const bsx = (stage.ballStart.col + 0.5) * CELL;
    const bsy = (stage.ballStart.row + 0.5) * CELL;
    setBall({ x: bsx, y: bsy, vx: 0, vy: 0, alive: false });
    setTrail([]);
  };

  const doReset = () => {
    setPlaced([]);
    setSelectedPlaced(null);
    setSelectedType(null);
    handleStop();
    setResult(null);
    setShowResetConfirm(false);
  };

  // F18: ピースが2個以上なら確認、1個以下なら即時
  const handleResetRequest = () => {
    if (placed.length >= 2) {
      setShowResetConfirm(true);
    } else {
      doReset();
    }
  };

  const handleHint = () => {
    if (hintUsed) return;
    // ヒント: ピースの中で最も使うべき種類を1つ提示
    const types = Object.entries(stage.pieces);
    types.sort((a, b) => b[1] - a[1]);
    if (types.length > 0) {
      const type = types[0][0];
      // F16: ステージに hintPosition があればそれも渡す
      setHintData({
        type: PIECE_DEFS[type].name,
        position: stage.hintPosition || null,
      });
      setHintUsed(true);
      audio.pickup();
    }
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: PALETTE.sand }}>
      {/* ヘッダー（F11: 上部固定） */}
      <div className="px-4 pt-4 pb-2 flex items-start justify-between sticky top-0 z-10" style={{ background: PALETTE.sand, borderBottom: `1px solid ${PALETTE.inkSoft}15` }}>
        <button onClick={onBack} className="font-noto-serif text-sm pt-1" style={{ color: PALETTE.inkSoft }}>← 戻る</button>
        <div className="text-center flex-1">
          <div className="font-noto-serif text-[10px] tracking-widest" style={{ color: PALETTE.inkSoft }}>
            {TIER_LABEL[stage.tier]} {stage.id}
          </div>
          <div className="font-noto-serif text-lg leading-tight" style={{ color: PALETTE.ink }}>
            {stage.name}
          </div>
          <div className="font-noto-serif text-[11px]" style={{ color: PALETTE.inkSoft }}>
            {stage.subtitle}
          </div>
        </div>
        <button
          onClick={handleHint}
          disabled={hintUsed}
          className="font-noto-serif text-xs pt-1"
          style={{ color: hintUsed ? PALETTE.inkSoft + '60' : PALETTE.moss }}
        >
          {hintUsed ? '灯篭 ●' : '灯篭'}
        </button>
      </div>

      {/* 目標 */}
      <div className="px-4 py-2 flex items-center justify-center gap-3 text-[11px] font-noto-serif" style={{ color: PALETTE.inkSoft }}>
        <span>金 {stage.targets.gold}</span>
        <span style={{ opacity: 0.4 }}>·</span>
        <span>銀 {stage.targets.silver}</span>
        <span style={{ opacity: 0.4 }}>·</span>
        <span>銅 {stage.targets.bronze}</span>
        <span style={{ opacity: 0.4 }}>·</span>
        <span>使用 {totalUsed}</span>
      </div>

      {/* キャンバス */}
      <div className="flex items-center justify-center px-2 pb-2">
        <div className="relative" style={{ width: W, height: H, maxWidth: '100%' }}>
          <canvas
            ref={canvasRef}
            role="application"
            aria-label="カラクリ庭ゲームフィールド"
            onMouseDown={(e) => handlePointerDown(e.clientX, e.clientY)}
            onMouseMove={(e) => handlePointerMove(e.clientX, e.clientY)}
            onMouseUp={(e) => handlePointerUp(e.clientX, e.clientY)}
            onMouseLeave={handlePointerLeave}
            onTouchStart={(e) => {
              if (e.touches.length > 0) {
                const t = e.touches[0];
                handlePointerDown(t.clientX, t.clientY);
                // F11: pointerDownRef が立っている = ピース上 → preventDefault
                if (pointerDownRef.current) {
                  e.preventDefault();
                }
              }
            }}
            onTouchMove={(e) => {
              if (e.touches.length > 0) {
                const t = e.touches[0];
                // F11: pointerDownRef があるとき（ピース上で操作中）のみpreventDefault
                if (pointerDownRef.current) {
                  handlePointerMove(t.clientX, t.clientY);
                  e.preventDefault();
                }
              }
            }}
            onTouchEnd={(e) => {
              if (e.changedTouches.length > 0) {
                const t = e.changedTouches[0];
                if (pointerDownRef.current) {
                  handlePointerUp(t.clientX, t.clientY);
                  e.preventDefault();
                }
              }
            }}
            onTouchCancel={(e) => {
              if (e.changedTouches.length > 0) {
                const t = e.changedTouches[0];
                if (pointerDownRef.current) {
                  handlePointerUp(t.clientX, t.clientY);
                }
              }
            }}
            style={{
              width: '100%', height: 'auto', maxWidth: W,
              // R3-001: 縦スクロールを許可しつつ、JS 側で「選択中/緑エリア/ドラッグ中」のみ
              // touchConsumingRef を立てて preventDefault → スクロール抑制
              touchAction: 'pan-y',
              cursor: draggingPiece ? 'grabbing' : (selectedType ? 'crosshair' : 'pointer'),
              userSelect: 'none',
            }}
          />
        </div>
      </div>

      {/* F10: 選択中ピースの名前のみ表示（操作はキャンバス上のオーバーレイで完結） */}
      {selectedPlaced && !isRunning && (
        <div className="px-4 py-1 flex items-center justify-center fade-in">
          <span className="font-noto-serif text-xs" style={{ color: PALETTE.inkSoft }}>
            {PIECE_DEFS[selectedPlaced.type].name}
          </span>
        </div>
      )}

      {/* F2: ピース選択中の配置前回転ボタン */}
      {selectedType && !isRunning && !draggingPiece && (() => {
        const def = PIECE_DEFS[selectedType];
        const canRotate = def.rotations.length > 1 || def.shapes;
        if (!canRotate) return null;
        const handleGhostRotate = () => {
          if (def.rotations.length > 1) {
            const idx = def.rotations.indexOf(ghostRotation);
            const next = def.rotations[(idx + 1) % def.rotations.length];
            setGhostRotation(next);
          } else if (def.shapes) {
            const cur = ghostShape || def.shapes[0];
            const idx = def.shapes.indexOf(cur);
            const next = def.shapes[(idx + 1) % def.shapes.length];
            setGhostShape(next);
          }
          audio.pickup();
        };
        return (
          <div className="px-4 py-2 flex items-center justify-center gap-2 fade-in" style={{ borderTop: `1px solid ${PALETTE.inkSoft}20` }}>
            <span className="font-noto-serif text-xs" style={{ color: PALETTE.inkSoft }}>
              {def.name} 配置中
            </span>
            <button
              onClick={handleGhostRotate}
              className="font-noto-serif text-xs px-3 py-1 border"
              style={{ color: PALETTE.ink, borderColor: PALETTE.inkSoft + '60' }}
            >
              ↺ 回す
            </button>
            <button
              onClick={() => setSelectedType(null)}
              className="font-noto-serif text-xs px-3 py-1"
              style={{ color: PALETTE.inkSoft }}
            >
              やめる
            </button>
          </div>
        );
      })()}

      {/* ピース選択ツールバー */}
      {!isRunning && (
        <div className="px-3 py-2 overflow-x-auto scrollbar-thin" style={{ borderTop: `1px solid ${PALETTE.inkSoft}20` }}>
          <div className="flex gap-2">
            {Object.entries(stage.pieces).map(([type, count]) => {
              const remaining = pieceCounts[type];
              const isSelected = selectedType === type;
              const disabled = remaining <= 0;
              return (
                <button
                  key={type}
                  disabled={disabled}
                  onClick={() => setSelectedType(isSelected ? null : type)}
                  className="flex-shrink-0 flex flex-col items-center justify-center px-2 py-2 border min-w-[64px]"
                  style={{
                    background: isSelected ? PALETTE.ink : 'transparent',
                    borderColor: isSelected ? PALETTE.ink : PALETTE.inkSoft + '40',
                    opacity: disabled ? 0.3 : 1,
                  }}
                >
                  <div className="w-10 h-10 flex items-center justify-center mb-0.5">
                    <PiecePreview type={type} size={36} />
                  </div>
                  <div className="font-noto-serif text-[10px] leading-tight"
                    style={{ color: isSelected ? PALETTE.sandPale : PALETTE.ink }}
                  >
                    {PIECE_DEFS[type].name}
                  </div>
                  <div className="font-noto-serif text-[10px]"
                    style={{ color: isSelected ? PALETTE.sandPale : PALETTE.inkSoft }}
                  >
                    {remaining} / {count}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* アクションバー（F18: 整えるは右端の小アイコン） */}
      <div className="px-4 py-3 flex items-center justify-center gap-3 sticky bottom-0" style={{ borderTop: `1px solid ${PALETTE.inkSoft}20`, background: PALETTE.sand }}>
        {!isRunning ? (
          <button
            onClick={handleRun}
            disabled={placed.length === 0}
            className="flex-1 max-w-[240px] py-3 font-noto-serif text-base tracking-widest border"
            style={{
              background: placed.length === 0 ? PALETTE.inkSoft : PALETTE.ink,
              color: PALETTE.sand,
              borderColor: PALETTE.ink,
              opacity: placed.length === 0 ? 0.4 : 1,
            }}
          >
            打ち出す
          </button>
        ) : (
          <button
            onClick={handleStop}
            className="flex-1 max-w-[240px] py-3 font-noto-serif text-base tracking-widest border"
            style={{
              background: PALETTE.vermilion,
              color: PALETTE.sand,
              borderColor: PALETTE.vermilion,
            }}
          >
            止める
          </button>
        )}
        <button
          onClick={handleResetRequest}
          disabled={isRunning || placed.length === 0}
          aria-label="整える"
          title="全配置を片付ける"
          className="w-11 h-11 flex items-center justify-center font-noto-serif text-lg border"
          style={{
            color: PALETTE.inkSoft,
            borderColor: PALETTE.inkSoft + '40',
            opacity: (isRunning || placed.length === 0) ? 0.4 : 1,
            borderRadius: '999px',
          }}
        >
          ↻
        </button>
      </div>

      {/* F18: 整える確認ダイアログ */}
      {showResetConfirm && (
        <ResetConfirmModal onConfirm={doReset} onCancel={() => setShowResetConfirm(false)} />
      )}

      {/* 結果モーダル */}
      {result && (
        <ResultModal
          result={result}
          stage={stage}
          hintUsed={hintUsed}
          saveStatus={saveStatus}
          onRetry={() => {
            setResult(null);
            const bsx = (stage.ballStart.col + 0.5) * CELL;
            const bsy = (stage.ballStart.row + 0.5) * CELL;
            setBall({ x: bsx, y: bsy, vx: 0, vy: 0, alive: false });
            setTrail([]);
          }}
          onChange={() => {
            setResult(null);
            setPlaced([]);
            setSelectedType(null);
            const bsx = (stage.ballStart.col + 0.5) * CELL;
            const bsy = (stage.ballStart.row + 0.5) * CELL;
            setBall({ x: bsx, y: bsy, vx: 0, vy: 0, alive: false });
            setTrail([]);
          }}
          onNext={onNext}
          onSelect={onBack}
        />
      )}
    </div>
  );
}

// R3-009: 整える確認モーダル（role=dialog + フォーカストラップ）
function ResetConfirmModal({ onConfirm, onCancel }) {
  const ref = useRef(null);
  useFocusTrap(ref, true);
  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      style={{ background: 'rgba(43,42,40,0.5)', zIndex: 35 }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reset-confirm-title"
        className="fade-in mx-4 p-5 border"
        style={{ background: PALETTE.sand, borderColor: PALETTE.ink, maxWidth: 300 }}
      >
        <div id="reset-confirm-title" className="font-noto-serif text-sm mb-4 text-center" style={{ color: PALETTE.ink }}>
          全ての配置を解いて<br />もう一度はじめから組みますか？
        </div>
        <div className="flex gap-2">
          <button
            onClick={onConfirm}
            aria-label="整える（リセットする）"
            className="flex-1 py-2 font-noto-serif text-xs border"
            style={{ background: PALETTE.vermilion, color: PALETTE.sand, borderColor: PALETTE.vermilion }}
          >
            整える
          </button>
          <button
            onClick={onCancel}
            aria-label="やめる"
            className="flex-1 py-2 font-noto-serif text-xs border"
            style={{ color: PALETTE.ink, borderColor: PALETTE.inkSoft + '60' }}
          >
            やめる
          </button>
        </div>
      </div>
    </div>
  );
}

// ピースのミニチュアプレビュー
function PiecePreview({ type, size = 32 }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.translate(size/2, size/2);
    const scale = size / (CELL * 2.5);
    ctx.scale(scale, scale);
    const def = PIECE_DEFS[type];
    const rot = type === 'ramp_s' || type === 'ramp_l' ? def.rotations[1] : def.rotations[0];
    const shape = def.shapes ? def.shapes[0] : undefined;
    drawPiece(ctx, { type, x: 0, y: 0, rotation: rot, shape }, 0);
    ctx.restore();
  }, [type, size]);
  return <canvas ref={ref} />;
}

// 結果モーダル
function ResultModal({ result, stage, hintUsed, saveStatus, onRetry, onChange, onNext, onSelect }) {
  const dialogRef = useRef(null);
  useFocusTrap(dialogRef, true);

  if (result.failed) {
    // F3: 失敗種別ごとのメッセージ
    const failureMessages = {
      out_of_bounds: { title: '玉が外へ飛び出した', sub: '勢いが強すぎたか、軌道が逸れたか' },
      timeout: { title: '刻が満ちた', sub: '30秒以内に届かなかった' },
      stalled: { title: '玉が止まってしまった', sub: '途中で勢いを失った' },
    };
    const msg = failureMessages[result.reason] || { title: '玉が、届かなかった', sub: '仕掛けを直して、もう一度' };
    return (
      <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(43,42,40,0.5)', zIndex: 30 }}>
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="result-fail-title"
          className="fade-in mx-4 p-6 border"
          style={{ background: PALETTE.sand, borderColor: PALETTE.ink, maxWidth: 320 }}
        >
          <div className="text-center">
            <div className="font-noto-serif text-xs tracking-widest mb-3" style={{ color: PALETTE.inkSoft }}>失敗</div>
            <div id="result-fail-title" className="font-noto-serif text-lg mb-1" style={{ color: PALETTE.ink }}>{msg.title}</div>
            <div className="font-noto-serif text-sm mb-6" style={{ color: PALETTE.inkSoft }}>{msg.sub}</div>
            <div className="flex gap-2">
              <button
                onClick={onRetry}
                aria-label="もう一度挑戦する"
                className="flex-1 py-2 font-noto-serif text-sm border"
                style={{ background: PALETTE.ink, color: PALETTE.sand, borderColor: PALETTE.ink }}
              >
                もう一度
              </button>
              <button
                onClick={onChange}
                aria-label="配置を変える"
                className="flex-1 py-2 font-noto-serif text-sm border"
                style={{ color: PALETTE.ink, borderColor: PALETTE.inkSoft + '60' }}
              >
                配置を変える
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const rank = result.rank;
  const effectiveRank = hintUsed && rank === 'gold' ? 'silver' : rank;
  const isFinalStage = stage.id === STAGES.length;

  return (
    <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(43,42,40,0.5)', zIndex: 30 }}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="result-clear-title"
        className="fade-in mx-4 p-6 border"
        style={{ background: PALETTE.sand, borderColor: PALETTE.ink, maxWidth: 320 }}
      >
        <div className="text-center">
          <div id="result-clear-title" className="font-noto-serif text-xs tracking-widest mb-3" style={{ color: PALETTE.inkSoft }}>
            清まりました
          </div>
          <div className="mb-4">
            <div
              className="inline-block px-6 py-3 font-noto-serif text-2xl tracking-widest"
              style={{ background: RANK_COLOR[effectiveRank], color: PALETTE.sandPale }}
            >
              {RANK_LABEL[effectiveRank]}
            </div>
            {hintUsed && rank === 'gold' && (
              <div className="font-noto-serif text-[10px] mt-2" style={{ color: PALETTE.inkSoft }}>
                ※灯篭を使ったため、銀賞までの判定
              </div>
            )}
          </div>
          <div className="font-noto-serif text-sm mb-2" style={{ color: PALETTE.ink }}>
            {result.piecesUsed} 手で解いた
          </div>
          {/* F19: ベスト更新表示 */}
          {result.isNewBest && result.previousBest != null && (
            <div className="inline-block px-3 py-1 mb-3 font-noto-serif text-[11px]" style={{ background: PALETTE.moss, color: PALETTE.sandPale }}>
              ベスト更新! 前回 {result.previousBest} 手
            </div>
          )}
          {result.isNewBest && result.previousBest == null && (
            <div className="inline-block px-3 py-1 mb-3 font-noto-serif text-[11px]" style={{ background: PALETTE.moss, color: PALETTE.sandPale }}>
              初めての清まり
            </div>
          )}
          {!result.isNewBest && (
            <div className="font-noto-serif text-[11px] mb-3" style={{ color: PALETTE.inkSoft }}>
              ベスト {result.previousBest} 手（更新ならず）
            </div>
          )}
          <div className="flex justify-center gap-3 mb-6 font-noto-serif text-[11px]" style={{ color: PALETTE.inkSoft }}>
            <span>金 {stage.targets.gold}</span>
            <span>銀 {stage.targets.silver}</span>
            <span>銅 {stage.targets.bronze}</span>
          </div>
          <div className="flex flex-col gap-2">
            {!isFinalStage && (
              <button
                onClick={onNext}
                className="w-full py-2.5 font-noto-serif text-sm border"
                style={{ background: PALETTE.ink, color: PALETTE.sand, borderColor: PALETTE.ink }}
              >
                次の庭へ
              </button>
            )}
            <button
              onClick={onChange}
              className="w-full py-2.5 font-noto-serif text-sm border"
              style={{ color: PALETTE.ink, borderColor: PALETTE.inkSoft + '60' }}
            >
              この庭を再挑戦
            </button>
            <button
              onClick={onSelect}
              className="w-full py-2 font-noto-serif text-xs"
              style={{ color: PALETTE.inkSoft }}
            >
              庭を選び直す
            </button>
          </div>
          {/* R3-007: 保存状態の小さなステータス表示 */}
          {saveStatus && saveStatus !== 'idle' && (
            <div
              className="font-noto-serif text-[10px] mt-3"
              style={{
                color: saveStatus === 'failed' ? PALETTE.vermilion : PALETTE.inkSoft,
                opacity: 0.85,
              }}
              role="status"
              aria-live="polite"
            >
              {saveStatus === 'saving' && '保存中…'}
              {saveStatus === 'saved' && '保存完了 ✓'}
              {saveStatus === 'failed' && '保存できませんでした'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// メニューモーダル
function MenuModal({ onClose, onClearProgress, onAbout }) {
  const [confirmClear, setConfirmClear] = useState(false);
  const dialogRef = useRef(null);
  useFocusTrap(dialogRef, true);
  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      style={{ background: 'rgba(43,42,40,0.5)', zIndex: 40 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="menu-modal-title"
        className="fade-in mx-4 p-6 border w-full max-w-xs"
        style={{ background: PALETTE.sand, borderColor: PALETTE.ink }}
      >
        <div id="menu-modal-title" className="font-noto-serif text-base tracking-widest mb-4 text-center" style={{ color: PALETTE.ink }}>
          設定
        </div>
        <div className="flex flex-col gap-2">
          <button
            onClick={onAbout}
            className="w-full py-2.5 font-noto-serif text-sm border"
            style={{ color: PALETTE.ink, borderColor: PALETTE.inkSoft + '60' }}
          >
            このゲームについて
          </button>
          {!confirmClear ? (
            <button
              onClick={() => setConfirmClear(true)}
              className="w-full py-2.5 font-noto-serif text-sm border"
              style={{ color: PALETTE.vermilion, borderColor: PALETTE.vermilion + '80' }}
            >
              進捗を消す
            </button>
          ) : (
            <div className="border p-3" style={{ borderColor: PALETTE.vermilion + '80' }}>
              <div className="font-noto-serif text-xs mb-3 text-center" style={{ color: PALETTE.ink }}>
                全ての進捗が消えます。よろしいですか？
              </div>
              <div className="flex gap-2">
                <button
                  onClick={onClearProgress}
                  className="flex-1 py-2 font-noto-serif text-xs"
                  style={{ background: PALETTE.vermilion, color: PALETTE.sand }}
                >
                  消す
                </button>
                <button
                  onClick={() => setConfirmClear(false)}
                  className="flex-1 py-2 font-noto-serif text-xs border"
                  style={{ color: PALETTE.ink, borderColor: PALETTE.inkSoft + '60' }}
                >
                  やめる
                </button>
              </div>
            </div>
          )}
          <button
            onClick={onClose}
            className="w-full py-2.5 font-noto-serif text-sm"
            style={{ color: PALETTE.inkSoft }}
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}

// Aboutモーダル
function AboutModal({ onClose }) {
  const dialogRef = useRef(null);
  useFocusTrap(dialogRef, true);
  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      style={{ background: 'rgba(43,42,40,0.5)', zIndex: 50 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-modal-title"
        className="fade-in mx-4 p-6 border w-full max-w-sm max-h-[80vh] overflow-y-auto scrollbar-thin"
        style={{ background: PALETTE.sand, borderColor: PALETTE.ink }}
      >
        <div id="about-modal-title" className="font-noto-serif text-base tracking-widest mb-4 text-center" style={{ color: PALETTE.ink }}>
          機巧庭について
        </div>
        <div className="space-y-3 font-noto-serif text-sm leading-relaxed" style={{ color: PALETTE.ink }}>
          <p>
            「機巧庭」は、和の庭園を舞台にした物理連鎖パズルです。
          </p>
          <p>
            限られた道具を庭に配置して、玉を鈴・ろうそく・水琴窟まで導きます。
            少ない手数で解くほど、金・銀・銅で評価されます。
          </p>
          <p style={{ color: PALETTE.inkSoft }}>
            <strong style={{ color: PALETTE.ink }}>遊び方</strong><br />
            1. ピースを選ぶ<br />
            2. 庭をタップして配置<br />
            3. 配置済みピースをタップで回転・削除<br />
            4. 「打ち出す」で玉が転がる<br />
            5. 失敗したら配置を変えて再挑戦
          </p>
          <p style={{ color: PALETTE.inkSoft }}>
            <strong style={{ color: PALETTE.ink }}>灯篭（ヒント）</strong><br />
            各庭で1回だけ、推奨ピースの種類を見ることができます。
            ただし、灯篭を使った庭は金賞を獲得できません（銀賞まで）。
          </p>
          <p style={{ color: PALETTE.inkSoft, fontSize: '11px' }}>
            v1.0 / 全15庭 / 残り10庭は今後追加予定
          </p>
        </div>
        <button
          onClick={onClose}
          className="mt-5 w-full py-2.5 font-noto-serif text-sm border"
          style={{ background: PALETTE.ink, color: PALETTE.sand, borderColor: PALETTE.ink }}
        >
          閉じる
        </button>
      </div>
    </div>
  );
}

export default App;
