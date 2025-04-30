import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import { RoomManager } from './RoomManager';
import { WebSocketMessage } from './types';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });
const roomManager = new RoomManager();

// Enable CORS
app.use(cors());

// Health check endpoint
app.get('/health', (req, res) => {
	res.json({ status: 'ok' });
});

wss.on('connection', (ws, req) => {
	const roomId = req.url?.split('/').pop() || 'default';
	let userId: string | undefined;

	console.log(`🔌 New connection attempt to room: ${roomId}`);

	// Handle messages
	ws.on('message', (message) => {
		try {
			const data = JSON.parse(message.toString()) as WebSocketMessage;
			console.log(
				`📨 Received message type "${data.type}" from user ${data.userId}`
			);

			// Handle user identification
			if (data.type === 'user_joined' && data.userId) {
				// Check if user already exists in the room
				const room = roomManager.getRoom(roomId);
				if (room?.clients.has(data.userId)) {
					console.log(
						`⚠️ User ${data.userId} already exists in room ${roomId}, closing old connection`
					);
					// Close the old connection
					const oldClient = room.clients.get(data.userId);
					if (oldClient?.ws.readyState === ws.OPEN) {
						oldClient.ws.close();
					}
					room.clients.delete(data.userId);
				}

				userId = data.userId;
				roomManager.addClient(roomId, userId, ws);

				// Notify others about new user
				const message: WebSocketMessage = {
					type: 'user_joined',
					userId: userId,
					timestamp: Date.now(),
				};
				roomManager.broadcastToRoom(roomId, message, userId);
			}

			// Only broadcast if we have a userId
			if (userId) {
				roomManager.broadcastToRoom(roomId, data, userId);
			}
		} catch (error) {
			console.error('❌ Error processing message:', error);
		}
	});

	// Handle disconnection
	ws.on('close', () => {
		if (userId) {
			console.log(`🔌 Connection closed for user ${userId} in room ${roomId}`);
			roomManager.removeClient(roomId, userId);
		}
	});

	// Handle errors
	ws.on('error', (error) => {
		console.error(
			`❌ WebSocket error for user ${userId} in room ${roomId}:`,
			error
		);
		if (userId) {
			roomManager.removeClient(roomId, userId);
		}
	});
});

// Handle server shutdown
process.on('SIGTERM', () => {
	console.log('🛑 Server shutting down...');
	roomManager.cleanup();
	server.close(() => {
		console.log('✅ Server closed');
		process.exit(0);
	});
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
	console.log(`🚀 Server running on port ${PORT}`);
});
