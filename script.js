            const sizeInput = document.getElementById("sizeInput");
            const menuButton = document.getElementById("menuButton");
            const controlPanel = document.getElementById("controlPanel");
            const mode2d = document.getElementById("mode2d");
            const mode3d = document.getElementById("mode3d");
            const visual = document.getElementById("visual");
            const warning = document.getElementById("warning");
            const countLabel = document.getElementById("countLabel");
            const readoutLabel = document.getElementById("readoutLabel");
            const fpsLabel = document.getElementById("fpsLabel");
            const count2dCard = document.getElementById("count2dCard");
            const count3dCard = document.getElementById("count3dCard");
            const count2dLabel = document.getElementById("count2dLabel");
            const count3dLabel = document.getElementById("count3dLabel");
            const rotationToggle = document.getElementById("rotationToggle");
            const speedCycleButton = document.getElementById("speedCycleButton");
            const measureToggle = document.getElementById("measureToggle");
            const infoButton = document.getElementById("infoButton");
            const infoModal = document.getElementById("infoModal");
            const infoClose = document.getElementById("infoClose");

            let mode = "2d";
            let isRotationPlaying = true;
            let showMeasurements = true;
            let speedLevel = 1;
            let audioContext;
            let renderTimer;
            let dimensionTimer;
            let resumeRotationTimer;
            let isDragging = false;
            let dragStartX = 0;
            let dragStartY = 0;
            let manualRotateX = -24;
            let manualRotateY = -38;
            let startRotateX = manualRotateX;
            let startRotateY = manualRotateY;
            let baseSceneScale = 1;
            let userZoom = 1;
            let isPinching = false;
            let pinchStartDistance = 0;
            let pinchStartZoom = 1;
            let frameCount = 0;
            let lastFpsTime = performance.now();
            const activePointers = new Map();
            const max2dSize = 40;
            const max3dSize = 80;
            const storageKey = "blockVisualizerSettings";

            function getMaxSize() {
                if (mode === "2d") return max2dSize;
                return max3dSize;
            }

            function clampSize(value) {
                const n = Number(value);
                if (Number.isNaN(n)) return 1;
                return Math.max(1, Math.min(getMaxSize(), Math.floor(n)));
            }

            function getBlockCount(size) {
                return mode === "2d" ? size * size : size * size * size;
            }

            function formatNumber(value) {
                return value.toLocaleString("ko-KR");
            }

            function saveSettings(size = clampSize(sizeInput.value)) {
                const settings = {
                    mode,
                    size,
                    speedLevel,
                    isRotationPlaying,
                    showMeasurements,
                };

                localStorage.setItem(storageKey, JSON.stringify(settings));
            }

            function loadSettings() {
                const saved = localStorage.getItem(storageKey);
                if (!saved) return;

                try {
                    const settings = JSON.parse(saved);
                    mode = settings.mode === "3d" ? "3d" : "2d";
                    isRotationPlaying = settings.isRotationPlaying !== false;
                    showMeasurements = settings.showMeasurements !== false;
                    speedLevel = getSavedSpeedLevel(settings);
                    sizeInput.max = getMaxSize();
                    sizeInput.value = clampSize(settings.size || 5);
                    mode2d.classList.toggle("active", mode === "2d");
                    mode3d.classList.toggle("active", mode === "3d");
                } catch {
                    localStorage.removeItem(storageKey);
                }
            }

            function getSavedSpeedLevel(settings) {
                if (Number.isInteger(settings.speedLevel)) {
                    return Math.max(1, Math.min(4, settings.speedLevel));
                }

                if (typeof settings.speed === "number") {
                    return Math.max(1, Math.min(4, Math.ceil(settings.speed / 25)));
                }

                return 1;
            }

            function clearSettingsOnHardRefresh(event) {
                const isReloadKey =
                    event.key.toLowerCase() === "r" ||
                    event.key === "F5";
                const isHardRefresh =
                    isReloadKey &&
                    event.shiftKey &&
                    (event.metaKey || event.ctrlKey || event.key === "F5");

                if (isHardRefresh) {
                    localStorage.removeItem(storageKey);
                }
            }

            function playSound(type) {
                try {
                    const Audio =
                        window.AudioContext || window.webkitAudioContext;
                    if (!Audio) return;

                    audioContext = audioContext || new Audio();
                    const oscillator = audioContext.createOscillator();
                    const gain = audioContext.createGain();
                    const now = audioContext.currentTime;

                    oscillator.type = "square";
                    oscillator.frequency.setValueAtTime(
                        type === "mode" ? 520 : 360,
                        now,
                    );
                    oscillator.frequency.exponentialRampToValueAtTime(
                        type === "mode" ? 780 : 470,
                        now + 0.08,
                    );
                    gain.gain.setValueAtTime(0.0001, now);
                    gain.gain.exponentialRampToValueAtTime(0.04, now + 0.01);
                    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

                    oscillator.connect(gain);
                    gain.connect(audioContext.destination);
                    oscillator.start(now);
                    oscillator.stop(now + 0.13);
                } catch {
                    audioContext = undefined;
                }
            }

            function updateRotationSpeed() {
                speedCycleButton.textContent = `x${speedLevel}`;
                speedCycleButton.setAttribute(
                    "aria-label",
                    `Rotation speed x${speedLevel}`,
                );

                if (!isRotationPlaying) {
                    visual.style.setProperty("--rotation-state", "paused");
                    rotationToggle.textContent = "▶";
                    rotationToggle.setAttribute("aria-label", "Play rotation");
                    return;
                }

                const duration = 24 / speedLevel;
                visual.style.setProperty("--rotation-duration", `${duration}s`);
                visual.style.setProperty("--rotation-state", "running");
                rotationToggle.textContent = "■";
                rotationToggle.setAttribute("aria-label", "Stop rotation");
            }

            function updateMeasurementToggle() {
                measureToggle.classList.toggle("active", showMeasurements);
                measureToggle.setAttribute("aria-pressed", String(showMeasurements));
                measureToggle.setAttribute(
                    "aria-label",
                    showMeasurements
                        ? "Hide measurement guide"
                        : "Show measurement guide",
                );
            }

            function applySceneScale() {
                visual.style.setProperty("--scene-scale", baseSceneScale * userZoom);
            }

            function setBaseSceneScale(scale) {
                baseSceneScale = scale;
                applySceneScale();
            }

            function getActiveObject() {
                return visual.querySelector(".simple-cube, .square-grid");
            }

            function applyManualRotation(target) {
                target.style.transform = `scale(var(--scene-scale)) rotateX(${manualRotateX}deg) rotateY(${manualRotateY}deg)`;
            }

            function applyHomeRotation(target) {
                target.style.transform =
                    "scale(var(--scene-scale)) rotateX(-24deg) rotateY(-38deg)";
            }

            function startManualRotation(event) {
                const target = getActiveObject();
                if (!target) return;

                activePointers.set(event.pointerId, {
                    x: event.clientX,
                    y: event.clientY,
                });
                visual.setPointerCapture?.(event.pointerId);
                clearTimeout(resumeRotationTimer);
                visual.style.setProperty("--rotation-state", "paused");
                target.classList.remove("returning");
                target.classList.add("manual-rotation");

                if (activePointers.size >= 2) {
                    const points = [...activePointers.values()];
                    isDragging = false;
                    isPinching = true;
                    pinchStartDistance = getPointerDistance(points[0], points[1]);
                    pinchStartZoom = userZoom;
                    applyManualRotation(target);
                    return;
                }

                isDragging = true;
                dragStartX = event.clientX;
                dragStartY = event.clientY;
                startRotateX = manualRotateX;
                startRotateY = manualRotateY;
                applyManualRotation(target);
            }

            function moveManualRotation(event) {
                const target = getActiveObject();
                if (!target) return;

                if (activePointers.has(event.pointerId)) {
                    activePointers.set(event.pointerId, {
                        x: event.clientX,
                        y: event.clientY,
                    });
                }

                if (isPinching && activePointers.size >= 2) {
                    const points = [...activePointers.values()];
                    const distance = getPointerDistance(points[0], points[1]);
                    if (pinchStartDistance <= 0) return;

                    const nextZoom = pinchStartZoom * (distance / pinchStartDistance);
                    userZoom = Math.max(0.65, Math.min(1.8, nextZoom));
                    applySceneScale();
                    applyManualRotation(target);
                    return;
                }

                if (!isDragging) return;

                const dx = event.clientX - dragStartX;
                const dy = event.clientY - dragStartY;
                manualRotateX = Math.max(-80, Math.min(80, startRotateX - dy * 0.35));
                manualRotateY = startRotateY + dx * 0.35;
                applyManualRotation(target);
            }

            function finishManualRotation(event) {
                const target = getActiveObject();
                activePointers.delete(event.pointerId);
                isDragging = false;
                visual.releasePointerCapture?.(event.pointerId);

                if (isPinching && activePointers.size >= 2) return;

                if (isPinching) {
                    isPinching = false;
                    scheduleReturnToHome(target);
                    return;
                }

                if (!target) return;

                scheduleReturnToHome(target);
            }

            function getPointerDistance(first, second) {
                return Math.hypot(first.x - second.x, first.y - second.y);
            }

            function scheduleReturnToHome(target) {
                if (!target) return;

                resumeRotationTimer = setTimeout(() => {
                    target.classList.add("returning");
                    applyHomeRotation(target);

                    let didFinish = false;
                    const finishReturn = () => {
                        if (didFinish) return;
                        didFinish = true;
                        target.classList.remove("manual-rotation", "returning");
                        target.style.transform = "";
                        manualRotateX = -24;
                        manualRotateY = -38;
                        updateRotationSpeed();
                    };

                    target.addEventListener("transitionend", finishReturn, {
                        once: true,
                    });
                    setTimeout(finishReturn, 650);
                }, 2000);
            }

            function get2DCellSize(size) {
                const maxGridSize = getVisualLimit();
                const gap = 5;
                return Math.max(
                    6,
                    Math.floor((maxGridSize - gap * (size - 1)) / size),
                );
            }

            function getVisualLimit() {
                const bounds = visual.getBoundingClientRect();
                const inset = window.matchMedia("(max-width: 840px)").matches
                    ? 160
                    : 96;
                const minimum = window.matchMedia("(max-width: 840px)").matches
                    ? 160
                    : 220;
                const available = Math.min(bounds.width, bounds.height) - inset;
                return Math.min(460, Math.max(minimum, available));
            }

            function makeCell() {
                const cell = document.createElement("div");
                cell.className = "cell";
                return cell;
            }

            function createGrid(size, className) {
                const grid = document.createElement("div");
                grid.className = className;
                grid.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
                grid.style.gridTemplateRows = `repeat(${size}, 1fr)`;

                const total = size * size;
                for (let i = 0; i < total; i += 1) {
                    grid.appendChild(makeCell());
                }
                return grid;
            }

            function render2D(size) {
                const grid = createGrid(size, "square-grid");
                const cellSize = get2DCellSize(size);
                setBaseSceneScale(1);
                grid.style.setProperty("--cell-size", `${cellSize}px`);
                grid.style.gridTemplateColumns = `repeat(${size}, ${cellSize}px)`;
                grid.style.gridTemplateRows = `repeat(${size}, ${cellSize}px)`;
                if (showMeasurements) {
                    grid.appendChild(
                        createDimensionLine(
                            size,
                            "SQUARE EDGE MEASURE",
                            "square-measure",
                        ),
                    );
                }
                visual.appendChild(grid);
                if (showMeasurements) animateDimensionLine(grid, size);
            }

            function render3D(size) {
                const visualLimit = getVisualLimit();
                const cubePx = Math.min(420, visualLimit, 150 + size * 22);
                const sceneScale = Math.min(1, visualLimit / cubePx);

                renderGridCube(size, cubePx, sceneScale);
            }

            function renderGridCube(size, cubePx, sceneScale) {
                const cube = document.createElement("div");
                cube.className = "simple-cube";
                cube.style.setProperty("--cube-px", `${cubePx}px`);
                cube.style.setProperty("--grid-count", size);
                setBaseSceneScale(sceneScale);

                ["front", "back", "right", "left", "top", "bottom"].forEach(
                    (faceName) => {
                        const face = document.createElement("div");
                        face.className = `simple-face ${faceName}`;
                        cube.appendChild(face);
                    },
                );

                if (showMeasurements) {
                    cube.appendChild(createDimensionLine(size, "FRONT EDGE MEASURE"));
                }

                visual.appendChild(cube);
                if (showMeasurements) animateDimensionLine(cube, size);
            }

            function createDimensionLine(size, noteText, extraClass = "") {
                const line = document.createElement("div");
                const label = document.createElement("div");
                const rail = document.createElement("div");
                const scanDot = document.createElement("div");
                const note = document.createElement("div");

                line.className = `dimension-line counting ${extraClass}`.trim();
                label.className = "dimension-label";
                rail.className = "dimension-rail";
                scanDot.className = "scan-dot";
                note.className = "dimension-note";

                label.innerHTML = `EDGE <strong>${size}</strong> BLOCKS`;
                note.textContent = noteText;

                for (let i = 0; i <= size; i += 1) {
                    const tick = document.createElement("span");
                    tick.className = "dimension-tick";
                    rail.appendChild(tick);
                }

                rail.appendChild(scanDot);
                line.appendChild(label);
                line.appendChild(rail);
                line.appendChild(note);

                return line;
            }

            function animateDimensionLine(cube, targetSize) {
                clearInterval(dimensionTimer);

                const line = cube.querySelector(".dimension-line");
                const ticks = [...cube.querySelectorAll(".dimension-tick")];
                const scanDot = cube.querySelector(".scan-dot");
                let current = 0;
                const stepMs = Math.max(35, Math.min(95, 850 / targetSize));

                dimensionTimer = setInterval(() => {
                    ticks[current]?.classList.add("active");
                    ticks[current + 1]?.classList.add("active");

                    const progress =
                        targetSize <= 1 ? 100 : ((current + 1) / targetSize) * 100;
                    scanDot.style.left = `${progress}%`;
                    current += 1;

                    if (current >= targetSize) {
                        clearInterval(dimensionTimer);
                        setTimeout(() => {
                            line.classList.remove("counting");
                            scanDot.classList.add("done");
                        }, 420);
                    }
                }, stepMs);
            }

            function updateStatus(size) {
                const blockCount = getBlockCount(size);
                const count2d = size * size;
                const count3d = size * size * size;
                const maxSize = getMaxSize();

                countLabel.textContent = `BLOCKS ${formatNumber(blockCount)}`;
                readoutLabel.textContent = `EDGE ${formatNumber(size)} / MAX ${maxSize}`;
                count2dLabel.textContent = `${formatNumber(size)} x ${formatNumber(size)} = ${formatNumber(count2d)}`;
                count3dLabel.textContent = `${formatNumber(size)} x ${formatNumber(size)} x ${formatNumber(size)} = ${formatNumber(count3d)}`;
                count2dCard.classList.toggle("active", mode === "2d");
                count3dCard.classList.toggle("active", mode === "3d");
            }

            function render() {
                clearTimeout(renderTimer);

                if (sizeInput.value === "") {
                    warning.textContent = "ENTER A NUMBER.";
                    return;
                }

                const original = Number(sizeInput.value);
                const size = clampSize(sizeInput.value);

                if (original !== size) {
                    warning.textContent = `RANGE: 1 TO ${getMaxSize()}.`;
                    sizeInput.value = size;
                } else {
                    warning.textContent = "";
                }

                updateStatus(size);
                saveSettings(size);
                visual.classList.add("is-changing");

                renderTimer = setTimeout(() => {
                    clearTimeout(resumeRotationTimer);
                    clearInterval(dimensionTimer);
                    isDragging = false;
                    isPinching = false;
                    activePointers.clear();
                    visual.innerHTML = "";
                    setBaseSceneScale(1);

                    if (mode === "2d") {
                        render2D(size);
                    } else {
                        render3D(size);
                    }

                    requestAnimationFrame(() => {
                        visual.classList.remove("is-changing");
                    });
                }, 180);
            }

            function updateFps(now) {
                frameCount += 1;
                if (now - lastFpsTime >= 500) {
                    const fps = Math.round(
                        (frameCount * 1000) / (now - lastFpsTime),
                    );
                    fpsLabel.textContent = `FPS ${fps}`;
                    frameCount = 0;
                    lastFpsTime = now;
                }
                requestAnimationFrame(updateFps);
            }

            function selectMode(nextMode) {
                mode = nextMode;
                sizeInput.max = getMaxSize();
                mode2d.classList.toggle("active", mode === "2d");
                mode3d.classList.toggle("active", mode === "3d");
                playSound("mode");
                render();
            }

            function toggleRotation() {
                isRotationPlaying = !isRotationPlaying;
                playSound("mode");
                updateRotationSpeed();
                saveSettings();
            }

            function setSpeedLevel(nextLevel) {
                const next = Math.max(1, Math.min(4, nextLevel));
                if (next === speedLevel) return;

                speedLevel = next;
                playSound("mode");
                updateRotationSpeed();
                saveSettings();
            }

            function toggleMeasurements() {
                showMeasurements = !showMeasurements;
                playSound("mode");
                updateMeasurementToggle();
                render();
            }

            function changeSize(delta) {
                const current = sizeInput.value === "" ? 1 : clampSize(sizeInput.value);
                const next = Math.max(1, Math.min(getMaxSize(), current + delta));
                if (next === current && sizeInput.value !== "") return;

                sizeInput.value = next;
                playSound("input");
                render();
            }

            function openInfoModal() {
                infoModal.classList.add("is-open");
                infoModal.setAttribute("aria-hidden", "false");
                infoClose.focus();
            }

            function closeInfoModal() {
                infoModal.classList.remove("is-open");
                infoModal.setAttribute("aria-hidden", "true");
                infoButton.focus();
            }

            function isInfoModalOpen() {
                return infoModal.classList.contains("is-open");
            }

            function openControlPanel() {
                document.body.classList.add("panel-open");
                menuButton.setAttribute("aria-expanded", "true");
                controlPanel.focus();
            }

            function closeControlPanel() {
                document.body.classList.remove("panel-open");
                menuButton.setAttribute("aria-expanded", "false");
                menuButton.focus();
            }

            function isControlPanelOpen() {
                return document.body.classList.contains("panel-open");
            }

            function toggleControlPanel() {
                if (isControlPanelOpen()) {
                    closeControlPanel();
                } else {
                    openControlPanel();
                }
            }

            function handleKeyboardShortcuts(event) {
                if (isInfoModalOpen()) {
                    if (event.key === "Escape") {
                        event.preventDefault();
                        closeInfoModal();
                    }
                    return;
                }

                if (isControlPanelOpen()) {
                    if (event.key === "Escape") {
                        event.preventDefault();
                        closeControlPanel();
                    }
                    return;
                }

                if (event.metaKey || event.ctrlKey || event.altKey) return;

                if (event.key === "ArrowUp") {
                    event.preventDefault();
                    changeSize(1);
                    return;
                }

                if (event.key === "ArrowDown") {
                    event.preventDefault();
                    changeSize(-1);
                    return;
                }

                if (event.key === "ArrowRight") {
                    event.preventDefault();
                    setSpeedLevel(speedLevel + 1);
                    return;
                }

                if (event.key === "ArrowLeft") {
                    event.preventDefault();
                    setSpeedLevel(speedLevel - 1);
                    return;
                }

                if (event.key === " " || event.key === "Spacebar") {
                    event.preventDefault();
                    toggleRotation();
                    return;
                }

                if (event.key === "Enter") {
                    event.preventDefault();
                    selectMode(mode === "2d" ? "3d" : "2d");
                }
            }

            mode2d.addEventListener("click", () => {
                selectMode("2d");
            });

            mode3d.addEventListener("click", () => {
                selectMode("3d");
            });

            sizeInput.addEventListener("input", () => {
                if (sizeInput.value !== "") playSound("input");
                render();
            });
            rotationToggle.addEventListener("click", toggleRotation);
            speedCycleButton.addEventListener("click", () => {
                setSpeedLevel(speedLevel === 4 ? 1 : speedLevel + 1);
            });
            menuButton.addEventListener("click", toggleControlPanel);
            document.addEventListener("pointerdown", (event) => {
                if (!isControlPanelOpen()) return;
                if (
                    controlPanel.contains(event.target) ||
                    menuButton.contains(event.target)
                ) {
                    return;
                }

                closeControlPanel();
            });
            measureToggle.addEventListener("click", toggleMeasurements);
            infoButton.addEventListener("click", openInfoModal);
            infoClose.addEventListener("click", closeInfoModal);
            infoModal.addEventListener("click", (event) => {
                if (event.target === infoModal) closeInfoModal();
            });
            sizeInput.addEventListener("blur", () => {
                if (sizeInput.value === "") {
                    sizeInput.value = "1";
                    render();
                }
            });
            visual.addEventListener("pointerdown", startManualRotation);
            visual.addEventListener("pointermove", moveManualRotation);
            visual.addEventListener("pointerup", finishManualRotation);
            visual.addEventListener("pointercancel", finishManualRotation);

            window.addEventListener("keydown", clearSettingsOnHardRefresh);
            window.addEventListener("keydown", handleKeyboardShortcuts);

            loadSettings();
            render();
            updateRotationSpeed();
            updateMeasurementToggle();
            requestAnimationFrame(updateFps);
