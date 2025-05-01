import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
const server = createServer(app);
const io = new Server(server, {
	cors: {
		origin: process.env.FRONTEND_URL || 'http://localhost:5173',
		methods: ['GET', 'POST'],
	},
});

// Health check
app.use(cors());
app.get('/health', (_, res) => res.json({ status: 'ok' }));

// Room state
const rooms = new Map<string, Room>();
const socketToUser = new Map<string, string>();

// Cleanup every 5 mins
setInterval(() => {
	const now = Date.now();
	for (const [roomId, room] of rooms.entries()) {
		if (now - room.lastActivity > 5 * 60 * 1000) {
			rooms.delete(roomId);
			console.log('🧹 Cleaned inactive room:', roomId);
		}
	}
}, 5 * 60 * 1000);

io.on('connection', (socket) => {
	const userId = socket.handshake.query.userId as string;
	const roomId = socket.handshake.query.roomId as string;

	if (!userId || !roomId) {
		console.error('Missing userId or roomId');
		socket.disconnect();
		return;
	}

	if (!rooms.has(roomId)) {
		console.log(`Creating new room: ${roomId}`);
		rooms.set(roomId, { users: new Map(), lastActivity: Date.now() });
	}
	const room = rooms.get(roomId)!;

	// Add user to room
	room.users.set(userId, {
		id: userId,
		color: 0xffffff,
		lastUpdate: Date.now(),
	});
	socketToUser.set(socket.id, userId);
	socket.join(roomId);

	// Log current room state
	console.log(`Room ${roomId} state:`, {
		users: Array.from(room.users.keys()),
		userCount: room.users.size,
	});

	// Broadcast user joined to all clients in the room
	console.log(`Broadcasting user_joined for ${userId} to room ${roomId}`);
	io.to(roomId).emit('message', {
		type: 'user_joined',
		userId: userId,
		timestamp: Date.now(),
	});

	socket.on('update', (message: any) => {
		try {
			room.lastActivity = Date.now();
			console.log(`Received update from ${userId}:`, message);
			const user = room.users.get(userId);
			if (user) {
				user.particles = message.particles;
				user.color = message.color || user.color;
				user.lastUpdate = Date.now();
				// Broadcast update to all other clients
				console.log(`Broadcasting update from ${userId} to room ${roomId}`);
				socket.to(roomId).emit('message', {
					type: 'update',
					userId: userId,
					timestamp: Date.now(),
					particles: message.particles,
					color: message.color,
				});
			}
		} catch (err) {
			console.error('Error handling update:', err);
		}
	});

	socket.on('disconnect', () => {
		const uid = socketToUser.get(socket.id);
		if (!uid) return;
		console.log(`${uid} disconnected from room ${roomId}`);
		room.users.delete(uid);
		socketToUser.delete(socket.id);

		console.log(`Broadcasting user_left for ${uid}`);
		io.to(roomId).emit('message', {
			type: 'user_left',
			userId: uid,
			timestamp: Date.now(),
		});

		if (room.users.size === 0) {
			console.log(`Deleting empty room: ${roomId}`);
			rooms.delete(roomId);
		}
	});
});

// Broadcast room state every 50ms
setInterval(() => {
	for (const [roomId, room] of rooms.entries()) {
		const clients = Array.from(room.users.values());
		if (clients.length > 0) {
			console.log(`Broadcasting room state for ${roomId}:`, {
				userCount: clients.length,
				users: clients.map((u) => u.id),
			});
			io.to(roomId).emit('clients', clients);
		}
	}
}, 50);

// Shutdown
process.on('SIGTERM', () => {
	console.log('Server shutting down...');
	server.close(() => process.exit(0));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
	console.log(`Server running on http://localhost:${PORT}`);
});
