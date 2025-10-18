const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs').promises;
const bcrypt = require('bcrypt');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;
const USERS_FILE = 'users.json';

app.use(express.static('.'));

let snakes = {};
let apples = [];
const gridSize = 20;
const tileCount = 30;
const maxPlayers = 16;
const maxApples = 3;

let connectedUsers = {};

async function loadUsers() {
    try {
        const data = await fs.readFile(USERS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        return [];
    }
}

async function saveUsers(users) {
    await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2));
}

function generateApple() {
    const rand = Math.random();
    let type = 'normal';
    if (rand < 0.2) type = 'speed';
    else if (rand < 0.5) type = 'double';

    const newApple = {
        x: Math.floor(Math.random() * tileCount),
        y: Math.floor(Math.random() * tileCount),
        type: type
    };

    for (let id in snakes) {
        if (snakes[id].alive) {
            for (let segment of snakes[id].body) {
                if (segment.x === newApple.x && segment.y === newApple.y) {
                    generateApple();
                    return;
                }
            }
        }
    }

    apples.push(newApple);
}

function initApples() {
    while (apples.length < maxApples) {
        generateApple();
    }
}

io.on('connection', (socket) => {
    console.log('\x1b[36m%s\x1b[0m', 'Guest se ha conectado.');
    io.emit('chat-message', { username: 'Server', message: 'Guest se ha conectado.' });

    if (Object.keys(snakes).length >= maxPlayers) {
        socket.emit('server-full', 'Servidor lleno, máximo 16 jugadores.');
        socket.disconnect();
        return;
    }

    const playerCount = Object.keys(snakes).length;
    const color = playerCount === 0 ? '#00FF00' : '#006400';

    snakes[socket.id] = {
        body: [{ x: Math.floor(Math.random() * tileCount), y: Math.floor(Math.random() * tileCount) }],
        direction: { x: 0, y: 0 },
        color: color,
        alive: true,
        paused: false,
        applesEaten: 0,
        speedBoost: 0,
        invincible: 0,
        speedFactor: 1,
        moveAccumulator: 0
    };

    const usernames = {};
    const playerColors = {};
    const playerShapes = {};
    for (let id in snakes) {
        usernames[id] = connectedUsers[id] ? connectedUsers[id].username : 'Guest';
        playerColors[id] = connectedUsers[id] ? connectedUsers[id].color : '#006400';
        playerShapes[id] = connectedUsers[id] ? connectedUsers[id].shape : 'square';
    }
    socket.emit('init', { snakes, apples, yourId: socket.id, applesEaten: 0, usernames, playerColors, playerShapes });

    socket.on('login', async (data) => {
        const { username, password } = data;
        const users = await loadUsers();
        const user = users.find(u => u.username === username);

        if (user && await bcrypt.compare(password, user.password)) {
            connectedUsers[socket.id] = { username, apples: user.apples || 0, color: user.color || '#00FF00', ownedColors: user.ownedColors || [], shape: user.shape || 'square', ownedShapes: user.ownedShapes || [] };
            snakes[socket.id].applesEaten = user.apples || 0;
            snakes[socket.id].color = user.color || '#00FF00'; // Update snake color
            socket.emit('login-success', { username, apples: user.apples || 0, ownedColors: user.ownedColors || [], color: user.color || '#00FF00', shape: user.shape || 'square', ownedShapes: user.ownedShapes || [] });
            // Immediate update to show username change to all players
            const usernames = {};
            const playerColors = {};
            const playerShapes = {};
            for (let id in snakes) {
                usernames[id] = connectedUsers[id] ? connectedUsers[id].username : 'Guest';
                playerColors[id] = connectedUsers[id] ? connectedUsers[id].color : '#006400';
                playerShapes[id] = connectedUsers[id] ? connectedUsers[id].shape : 'square';
            }
            io.emit('update', { snakes, apples, usernames, playerColors, playerShapes });
            io.emit('chat-message', { username: 'Server', message: `${username} se ha logueado.` });
        } else {
            socket.emit('login-fail', 'Usuario o contraseña incorrectos');
        }
    });

    socket.on('auto-login', async (data) => {
        const { username, apples } = data;
        const users = await loadUsers();
        const user = users.find(u => u.username === username);

        if (user && user.apples === apples) {
            connectedUsers[socket.id] = { username, apples: user.apples || 0, color: user.color || '#00FF00', ownedColors: user.ownedColors || [], shape: user.shape || 'square', ownedShapes: user.ownedShapes || [] };
            snakes[socket.id].applesEaten = user.apples || 0;
            snakes[socket.id].color = user.color || '#00FF00';
            socket.emit('auto-login-success', { username, apples: user.apples || 0, ownedColors: user.ownedColors || [], color: user.color || '#00FF00', shape: user.shape || 'square', ownedShapes: user.ownedShapes || [] });
            socket.emit('init', { snakes, apples, yourId: socket.id, applesEaten: user.apples || 0 });
            // Immediate update to show username and color change to all players
            const usernames = {};
            const playerColors = {};
            const playerShapes = {};
            for (let id in snakes) {
                usernames[id] = connectedUsers[id] ? connectedUsers[id].username : 'Guest';
                playerColors[id] = connectedUsers[id] ? connectedUsers[id].color : '#006400';
                playerShapes[id] = connectedUsers[id] ? connectedUsers[id].shape : 'square';
            }
            io.emit('update', { snakes, apples, usernames, playerColors, playerShapes });
        } else {
            socket.emit('auto-login-fail');
        }
    });

    socket.on('register', async (data) => {
        const { username, password } = data;
        const users = await loadUsers();
        const existingUser = users.find(u => u.username === username);

        if (existingUser) {
            socket.emit('register-fail', 'Usuario ya existe');
            return;
        }

        if (!/^[a-zA-Z0-9]+$/.test(username) || username.length > 16) {
            socket.emit('register-fail', 'El nombre de usuario debe contener solo letras y números, y tener un máximo de 16 caracteres.');
            return;
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        users.push({ username, password: hashedPassword, apples: 0, ownedColors: [], ownedShapes: [] });
        await saveUsers(users);
        socket.emit('register-success');
    });

    socket.on('save-progress', async () => {
        if (connectedUsers[socket.id]) {
            const { username } = connectedUsers[socket.id];
            const users = await loadUsers();
            const userIndex = users.findIndex(u => u.username === username);
            if (userIndex !== -1) {
                users[userIndex].apples = snakes[socket.id].applesEaten;
                users[userIndex].color = connectedUsers[socket.id].color || '#00FF00';
                users[userIndex].shape = connectedUsers[socket.id].shape || 'square';
                await saveUsers(users);
                socket.emit('save-success');
            }
        }
    });

    socket.on('buy-color', async (data) => {
        let cost = 30;
        if (data.color === 'gradient-yellow-orange' || data.color === 'gradient-cyan-blue' || data.color === 'gradient-white-gray') {
            cost = 200;
        } else if (data.color === 'breathing-red' || data.color === 'breathing-purple' || data.color === 'rgb') {
            cost = 300;
        }
        if (connectedUsers[socket.id] && connectedUsers[socket.id].apples >= cost) {
            const { username } = connectedUsers[socket.id];
            const users = await loadUsers();
            const userIndex = users.findIndex(u => u.username === username);
            if (userIndex !== -1) {
                if (!users[userIndex].ownedColors) users[userIndex].ownedColors = [];
                if (!users[userIndex].ownedColors.includes(data.color)) {
                    users[userIndex].ownedColors.push(data.color);
                    users[userIndex].apples -= cost;
                    connectedUsers[socket.id].apples -= cost;
                    connectedUsers[socket.id].ownedColors = users[userIndex].ownedColors;
                    snakes[socket.id].applesEaten = connectedUsers[socket.id].apples;
                    await saveUsers(users);
                    socket.emit('buy-color-success', { color: data.color, ownedColors: users[userIndex].ownedColors });
                    socket.emit('update-apples', { apples: connectedUsers[socket.id].apples });
                } else {
                    socket.emit('buy-color-fail', 'Color already owned.');
                }
            }
        } else {
            socket.emit('buy-color-fail', 'Not enough apples or not logged in.');
        }
    });

    socket.on('buy-shape', async (data) => {
        let cost = 50;
        if (data.shape === 'square') {
            cost = 0;
        } else if (data.shape === 'round') {
            cost = 500;
        } else if (data.shape === 'circle' || data.shape === 'triangle') {
            cost = 100;
        } else if (data.shape === 'star' || data.shape === 'diamond') {
            cost = 150;
        }
        if (connectedUsers[socket.id] && connectedUsers[socket.id].apples >= cost) {
            const { username } = connectedUsers[socket.id];
            const users = await loadUsers();
            const userIndex = users.findIndex(u => u.username === username);
            if (userIndex !== -1) {
                if (!users[userIndex].ownedShapes) users[userIndex].ownedShapes = [];
                if (!users[userIndex].ownedShapes.includes(data.shape)) {
                    users[userIndex].ownedShapes.push(data.shape);
                    users[userIndex].apples -= cost;
                    connectedUsers[socket.id].apples -= cost;
                    connectedUsers[socket.id].ownedShapes = users[userIndex].ownedShapes;
                    snakes[socket.id].applesEaten = connectedUsers[socket.id].apples;
                    await saveUsers(users);
                    socket.emit('buy-shape-success', { shape: data.shape, ownedShapes: users[userIndex].ownedShapes });
                    socket.emit('update-apples', { apples: connectedUsers[socket.id].apples });
                } else {
                    socket.emit('buy-shape-fail', 'Shape already owned.');
                }
            }
        } else {
            socket.emit('buy-shape-fail', 'Not enough apples or not logged in.');
        }
    });

    socket.on('use-color', async (data) => {
        if (connectedUsers[socket.id] && connectedUsers[socket.id].ownedColors && connectedUsers[socket.id].ownedColors.includes(data.color)) {
            connectedUsers[socket.id].color = data.color;
            socket.emit('use-color-success', { color: data.color });
            // Update all clients immediately with the new color
            const usernames = {};
            const playerColors = {};
            const playerShapes = {};
            for (let id in snakes) {
                usernames[id] = connectedUsers[id] ? connectedUsers[id].username : 'Guest';
                playerColors[id] = connectedUsers[id] ? connectedUsers[id].color : '#006400';
                playerShapes[id] = connectedUsers[id] ? connectedUsers[id].shape : 'square';
            }
            io.emit('update', { snakes, apples, usernames, playerColors, playerShapes });
        } else {
            socket.emit('use-color-fail', 'Color not owned.');
        }
    });

    socket.on('use-shape', async (data) => {
        if (connectedUsers[socket.id] && connectedUsers[socket.id].ownedShapes && connectedUsers[socket.id].ownedShapes.includes(data.shape)) {
            connectedUsers[socket.id].shape = data.shape;
            socket.emit('use-shape-success', { shape: data.shape });
        } else {
            socket.emit('use-shape-fail', 'Shape not owned.');
        }
    });

    socket.on('logout', () => {
        if (connectedUsers[socket.id]) {
            delete connectedUsers[socket.id];
        }
    });

    socket.on('direction', (dir) => {
        if (snakes[socket.id] && snakes[socket.id].alive && !snakes[socket.id].paused) {
            if ((dir.x !== 0 && snakes[socket.id].direction.x === -dir.x) ||
                (dir.y !== 0 && snakes[socket.id].direction.y === -dir.y)) return;
            const currentHead = snakes[socket.id].body[0];
            const nextHead = { x: currentHead.x + dir.x, y: currentHead.y + dir.y };
            for (let i = 1; i < snakes[socket.id].body.length; i++) {
                if (nextHead.x === snakes[socket.id].body[i].x && nextHead.y === snakes[socket.id].body[i].y) {
                    return;
                }
            }
            snakes[socket.id].direction = dir;
        }
    });

    socket.on('pause', (isPaused) => {
        if (snakes[socket.id]) {
            snakes[socket.id].paused = isPaused;
            socket.emit('paused', isPaused);
        }
    });

    socket.on('revive', () => {
        if (snakes[socket.id] && !snakes[socket.id].alive) {
            snakes[socket.id] = {
                body: [{ x: Math.floor(Math.random() * tileCount), y: Math.floor(Math.random() * tileCount) }],
                direction: { x: 0, y: 0 },
                color: snakes[socket.id].color,
                alive: true,
                paused: false,
                applesEaten: snakes[socket.id].applesEaten,
                speedBoost: 0,
                invincible: 0,
                speedFactor: 1,
                moveCounter: 0,
                speedBoostTimer: 0
            };
            io.emit('update', { snakes, apples });
        }
    });

    socket.on('chat-message', async (message) => {
        if (connectedUsers[socket.id]) {
            let username = connectedUsers[socket.id].username;
            if (username === 'mafes' && message.startsWith('!')) {
                const parts = message.split(' ');
                const cmd = parts[0];
                const num = parseInt(parts[1]);
                if (isNaN(num)) return;
                if (cmd === '!add') {
                    connectedUsers[socket.id].apples += num;
                    snakes[socket.id].applesEaten = connectedUsers[socket.id].apples;
                    const users = await loadUsers();
                    const userIndex = users.findIndex(u => u.username === username);
                    if (userIndex !== -1) {
                        users[userIndex].apples = connectedUsers[socket.id].apples;
                        await saveUsers(users);
                    }
                    socket.emit('update-apples', { apples: connectedUsers[socket.id].apples });
            } else if (cmd === '!remove') {
                    connectedUsers[socket.id].apples -= num;
                    if (connectedUsers[socket.id].apples < 0) connectedUsers[socket.id].apples = 0;
                    snakes[socket.id].applesEaten = connectedUsers[socket.id].apples;
                    const users = await loadUsers();
                    const userIndex = users.findIndex(u => u.username === username);
                    if (userIndex !== -1) {
                        users[userIndex].apples = connectedUsers[socket.id].apples;
                        await saveUsers(users);
                    }
                    socket.emit('update-apples', { apples: connectedUsers[socket.id].apples });
                } else if (cmd === '!say') {
                    const sayMessage = parts.slice(1).join(' ');
                    if (sayMessage) {
                        io.emit('chat-message', { username: 'Server', message: sayMessage });
                    }
                } else if (cmd === '!sigmafes') {
                    connectedUsers[socket.id].color = 'sigmafes';
                    snakes[socket.id].color = 'sigmafes';
                    if (!connectedUsers[socket.id].ownedColors.includes('sigmafes')) {
                        connectedUsers[socket.id].ownedColors.push('sigmafes');
                        const users = await loadUsers();
                        const userIndex = users.findIndex(u => u.username === username);
                        if (userIndex !== -1) {
                            users[userIndex].ownedColors = connectedUsers[socket.id].ownedColors;
                            await saveUsers(users);
                        }
                    }
                    socket.emit('use-color-success', { color: 'sigmafes' });
                    socket.emit('chat-message', { username: 'Server', message: 'La skin ha sido aplicada con éxito.' });
                    socket.emit('show-secret-color');
                    // Update all clients immediately with the new color
                    const usernames = {};
                    const playerColors = {};
                    const playerShapes = {};
                    for (let id in snakes) {
                        usernames[id] = connectedUsers[id] ? connectedUsers[id].username : 'Guest';
                        playerColors[id] = connectedUsers[id] ? connectedUsers[id].color : '#006400';
                        playerShapes[id] = connectedUsers[id] ? connectedUsers[id].shape : 'square';
                    }
                    io.emit('update', { snakes, apples, usernames, playerColors, playerShapes });
                }
            } else {
                io.emit('chat-message', { username, message });
            }
        }
    });

    socket.on('disconnect', async () => {
        console.log('\x1b[31m%s\x1b[0m', 'Guest se ha desconectado.');
        const username = connectedUsers[socket.id] ? connectedUsers[socket.id].username : 'Guest';
        io.emit('chat-message', { username: 'Server', message: `${username} se ha desconectado.` });
        if (connectedUsers[socket.id]) {
            const { username } = connectedUsers[socket.id];
            const users = await loadUsers();
            const userIndex = users.findIndex(u => u.username === username);
            if (userIndex !== -1) {
                users[userIndex].apples = snakes[socket.id].applesEaten;
                await saveUsers(users);
            }
            delete connectedUsers[socket.id];
        }
        delete snakes[socket.id];
        io.emit('update', { snakes, apples });
    });
});

setInterval(() => {
    initApples();

    for (let id in snakes) {
        const snake = snakes[id];
        if (!snake.alive || snake.paused) continue;

        if (snake.direction.x === 0 && snake.direction.y === 0) continue;

        const head = { x: snake.body[0].x + snake.direction.x, y: snake.body[0].y + snake.direction.y };

        if (head.x < 0 || head.x >= tileCount || head.y < 0 || head.y >= tileCount) {
            snake.alive = false;
            continue;
        }

        for (let i = 1; i < snake.body.length; i++) {
            if (head.x === snake.body[i].x && head.y === snake.body[i].y) {
                snake.alive = false;
                break;
            }
        }
        if (!snake.alive) continue;

        if (snake.invincible <= 0) {
            for (let otherId in snakes) {
                if (otherId !== id) {
                    for (let segment of snakes[otherId].body) {
                        if (head.x === segment.x && head.y === segment.y) {
                            snake.alive = false;
                            break;
                        }
                    }
                }
                if (!snake.alive) break;
            }
        }
        if (!snake.alive) continue;

        snake.body.unshift(head);

        let ateApple = false;
        let appleType = null;
        for (let i = apples.length - 1; i >= 0; i--) {
            const apple = apples[i];
            if (head.x === apple.x && head.y === apple.y) {
                ateApple = true;
                appleType = apple.type;
                apples.splice(i, 1);
                if (apple.type === 'double') {
                    snake.applesEaten += 2;
                } else if (apple.type === 'speed') {
                    snake.applesEaten += 3;
                } else {
                    snake.applesEaten++;
                }
                break;
            }
        }
        if (!ateApple) {
            snake.body.pop();
        } else if (appleType === 'double') {
            snake.body.unshift(head);
        } else if (appleType === 'speed') {
            snake.body.unshift(head);
            snake.body.unshift(head);
        }

        if (snake.speedBoost > 0) snake.speedBoost--;
        if (snake.invincible > 0) snake.invincible--;
    }

    const updateData = { snakes, apples };
    const usernames = {};
    const playerColors = {};
    const playerShapes = {};
    for (let id in snakes) {
        usernames[id] = connectedUsers[id] ? connectedUsers[id].username : 'Guest';
        playerColors[id] = connectedUsers[id] ? connectedUsers[id].color : '#006400';
        playerShapes[id] = connectedUsers[id] ? connectedUsers[id].shape : 'square';
        updateData.applesEaten = snakes[id].applesEaten;
        updateData.usernames = usernames;
        updateData.playerColors = playerColors;
        updateData.playerShapes = playerShapes;
        io.to(id).emit('update', updateData);
    }
}, 114);

server.listen(PORT, () => {
    console.log('\x1b[32m%s\x1b[0m', `Servidor corriendo en puerto ${PORT}`);
});
