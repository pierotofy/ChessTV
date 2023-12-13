function main(){

// ==== INIT ====
function parseQueryParams(){
    let search = location.search.substring(1);
    if (!search) return {};
    return JSON.parse('{"' + decodeURI(search).replace(/"/g, '\\"').replace(/&/g, '","').replace(/=/g,'":"') + '"}');
}

let { color, gameId, speed, f } = parseQueryParams();
if (!color) color = "white";
if (!gameId) gameId = 0;
if (!speed) speed = 1000;
if (!f) f = "traps.json";
gameId = parseInt(gameId);

const domBoard = document.getElementById('chessboard');

const pieceStack = [];
const movesStack = [];


let lastSize = {
    w: null,
    h: null
};
const updateSize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight - 80;
    if (lastSize.w === w && lastSize.h === h) return;

    const size = Math.min(w, h) + 1;

    domBoard.style.width = size + 'px';
    domBoard.style.height = size + 'px';
    domBoard.style.marginBottom = '80px';

    if (w > h){
        domBoard.style.marginLeft = (w - h) / 2 + 'px';
        domBoard.style.marginTop = '0px';
    }else{
        domBoard.style.marginLeft = '0px';
        domBoard.style.marginTop = (h - w) / 2 + 'px';
    }

    lastSize.w = w;
    lastSize.h = h;
}

// Chess engine
const game = new Chess();
const calcDests = () => {
    return new Map();
}


const updateCg = () => {
    cg.set({
        orientation: color,
        highlight: {
            lastMove: true
        },

        turnColor:  game.turn() === 'w' ? 'white' : 'black',
        
        // this highlights the checked king in red
        check: game.in_check(),
        
        movable: {
            // Only allow moves by whoevers turn it is
            color: game.turn() === 'w' ? 'white' : 'black',
            
            // Only allow legal moves
            dests: calcDests()
        }
    });
}


const getPromotion = () => {
    const currentMove = moves[game.history().length];
    return currentMove?.promotion;
}

const checkPlayerMove = (orig, dest) => {
    pieceStack.push(checkMoveResult(game.move({from: orig, to: dest, promotion: getPromotion()})));
    updateCg();
    movesStack.push([orig, dest]);
};

const chessTypeToCgRole = {
    "p": "pawn",
    "r": "rook",
    "n": "knight",
    "b": "bishop",
    "q": "queen",
    "k": "king",
};

const chessMoveToCgPiece = (move) => {
    const { captured, color, promotion } = move;

    let pColor = color === "w" ? "black" : "white";
    let pRole = chessTypeToCgRole[captured];

    if (promotion){
        // "Capture" your own color
        pColor = color === "w" ? "white" : "black";
        pRole = "pawn";
    }

    return {
        role: pRole, 
        color: pColor
    };
}

const checkUndoCastle = (move) => {
    if (!move) return;

    const { flags, from } = move;
    const kingCastle = flags.indexOf("k") !== -1;
    const queenCastle = flags.indexOf("q") !== -1;
    
    if (kingCastle || queenCastle){
        if (from === "e1"){
            if (kingCastle) cg.move("f1", "h1");
            else cg.move("d1", "a1");
        }else if (from === "e8"){
            if (kingCastle) cg.move("f8", "h8");
            else cg.move("d8", "a8");
        }else{
            throw new Error(`Unexpected castle from ${from}`);
        }
    }
}

const checkMoveResult = (move) => {
    if (!move) return;

    const { flags, to, promotion, color } = move;
    const enPassant = flags.indexOf("e") !== -1;
    const stdCapture = flags.indexOf("c") !== -1;
    const noCapture = flags.indexOf("n") !== -1;

    if (noCapture && !promotion) return;

    if (enPassant || stdCapture || promotion){
        const p = chessMoveToCgPiece(move);
        if (stdCapture) p.position = to;
        else if (promotion){
            p.position = to;
            p.promotion = true;
            cg.setPieces([[p.position, {
                role: chessTypeToCgRole[promotion],
                color: color === "w" ? "white" : "black"
            }]]);
        }else if (enPassant){
            if (move.color === "w"){
                p.position = to[0] + parseInt(to[1] - 1)
            }else{
                p.position = to[0] + parseInt(to[1] + 1);
            }
            cg.setPieces([[p.position, null]]); // Remove piece
        }else return; // Should never happen
        
        return p;
    }
}

const playMove = (orig, dest, undo = false) => {
    cg.move(orig, dest);

    if (undo){
        checkUndoCastle(game.undo());

        let piece = pieceStack.pop();
        if (piece){
            if (piece.promotion){
                // Undo promotion
                cg.setPieces([[dest, {
                    role: "pawn",
                    color: piece.color
                }]]);
            }else{
                cg.newPiece(piece, piece.position);
            }
        }
    }else{
        const move = game.move({from: orig, to: dest, promotion: getPromotion()});
        pieceStack.push(checkMoveResult(move));
        movesStack.push([orig, dest]);
    }

    updateCg();
};

// Board
const cg = Chessground(domBoard, {
    orientation: "white",
    movable: {
        color: "white",
        free: false, // don't allow movement anywhere ...
        dests: calcDests(),
        events: {
            after: checkPlayerMove
        }
    }
});

let moves = [];

let playInt = null;
let nextGameInt = null;
let nextGameOnResume = false;
const playForward = () => {
    if (movesStack.length >= moves.length){
        nextGameInt = setTimeout(() => {
            gameId++;
            nextGame();
        }, speed * 3);
        return;
    }
    const { from, to } = moves[movesStack.length];
    playMove(from, to);
    console.log(from, to)
    playInt = setTimeout(() => {
        playForward();
    }, speed);

    return true;
};

const pauseResume = () => {
    if (nextGameOnResume){
        nextGameInt = setTimeout(() => {
            gameId++;
            nextGame();
        }, speed * 3);
        nextGameOnResume = false;
    }else{
        if (playInt){
            clearInterval(playInt);
            playInt = null;
        }else{
            playInt = setTimeout(() => {
                playForward();
            }, speed);
        }
        if (nextGameInt){
            clearInterval(nextGameInt);
            nextGameInt = null;
            nextGameOnResume = true;
        }
    }

};


const nextGame = () => {
    if (gameId >= games[color].length - 1){
        color = color == 'black' ? 'white' : 'black';
        gameId = 0;
    }
    window.location.href = window.location.pathname + "?gameId=" + (parseInt(gameId)) + "&speed=" + speed + "&color=" + color + "&f=" + encodeURIComponent(f); 
}

const analysis = () => {
    window.open("https://lichess.org/analysis/standard/" + encodeURIComponent(game.fen()), "analysis");
}

const uciToMove = (uci) => {
    let result = ["", ""];
    let c = 0;

    for (let i = 0; i < uci.length; ){
        if (/[a-h]/.test(uci[i])){
            result[c] += uci[i++];
            result[c++] += uci[i++];
        }else{
            i++; // Promotion character?
        }
        if (c > 1) break;
    }
    return result;
};

let games;
const loadTraps = (cb) => {
    fetch(f)
        .then(response => response.text())
        .then((text) => {
            games = JSON.parse(text);

            if (gameId >= games[color].length){
                color = color == 'black' ? 'white' : 'black';
                gameId = 0;
                nextGame();
                return;
            }

            moves = games[color][gameId].map(uci => {
                let [from, to] = uciToMove(uci);
                return {from, to};
            });
            console.log(moves);

            cb(moves, color);
        });
};

const start = () => {
    loadTraps((loadedMoves, playerColor) => {
        moves = loadedMoves;
        color = playerColor;
        updateCg();

        playForward();
    });
};


updateSize();
window.addEventListener('resize', updateSize);
setInterval(updateSize, 200);


const prev = () => {
    if (gameId == 0){
        color = color == 'black' ? 'white' : 'black';
        gameId = games[color].length - 1;
    }else{
        gameId--;
    }
    nextGame();
}

const next = () => {
    if (gameId == games[color].length - 1){
        color = color == 'black' ? 'white' : 'black';
        gameId = 0;
    }else{
        gameId++;
    }
    nextGame();
}

const faster = () => {
    speed /= 1.5;
}

const slower = () => {
    speed *= 1.5;
}

window.addEventListener('keydown', (e) => {
    console.log(e.keyCode);
    if (e.keyCode === 32){
        pauseResume();
    }else if (e.keyCode === 65){
        analysis();
    }else if (e.keyCode === 82){
        nextGame();
    }else if (e.keyCode === 37){
        prev();
    }else if (e.keyCode === 39){
        next();
    }else if (e.keyCode === 70){
        faster();
    }else if (e.keyCode === 83){
        slower();
    }
});

document.addEventListener('next', next);
document.addEventListener('prev', prev);
document.addEventListener('pause', pauseResume);
document.addEventListener('repeat', nextGame);
document.addEventListener('analysis', analysis);
document.addEventListener('faster', faster);
document.addEventListener('slower', slower);

window.cg = cg;
window.game = game;
window.domBoard = domBoard;
window.movesStack = movesStack;

// ==== END INIT ====

start();

}
