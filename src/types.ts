interface Particle {
	position: [number, number, number];
	rotation: number;
	scale: number;
	velocity: [number, number, number];
}

interface User {
	id: string;
	color: number;
	particles?: Particle[];
	lastUpdate: number;
}

interface Room {
	users: Map<string, User>;
	lastActivity: number;
}

interface Message {
	type: 'user_joined' | 'user_left' | 'init' | 'update' | 'sync';
	userId: string;
	timestamp: number;
	particles?: Particle[];
	color?: number;
	roomState?: Array<{
		userId: string;
		color: number;
		particles?: Particle[];
	}>;
}
