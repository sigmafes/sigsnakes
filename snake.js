// Verificar si hay sesión guardada
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
const tileCount = canvas.width / gridSize; // Ahora 30x30 con canvas 600x600

// Colores
const appleColor = '#FF0000'; // Rojo

// Estado del juego
let snakes = {};
let apple = { x: 15, y: 15 }; // Centrado en el mapa más grande
let myId = null;
let paused = false;
let applesEaten = 0;
let loggedInUser = null;
let snakeColor = '#00FF00'; // Color por defecto verde claro
let usernames = {};
let playerColors = {};

// Conectar a Socket.IO
const socket = io();

// Auto-login si hay sesión guardada
if (savedUsername) {
    socket.on('connect', () => {
        // Intentar login automático con credenciales guardadas
        socket.emit('auto-login', { username: savedUsername, apples: savedApples });
    });
}

// Tienda
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
            if (applesEaten >= 30) {
                socket.emit('buy-color', { color });
            } else {
                alert('Not enough apples. You need 30 apples to buy a color.');
            }
        }
    });
});

// Login/Register
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
    // Limpiar localStorage
    localStorage.removeItem('username');
    localStorage.removeItem('apples');
    socket.emit('logout');
});

// Controles
document.addEventListener('keydown', (e) => {
    // Prevent game controls when typing in inputs
    if (e.target.tagName === 'INPUT') return;

    if (e.key === ' ') {
        // Pausa
        paused = !paused;
        pauseDiv.style.display = paused ? 'block' : 'none';
        socket.emit('pause', paused);
        e.preventDefault();
        return;
    }

    if (e.key === 'Enter') {
        // Revivir
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
        e.preventDefault(); // Prevenir scroll de página
    }
});

// Eventos de Socket.IO
socket.on('init', (data) => {
    snakes = data.snakes;
    apple = data.apple;
    myId = data.yourId;
    if (data.applesEaten !== undefined) {
        applesEaten = data.applesEaten;
        updateApplesCounter();
    }
    draw();
});

socket.on('update', (data) => {
    snakes = data.snakes;
    apple = data.apple;
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
    // Guardar sesión en localStorage
    localStorage.setItem('username', data.username);
    localStorage.setItem('apples', data.apples);
    updateShopButtons(data.ownedColors || []);
});

socket.on('auto-login-success', (data) => {
    loggedInUser = data.username;
    applesEaten = data.apples;
    updateApplesCounter();
    loginSection.style.display = 'none';
    welcomeSection.style.display = 'flex';
    welcomeMessage.textContent = `Bienvenido ${data.username}`;
    updateShopButtons(data.ownedColors || []);
});

socket.on('auto-login-fail', () => {
    // Limpiar localStorage si auto-login falló
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
    applesEaten -= 30;
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

// Chat functionality
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
    messageDiv.textContent = `${username}: ${message}`;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Keep only last 10 messages
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
            priceSpan.textContent = '30 Apples';
        }
    });
}

function draw() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Dibujar líneas grises para las cuadrículas
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

    // Dibujar manzana
    ctx.fillStyle = appleColor;
    ctx.fillRect(apple.x * gridSize, apple.y * gridSize, gridSize, gridSize);

    // Dibujar serpientes
    for (let id in snakes) {
        const snake = snakes[id];
        // El jugador local usa su color comprado, los demás usan su color o verde oscuro si no tienen
        if (id === myId) {
            ctx.fillStyle = snakeColor; // Color personalizado para el jugador local
        } else {
            const playerColor = playerColors[id];
            if (playerColor && playerColor !== '#00FF00') { // Si tiene un color comprado diferente al default
                ctx.fillStyle = darkenColor(playerColor); // Oscurecer el color para diferenciar
            } else {
                ctx.fillStyle = '#006400'; // Verde oscuro para otros jugadores sin color comprado
            }
        }
        snake.body.forEach(segment => {
            ctx.fillRect(segment.x * gridSize, segment.y * gridSize, gridSize, gridSize);
        });

        // Dibujar nombre de usuario encima de la cabeza
        if (snake.body.length > 0) {
            const head = snake.body[0];
            const username = usernames[id] || 'Guest';
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
