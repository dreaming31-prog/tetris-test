const ROWS = 20;
const COLS = 10;
const BEST_SCORE_KEY = "neon-tetris-best";

const PIECES = {
  I: { color: "cyan", matrix: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]] },
  O: { color: "yellow", matrix: [[0, 1, 1, 0], [0, 1, 1, 0], [0, 0, 0, 0], [0, 0, 0, 0]] },
  T: { color: "purple", matrix: [[0, 1, 0, 0], [1, 1, 1, 0], [0, 0, 0, 0], [0, 0, 0, 0]] },
  S: { color: "pink", matrix: [[0, 1, 1, 0], [1, 1, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]] },
  Z: { color: "red", matrix: [[1, 1, 0, 0], [0, 1, 1, 0], [0, 0, 0, 0], [0, 0, 0, 0]] },
  J: { color: "blue", matrix: [[1, 0, 0, 0], [1, 1, 1, 0], [0, 0, 0, 0], [0, 0, 0, 0]] },
  L: { color: "orange", matrix: [[0, 0, 1, 0], [1, 1, 1, 0], [0, 0, 0, 0], [0, 0, 0, 0]] },
};

const boardElement = document.querySelector("#board");
const nextPieceElement = document.querySelector("#nextPiece");
const boardOverlay = document.querySelector("#boardOverlay");
const overlayKicker = document.querySelector("#overlayKicker");
const overlayTitle = document.querySelector("#overlayTitle");
const overlayMessage = document.querySelector("#overlayMessage");
const overlayAction = document.querySelector("#overlayAction");
const scoreElement = document.querySelector("#scoreValue");
const linesElement = document.querySelector("#linesValue");
const bestElement = document.querySelector("#bestValue");
const levelElement = document.querySelector("#levelValue");
const pauseButton = document.querySelector("#pauseButton");
const soundToggle = document.querySelector("#soundToggle");

let board = createBoard();
let currentPiece = null;
let nextPiece = null;
let bag = [];
let score = 0;
let lines = 0;
let level = 1;
let bestScore = Number(localStorage.getItem(BEST_SCORE_KEY)) || 0;
let gameStarted = false;
let paused = false;
let gameOver = false;
let soundOn = true;
let audioContext = null;
let dropTimer = null;

bestElement.textContent = formatScore(bestScore);
renderNextPiece();
renderBoard();

function createBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function cloneMatrix(matrix) {
  return matrix.map((row) => [...row]);
}

function shuffle(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[randomIndex]] = [result[randomIndex], result[index]];
  }
  return result;
}

function getNextPiece() {
  if (!bag.length) bag = shuffle(Object.keys(PIECES));
  const name = bag.pop();
  const template = PIECES[name];
  return { name, color: template.color, matrix: cloneMatrix(template.matrix), row: 0, col: 3 };
}

function startGame() {
  ensureAudio();
  board = createBoard();
  bag = [];
  score = 0;
  lines = 0;
  level = 1;
  gameStarted = true;
  paused = false;
  gameOver = false;
  currentPiece = getNextPiece();
  nextPiece = getNextPiece();
  setOverlay("hidden");
  document.body.classList.remove("is-paused");
  updateStats();
  renderNextPiece();
  renderBoard();
  restartTimer();
  playSound("start");
}

function restartTimer() {
  window.clearInterval(dropTimer);
  dropTimer = window.setInterval(tick, getDropInterval());
}

function getDropInterval() {
  return Math.max(95, 730 - (level - 1) * 65);
}

function tick() {
  if (!gameStarted || paused || gameOver) return;
  if (!movePiece(1, 0)) lockPiece();
}

function canPlace(piece, rowOffset = 0, colOffset = 0, matrix = piece.matrix) {
  for (let row = 0; row < matrix.length; row += 1) {
    for (let col = 0; col < matrix[row].length; col += 1) {
      if (!matrix[row][col]) continue;
      const nextRow = piece.row + row + rowOffset;
      const nextCol = piece.col + col + colOffset;
      if (nextCol < 0 || nextCol >= COLS || nextRow >= ROWS) return false;
      if (nextRow >= 0 && board[nextRow][nextCol]) return false;
    }
  }
  return true;
}

function movePiece(rowOffset, colOffset) {
  if (!currentPiece || !canPlace(currentPiece, rowOffset, colOffset)) return false;
  currentPiece.row += rowOffset;
  currentPiece.col += colOffset;
  renderBoard();
  return true;
}

function rotatePiece() {
  if (!currentPiece || currentPiece.name === "O") return;
  const rotated = currentPiece.matrix[0].map((_, columnIndex) => currentPiece.matrix.map((row) => row[columnIndex]).reverse());
  const kicks = [0, -1, 1, -2, 2];
  const kick = kicks.find((offset) => canPlace(currentPiece, 0, offset, rotated));
  if (kick === undefined) return;
  currentPiece.col += kick;
  currentPiece.matrix = rotated;
  renderBoard();
  playSound("rotate");
}

function hardDrop() {
  if (!currentPiece || !gameStarted || paused || gameOver) return;
  let distance = 0;
  while (movePiece(1, 0)) distance += 1;
  if (distance) {
    score += distance;
    updateStats();
  }
  playSound("drop");
  lockPiece();
}

function lockPiece() {
  if (!currentPiece) return;
  for (let row = 0; row < currentPiece.matrix.length; row += 1) {
    for (let col = 0; col < currentPiece.matrix[row].length; col += 1) {
      if (!currentPiece.matrix[row][col]) continue;
      const boardRow = currentPiece.row + row;
      const boardCol = currentPiece.col + col;
      if (boardRow >= 0 && boardRow < ROWS) board[boardRow][boardCol] = currentPiece.color;
    }
  }

  playSound("lock");
  const cleared = clearLines();
  if (cleared) {
    const lineScores = [0, 100, 300, 500, 800];
    score += lineScores[cleared] * level;
    lines += cleared;
    const previousLevel = level;
    level = Math.min(10, Math.floor(lines / 10) + 1);
    playSound(cleared >= 4 ? "tetris" : "clear");
    if (level !== previousLevel) playSound("level");
  }

  currentPiece = nextPiece;
  nextPiece = getNextPiece();
  updateStats();
  renderNextPiece();

  if (!canPlace(currentPiece)) {
    endGame();
    return;
  }
  restartTimer();
  renderBoard();
}

function clearLines() {
  const remainingRows = board.filter((row) => row.some((cell) => !cell));
  const cleared = ROWS - remainingRows.length;
  while (remainingRows.length < ROWS) remainingRows.unshift(Array(COLS).fill(null));
  board = remainingRows;
  return cleared;
}

function getGhostRow() {
  if (!currentPiece) return -1;
  let offset = 0;
  while (canPlace(currentPiece, offset + 1, 0)) offset += 1;
  return currentPiece.row + offset;
}

function renderBoard() {
  boardElement.innerHTML = "";
  const ghostRow = getGhostRow();
  const visibleCells = new Map();

  board.forEach((row, rowIndex) => row.forEach((color, colIndex) => {
    if (color) visibleCells.set(`${rowIndex}-${colIndex}`, { color, type: "filled" });
  }));

  if (currentPiece) {
    currentPiece.matrix.forEach((row, rowIndex) => row.forEach((filled, colIndex) => {
      if (!filled) return;
      const activeRow = currentPiece.row + rowIndex;
      const activeCol = currentPiece.col + colIndex;
      if (activeRow >= 0 && activeRow < ROWS && activeCol >= 0 && activeCol < COLS) {
        visibleCells.set(`${activeRow}-${activeCol}`, { color: currentPiece.color, type: "filled" });
      }
    }));

    currentPiece.matrix.forEach((row, rowIndex) => row.forEach((filled, colIndex) => {
      if (!filled) return;
      const ghostRowIndex = ghostRow + rowIndex;
      const ghostCol = currentPiece.col + colIndex;
      const key = `${ghostRowIndex}-${ghostCol}`;
      if (ghostRowIndex >= 0 && ghostRowIndex < ROWS && ghostCol >= 0 && ghostCol < COLS && !visibleCells.has(key)) {
        visibleCells.set(key, { color: currentPiece.color, type: "ghost" });
      }
    }));
  }

  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.setAttribute("role", "gridcell");
      const content = visibleCells.get(`${row}-${col}`);
      if (content) {
        cell.classList.add(content.type, content.color);
        if (content.type === "filled") cell.setAttribute("aria-label", `${content.color} 블록`);
      }
      boardElement.appendChild(cell);
    }
  }
}

function renderNextPiece() {
  nextPieceElement.innerHTML = "";
  const cells = nextPiece ? nextPiece.matrix : Array.from({ length: 4 }, () => Array(4).fill(0));
  cells.forEach((row) => row.forEach((filled) => {
    const cell = document.createElement("div");
    cell.className = `cell${filled ? ` filled ${nextPiece.color}` : ""}`;
    nextPieceElement.appendChild(cell);
  }));
}

function updateStats() {
  scoreElement.textContent = formatScore(score);
  linesElement.textContent = String(lines).padStart(2, "0");
  levelElement.textContent = String(level).padStart(2, "0");
  if (score > bestScore) {
    bestScore = score;
    bestElement.textContent = formatScore(bestScore);
    localStorage.setItem(BEST_SCORE_KEY, String(bestScore));
  }
}

function formatScore(value) {
  return String(value).padStart(6, "0");
}

function endGame() {
  gameOver = true;
  gameStarted = false;
  window.clearInterval(dropTimer);
  playSound("gameover");
  setOverlay("gameover");
  renderBoard();
}

function togglePause() {
  if (!gameStarted || gameOver) return;
  paused = !paused;
  document.body.classList.toggle("is-paused", paused);
  pauseButton.innerHTML = paused ? '<span class="button-icon">▶</span> 재개' : '<span class="button-icon">Ⅱ</span> 일시정지';
  setOverlay(paused ? "paused" : "hidden");
  if (paused) playSound("pause");
}

function setOverlay(type) {
  if (type === "hidden") {
    boardOverlay.classList.add("is-hidden");
    return;
  }
  boardOverlay.classList.remove("is-hidden");
  if (type === "gameover") {
    overlayKicker.textContent = "RUN COMPLETE";
    overlayTitle.innerHTML = "Nice run.<br /><span>Again?</span>";
    overlayMessage.textContent = `최종 점수 ${formatScore(score)} · ${lines}줄 삭제`;
    overlayAction.innerHTML = '다시 시작 <span>↻</span>';
  } else if (type === "paused") {
    overlayKicker.textContent = "GAME PAUSED";
    overlayTitle.innerHTML = "Take a<br /><span>breath.</span>";
    overlayMessage.textContent = "준비가 되면 게임을 이어가세요.";
    overlayAction.innerHTML = '계속하기 <span>→</span>';
  } else {
    overlayKicker.textContent = "WELCOME TO THE GRID";
    overlayTitle.innerHTML = "Ready when<br /><span>you are.</span>";
    overlayMessage.textContent = "블록을 쌓고, 흐름을 만들어보세요.";
    overlayAction.innerHTML = '게임 시작 <span>↗</span>';
  }
}

function ensureAudio() {
  if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
  if (audioContext.state === "suspended") audioContext.resume();
}

function playSound(type) {
  if (!soundOn) return;
  ensureAudio();
  const sounds = {
    start: [[392, 0.07], [523, 0.1]],
    move: [[180, 0.035]],
    rotate: [[320, 0.06]],
    lock: [[115, 0.06]],
    drop: [[220, 0.05], [110, 0.08]],
    clear: [[440, 0.08], [660, 0.13]],
    tetris: [[440, 0.08], [554, 0.08], [659, 0.08], [880, 0.18]],
    level: [[523, 0.06], [784, 0.14]],
    pause: [[250, 0.07]],
    gameover: [[260, 0.13], [185, 0.18], [110, 0.25]],
  };
  const notes = sounds[type] || [];
  let delay = 0;
  notes.forEach(([frequency, duration]) => {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = type === "lock" || type === "move" ? "square" : "sine";
    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime + delay);
    gain.gain.setValueAtTime(0.0001, audioContext.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(0.045, audioContext.currentTime + delay + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + delay + duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(audioContext.currentTime + delay);
    oscillator.stop(audioContext.currentTime + delay + duration + 0.01);
    delay += duration * 0.72;
  });
}

function handleAction(action) {
  if (!gameStarted || paused || gameOver) return;
  if (action === "left" && movePiece(0, -1)) playSound("move");
  if (action === "right" && movePiece(0, 1)) playSound("move");
  if (action === "down") movePiece(1, 0);
  if (action === "rotate") rotatePiece();
  if (action === "drop") hardDrop();
}

document.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (["arrowleft", "arrowright", "arrowdown", "arrowup", " "].includes(event.key.toLowerCase()) || key === "p") event.preventDefault();
  if (key === "r") {
    startGame();
    return;
  }
  if (key === "p") {
    togglePause();
    return;
  }
  if (!gameStarted || paused || gameOver) return;
  if (event.key === "ArrowLeft") handleAction("left");
  if (event.key === "ArrowRight") handleAction("right");
  if (event.key === "ArrowDown") handleAction("down");
  if (event.key === "ArrowUp") handleAction("rotate");
  if (event.code === "Space") handleAction("drop");
});

document.querySelectorAll("[data-action]").forEach((button) => {
  button.addEventListener("click", () => {
    ensureAudio();
    handleAction(button.dataset.action);
  });
});

overlayAction.addEventListener("click", () => {
  if (paused) togglePause();
  else startGame();
});
pauseButton.addEventListener("click", () => {
  ensureAudio();
  togglePause();
});
document.querySelector("#restartButton").addEventListener("click", startGame);
soundToggle.addEventListener("click", () => {
  soundOn = !soundOn;
  soundToggle.textContent = soundOn ? "◖)))" : "◖×";
  soundToggle.setAttribute("aria-label", soundOn ? "사운드 끄기" : "사운드 켜기");
  soundToggle.setAttribute("title", soundOn ? "사운드 끄기" : "사운드 켜기");
  if (soundOn) {
    ensureAudio();
    playSound("move");
  }
});
