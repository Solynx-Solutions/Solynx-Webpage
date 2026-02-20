(() => {
    const canvas = document.getElementById("flowCanvas");
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });

    function resize() {
        const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
        const rect = canvas.getBoundingClientRect();
        canvas.width = Math.floor(rect.width * dpr);
        canvas.height = Math.floor(rect.height * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.imageSmoothingEnabled = false;
    }

    window.addEventListener("resize", resize, { passive: true });
    resize();

    // Tuned for "professional but alive" background
    const gridSize = 10;
    const steps = 90;
    const maxPop = 260;
    const birthFreq = 2;
    const lifespan = 850;
    const trailFade = 0.07;

    let stepCount = 0;
    const particles = [];

    const range = steps * gridSize;
    const gridSteps = Math.floor((2 * range) / gridSize);
    const grid = [];
    let idx = 0;

    for (let xx = -range; xx < range; xx += gridSize) {
        for (let yy = -range; yy < range; yy += gridSize) {
            const r = Math.hypot(xx, yy);
            const r0 = 120;
            let field = 0;
            if (r < r0) field = (255 / r0) * r;
            else field = 255 - Math.min(255, (r - r0) / 2);

            const isEdge =
                xx === -range ? "left" :
                    (xx === (-range + gridSize * (gridSteps - 1)) ? "right" :
                        (yy === -range ? "top" :
                            (yy === (-range + gridSize * (gridSteps - 1)) ? "bottom" : false)));

            grid.push({ x: xx, y: yy, busyAge: 0, spotIndex: idx, isEdge, field });
            idx++;
        }
    }

    function initDraw() {
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    }
    initDraw();

    function birth() {
        const gridSpotIndex = Math.floor(Math.random() * grid.length);
        const spot = grid[gridSpotIndex];
        const x = spot.x, y = spot.y;

        particles.push({
            hue: 195,                 // teal-blue base
            sat: 92,
            lum: 38 + Math.floor(18 * Math.random()),
            x, y,
            xLast: x, yLast: y,
            xSpeed: 0, ySpeed: 0,
            age: 0,
            ageSinceStuck: 0,
            attractor: { oldIndex: gridSpotIndex, gridSpotIndex },
        });
    }

    function maxBy(list, scoreFn) {
        let best = list[0], bestScore = scoreFn(best);
        for (let i = 1; i < list.length; i++) {
            const s = scoreFn(list[i]);
            if (s > bestScore) { best = list[i]; bestScore = s; }
        }
        return best;
    }

    function dataToCanvas(x, y) {
        const zoom = 1.6;
        const xc = canvas.clientWidth / 2;
        const yc = canvas.clientHeight / 2;
        return { x: xc + x * zoom, y: yc + y * zoom };
    }

    function move() {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.xLast = p.x; p.yLast = p.y;

            let index = p.attractor.gridSpotIndex;
            let gridSpot = grid[index];

            if (Math.random() < 0.5) {
                if (!gridSpot.isEdge) {
                    const topSpot = grid[index - 1];
                    const bottomSpot = grid[index + 1];
                    const leftSpot = grid[index - gridSteps];
                    const rightSpot = grid[index + gridSteps];

                    const chaos = 28;
                    const best = maxBy([topSpot, bottomSpot, leftSpot, rightSpot],
                        e => e.field + chaos * Math.random()
                    );

                    if (best.busyAge === 0 || best.busyAge > 15) {
                        p.ageSinceStuck = 0;
                        p.attractor.oldIndex = index;
                        p.attractor.gridSpotIndex = best.spotIndex;
                        gridSpot = best;
                        gridSpot.busyAge = 1;
                    } else p.ageSinceStuck++;
                } else p.ageSinceStuck++;

                if (p.ageSinceStuck >= 10) {
                    particles.splice(i, 1);
                    continue;
                }
            }

            // spring towards attractor
            const k = 8, visc = 0.4;
            const dx = p.x - gridSpot.x;
            const dy = p.y - gridSpot.y;

            p.xSpeed += (-k * dx);
            p.ySpeed += (-k * dy);
            p.xSpeed *= visc;
            p.ySpeed *= visc;

            p.x += 0.1 * p.xSpeed;
            p.y += 0.1 * p.ySpeed;

            p.age++;
            if (p.age > lifespan) particles.splice(i, 1);
        }

        for (let i = 0; i < grid.length; i++) {
            if (grid[i].busyAge > 0) grid[i].busyAge++;
        }
    }

    function draw() {
        ctx.fillStyle = `rgba(0,0,0,${trailFade})`;
        ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);

        for (let i = 0; i < particles.length; i++) {
            const p = particles[i];
            const h = p.hue + stepCount / 35;
            const last = dataToCanvas(p.xLast, p.yLast);
            const now = dataToCanvas(p.x, p.y);

            ctx.beginPath();
            ctx.strokeStyle = `hsla(${h}, ${p.sat}%, ${p.lum}%, 0.9)`;
            ctx.lineWidth = 1.3;
            ctx.moveTo(last.x, last.y);
            ctx.lineTo(now.x, now.y);
            ctx.stroke();
            ctx.closePath();
        }
    }

    // reduce motion / CPU on small screens
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isSmall = window.matchMedia && window.matchMedia("(max-width: 700px)").matches;

    function tick() {
        stepCount++;
        if (!reduce) {
            if (stepCount % birthFreq === 0 && particles.length < (isSmall ? 140 : maxPop)) birth();
            move();
            draw();
        }
        requestAnimationFrame(tick);
    }
    tick();
})();
