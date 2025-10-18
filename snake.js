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
let snakeShape = 'square'; // default shape
let usernames = {};
let playerColors = {};
let playerShapes = {};
let ownedColors = [];
let ownedShapes = [];
let animationTime = 0;
let leaderboard = [];
let currentTop1 = null;

const socket = io();

if (savedUsername) {
    socket.on('connect', () => {
        socket.emit('auto-login', { username: savedUsername, apples: savedApples });
    });
}

document.querySelectorAll('.buy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if (!loggedInUser) {
            alert('You must be logged in to buy colors or shapes.');
            return;
        }
        const color = btn.getAttribute('data-color');
        const shape = btn.getAttribute('data-shape');
        let cost = 30;
        if (color) {
            if (color === 'gradient-yellow-orange' || color === 'gradient-cyan-blue' || color === 'gradient-white-gray') {
                cost = 200;
            } else if (color === 'breathing-red' || color === 'breathing-purple' || color === 'rgb') {
                cost = 300;
            }
            if (applesEaten >= cost) {
                socket.emit('buy-color', { color });
            } else {
                alert(`Not enough apples. You need ${cost} apples to buy this color.`);
            }
        } else if (shape) {
            cost = 50;
            if (shape === 'square') {
                cost = 0;
            } else if (shape === 'round') {
                cost = 500;
            } else if (shape === 'circle' || shape === 'triangle') {
                cost = 100;
            } else if (shape === 'star' || shape === 'diamond') {
                cost = 150;
            }
            if (applesEaten >= cost) {
                socket.emit('buy-shape', { shape });
            } else {
                alert(`Not enough apples. You need ${cost} apples to buy this shape.`);
            }
        }
    });
});

document.querySelectorAll('.use-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if (!loggedInUser) {
            alert('You must be logged in to use colors or shapes.');
            return;
        }
        const color = btn.getAttribute('data-color');
        const shape = btn.getAttribute('data-shape');
        if (color) {
            socket.emit('use-color', { color });
        } else if (shape) {
            socket.emit('use-shape', { shape });
        }
    });
});

const secretColorDiv = document.getElementById('secret-color');
const secretUseBtn = secretColorDiv.querySelector('.use-btn');
secretUseBtn.addEventListener('click', () => {
    if (!loggedInUser) {
        alert('You must be logged in to use colors or shapes.');
        return;
    }
    socket.emit('use-color', { color: 'sigmafes' });
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

usernameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        loginBtn.click();
    }
});

passwordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        loginBtn.click();
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
    if (data.playerShapes) {
        playerShapes = data.playerShapes;
    }
    draw();
    checkGameOver();
});

socket.on('update-apples', (data) => {
    applesEaten = data.apples;
    updateApplesCounter();
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
    ownedColors = data.ownedColors || [];
    ownedShapes = data.ownedShapes || [];
    updateShopButtons(ownedColors, ownedShapes);
    if (data.color) {
        snakeColor = data.color;
    }
    if (data.shape) {
        snakeShape = data.shape;
    }
});

socket.on('auto-login-success', (data) => {
    loggedInUser = data.username;
    applesEaten = data.apples;
    updateApplesCounter();
    loginSection.style.display = 'none';
    welcomeSection.style.display = 'flex';
    welcomeMessage.textContent = `Bienvenido ${data.username}`;
    ownedColors = data.ownedColors || [];
    ownedShapes = data.ownedShapes || [];
    updateShopButtons(ownedColors, ownedShapes);
    if (data.color) {
        snakeColor = data.color;
    }
    if (data.shape) {
        snakeShape = data.shape;
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
    ownedColors = data.ownedColors || ownedColors;
    alert('Color purchased successfully!');
    updateShopButtons(ownedColors, ownedShapes);
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

socket.on('buy-shape-success', (data) => {
    snakeShape = data.shape;
    ownedShapes = data.ownedShapes || ownedShapes;
    alert('Shape purchased successfully!');
    updateShopButtons(ownedColors, ownedShapes);
});

socket.on('buy-shape-fail', (message) => {
    alert(message);
});

socket.on('use-shape-success', (data) => {
    snakeShape = data.shape;
    alert('Shape changed successfully!');
});

socket.on('use-shape-fail', (message) => {
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

socket.on('show-secret-color', () => {
    secretColorDiv.style.display = 'block';
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
    if (username === 'Server') {
        messageDiv.style.color = '#00FFFF';
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

function hexToRgb(hex) {
    let result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

function rgbToHex(r, g, b) {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function interpolateColor(color1, color2, ratio) {
    let c1 = hexToRgb(color1);
    let c2 = hexToRgb(color2);
    let r = Math.round(c1.r + (c2.r - c1.r) * ratio);
    let g = Math.round(c1.g + (c2.g - c1.g) * ratio);
    let b = Math.round(c1.b + (c2.b - c1.b) * ratio);
    return rgbToHex(r, g, b);
}

function updateShopButtons(ownedColors, ownedShapes) {
    document.querySelectorAll('.shop-item').forEach(item => {
        const color = item.querySelector('.buy-btn').getAttribute('data-color');
        const shape = item.querySelector('.buy-btn').getAttribute('data-shape');
        const buyBtn = item.querySelector('.buy-btn');
        const useBtn = item.querySelector('.use-btn');
        const square = item.querySelector('.color-square');
        const priceSpan = item.querySelector('.price');
        if (color) {
            if (ownedColors.includes(color)) {
                useBtn.style.display = 'inline-block';
                buyBtn.style.display = 'none';
                square.classList.remove('locked');
                square.classList.add('owned');
                priceSpan.textContent = 'Purchased';
            } else {
                useBtn.style.display = 'none';
                buyBtn.style.display = 'inline-block';
                square.classList.add('locked');
                square.classList.remove('owned');
                if (color === 'gradient-yellow-orange' || color === 'gradient-cyan-blue' || color === 'gradient-white-gray') {
                    priceSpan.textContent = '200 Apples';
                } else if (color === 'breathing-red' || color === 'breathing-purple' || color === 'rgb') {
                    priceSpan.textContent = '300 Apples';
                } else {
                    priceSpan.textContent = '30 Apples';
                }
            }
        } else if (shape) {
            if (ownedShapes.includes(shape)) {
                useBtn.style.display = 'inline-block';
                buyBtn.style.display = 'none';
                square.classList.remove('locked');
                square.classList.add('owned');
                priceSpan.textContent = 'Purchased';
            } else {
                useBtn.style.display = 'none';
                buyBtn.style.display = 'inline-block';
                square.classList.add('locked');
                square.classList.remove('owned');
                if (shape === 'circle' || shape === 'triangle') {
                    priceSpan.textContent = '100 Apples';
                } else if (shape === 'star' || shape === 'diamond') {
                    priceSpan.textContent = '150 Apples';
                } else {
                    priceSpan.textContent = '50 Apples';
                }
            }
        }
    });
}

function draw() {
    animationTime += 0.016; // Approximate 60 FPS

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
        if (apple.type === 'double') color = '#FFA500';
        else if (apple.type === 'speed') color = '#FFFF00';
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(apple.x * gridSize + gridSize / 2, apple.y * gridSize + gridSize / 2, gridSize / 2, 0, 2 * Math.PI);
        ctx.fill();
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
                } else if (snakeColor === 'gradient-white-gray') {
                    gradient.addColorStop(0, '#FFFFFF');
                    gradient.addColorStop(1, '#808080');
                }
                ctx.fillStyle = gradient;
            } else if (snakeColor === 'breathing-red') {
                const intensity = (Math.sin(animationTime * 2 * Math.PI) + 1) / 2;
                ctx.fillStyle = interpolateColor('#000000', '#FF0000', intensity);
            } else if (snakeColor === 'breathing-purple') {
                const intensity = (Math.sin(animationTime * 2 * Math.PI) + 1) / 2;
                ctx.fillStyle = interpolateColor('#000000', '#800080', intensity);
            } else if (snakeColor === 'rgb') {
                const hue = (animationTime * 360) % 360;
                ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
            } else if (snakeColor === 'sigmafes') {
                let ratio = index / (snake.body.length - 1);
                let color;
                if (ratio < 0.5) {
                    color = interpolateColor('#FFFF00', '#8B0000', ratio * 2);
                } else {
                    color = interpolateColor('#8B0000', '#0000FF', (ratio - 0.5) * 2);
                }
                ctx.fillStyle = color;
            } else {
                ctx.fillStyle = snakeColor;
            }
        } else {
            const playerColor = playerColors[id];
            if (playerColor && playerColor !== '#00FF00') {
                if (playerColor.startsWith('gradient-')) {
                    // Gradient will be applied per segment below
                } else if (playerColor === 'breathing-red') {
                    const intensity = (Math.sin(animationTime * 2 * Math.PI) + 1) / 2;
                    ctx.fillStyle = interpolateColor('#000000', '#FF0000', intensity);
                } else if (playerColor === 'breathing-purple') {
                    const intensity = (Math.sin(animationTime * 2 * Math.PI) + 1) / 2;
                    ctx.fillStyle = interpolateColor('#000000', '#800080', intensity);
                } else if (playerColor === 'rgb') {
                    const hue = (animationTime * 360) % 360;
                    ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
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

        snake.body.forEach((segment, index) => {
            if (id === myId && snakeColor.startsWith('gradient-')) {
                let color1, color2;
                if (snakeColor === 'gradient-yellow-orange') {
                    color1 = '#FFFF99'; // head yellow
                    color2 = '#FFA500'; // tail orange
                } else if (snakeColor === 'gradient-cyan-blue') {
                    color1 = '#00FFFF'; // head cyan
                    color2 = '#0000FF'; // tail blue
                } else if (snakeColor === 'gradient-white-gray') {
                    color1 = '#FFFFFF'; // head white
                    color2 = '#808080'; // tail gray
                }
                let ratio = index / (snake.body.length - 1);
                ctx.fillStyle = interpolateColor(color1, color2, ratio);
            } else if (id !== myId && playerColors[id] && playerColors[id].startsWith('gradient-')) {
                const playerColor = playerColors[id];
                let color1, color2;
                if (playerColor === 'gradient-yellow-orange') {
                    color1 = darkenColor('#FFFF99'); // head yellow darkened
                    color2 = darkenColor('#FFA500'); // tail orange darkened
                } else if (playerColor === 'gradient-cyan-blue') {
                    color1 = darkenColor('#00FFFF'); // head cyan darkened
                    color2 = darkenColor('#0000FF'); // tail blue darkened
                } else if (playerColor === 'gradient-white-gray') {
                    color1 = darkenColor('#FFFFFF'); // head white darkened
                    color2 = darkenColor('#808080'); // tail gray darkened
                }
                let ratio = index / (snake.body.length - 1);
                ctx.fillStyle = interpolateColor(color1, color2, ratio);
            } else if (id === myId && snakeColor === 'breathing-red') {
                const intensity = (Math.sin(animationTime * 2 * Math.PI) + 1) / 2;
                ctx.fillStyle = interpolateColor('#000000', '#FF0000', intensity);
            } else if (id === myId && snakeColor === 'breathing-purple') {
                const intensity = (Math.sin(animationTime * 2 * Math.PI) + 1) / 2;
                ctx.fillStyle = interpolateColor('#000000', '#800080', intensity);
            } else if (id === myId && snakeColor === 'rgb') {
                const hue = (animationTime * 360) % 360;
                ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
            } else if (id !== myId && playerColors[id] === 'breathing-red') {
                const intensity = (Math.sin(animationTime * 2 * Math.PI) + 1) / 2;
                ctx.fillStyle = interpolateColor('#000000', '#FF0000', intensity);
            } else if (id !== myId && playerColors[id] === 'breathing-purple') {
                const intensity = (Math.sin(animationTime * 2 * Math.PI) + 1) / 2;
                ctx.fillStyle = interpolateColor('#000000', '#800080', intensity);
            } else if (id !== myId && playerColors[id] === 'rgb') {
                const hue = (animationTime * 360) % 360;
                ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
            } else if (id !== myId && playerColors[id] === 'sigmafes') {
                let ratio = index / (snake.body.length - 1);
                let color;
                if (ratio < 0.5) {
                    color = interpolateColor(darkenColor('#FFFF00'), darkenColor('#8B0000'), ratio * 2);
                } else {
                    color = interpolateColor(darkenColor('#8B0000'), darkenColor('#0000FF'), (ratio - 0.5) * 2);
                }
                ctx.fillStyle = color;
            }
            const shape = (id === myId) ? snakeShape : (playerShapes[id] || 'square');
            if (shape === 'round') {
                ctx.beginPath();
                ctx.arc(segment.x * gridSize + gridSize / 2, segment.y * gridSize + gridSize / 2, gridSize / 2, 0, 2 * Math.PI);
                ctx.fill();
            } else {
                ctx.fillRect(segment.x * gridSize, segment.y * gridSize, gridSize, gridSize);
            }
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
