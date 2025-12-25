<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Spectator Map</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
html,body{
  margin:0;
  width:100%;
  height:100%;
  overflow:hidden;
  background:radial-gradient(circle at 50% 15%, #160406, #020001);
  font-family:system-ui,Segoe UI,sans-serif;
}
#hud{
  position:fixed;
  top:16px;
  left:16px;
  z-index:10;
}
.ui{
  min-width:180px;
  color:#ffe8ee;
  background:linear-gradient(180deg,rgba(120,20,30,.35),rgba(40,5,10,.4));
  backdrop-filter:blur(14px);
  border:1px solid rgba(255,120,140,.35);
  border-radius:16px;
  padding:12px;
  box-shadow:0 14px 40px rgba(120,20,40,.45);
}
.ui b{
  font-size:11px;
  letter-spacing:.12em;
  text-transform:uppercase;
}
.name{
  margin-top:6px;
  padding:6px 8px;
  border-radius:10px;
  cursor:pointer;
  background:rgba(255,80,100,.08);
}
.name:hover{
  background:rgba(255,120,140,.28);
}
#killFeed{
  position:fixed;
  top:16px;
  right:16px;
  width:300px;
  max-height:400px;
  overflow-y:auto;
  font-family:system-ui,sans-serif;
  font-size:13px;
  line-height:1.4;
  color:#ffe8ee;
  backdrop-filter:blur(6px);
  padding:12px;
  border-radius:10px;
  background:rgba(20,5,10,0.35);
}
</style>
<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js"
  }
}
</script>
</head>
<body>
<div id="hud"><div class="ui" id="ui"></div></div>
<div id="killFeed"></div>

<script type="module">
import * as THREE from "three";
import { OBJLoader } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/OBJLoader.js";

/* ================= RENDERER ================= */
const renderer = new THREE.WebGLRenderer({ antialias:true });
renderer.setSize(innerWidth,innerHeight);
renderer.setPixelRatio(devicePixelRatio);
document.body.appendChild(renderer.domElement);

/* ================= SCENE ================= */
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050001);

const camera = new THREE.PerspectiveCamera(60,innerWidth/innerHeight,1,20000);
camera.position.set(0,1200,1800);

/* ================= LIGHTING ================= */
scene.add(new THREE.AmbientLight(0xffffff,.35));
const sun = new THREE.DirectionalLight(0xffc0cc,1.3);
sun.position.set(3000,6000,2000);
scene.add(sun);

/* ================= ARENA ================= */
const arenaGroup = new THREE.Group();
scene.add(arenaGroup);

new OBJLoader().load("/arena.obj", obj=>{
  obj.traverse(n=>{
    if(n.isMesh){
      n.material = new THREE.MeshStandardMaterial({
        color:0x5a141d,
        roughness:.65,
        metalness:.08,
        emissive:0x2a060b,
        emissiveIntensity:.35
      });
    }
  });
  obj.scale.setScalar(4);
  arenaGroup.add(obj);
});

/* ================= UI ================= */
const ui = document.getElementById("ui");
const killFeedEl = document.getElementById("killFeed");

/* ================= PLAYERS ================= */
const players = new Map();
function makePlayer(){
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(10,24,24),
    new THREE.MeshStandardMaterial({
      color:0xff6b7a,
      emissive:0xff2a40,
      emissiveIntensity:.7
    })
  );
  g.add(body);
  return g;
}

/* ================= UPDATE PLAYERS ================= */
let follow=null;
async function updatePlayers(){
  const data = await fetch("/map").then(r=>r.json());
  ui.innerHTML="<b>Tributes</b>";
  const alive = new Set();

  for(const p of data){
    alive.add(p.id);
    if(!players.has(p.id)){
      const m = makePlayer();
      scene.add(m);
      players.set(p.id,m);
    }
    const m = players.get(p.id);
    m.position.set(p.x,p.y+20,p.z);
    m.rotation.y = p.yaw;

    const d=document.createElement("div");
    d.className="name";
    d.textContent=p.name;
    d.onclick=()=>follow=m;
    ui.appendChild(d);
  }

  for(const [id,m] of players){
    if(!alive.has(id)){
      scene.remove(m);
      players.delete(id);
    }
  }
}
setInterval(updatePlayers,200);

/* ================= CAMERA CONTROLS ================= */
const cam = {
  yaw:0,
  pitch:0,
  velocity:new THREE.Vector3(),
  accel:2.4,
  damping:0.88,
  baseSpeed:18,
  boost:3.0,
};
const keys = { w:false,a:false,s:false,d:false,shift:false };
let rotating=false;

renderer.domElement.addEventListener("mousedown",e=>{
  if(e.button===0){
    rotating=true;
    renderer.domElement.requestPointerLock();
  }
});
addEventListener("mouseup",()=>{ rotating=false; document.exitPointerLock(); });
addEventListener("mousemove",e=>{
  if(rotating && document.pointerLockElement){
    cam.yaw   -= e.movementX*0.002;
    cam.pitch = Math.max(-1.4,Math.min(1.4,cam.pitch-e.movementY*0.002));
  }
});
addEventListener("keydown",e=>{
  if(e.code==="KeyW")keys.w=true;
  if(e.code==="KeyA")keys.a=true;
  if(e.code==="KeyS")keys.s=true;
  if(e.code==="KeyD")keys.d=true;
  if(e.code==="ShiftLeft")keys.shift=true;
  if("KeyWKeyAKeySKeyD".includes(e.code)) follow=null;
});
addEventListener("keyup",e=>{
  if(e.code==="KeyW")keys.w=false;
  if(e.code==="KeyA")keys.a=false;
  if(e.code==="KeyS")keys.s=false;
  if(e.code==="KeyD")keys.d=false;
  if(e.code==="ShiftLeft")keys.shift=false;
});

/* ================= SOCKET.IO KILL FEED ================= */
const socket = io(); // connect
socket.on("kill:feed", feed => {
  killFeedEl.innerHTML = "";
  feed.forEach(item=>{
    const div = document.createElement("div");
    div.textContent = item.text;
    killFeedEl.appendChild(div);
  });
});

/* ================= ANIMATION LOOP ================= */
function animate(){
  requestAnimationFrame(animate);

  camera.rotation.order="YXZ";
  camera.rotation.y=cam.yaw;
  camera.rotation.x=cam.pitch;

  const forward = new THREE.Vector3(0,0,-1).applyEuler(camera.rotation);
  const right   = new THREE.Vector3(1,0,0).applyEuler(camera.rotation);

  let mult = cam.baseSpeed;
  if(keys.shift) mult*=cam.boost;
  if(keys.w) cam.velocity.addScaledVector(forward, cam.accel*mult);
  if(keys.s) cam.velocity.addScaledVector(forward,-cam.accel*mult);
  if(keys.a) cam.velocity.addScaledVector(right,-cam.accel*mult);
  if(keys.d) cam.velocity.addScaledVector(right, cam.accel*mult);

  cam.velocity.multiplyScalar(cam.damping);
  camera.position.add(cam.velocity);

  if(follow){
    const t = follow.position.clone();
    const off = new THREE.Vector3(0,140,-320).applyEuler(camera.rotation);
    camera.position.lerp(t.add(off),.08);
    cam.velocity.set(0,0,0);
  }

  renderer.render(scene,camera);
}
animate();

addEventListener("resize",()=>{
  renderer.setSize(innerWidth,innerHeight);
  camera.aspect=innerWidth/innerHeight;
  camera.updateProjectionMatrix();
});
</script>
<script src="/socket.io/socket.io.js"></script>
</body>
</html>
