const savedUsername = localStorage.getItem('username');
const savedApples = localStorage.getItem('apples') || 0;

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const gameOverDiv = document.getElementById('game-over');
const pauseDiv = document.getElementById('pause');
const applesCounter = document.getElementById('apples-counter');
const loginBtn = document.getElementById('login-btn');
const registerBtn = document.getElementById('register-btn');
const logoutBtn = document.getElementById('logout-btn');
const saveBtn = document.getElementById('save-btn');
const welcomeMessage = document.getElementById('welcome-message');
const loginSection = document.getElementById('login-section');
const welcomeSection = document.getElementById('welcome-section');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const chatInput = document.getElementById('chat-input');
const chatMessages = document.getElementById('chat-messages');

const gridSize = 20;
const tileCount = 30;

const appleColor = '#FF0000';

let snakes = {};
let apples = [];
let myId = null;
let paused = false;
let applesEaten = 0;
let loggedInUser = null;
let snakeColor = '#00FF00';
let usernames = {};
let playerColors = {};

const socket = io();

if (savedUsername) {
    socket.on('connect', () => {
        socket.emit('auto-login', { username: savedUsername, apples: savedApples });
    });
}

document.querySelectorAll('.buy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if (!loggedInUser) {
            alert('You must be logged in to buy colors.');
            return;
        }
        const color = btn.getAttribute('data-color');
        if (btn.textContent === 'Use') {
            socket.emit('use-color', { color });
        } else {
            let cost = 30;
            if (color === 'gradient-yellow-orange' || color === 'gradient-cyan-blue') {
                cost = 200;
            }
            if (applesEaten >= cost) {
                socket.emit('buy-color', { color });
            } else {
                alert(`Not enough apples. You need ${cost} apples to buy this color.`);
            }
        }
    });
});

loginBtn.addEventListener('click', () => {
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    if (username && password) {
        socket.emit('login', { username, password });
    }
});

registerBtn.addEventListener('click', () => {
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    if (username && password) {
        socket.emit('register', { username, password });
    }
});

saveBtn.addEventListener('click', () => {
    if (loggedInUser) {
        socket.emit('save-progress');
    }
});

logoutBtn.addEventListener('click', () => {
    loggedInUser = null;
    applesEaten = 0;
    updateApplesCounter();
    loginSection.style.display = 'flex';
    welcomeSection.style.display = 'none';
    usernameInput.value = '';
    passwordInput.value = '';
    localStorage.removeItem('username');
    localStorage.removeItem('apples');
    socket.emit('logout');
});

document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;

    if (e.key === ' ') {
        paused = !paused;
        pauseDiv.style.display = paused ? 'block' : 'none';
        socket.emit('pause', paused);
        e.preventDefault();
        return;
    }

    if (e.key === 'Enter') {
        if (myId && snakes[myId] && !snakes[myId].alive) {
            socket.emit('revive');
        }
        e.preventDefault();
        return;
    }

    if (paused) return;

    if (!myId || !snakes[myId] || !snakes[myId].alive) return;

    let dir = { x: 0, y: 0 };
    if (e.key === 'w' || e.key === 'W') dir = { x: 0, y: -1 };
    else if (e.key === 's' || e.key === 'S') dir = { x: 0, y: 1 };
    else if (e.key === 'a' || e.key === 'A') dir = { x: -1, y: 0 };
    else if (e.key === 'd' || e.key === 'D') dir = { x: 1, y: 0 };

    if (dir.x !== 0 || dir.y !== 0) {
        socket.emit('direction', dir);
        e.preventDefault();
    }
});

socket.on('init', (data) => {
    snakes = data.snakes;
    apples = data.apples;
    myId = data.yourId;
    if (data.applesEaten !== undefined) {
        applesEaten = data.applesEaten;
        updateApplesCounter();
    }
    draw();
});

socket.on('update', (data) => {
    snakes = data.snakes;
    apples = data.apples;
    if (data.applesEaten !== undefined) {
        applesEaten = data.applesEaten;
        updateApplesCounter();
    }
    if (data.usernames) {
        usernames = data.usernames;
    }
    if (data.playerColors) {
        playerColors = data.playerColors;
    }
    draw();
    checkGameOver();
});

socket.on('paused', (isPaused) => {
    paused = isPaused;
    pauseDiv.style.display = paused ? 'block' : 'none';
});

socket.on('login-success', (data) => {
    loggedInUser = data.username;
    applesEaten = data.apples;
    updateApplesCounter();
    loginSection.style.display = 'none';
    welcomeSection.style.display = 'flex';
    welcomeMessage.textContent = `Bienvenido ${data.username}`;
    localStorage.setItem('username', data.username);
    localStorage.setItem('apples', data.apples);
    updateShopButtons(data.ownedColors || []);
    if (data.color) {
        snakeColor = data.color;
    }
});

socket.on('auto-login-success', (data) => {
    loggedInUser = data.username;
    applesEaten = data.apples;
    updateApplesCounter();
    loginSection.style.display = 'none';
    welcomeSection.style.display = 'flex';
    welcomeMessage.textContent = `Bienvenido ${data.username}`;
    updateShopButtons(data.ownedColors || []);
    if (data.color) {
        snakeColor = data.color;
    }
});

socket.on('auto-login-fail', () => {
    localStorage.removeItem('username');
    localStorage.removeItem('apples');
    alert('Sesión expirada. Por favor, inicia sesión nuevamente.');
});

socket.on('login-fail', (message) => {
    alert(message);
});

socket.on('register-success', () => {
    alert('Usuario registrado exitosamente');
});

socket.on('register-fail', (message) => {
    alert(message);
});

socket.on('save-success', () => {
    alert('Datos guardados exitosamente');
});

socket.on('buy-color-success', (data) => {
    snakeColor = data.color;
    let cost = 30;
    if (data.color === 'gradient-yellow-orange' || data.color === 'gradient-cyan-blue') {
        cost = 200;
    }
    applesEaten -= cost;
    updateApplesCounter();
    alert('Color purchased successfully!');
    updateShopButtons(data.ownedColors);
});

socket.on('buy-color-fail', (message) => {
    alert(message);
});

socket.on('use-color-success', (data) => {
    snakeColor = data.color;
    alert('Color changed successfully!');
});

socket.on('use-color-fail', (message) => {
    alert(message);
});

chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const message = chatInput.value.trim();
        if (message) {
            socket.emit('chat-message', message);
            chatInput.value = '';
        }
    }
});

socket.on('chat-message', (data) => {
    addChatMessage(data.username, data.message);
});

function addChatMessage(username, message) {
    const messageDiv = document.createElement('div');
    let displayUsername = username;
    if (username === 'mafes') {
        displayUsername = '⭐mafes [MOD]';
    }
    if (username === 'mafes') {
        messageDiv.style.color = '#FFFF00';
    }
    messageDiv.textContent = `${displayUsername}: ${message}`;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    while (chatMessages.children.length > 10) {
        chatMessages.removeChild(chatMessages.firstChild);
    }
}

function updateApplesCounter() {
    applesCounter.textContent = `Apples: ${applesEaten}`;
}

function darkenColor(hex, percent = 0.2) {
    hex = hex.replace(/^#/, '');
    let r = parseInt(hex.substr(0, 2), 16);
    let g = parseInt(hex.substr(2, 2), 16);
    let b = parseInt(hex.substr(4, 2), 16);
    r = Math.floor(r * (1 - percent));
    g = Math.floor(g * (1 - percent));
    b = Math.floor(b * (1 - percent));
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function updateShopButtons(ownedColors) {
    document.querySelectorAll('.shop-item').forEach(item => {
        const color = item.querySelector('.buy-btn').getAttribute('data-color');
        const btn = item.querySelector('.buy-btn');
        const square = item.querySelector('.color-square');
        const priceSpan = item.querySelector('.price');
        if (ownedColors.includes(color)) {
            btn.textContent = 'Use';
            square.classList.remove('locked');
            square.classList.add('owned');
            priceSpan.textContent = 'Purchased';
        } else {
            btn.textContent = 'Buy';
            square.classList.add('locked');
            square.classList.remove('owned');
            if (color === 'gradient-yellow-orange' || color === 'gradient-cyan-blue') {
                priceSpan.textContent = '200 Apples';
            } else {
                priceSpan.textContent = '30 Apples';
            }
        }
    });
}

function draw() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    for (let i = 0; i <= tileCount; i++) {
        ctx.beginPath();
        ctx.moveTo(i * gridSize, 0);
        ctx.lineTo(i * gridSize, canvas.height);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * gridSize);
        ctx.lineTo(canvas.width, i * gridSize);
        ctx.stroke();
    }

    apples.forEach(apple => {
        let color = appleColor;
        if (apple.type === 'speed') color = '#FFFFFF';
        else if (apple.type === 'double') color = '#FFA500';
        else if (apple.type === 'invincible') color = '#FF69B4';
        ctx.fillStyle = color;
        ctx.fillRect(apple.x * gridSize, apple.y * gridSize, gridSize, gridSize);
    });

    for (let id in snakes) {
        const snake = snakes[id];
        if (id === myId) {
            if (snakeColor.startsWith('gradient-')) {
                const gradient = ctx.createLinearGradient(0, 0, gridSize, gridSize);
                if (snakeColor === 'gradient-yellow-orange') {
                    gradient.addColorStop(0, '#FFFF99');
                    gradient.addColorStop(1, '#FFA500');
                } else if (snakeColor === 'gradient-cyan-blue') {
                    gradient.addColorStop(0, '#00FFFF');
                    gradient.addColorStop(1, '#0000FF');
                }
                ctx.fillStyle = gradient;
            } else {
                ctx.fillStyle = snakeColor;
            }
        } else {
            const playerColor = playerColors[id];
            if (playerColor && playerColor !== '#00FF00') {
                if (playerColor.startsWith('gradient-')) {
                    if (playerColor === 'gradient-yellow-orange') {
                        ctx.fillStyle = darkenColor('#FFFF99');
                    } else if (playerColor === 'gradient-cyan-blue') {
                        ctx.fillStyle = darkenColor('#00FFFF');
                    } else {
                        ctx.fillStyle = darkenColor('#FFFF99');
                    }
                } else {
                    ctx.fillStyle = darkenColor(playerColor);
                }
            } else {
                ctx.fillStyle = '#006400';
            }
        }

        if (snake.invincible > 0) {
            ctx.strokeStyle = '#FF69B4';
            ctx.lineWidth = 2;
            snake.body.forEach(segment => {
                ctx.strokeRect(segment.x * gridSize, segment.y * gridSize, gridSize, gridSize);
            });
        }

        snake.body.forEach(segment => {
            ctx.fillRect(segment.x * gridSize, segment.y * gridSize, gridSize, gridSize);
        });

        if (snake.body.length > 0) {
            const head = snake.body[0];
            let username = usernames[id] || 'Guest';
            if (username === 'mafes') {
                username = '⭐mafes';
            }
            ctx.fillStyle = '#FFF';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(username, head.x * gridSize + gridSize / 2, head.y * gridSize - 5);
        }
    }
}

function checkGameOver() {
    if (myId && snakes[myId] && !snakes[myId].alive) {
        gameOverDiv.style.display = 'block';
    } else {
        gameOverDiv.style.display = 'none';
    }
}
