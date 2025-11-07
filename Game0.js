
class Stack {
  constructor(){ this._items = []; }
  push(x){ this._items.push(x); }
  pop(){ return this._items.pop(); }
  peek(){ return this._items[this._items.length - 1]; }
  isEmpty(){ return this._items.length === 0; }
  size(){ return this._items.length; }
  toArray(){ return this._items.slice(); }
  clear(){ this._items = []; }
}
class Queue {
  constructor(){ this._items = []; }
  enqueue(x){ this._items.push(x); }
  dequeue(){ return this._items.shift(); }
  peek(){ return this._items[0]; }
  isEmpty(){ return this._items.length === 0; }
  size(){ return this._items.length; }
  toArray(){ return this._items.slice(); }
  clear(){ this._items = []; }
}
class List {
  constructor(arr = []){ this._items = Array.isArray(arr) ? arr.slice() : []; }
  push(x){ this._items.push(x); }
  pop(){ return this._items.pop(); }
  insert(idx, x){ this._items.splice(idx, 0, x); }
  removeAt(idx){ return this._items.splice(idx, 1)[0]; }
  indexOf(x){ return this._items.indexOf(x); }
  findIndex(fn){ return this._items.findIndex(fn); }
  get(idx){ return this._items[idx]; }
  size(){ return this._items.length; }
  toArray(){ return this._items.slice(); }
  clear(){ this._items = []; }
}

// Constants & state
const RANKS = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
const SUITS = ["♠","♣","♥","♦"];

let deck = [];
let tableaus = [];             // 7 arrays (each column is an array of card objects)
let foundations = [[],[],[],[]];
let stock = new Stack();
let waste = new Stack();
let selected = null;
let undoStack = new Stack();
let redoStack = new Stack();

let score = 0, moves = 0, startTime = null, timerInterval = null, elapsedSeconds = 0;
let currentHint = null; // { move, timeoutId }

// DOM refs
const tableauEl = document.getElementById("tableau");
const stockEl = document.getElementById("stock");
const wasteEl = document.getElementById("waste");
const foundationsEls = [...document.querySelectorAll(".foundation")];
const newGameBtn = document.getElementById("newGame");
const undoBtn = document.getElementById("undoBtn");
const redoBtn = document.getElementById("redoBtn");
const hintBtn = document.getElementById("hintBtn");
const statusEl = document.getElementById("status");
const scoreEl = document.getElementById("scoreEl");
const timeEl = document.getElementById("timeEl");
const startScreen = document.getElementById("startScreen");
const startBtn = document.getElementById("startBtn");
const winModal = document.getElementById("winModal");
const winStats = document.getElementById("winStats");
const winOk = document.getElementById("winOk");

// Utilities
function makeCard(rank, suit){
  return { id: `${rank}${suit}`, rank, suit, color: (suit === "♠" || suit === "♣") ? "black":"red", faceUp:false };
}
function buildDeck(){
  const d = [];
  for (let s of SUITS) for (let r of RANKS) d.push(makeCard(r, s));
  return d;
}
function shuffle(arr){
  for (let i = arr.length -1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
function rankValue(r){
  if (r === "A") return 1;
  if (r === "J") return 11;
  if (r === "Q") return 12;
  if (r === "K") return 13;
  return parseInt(r,10);
}
function filenameForCard(card){
  return encodeURI(`${card.rank}${card.suit}.png`);
}
function findCardObject(cardId){
  for (let col of tableaus) for (let c of col) if (c.id === cardId) return c;
  for (let c of stock.toArray()) if (c.id === cardId) return c;
  for (let c of waste.toArray()) if (c.id === cardId) return c;
  for (let f of foundations) for (let c of f) if (c.id === cardId) return c;
  return null;
}
function formatTime(seconds){
  const mm = Math.floor(seconds/60).toString().padStart(2,'0');
  const ss = (seconds%60).toString().padStart(2,'0');
  return `${mm}:${ss}`;
}

// Waste helpers
function removeCardFromWasteById(cardId){
  const arr = waste.toArray(); // bottom->top
  const idx = arr.findIndex(c => c.id === cardId);
  if (idx === -1) return null;
  const card = arr.splice(idx,1)[0];
  const newS = new Stack();
  for (let c of arr) newS.push(c);
  waste = newS;
  return { card, idx };
}
function insertCardIntoWasteAt(card, idx){
  let arr = waste.toArray();
  if (idx < 0) idx = 0;
  if (idx > arr.length) idx = arr.length;
  arr.splice(idx,0,card);
  const newS = new Stack();
  for (let c of arr) newS.push(c);
  waste = newS;
}

// DOM creation helpers
function createTableauColumns(){
  tableauEl.innerHTML = "";
  for (let i = 0; i < 7; i++){
    const col = document.createElement("div");
    col.className = "column";
    col.dataset.index = i;
    const stack = document.createElement("div");
    stack.className = "stack";
    stack.style.position = "relative";
    col.appendChild(stack);
    col.addEventListener("click", (e) => {
      if (e.target === col || e.target === stack) attemptMoveToTableau(i);
    });
    tableauEl.appendChild(col);
  }
}

// Animate start screen
function startAnimation(){
  const stacks = document.querySelectorAll(".column .stack");
  stacks.forEach((stack, colIdx) => {
    const col = tableaus[colIdx];
    stack.innerHTML = "";
    let offset = -200; 
    const overlap = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--tableau-offset')) || 28;
    col.forEach((card, idx) => {
      const el = makeCardElement(card, idx + 1);
      el.style.top = `${offset}px`;
      el.style.position = 'absolute';
      el.dataset.tableauIndex = idx;
      stack.appendChild(el);
      offset += overlap;
      // animate card dropping in
      setTimeout(() => { el.style.transition = 'top 0.5s ease'; el.style.top = `${idx*overlap}px`; }, idx*80);
    });
    const cardHraw = getComputedStyle(document.documentElement).getPropertyValue('--card-h') || "120px";
    const cardHeight = parseInt(cardHraw, 10) || 120;
    const targetHeight = Math.max(cardHeight, (Math.max(0, col.length - 1) * overlap) + cardHeight);
    stack.style.height = `${targetHeight}px`;
    stack.style.minHeight = `${cardHeight}px`;
  });
}

// Win animation
function winAnimation(){
  const allCards = document.querySelectorAll(".card");
  allCards.forEach((el, idx) => {
    const x = window.innerWidth/2 - el.offsetWidth/2;
    const y = 50;
    el.style.transition = `transform 1s ease ${idx*0.05}s, opacity 1s ease ${idx*0.05}s`;
    el.style.transform = `translate(${x - el.getBoundingClientRect().left}px, ${y - el.getBoundingClientRect().top}px) rotate(${Math.random()*360-180}deg)`;
    el.style.opacity = 0;
  });
}

// Automatically move all possible face-up cards to foundation
function autoMoveToFoundation(){
  let movedAny = false;
  let repeat = true;
  while(repeat){
    repeat = false;
    for(let col=0; col<tableaus.length; col++){
      const pile = tableaus[col];
      if(!pile.length) continue;
      const top = pile[pile.length-1];
      if(!top.faceUp) continue;
      for(let fIdx=0; fIdx<4; fIdx++){
        if(canMoveSingleToFoundation(top.id, fIdx)){
          performMoveToFoundation({ from:'tableau', col, startIdx: pile.length-1, cards:[top.id] }, fIdx);
          repeat = true; movedAny = true; break;
        }
      }
    }
    // Check waste top
    const wasteArr = waste.toArray();
    if(wasteArr.length){
      const top = wasteArr[wasteArr.length-1];
      for(let fIdx=0; fIdx<4; fIdx++){
        if(canMoveSingleToFoundation(top.id, fIdx)){
          performMoveToFoundation({ from:'waste', cards:[top.id], wasteIndex:wasteArr.length-1 }, fIdx);
          repeat = true; movedAny = true; break;
        }
      }
    }
  }
  if(movedAny) render();
}


// Override checkWin to include win animation
function checkWinEnhanced(){
  if (foundations.every(f => f.length === 13)){
    if (timerInterval) clearInterval(timerInterval);
    score += Math.max(0, 1000 - elapsedSeconds);
    winAnimation();
    setTimeout(()=>{ 
      if (winModal && winStats && winOk){
        winStats.textContent = `Time: ${formatTime(elapsedSeconds)} | Score: ${score}`;
        winModal.style.display = "flex"; winOk.focus && winOk.focus(); winOk.addEventListener("click", onWinOkOnce);
      } else {
        alert(`You won!\nTime: ${formatTime(elapsedSeconds)}\nScore: ${score}`); 
        newGame(); 
      }
    }, 1200);
  }
}


function makeCardElement(card, zIndex = 0){
  const el = document.createElement("div");
  el.className = "card";
  el.style.zIndex = zIndex;
  el.dataset.cardId = card.id;
  el.dataset.rank = card.rank;
  el.dataset.color = card.color;

  if (!card.faceUp){
    el.classList.add("back");
    return el;
  }
  const img = document.createElement("img");
  img.src = filenameForCard(card);
  img.alt = `${card.rank}${card.suit}`;
  el.appendChild(img);
  return el;
}

// waste 3 cards alignmened
function render(){
  // stock
  stockEl.innerHTML = "";
  if (stock.isEmpty()){
    stockEl.classList.add("empty"); stockEl.textContent = "Empty";
  } else {
    stockEl.classList.remove("empty"); stockEl.textContent = "";
    const back = document.createElement("div"); back.className = "pile-back";
    back.style.width = "100%"; back.style.height = "100%"; stockEl.appendChild(back);
  }

  // waste manage code
  wasteEl.innerHTML = "";
  const wasteArr = waste.toArray();
  if (wasteArr.length === 0){ wasteEl.classList.add("empty"); wasteEl.textContent = "Waste"; }
  else {
    wasteEl.classList.remove("empty");
    const start = Math.max(0, wasteArr.length - 3);
    for (let i = start; i < wasteArr.length; i++){
      const card = wasteArr[i];
      const visibleIndex = i - start; // 0..2
      const el = makeCardElement(card, 1000 + i);
      el.dataset.wasteIndex = visibleIndex.toString();
      el.dataset.wasteGlobalIndex = i.toString();
      el.style.position = 'absolute';
      el.style.left = "";
      el.addEventListener("click", (ev) => { ev.stopPropagation(); onWasteCardClick(card.id); });
      el.addEventListener("mousedown", (ev) => { ev.stopPropagation(); onWasteMouseDown(ev, card.id); });
      el.setAttribute('data-waste-index', visibleIndex.toString());
      wasteEl.appendChild(el);
    }
  }

  // foundations
  for (let i = 0; i < 4; i++){
    const fEl = foundationsEls[i];
    fEl.innerHTML = "";
    if (foundations[i].length === 0) { fEl.classList.add("empty"); }
    else {
      fEl.classList.remove("empty");
      const top = foundations[i][foundations[i].length - 1];
      const img = document.createElement("img");
      img.src = filenameForCard(top);
      img.alt = top.id;
      img.style.width = "100%"; img.style.height = "100%"; img.style.objectFit = "contain";
      fEl.appendChild(img);
    }
  }

  // tableaus
  const stacks = document.querySelectorAll(".column .stack");
  tableaus.forEach((col, colIdx) => {
    const stack = stacks[colIdx];
    stack.innerHTML = "";
    let offset = 0;
    const cardHraw = getComputedStyle(document.documentElement).getPropertyValue('--card-h') || "120px";
    const cardHeight = parseInt(cardHraw, 10) || 120;
    const overlap = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--tableau-offset')) || 28;
    col.forEach((card, idx) => {
      const el = makeCardElement(card, idx + 1);
      el.style.top = `${offset}px`;
      el.style.position = 'absolute';
      el.dataset.tableauIndex = idx;
      el.addEventListener("click", (ev) => { ev.stopPropagation(); onTableauCardClick(colIdx, idx); });
      el.addEventListener("mousedown", (ev) => { ev.stopPropagation(); onCardMouseDown(ev, colIdx, idx); });
      stack.appendChild(el);
      offset += overlap;
    });
    const targetHeight = Math.max(cardHeight, (Math.max(0, col.length - 1) * overlap) + cardHeight);
    stack.style.height = `${targetHeight}px`;
    stack.style.minHeight = `${cardHeight}px`;
  });

  // UI updates
  undoBtn.disabled = undoStack.isEmpty();
  redoBtn.disabled = redoStack.isEmpty();
  if (statusEl) statusEl.textContent = `Stock:${stock.size()}  Waste:${waste.size()}  Foundations:${foundations.map(f=>f.length).join(",")}`;
  if (scoreEl) scoreEl.textContent = `Score: ${score}  Moves: ${moves}`;
  if (timeEl) timeEl.textContent = `Time: ${formatTime(elapsedSeconds)}`;

  clearHintHighlights(false); 
  highlightSelected();
}

// Game init
function newGame(){
  deck = buildDeck();
  shuffle(deck);
  tableaus = [];
  for (let i=0;i<7;i++) tableaus.push([]);
  foundations = [[],[],[],[]];
  stock = new Stack();
  waste = new Stack();
  selected = null;
  undoStack = new Stack();
  redoStack = new Stack();
  score = 0; moves = 0; elapsedSeconds = 0;
  startTime = Date.now();
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(()=>{ elapsedSeconds = Math.floor((Date.now()-startTime)/1000); render(); }, 1000);

  // deal
  let idx = 0;
  for (let col = 0; col < 7; col++){
    for (let j = 0; j <= col; j++){
      tableaus[col].push(deck[idx++]);
    }
    tableaus[col][tableaus[col].length - 1].faceUp = true;
  }
  for (let i = deck.length - 1; i >= idx; i--) stock.push(deck[i]);

  render();
}

// Draw from stock up to 3
function drawFromStock(){
  if (stock.isEmpty()){
    if (waste.isEmpty()) return;
    // recycle
    const recycled = [];
    while (!waste.isEmpty()){
      const c = waste.pop(); c.faceUp = false; recycled.unshift(c);
    }
    for (let c of recycled) stock.push(c);
    undoStack.push({ type:"recycle", cardIds: recycled.map(c=>c.id) });
    moves++; score -= 5;
    anyActionPerformed();
    return;
  }
  const moved = [];
  for (let i = 0; i < 3 && !stock.isEmpty(); i++){
    const c = stock.pop(); c.faceUp = true; waste.push(c); moved.push(c.id);
  }
  if (moved.length) undoStack.push({ type: "draw", cardIds: moved });
  moves++; score += 5 * moved.length;
  anyActionPerformed();
}
stockEl.addEventListener("click", ()=> drawFromStock());

// Selection & highlight
function selectFromWasteById(cardId){
  const arr = waste.toArray();
  const idx = arr.findIndex(c=>c.id === cardId); if (idx === -1) return;
  selected = { from: "waste", cards: [cardId], wasteIndex: idx }; highlightSelected();
}
function onWasteCardClick(cardId){ selectFromWasteById(cardId); }
function onTableauCardClick(colIdx, cardIdx){
  const col = tableaus[colIdx]; const card = col[cardIdx]; if (!card) return;
  if (!card.faceUp){
    if (cardIdx === col.length - 1){
      card.faceUp = true; undoStack.push({ type: "flip", col: colIdx, idx: cardIdx }); moves++; score += 10; anyActionPerformed();
    }
    return;
  }
  const cards = col.slice(cardIdx).map(c=>c.id);
  selected = { from: "tableau", col: colIdx, startIdx: cardIdx, cards };
  highlightSelected();
}
function highlightSelected(){
  document.querySelectorAll(".card.selected").forEach(el => el.classList.remove("selected"));
  if (!selected) return;
  const ids = new Set(selected.cards);
  document.querySelectorAll(".card").forEach(el => { const id = el.dataset.cardId; if (id && ids.has(id)) el.classList.add("selected"); });
}

// Mouse drag helpers
let dragging = null;
function onCardMouseDown(ev, colIdx, cardIdx){
  const col = tableaus[colIdx]; if (!col[cardIdx] || !col[cardIdx].faceUp) return;
  const cards = col.slice(cardIdx).map(c=>c.id);
  selected = { from: "tableau", col: colIdx, startIdx: cardIdx, cards }; highlightSelected();
  beginDrag(ev.clientX, ev.clientY, selected);
  ev.preventDefault();
}
function onWasteMouseDown(ev, cardId){
  const arr = waste.toArray(); const idx = arr.findIndex(c => c.id === cardId);
  if (idx === -1){ flashElement(wasteEl); return; }
  selected = { from: "waste", cards: [cardId], wasteIndex: idx }; highlightSelected();
  beginDrag(ev.clientX, ev.clientY, selected);
  ev.preventDefault();
}
function beginDrag(x,y,sel){
  if (!sel) return;
  const ghost = createGhost(sel);
  dragging = { sel, ghostEl: ghost };
  moveGhostTo(x,y);
  document.addEventListener("mousemove", onDocMouseMove);
  document.addEventListener("mouseup", onDocMouseUp);
}
function createGhost(sel){
  const ghost = document.createElement("div"); ghost.className = "drag-ghost";
  const sampleId = sel.cards[0]; const sampleObj = findCardObject(sampleId);
  const img = document.createElement("img"); img.src = filenameForCard(sampleObj); img.alt = sampleId;
  img.style.width = "100%"; img.style.height = "100%"; ghost.appendChild(img);
  document.body.appendChild(ghost);
  return ghost;
}
function moveGhostTo(clientX, clientY){ if (!dragging || !dragging.ghostEl) return; const g = dragging.ghostEl; g.style.left = `${clientX}px`; g.style.top = `${clientY}px`; g.style.transform = "translate(-50%,-50%)"; }
function onDocMouseMove(e){ moveGhostTo(e.clientX, e.clientY); }
function onDocMouseUp(e){
  document.removeEventListener("mousemove", onDocMouseMove);
  document.removeEventListener("mouseup", onDocMouseUp);
  if (!dragging) return;
  const elUnder = document.elementFromPoint(e.clientX, e.clientY);
  const targetCol = elUnder ? elUnder.closest(".column") : null;
  const targetFoundation = elUnder ? elUnder.closest(".foundation") : null;

  if (targetCol){
    const idx = parseInt(targetCol.dataset.index, 10);
    if (canMoveCardsToTableau(dragging.sel.cards, idx)){ performMoveToTableau(dragging.sel, idx); }
    else flashElement(targetCol.querySelector('.stack'));
  } else if (targetFoundation){
    const fIdx = parseInt(targetFoundation.dataset.index, 10);
    if (dragging.sel.cards.length === 1 && canMoveSingleToFoundation(dragging.sel.cards[0], fIdx)){ performMoveToFoundation(dragging.sel, fIdx); }
    else flashElement(targetFoundation);
  } else {
    selected = null; highlightSelected();
  }

  if (dragging.ghostEl) dragging.ghostEl.remove();
  dragging = null;
  render();
}

// Move validation
function canMoveCardsToTableau(cardIds, destCol){
  const firstCardObj = findCardObject(cardIds[0]); if (!firstCardObj) return false;
  const dest = tableaus[destCol];
  if (dest.length === 0) return firstCardObj.rank === "K";
  const top = dest[dest.length - 1];
  return (firstCardObj.color !== top.color) && (rankValue(firstCardObj.rank) === rankValue(top.rank) - 1);
}
function canMoveSingleToFoundation(cardId, fIdx){
  const cardObj = findCardObject(cardId); if (!cardObj) return false;
  const pile = foundations[fIdx];
  if (pile.length === 0) return cardObj.rank === "A";
  const top = pile[pile.length - 1];
  return (cardObj.suit === top.suit) && (rankValue(cardObj.rank) === rankValue(top.rank) + 1);
}

// Perform moves
function performMoveToTableau(sel, targetIdx){
  if (!sel) return;
  if (sel.from === "waste"){
    const res = removeCardFromWasteById(sel.cards[0]);
    if (!res){ flashElement(wasteEl); return; }
    const c = res.card; tableaus[targetIdx].push(c);
    undoStack.push({ type:"move", from:{ type:"waste", idx:res.idx }, to:{ type:"tableau", idx:targetIdx }, cardIds:[c.id] });
  } else if (sel.from === "tableau"){
    const src = sel.col; const start = sel.startIdx;
    const movedObjs = tableaus[src].splice(start);
    tableaus[targetIdx].push(...movedObjs);
    let flipped = null;
    if (tableaus[src].length && !tableaus[src][tableaus[src].length -1].faceUp){
      tableaus[src][tableaus[src].length -1].faceUp = true;
      flipped = { col: src, idx: tableaus[src].length -1 };
    }
    undoStack.push({ type:"move", from:{ type:"tableau", idx:src }, to:{ type:"tableau", idx:targetIdx }, cardIds:movedObjs.map(c=>c.id), flipped });
  }
  selected = null; moves++; score += 15; anyActionPerformed(); checkWin();
}
function performMoveToFoundation(sel, fIdx){
  if (!sel) return; if (sel.cards.length !== 1) { selected = null; highlightSelected(); return; }
  const cardId = sel.cards[0];
  if (!canMoveSingleToFoundation(cardId, fIdx)){ flashElement(foundationsEls[fIdx]); selected = null; highlightSelected(); return; }
  if (sel.from === "waste"){
    const res = removeCardFromWasteById(cardId); if (!res){ flashElement(wasteEl); return; }
    foundations[fIdx].push(res.card);
    undoStack.push({ type:"move", from:{ type:"waste", idx:res.idx }, to:{ type:"foundation", idx:fIdx }, cardIds:[res.card.id] });
  } else if (sel.from === "tableau"){
    const src = sel.col; const moved = tableaus[src].splice(sel.startIdx,1)[0];
    foundations[fIdx].push(moved);
    let flipped = null;
    if (tableaus[src].length && !tableaus[src][tableaus[src].length -1].faceUp){
      tableaus[src][tableaus[src].length -1].faceUp = true;
      flipped = { col: src, idx: tableaus[src].length -1 };
    }
    undoStack.push({ type:"move", from:{ type:"tableau", idx:src }, to:{ type:"foundation", idx:fIdx }, cardIds:[moved.id], flipped });
  }
  selected = null; moves++; score += 20; anyActionPerformed(); checkWin();
}

// Click-to-place
function attemptMoveToTableau(targetIdx){
  if (!selected) return;
  if (!canMoveCardsToTableau(selected.cards, targetIdx)){ flashElement(document.querySelectorAll(".column .stack")[targetIdx]); selected = null; highlightSelected(); return; }
  performMoveToTableau(selected, targetIdx);
}
function attemptMoveToFoundation(fIdx){
  if (!selected) return;
  if (selected.cards.length !== 1) { selected = null; highlightSelected(); return; }
  if (!canMoveSingleToFoundation(selected.cards[0], fIdx)){ flashElement(foundationsEls[fIdx]); selected = null; highlightSelected(); return; }
  performMoveToFoundation(selected, fIdx);
}
foundationsEls.forEach((el,i) => el.addEventListener("click", (e)=>{ e.stopPropagation(); attemptMoveToFoundation(i); }));

// Undo & Redo 
function doUndo(){
  if (undoStack.isEmpty()) return;
  const op = undoStack.pop(); redoStack.push(op); applyInverse(op);
  selected = null; anyActionPerformed();
}
function doRedo(){
  if (redoStack.isEmpty()) return;
  const op = redoStack.pop(); undoStack.push(op); apply(op);
  selected = null; anyActionPerformed();
}

// applyInverse & apply 
function applyInverse(op){
  switch(op.type){
    case "draw":{
      for (let i = op.cardIds.length -1; i >= 0; i--){
        const id = op.cardIds[i];
        const arr = waste.toArray();
        const idx = arr.findIndex(c=>c.id === id);
        if (idx !== -1){ arr.splice(idx,1); const newW = new Stack(); for (let c of arr) newW.push(c); waste = newW;
          const cardObj = findCardObject(id) || makeCard(id.slice(0, -1), id.slice(-1));
          if (cardObj){ cardObj.faceUp = false; stock.push(cardObj); }
        }
      }
    } break;
    case "recycle":{
      let arr = stock.toArray();
      for (let id of op.cardIds){
        const idx = arr.findIndex(c=>c.id === id);
        if (idx !== -1){
          const card = arr.splice(idx,1)[0]; card.faceUp = true;
          const newW = waste.toArray(); newW.push(card); const newS = new Stack(); for (let c of arr) newS.push(c); stock = newS;
          const newWStack = new Stack(); for (let c of newW) newWStack.push(c); waste = newWStack;
        }
      }
    } break;
    case "flip": if (tableaus[op.col] && tableaus[op.col][op.idx]) tableaus[op.col][op.idx].faceUp = false; break;
    case "move":{
      const from = op.from, to = op.to;
      if (from.type === "waste" && to.type === "tableau"){
        const cardObj = tableaus[to.idx].pop(); if (cardObj) insertCardIntoWasteAt(cardObj, from.idx);
      } else if (from.type === "waste" && to.type === "foundation"){
        const cardObj = foundations[to.idx].pop(); if (cardObj) insertCardIntoWasteAt(cardObj, from.idx);
      } else if (from.type === "tableau" && to.type === "tableau"){
        const movedIds = op.cardIds; const dest = tableaus[to.idx]; let removed = [];
        for (let i=0;i<dest.length;){
          if (movedIds.includes(dest[i].id)){ removed.push(...dest.splice(i)); break; } else i++;
        }
        tableaus[from.idx].push(...removed);
        if (op.flipped) tableaus[op.flipped.col][op.flipped.idx].faceUp = false;
      } else if (from.type === "tableau" && to.type === "foundation"){
        const cardObj = foundations[to.idx].pop(); if (cardObj) tableaus[from.idx].push(cardObj);
        if (op.flipped) tableaus[op.flipped.col][op.flipped.idx].faceUp = false;
      }
    } break;
  }
}
function apply(op){
  switch(op.type){
    case "draw":{
      for (let id of op.cardIds){
        const arr = stock.toArray(); const idx = arr.findIndex(c=>c.id === id);
        if (idx !== -1){ const card = arr.splice(idx,1)[0]; card.faceUp = true;
          const newW = waste.toArray(); newW.push(card); const newStack = new Stack(); for (let c of newW) newStack.push(c); waste = newStack;
          const newS = new Stack(); for (let c of arr) newS.push(c); stock = newS;
        }
      }
    } break;
    case "recycle":{
      for (let id of op.cardIds){
        const arr = stock.toArray(); const idx = arr.findIndex(c=>c.id === id);
        if (idx !== -1){ const card = arr.splice(idx,1)[0]; card.faceUp = true;
          const newW = waste.toArray(); newW.push(card); const newStack = new Stack(); for (let c of newW) newStack.push(c); waste = newStack;
          const newS = new Stack(); for (let c of arr) newS.push(c); stock = newS;
        }
      }
    } break;
    case "flip": if (tableaus[op.col] && tableaus[op.col][op.idx]) tableaus[op.col][op.idx].faceUp = true; break;
    case "move":{
      const from = op.from, to = op.to;
      if (from.type === "waste" && to.type === "tableau"){
        const arr = waste.toArray(); const idx = arr.findIndex(c=>c.id === op.cardIds[0]);
        if (idx !== -1){ const card = arr.splice(idx,1)[0]; const newW = new Stack(); for (let c of arr) newW.push(c); waste = newW; tableaus[to.idx].push(card); }
      } else if (from.type === "waste" && to.type === "foundation"){
        const arr = waste.toArray(); const idx = arr.findIndex(c=>c.id === op.cardIds[0]);
        if (idx !== -1){ const card = arr.splice(idx,1)[0]; const newW = new Stack(); for (let c of arr) newW.push(c); waste = newW; foundations[to.idx].push(card); }
      } else if (from.type === "tableau" && to.type === "tableau"){
        const moved = [];
        for (let id of op.cardIds){
          const src = tableaus[from.idx]; const idxInSrc = src.findIndex(c=>c.id === id);
          if (idxInSrc !== -1) moved.push(...src.splice(idxInSrc));
        }
        tableaus[to.idx].push(...moved);
        if (op.flipped) tableaus[op.flipped.col][op.flipped.idx].faceUp = true;
      } else if (from.type === "tableau" && to.type === "foundation"){
        const id = op.cardIds[0]; const src = tableaus[from.idx]; const idxInSrc = src.findIndex(c=>c.id === id);
        if (idxInSrc !== -1){ const card = src.splice(idxInSrc,1)[0]; foundations[to.idx].push(card); }
        if (op.flipped) tableaus[op.flipped.col][op.flipped.idx].faceUp = true;
      }
    } break;
  }
}

// Visual feedback
function flashElement(el){
  if (!el) return;
  el.classList.add("illegal");
  setTimeout(()=> el.classList.remove("illegal"), 420);
}
function flashIllegalOnColumn(colIdx){ const stacks = document.querySelectorAll(".column .stack"); const el = stacks[colIdx]; if (el) flashElement(el); }
function flashIllegalOnFoundation(fIdx){ const el = foundationsEls[fIdx]; if (el) flashElement(el); }

// Win detection
function checkWin(){
  if (foundations.every(f => f.length === 13)){
    if (timerInterval) clearInterval(timerInterval);
    score += Math.max(0, 1000 - elapsedSeconds);
    if (winModal && winStats && winOk){
      winStats.textContent = `Time: ${formatTime(elapsedSeconds)} | Score: ${score}`;
      winModal.style.display = "flex"; winOk.focus && winOk.focus(); winOk.addEventListener("click", onWinOkOnce);
    } else {
      setTimeout(()=>{ alert(`You won!\nTime: ${formatTime(elapsedSeconds)}\nScore: ${score}`); newGame(); }, 80);
    }
  }
}
function onWinOkOnce(){ if (winOk) winOk.removeEventListener("click", onWinOkOnce); if (winModal) winModal.style.display = "none"; newGame(); }

// Any action performed 
function anyActionPerformed(){ clearHintHighlights(); render(); }

// Hint system
function findHint(){
  const wasteArr = waste.toArray();
  if (wasteArr.length){
    for (let i = wasteArr.length -1; i >= Math.max(0, wasteArr.length -3); i--){
      const c = wasteArr[i];
      for (let fIdx=0; fIdx<4; fIdx++){
        if (canMoveSingleToFoundation(c.id, fIdx)){
          return { type:"foundation", from:{type:"waste", idx:i, cardId:c.id}, to:{type:"foundation", idx:fIdx}, cardIds:[c.id] };
        }
      }
    }
  }
  // foundation moves from tableau tops
  for (let col=0; col<tableaus.length; col++){
    const pile = tableaus[col];
    if (!pile.length) continue;
    const top = pile[pile.length -1];
    if (!top.faceUp) continue;
    for (let fIdx=0; fIdx<4; fIdx++){
      if (canMoveSingleToFoundation(top.id, fIdx)){
        return { type:"foundation", from:{ type:"tableau", col, idx:pile.length-1, cardId:top.id }, to:{type:"foundation", idx:fIdx}, cardIds:[top.id] };
      }
    }
  }
  // waste move to tableau
  if (wasteArr.length){
    for (let i = wasteArr.length -1; i >= Math.max(0, wasteArr.length-3); i--){
      const c = wasteArr[i];
      for (let dest = 0; dest < 7; dest++){
        if (canMoveCardsToTableau([c.id], dest)){
          return { type:"tableau", from:{type:"waste", idx:i, cardId:c.id}, to:{type:"tableau", idx:dest}, cardIds:[c.id] };
        }
      }
    }
  }
  // cards move in tableau 
  for (let src=0; src<7; src++){
    const pile = tableaus[src];
    for (let start=0; start<pile.length; start++){
      const card = pile[start];
      if (!card.faceUp) continue;
      for (let dest=0; dest<7; dest++){
        if (dest === src) continue;
        if (canMoveCardsToTableau([card.id], dest)){
          const movedIds = pile.slice(start).map(c=>c.id);
          return { type:"tableau", from:{type:"tableau", col:src, startIdx:start}, to:{type:"tableau", idx:dest}, cardIds:movedIds };
        }
      }
    }
  }
  return null;
}
function highlightHint(move){
  clearHintHighlights();
  if (!move) return;
  currentHint = { move };
  for (const id of move.cardIds){
    const el = document.querySelector(`.card[data-card-id="${CSS.escape(id)}"]`);
    if (el) el.classList.add("hint");
  }
  if (move.type === "tableau"){
    const stackEl = document.querySelector(`.column[data-index="${move.to.idx}"] .stack`);
    if (stackEl) stackEl.classList.add("hint-target");
  } else if (move.type === "foundation"){
    const destEl = foundationsEls[move.to.idx];
    if (destEl) destEl.classList.add("hint-target");
  }
}
function clearHintHighlights(removeCurrent=true){
  document.querySelectorAll(".card.hint").forEach(el => el.classList.remove("hint"));
  document.querySelectorAll(".hint-target").forEach(el => el.classList.remove("hint-target"));
  if (currentHint && currentHint.timeoutId){ clearTimeout(currentHint.timeoutId); }
  if (removeCurrent) currentHint = null;
}
function showHintOnce(){
  clearHintHighlights();
  const move = findHint();
  if (!move){ flashElement(document.body); return; }
  highlightHint(move);
  const tid = setTimeout(()=> clearHintHighlights(), 3300);
  currentHint = { move, timeoutId: tid };
}
hintBtn && hintBtn.addEventListener("click", (e)=>{ e.stopPropagation(); showHintOnce(); });
window.checkWin = checkWinEnhanced;
// Undo/redo hooks
newGameBtn && newGameBtn.addEventListener("click", ()=> newGame());
undoBtn && undoBtn.addEventListener("click", ()=> doUndo());
redoBtn && redoBtn.addEventListener("click", ()=> doRedo());

// Clear selection & hints on body click
document.body.addEventListener("click", (e)=>{
  if (!e.target.closest(".card") && !e.target.closest(".foundation")){
    selected = null; highlightSelected(); clearHintHighlights();
  }
});

// Start screen
document.addEventListener("DOMContentLoaded", ()=>{
  createTableauColumns();
  if (startScreen && startBtn){ startBtn.addEventListener("click", ()=>{
    startScreen.classList.add("fade-out");
    setTimeout(()=>{ startScreen.style.display = "none"; newGame();  startAnimation();}, 420);
  }); } else { newGame();  startAnimation();}
});

function anyActionPerformed(){ clearHintHighlights(); render(); }

const oldAnyActionPerformed = anyActionPerformed;
anyActionPerformed = function(){
  clearHintHighlights();
  autoMoveToFoundation();
  render();
}
// Export for console debugging
window._SOL = { newGame, render, tableaus, foundations, stock, waste, autoMoveToFoundation, startAnimation, winAnimation };

createTableauColumns();
newGame();
render();
