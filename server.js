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

// Servir archivos estáticos
app.use(express.static('.'));

// Estado del juego
let snakes = {};
let apple = { x: 15, y: 15 }; // Centrado en el mapa más grande
const gridSize = 20;
const tileCount = 30; // 600 / 20

// Usuarios conectados con sus cuentas
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
    apple = {
        x: Math.floor(Math.random() * tileCount),
        y: Math.floor(Math.random() * tileCount)
    };
    // Asegurarse de que no aparezca en una serpiente
    for (let id in snakes) {
        if (snakes[id].alive) {
            for (let segment of snakes[id].body) {
                if (segment.x === apple.x && segment.y === apple.y) {
                    generateApple();
                    return;
                }
            }
        }
    }
}

io.on('connection', (socket) => {
    console.log('Jugador conectado:', socket.id);

    // Asignar color: primer jugador verde, otros verde oscuro
    const playerCount = Object.keys(snakes).length;
    const color = playerCount === 0 ? '#00FF00' : '#006400';

    snakes[socket.id] = {
        body: [{ x: Math.floor(Math.random() * tileCount), y: Math.floor(Math.random() * tileCount) }],
        direction: { x: 0, y: 0 },
        color: color,
        alive: true,
        paused: false,
        applesEaten: 0
    };

    // Enviar estado inicial
    socket.emit('init', { snakes, apple, yourId: socket.id, applesEaten: 0 });

    socket.on('login', async (data) => {
        const { username, password } = data;
        const users = await loadUsers();
        const user = users.find(u => u.username === username);

        if (user && await bcrypt.compare(password, user.password)) {
            connectedUsers[socket.id] = { username, apples: user.apples || 0, color: user.color || '#00FF00', ownedColors: user.ownedColors || [] };
            snakes[socket.id].applesEaten = user.apples || 0;
            socket.emit('login-success', { username, apples: user.apples || 0, ownedColors: user.ownedColors || [] });
            socket.emit('init', { snakes, apple, yourId: socket.id, applesEaten: user.apples || 0 });
        } else {
            socket.emit('login-fail', 'Usuario o contraseña incorrectos');
        }
    });

    socket.on('auto-login', async (data) => {
        const { username, apples } = data;
        const users = await loadUsers();
        const user = users.find(u => u.username === username);

        if (user && user.apples === apples) {
            connectedUsers[socket.id] = { username, apples: user.apples || 0, color: user.color || '#00FF00', ownedColors: user.ownedColors || [] };
            snakes[socket.id].applesEaten = user.apples || 0;
            socket.emit('auto-login-success', { username, apples: user.apples || 0, ownedColors: user.ownedColors || [] });
            socket.emit('init', { snakes, apple, yourId: socket.id, applesEaten: user.apples || 0 });
        } else {
            // Auto-login falló, limpiar localStorage
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

        // Validate username: only letters and numbers, max 16 characters
        if (!/^[a-zA-Z0-9]+$/.test(username) || username.length > 16) {
            socket.emit('register-fail', 'El nombre de usuario debe contener solo letras y números, y tener un máximo de 16 caracteres.');
            return;
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        users.push({ username, password: hashedPassword, apples: 0, ownedColors: [] });
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
                await saveUsers(users);
                socket.emit('save-success');
            }
        }
    });

    socket.on('buy-color', async (data) => {
        if (connectedUsers[socket.id] && connectedUsers[socket.id].apples >= 30) {
            const { username } = connectedUsers[socket.id];
            const users = await loadUsers();
            const userIndex = users.findIndex(u => u.username === username);
            if (userIndex !== -1) {
                if (!users[userIndex].ownedColors) users[userIndex].ownedColors = [];
                if (!users[userIndex].ownedColors.includes(data.color)) {
                    users[userIndex].ownedColors.push(data.color);
                    users[userIndex].apples -= 30;
                    connectedUsers[socket.id].apples -= 30;
                    connectedUsers[socket.id].ownedColors = users[userIndex].ownedColors;
                    await saveUsers(users);
                    socket.emit('buy-color-success', { color: data.color, ownedColors: users[userIndex].ownedColors });
                } else {
                    socket.emit('buy-color-fail', 'Color already owned.');
                }
            }
        } else {
            socket.emit('buy-color-fail', 'Not enough apples or not logged in.');
        }
    });

    socket.on('use-color', async (data) => {
        if (connectedUsers[socket.id] && connectedUsers[socket.id].ownedColors && connectedUsers[socket.id].ownedColors.includes(data.color)) {
            connectedUsers[socket.id].color = data.color;
            socket.emit('use-color-success', { color: data.color });
        } else {
            socket.emit('use-color-fail', 'Color not owned.');
        }
    });

    socket.on('logout', () => {
        if (connectedUsers[socket.id]) {
            delete connectedUsers[socket.id];
        }
    });

    socket.on('direction', (dir) => {
        if (snakes[socket.id] && snakes[socket.id].alive && !snakes[socket.id].paused) {
            // Prevenir reversa
            if ((dir.x !== 0 && snakes[socket.id].direction.x === -dir.x) ||
                (dir.y !== 0 && snakes[socket.id].direction.y === -dir.y)) return;
            // Prevenir cambio rápido hacia el cuerpo
            const currentHead = snakes[socket.id].body[0];
            const nextHead = { x: currentHead.x + dir.x, y: currentHead.y + dir.y };
            for (let i = 1; i < snakes[socket.id].body.length; i++) {
                if (nextHead.x === snakes[socket.id].body[i].x && nextHead.y === snakes[socket.id].body[i].y) {
                    return; // No cambiar dirección si colisionaría inmediatamente
                }
            }
            snakes[socket.id].direction = dir;
        }
    });

    socket.on('pause', (isPaused) => {
        if (snakes[socket.id]) {
            snakes[socket.id].paused = isPaused;
            socket.emit('paused', isPaused); // Solo enviar al jugador que pausó
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
                applesEaten: snakes[socket.id].applesEaten
            };
            io.emit('update', { snakes, apple });
        }
    });

    socket.on('chat-message', (message) => {
        if (connectedUsers[socket.id]) {
            const username = connectedUsers[socket.id].username;
            io.emit('chat-message', { username, message });
        }
    });

    socket.on('disconnect', async () => {
        console.log('Jugador desconectado:', socket.id);
        // Guardar progreso si está logueado
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
        io.emit('update', { snakes, apple });
    });
});

// Bucle del juego
setInterval(() => {
    for (let id in snakes) {
        const snake = snakes[id];
        if (!snake.alive || snake.paused) continue;

        if (snake.direction.x === 0 && snake.direction.y === 0) continue;

        const head = { x: snake.body[0].x + snake.direction.x, y: snake.body[0].y + snake.direction.y };

        // Colisión con pared
        if (head.x < 0 || head.x >= tileCount || head.y < 0 || head.y >= tileCount) {
            snake.alive = false;
            continue;
        }

        // Colisión con cuerpo propio
        for (let i = 1; i < snake.body.length; i++) {
            if (head.x === snake.body[i].x && head.y === snake.body[i].y) {
                snake.alive = false;
                break;
            }
        }
        if (!snake.alive) continue;

        // Colisión con otras serpientes
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
        if (!snake.alive) continue;

        snake.body.unshift(head);

        // Comer manzana
        if (head.x === apple.x && head.y === apple.y) {
            snake.applesEaten++;
            generateApple();
        } else {
            snake.body.pop();
        }
    }

    // Enviar actualización con contador de manzanas, usernames y colores
    const updateData = { snakes, apple };
    const usernames = {};
    const playerColors = {};
    for (let id in snakes) {
        usernames[id] = connectedUsers[id] ? connectedUsers[id].username : 'Guest';
        playerColors[id] = connectedUsers[id] ? connectedUsers[id].color : '#006400';
        updateData.applesEaten = snakes[id].applesEaten;
        updateData.usernames = usernames;
        updateData.playerColors = playerColors;
        io.to(id).emit('update', updateData);
    }
}, 100);

server.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});
