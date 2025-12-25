<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>HG Spectator Map</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
	body { margin:0; overflow:hidden; background:black; }
	.ui {
		position:absolute;
		color:white;
		font-family:sans-serif;
		background:rgba(0,0,0,.6);
		padding:6px;
		font-size:12px;
	}
</style>
</head>
<body>

<script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script>

<script type="module">
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js";

/* ======================
   THREE SETUP
====================== */
const renderer = new THREE.WebGLRenderer({ antialias:true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth/innerHeight, 1, 15000);
camera.position.set(2000,2000,2000);

const controls = new OrbitControls(camera, renderer.domElement);

/* ======================
   GROUPS
====================== */
const playerGroup = new THREE.Group();
const spectatorGroup = new THREE.Group();
scene.add(playerGroup, spectatorGroup);

/* ======================
   UI
====================== */
const tributeUI = document.createElement("div");
tributeUI.className="ui";
tributeUI.style.top="10px";
tributeUI.style.left="10px";
document.body.appendChild(tributeUI);

const killUI = document.createElement("div");
killUI.className="ui";
killUI.style.top="10px";
killUI.style.right="10px";
document.body.appendChild(killUI);

const chatUI = document.createElement("div");
chatUI.className="ui";
chatUI.style.bottom="10px";
chatUI.style.left="10px";
chatUI.innerHTML=`<div id="log" style="height:120px;overflow:auto"></div><input id="input" placeholder="chat" style="width:100%">`;
document.body.appendChild(chatUI);

/* ======================
   STATE
====================== */
const players = new Map();
let tracked = null;
let followMode = "behind";

/* ======================
   PLAYER MARKER
====================== */
function makePlayer() {
	const dot = new THREE.Mesh(
		new THREE.SphereGeometry(8),
		new THREE.MeshBasicMaterial({ color:0x00ff00 })
	);
	const hit = new THREE.Mesh(
		new THREE.SphereGeometry(40),
		new THREE.MeshBasicMaterial({ transparent:true, opacity:0 })
	);
	dot.add(hit);
	dot.userData.hit = hit;
	dot.userData.arrow = new THREE.ArrowHelper(
		new THREE.Vector3(0,0,1),
		new THREE.Vector3(),
		80,
		0xffff00
	);
	dot.add(dot.userData.arrow);
	return dot;
}

/* ======================
   FETCH PLAYERS
====================== */
async function updatePlayers() {
	const data = await fetch("/map").then(r=>r.json());
	tributeUI.innerHTML="<b>Tributes</b><br>"+data.map(p=>p.name).join("<br>");

	for (const p of data) {
		if (!players.has(p.id)) {
			const m = makePlayer();
			playerGroup.add(m);
			players.set(p.id, m);
		}
		const m = players.get(p.id);
		m.position.lerp(new THREE.Vector3(p.x,50,p.z),0.35);
	}
}

/* ======================
   CLICK TRACK
====================== */
const ray = new THREE.Raycaster();
const mouse = new THREE.Vector2();
window.addEventListener("pointerdown", e=>{
	mouse.x=(e.clientX/innerWidth)*2-1;
	mouse.y=-(e.clientY/innerHeight)*2+1;
	ray.setFromCamera(mouse,camera);
	const hit = ray.intersectObjects(playerGroup.children,true)[0];
	if (hit) tracked = hit.object.parent;
});

/* ======================
   FOLLOW CAM
====================== */
window.addEventListener("keydown", e=>{
	if (e.key==="1") followMode="behind";
	if (e.key==="2") followMode="overhead";
	if (e.key==="3") followMode="free";
});

function follow() {
	if (!tracked || followMode==="free") return;
	const off = followMode==="behind"
		? new THREE.Vector3(0,300,700)
		: new THREE.Vector3(0,1200,0);
	camera.position.lerp(tracked.position.clone().add(off),0.08);
	camera.lookAt(tracked.position);
}

/* ======================
   SOCKET.IO
====================== */
const socket = io();

socket.on("spectators:init", list=>{
	list.forEach(s=>{
		const m=new THREE.Mesh(
			new THREE.SphereGeometry(12),
			new THREE.MeshBasicMaterial({ color:s.color })
		);
		spectatorGroup.add(m);
		m.userData.id=s.id;
	});
});

socket.on("spectator:update", s=>{
	const m=[...spectatorGroup.children].find(x=>x.userData.id===s.id);
	if (m) m.position.set(s.pos.x,s.pos.y,s.pos.z);
});

socket.on("chat:msg", m=>{
	const log=document.getElementById("log");
	log.innerHTML+=`<div><b>${m.from}:</b> ${m.msg}</div>`;
	log.scrollTop=log.scrollHeight;
});

document.getElementById("input").addEventListener("keydown",e=>{
	if(e.key==="Enter"&&e.target.value){
		socket.emit("chat:send",e.target.value);
		e.target.value="";
	}
});

socket.on("kill:feed", list=>{
	killUI.innerHTML="<b>Kills</b><br>"+list.map(k=>`${k.killer} ☠ ${k.victim}`).join("<br>");
});

/* ======================
   SEND CAMERA
====================== */
setInterval(()=>{
	const dir=new THREE.Vector3();
	camera.getWorldDirection(dir);
	socket.emit("spectator:update",{ pos:camera.position, dir });
},120);

/* ======================
   LOOP
====================== */
async function animate(){
	requestAnimationFrame(animate);
	await updatePlayers();
	follow();
	controls.update();
	renderer.render(scene,camera);
}
animate();
</script>
</body>
</html>
