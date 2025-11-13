declare module "three/examples/jsm/loaders/OBJLoader" {
	import { Group, Loader } from "three";
	export class OBJLoader extends Loader {
		constructor(manager?: any);
		load(url: string, onLoad: (group: Group) => void, onProgress?: any, onError?: any): void;
		parse(text: string): Group;
	}
}

declare module "three/examples/jsm/loaders/FBXLoader" {
	import { Group, Loader } from "three";
	export class FBXLoader extends Loader {
		constructor(manager?: any);
		load(url: string, onLoad: (group: Group) => void, onProgress?: any, onError?: any): void;
		parse(buffer: ArrayBuffer | string): Group;
	}
}
