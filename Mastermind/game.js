// Mastermind Game with Solver and Hint System

const COLORS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'];
const COLOR_HEX = {
    red: '#e74c3c',
    blue: '#3498db',
    green: '#2ecc71',
    yellow: '#f1c40f',
    purple: '#9b59b6',
    orange: '#e67e22'
};
const CODE_LENGTH = 4;
const MAX_GUESSES = 10;

let secretCode = [];
let currentRow = 0;
let currentGuess = [null, null, null, null];
let selectedColor = null;
let gameOver = false;
let allGuesses = []; // Track all guesses and their scores for solver
let possibleCodes = []; // All remaining possible codes
let allCodes = []; // All 1296 codes (precomputed once)

// ==================== SCORING ALGORITHM ====================

/**
 * Scores a guess against a secret code (optimized - no array copies)
 * Returns { blacks: number, whites: number }
 */
function scoreGuess(guess, secret) {
    let blacks = 0;
    let whites = 0;
    
    // Track which positions are matched
    const secretMatched = [false, false, false, false];
    const guessMatched = [false, false, false, false];
    
    // First pass: count exact matches (blacks)
    for (let i = 0; i < CODE_LENGTH; i++) {
        if (guess[i] === secret[i]) {
            blacks++;
            secretMatched[i] = true;
            guessMatched[i] = true;
        }
    }
    
    // Second pass: count color matches in wrong positions (whites)
    for (let i = 0; i < CODE_LENGTH; i++) {
        if (!guessMatched[i]) {
            for (let j = 0; j < CODE_LENGTH; j++) {
                if (!secretMatched[j] && guess[i] === secret[j]) {
                    whites++;
                    secretMatched[j] = true;
                    break;
                }
            }
        }
    }
    
    return { blacks, whites };
}

// ==================== SOLVER / HINT SYSTEM ====================

/**
 * Generates all possible codes (6^4 = 1296 combinations)
 */
function generateAllCodes() {
    const codes = [];
    for (let a = 0; a < COLORS.length; a++) {
        for (let b = 0; b < COLORS.length; b++) {
            for (let c = 0; c < COLORS.length; c++) {
                for (let d = 0; d < COLORS.length; d++) {
                    codes.push([COLORS[a], COLORS[b], COLORS[c], COLORS[d]]);
                }
            }
        }
    }
    return codes;
}

/**
 * Filters possible codes based on a guess and its score
 * Returns only codes that would produce the same score
 */
function filterPossibleCodes(codes, guess, score) {
    return codes.filter(code => {
        const testScore = scoreGuess(guess, code);
        return testScore.blacks === score.blacks && testScore.whites === score.whites;
    });
}

/**
 * Knuth's minimax algorithm - finds the guess that minimizes
 * the maximum number of remaining possibilities (OPTIMAL VERSION)
 * 
 * Guarantees finding in ≤5 guesses by considering ALL codes as candidates
 */
function findBestGuess(possibleCodes) {
    const n = possibleCodes.length;
    
    if (n <= 1) return possibleCodes[0] || null;
    if (n === 2) return possibleCodes[0];
    
    // For first guess, use known optimal: two pairs of different colors
    if (n === 1296) {
        return [COLORS[0], COLORS[0], COLORS[1], COLORS[1]];
    }
    
    let bestGuess = null;
    let bestScore = Infinity;
    let bestIsPossible = false; // Prefer guesses that could be the answer
    
    // Consider ALL 1296 codes as candidates (key to optimality)
    for (let c = 0; c < allCodes.length; c++) {
        const guess = allCodes[c];
        
        // Count how responses partition the remaining possibilities
        const responseCounts = new Uint16Array(15);
        
        for (let i = 0; i < n; i++) {
            const score = scoreGuess(guess, possibleCodes[i]);
            responseCounts[score.blacks * 5 + score.whites]++;
        }
        
        // Find maximum partition size
        let maxPartition = 0;
        for (let i = 0; i < 15; i++) {
            if (responseCounts[i] > maxPartition) {
                maxPartition = responseCounts[i];
            }
        }
        
        // Check if this guess is in the possible set
        const isPossible = possibleCodes.some(code => 
            code[0] === guess[0] && code[1] === guess[1] && 
            code[2] === guess[2] && code[3] === guess[3]
        );
        
        // Update best: prefer smaller partitions, tie-break by preferring possible codes
        if (maxPartition < bestScore || 
            (maxPartition === bestScore && isPossible && !bestIsPossible)) {
            bestScore = maxPartition;
            bestGuess = guess;
            bestIsPossible = isPossible;
        }
    }
    
    return bestGuess;
}

/**
 * Generates a hint based on current game state
 * Returns { text: string, suggestion: array|null }
 */
function generateHint() {
    if (gameOver) {
        return { text: "Game is over! Start a new game to play again.", suggestion: null };
    }
    
    const remaining = possibleCodes.length;
    
    if (remaining === 0) {
        return { text: "Something went wrong - no valid codes remain!", suggestion: null };
    }
    
    if (remaining === 1) {
        const code = possibleCodes[0];
        return { 
            text: "There's only one possibility left! The code must be:", 
            suggestion: code 
        };
    }
    
    // Get the best next guess
    const bestGuess = findBestGuess(possibleCodes);
    
    // Check if bestGuess is in possibleCodes
    const guessIsPossible = possibleCodes.some(code => 
        code[0] === bestGuess[0] && code[1] === bestGuess[1] && 
        code[2] === bestGuess[2] && code[3] === bestGuess[3]
    );
    
    if (currentRow === 0) {
        // First guess hint - explain Knuth's optimal opening
        return { 
            text: "Knuth's algorithm recommends starting with two pairs (like RR-BB). Surprisingly, this is mathematically optimal! It reveals both color presence AND position info efficiently, partitioning the 1,296 possibilities better than 4 different colors would.", 
            suggestion: bestGuess 
        };
    }
    
    // Build detailed hint
    let hint = `${remaining} possible codes remain. `;
    
    // Calculate worst-case partition size for this guess
    const responseCounts = new Uint16Array(15);
    for (const code of possibleCodes) {
        const score = scoreGuess(bestGuess, code);
        responseCounts[score.blacks * 5 + score.whites]++;
    }
    let worstPartition = 0;
    let numPartitions = 0;
    for (let i = 0; i < 15; i++) {
        if (responseCounts[i] > 0) numPartitions++;
        if (responseCounts[i] > worstPartition) worstPartition = responseCounts[i];
    }
    
    // Explain minimax strategy
    hint += `Using Knuth's minimax strategy: this guess splits possibilities into ${numPartitions} groups, with at most ${worstPartition} codes in the worst case. `;
    
    // Explain if suggesting a code that can't be the answer
    if (!guessIsPossible) {
        hint += `Interestingly, this guess CAN'T be the answer—but it's still optimal because it partitions the remaining codes better than any possible answer would! `;
    }
    
    // Guaranteed solve info
    const guessesLeft = MAX_GUESSES - currentRow;
    if (remaining <= 2) {
        hint += `You're guaranteed to solve it in ${remaining} more guess${remaining > 1 ? 'es' : ''}! `;
    } else if (guessesLeft >= 5) {
        hint += `Knuth proved any code can be found in ≤5 guesses from here. `;
    }
    
    // Analyze which colors are definitely in/out
    const definitelyPresent = [];
    const definitelyAbsent = [];
    
    for (const color of COLORS) {
        let inAll = true;
        let inNone = true;
        
        for (const code of possibleCodes) {
            if (code.includes(color)) {
                inNone = false;
            } else {
                inAll = false;
            }
        }
        
        if (inAll) definitelyPresent.push(color);
        if (inNone) definitelyAbsent.push(color);
    }
    
    if (definitelyPresent.length > 0) {
        hint += `Definitely in the code: ${definitelyPresent.map(c => c.toUpperCase()).join(', ')}. `;
    }
    
    if (definitelyAbsent.length > 0) {
        hint += `Ruled out: ${definitelyAbsent.map(c => c.toUpperCase()).join(', ')}. `;
    }
    
    hint += `Optimal guess:`;
    
    return { text: hint, suggestion: bestGuess };
}

// ==================== GAME UI ====================

function generateSecretCode() {
    const code = [];
    for (let i = 0; i < CODE_LENGTH; i++) {
        code.push(COLORS[Math.floor(Math.random() * COLORS.length)]);
    }
    return code;
}

function createGameBoard() {
    const board = document.getElementById('gameBoard');
    board.innerHTML = '';
    
    for (let row = 0; row < MAX_GUESSES; row++) {
        const rowDiv = document.createElement('div');
        rowDiv.className = 'guess-row' + (row === 0 ? ' active' : '');
        rowDiv.id = `row-${row}`;
        
        const rowNum = document.createElement('span');
        rowNum.className = 'row-number';
        rowNum.textContent = row + 1;
        rowDiv.appendChild(rowNum);
        
        const pegsDiv = document.createElement('div');
        pegsDiv.className = 'guess-pegs';
        
        for (let col = 0; col < CODE_LENGTH; col++) {
            const slot = document.createElement('div');
            slot.className = 'guess-slot';
            slot.dataset.row = row;
            slot.dataset.col = col;
            slot.addEventListener('click', () => handleSlotClick(row, col));
            pegsDiv.appendChild(slot);
        }
        
        rowDiv.appendChild(pegsDiv);
        
        const resultsDiv = document.createElement('div');
        resultsDiv.className = 'result-pegs';
        resultsDiv.id = `results-${row}`;
        
        for (let i = 0; i < CODE_LENGTH; i++) {
            const resultPeg = document.createElement('div');
            resultPeg.className = 'result-peg';
            resultsDiv.appendChild(resultPeg);
        }
        
        rowDiv.appendChild(resultsDiv);
        board.appendChild(rowDiv);
    }
}

function handleSlotClick(row, col) {
    if (row !== currentRow || gameOver) return;
    
    if (selectedColor) {
        currentGuess[col] = selectedColor;
        updateSlotDisplay(row, col, selectedColor);
        checkGuessComplete();
    }
}

function updateSlotDisplay(row, col, color) {
    const slot = document.querySelector(`[data-row="${row}"][data-col="${col}"]`);
    if (color) {
        slot.style.background = COLOR_HEX[color];
        slot.classList.add('filled');
    } else {
        slot.style.background = '';
        slot.classList.remove('filled');
    }
}

function checkGuessComplete() {
    const complete = currentGuess.every(c => c !== null);
    document.getElementById('submitGuess').disabled = !complete;
}

function submitGuess() {
    if (gameOver || currentGuess.some(c => c === null)) return;
    
    const score = scoreGuess(currentGuess, secretCode);
    displayScore(currentRow, score);
    
    // Update solver state
    allGuesses.push({ guess: [...currentGuess], score });
    possibleCodes = filterPossibleCodes(possibleCodes, currentGuess, score);
    
    // Check for win
    if (score.blacks === CODE_LENGTH) {
        endGame(true);
        return;
    }
    
    // Move to next row
    document.getElementById(`row-${currentRow}`).classList.remove('active');
    document.getElementById(`row-${currentRow}`).classList.add('completed');
    
    currentRow++;
    
    if (currentRow >= MAX_GUESSES) {
        endGame(false);
        return;
    }
    
    document.getElementById(`row-${currentRow}`).classList.add('active');
    currentGuess = [null, null, null, null];
    document.getElementById('submitGuess').disabled = true;
    
    // Hide hint when making a new guess
    document.getElementById('hintBox').classList.remove('visible');
}

function displayScore(row, score) {
    const resultsDiv = document.getElementById(`results-${row}`);
    const pegs = resultsDiv.querySelectorAll('.result-peg');
    
    let pegIndex = 0;
    
    // Show black pegs first
    for (let i = 0; i < score.blacks; i++) {
        pegs[pegIndex++].classList.add('black');
    }
    
    // Then white pegs
    for (let i = 0; i < score.whites; i++) {
        pegs[pegIndex++].classList.add('white');
    }
}

function endGame(won) {
    gameOver = true;
    const messageDiv = document.getElementById('message');
    messageDiv.classList.add('visible');
    
    if (won) {
        messageDiv.classList.add('win');
        messageDiv.textContent = `🎉 Congratulations! You cracked the code in ${currentRow + 1} guesses!`;
    } else {
        messageDiv.classList.add('lose');
        messageDiv.innerHTML = `😢 Game Over! The secret code was:`;
        
        const reveal = document.createElement('div');
        reveal.className = 'secret-reveal';
        for (const color of secretCode) {
            const peg = document.createElement('div');
            peg.className = 'peg';
            peg.style.background = COLOR_HEX[color];
            reveal.appendChild(peg);
        }
        messageDiv.appendChild(reveal);
    }
    
    document.getElementById('submitGuess').disabled = true;
}

let currentSuggestion = null;

function showHint() {
    const hintOverlay = document.getElementById('hintOverlay');
    const hintText = document.getElementById('hintText');
    const hintSuggestion = document.getElementById('hintSuggestion');
    const suggestionPegs = document.getElementById('suggestionPegs');
    
    const hint = generateHint();
    hintText.textContent = hint.text;
    
    if (hint.suggestion && !gameOver) {
        currentSuggestion = hint.suggestion;
        suggestionPegs.innerHTML = '';
        for (const color of hint.suggestion) {
            const peg = document.createElement('div');
            peg.className = 'peg';
            peg.style.background = COLOR_HEX[color];
            suggestionPegs.appendChild(peg);
        }
        hintSuggestion.classList.add('visible');
    } else {
        currentSuggestion = null;
        hintSuggestion.classList.remove('visible');
    }
    
    hintOverlay.classList.add('visible');
}

function useSuggestion() {
    if (!currentSuggestion || gameOver) return;
    
    // Fill in the current guess with the suggestion
    for (let i = 0; i < CODE_LENGTH; i++) {
        currentGuess[i] = currentSuggestion[i];
        updateSlotDisplay(currentRow, i, currentSuggestion[i]);
    }
    
    hideHint();
    submitGuess();
}

function hideHint() {
    document.getElementById('hintOverlay').classList.remove('visible');
}

function newGame() {
    secretCode = generateSecretCode();
    currentRow = 0;
    currentGuess = [null, null, null, null];
    selectedColor = null;
    gameOver = false;
    allGuesses = [];
    
    // Generate all codes once if not already done
    if (allCodes.length === 0) {
        allCodes = generateAllCodes();
    }
    possibleCodes = [...allCodes];
    
    createGameBoard();
    
    document.getElementById('submitGuess').disabled = true;
    
    const messageDiv = document.getElementById('message');
    messageDiv.classList.remove('visible', 'win', 'lose');
    messageDiv.innerHTML = '';
    
    document.getElementById('hintOverlay').classList.remove('visible');
    
    // Clear color selection
    document.querySelectorAll('.color-peg').forEach(peg => {
        peg.classList.remove('selected');
    });
    
    console.log('Secret code:', secretCode); // For debugging
}

// ==================== EVENT LISTENERS ====================

document.addEventListener('DOMContentLoaded', () => {
    // Color palette selection
    document.querySelectorAll('.color-palette .color-peg').forEach(peg => {
        peg.addEventListener('click', () => {
            document.querySelectorAll('.color-palette .color-peg').forEach(p => {
                p.classList.remove('selected');
            });
            peg.classList.add('selected');
            selectedColor = peg.dataset.color;
        });
    });
    
    // Button handlers
    document.getElementById('submitGuess').addEventListener('click', submitGuess);
    document.getElementById('getHint').addEventListener('click', showHint);
    document.getElementById('hintClose').addEventListener('click', hideHint);
    document.getElementById('useSuggestion').addEventListener('click', useSuggestion);
    document.getElementById('hintOverlay').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) hideHint();
    });
    document.getElementById('newGame').addEventListener('click', newGame);
    
    // Start the game
    newGame();
});
