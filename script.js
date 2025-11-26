const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const holdCanvas = document.getElementById('hold-canvas');
const holdCtx = holdCanvas.getContext('2d');

const COLS = 10;
const ROWS = 20;
const BLOCK_SIZE = 30;
const COLORS = [
    null,
    '#00f0f0', '#0000f0', '#f0a000', '#f0f000',
    '#00f000', '#a000f0', '#f00000'
];

const SHAPES = [
    [],
    [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]], // I
    [[2, 0, 0], [2, 2, 2], [0, 0, 0]], // J
    [[0, 0, 3], [3, 3, 3], [0, 0, 0]], // L
    [[4, 4], [4, 4]], // O
    [[0, 5, 5], [5, 5, 0], [0, 0, 0]], // S
    [[0, 6, 0], [6, 6, 6], [0, 0, 0]], // T
    [[7, 7, 0], [0, 7, 7], [0, 0, 0]]  // Z
];

let board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
let score = 0, lines = 0, level = 1, combo = -1;
let gameOver = false, isPaused = false;
let dropInterval = 1000, lastTime = 0, dropCounter = 0;
let bag = [], piece = null, nextPiece = null, holdPiece = null, canHold = true;
let lastMoveWasRotate = false;

const scoreElement = document.getElementById('score');
const linesElement = document.getElementById('lines');
const levelElement = document.getElementById('level');
const comboElement = document.getElementById('combo');
const finalScoreElement = document.getElementById('final-score');
const finalLinesElement = document.getElementById('final-lines');
const startScreen = document.getElementById('start-screen');
const pauseScreen = document.getElementById('pause-screen');
const gameOverScreen = document.getElementById('game-over-screen');

function resetGame() {
    board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    score = 0; lines = 0; level = 1; combo = -1;
    gameOver = false; isPaused = false;
    dropInterval = 1000; holdPiece = null; canHold = true; bag = [];
    lastMoveWasRotate = false;
    updateStats();
    spawnPiece();
    startScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    pauseScreen.classList.add('hidden');
    lastTime = 0; dropCounter = 0;
    requestAnimationFrame(update);
}

function generateBag() {
    const pieces = [1, 2, 3, 4, 5, 6, 7];
    for (let i = pieces.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
    }
    return pieces;
}

function getNextPiece() {
    if (!bag.length) bag = generateBag();
    const type = bag.pop();
    return {
        type: type,
        matrix: SHAPES[type],
        pos: { x: Math.floor(COLS / 2) - Math.ceil(SHAPES[type][0].length / 2), y: 0 }
    };
}

function spawnPiece() {
    if (!nextPiece) nextPiece = getNextPiece();
    piece = nextPiece;
    nextPiece = getNextPiece();
    canHold = true;
    if (collide(board, piece)) {
        gameOver = true;
        showGameOver();
    }
    drawNext();
}

function collide(scene, p) {
    const m = p.matrix, o = p.pos;
    for (let y = 0; y < m.length; ++y) {
        for (let x = 0; x < m[y].length; ++x) {
            if (m[y][x] !== 0 && (scene[y + o.y] && scene[y + o.y][x + o.x]) !== 0) {
                return true;
            }
        }
    }
    return false;
}

function merge(scene, p) {
    p.matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value !== 0) scene[y + p.pos.y][x + p.pos.x] = value;
        });
    });
}

function rotate(matrix, dir) {
    for (let y = 0; y < matrix.length; ++y) {
        for (let x = 0; x < y; ++x) {
            [matrix[x][y], matrix[y][x]] = [matrix[y][x], matrix[x][y]];
        }
    }
    if (dir > 0) matrix.forEach(row => row.reverse());
    else matrix.reverse();
}

function playerRotate(dir) {
    const pos = piece.pos.x;
    let offset = 1;
    rotate(piece.matrix, dir);
    while (collide(board, piece)) {
        piece.pos.x += offset;
        offset = -(offset + (offset > 0 ? 1 : -1));
        if (offset > piece.matrix[0].length) {
            rotate(piece.matrix, -dir);
            piece.pos.x = pos;
            return;
        }
    }
    lastMoveWasRotate = true;
}

function checkTSpin() {
    if (piece.type !== 6 || !lastMoveWasRotate) return false;
    const x = piece.pos.x, y = piece.pos.y;
    const check = (cx, cy) => {
        if (cx < 0 || cx >= COLS || cy >= ROWS) return true;
        if (cy < 0) return false;
        return board[cy][cx] !== 0;
    };
    let corners = 0;
    if (check(x, y)) corners++;
    if (check(x + 2, y)) corners++;
    if (check(x, y + 2)) corners++;
    if (check(x + 2, y + 2)) corners++;
    return corners >= 3;
}

function playerDrop() {
    piece.pos.y++;
    if (collide(board, piece)) {
        piece.pos.y--;
        merge(board, piece);
        sweep();
        spawnPiece();
        lastMoveWasRotate = false;
    }
    dropCounter = 0;
}

function playerMove(dir) {
    piece.pos.x += dir;
    if (collide(board, piece)) piece.pos.x -= dir;
    else lastMoveWasRotate = false;
}

function playerHardDrop() {
    while (!collide(board, piece)) piece.pos.y++;
    piece.pos.y--;
    merge(board, piece);
    sweep();
    spawnPiece();
    lastMoveWasRotate = false;
    dropCounter = 0;
}

function hold() {
    if (!canHold) return;
    if (holdPiece === null) {
        holdPiece = piece.type;
        spawnPiece();
    } else {
        const temp = piece.type;
        piece = {
            type: holdPiece,
            matrix: SHAPES[holdPiece],
            pos: { x: Math.floor(COLS / 2) - Math.ceil(SHAPES[holdPiece][0].length / 2), y: 0 }
        };
        holdPiece = temp;
    }
    canHold = false;
    drawHold();
}

function sweep() {
    let rowCount = 0;
    outer: for (let y = ROWS - 1; y > 0; --y) {
        for (let x = 0; x < COLS; ++x) {
            if (board[y][x] === 0) continue outer;
        }
        const row = board.splice(y, 1)[0].fill(0);
        board.unshift(row);
        ++y;
        rowCount++;
    }
    if (rowCount > 0) {
        updateScore(rowCount);
    } else {
        combo = -1;
        updateStats();
    }
}

function updateScore(rowsCleared) {
    combo++;
    let points = 0;
    if (checkTSpin()) {
        points = 400 * rowsCleared * 2 * level;
        console.log("T-SPIN!");
    } else {
        const scores = [0, 100, 300, 500, 800];
        points = scores[rowsCleared] * level;
    }
    const comboBonus = 50 * combo * level;
    score += points + comboBonus;
    lines += rowsCleared;
    const newLevel = Math.floor(lines / 10) + 1;
    if (newLevel > level) {
        level = newLevel;
        dropInterval = Math.max(100, 1000 - (level - 1) * 100);
    }
    updateStats();
}

function updateStats() {
    scoreElement.innerText = score;
    linesElement.innerText = lines;
    levelElement.innerText = level;
    comboElement.innerText = Math.max(0, combo);
}

function showGameOver() {
    finalScoreElement.innerText = score;
    finalLinesElement.innerText = lines;
    gameOverScreen.classList.remove('hidden');
}

function draw() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawMatrix(board, { x: 0, y: 0 }, ctx);
    if (piece && !gameOver && !isPaused) {
        let ghost = { matrix: piece.matrix, pos: { ...piece.pos } };
        while (!collide(board, ghost)) ghost.pos.y++;
        ghost.pos.y--;
        ctx.globalAlpha = 0.2;
        drawMatrix(ghost.matrix, ghost.pos, ctx, piece.type);
        ctx.globalAlpha = 1.0;
        drawMatrix(piece.matrix, piece.pos, ctx, piece.type);
    }
}

function drawNext() {
    nextCtx.fillStyle = '#000';
    nextCtx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
    if (nextPiece) {
        const offset = {
            x: (nextCanvas.width / BLOCK_SIZE - nextPiece.matrix[0].length) / 2,
            y: (nextCanvas.height / BLOCK_SIZE - nextPiece.matrix.length) / 2
        };
        drawMatrix(nextPiece.matrix, offset, nextCtx, nextPiece.type);
    }
}

function drawHold() {
    holdCtx.fillStyle = '#000';
    holdCtx.fillRect(0, 0, holdCanvas.width, holdCanvas.height);
    if (holdPiece) {
        const matrix = SHAPES[holdPiece];
        const offset = {
            x: (holdCanvas.width / BLOCK_SIZE - matrix[0].length) / 2,
            y: (holdCanvas.height / BLOCK_SIZE - matrix.length) / 2
        };
        drawMatrix(matrix, offset, holdCtx, holdPiece);
    }
}

function drawMatrix(matrix, offset, context, typeOverride = null) {
    matrix.forEach((row, y) => {
        row.forEach((value, x) => {
            const val = typeOverride !== null && value !== 0 ? typeOverride : value;
            if (val !== 0) {
                context.fillStyle = COLORS[val];
                context.fillRect((x + offset.x) * BLOCK_SIZE, (y + offset.y) * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
                context.lineWidth = 2;
                context.strokeStyle = 'rgba(255,255,255,0.5)';
                context.strokeRect((x + offset.x) * BLOCK_SIZE, (y + offset.y) * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
                context.fillStyle = 'rgba(0,0,0,0.2)';
                context.fillRect((x + offset.x) * BLOCK_SIZE + 5, (y + offset.y) * BLOCK_SIZE + 5, BLOCK_SIZE - 10, BLOCK_SIZE - 10);
            }
        });
    });
}

function update(time = 0) {
    if (gameOver || isPaused) return;
    const deltaTime = time - lastTime;
    lastTime = time;
    dropCounter += deltaTime;
    if (dropCounter > dropInterval) playerDrop();
    draw();
    requestAnimationFrame(update);
}

document.addEventListener('keydown', event => {
    if (gameOver) return;
    if (event.key === 'Escape') {
        if (!startScreen.classList.contains('hidden')) return;
        isPaused = !isPaused;
        if (isPaused) pauseScreen.classList.remove('hidden');
        else {
            pauseScreen.classList.add('hidden');
            lastTime = performance.now();
            requestAnimationFrame(update);
        }
        return;
    }
    if (isPaused) return;
    if (event.key === 'ArrowLeft') playerMove(-1);
    else if (event.key === 'ArrowRight') playerMove(1);
    else if (event.key === 'ArrowDown') playerDrop();
    else if (event.key === 'ArrowUp') playerHardDrop();
    else if (event.key === 'z' || event.key === 'Z') playerRotate(1);
    else if (event.key === 'x' || event.key === 'X') playerRotate(-1);
    else if (event.key === 'Shift') hold();
});

document.getElementById('start-btn').addEventListener('click', resetGame);
document.getElementById('restart-btn').addEventListener('click', resetGame);
document.getElementById('resume-btn').addEventListener('click', () => {
    isPaused = false;
    pauseScreen.classList.add('hidden');
    lastTime = performance.now();
    requestAnimationFrame(update);
});

const addBtnListener = (id, action) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    const handleInput = (e) => {
        e.preventDefault();
        if (gameOver || isPaused) return;
        action();
    };
    btn.addEventListener('touchstart', handleInput, { passive: false });
    btn.addEventListener('mousedown', handleInput);
};

addBtnListener('btn-up', playerHardDrop);
addBtnListener('btn-down', playerDrop);
addBtnListener('btn-left', () => playerMove(-1));
addBtnListener('btn-right', () => playerMove(1));
addBtnListener('btn-rot-z', () => playerRotate(1));
addBtnListener('btn-rot-x', () => playerRotate(-1));
addBtnListener('btn-hold', hold);
addBtnListener('btn-esc', () => {
    if (!startScreen.classList.contains('hidden')) return;
    isPaused = !isPaused;
    if (isPaused) pauseScreen.classList.remove('hidden');
    else {
        pauseScreen.classList.add('hidden');
        lastTime = performance.now();
        requestAnimationFrame(update);
    }
});
