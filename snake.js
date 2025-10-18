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

// Conectar a Socket.IO
const socket = io();

// Auto-login si hay sesión guardada
if (savedUsername) {
    socket.on('connect', () => {
        // Intentar login automático con credenciales guardadas
        socket.emit('auto-login', { username: savedUsername, apples: savedApples });
    });
}

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
});

socket.on('auto-login-success', (data) => {
    loggedInUser = data.username;
    applesEaten = data.apples;
    updateApplesCounter();
    loginSection.style.display = 'none';
    welcomeSection.style.display = 'flex';
    welcomeMessage.textContent = `Bienvenido ${data.username}`;
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

function updateApplesCounter() {
    applesCounter.textContent = `Apples: ${applesEaten}`;
}

function draw() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Dibujar manzana
    ctx.fillStyle = appleColor;
    ctx.fillRect(apple.x * gridSize, apple.y * gridSize, gridSize, gridSize);

    // Dibujar serpientes
    for (let id in snakes) {
        const snake = snakes[id];
        // El jugador local se ve verde claro, los demás verde oscuro
        if (id === myId) {
            ctx.fillStyle = '#00FF00'; // Verde claro para el jugador local
        } else {
            ctx.fillStyle = '#006400'; // Verde oscuro para otros jugadores
        }
        snake.body.forEach(segment => {
            ctx.fillRect(segment.x * gridSize, segment.y * gridSize, gridSize, gridSize);
        });
    }
}

function checkGameOver() {
    if (myId && snakes[myId] && !snakes[myId].alive) {
        gameOverDiv.style.display = 'block';
    } else {
        gameOverDiv.style.display = 'none';
    }
}
