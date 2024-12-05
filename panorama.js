import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MMDLoader } from 'three/addons/loaders/MMDLoader.js';
import { MMDAnimationHelper } from 'three/addons/animation/MMDAnimationHelper.js';

let camera, scene, renderer;
let player, playerModel;
let thirdPersonCamera = true;
let cameraDistance = 5;
let moveSpeed = 0.15;
let rotateSpeed = 0.003;

// 跳跃相关参数
let isJumping = false;
let jumpVelocity = 0;
const jumpSpeed = 0.15;
const gravity = 0.006;
const groundLevel = 0;
const playerHeight = 1.8;

// 键盘状态
const keys = {
    KeyW: false,
    KeyS: false,
    KeyA: false,
    KeyD: false,
    Space: false,
    KeyV: false,
    KeyF: false
};

// 添加新的游戏状态变量
let collectibles = [];
let score = 0;
let particles = [];
let scoreElement;
let collectSound;
let health = 100;
let stamina = 100;
let maxStamina = 100;
let isRunning = false;
let runSpeed = 0.3;  // 跑步速度
let walkSpeed = 0.15; // 行走速度
let staminaRegenRate = 0.5;
let lastCheckpointPosition = new THREE.Vector3();
let gameStarted = false;
let mixer; // 动画混器
let currentAnimation = 'Idle'; // 当前动画状态

// 添加全局变量
let moveDirection = new THREE.Vector3();

// 添加MMD相关变量
let mmdHelper;
let mmdMixer;

// 添加动画状态变量
let animations = {
    idle: null,
    walk: null,
    run: null,
    jump: null,
    wave: null  // 添加挥手动作
};

function createTerrain() {
    // 建基础地面
    const groundGeometry = new THREE.PlaneGeometry(100, 100);
    const groundMaterial = new THREE.MeshPhongMaterial({
        color: 0x3c8f3c,
        side: THREE.DoubleSide
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    scene.add(ground);

    // 添加一些装饰性地形
    for (let i = 0; i < 30; i++) {
        // 创建小山丘
        const hillGeometry = new THREE.ConeGeometry(2, 3, 4);
        const hillMaterial = new THREE.MeshPhongMaterial({ color: 0x2d5a27 });
        const hill = new THREE.Mesh(hillGeometry, hillMaterial);
        
        hill.position.x = Math.random() * 80 - 40;
        hill.position.z = Math.random() * 80 - 40;
        hill.position.y = 1.5;
        hill.scale.set(
            1 + Math.random() * 2,
            1 + Math.random() * 1,
            1 + Math.random() * 2
        );
        
        scene.add(hill);
    }

    // 添加树木
    for (let i = 0; i < 50; i++) {
        // 树干
        const trunkGeometry = new THREE.CylinderGeometry(0.2, 0.2, 2, 8);
        const trunkMaterial = new THREE.MeshPhongMaterial({ color: 0x4d2926 });
        const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
        
        // 树冠
        const leavesGeometry = new THREE.ConeGeometry(1, 3, 8);
        const leavesMaterial = new THREE.MeshPhongMaterial({ color: 0x2d5a27 });
        const leaves = new THREE.Mesh(leavesGeometry, leavesMaterial);
        leaves.position.y = 2;

        // 组合树干和树冠
        const tree = new THREE.Group();
        tree.add(trunk);
        tree.add(leaves);
        
        tree.position.x = Math.random() * 80 - 40;
        tree.position.z = Math.random() * 80 - 40;
        tree.position.y = 1;
        
        scene.add(tree);
    }
}

// 加载角色模型
function loadCharacterModel() {
    const loader = new GLTFLoader();
    const loadingElem = document.getElementById('loading');
    
    loader.load(
        './models/scene.gltf',
        function (gltf) {
            console.log('动画列表:', gltf.animations); // 查看可用的动画
            
            playerModel = gltf.scene;
            
            // 调整模型
            playerModel.scale.set(0.8, 0.8, 0.8);
            playerModel.position.y = 0;
            
            // 初始化player对象
            player = {
                position: playerModel.position,
                rotation: new THREE.Euler(0, 0, 0, 'YXZ')
            };
            
            // 设置动画混合器
            mixer = new THREE.AnimationMixer(playerModel);
            
            // 获取并设置动画
            const animations = gltf.animations;
            const animationActions = {};
            
            animations.forEach((clip, index) => {
                console.log(`动画 ${index}:`, clip.name); // 输出动画名称
                const action = mixer.clipAction(clip);
                animationActions[clip.name] = action;
            });
            
            // 保存动画引用
            playerModel.animations = animationActions;
            
            // 播放默认动画（通常是idle）
            if (animations.length > 0) {
                const defaultAction = mixer.clipAction(animations[0]);
                defaultAction.play();
            }
            
            scene.add(playerModel);
            loadingElem.style.display = 'none';
        },
        function (progress) {
            const percent = (progress.loaded / progress.total * 100).toFixed(0);
            loadingElem.textContent = `加载中... ${percent}%`;
        },
        function (error) {
            console.error('模型加载错误:', error);
            loadingElem.textContent = '加载失败，请刷新重试';
        }
    );
}

function updateCamera() {
    if (!player || !playerModel) return;

    if (thirdPersonCamera) {
        // 第三人称相机位置计算
        const offset = new THREE.Vector3(
            -Math.sin(player.rotation.y) * cameraDistance,
            3,
            -Math.cos(player.rotation.y) * cameraDistance
        );
        camera.position.copy(player.position).add(offset);
        camera.lookAt(player.position.clone().add(new THREE.Vector3(0, 1, 0)));
    } else {
        // 第一人称视角
        const headHeight = 1.6;
        camera.position.copy(player.position).add(new THREE.Vector3(0, headHeight, 0));
        camera.rotation.copy(player.rotation);
    }

    // 在第一人称时隐藏玩家模型
    if (playerModel) {
        playerModel.visible = thirdPersonCamera;
    }
}

function createCollectibles() {
    const itemGeometry = new THREE.OctahedronGeometry(0.3);
    const itemMaterial = new THREE.MeshPhongMaterial({
        color: 0xffd700,
        emissive: 0xffa500,
        shininess: 50
    });

    for(let i = 0; i < 20; i++) {
        const item = new THREE.Mesh(itemGeometry, itemMaterial);
        
        // 随机位置，避免生成在树木或山丘上
        let validPosition = false;
        while(!validPosition) {
            item.position.set(
                Math.random() * 80 - 40,
                1,
                Math.random() * 80 - 40
            );
            // 这里可以添加位置检查逻辑
            validPosition = true;
        }
        
        item.userData.rotationSpeed = 0.02 + Math.random() * 0.02;
        item.userData.floatOffset = Math.random() * Math.PI * 2;
        scene.add(item);
        collectibles.push(item);
    }
}

function createParticleEffect(position) {
    const particleGroup = new THREE.Group();
    const particleGeometry = new THREE.SphereGeometry(0.05);
    const particleMaterial = new THREE.MeshBasicMaterial({
        color: 0xffd700,
        transparent: true,
        opacity: 1
    });

    for(let i = 0; i < 12; i++) {
        const particle = new THREE.Mesh(particleGeometry, particleMaterial);
        particle.position.copy(position);
        
        const angle = (i / 12) * Math.PI * 2;
        const speed = 0.2;
        particle.userData.velocity = new THREE.Vector3(
            Math.cos(angle) * speed,
            0.3,
            Math.sin(angle) * speed
        );
        particle.userData.life = 1.0;
        
        particleGroup.add(particle);
    }
    
    particles.push(particleGroup);
    scene.add(particleGroup);
}

function updateParticles() {
    for(let i = particles.length - 1; i >= 0; i--) {
        const group = particles[i];
        let allDead = true;
        
        group.children.forEach(particle => {
            particle.position.add(particle.userData.velocity);
            particle.userData.velocity.y -= 0.01;
            particle.userData.life -= 0.02;
            
            particle.material.opacity = particle.userData.life;
            
            if(particle.userData.life > 0) allDead = false;
        });
        
        if(allDead) {
            scene.remove(group);
            particles.splice(i, 1);
        }
    }
}

function checkCollectibles() {
    const playerPosition = player.position;
    const collectionRadius = 1.5;
    
    collectibles.forEach((item, index) => {
        if(item.visible) {
            // 动画更
            item.rotation.y += item.userData.rotationSpeed;
            item.position.y = 1 + Math.sin(Date.now() * 0.002 + item.userData.floatOffset) * 0.2;
            
            // 检查收集
            if(item.position.distanceTo(playerPosition) < collectionRadius) {
                item.visible = false;
                score += 10;
                scoreElement.textContent = `分数: ${score}`;
                createParticleEffect(item.position);
                
                // 播放音效
                if(collectSound) {
                    const sound = collectSound.clone();
                    sound.play();
                }
            }
        }
    });
}

// 添加窗口大小变化处理函数
function onWindowResize() {
    // 更新相机宽高比
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    
    // 更新渲染器大小
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb); // 天空蓝
    
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // 添加光源
    const ambientLight = new THREE.AmbientLight(0x404040);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);

    createTerrain();
    loadCharacterModel();
    
    // 添加音频
    const listener = new THREE.AudioListener();
    camera.add(listener);
    
    const audioLoader = new THREE.AudioLoader();
    audioLoader.load('https://assets.codepen.io/123456/collect.mp3', function(buffer) {
        collectSound = new THREE.Audio(listener);
        collectSound.setBuffer(buffer);
        collectSound.setVolume(0.5);
    });
    
    // 创建收集物
    createCollectibles();
    
    // 获取UI元素
    scoreElement = document.getElementById('score');

    // 添加事件监听
    document.addEventListener('keydown', (e) => {
        if (e.code === 'KeyV') { // V键切换视角
            thirdPersonCamera = !thirdPersonCamera;
        }
        keys[e.code] = true;
    });
    document.addEventListener('keyup', (e) => keys[e.code] = false);
    document.addEventListener('mousemove', onMouseMove);
    
    document.addEventListener('click', () => {
        document.body.requestPointerLock();
    });

    // 添加检查点和危险区域
    const checkpoint1 = createCheckpoint(new THREE.Vector3(10, 0, 10));
    const dangerZone1 = createDangerZone(new THREE.Vector3(-10, 0, -10), 5);

    // 添加新的键盘监听
    keys.ShiftLeft = false;  // 添加冲刺

    // 添加窗口大小化监听
    window.addEventListener('resize', onWindowResize, false);
}

function onMouseMove(event) {
    if (document.pointerLockElement === document.body) {
        player.rotation.y -= event.movementX * rotateSpeed;
        if (!thirdPersonCamera) {
            player.rotation.x = Math.max(
                -Math.PI/2,
                Math.min(Math.PI/2, player.rotation.x - event.movementY * rotateSpeed)
            );
        }
    }
}

function update() {
    if (!player || !playerModel) return;

    // 处理跳跃
    if (keys.Space && !isJumping) {
        isJumping = true;
        jumpVelocity = jumpSpeed;
    }

    if (isJumping) {
        player.position.y += jumpVelocity;
        jumpVelocity -= gravity;

        if (player.position.y <= groundLevel) {
            player.position.y = groundLevel;
            isJumping = false;
            jumpVelocity = 0;
        }
    }

    // 重置移动方向
    moveDirection.set(0, 0, 0);
    
    if (thirdPersonCamera) {
        // 第三人称移动控制
        // 获取相机的前进方向（忽略Y轴）
        const cameraForward = new THREE.Vector3(0, 0, -1);
        cameraForward.applyQuaternion(camera.quaternion);
        cameraForward.y = 0;
        cameraForward.normalize();

        // 取相机的右方向
        const cameraRight = new THREE.Vector3(1, 0, 0);
        cameraRight.applyQuaternion(camera.quaternion);
        cameraRight.y = 0;
        cameraRight.normalize();

        // 根据按键和相机方向计算移动
        if (keys.KeyW) moveDirection.add(cameraForward);
        if (keys.KeyS) moveDirection.sub(cameraForward);
        if (keys.KeyD) moveDirection.add(cameraRight);
        if (keys.KeyA) moveDirection.sub(cameraRight);
    } else {
        // 第一人称移动控制
        if (keys.KeyW) moveDirection.z -= 1;
        if (keys.KeyS) moveDirection.z += 1;
        if (keys.KeyD) moveDirection.x += 1;
        if (keys.KeyA) moveDirection.x -= 1;
    }

    if (moveDirection.length() > 0) {
        moveDirection.normalize();
        if (!thirdPersonCamera) {
            // 只在第一人称时应用玩家旋转
            moveDirection.applyEuler(new THREE.Euler(0, player.rotation.y, 0));
        }
        player.position.addScaledVector(moveDirection, moveSpeed);
        playerModel.position.copy(player.position);
        playerModel.rotation.y = player.rotation.y;
    }

    updateCamera();

    // 更新收集物和特效
    checkCollectibles();
    updateParticles();

    // 处理刺
    handleSprint();

    // 检危险区域
    const dangerZones = scene.children.filter(child => 
        child.geometry instanceof THREE.CircleGeometry);
    
    dangerZones.forEach(zone => {
        const distance = player.position.distanceTo(zone.position);
        if (distance < zone.geometry.parameters.radius) {
            damagePlayer(0.5);  // 每帧损失0.5血量
        }
    });

    // 检查检查点
    const checkpoints = scene.children.filter(child => 
        child.geometry instanceof THREE.CylinderGeometry);
    
    checkpoints.forEach(checkpoint => {
        const distance = player.position.distanceTo(checkpoint.position);
        if (distance < 1.5) {
            lastCheckpointPosition.copy(checkpoint.position);
        }
    });

    // 更新动画混合器
    if (mixer) {
        mixer.update(0.016); // 假设60fps
    }
    
    updateCharacterAnimation();

    // 更新MMD动画
    if (mmdHelper) {
        mmdHelper.update(clock.getDelta());
    }
    
    renderer.render(scene, camera);
}

function animate() {
    requestAnimationFrame(animate);
    update();
    
    // 更新收集物的旋转动画
    collectibles.forEach(item => {
        if(item.visible) {
            item.rotation.y += item.userData.rotationSpeed;
            item.position.y = 1 + Math.sin(Date.now() * 0.002 + item.userData.floatOffset) * 0.2;
        }
    });
}

// 添加冲机制
function handleSprint() {
    if (keys.ShiftLeft && stamina > 0) {
        isRunning = true;
        moveSpeed = runSpeed;
        stamina = Math.max(0, stamina - 1);
    } else {
        isRunning = false;
        moveSpeed = walkSpeed;
        if (stamina < maxStamina) {
            stamina = Math.min(maxStamina, stamina + staminaRegenRate);
        }
    }
}

// 添加检查点系统
function createCheckpoint(position) {
    const checkpointGeometry = new THREE.CylinderGeometry(0.5, 0.5, 2, 8);
    const checkpointMaterial = new THREE.MeshPhongMaterial({
        color: 0x00ff00,
        emissive: 0x00ff00,
        emissiveIntensity: 0.5,
        transparent: true,
        opacity: 0.7
    });
    const checkpoint = new THREE.Mesh(checkpointGeometry, checkpointMaterial);
    checkpoint.position.copy(position);
    checkpoint.position.y = 1;
    scene.add(checkpoint);
    return checkpoint;
}

// 添加危险区域
function createDangerZone(position, radius) {
    const zoneGeometry = new THREE.CircleGeometry(radius, 32);
    const zoneMaterial = new THREE.MeshBasicMaterial({
        color: 0xff0000,
        transparent: true,
        opacity: 0.3
    });
    const zone = new THREE.Mesh(zoneGeometry, zoneMaterial);
    zone.rotation.x = -Math.PI / 2;
    zone.position.copy(position);
    zone.position.y = 0.1;
    scene.add(zone);
    return zone;
}

// 更新UI显示
function updateUI() {
    scoreElement.textContent = `分数: ${score}`;
    document.getElementById('health').style.width = `${health}%`;
    document.getElementById('stamina').style.width = `${stamina}%`;
}

// 处玩家受伤
function damagePlayer(amount) {
    health -= amount;
    if (health <= 0) {
        respawnPlayer();
    }
    updateUI();
}

// 玩家重生
function respawnPlayer() {
    health = 100;
    stamina = maxStamina;
    player.position.copy(lastCheckpointPosition);
    updateUI();
}

// 更新画状态
function updateCharacterAnimation() {
    if (!mixer || !playerModel || !playerModel.animations) return;
    
    // 根据状态选择动画
    let currentAnimationName = 'idle'; // 默认动画
    
    if (isJumping) {
        currentAnimationName = 'jump';
    } else if (moveDirection.length() > 0) {
        currentAnimationName = isRunning ? 'run' : 'walk';
    }
    
    // 如果当前动画不是正在播放的动画，切换动画
    if (currentAnimation !== currentAnimationName) {
        const currentAction = playerModel.animations[currentAnimation];
        const newAction = playerModel.animations[currentAnimationName];
        
        if (currentAction) {
            currentAction.fadeOut(0.5);
        }
        if (newAction) {
            newAction.reset().fadeIn(0.5).play();
        }
        
        currentAnimation = currentAnimationName;
    }
}

init();
animate(); 
