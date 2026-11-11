/**
 * Cloud Tetris (구름 테트리스) Game Logic
 * Dreamy Sky Blue Theme with Fluffy Cloud Blocks
 */

(() => {
  'use strict';

  // --- Constants & Config ---
  const COLS = 10;
  const ROWS = 20;
  const BLOCK_SIZE = 30; // 300px x 600px
  const NEXT_BLOCK_SIZE = 24; // For next piece preview canvas

  // 7 Tetromino definitions with soft fluffy cloud palettes
  const TETROMINOES = {
    I: {
      name: '하늘 구름',
      color: '#38bdf8', // Sky Blue
      lightColor: '#f0f9ff',
      darkColor: '#0284c7',
      matrix: [
        [0, 0, 0, 0],
        [1, 1, 1, 1],
        [0, 0, 0, 0],
        [0, 0, 0, 0]
      ]
    },
    O: {
      name: '햇살 구름',
      color: '#facc15', // Sunshine Gold
      lightColor: '#fefce8',
      darkColor: '#ca8a04',
      matrix: [
        [1, 1],
        [1, 1]
      ]
    },
    T: {
      name: '라벤더 구름',
      color: '#c084fc', // Lilac Purple
      lightColor: '#faf5ff',
      darkColor: '#9333ea',
      matrix: [
        [0, 1, 0],
        [1, 1, 1],
        [0, 0, 0]
      ]
    },
    S: {
      name: '민트 구름',
      color: '#34d399', // Mint Green
      lightColor: '#f0fdf4',
      darkColor: '#059669',
      matrix: [
        [0, 1, 1],
        [1, 1, 0],
        [0, 0, 0]
      ]
    },
    Z: {
      name: '노을 핑크 구름',
      color: '#f87171', // Sunset Coral / Rose
      lightColor: '#fff1f2',
      darkColor: '#dc2626',
      matrix: [
        [1, 1, 0],
        [0, 1, 1],
        [0, 0, 0]
      ]
    },
    J: {
      name: '바다 파랑 구름',
      color: '#60a5fa', // Ocean Blue
      lightColor: '#eff6ff',
      darkColor: '#2563eb',
      matrix: [
        [1, 0, 0],
        [1, 1, 1],
        [0, 0, 0]
      ]
    },
    L: {
      name: '복숭아 구름',
      color: '#fb923c', // Peach Orange
      lightColor: '#fff7ed',
      darkColor: '#ea580c',
      matrix: [
        [0, 0, 1],
        [1, 1, 1],
        [0, 0, 0]
      ]
    }
  };

  const TETROMINO_KEYS = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

  // Line clear scores
  const LINE_SCORES = {
    1: 100,
    2: 300,
    3: 500,
    4: 800
  };

  // Timing constants (ms)
  const BASE_DROP_INTERVAL = 800;
  const MIN_DROP_INTERVAL = 100;
  const SPEED_DECAY = 0.85;
  const SOFT_DROP_INTERVAL = 50;
  const DAS_DELAY = 160; // Delayed Auto Shift
  const ARR_INTERVAL = 45; // Auto Repeat Rate

  // DOM Elements
  const canvas = document.getElementById('tetris-canvas');
  const ctx = canvas.getContext('2d');
  const nextCanvas = document.getElementById('next-canvas');
  const nextCtx = nextCanvas.getContext('2d');

  const scoreDisplay = document.getElementById('score-display');
  const levelDisplay = document.getElementById('level-display');
  const linesDisplay = document.getElementById('lines-display');

  const pauseBtn = document.getElementById('pause-btn');
  const restartBtn = document.getElementById('restart-btn');

  const pauseOverlay = document.getElementById('pause-overlay');
  const resumeOverlayBtn = document.getElementById('resume-overlay-btn');

  const gameoverOverlay = document.getElementById('gameover-overlay');
  const finalScoreVal = document.getElementById('final-score-val');
  const restartOverlayBtn = document.getElementById('restart-overlay-btn');

  // Game State Variables
  let board = [];
  let score = 0;
  let level = 1;
  let lines = 0;
  let gameState = 'STOPPED'; // 'PLAYING', 'PAUSED', 'GAMEOVER', 'STOPPED'

  let currentPiece = null;
  let nextPiece = null;
  let bag = [];

  let lastTime = 0;
  let dropCounter = 0;
  let animationFrameId = null;

  // Key control states for DAS & continuous movement
  const keysPressed = {
    ArrowLeft: false,
    ArrowRight: false,
    ArrowDown: false
  };
  let activeHorizontalKey = null;
  let dasTimer = null;
  let arrInterval = null;
  let softDropTimer = null;

  // Flash animation state for line clears
  let clearingLines = [];
  let clearAnimTimer = null;

  /**
   * Calculate drop interval for a given level
   */
  function getDropInterval(lvl) {
    let interval = BASE_DROP_INTERVAL;
    for (let i = 1; i < lvl; i++) {
      interval = Math.max(MIN_DROP_INTERVAL, Math.round(interval * SPEED_DECAY));
    }
    return interval;
  }

  /**
   * 7-Bag Randomizer
   */
  function getNextTetromino() {
    if (bag.length === 0) {
      bag = [...TETROMINO_KEYS];
      // Fisher-Yates shuffle
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
    }
    const key = bag.pop();
    const data = TETROMINOES[key];
    return {
      key,
      matrix: data.matrix.map(row => [...row]),
      color: data.color,
      lightColor: data.lightColor,
      darkColor: data.darkColor,
      x: 0,
      y: 0
    };
  }

  /**
   * Create an empty board
   */
  function createBoard() {
    return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  }

  /**
   * Collision check
   */
  function isValidMove(matrix, offsetX, offsetY) {
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        if (matrix[r][c]) {
          const boardX = offsetX + c;
          const boardY = offsetY + r;

          // Wall collision
          if (boardX < 0 || boardX >= COLS || boardY >= ROWS) {
            return false;
          }

          // Locked blocks collision (only if within board height)
          if (boardY >= 0 && board[boardY][boardX] !== 0) {
            return false;
          }
        }
      }
    }
    return true;
  }

  /**
   * Matrix rotation (clockwise 90 deg)
   */
  function rotateMatrix(matrix) {
    const N = matrix.length;
    const result = Array.from({ length: N }, () => Array(N).fill(0));
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        result[c][N - 1 - r] = matrix[r][c];
      }
    }
    return result;
  }

  /**
   * Attempt to rotate current piece with standard wall-kick offsets
   */
  function rotateCurrentPiece() {
    if (!currentPiece || gameState !== 'PLAYING') return;

    const rotated = rotateMatrix(currentPiece.matrix);
    // Wall kick offset candidates
    const kickOffsets = [
      [0, 0],
      [-1, 0],
      [1, 0],
      [-2, 0],
      [2, 0],
      [0, -1]
    ];

    for (const [dx, dy] of kickOffsets) {
      if (isValidMove(rotated, currentPiece.x + dx, currentPiece.y + dy)) {
        currentPiece.matrix = rotated;
        currentPiece.x += dx;
        currentPiece.y += dy;
        draw();
        return;
      }
    }
  }

  /**
   * Calculate ghost piece Y position
   */
  function getGhostY() {
    if (!currentPiece) return 0;
    let gy = currentPiece.y;
    while (isValidMove(currentPiece.matrix, currentPiece.x, gy + 1)) {
      gy++;
    }
    return gy;
  }

  /**
   * Move current piece horizontally
   */
  function moveHorizontal(dir) {
    if (!currentPiece || gameState !== 'PLAYING') return;
    if (isValidMove(currentPiece.matrix, currentPiece.x + dir, currentPiece.y)) {
      currentPiece.x += dir;
      draw();
    }
  }

  /**
   * Move piece down by 1 cell
   * Returns true if moved, false if reached ground/obstacle
   */
  function moveDown() {
    if (!currentPiece || gameState !== 'PLAYING') return false;

    if (isValidMove(currentPiece.matrix, currentPiece.x, currentPiece.y + 1)) {
      currentPiece.y++;
      draw();
      return true;
    } else {
      lockPiece();
      return false;
    }
  }

  /**
   * Hard drop: instantly drop to ghost position and lock
   */
  function hardDrop() {
    if (!currentPiece || gameState !== 'PLAYING') return;
    const ghostY = getGhostY();
    currentPiece.y = ghostY;
    draw();
    lockPiece();
  }

  /**
   * Lock current piece into board and process line clears
   */
  function lockPiece() {
    if (!currentPiece) return;

    for (let r = 0; r < currentPiece.matrix.length; r++) {
      for (let c = 0; c < currentPiece.matrix[r].length; c++) {
        if (currentPiece.matrix[r][c]) {
          const by = currentPiece.y + r;
          const bx = currentPiece.x + c;
          if (by >= 0 && by < ROWS && bx >= 0 && bx < COLS) {
            board[by][bx] = {
              color: currentPiece.color,
              lightColor: currentPiece.lightColor,
              darkColor: currentPiece.darkColor
            };
          }
        }
      }
    }

    currentPiece = null;
    checkLineClears();
  }

  /**
   * Check and handle completed lines
   */
  function checkLineClears() {
    const fullRows = [];
    for (let r = 0; r < ROWS; r++) {
      if (board[r].every(cell => cell !== 0)) {
        fullRows.push(r);
      }
    }

    if (fullRows.length > 0) {
      // Pause inputs during brief flash animation
      clearingLines = fullRows;
      draw();

      clearTimeout(clearAnimTimer);
      clearAnimTimer = setTimeout(() => {
        // Remove cleared rows and push empty rows to top
        for (const rowIdx of fullRows) {
          board.splice(rowIdx, 1);
          board.unshift(Array(COLS).fill(0));
        }

        // Apply scoring with current level BEFORE clear
        const linesCleared = fullRows.length;
        const baseScore = LINE_SCORES[linesCleared] || 0;
        score += baseScore * level;

        // Cumulative lines and level update
        lines += linesCleared;
        level = Math.floor(lines / 10) + 1;

        clearingLines = [];
        updateUI();
        draw();

        spawnNextPiece();
      }, 140);
    } else {
      spawnNextPiece();
    }
  }

  /**
   * Spawn next piece from preview
   */
  function spawnNextPiece() {
    currentPiece = nextPiece;
    nextPiece = getNextTetromino();

    // Center the spawned piece
    const matrixLen = currentPiece.matrix[0].length;
    currentPiece.x = Math.floor((COLS - matrixLen) / 2);
    currentPiece.y = 0;

    // Check if spawn position collides immediately -> Game Over
    if (!isValidMove(currentPiece.matrix, currentPiece.x, currentPiece.y)) {
      gameOver();
      return;
    }

    drawNextPiece();
    draw();
  }

  /**
   * Game Over
   */
  function gameOver() {
    gameState = 'GAMEOVER';
    stopTimers();

    finalScoreVal.textContent = score.toLocaleString();
    gameoverOverlay.classList.remove('hidden');
    draw();
  }

  /**
   * Pause the game
   */
  function pauseGame() {
    if (gameState !== 'PLAYING') return;

    gameState = 'PAUSED';
    stopTimers();
    pauseBtn.textContent = '계속하기';
    pauseOverlay.classList.remove('hidden');
  }

  /**
   * Resume the game
   */
  function resumeGame() {
    if (gameState !== 'PAUSED') return;

    gameState = 'PLAYING';
    pauseBtn.textContent = '일시정지';
    pauseOverlay.classList.add('hidden');
    lastTime = performance.now();
    dropCounter = 0;
    requestGameLoop();
  }

  /**
   * Toggle pause
   */
  function togglePause() {
    if (gameState === 'PLAYING') {
      pauseGame();
    } else if (gameState === 'PAUSED') {
      resumeGame();
    }
  }

  /**
   * Reset and Start Game
   */
  function restartGame() {
    // Stop all loops and timers first
    stopTimers();
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }

    // Reset game state
    board = createBoard();
    score = 0;
    level = 1;
    lines = 0;
    bag = [];
    clearingLines = [];

    // Reset UI displays & overlays
    updateUI();
    pauseBtn.textContent = '일시정지';
    pauseOverlay.classList.add('hidden');
    gameoverOverlay.classList.add('hidden');

    // Spawn pieces
    nextPiece = getNextTetromino();
    spawnNextPiece();

    gameState = 'PLAYING';
    lastTime = performance.now();
    dropCounter = 0;

    requestGameLoop();
  }

  /**
   * Stop all control/drop timers cleanly
   */
  function stopTimers() {
    clearTimeout(dasTimer);
    clearInterval(arrInterval);
    clearInterval(softDropTimer);
    clearTimeout(clearAnimTimer);
    dasTimer = null;
    arrInterval = null;
    softDropTimer = null;
    clearAnimTimer = null;
  }

  /**
   * Main game loop with requestAnimationFrame
   */
  function gameLoop(time = 0) {
    if (gameState !== 'PLAYING') return;

    const deltaTime = time - lastTime;
    lastTime = time;
    dropCounter += deltaTime;

    const currentDropInterval = keysPressed.ArrowDown
      ? SOFT_DROP_INTERVAL
      : getDropInterval(level);

    if (dropCounter >= currentDropInterval) {
      moveDown();
      dropCounter = 0;
    }

    draw();

    if (gameState === 'PLAYING') {
      animationFrameId = requestAnimationFrame(gameLoop);
    }
  }

  function requestGameLoop() {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
    }
    animationFrameId = requestAnimationFrame(gameLoop);
  }

  /**
   * Update Score, Level, Lines in DOM
   */
  function updateUI() {
    scoreDisplay.textContent = score.toLocaleString();
    levelDisplay.textContent = level;
    linesDisplay.textContent = lines;
  }

  // --- Drawing Routines: Fluffy Cloud Blocks ---

  /**
   * Helper to draw rounded rectangle
   */
  function drawRoundedRect(targetCtx, x, y, w, h, r) {
    if (targetCtx.roundRect) {
      targetCtx.roundRect(x, y, w, h, r);
    } else {
      targetCtx.moveTo(x + r, y);
      targetCtx.arcTo(x + w, y, x + w, y + h, r);
      targetCtx.arcTo(x + w, y + h, x, y + h, r);
      targetCtx.arcTo(x, y + h, x, y, r);
      targetCtx.arcTo(x, y, x + w, y, r);
    }
  }

  /**
   * Draw a single Cloud Block cell
   */
  function drawCloudBlock(targetCtx, x, y, size, blockData, isGhost = false, isFlash = false) {
    const px = x * size;
    const py = y * size;
    drawCloudBlockPixel(targetCtx, px, py, size, blockData, isGhost, isFlash);
  }

  /**
   * Pixel-level rendering of a fluffy 3D cloud cell
   */
  function drawCloudBlockPixel(targetCtx, px, py, size, blockData, isGhost = false, isFlash = false) {
    const pad = 1.5;
    const x = px + pad;
    const y = py + pad;
    const w = size - pad * 2;
    const h = size - pad * 2;
    const radius = Math.max(5, Math.floor(size * 0.28));

    if (isFlash) {
      // Cloud burst flash effect on line clear
      targetCtx.save();
      targetCtx.fillStyle = '#ffffff';
      targetCtx.beginPath();
      drawRoundedRect(targetCtx, x, y, w, h, radius);
      targetCtx.fill();
      targetCtx.strokeStyle = '#38bdf8';
      targetCtx.lineWidth = 2;
      targetCtx.stroke();
      targetCtx.restore();
      return;
    }

    if (isGhost) {
      // Ghost cloud: translucent soft silhouette with dashed cloud border
      targetCtx.save();
      targetCtx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      targetCtx.strokeStyle = blockData.color || '#38bdf8';
      targetCtx.lineWidth = 1.5;
      if (targetCtx.setLineDash) {
        targetCtx.setLineDash([3, 3]);
      }
      targetCtx.beginPath();
      drawRoundedRect(targetCtx, x + 1, y + 1, w - 2, h - 2, radius);
      targetCtx.fill();
      targetCtx.stroke();
      targetCtx.restore();
      return;
    }

    targetCtx.save();

    // 1. Soft bottom shadow for floating cloud depth
    targetCtx.shadowColor = 'rgba(3, 105, 161, 0.18)';
    targetCtx.shadowBlur = 4;
    targetCtx.shadowOffsetY = 2;

    // 2. Base Cloud Body with vertical fluffy gradient
    const grad = targetCtx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, blockData.lightColor || '#ffffff');
    grad.addColorStop(0.35, blockData.color);
    grad.addColorStop(1, blockData.darkColor || '#0284c7');

    targetCtx.beginPath();
    drawRoundedRect(targetCtx, x, y, w, h, radius);
    targetCtx.fillStyle = grad;
    targetCtx.fill();

    // Disable shadow for inner highlights
    targetCtx.shadowColor = 'transparent';

    // 3. Top fluffy cloud highlight (overlapping puffs)
    targetCtx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    targetCtx.beginPath();
    targetCtx.ellipse(x + w * 0.5, y + h * 0.32, w * 0.36, h * 0.22, 0, 0, Math.PI * 2);
    targetCtx.fill();

    // Left specular gleam
    targetCtx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    targetCtx.beginPath();
    targetCtx.arc(x + w * 0.3, y + h * 0.25, Math.max(2, w * 0.12), 0, Math.PI * 2);
    targetCtx.fill();

    // 4. Bottom cloud shading
    targetCtx.fillStyle = 'rgba(0, 0, 0, 0.07)';
    targetCtx.beginPath();
    targetCtx.ellipse(x + w * 0.5, y + h * 0.82, w * 0.36, h * 0.14, 0, 0, Math.PI * 2);
    targetCtx.fill();

    // 5. Crisp white cloud rim
    targetCtx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    targetCtx.lineWidth = 1.5;
    targetCtx.beginPath();
    drawRoundedRect(targetCtx, x, y, w, h, radius);
    targetCtx.stroke();

    targetCtx.restore();
  }

  /**
   * Render the main board
   */
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Draw subtle sky blue grid
    ctx.strokeStyle = 'rgba(2, 132, 199, 0.08)';
    ctx.lineWidth = 1;
    for (let c = 0; c <= COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(c * BLOCK_SIZE, 0);
      ctx.lineTo(c * BLOCK_SIZE, ROWS * BLOCK_SIZE);
      ctx.stroke();
    }
    for (let r = 0; r <= ROWS; r++) {
      ctx.beginPath();
      ctx.moveTo(0, r * BLOCK_SIZE);
      ctx.lineTo(COLS * BLOCK_SIZE, r * BLOCK_SIZE);
      ctx.stroke();
    }

    // 2. Draw locked cloud blocks on board
    for (let r = 0; r < ROWS; r++) {
      const isLineClearing = clearingLines.includes(r);
      for (let c = 0; c < COLS; c++) {
        const cell = board[r][c];
        if (cell !== 0) {
          drawCloudBlock(ctx, c, r, BLOCK_SIZE, cell, false, isLineClearing);
        }
      }
    }

    // 3. Draw Ghost cloud piece (if playing)
    if (currentPiece && gameState === 'PLAYING') {
      const ghostY = getGhostY();
      // Only draw ghost if it's below current position
      if (ghostY >= currentPiece.y) {
        for (let r = 0; r < currentPiece.matrix.length; r++) {
          for (let c = 0; c < currentPiece.matrix[r].length; c++) {
            if (currentPiece.matrix[r][c]) {
              const by = ghostY + r;
              const bx = currentPiece.x + c;
              if (by >= 0 && by < ROWS && bx >= 0 && bx < COLS) {
                drawCloudBlock(ctx, bx, by, BLOCK_SIZE, currentPiece, true);
              }
            }
          }
        }
      }
    }

    // 4. Draw Current falling cloud piece
    if (currentPiece) {
      for (let r = 0; r < currentPiece.matrix.length; r++) {
        for (let c = 0; c < currentPiece.matrix[r].length; c++) {
          if (currentPiece.matrix[r][c]) {
            const by = currentPiece.y + r;
            const bx = currentPiece.x + c;
            if (by >= 0 && by < ROWS && bx >= 0 && bx < COLS) {
              drawCloudBlock(ctx, bx, by, BLOCK_SIZE, currentPiece, false);
            }
          }
        }
      }
    }
  }

  /**
   * Render the Next Cloud preview canvas
   */
  function drawNextPiece() {
    nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
    if (!nextPiece) return;

    const matrix = nextPiece.matrix;
    const rows = matrix.length;
    const cols = matrix[0].length;

    // Find actual bounds of non-empty cells to center perfectly
    let minR = rows, maxR = -1, minC = cols, maxC = -1;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (matrix[r][c]) {
          if (r < minR) minR = r;
          if (r > maxR) maxR = r;
          if (c < minC) minC = c;
          if (c > maxC) maxC = c;
        }
      }
    }

    const pieceWidth = (maxC - minC + 1) * NEXT_BLOCK_SIZE;
    const pieceHeight = (maxR - minR + 1) * NEXT_BLOCK_SIZE;
    const offsetX = Math.round((nextCanvas.width - pieceWidth) / 2) - minC * NEXT_BLOCK_SIZE;
    const offsetY = Math.round((nextCanvas.height - pieceHeight) / 2) - minR * NEXT_BLOCK_SIZE;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (matrix[r][c]) {
          const px = offsetX + c * NEXT_BLOCK_SIZE;
          const py = offsetY + r * NEXT_BLOCK_SIZE;
          drawCloudBlockPixel(nextCtx, px, py, NEXT_BLOCK_SIZE, nextPiece);
        }
      }
    }
  }

  // --- Keyboard Handling ---

  function startHorizontalMovement(key) {
    const dir = key === 'ArrowLeft' ? -1 : 1;
    activeHorizontalKey = key;
    moveHorizontal(dir);

    clearTimeout(dasTimer);
    clearInterval(arrInterval);

    dasTimer = setTimeout(() => {
      arrInterval = setInterval(() => {
        if (keysPressed[key] && activeHorizontalKey === key) {
          moveHorizontal(dir);
        } else {
          clearInterval(arrInterval);
        }
      }, ARR_INTERVAL);
    }, DAS_DELAY);
  }

  function handleKeyDown(e) {
    const gameKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];
    if (gameKeys.includes(e.code)) {
      e.preventDefault(); // Prevent page scroll
    }

    if (gameState !== 'PLAYING') return;

    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
      if (!keysPressed[e.code]) {
        keysPressed[e.code] = true;
        startHorizontalMovement(e.code);
      }
    } else if (e.code === 'ArrowDown') {
      if (!keysPressed.ArrowDown) {
        keysPressed.ArrowDown = true;
        moveDown();
        dropCounter = 0;
      }
    } else if (e.code === 'ArrowUp') {
      if (!e.repeat) {
        rotateCurrentPiece();
      }
    } else if (e.code === 'Space') {
      if (!e.repeat) {
        hardDrop();
      }
    }
  }

  function handleKeyUp(e) {
    const gameKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];
    if (gameKeys.includes(e.code)) {
      e.preventDefault();
    }

    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
      keysPressed[e.code] = false;
      if (activeHorizontalKey === e.code) {
        clearTimeout(dasTimer);
        clearInterval(arrInterval);
        activeHorizontalKey = null;

        // If the other horizontal arrow is still held, switch to it
        const otherKey = e.code === 'ArrowLeft' ? 'ArrowRight' : 'ArrowLeft';
        if (keysPressed[otherKey]) {
          startHorizontalMovement(otherKey);
        }
      }
    } else if (e.code === 'ArrowDown') {
      keysPressed.ArrowDown = false;
    }
  }

  // Window blur / Tab switch visibility handling
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && gameState === 'PLAYING') {
      pauseGame();
    }
  });

  window.addEventListener('blur', () => {
    // Release held keys when window loses focus
    keysPressed.ArrowLeft = false;
    keysPressed.ArrowRight = false;
    keysPressed.ArrowDown = false;
    clearTimeout(dasTimer);
    clearInterval(arrInterval);
    activeHorizontalKey = null;
  });

  // Event Listeners
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);

  pauseBtn.addEventListener('click', togglePause);
  resumeOverlayBtn.addEventListener('click', resumeGame);

  restartBtn.addEventListener('click', restartGame);
  restartOverlayBtn.addEventListener('click', restartGame);

  // Initialize and automatically start game on page load
  restartGame();

})();
