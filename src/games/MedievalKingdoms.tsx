import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

// Types
interface Position { x: number; y: number; }
interface Unit {
  id: number; type: 'peasant' | 'swordsman' | 'archer';
  pos: Position; target: Position | null; hp: number; maxHp: number;
  speed: number; attack: number; range: number; attackCooldown: number;
  team: 'player' | 'enemy'; carrying?: number; carryingType?: string;
  state: 'idle' | 'moving' | 'attacking' | 'gathering' | 'returning';
  targetBuilding?: number; targetUnit?: number;
}
interface Building {
  id: number; type: 'towncenter' | 'barracks' | 'farm' | 'tower' | 'house';
  pos: Position; hp: number; maxHp: number; team: 'player' | 'enemy';
  size: number; producing?: string; productionTimer?: number;
}
interface Resource {
  id: number; type: 'gold' | 'wood' | 'food'; pos: Position; amount: number;
}

const MAP_W = 1600, MAP_H = 1200;
const TILE = 40;

let nextId = 100;
const getId = () => nextId++;

export default function MedievalKingdoms() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const navigate = useNavigate();
  const [gold, setGold] = useState(200);
  const [wood, setWood] = useState(200);
  const [food, setFood] = useState(100);
  const [pop, setPop] = useState(3);
  const [maxPop, setMaxPop] = useState(5);
  const [selectedUnits, setSelectedUnits] = useState<number[]>([]);
  const [buildMode, setBuildMode] = useState<string | null>(null);
  const [gameOver, setGameOver] = useState<string | null>(null);
  const [camera, setCamera] = useState<Position>({ x: 0, y: 0 });
  const [selectedBuilding, setSelectedBuilding] = useState<number | null>(null);
  const [trainQueue, setTrainQueue] = useState<string[]>([]);

  const gameState = useRef({
    units: [] as Unit[],
    buildings: [] as Building[],
    resources: [] as Resource[],
    camera: { x: 0, y: 0 } as Position,
    mousePos: { x: 0, y: 0 } as Position,
    dragStart: null as Position | null,
    isDragging: false,
    buildPreview: null as Position | null,
    keys: {} as Record<string, boolean>,
    gold: 200, wood: 200, food: 100,
    pop: 3, maxPop: 5,
    gameOver: null as string | null,
    time: 0,
  });

  const initGame = useCallback(() => {
    const gs = gameState.current;
    gs.units = [];
    gs.buildings = [];
    gs.resources = [];
    gs.gameOver = null;
    gs.time = 0;

    // Player town center
    gs.buildings.push({
      id: getId(), type: 'towncenter', pos: { x: 200, y: 600 },
      hp: 1500, maxHp: 1500, team: 'player', size: 80
    });
    gs.buildings.push({
      id: getId(), type: 'house', pos: { x: 320, y: 550 },
      hp: 300, maxHp: 300, team: 'player', size: 50
    });

    // Player peasants
    for (let i = 0; i < 3; i++) {
      gs.units.push({
        id: getId(), type: 'peasant', pos: { x: 250 + i * 30, y: 700 },
        target: null, hp: 40, maxHp: 40, speed: 1.5, attack: 3, range: 20,
        attackCooldown: 0, team: 'player', state: 'idle'
      });
    }

    // Enemy town center
    gs.buildings.push({
      id: getId(), type: 'towncenter', pos: { x: 1400, y: 600 },
      hp: 1500, maxHp: 1500, team: 'enemy', size: 80
    });
    gs.buildings.push({
      id: getId(), type: 'barracks', pos: { x: 1280, y: 550 },
      hp: 500, maxHp: 500, team: 'enemy', size: 60
    });

    // Enemy units
    for (let i = 0; i < 2; i++) {
      gs.units.push({
        id: getId(), type: 'swordsman', pos: { x: 1350 + i * 30, y: 700 },
        target: null, hp: 80, maxHp: 80, speed: 1.2, attack: 10, range: 25,
        attackCooldown: 0, team: 'enemy', state: 'idle'
      });
    }
    gs.units.push({
      id: getId(), type: 'peasant', pos: { x: 1400, y: 700 },
      target: null, hp: 40, maxHp: 40, speed: 1.5, attack: 3, range: 20,
      attackCooldown: 0, team: 'enemy', state: 'idle'
    });

    // Resources
    const resourcePositions = [
      { x: 100, y: 400, type: 'gold' as const },
      { x: 150, y: 450, type: 'gold' as const },
      { x: 400, y: 300, type: 'wood' as const },
      { x: 450, y: 350, type: 'wood' as const },
      { x: 350, y: 800, type: 'wood' as const },
      { x: 800, y: 200, type: 'gold' as const },
      { x: 850, y: 250, type: 'wood' as const },
      { x: 700, y: 900, type: 'gold' as const },
      { x: 1100, y: 400, type: 'wood' as const },
      { x: 1200, y: 800, type: 'gold' as const },
      { x: 600, y: 500, type: 'food' as const },
      { x: 650, y: 550, type: 'food' as const },
      { x: 900, y: 700, type: 'food' as const },
    ];
    resourcePositions.forEach(r => {
      gs.resources.push({ id: getId(), type: r.type, pos: { x: r.x, y: r.y }, amount: 500 });
    });

    gs.pop = 3;
    gs.maxPop = 5;
    gs.gold = 200;
    gs.wood = 200;
    gs.food = 100;
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

    const updateUnit = (unit: Unit, dt: number) => {
      if (unit.hp <= 0) return;
      unit.attackCooldown = Math.max(0, unit.attackCooldown - dt);

      if (unit.state === 'moving' && unit.target) {
        const d = dist(unit.pos, unit.target);
        if (d < 5) {
          unit.state = 'idle';
          unit.target = null;
        } else {
          const dx = (unit.target.x - unit.pos.x) / d;
          const dy = (unit.target.y - unit.pos.y) / d;
          unit.pos.x += dx * unit.speed * dt * 60;
          unit.pos.y += dy * unit.speed * dt * 60;
        }
      }

      if (unit.state === 'attacking' && unit.targetUnit !== undefined) {
        const target = gameState.current.units.find(u => u.id === unit.targetUnit);
        if (!target || target.hp <= 0) {
          unit.state = 'idle';
          unit.targetUnit = undefined;
          return;
        }
        const d = dist(unit.pos, target.pos);
        if (d <= unit.range) {
          if (unit.attackCooldown <= 0) {
            target.hp -= unit.attack;
            unit.attackCooldown = 1;
          }
        } else {
          const dx = (target.pos.x - unit.pos.x) / d;
          const dy = (target.pos.y - unit.pos.y) / d;
          unit.pos.x += dx * unit.speed * dt * 60;
          unit.pos.y += dy * unit.speed * dt * 60;
        }
      }

      if (unit.state === 'gathering' && unit.targetBuilding !== undefined) {
        const res = gameState.current.resources.find(r => r.id === unit.targetBuilding);
        if (!res || res.amount <= 0) {
          unit.state = 'idle';
          unit.targetBuilding = undefined;
          return;
        }
        const d = dist(unit.pos, res.pos);
        if (d <= 40) {
          if (unit.attackCooldown <= 0) {
            const gather = Math.min(10, res.amount);
            res.amount -= gather;
            unit.carrying = (unit.carrying || 0) + gather;
            unit.carryingType = res.type;
            unit.attackCooldown = 1.5;
            unit.state = 'returning';
          }
        } else {
          const dx = (res.pos.x - unit.pos.x) / d;
          const dy = (res.pos.y - unit.pos.y) / d;
          unit.pos.x += dx * unit.speed * dt * 60;
          unit.pos.y += dy * unit.speed * dt * 60;
        }
      }

      if (unit.state === 'returning') {
        const tc = gameState.current.buildings.find(b => b.type === 'towncenter' && b.team === unit.team);
        if (!tc) { unit.state = 'idle'; return; }
        const d = dist(unit.pos, tc.pos);
        if (d <= 60) {
          if (unit.carrying && unit.carryingType) {
            const gs = gameState.current;
            if (unit.carryingType === 'gold') gs.gold += unit.carrying;
            else if (unit.carryingType === 'wood') gs.wood += unit.carrying;
            else if (unit.carryingType === 'food') gs.food += unit.carrying;
          }
          unit.carrying = 0;
          unit.carryingType = undefined;
          unit.state = 'idle';
        } else {
          const dx = (tc.pos.x - unit.pos.x) / d;
          const dy = (tc.pos.y - unit.pos.y) / d;
          unit.pos.x += dx * unit.speed * dt * 60;
          unit.pos.y += dy * unit.speed * dt * 60;
        }
      }

      // Attack building
      if (unit.state === 'attacking' && unit.targetBuilding !== undefined && unit.targetUnit === undefined) {
        const bld = gameState.current.buildings.find(b => b.id === unit.targetBuilding);
        if (!bld || bld.hp <= 0) {
          unit.state = 'idle';
          unit.targetBuilding = undefined;
          return;
        }
        const d = dist(unit.pos, bld.pos);
        if (d <= unit.range + bld.size / 2) {
          if (unit.attackCooldown <= 0) {
            bld.hp -= unit.attack;
            unit.attackCooldown = 1;
          }
        } else {
          const dx = (bld.pos.x - unit.pos.x) / d;
          const dy = (bld.pos.y - unit.pos.y) / d;
          unit.pos.x += dx * unit.speed * dt * 60;
          unit.pos.y += dy * unit.speed * dt * 60;
        }
      }

      // Tower auto-attack
      if (unit.type === 'archer' && unit.state === 'idle' && unit.team === 'player') {
        // Player archers don't auto-attack, only enemy towers do
      }
    };

    const updateBuilding = (bld: Building, dt: number) => {
      if (bld.team === 'enemy' && bld.type === 'barracks') {
        bld.productionTimer = (bld.productionTimer || 0) + dt;
        if (bld.productionTimer >= 15) {
          bld.productionTimer = 0;
          const enemySwordsmen = gameState.current.units.filter(u => u.team === 'enemy' && u.type === 'swordsman' && u.hp > 0);
          if (enemySwordsmen.length < 5) {
            gameState.current.units.push({
              id: getId(), type: 'swordsman',
              pos: { x: bld.pos.x + 40, y: bld.pos.y + 40 },
              target: null, hp: 80, maxHp: 80, speed: 1.2, attack: 10, range: 25,
              attackCooldown: 0, team: 'enemy', state: 'idle'
            });
          }
        }
      }

      // Enemy swordsmen attack player buildings
      if (bld.team === 'enemy') {
        const enemySwordsmen = gameState.current.units.filter(u => u.team === 'enemy' && u.type === 'swordsman' && u.hp > 0 && u.state === 'idle');
        if (enemySwordsmen.length > 0 && Math.random() < 0.001) {
          const playerBuildings = gameState.current.buildings.filter(b => b.team === 'player' && b.hp > 0);
          if (playerBuildings.length > 0) {
            const target = playerBuildings[Math.floor(Math.random() * playerBuildings.length)];
            enemySwordsmen.forEach(u => {
              u.state = 'attacking';
              u.targetBuilding = target.id;
            });
          }
        }
      }

      // Tower attack
      if (bld.type === 'tower' && bld.hp > 0) {
        const enemies = gameState.current.units.filter(u => u.team !== bld.team && u.hp > 0);
        const inRange = enemies.filter(e => dist(e.pos, bld.pos) < 200);
        if (inRange.length > 0) {
          bld.productionTimer = (bld.productionTimer || 0) + dt;
          if (bld.productionTimer >= 2) {
            bld.productionTimer = 0;
            inRange[0].hp -= 15;
          }
        }
      }
    };

    const aiUpdate = (dt: number) => {
      const gs = gameState.current;
      // Enemy peasants gather
      const enemyPeasants = gs.units.filter(u => u.team === 'enemy' && u.type === 'peasant' && u.state === 'idle' && u.hp > 0);
      enemyPeasants.forEach(p => {
        const resources = gs.resources.filter(r => r.amount > 0);
        if (resources.length > 0) {
          const closest = resources.reduce((a, b) => dist(a.pos, p.pos) < dist(b.pos, p.pos) ? a : b);
          p.state = 'gathering';
          p.targetBuilding = closest.id;
        }
      });

      // Send idle enemy swordsmen to attack
      const idleEnemySwordsmen = gs.units.filter(u => u.team === 'enemy' && u.type === 'swordsman' && u.state === 'idle' && u.hp > 0);
      if (idleEnemySwordsmen.length >= 3) {
        const playerTC = gs.buildings.find(b => b.team === 'player' && b.type === 'towncenter' && b.hp > 0);
        if (playerTC) {
          idleEnemySwordsmen.forEach(u => {
            u.state = 'attacking';
            u.targetBuilding = playerTC.id;
          });
        }
      }
    };

    let lastTime = 0;
    const gameLoop = (time: number) => {
      const dt = Math.min((time - lastTime) / 1000, 0.05);
      lastTime = time;

      const gs = gameState.current;
      if (gs.gameOver) {
        animId = requestAnimationFrame(gameLoop);
        return;
      }

      gs.time += dt;

      // Camera movement with keys
      const camSpeed = 5;
      if (gs.keys['w'] || gs.keys['arrowup']) gs.camera.y -= camSpeed;
      if (gs.keys['s'] || gs.keys['arrowdown']) gs.camera.y += camSpeed;
      if (gs.keys['a'] || gs.keys['arrowleft']) gs.camera.x -= camSpeed;
      if (gs.keys['d'] || gs.keys['arrowright']) gs.camera.x += camSpeed;
      gs.camera.x = Math.max(0, Math.min(MAP_W - canvas.width, gs.camera.x));
      gs.camera.y = Math.max(0, Math.min(MAP_H - canvas.height, gs.camera.y));

      // Update units
      gs.units = gs.units.filter(u => u.hp > 0);
      gs.units.forEach(u => updateUnit(u, dt));

      // Update buildings
      gs.buildings = gs.buildings.filter(b => b.hp > 0);
      gs.buildings.forEach(b => updateBuilding(b, dt));

      // AI
      aiUpdate(dt);

      // Check win/lose
      const playerTC = gs.buildings.find(b => b.team === 'player' && b.type === 'towncenter');
      const enemyTC = gs.buildings.find(b => b.team === 'enemy' && b.type === 'towncenter');
      if (!playerTC) gs.gameOver = 'defeat';
      if (!enemyTC) gs.gameOver = 'victory';

      // Update React state
      setGold(gs.gold);
      setWood(gs.wood);
      setFood(gs.food);
      setPop(gs.pop);
      setMaxPop(gs.maxPop);
      setGameOver(gs.gameOver);
      setCamera({ ...gs.camera });

      // Render
      render(ctx, canvas);
      animId = requestAnimationFrame(gameLoop);
    };

    animId = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(animId);
  }, []);

  const render = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    const gs = gameState.current;
    const cam = gs.camera;

    // Background
    ctx.fillStyle = '#2d5a27';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grid
    ctx.strokeStyle = 'rgba(0,0,0,0.1)';
    ctx.lineWidth = 0.5;
    const startX = -(cam.x % TILE);
    const startY = -(cam.y % TILE);
    for (let x = startX; x < canvas.width; x += TILE) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = startY; y < canvas.height; y += TILE) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }

    // Resources
    gs.resources.forEach(r => {
      if (r.amount <= 0) return;
      const sx = r.pos.x - cam.x, sy = r.pos.y - cam.y;
      if (sx < -50 || sx > canvas.width + 50 || sy < -50 || sy > canvas.height + 50) return;

      if (r.type === 'gold') {
        ctx.fillStyle = '#ffd700';
        ctx.beginPath();
        ctx.arc(sx, sy, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#b8860b';
        ctx.beginPath();
        ctx.arc(sx - 5, sy - 5, 8, 0, Math.PI * 2);
        ctx.fill();
      } else if (r.type === 'wood') {
        ctx.fillStyle = '#228b22';
        ctx.beginPath();
        ctx.arc(sx, sy, 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#654321';
        ctx.fillRect(sx - 3, sy + 10, 6, 15);
      } else {
        ctx.fillStyle = '#90ee90';
        ctx.fillRect(sx - 15, sy - 15, 30, 30);
        ctx.fillStyle = '#ffd700';
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.arc(sx - 8 + i * 8, sy, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    });

    // Buildings
    gs.buildings.forEach(b => {
      const sx = b.pos.x - cam.x, sy = b.pos.y - cam.y;
      if (sx < -100 || sx > canvas.width + 100 || sy < -100 || sy > canvas.height + 100) return;

      const s = b.size;
      const color = b.team === 'player' ? '#4169e1' : '#dc143c';
      const roofColor = b.team === 'player' ? '#1e3a8a' : '#8b0000';

      if (b.type === 'towncenter') {
        ctx.fillStyle = color;
        ctx.fillRect(sx - s / 2, sy - s / 2, s, s);
        ctx.fillStyle = roofColor;
        ctx.beginPath();
        ctx.moveTo(sx - s / 2 - 10, sy - s / 2);
        ctx.lineTo(sx, sy - s / 2 - 30);
        ctx.lineTo(sx + s / 2 + 10, sy - s / 2);
        ctx.fill();
        ctx.fillStyle = '#8b4513';
        ctx.fillRect(sx - 8, sy + s / 2 - 20, 16, 20);
      } else if (b.type === 'barracks') {
        ctx.fillStyle = color;
        ctx.fillRect(sx - s / 2, sy - s / 2, s, s);
        ctx.fillStyle = roofColor;
        ctx.fillRect(sx - s / 2 - 5, sy - s / 2 - 10, s + 10, 15);
        ctx.fillStyle = '#fff';
        ctx.font = '16px serif';
        ctx.textAlign = 'center';
        ctx.fillText('⚔️', sx, sy + 5);
      } else if (b.type === 'farm') {
        ctx.fillStyle = '#8b4513';
        ctx.fillRect(sx - s / 2, sy - s / 2, s, s);
        ctx.fillStyle = '#90ee90';
        for (let i = 0; i < 4; i++) {
          for (let j = 0; j < 4; j++) {
            ctx.fillRect(sx - s / 2 + 5 + i * 12, sy - s / 2 + 5 + j * 12, 8, 8);
          }
        }
      } else if (b.type === 'tower') {
        ctx.fillStyle = '#696969';
        ctx.fillRect(sx - 15, sy - 30, 30, 60);
        ctx.fillStyle = color;
        ctx.fillRect(sx - 18, sy - 35, 36, 10);
        ctx.fillStyle = '#333';
        ctx.fillRect(sx - 5, sy + 10, 10, 20);
      } else if (b.type === 'house') {
        ctx.fillStyle = color;
        ctx.fillRect(sx - s / 2, sy - s / 2, s, s);
        ctx.fillStyle = roofColor;
        ctx.beginPath();
        ctx.moveTo(sx - s / 2 - 5, sy - s / 2);
        ctx.lineTo(sx, sy - s / 2 - 20);
        ctx.lineTo(sx + s / 2 + 5, sy - s / 2);
        ctx.fill();
      }

      // HP bar
      const hpPct = b.hp / b.maxHp;
      ctx.fillStyle = '#333';
      ctx.fillRect(sx - 25, sy - s / 2 - 20, 50, 6);
      ctx.fillStyle = hpPct > 0.5 ? '#4caf50' : hpPct > 0.25 ? '#ff9800' : '#f44336';
      ctx.fillRect(sx - 25, sy - s / 2 - 20, 50 * hpPct, 6);
    });

    // Units
    gs.units.forEach(u => {
      if (u.hp <= 0) return;
      const sx = u.pos.x - cam.x, sy = u.pos.y - cam.y;
      if (sx < -30 || sx > canvas.width + 30 || sy < -30 || sy > canvas.height + 30) return;

      const isSelected = selectedUnits.includes(u.id);
      const baseColor = u.team === 'player' ? '#4169e1' : '#dc143c';

      // Selection circle
      if (isSelected) {
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sx, sy, 16, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Unit body
      ctx.fillStyle = baseColor;
      ctx.beginPath();
      ctx.arc(sx, sy, 10, 0, Math.PI * 2);
      ctx.fill();

      // Unit type indicator
      ctx.fillStyle = '#fff';
      ctx.font = '12px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (u.type === 'peasant') ctx.fillText('👷', sx, sy);
      else if (u.type === 'swordsman') ctx.fillText('⚔️', sx, sy);
      else if (u.type === 'archer') ctx.fillText('🏹', sx, sy);

      // Carrying indicator
      if (u.carrying && u.carrying > 0) {
        ctx.fillStyle = u.carryingType === 'gold' ? '#ffd700' : u.carryingType === 'wood' ? '#8b4513' : '#90ee90';
        ctx.beginPath();
        ctx.arc(sx + 10, sy - 10, 5, 0, Math.PI * 2);
        ctx.fill();
      }

      // HP bar
      const hpPct = u.hp / u.maxHp;
      ctx.fillStyle = '#333';
      ctx.fillRect(sx - 12, sy - 18, 24, 4);
      ctx.fillStyle = hpPct > 0.5 ? '#4caf50' : hpPct > 0.25 ? '#ff9800' : '#f44336';
      ctx.fillRect(sx - 12, sy - 18, 24 * hpPct, 4);
    });

    // Build preview
    if (buildMode && gs.buildPreview) {
      const sx = gs.buildPreview.x - cam.x, sy = gs.buildPreview.y - cam.y;
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#4169e1';
      const size = buildMode === 'tower' ? 30 : buildMode === 'farm' ? 50 : 60;
      ctx.fillRect(sx - size / 2, sy - size / 2, size, size);
      ctx.globalAlpha = 1;
    }

    // Drag selection box
    if (gs.isDragging && gs.dragStart) {
      ctx.strokeStyle = '#00ff00';
      ctx.lineWidth = 1;
      const x1 = gs.dragStart.x - cam.x, y1 = gs.dragStart.y - cam.y;
      const x2 = gs.mousePos.x, y2 = gs.mousePos.y;
      ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
    }

    // Minimap
    const mmW = 180, mmH = 135;
    const mmX = canvas.width - mmW - 10, mmY = canvas.height - mmH - 10;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(mmX, mmY, mmW, mmH);
    ctx.strokeStyle = '#666';
    ctx.strokeRect(mmX, mmY, mmW, mmH);

    const scaleX = mmW / MAP_W, scaleY = mmH / MAP_H;
    gs.buildings.forEach(b => {
      ctx.fillStyle = b.team === 'player' ? '#4169e1' : '#dc143c';
      ctx.fillRect(mmX + b.pos.x * scaleX - 2, mmY + b.pos.y * scaleY - 2, 4, 4);
    });
    gs.units.forEach(u => {
      if (u.hp <= 0) return;
      ctx.fillStyle = u.team === 'player' ? '#6495ed' : '#ff6b6b';
      ctx.fillRect(mmX + u.pos.x * scaleX - 1, mmY + u.pos.y * scaleY - 1, 2, 2);
    });
    gs.resources.forEach(r => {
      if (r.amount <= 0) return;
      ctx.fillStyle = r.type === 'gold' ? '#ffd700' : r.type === 'wood' ? '#228b22' : '#90ee90';
      ctx.fillRect(mmX + r.pos.x * scaleX - 1, mmY + r.pos.y * scaleY - 1, 3, 3);
    });

    // Camera rect on minimap
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.strokeRect(
      mmX + cam.x * scaleX, mmY + cam.y * scaleY,
      canvas.width * scaleX, canvas.height * scaleY
    );
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

    const handleMouseDown = (e: MouseEvent) => {
      const gs = gameState.current;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left + gs.camera.x;
      const my = e.clientY - rect.top + gs.camera.y;

      if (buildMode) {
        // Place building
        const cost = getBuildCost(buildMode);
        if (gs.gold >= cost.gold && gs.wood >= cost.wood && gs.food >= cost.food) {
          gs.gold -= cost.gold;
          gs.wood -= cost.wood;
          gs.food -= cost.food;
          const size = buildMode === 'tower' ? 30 : buildMode === 'farm' ? 50 : 60;
          gs.buildings.push({
            id: getId(), type: buildMode as Building['type'],
            pos: { x: mx, y: my }, hp: getBuildHp(buildMode), maxHp: getBuildHp(buildMode),
            team: 'player', size
          });
          if (buildMode === 'house') gs.maxPop += 5;
          setBuildMode(null);
        }
        return;
      }

      if (e.button === 0) {
        gs.dragStart = { x: mx, y: my };
        gs.isDragging = true;
      }

      if (e.button === 2) {
        // Right click - move or attack
        const clickedUnit = gs.units.find(u => u.team === 'player' && u.hp > 0 &&
          Math.sqrt((u.pos.x - mx) ** 2 + (u.pos.y - my) ** 2) < 20 && !selectedUnits.includes(u.id));
        const clickedEnemy = gs.units.find(u => u.team === 'enemy' && u.hp > 0 &&
          Math.sqrt((u.pos.x - mx) ** 2 + (u.pos.y - my) ** 2) < 20);
        const clickedBuilding = gs.buildings.find(b => b.team === 'enemy' && b.hp > 0 &&
          Math.sqrt((b.pos.x - mx) ** 2 + (b.pos.y - my) ** 2) < b.size / 2 + 10);
        const clickedResource = gs.resources.find(r => r.amount > 0 &&
          Math.sqrt((r.pos.x - mx) ** 2 + (r.pos.y - my) ** 2) < 30);
        const clickedTC = gs.buildings.find(b => b.team === 'player' && b.type === 'towncenter' &&
          Math.sqrt((b.pos.x - mx) ** 2 + (b.pos.y - my) ** 2) < 60);

        selectedUnits.forEach(uid => {
          const unit = gs.units.find(u => u.id === uid);
          if (!unit) return;

          if (clickedEnemy) {
            unit.state = 'attacking';
            unit.targetUnit = clickedEnemy.id;
            unit.targetBuilding = undefined;
          } else if (clickedBuilding) {
            unit.state = 'attacking';
            unit.targetBuilding = clickedBuilding.id;
            unit.targetUnit = undefined;
          } else if (clickedResource && unit.type === 'peasant') {
            unit.state = 'gathering';
            unit.targetBuilding = clickedResource.id;
          } else if (clickedTC && unit.carrying && unit.carrying > 0) {
            unit.state = 'returning';
          } else {
            unit.state = 'moving';
            unit.target = { x: mx, y: my };
          }
        });
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      const gs = gameState.current;
      if (e.button === 0 && gs.isDragging && gs.dragStart) {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left + gs.camera.x;
        const my = e.clientY - rect.top + gs.camera.y;

        const x1 = Math.min(gs.dragStart.x, mx);
        const y1 = Math.min(gs.dragStart.y, my);
        const x2 = Math.max(gs.dragStart.x, mx);
        const y2 = Math.max(gs.dragStart.y, my);

        if (Math.abs(x2 - x1) < 5 && Math.abs(y2 - y1) < 5) {
          // Click select
          const clicked = gs.units.find(u => u.team === 'player' && u.hp > 0 &&
            Math.sqrt((u.pos.x - mx) ** 2 + (u.pos.y - my) ** 2) < 15);
          if (clicked) {
            setSelectedUnits([clicked.id]);
          } else {
            // Check building click
            const clickedBld = gs.buildings.find(b => b.team === 'player' && b.hp > 0 &&
              Math.sqrt((b.pos.x - mx) ** 2 + (b.pos.y - my) ** 2) < b.size / 2 + 10);
            if (clickedBld) {
              setSelectedBuilding(clickedBld.id);
              setSelectedUnits([]);
            } else {
              setSelectedUnits([]);
              setSelectedBuilding(null);
            }
          }
        } else {
          // Box select
          const selected = gs.units.filter(u => u.team === 'player' && u.hp > 0 &&
            u.pos.x >= x1 && u.pos.x <= x2 && u.pos.y >= y1 && u.pos.y <= y2
          ).map(u => u.id);
          setSelectedUnits(selected);
          setSelectedBuilding(null);
        }

        gs.isDragging = false;
        gs.dragStart = null;
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      const gs = gameState.current;
      const rect = canvas.getBoundingClientRect();
      gs.mousePos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      if (buildMode) {
        gs.buildPreview = { x: gs.mousePos.x + gs.camera.x, y: gs.mousePos.y + gs.camera.y };
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      gameState.current.keys[e.key.toLowerCase()] = true;
      
      if (e.key === 'Escape') {
        setBuildMode(null);
        setSelectedUnits([]);
        setSelectedBuilding(null);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      gameState.current.keys[e.key.toLowerCase()] = false;
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('keydown', handleKeyDown);
    canvas.addEventListener('keyup', handleKeyUp);
    canvas.addEventListener('contextmenu', handleContextMenu);

    return () => {
      window.removeEventListener('resize', handleResize);
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('keydown', handleKeyDown);
      canvas.removeEventListener('keyup', handleKeyUp);
      canvas.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [selectedUnits, buildMode]);

  const getBuildCost = (type: string) => {
    switch (type) {
      case 'barracks': return { gold: 50, wood: 100, food: 0 };
      case 'farm': return { gold: 0, wood: 50, food: 0 };
      case 'tower': return { gold: 50, wood: 80, food: 0 };
      case 'house': return { gold: 0, wood: 50, food: 0 };
      default: return { gold: 0, wood: 0, food: 0 };
    }
  };

  const getBuildHp = (type: string) => {
    switch (type) {
      case 'barracks': return 500;
      case 'farm': return 200;
      case 'tower': return 400;
      case 'house': return 300;
      default: return 300;
    }
  };

  const getUnitCost = (type: string) => {
    switch (type) {
      case 'peasant': return { gold: 20, wood: 0, food: 20 };
      case 'swordsman': return { gold: 40, wood: 20, food: 20 };
      case 'archer': return { gold: 30, wood: 40, food: 15 };
      default: return { gold: 0, wood: 0, food: 0 };
    }
  };

  const handleTrain = (type: string) => {
    const cost = getUnitCost(type);
    const gs = gameState.current;
    if (gs.gold >= cost.gold && gs.wood >= cost.wood && gs.food >= cost.food && gs.pop < gs.maxPop) {
      gs.gold -= cost.gold;
      gs.wood -= cost.wood;
      gs.food -= cost.food;
      gs.pop += 1;

      const tc = gs.buildings.find(b => b.team === 'player' && b.type === 'towncenter');
      const pos = tc ? { x: tc.pos.x + Math.random() * 60 - 30, y: tc.pos.y + 60 } : { x: 200, y: 700 };

      const unitData: Unit = {
        id: getId(), type: type as Unit['type'],
        pos, target: null,
        hp: type === 'peasant' ? 40 : type === 'swordsman' ? 80 : 50,
        maxHp: type === 'peasant' ? 40 : type === 'swordsman' ? 80 : 50,
        speed: type === 'peasant' ? 1.5 : type === 'swordsman' ? 1.2 : 1.3,
        attack: type === 'peasant' ? 3 : type === 'swordsman' ? 10 : 7,
        range: type === 'archer' ? 150 : 25,
        attackCooldown: 0, team: 'player', state: 'idle'
      };
      gs.units.push(unitData);
    }
  };

  const handleBuild = (type: string) => {
    const cost = getBuildCost(type);
    const gs = gameState.current;
    if (gs.gold >= cost.gold && gs.wood >= cost.wood) {
      setBuildMode(type);
    }
  };

  return (
    <div className="w-screen h-screen bg-black flex flex-col overflow-hidden">
      {/* Top bar - Resources */}
      <div className="h-12 bg-gray-900 border-b border-gray-700 flex items-center px-4 gap-6 text-sm">
        <button onClick={() => navigate('/')} className="text-gray-400 hover:text-white mr-4">← Меню</button>
        <span className="text-yellow-400">🪙 {Math.floor(gold)}</span>
        <span className="text-amber-600">🪵 {Math.floor(wood)}</span>
        <span className="text-green-400">🌾 {Math.floor(food)}</span>
        <span className="text-blue-300">👥 {pop}/{maxPop}</span>
        <div className="flex-1" />
        {gameOver && (
          <span className={`text-xl font-bold ${gameOver === 'victory' ? 'text-green-400' : 'text-red-400'}`}>
            {gameOver === 'victory' ? '🏆 ПОБЕДА!' : '💀 ПОРАЖЕНИЕ!'}
          </span>
        )}
      </div>

      {/* Canvas */}
      <canvas ref={canvasRef} className="flex-1 cursor-crosshair" tabIndex={0} />

      {/* Bottom bar - Actions */}
      <div className="h-16 bg-gray-900 border-t border-gray-700 flex items-center px-4 gap-2">
        <div className="text-gray-400 text-xs mr-2">Юниты:</div>
        <button onClick={() => handleTrain('peasant')} className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded text-xs" title="20🪙 20🌾">
          👷 Крестьянин
        </button>
        <button onClick={() => handleTrain('swordsman')} className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded text-xs" title="40🪙 20🪵 20🌾">
          ⚔️ Мечник
        </button>
        <button onClick={() => handleTrain('archer')} className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded text-xs" title="30🪙 40🪵 15🌾">
          🏹 Лучник
        </button>

        <div className="w-px h-8 bg-gray-700 mx-2" />
        <div className="text-gray-400 text-xs mr-2">Здания:</div>
        <button onClick={() => handleBuild('barracks')} className={`px-3 py-1 rounded text-xs ${buildMode === 'barracks' ? 'bg-blue-700' : 'bg-gray-700 hover:bg-gray-600'} text-white`}>
          🏠 Казарма (100🪵)
        </button>
        <button onClick={() => handleBuild('tower')} className={`px-3 py-1 rounded text-xs ${buildMode === 'tower' ? 'bg-blue-700' : 'bg-gray-700 hover:bg-gray-600'} text-white`}>
          🗼 Башня (50🪙 80🪵)
        </button>
        <button onClick={() => handleBuild('house')} className={`px-3 py-1 rounded text-xs ${buildMode === 'house' ? 'bg-blue-700' : 'bg-gray-700 hover:bg-gray-600'} text-white`}>
          🏘️ Дом +5поп (50🪵)
        </button>
        <button onClick={() => handleBuild('farm')} className={`px-3 py-1 rounded text-xs ${buildMode === 'farm' ? 'bg-blue-700' : 'bg-gray-700 hover:bg-gray-600'} text-white`}>
          🌾 Ферма (50🪵)
        </button>

        <div className="flex-1" />
        <div className="text-gray-500 text-xs">
          WASD - камера | ЛКМ - выбор | ПКМ - действие | ESC - отмена
        </div>
      </div>
    </div>
  );
}
