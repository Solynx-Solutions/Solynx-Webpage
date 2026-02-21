(() => {
    const canvas = document.getElementById('flowCanvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    let W, H, dpr;

    /* ── Resize ────────────────────────────────────────── */
    function resize() {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        W = window.innerWidth;
        H = window.innerHeight;
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        canvas.style.width = W + 'px';
        canvas.style.height = H + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    window.addEventListener('resize', resize, { passive: true });
    resize();

    /* ── Config ────────────────────────────────────────── */
    const CFG = {
        // Aurora blobs
        auroraCount: 5,
        // Mesh grid
        gridCols: 16,
        gridRows: 10,
        gridPulse: true,
        // Floating particles
        particleMax: 120,
        particleBirth: 2,       // new per frame
        // Motion reduction
        reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    };

    /* ── Colour palette ────────────────────────────────── */
    const PALETTE = {
        cyan: { h: 185, s: 100, l: 52 },   // #00f0ff family
        orange: { h: 32, s: 100, l: 50 },    // #ff9000 family
        teal: { h: 172, s: 80, l: 42 },
        violet: { h: 255, s: 70, l: 60 },
    };
    const COLORS = [PALETTE.cyan, PALETTE.teal, PALETTE.orange, PALETTE.violet, PALETTE.cyan];

    /* ── Aurora blobs ──────────────────────────────────── */
    const auroras = Array.from({ length: CFG.auroraCount }, (_, i) => ({
        cx: W * (0.15 + i * 0.18),
        cy: H * (0.25 + (i % 2) * 0.45),
        rx: 200 + Math.random() * 220,
        ry: 160 + Math.random() * 180,
        col: COLORS[i % COLORS.length],
        phase: Math.random() * Math.PI * 2,
        speed: 0.0004 + Math.random() * 0.0005,
        dx: (Math.random() - 0.5) * 0.3,
        dy: (Math.random() - 0.5) * 0.15,
    }));

    /* ── Mesh grid vertices ────────────────────────────── */
    const verts = [];
    for (let row = 0; row <= CFG.gridRows; row++) {
        for (let col = 0; col <= CFG.gridCols; col++) {
            verts.push({
                bx: (col / CFG.gridCols) * W,
                by: (row / CFG.gridRows) * H,
                ox: 0, oy: 0,           // current offset
                tx: 0, ty: 0,           // target offset
                amp: 10 + Math.random() * 18,
                phase: Math.random() * Math.PI * 2,
                spd: 0.003 + Math.random() * 0.004,
            });
        }
    }

    /* ── Particles ─────────────────────────────────────── */
    const particles = [];
    function spawnParticle() {
        const edge = Math.floor(Math.random() * 4);
        let x, y;
        if (edge === 0) { x = Math.random() * W; y = -5; }
        else if (edge === 1) { x = W + 5; y = Math.random() * H; }
        else if (edge === 2) { x = Math.random() * W; y = H + 5; }
        else { x = -5; y = Math.random() * H; }

        const col = COLORS[Math.floor(Math.random() * COLORS.length)];
        const speed = 0.25 + Math.random() * 0.6;
        const angle = Math.atan2(H / 2 - y, W / 2 - x) + (Math.random() - 0.5) * 1.2;

        particles.push({
            x, y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            size: 1.2 + Math.random() * 2.2,
            col,
            alpha: 0,
            life: 0,
            maxLife: 260 + Math.random() * 300,
            trail: [],
        });
    }

    /* ── Time ──────────────────────────────────────────── */
    let t = 0;

    /* ── Draw aurora blobs ─────────────────────────────── */
    function drawAuroras() {
        for (const a of auroras) {
            // drift
            a.cx += Math.sin(t * a.speed * 0.7 + a.phase) * 0.35;
            a.cy += Math.cos(t * a.speed * 0.5 + a.phase) * 0.2;

            // keep on screen
            a.cx = Math.max(a.rx * 0.4, Math.min(W - a.rx * 0.4, a.cx));
            a.cy = Math.max(a.ry * 0.4, Math.min(H - a.ry * 0.4, a.cy));

            const pulse = 0.8 + 0.2 * Math.sin(t * a.speed * 3 + a.phase);
            const rx = a.rx * pulse;
            const ry = a.ry * pulse;

            const grd = ctx.createRadialGradient(a.cx, a.cy, 0, a.cx, a.cy, Math.max(rx, ry));
            const { h, s, l } = a.col;
            grd.addColorStop(0, `hsla(${h},${s}%,${l}%, 0.18)`);
            grd.addColorStop(0.4, `hsla(${h},${s}%,${l}%, 0.08)`);
            grd.addColorStop(1, `hsla(${h},${s}%,${l}%, 0)`);

            ctx.save();
            ctx.translate(a.cx, a.cy);
            ctx.scale(1, ry / rx);
            ctx.beginPath();
            ctx.arc(0, 0, rx, 0, Math.PI * 2);
            ctx.fillStyle = grd;
            ctx.fill();
            ctx.restore();
        }
    }

    /* ── Draw mesh grid ────────────────────────────────── */
    function drawMesh() {
        const cols = CFG.gridCols;
        const rows = CFG.gridRows;

        // update vertices
        for (const v of verts) {
            v.ox = v.amp * Math.sin(t * v.spd + v.phase);
            v.oy = v.amp * Math.cos(t * v.spd * 0.7 + v.phase + 1);
        }

        ctx.lineWidth = 0.35;

        // horizontal lines
        for (let row = 0; row <= rows; row++) {
            ctx.beginPath();
            for (let col = 0; col <= cols; col++) {
                const v = verts[row * (cols + 1) + col];
                const px = v.bx + v.ox;
                const py = v.by + v.oy;
                if (col === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            const alpha = 0.04 + 0.035 * Math.sin(t * 0.003 + row);
            ctx.strokeStyle = `rgba(0, 240, 255, ${alpha})`;
            ctx.stroke();
        }

        // vertical lines
        for (let col = 0; col <= cols; col++) {
            ctx.beginPath();
            for (let row = 0; row <= rows; row++) {
                const v = verts[row * (cols + 1) + col];
                const px = v.bx + v.ox;
                const py = v.by + v.oy;
                if (row === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            const alpha = 0.03 + 0.025 * Math.sin(t * 0.0025 + col * 0.5);
            ctx.strokeStyle = `rgba(0, 240, 255, ${alpha})`;
            ctx.stroke();
        }

        // vertex dots
        for (const v of verts) {
            const px = v.bx + v.ox;
            const py = v.by + v.oy;
            const glow = 0.5 + 0.5 * Math.sin(t * v.spd * 2 + v.phase);
            ctx.beginPath();
            ctx.arc(px, py, 0.8, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(0, 240, 255, ${0.06 + 0.08 * glow})`;
            ctx.fill();
        }
    }

    /* ── Draw particles ────────────────────────────────── */
    function drawParticles() {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.life++;

            const lifeFrac = p.life / p.maxLife;
            p.alpha = lifeFrac < 0.12 ? lifeFrac / 0.12
                : lifeFrac > 0.78 ? (1 - lifeFrac) / 0.22
                    : 1;

            p.trail.push({ x: p.x, y: p.y });
            if (p.trail.length > 22) p.trail.shift();

            // slight drift towards center
            const cx = W / 2, cy = H / 2;
            p.vx += (cx - p.x) * 0.000018;
            p.vy += (cy - p.y) * 0.000018;
            p.vx *= 0.995;
            p.vy *= 0.995;
            p.x += p.vx;
            p.y += p.vy;

            // draw trail
            if (p.trail.length > 1) {
                const { h, s, l } = p.col;
                for (let j = 1; j < p.trail.length; j++) {
                    const tf = j / p.trail.length;
                    ctx.beginPath();
                    ctx.strokeStyle = `hsla(${h},${s}%,${l}%, ${tf * p.alpha * 0.55})`;
                    ctx.lineWidth = p.size * tf * 0.7;
                    ctx.moveTo(p.trail[j - 1].x, p.trail[j - 1].y);
                    ctx.lineTo(p.trail[j].x, p.trail[j].y);
                    ctx.stroke();
                }
            }

            // draw core dot
            const { h, s, l } = p.col;
            const gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3);
            gr.addColorStop(0, `hsla(${h},${s}%,${l + 20}%, ${p.alpha * 0.9})`);
            gr.addColorStop(1, `hsla(${h},${s}%,${l}%, 0)`);
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
            ctx.fillStyle = gr;
            ctx.fill();

            if (p.life >= p.maxLife) particles.splice(i, 1);
        }
    }

    /* ── Scanline shimmer ──────────────────────────────── */
    function drawScanline() {
        const y = (t * 0.45) % H;
        const grd = ctx.createLinearGradient(0, y - 60, 0, y + 60);
        grd.addColorStop(0, 'rgba(0,240,255,0)');
        grd.addColorStop(0.5, 'rgba(0,240,255,0.025)');
        grd.addColorStop(1, 'rgba(0,240,255,0)');
        ctx.fillStyle = grd;
        ctx.fillRect(0, y - 60, W, 120);
    }

    /* ── Main loop ─────────────────────────────────────── */
    function tick() {
        t++;

        // clear with very slight trail
        ctx.clearRect(0, 0, W, H);

        if (!CFG.reduced) {
            drawAuroras();
            drawMesh();

            // spawn particles
            if (t % CFG.particleBirth === 0 && particles.length < CFG.particleMax) {
                spawnParticle();
            }
            drawParticles();
            drawScanline();
        }

        requestAnimationFrame(tick);
    }

    tick();
})();
