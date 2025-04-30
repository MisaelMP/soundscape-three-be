import { WebSocket } from 'ws';

export interface RoomClient {
	ws: WebSocket;
	userId: string;
	lastSeen: number;
}

export interface Room {
	id: string;
	clients: Map<string, RoomClient>;
	lastCleanup: number;
}

export interface WebSocketMessage {
	type: 'user_joined' | 'user_left' | 'init' | 'update' | 'ping' | 'pong';
	userId: string;
	timestamp: number;
	particles?: Array<{
		position: [number, number, number];
		rotation: number;
		scale: number;
		velocity: [number, number, number];
	}>;
	color?: number;
}
