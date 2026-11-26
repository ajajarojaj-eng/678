import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

interface Position { x: number; y: number; }
interface SiegeUnit {
  id: number; type: 'infantry' | 'archer' | 'knight' | 'catapult' | 'ladder';
  pos: Position; target: Position | null; hp: number; maxHp: number;
  speed: number; attack: number; range: number; attackCooldown: number;
  team: 'player' | 'enemy'; state: 'moving' | 'attacking' | 'dead';
  targetId?: number;
}
interface Wall {
  id: number; pos: Position; hp: number; maxHp: number; team: 'player' | 'enemy';
  type: 'wall' | 'tower' | 'gate'; height: number;
}
interface Projectile {
  id: number; pos: Position; vel: Position; damage: number; team: 'player' | 'enemy';
  lifetime: number; type: 'arrow' | 'rock';
}

const MAP_W = 1400, MAP_H = 600;
const GROUND_Y = 480;
let nextId = 1000;
const getId = () => nextId++;

export default function CastleSiege() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const navigate = useNavigate();
  const [gold, setGold] = useState(300);
  const [gameOver, setGameOver] = useState<string | null>(null);
  const [wave, setWave] = useState(1);
  const [enemyCastleHp, setEnemyCastleHp] = useState(1000);
  const [playerCastleHp, setPlayerCastleHp] = useState(1000);
  const [score, setScore] = useState(0);

  const gameState = useRef({
    units: [] as SiegeUnit[],
    walls: [] as Wall[],
    projectiles: [] as Projectile[],
    gold: 300,
    wave: 1,
    enemyCastleHp: 1000,
    playerCastleHp: 1000,
    score: 0,
    gameOver: null as string | null,
    time: 0,
    waveTimer: 0,
    goldTimer: 0,
    selectedUnit: null as number | null,
    mousePos: { x: 0, y: 0 } as Position,
  });

  const initGame = useCallback(() => {
    const gs = gameState.current;
    gs.units = [];
    gs.walls = [];
    gs.projectiles = [];
    gs.gold = 300;
    gs.wave = 1;
    gs.enemyCastleHp = 1000;
    gs.playerCastleHp = 1000;
    gs.score = 0;
    gs.gameOver = null;
    gs.time = 0;
    gs.waveTimer = 0;
    gs.goldTimer = 0;

    // Player walls
    gs.walls.push({ id: getId(), pos: { x: 200, y: GROUND_Y }, hp: 500, maxHp: 500, team: 'player', type: 'wall', height: 80 });
    gs.walls.push({ id: getId(), pos: { x: 200, y: GROUND_Y - 80 }, hp: 400, maxHp: 400, team: 'player', type: 'tower', height: 120 });
    gs.walls.push({ id: getId(), pos: { x: 280, y: GROUND_Y }, hp: 300, maxHp: 300, team: 'player', type: 'gate', height: 60 });

    // Enemy castle
    gs.walls.push({ id: getId(), pos: { x: 1200, y: GROUND_Y }, hp: 500, maxHp: 500, team: 'enemy', type: 'wall', height: 80 });
    gs.walls.push({ id: getId(), pos: { x: 1200, y: GROUND_Y - 80 }, hp: 400, maxHp: 400, team: 'enemy', type: 'tower', height: 120 });
    gs.walls.push({ id: getId(), pos: { x: 1120, y: GROUND_Y }, hp: 500, maxHp: 500, team: 'enemy', type: 'wall', height: 80 });
    gs.walls.push({ id: getId(), pos: { x: 1280, y: GROUND_Y }, hp: 400, maxHp: 400, team: 'enemy', type: 'tower', height: 120 });
  }, []);

  useEffect(() => {
    initGame();
  }, [initGame]);

  // Game loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let animId: number;

    const dist = (a: Position, b: Position) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);

    const spawnEnemyWave = (wave: number) => {
      const gs = gameState.current;
      const count = 3 + wave * 2;
      for (let i = 0; i < count; i++) {
        const type = Math.random() < 0.3 ? 'archer' : Math.random() < 0.5 ? 'knight' : 'infantry';
        const unit: SiegeUnit = {
          id: getId(), type: type as SiegeUnit['type'],
          pos: { x: 1300 + Math.random() * 50, y: GROUND_Y - 15 },
          target: null, hp: type === 'knight' ? 100 : type === 'archer' ? 40 : 60,
          maxHp: type === 'knight' ? 100 : type === 'archer' ? 40 : 60,
          speed: type === 'knight' ? 1.5 : type === 'archer' ? 0.8 : 1,
          attack: type === 'knight' ? 15 : type === 'archer' ? 8 : 8,
          range: type === 'archer' ? 200 : 30,
          attackCooldown: 0, team: 'enemy', state: 'moving'
        };
        gs.units.push(unit);
      }

      // Catapult every 3 waves
      if (wave % 3 === 0) {
        gs.units.push({
          id: getId(), type: 'catapult',
          pos: { x: 1350, y: GROUND_Y - 20 },
          target: null, hp: 80, maxHp: 80, speed: 0.5, attack: 40, range: 300,
          attackCooldown: 0, team: 'enemy', state: 'moving'
        });
      }
    };

    const updateUnit = (unit: SiegeUnit, dt: number) => {
      if (unit.hp <= 0) return;
      unit.attackCooldown = Math.max(0, unit.attackCooldown - dt);

      const gs = gameState.current;

      if (unit.state === 'moving') {
        const targetX = unit.team === 'player' ? 1200 : 200;
        const dx = targetX - unit.pos.x;
        const dir = dx > 0 ? 1 : -1;

        // Check for walls in path
        const walls = gs.walls.filter(w => w.team !== unit.team && w.hp > 0);
        const wallInPath = walls.find(w => {
          const wallLeft = w.pos.x - 20;
          const wallRight = w.pos.x + 20;
          return unit.pos.x > wallLeft - 30 && unit.pos.x < wallRight + 30 &&
            ((unit.team === 'player' && unit.pos.x < w.pos.x) || (unit.team === 'enemy' && unit.pos.x > w.pos.x));
        });

        if (wallInPath && dist(unit.pos, wallInPath.pos) < unit.range + 30) {
          unit.state = 'attacking';
          unit.targetId = wallInPath.id;
        } else {
          unit.pos.x += dir * unit.speed * dt * 60;
        }

        // Check for enemy units in range
        const enemies = gs.units.filter(u => u.team !== unit.team && u.hp > 0);
        const enemyInRange = enemies.find(e => dist(e.pos, unit.pos) < unit.range + 20);
        if (enemyInRange) {
          unit.state = 'attacking';
          unit.targetId = enemyInRange.id;
        }

        // Check castle
        const castleX = unit.team === 'player' ? 1250 : 200;
        if (Math.abs(unit.pos.x - castleX) < unit.range + 30) {
          unit.state = 'attacking';
          unit.targetId = -1; // Castle
        }
      }

      if (unit.state === 'attacking') {
        const gs = gameState.current;
        let targetPos: Position | null = null;
        let targetAlive = true;

        if (unit.targetId === -1) {
          // Attacking castle
          targetPos = { x: unit.team === 'player' ? 1250 : 200, y: GROUND_Y - 40 };
        } else if (unit.targetId) {
          // Check if target is a wall or unit
          const wall = gs.walls.find(w => w.id === unit.targetId);
          const targetUnit = gs.units.find(u => u.id === unit.targetId);

          if (wall && wall.hp > 0) {
            targetPos = wall.pos;
          } else if (targetUnit && targetUnit.hp > 0) {
            targetPos = targetUnit.pos;
          } else {
            targetAlive = false;
          }
        }

        if (!targetAlive || !targetPos) {
          unit.state = 'moving';
          unit.targetId = undefined;
          return;
        }

        const d = dist(unit.pos, targetPos);
        if (d > unit.range + 30) {
          unit.state = 'moving';
          unit.targetId = undefined;
          return;
        }

        if (unit.attackCooldown <= 0) {
          unit.attackCooldown = unit.type === 'catapult' ? 3 : unit.type === 'archer' ? 1.5 : 1;

          if (unit.type === 'archer' || unit.type === 'catapult') {
            // Launch projectile
            gs.projectiles.push({
              id: getId(),
              pos: { x: unit.pos.x, y: unit.pos.y - 20 },
              vel: { x: (targetPos.x - unit.pos.x) * 0.02, y: -5 },
              damage: unit.attack,
              team: unit.team,
              lifetime: 3,
              type: unit.type === 'catapult' ? 'rock' : 'arrow'
            });
          } else {
            // Melee attack
            if (unit.targetId === -1) {
              if (unit.team === 'player') gs.enemyCastleHp -= unit.attack;
              else gs.playerCastleHp -= unit.attack;
            } else {
              const wall = gs.walls.find(w => w.id === unit.targetId);
              const targetUnit = gs.units.find(u => u.id === unit.targetId);
              if (wall) wall.hp -= unit.attack;
              if (targetUnit) targetUnit.hp -= unit.attack;
            }
          }
        }
      }
    };

    const updateProjectile = (proj: Projectile, dt: number) => {
      proj.pos.x += proj.vel.x * dt * 60;
      proj.pos.y += proj.vel.y * dt * 60;
      proj.vel.y += 0.15 * dt * 60; // gravity
      proj.lifetime -= dt;

      const gs = gameState.current;

      // Check hit ground
      if (proj.pos.y >= GROUND_Y) {
        proj.lifetime = 0;
        // Splash damage for rocks
        if (proj.type === 'rock') {
          const walls = gs.walls.filter(w => w.team !== proj.team && w.hp > 0);
          walls.forEach(w => {
            if (dist(proj.pos, w.pos) < 60) w.hp -= proj.damage * 0.5;
          });
          const units = gs.units.filter(u => u.team !== proj.team && u.hp > 0);
          units.forEach(u => {
            if (dist(proj.pos, u.pos) < 50) u.hp -= proj.damage * 0.5;
          });
        }
      }

      // Check hit units
      const enemies = gs.units.filter(u => u.team !== proj.team && u.hp > 0);
      enemies.forEach(e => {
        if (dist(proj.pos, e.pos) < 20 && proj.lifetime > 0) {
          e.hp -= proj.damage;
          proj.lifetime = 0;
        }
      });

      // Check hit walls
      const walls = gs.walls.filter(w => w.team !== proj.team && w.hp > 0);
      walls.forEach(w => {
        if (dist(proj.pos, w.pos) < 30 && proj.lifetime > 0) {
          w.hp -= proj.damage;
          proj.lifetime = 0;
        }
      });

      // Check castle hit
      const castleX = proj.team === 'player' ? 1250 : 200;
      if (Math.abs(proj.pos.x - castleX) < 40 && proj.pos.y < GROUND_Y && proj.pos.y > GROUND_Y - 120) {
        if (proj.team === 'player') gs.enemyCastleHp -= proj.damage;
        else gs.playerCastleHp -= proj.damage;
        proj.lifetime = 0;
      }
    };

    const updateWall = (wall: Wall, dt: number) => {
      if (wall.type === 'tower' && wall.hp > 0) {
        const gs = gameState.current;
        const enemies = gs.units.filter(u => u.team !== wall.team && u.hp > 0);
        const inRange = enemies.filter(e => dist(e.pos, wall.pos) < 250);
        if (inRange.length > 0) {
          wall.hp -= 0; // tower doesn't degrade
          gs.waveTimer += 0; // Use a separate timer
          if (Math.random() < dt * 0.5) {
            const target = inRange[0];
            gs.projectiles.push({
              id: getId(),
              pos: { x: wall.pos.x, y: wall.pos.y - wall.height },
              vel: { x: (target.pos.x - wall.pos.x) * 0.015, y: -3 },
              damage: 12,
              team: wall.team,
              lifetime: 2,
              type: 'arrow'
            });
          }
        }
      }
    };

    let lastTime = 0;
    const gameLoop = (time: number) => {
      const dt = Math.min((time - lastTime) / 1000, 0.05);
      lastTime = time;

      const gs = gameState.current;
      if (gs.gameOver) {
        render(ctx, canvas);
        animId = requestAnimationFrame(gameLoop);
        return;
      }

      gs.time += dt;
      gs.goldTimer += dt;
      gs.waveTimer += dt;

      // Passive gold income
      if (gs.goldTimer >= 3) {
        gs.goldTimer = 0;
        gs.gold += 10;
      }

      // Spawn waves
      if (gs.waveTimer >= 20) {
        gs.waveTimer = 0;
        gs.wave += 1;
        spawnEnemyWave(gs.wave);
      }

      // Initial wave
      if (gs.time > 2 && gs.wave === 1 && gs.units.filter(u => u.team === 'enemy').length === 0) {
        spawnEnemyWave(1);
      }

      // Update
      gs.units = gs.units.filter(u => u.hp > 0);
      gs.units.forEach(u => updateUnit(u, dt));
      gs.projectiles = gs.projectiles.filter(p => p.lifetime > 0);
      gs.projectiles.forEach(p => updateProjectile(p, dt));
      gs.walls.forEach(w => updateWall(w, dt));

      // Check win/lose
      if (gs.enemyCastleHp <= 0) {
        gs.gameOver = 'victory';
        gs.score += gs.wave * 100;
      }
      if (gs.playerCastleHp <= 0) {
        gs.gameOver = 'defeat';
      }

      // Update React state
      setGold(gs.gold);
      setWave(gs.wave);
      setEnemyCastleHp(Math.max(0, gs.enemyCastleHp));
      setPlayerCastleHp(Math.max(0, gs.playerCastleHp));
      setGameOver(gs.gameOver);
      setScore(gs.score);

      render(ctx, canvas);
      animId = requestAnimationFrame(gameLoop);
    };

    animId = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(animId);
  }, []);

  const render = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    const gs = gameState.current;

    // Sky
    const gradient = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    gradient.addColorStop(0, '#1a1a2e');
    gradient.addColorStop(0.5, '#16213e');
    gradient.addColorStop(1, '#0f3460');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, GROUND_Y);

    // Stars
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 50; i++) {
      const x = (i * 137.5) % canvas.width;
      const y = (i * 73.1) % (GROUND_Y * 0.6);
      ctx.fillRect(x, y, 1.5, 1.5);
    }

    // Moon
    ctx.fillStyle = '#f0e68c';
    ctx.beginPath();
    ctx.arc(canvas.width * 0.8, 80, 30, 0, Math.PI * 2);
    ctx.fill();

    // Ground
    ctx.fillStyle = '#2d5a27';
    ctx.fillRect(0, GROUND_Y, canvas.width, canvas.height - GROUND_Y);
    ctx.fillStyle = '#1a3d15';
    ctx.fillRect(0, GROUND_Y, canvas.width, 5);

    // Player castle (left)
    const pcx = 150, pcy = GROUND_Y;
    // Castle body
    ctx.fillStyle = '#4a5568';
    ctx.fillRect(pcx - 50, pcy - 100, 100, 100);
    // Battlements
    for (let i = 0; i < 5; i++) {
      ctx.fillRect(pcx - 55 + i * 25, pcy - 120, 15, 20);
    }
    // Gate
    ctx.fillStyle = '#2d3748';
    ctx.fillRect(pcx - 15, pcy - 50, 30, 50);
    // Flag
    ctx.fillStyle = '#3182ce';
    ctx.fillRect(pcx - 2, pcy - 150, 4, 50);
    ctx.fillStyle = '#4299e1';
    ctx.beginPath();
    ctx.moveTo(pcx + 2, pcy - 150);
    ctx.lineTo(pcx + 25, pcy - 140);
    ctx.lineTo(pcx + 2, pcy - 130);
    ctx.fill();

    // Enemy castle (right)
    const ecx = 1250, ecy = GROUND_Y;
    ctx.fillStyle = '#4a5568';
    ctx.fillRect(ecx - 50, ecy - 100, 100, 100);
    for (let i = 0; i < 5; i++) {
      ctx.fillRect(ecx - 55 + i * 25, ecy - 120, 15, 20);
    }
    ctx.fillStyle = '#2d3748';
    ctx.fillRect(ecx - 15, ecy - 50, 30, 50);
    ctx.fillStyle = '#e53e3e';
    ctx.fillRect(ecx - 2, ecy - 150, 4, 50);
    ctx.fillStyle = '#fc8181';
    ctx.beginPath();
    ctx.moveTo(ecx + 2, ecy - 150);
    ctx.lineTo(ecx + 25, ecy - 140);
    ctx.lineTo(ecx + 2, ecy - 130);
    ctx.fill();

    // Walls
    gs.walls.forEach(w => {
      if (w.hp <= 0) return;
      const sx = w.pos.x, sy = w.pos.y;

      if (w.type === 'wall') {
        ctx.fillStyle = w.team === 'player' ? '#5a6b7a' : '#7a5a5a';
        ctx.fillRect(sx - 15, sy - w.height, 30, w.height);
        // Battlements
        ctx.fillRect(sx - 18, sy - w.height - 10, 10, 10);
        ctx.fillRect(sx + 8, sy - w.height - 10, 10, 10);
      } else if (w.type === 'tower') {
        ctx.fillStyle = w.team === 'player' ? '#5a6b7a' : '#7a5a5a';
        ctx.fillRect(sx - 20, sy - w.height, 40, w.height);
        ctx.fillRect(sx - 25, sy - w.height - 15, 50, 15);
        // Arrow slits
        ctx.fillStyle = '#333';
        ctx.fillRect(sx - 3, sy - w.height + 30, 6, 15);
        ctx.fillRect(sx - 3, sy - w.height + 60, 6, 15);
      } else if (w.type === 'gate') {
        ctx.fillStyle = w.team === 'player' ? '#5a6b7a' : '#7a5a5a';
        ctx.fillRect(sx - 20, sy - w.height, 40, w.height);
        ctx.fillStyle = '#4a3728';
        ctx.fillRect(sx - 12, sy - w.height + 10, 24, w.height - 10);
      }

      // HP bar
      const hpPct = w.hp / w.maxHp;
      ctx.fillStyle = '#333';
      ctx.fillRect(sx - 20, sy - w.height - 25, 40, 5);
      ctx.fillStyle = hpPct > 0.5 ? '#4caf50' : hpPct > 0.25 ? '#ff9800' : '#f44336';
      ctx.fillRect(sx - 20, sy - w.height - 25, 40 * hpPct, 5);
    });

    // Units
    gs.units.forEach(u => {
      if (u.hp <= 0) return;
      const sx = u.pos.x, sy = u.pos.y;

      const isSelected = gs.selectedUnit === u.id;
      if (isSelected) {
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sx, sy, 18, 0, Math.PI * 2);
        ctx.stroke();
      }

      const baseColor = u.team === 'player' ? '#3182ce' : '#e53e3e';

      if (u.type === 'infantry') {
        // Body
        ctx.fillStyle = baseColor;
        ctx.fillRect(sx - 6, sy - 20, 12, 20);
        // Head
        ctx.fillStyle = '#ffd7ba';
        ctx.beginPath();
        ctx.arc(sx, sy - 25, 6, 0, Math.PI * 2);
        ctx.fill();
        // Sword
        ctx.strokeStyle = '#c0c0c0';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sx + 8, sy - 15);
        ctx.lineTo(sx + 18, sy - 25);
        ctx.stroke();
        // Shield
        ctx.fillStyle = u.team === 'player' ? '#2b6cb0' : '#c53030';
        ctx.fillRect(sx - 12, sy - 18, 6, 14);
      } else if (u.type === 'archer') {
        ctx.fillStyle = baseColor;
        ctx.fillRect(sx - 5, sy - 18, 10, 18);
        ctx.fillStyle = '#ffd7ba';
        ctx.beginPath();
        ctx.arc(sx, sy - 23, 5, 0, Math.PI * 2);
        ctx.fill();
        // Bow
        ctx.strokeStyle = '#8b4513';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sx + (u.team === 'player' ? 10 : -10), sy - 15, 10, -0.5, 0.5);
        ctx.stroke();
      } else if (u.type === 'knight') {
        // Armored body
        ctx.fillStyle = '#718096';
        ctx.fillRect(sx - 8, sy - 22, 16, 22);
        // Helmet
        ctx.fillStyle = '#a0aec0';
        ctx.beginPath();
        ctx.arc(sx, sy - 27, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = baseColor;
        ctx.fillRect(sx - 3, sy - 30, 6, 3);
        // Big sword
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(sx + 10, sy - 10);
        ctx.lineTo(sx + 22, sy - 30);
        ctx.stroke();
        // Horse hint
        ctx.fillStyle = '#8b4513';
        ctx.fillRect(sx - 10, sy, 20, 8);
      } else if (u.type === 'catapult') {
        // Frame
        ctx.fillStyle = '#8b4513';
        ctx.fillRect(sx - 20, sy - 15, 40, 15);
        // Wheels
        ctx.fillStyle = '#4a3728';
        ctx.beginPath();
        ctx.arc(sx - 15, sy, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(sx + 15, sy, 8, 0, Math.PI * 2);
        ctx.fill();
        // Arm
        ctx.strokeStyle = '#654321';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(sx, sy - 15);
        ctx.lineTo(sx + (u.team === 'player' ? 20 : -20), sy - 35);
        ctx.stroke();
        // Boulder
        ctx.fillStyle = '#696969';
        ctx.beginPath();
        ctx.arc(sx + (u.team === 'player' ? 20 : -20), sy - 38, 6, 0, Math.PI * 2);
        ctx.fill();
      } else if (u.type === 'ladder') {
        ctx.strokeStyle = '#8b4513';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(sx - 5, sy);
        ctx.lineTo(sx - 5, sy - 40);
        ctx.moveTo(sx + 5, sy);
        ctx.lineTo(sx + 5, sy - 40);
        ctx.stroke();
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.moveTo(sx - 5, sy - 10 * i);
          ctx.lineTo(sx + 5, sy - 10 * i);
          ctx.stroke();
        }
      }

      // HP bar
      const hpPct = u.hp / u.maxHp;
      ctx.fillStyle = '#333';
      ctx.fillRect(sx - 12, sy - 35, 24, 4);
      ctx.fillStyle = hpPct > 0.5 ? '#4caf50' : hpPct > 0.25 ? '#ff9800' : '#f44336';
      ctx.fillRect(sx - 12, sy - 35, 24 * hpPct, 4);
    });

    // Projectiles
    gs.projectiles.forEach(p => {
      if (p.type === 'arrow') {
        ctx.strokeStyle = p.team === 'player' ? '#90cdf4' : '#feb2b2';
        ctx.lineWidth = 2;
        const angle = Math.atan2(p.vel.y, p.vel.x);
        ctx.beginPath();
        ctx.moveTo(p.pos.x - Math.cos(angle) * 10, p.pos.y - Math.sin(angle) * 10);
        ctx.lineTo(p.pos.x + Math.cos(angle) * 5, p.pos.y + Math.sin(angle) * 5);
        ctx.stroke();
      } else {
        ctx.fillStyle = '#696969';
        ctx.beginPath();
        ctx.arc(p.pos.x, p.pos.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#4a4a4a';
        ctx.beginPath();
        ctx.arc(p.pos.x - 2, p.pos.y - 2, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // Castle HP bars
    // Player castle
    const pchPct = gs.playerCastleHp / 1000;
    ctx.fillStyle = '#333';
    ctx.fillRect(pcx - 40, pcy - 170, 80, 8);
    ctx.fillStyle = pchPct > 0.5 ? '#4caf50' : pchPct > 0.25 ? '#ff9800' : '#f44336';
    ctx.fillRect(pcx - 40, pcy - 170, 80 * pchPct, 8);
    ctx.fillStyle = '#fff';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.floor(gs.playerCastleHp)}/1000`, pcx, pcy - 175);

    // Enemy castle
    const echPct = gs.enemyCastleHp / 1000;
    ctx.fillStyle = '#333';
    ctx.fillRect(ecx - 40, ecy - 170, 80, 8);
    ctx.fillStyle = echPct > 0.5 ? '#4caf50' : echPct > 0.25 ? '#ff9800' : '#f44336';
    ctx.fillRect(ecx - 40, ecy - 170, 80 * echPct, 8);
    ctx.fillStyle = '#fff';
    ctx.fillText(`${Math.floor(gs.enemyCastleHp)}/1000`, ecx, ecy - 175);
  };

  // Event handlers
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight - 80;
    };
    handleResize();
    window.addEventListener('resize', handleResize);

    const handleClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      // Scale to game coordinates
      const scaleX = MAP_W / canvas.width;
      const scaleY = MAP_H / canvas.height;
      const gx = mx * scaleX;
      const gy = my * scaleY;

      const gs = gameState.current;
      const clicked = gs.units.find(u => u.team === 'player' && u.hp > 0 &&
        Math.sqrt((u.pos.x - gx) ** 2 + (u.pos.y - gy) ** 2) < 20);
      if (clicked) {
        gs.selectedUnit = clicked.id;
      } else {
        gs.selectedUnit = null;
      }
    };

    canvas.addEventListener('click', handleClick);
    return () => {
      window.removeEventListener('resize', handleResize);
      canvas.removeEventListener('click', handleClick);
    };
  }, []);

  const spawnUnit = (type: string) => {
    const gs = gameState.current;
    const cost = getUnitCost(type);
    if (gs.gold < cost) return;
    gs.gold -= cost;

    const unit: SiegeUnit = {
      id: getId(), type: type as SiegeUnit['type'],
      pos: { x: 180 + Math.random() * 30, y: GROUND_Y - (type === 'catapult' ? 20 : 15) },
      target: null,
      hp: type === 'knight' ? 100 : type === 'archer' ? 40 : type === 'catapult' ? 80 : 60,
      maxHp: type === 'knight' ? 100 : type === 'archer' ? 40 : type === 'catapult' ? 80 : 60,
      speed: type === 'knight' ? 1.5 : type === 'archer' ? 0.8 : type === 'catapult' ? 0.5 : 1,
      attack: type === 'knight' ? 15 : type === 'archer' ? 8 : type === 'catapult' ? 40 : 8,
      range: type === 'archer' ? 200 : type === 'catapult' ? 300 : 30,
      attackCooldown: 0, team: 'player', state: 'moving'
    };
    gs.units.push(unit);
  };

  const buildWall = () => {
    const gs = gameState.current;
    if (gs.gold < 50) return;
    gs.gold -= 50;
    gs.walls.push({
      id: getId(), pos: { x: 350 + gs.walls.filter(w => w.team === 'player').length * 60, y: GROUND_Y },
      hp: 400, maxHp: 400, team: 'player', type: 'wall', height: 80
    });
  };

  const buildTower = () => {
    const gs = gameState.current;
    if (gs.gold < 100) return;
    gs.gold -= 100;
    gs.walls.push({
      id: getId(), pos: { x: 350 + Math.random() * 200, y: GROUND_Y },
      hp: 500, maxHp: 500, team: 'player', type: 'tower', height: 120
    });
  };

  const repairCastle = () => {
    const gs = gameState.current;
    if (gs.gold < 80) return;
    gs.gold -= 80;
    gs.playerCastleHp = Math.min(1000, gs.playerCastleHp + 200);
  };

  const getUnitCost = (type: string) => {
    switch (type) {
      case 'infantry': return 30;
      case 'archer': return 40;
      case 'knight': return 80;
      case 'catapult': return 120;
      default: return 50;
    }
  };

  return (
    <div className="w-screen h-screen bg-black flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="h-12 bg-gray-900 border-b border-gray-700 flex items-center px-4 gap-6 text-sm">
        <button onClick={() => navigate('/')} className="text-gray-400 hover:text-white mr-4">← Меню</button>
        <span className="text-yellow-400">🪙 {Math.floor(gold)}</span>
        <span className="text-blue-300">🌊 Волна: {wave}</span>
        <span className="text-red-400">🏯 Враг: {enemyCastleHp}/1000</span>
        <span className="text-green-400">🏰 Замок: {playerCastleHp}/1000</span>
        <span className="text-purple-300">⭐ {score}</span>
        <div className="flex-1" />
        {gameOver && (
          <span className={`text-xl font-bold ${gameOver === 'victory' ? 'text-green-400' : 'text-red-400'}`}>
            {gameOver === 'victory' ? '🏆 ПОБЕДА! Замок врага разрушен!' : '💀 ПОРАЖЕНИЕ! Ваш замок пал!'}
          </span>
        )}
      </div>

      {/* Canvas */}
      <canvas ref={canvasRef} className="flex-1 cursor-pointer" />

      {/* Bottom bar - Actions */}
      <div className="h-16 bg-gray-900 border-t border-gray-700 flex items-center px-4 gap-2">
        <div className="text-gray-400 text-xs mr-2">Войска:</div>
        <button onClick={() => spawnUnit('infantry')} className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded text-xs">
          ⚔️ Пехота (30🪙)
        </button>
        <button onClick={() => spawnUnit('archer')} className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded text-xs">
          🏹 Лучник (40🪙)
        </button>
        <button onClick={() => spawnUnit('knight')} className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded text-xs">
          🐴 Рыцарь (80🪙)
        </button>
        <button onClick={() => spawnUnit('catapult')} className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded text-xs">
          💣 Катапульта (120🪙)
        </button>

        <div className="w-px h-8 bg-gray-700 mx-2" />
        <div className="text-gray-400 text-xs mr-2">Строения:</div>
        <button onClick={buildWall} className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded text-xs">
          🧱 Стена (50🪙)
        </button>
        <button onClick={buildTower} className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded text-xs">
          🗼 Башня (100🪙)
        </button>
        <button onClick={repairCastle} className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded text-xs">
          🔨 Починить замок (80🪙)
        </button>

        <div className="flex-1" />
        <div className="text-gray-500 text-xs">
          Враги атакуют волнами каждые 20 сек. Уничтожьте вражеский замок!
        </div>
      </div>
    </div>
  );
}
