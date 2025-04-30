import { WebSocket } from 'ws';
import { RoomClient, WebSocketMessage, Room } from './types';

const CLEANUP_INTERVAL = 30000; // 30 seconds
const CLIENT_TIMEOUT = 60000; // 60 seconds
const PING_INTERVAL = 30000; // 30 seconds

export class RoomManager {
	private rooms: Map<string, Room>;
	private cleanupInterval: NodeJS.Timeout;
	private pingIntervals: Map<string, NodeJS.Timeout>;

	constructor() {
		this.rooms = new Map();
		this.pingIntervals = new Map();
		this.cleanupInterval = setInterval(
			() => this.cleanupInactiveClients(),
			CLEANUP_INTERVAL
		);
	}

	createRoom(roomId: string): Room {
		const room: Room = {
			id: roomId,
			clients: new Map(),
			lastCleanup: Date.now(),
		};
		this.rooms.set(roomId, room);
		console.log(`🏠 Created new room: ${roomId}`);
		return room;
	}

	getRoom(roomId: string): Room | undefined {
		return this.rooms.get(roomId);
	}

	getOrCreateRoom(roomId: string): Room {
		return this.getRoom(roomId) || this.createRoom(roomId);
	}

	addClient(roomId: string, userId: string, ws: WebSocket): void {
		const room = this.getOrCreateRoom(roomId);

		// Clean up any existing client with the same userId
		if (room.clients.has(userId)) {
			console.log(
				`⚠️ User ${userId} already exists in room ${roomId}, closing old connection`
			);
			const oldClient = room.clients.get(userId);
			if (oldClient?.ws.readyState === WebSocket.OPEN) {
				oldClient.ws.close();
			}
			this.removeClient(roomId, userId);
		}

		// Add new client
		const client: RoomClient = { ws, userId, lastSeen: Date.now() };
		room.clients.set(userId, client);
		console.log(`👤 User ${userId} joined room ${roomId}`);
		this.logRoomStatus(roomId);

		// Set up ping interval for this client
		const pingIntervalId = setInterval(() => {
			this.pingClient(roomId, userId);
		}, PING_INTERVAL);

		this.pingIntervals.set(`${roomId}-${userId}`, pingIntervalId);

		// Handle messages
		ws.on('message', (message: string) => {
			try {
				const data = JSON.parse(message.toString());
				if (data.type === 'pong') {
					this.updateClientLastSeen(roomId, userId);
				}
			} catch (error) {
				console.error(`❌ Error processing message from ${userId}:`, error);
			}
		});

		// Handle client disconnection
		ws.on('close', () => {
			console.log(`🔌 Connection closed for user ${userId} in room ${roomId}`);
			this.removeClient(roomId, userId);
		});

		// Handle client errors
		ws.on('error', (error) => {
			console.error(
				`❌ WebSocket error for user ${userId} in room ${roomId}:`,
				error
			);
			this.removeClient(roomId, userId);
		});

		// Send initial ping
		this.pingClient(roomId, userId);
	}

	private pingClient(roomId: string, userId: string): void {
		const room = this.getRoom(roomId);
		const client = room?.clients.get(userId);

		if (client && client.ws.readyState === WebSocket.OPEN) {
			try {
				const pingMessage: WebSocketMessage = {
					type: 'ping',
					userId: 'server',
					timestamp: Date.now(),
				};
				client.ws.send(JSON.stringify(pingMessage));
			} catch (error) {
				console.error(`❌ Error sending ping to user ${userId}:`, error);
				this.removeClient(roomId, userId);
			}
		} else {
			this.removeClient(roomId, userId);
		}
	}

	private updateClientLastSeen(roomId: string, userId: string): void {
		const room = this.getRoom(roomId);
		const client = room?.clients.get(userId);
		if (client) {
			client.lastSeen = Date.now();
		}
	}

	removeClient(roomId: string, userId: string): void {
		const room = this.getRoom(roomId);
		if (!room) return;

		// Send user_left message before removing the client
		const message: WebSocketMessage = {
			type: 'user_left',
			userId: userId,
			timestamp: Date.now(),
		};
		this.broadcastToRoom(roomId, message, userId);

		// Clear ping interval
		const intervalId = this.pingIntervals.get(`${roomId}-${userId}`);
		if (intervalId) {
			clearInterval(intervalId);
			this.pingIntervals.delete(`${roomId}-${userId}`);
		}

		// Remove client from room
		if (room.clients.delete(userId)) {
			console.log(`👋 User ${userId} left room ${roomId}`);
			this.logRoomStatus(roomId);

			// Clean up empty rooms
			if (room.clients.size === 0) {
				this.rooms.delete(roomId);
				console.log(`🏚️ Deleted empty room: ${roomId}`);
			}
		}
	}

	broadcastToRoom(
		roomId: string,
		message: WebSocketMessage,
		excludeUserId?: string
	): void {
		const room = this.getRoom(roomId);
		if (!room) return;

		const messageStr = JSON.stringify(message);
		room.clients.forEach((client) => {
			if (
				(!excludeUserId || client.userId !== excludeUserId) &&
				client.ws.readyState === WebSocket.OPEN
			) {
				try {
					client.ws.send(messageStr);
					client.lastSeen = Date.now();
				} catch (error) {
					console.error(
						`❌ Error sending message to user ${client.userId}:`,
						error
					);
					this.removeClient(roomId, client.userId);
				}
			}
		});
	}

	private cleanupInactiveClients(): void {
		const now = Date.now();
		this.rooms.forEach((room, roomId) => {
			// Only cleanup if enough time has passed since last cleanup
			if (now - room.lastCleanup < CLEANUP_INTERVAL) return;

			room.clients.forEach((client, userId) => {
				if (now - client.lastSeen > CLIENT_TIMEOUT) {
					console.log(
						`🧹 Cleaning up inactive client: ${userId} in room ${roomId}`
					);
					this.removeClient(roomId, userId);
				}
			});

			room.lastCleanup = now;
		});
	}

	private logRoomStatus(roomId: string): void {
		const room = this.getRoom(roomId);
		if (room) {
			console.log(
				`👥 Users in room ${roomId}:`,
				Array.from(room.clients.keys())
			);
		}
	}

	cleanup(): void {
		clearInterval(this.cleanupInterval);

		// Clear all ping intervals
		this.pingIntervals.forEach((interval) => {
			clearInterval(interval);
		});
		this.pingIntervals.clear();

		// Close all WebSocket connections
		this.rooms.forEach((room) => {
			room.clients.forEach((client) => {
				if (client.ws.readyState === WebSocket.OPEN) {
					client.ws.close();
				}
			});
		});

		// Clear all rooms
		this.rooms.clear();
	}
}
