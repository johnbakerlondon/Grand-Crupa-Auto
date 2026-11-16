// Headless regression suite for the chess engine behind the board game.
//
// Pulls the engine out of the single-file build and checks the rules a full
// game needs: move generation from the start position (perft), castling,
// en passant, promotion, check, checkmate, stalemate, and that the bot always
// answers with a legal move.
//
// Run with:  node tests/chess-check.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, '..', 'Grand-Crupa-Auto-optimized-3.html'), 'utf8');

const START = '/*CHESS-ENGINE-START*/';
const END = '/*CHESS-ENGINE-END*/';
const a = html.indexOf(START);
const b = html.indexOf(END);
if (a < 0 || b < 0) throw new Error('chess engine block not found');
const block = html.slice(a + START.length, b);
const window = {};
const Chess = new Function('window', block + '\nreturn GcaChess;')(window);

let passed = 0, failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) passed++;
  else { failed++; console.log('  FAIL  ' + name + (detail ? '  [' + detail + ']' : '')); }
};

function perft(st, depth) {
  const ms = Chess.legalMoves(st);
  if (depth <= 1) return ms.length;
  let n = 0;
  for (const m of ms) n += perft(Chess.make(st, m), depth - 1);
  return n;
}

const start = Chess.initial();
ok('start position has 20 moves', Chess.legalMoves(start).length === 20);
const t0 = Date.now();
ok('perft depth 2 is 400', perft(start, 2) === 400, String(perft(start, 2)));
const d3 = perft(start, 3);
ok('perft depth 3 is 8902', d3 === 8902, String(d3));
console.log('chess: perft(3) = ' + d3 + ' in ' + (Date.now() - t0) + 'ms');

/* --- castling --- */
function emptyBoard() {
  const st = Chess.initial();
  st.b = new Array(64).fill('');
  st.castle = '';
  return st;
}
{
  const st = emptyBoard();
  st.b[60] = 'K'; st.b[56] = 'R'; st.b[63] = 'R'; st.b[4] = 'k';
  st.castle = 'KQ';
  const ms = Chess.legalMoves(st, 'w');
  ok('white can castle both ways', ms.some(m => m.castle === 'K') && ms.some(m => m.castle === 'Q'));
  const next = Chess.make(st, ms.find(m => m.castle === 'K'));
  ok('king-side castling moves both pieces', next.b[62] === 'K' && next.b[61] === 'R' && !next.b[63] && !next.b[60]);
}
{
  const st = emptyBoard();
  st.b[60] = 'K'; st.b[56] = 'R'; st.b[63] = 'R'; st.b[4] = 'k'; st.b[57] = 'b';
  st.castle = 'KQ';
  const ms = Chess.legalMoves(st, 'w');
  ok('no castle through a piece', !ms.some(m => m.castle === 'Q') && ms.some(m => m.castle === 'K'));
}
{
  const st = emptyBoard();
  st.b[60] = 'K'; st.b[56] = 'R'; st.b[4] = 'k'; st.b[59] = 'r';
  st.castle = 'Q';
  const ms = Chess.legalMoves(st, 'w');
  ok('no castle out of check', !ms.some(m => m.castle === 'Q'));
}

/* --- en passant --- */
{
  const st = emptyBoard();
  st.b[27] = 'P'; st.b[28] = 'p'; st.b[4] = 'k'; st.b[60] = 'K';
  st.turn = 'w'; st.ep = 20;
  const ms = Chess.legalMoves(st, 'w');
  const ep = ms.find(m => m.to === 20);
  ok('en passant is offered', !!ep);
  const next = Chess.make(st, ep);
  ok('en passant removes the passed pawn', next.b[20] === 'P' && next.b[27] === '' && next.b[28] === '');
}

/* --- promotion --- */
{
  const st = emptyBoard();
  st.b[8] = 'P'; st.b[4] = 'k'; st.b[60] = 'K';
  st.turn = 'w';
  const ms = Chess.legalMoves(st, 'w').filter(m => m.from === 8 && m.to === 0);
  ok('a pawn on the seventh offers four promotions', ms.length === 4, String(ms.length));
  const next = Chess.make(st, ms.find(m => m.promo === 'n'));
  ok('promotion places the chosen piece', next.b[0] === 'N');
}

/* --- check, mate, stalemate --- */
{
  const st = emptyBoard();
  st.b[7] = 'k'; st.b[0] = 'R'; st.b[22] = 'K';
  st.turn = 'b';
  ok('back-rank position is check', Chess.inCheck(st, 'b'));
  ok('back-rank position is checkmate', Chess.status(st) === 'checkmate', Chess.status(st));
}
{
  const st = emptyBoard();
  st.b[0] = 'k'; st.b[18] = 'K'; st.b[17] = 'Q';
  st.turn = 'b';
  const s = Chess.status(st);
  ok('queen-and-king corner is stalemate', s === 'stalemate', s);
}

/* --- the bot --- */
{
  const st = Chess.initial();
  const m = Chess.aiMove(st, 'normal');
  const legal = Chess.legalMoves(st).some(x => x.from === m.from && x.to === m.to && x.promo === m.promo);
  ok('the bot returns a legal move', !!m && legal);
  const took = Chess.make(st, m);
  ok('the bot move leaves it black to move', took.turn === 'b');
}
{
  // it should take a free queen rather than shuffle a pawn
  const st = emptyBoard();
  st.b[43] = 'N'; st.b[28] = 'q'; st.b[0] = 'k'; st.b[56] = 'K';
  st.turn = 'w';
  const m = Chess.aiMove(st, 'hard');
  ok('the bot takes a hanging queen', m && m.to === 28, m ? Chess.sqName(m.from) + '-' + Chess.sqName(m.to) : 'none');
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
