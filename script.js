// IIFE (即時実行関数) でスコープを分離
(() => {
    // --- DOM要素の取得 ---
    const svg = document.getElementById('canvas');
    const sidebar = document.getElementById('sidebar');
    const editPanel = document.getElementById('edit-panel');
    const noSelectionPanel = document.getElementById('no-selection-panel');
    const editPanelTitle = document.getElementById('edit-panel-title');
    
    const nodeSettings = document.getElementById('node-settings');
    const linkSettings = document.getElementById('link-settings');
    const groupSettings = document.getElementById('group-settings');

    const nodeNameInput = document.getElementById('node-name');
    const nodeColorInput = document.getElementById('node-color');
    const nodeColorTemplates = document.getElementById('node-color-templates');
    const nodeSizeInput = document.getElementById('node-size');
    const nodeTextColorInput = document.getElementById('node-text-color');
    const nodeShapeInput = document.getElementById('node-shape');
    const nodeBgColorInput = document.getElementById('node-bg-color');
    const nodeImageDisplayInput = document.getElementById('node-image-display');
    const nodeColorCodeInput = document.getElementById('node-color-code');
    const nodeTextColorCodeInput = document.getElementById('node-text-color-code');
    const nodeBgColorCodeInput = document.getElementById('node-bg-color-code');
    
    const linkTextInput = document.getElementById('link-text');
    const linkColorInput = document.getElementById('link-color');
    const linkStyleInput = document.getElementById('link-style');
    const linkShapeInput = document.getElementById('link-shape');
    const linkArrowInput = document.getElementById('link-arrow');
    const linkTextColorInput = document.getElementById('link-text-color');
    const linkColorCodeInput = document.getElementById('link-color-code');
    const linkTextColorCodeInput = document.getElementById('link-text-color-code');

    const groupNameInput = document.getElementById('group-name');
    const groupColorInput = document.getElementById('group-color');
    const groupColorCodeInput = document.getElementById('group-color-code');
    const addNodeToGroupSection = document.getElementById('add-node-to-group-section');
    const addNodeToGroupSelect = document.getElementById('add-node-to-group-select');
    const addNodeToGroupBtn = document.getElementById('add-node-to-group-btn');
    const addNodeToGroupMessage = document.getElementById('add-node-to-group-message');

    const addNodeBtn = document.getElementById('add-node-btn');
    const undoBtn = document.getElementById('undo-btn');
    const redoBtn = document.getElementById('redo-btn');
    const groupBtn = document.getElementById('group-btn');
    const deleteBtn = document.getElementById('delete-btn');
    const uploadImageBtn = document.getElementById('upload-image-btn');
    const exportPngBtn = document.getElementById('export-png-btn');
    const contextMenu = document.getElementById('context-menu');
    const imageUploadInput = document.getElementById('image-upload-input');
    const editImageBtn = document.getElementById('edit-image-btn');
    const imageEditorModal = document.getElementById('image-editor-modal');
    const imageEditorPreview = document.getElementById('image-editor-preview');
    const imageZoomSlider = document.getElementById('image-zoom-slider');
    const saveImageEditBtn = document.getElementById('save-image-edit-btn');
    const cancelImageEditBtn = document.getElementById('cancel-image-edit-btn');
    
    const exportProjectBtn = document.getElementById('export-project-btn');
    const importProjectBtn = document.getElementById('import-project-btn');
    const projectImportInput = document.getElementById('project-import-input');
    const zoomInBtn = document.getElementById('zoom-in-btn');
    const zoomOutBtn = document.getElementById('zoom-out-btn');
    const zoomSlider = document.getElementById('zoom-slider');
    const zoomLevel = document.getElementById('zoom-level');
    
    // --- 状態管理 ---
    let state = {
        diagram: { nodes: [], links: [], groups: [] },
        history: [],
        redoStack: [],
        selectedItems: new Set(),
        view: { x: 0, y: 0, k: 1 },
        domCache: {
            nodes: new Map(),
            links: new Map(),
            groups: new Map()
        }
    };

    let activeDrag = null;
    let activeLink = null;
    let selectionBox = null;
    let lastMousePos = { x: 0, y: 0 };
    let targetNodeIdForImageUpload = null;
    let activeImageEditor = null;
    
    // --- SVG要素のグループ ---
    const groupLayer = document.createElementNS("http://www.w3.org/2000/svg", 'g');
    groupLayer.classList.add('group-layer');
    svg.appendChild(groupLayer);

    const linkLayer = document.createElementNS("http://www.w3.org/2000/svg", 'g');
    linkLayer.classList.add('link-layer');
    svg.appendChild(linkLayer);

    const nodeLayer = document.createElementNS("http://www.w3.org/2000/svg", 'g');
    nodeLayer.classList.add('node-layer');
    svg.appendChild(nodeLayer);

    const selectionBoxLayer = document.createElementNS("http://www.w3.org/2000/svg", 'g');
    selectionBoxLayer.classList.add('selection-box-layer');
    svg.appendChild(selectionBoxLayer);


    // --- ヘルパー関数 ---
    const LOG_LEVELS = {
        DEBUG: { color: '#9e9e9e', prefix: 'DEBUG' },
        INFO: { color: '#2196f3', prefix: 'INFO ' },
        WARN: { color: '#ffc107', prefix: 'WARN ' },
        ERROR: { color: '#f44336', prefix: 'ERROR' }
    };

    function log(level, message, ...data) {
        const config = LOG_LEVELS[level] || LOG_LEVELS.INFO;
        const timestamp = new Date().toLocaleTimeString('ja-JP', { hour12: false });
        
        console.log(
            `%c[${timestamp}] ${config.prefix}:`,
            `color: ${config.color}; font-weight: bold;`,
            message,
            ...data
        );
    }

    const getNextId = () => `id_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const getSvgPoint = (clientX, clientY) => {
        const pt = svg.createSVGPoint();
        pt.x = clientX;
        pt.y = clientY;
        // 修正: レイヤーの変換行列を考慮してワールド座標を取得する
        const ctm = nodeLayer.getScreenCTM();
        if (ctm) {
            return pt.matrixTransform(ctm.inverse());
        }
        // フォールバックとして元のロジックを残す
        return pt.matrixTransform(svg.getScreenCTM().inverse());
    };
    
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
    
    const getGroupBbox = (group) => {
        const nodesInGroup = group.nodeIds.map(id => state.diagram.nodes.find(n => n.id === id)).filter(Boolean);
        if (nodesInGroup.length === 0) return null;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        const nameLines = (group.name || '').split('\n').length;
        const textHeight = 14 * nameLines + (nameLines > 1 ? 10 : 0);
        nodesInGroup.forEach(node => {
            const nodeNameLines = (node.name || '').split('\n').length;
            const nodeTextHeight = Math.max(14, node.size * 0.3) * nodeNameLines + (nodeNameLines > 1 ? 10 : 0);
            minX = Math.min(minX, node.x - node.size);
            minY = Math.min(minY, node.y - node.size);
            maxX = Math.max(maxX, node.x + node.size);
            const imageHeight = (node.imageUrl && (node.imageDisplayMode === 'raw' || node.imageDisplayMode === 'none')) ? node.size * 2 : 0;
            const effectiveHeight = Math.max(node.size + nodeTextHeight, imageHeight / 2);
            maxY = Math.max(maxY, node.y + effectiveHeight);
        });
        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    };

    const syncColorInputs = (colorPicker, textInput, colorValue) => {
        colorPicker.value = colorValue;
        if (document.activeElement !== textInput) {
            textInput.value = colorValue;
        }
    };
    
    // --- ローカルストレージ関数 ---
    const STORAGE_KEY = 'diagram-tool-data';
    
    function saveToLocalStorage() {
        try {
            const stateToSave = JSON.parse(JSON.stringify(state));
            stateToSave.diagram.nodes.forEach(node => {
                if (node.imageUrl?.startsWith('data:image')) {
                    node.imageUrl = 'local-image-placeholder';
                }
            });
            
            const data = {
                diagram: stateToSave.diagram,
                view: state.view,
                version: '1.5',
                timestamp: Date.now()
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (error) {
            log('ERROR', 'ローカルストレージへの保存に失敗しました。', error);
        }
    }
    
    function loadFromLocalStorage() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const data = JSON.parse(stored);
                if (data.diagram) {
                    const hasPlaceholder = data.diagram.nodes.some(n => n.imageUrl === 'local-image-placeholder');
                    if (hasPlaceholder) {
                        log('WARN', "ローカルストレージから復元しました。画像はプロジェクトファイルから復元してください。");
                    }
                    
                    state.diagram = data.diagram;
                    state.diagram.nodes.forEach(n => {
                        if (n.imageDisplayMode === undefined) {
                            n.imageDisplayMode = 'clip';
                        }
                    });

                    if (data.view) {
                        state.view = data.view;
                    }
                    clearDomCache();
                    render();
                    return true;
                }
            }
        } catch (error) {
            log('ERROR', 'ローカルストレージからの読み込みに失敗しました。', error);
        }
        return false;
    }
    
    // --- 描画関数 ---
    function render() {
        const transform = `translate(${state.view.x}, ${state.view.y}) scale(${state.view.k})`;
        groupLayer.setAttribute('transform', transform);
        linkLayer.setAttribute('transform', transform);
        nodeLayer.setAttribute('transform', transform);
        selectionBoxLayer.setAttribute('transform', transform);

        renderNodes();
        renderGroups();
        renderLinks();
        updateSidebar();
        updateUndoRedoButtons();
        updateZoomControls();
    }

    function updateZoomControls() {
        if (!zoomSlider || !zoomLevel) return;
        zoomSlider.value = state.view.k;
        zoomLevel.textContent = `${Math.round(state.view.k * 100)}%`;
    }

    function renderNodes() {
        const currentNodeIds = new Set(state.diagram.nodes.map(n => n.id));
        for (const [id, element] of state.domCache.nodes) {
            if (!currentNodeIds.has(id)) {
                element.remove();
                state.domCache.nodes.delete(id);
            }
        }
    
        state.diagram.nodes.forEach(node => {
            let group = state.domCache.nodes.get(node.id);
            
            if (!group) {
                group = document.createElementNS("http://www.w3.org/2000/svg", 'g');
                group.setAttribute('class', 'node');
                group.dataset.id = node.id;
                state.domCache.nodes.set(node.id, group);
                nodeLayer.appendChild(group);
            }
            
            group.setAttribute('transform', `translate(${node.x}, ${node.y})`);
            group.classList.toggle('selected', state.selectedItems.has(node.id));
            group.innerHTML = ''; // 毎回中身をクリアして再構築
    
            const displayMode = (node.imageUrl) ? (node.imageDisplayMode || 'clip') : 'clip';
            const shape = node.shape || 'circle';
            const size = node.size;
    
            // 1. ベースとなる図形を定義（DOMには追加しない）
            let baseShape;
            if (shape === 'circle') {
                baseShape = document.createElementNS("http://www.w3.org/2000/svg", 'circle');
                baseShape.setAttribute('r', size);
            } else if (shape === 'rect') {
                baseShape = document.createElementNS("http://www.w3.org/2000/svg", 'rect');
                const rectSize = size * 1.4;
                baseShape.setAttribute('x', -rectSize / 2); baseShape.setAttribute('y', -rectSize / 2);
                baseShape.setAttribute('width', rectSize); baseShape.setAttribute('height', rectSize);
                baseShape.setAttribute('rx', '5');
            } else if (shape === 'diamond') {
                baseShape = document.createElementNS("http://www.w3.org/2000/svg", 'polygon');
                baseShape.setAttribute('points', `0,-${size} ${size},0 0,${size} -${size},0`);
            } else if (shape === 'ellipse') {
                baseShape = document.createElementNS("http://www.w3.org/2000/svg", 'ellipse');
                baseShape.setAttribute('rx', size * 1.2); baseShape.setAttribute('ry', size * 0.8);
            } else if (shape === 'hexagon') {
                baseShape = document.createElementNS("http://www.w3.org/2000/svg", 'polygon');
                const points = Array.from({length: 6}, (_, i) => `${Math.cos(i*Math.PI/3)*size},${Math.sin(i*Math.PI/3)*size}`);
                baseShape.setAttribute('points', points.join(' '));
            } else if (shape === 'star') {
                baseShape = document.createElementNS("http://www.w3.org/2000/svg", 'polygon');
                const outerRadius = size, innerRadius = size * 0.4;
                const points = Array.from({length: 10}, (_, i) => {
                    const r = i % 2 === 0 ? outerRadius : innerRadius;
                    const a = i * Math.PI / 5 - Math.PI / 2;
                    return `${Math.cos(a)*r},${Math.sin(a)*r}`;
                });
                baseShape.setAttribute('points', points.join(' '));
            }
    
            // 2. 背景用の図形を追加 (背景色)
            const backgroundShape = baseShape.cloneNode(true);
            backgroundShape.setAttribute('stroke', 'none');
            if (displayMode === 'clip') {
                backgroundShape.setAttribute('fill', node.backgroundColor || '#ffffff');
            } else {
                backgroundShape.setAttribute('fill', 'transparent');
            }
            if (displayMode === 'none') backgroundShape.setAttribute('visibility', 'hidden');
            group.appendChild(backgroundShape);
    
            // 3. 画像を追加
            if (node.imageUrl) {
                const image = document.createElementNS("http://www.w3.org/2000/svg", 'image');
                image.setAttribute('href', node.imageUrl);
    
                if (displayMode === 'clip') {
                    const clipPathId = `clip-${node.id}`;
                    image.setAttribute('clip-path', `url(#${clipPathId})`);
                    let defs = svg.querySelector('defs');
                    if (!defs) {
                        defs = document.createElementNS("http://www.w3.org/2000/svg", 'defs');
                        svg.insertBefore(defs, svg.firstChild);
                    }
                    let clipPath = defs.querySelector(`#${clipPathId}`);
                    if (!clipPath) {
                        clipPath = document.createElementNS("http://www.w3.org/2000/svg", 'clipPath');
                        clipPath.id = clipPathId;
                        defs.appendChild(clipPath);
                    }
                    clipPath.innerHTML = '';
                    const clipShapeForPath = baseShape.cloneNode(true);
                    clipShapeForPath.setAttribute('transform', 'scale(0.95)');
                    clipPath.appendChild(clipShapeForPath);
                    
                    const imgSize = size * 2.2;
                    image.setAttribute('x', -imgSize / 2); image.setAttribute('y', -imgSize / 2);
                    image.setAttribute('width', imgSize); image.setAttribute('height', imgSize);
                    image.setAttribute('preserveAspectRatio', 'xMidYMid slice');

                    if (node.imageTransform) {
                        const { scale, offsetX, offsetY } = node.imageTransform;
                        // SVGのtransform属性はCSSと異なり、単位をつけない
                        const transform = `translate(${offsetX}, ${offsetY}) scale(${scale})`;
                        image.setAttribute('transform', transform);
                    }
                } else { // raw, none
                    const imgSize = size * 2;
                    image.setAttribute('x', -size); image.setAttribute('y', -size);
                    image.setAttribute('width', imgSize); image.setAttribute('height', imgSize);
                    image.setAttribute('preserveAspectRatio', 'xMidYMid meet');
                }
                group.appendChild(image);
            }
    
            // 4. 枠線用の図形を追加
            const borderShape = baseShape.cloneNode(true);
            borderShape.setAttribute('fill', 'none');
            borderShape.setAttribute('stroke', node.color);
            borderShape.setAttribute('stroke-width', 3);
            if (displayMode === 'none') {
                 borderShape.setAttribute('visibility', 'hidden');
            } else if (displayMode === 'raw') {
                // 'raw'モードでは選択時のみ枠線表示
                borderShape.setAttribute('stroke', state.selectedItems.has(node.id) ? node.color : 'transparent');
            }
            group.appendChild(borderShape);
    
            // 5. テキストを追加
            const text = document.createElementNS("http://www.w3.org/2000/svg", 'text');
            text.setAttribute('class', 'node-name');
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('font-weight', 'bold');
            const lines = (node.name || '').split('\n').slice(0, 2);
            const fontSize = Math.max(14, size * 0.3);
            const lineHeight = 1.2;
            const textYOffset = (displayMode === 'raw' || displayMode === 'none') ? size + 20 : size + 20;
            const startY = textYOffset - ((lines.length - 1) * fontSize * lineHeight / 2);
            text.setAttribute('y', startY);
            text.setAttribute('font-size', `${fontSize}px`);
            text.setAttribute('fill', node.textColor || '#333');
            lines.forEach((line, index) => {
                const tspan = document.createElementNS("http://www.w3.org/2000/svg", 'tspan');
                tspan.setAttribute('x', 0);
                if (index > 0) tspan.setAttribute('dy', `${lineHeight}em`);
                tspan.textContent = line;
                text.appendChild(tspan);
            });
            group.appendChild(text);
    
            // 6. コネクタを追加
            const connector = document.createElementNS("http://www.w3.org/2000/svg", 'circle');
            connector.setAttribute('class', 'connector');
            connector.setAttribute('r', 8);
            let connectorY;
            if (displayMode === 'raw' || displayMode === 'none') {
                connectorY = -size;
            } else {
                 if (shape === 'rect') connectorY = -size * 0.7;
                 else if (shape === 'ellipse') connectorY = -size * 0.8;
                 else connectorY = -size;
            }
            connector.setAttribute('cy', connectorY);
            group.appendChild(connector);
        });
    }

    function getEndpointDetails(id) {
        const node = state.diagram.nodes.find(n => n.id === id);
        if (node) {
            return {
                id: node.id, type: 'node', x: node.x, y: node.y,
                size: node.size, bbox: null
            };
        }
        const group = state.diagram.groups.find(g => g.id === id);
        if (group) {
            const bbox = getGroupBbox(group);
            if (!bbox) return null;
            const padding = 40;
            const paddedBbox = {
                x: bbox.x - padding, y: bbox.y - padding,
                width: bbox.width + padding * 2, height: bbox.height + padding * 2,
            };
            return {
                id: group.id, type: 'group',
                x: paddedBbox.x + paddedBbox.width / 2, y: paddedBbox.y + paddedBbox.height / 2,
                size: 0, bbox: paddedBbox
            };
        }
        return null;
    }

    function getRectIntersection(outsidePoint, rect) {
        const insidePoint = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        const dx = outsidePoint.x - insidePoint.x;
        const dy = outsidePoint.y - insidePoint.y;
        if (dx === 0 && dy === 0) return insidePoint;

        const halfW = rect.width / 2;
        const halfH = rect.height / 2;
        const slope = dy / dx;
        
        if (Math.abs(dy * halfW) <= Math.abs(dx * halfH)) {
            const x = dx > 0 ? rect.x + rect.width : rect.x;
            return { x, y: insidePoint.y + slope * (x - insidePoint.x) };
        } else {
            const y = dy > 0 ? rect.y + rect.height : rect.y;
            return { x: insidePoint.x + (y - insidePoint.y) / slope, y };
        }
    }

    function getLinkEndpoints(sourceDetails, targetDetails, markerOffset = 0) {
        let sourcePoint = { x: sourceDetails.x, y: sourceDetails.y };
        let targetPoint = { x: targetDetails.x, y: targetDetails.y };
    
        if (sourceDetails.type === 'group' && sourceDetails.bbox) {
            sourcePoint = getRectIntersection(targetPoint, sourceDetails.bbox);
        }
        if (targetDetails.type === 'group' && targetDetails.bbox) {
            targetPoint = getRectIntersection(sourcePoint, targetDetails.bbox);
        }
    
        const dx = targetPoint.x - sourcePoint.x;
        const dy = targetPoint.y - sourcePoint.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
    
        if (dist > 0) {
            const unitVec = { x: dx / dist, y: dy / dist };
            if (sourceDetails.type === 'node') {
                const offset = sourceDetails.size + markerOffset;
                sourcePoint.x += unitVec.x * offset;
                sourcePoint.y += unitVec.y * offset;
            }
            if (targetDetails.type === 'node') {
                const offset = targetDetails.size + markerOffset;
                targetPoint.x -= unitVec.x * offset;
                targetPoint.y -= unitVec.y * offset;
            }
        }
        return { start: sourcePoint, end: targetPoint };
    }

    function renderLinks() {
        const currentLinkIds = new Set(state.diagram.links.map(l => l.id));
        for (const [id, element] of state.domCache.links) {
            if (!currentLinkIds.has(id)) {
                element.remove();
                state.domCache.links.delete(id);
            }
        }
        
        let defs = linkLayer.querySelector('defs');
        if (!defs) {
            defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
            linkLayer.appendChild(defs);
        }
        
        const uniqueColors = [...new Set(state.diagram.links.map(l => l.color))];
        uniqueColors.forEach(color => {
            const markerId = `arrowhead-${color.replace('#', '')}`;
            let marker = defs.querySelector(`#${markerId}`);
            if (!marker) {
                marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
                marker.id = markerId;
                marker.setAttribute('viewBox', '0 0 10 10');
                marker.setAttribute('refX', '8');
                marker.setAttribute('refY', '5');
                marker.setAttribute('markerWidth', '6');
                marker.setAttribute('markerHeight', '6');
                marker.setAttribute('orient', 'auto-start-reverse');
                marker.innerHTML = `<path d="M 0 0 L 10 5 L 0 10 z" fill="${color}"></path>`;
                defs.appendChild(marker);
            }
        });

        state.diagram.links.forEach(link => {
            const sourceDetails = getEndpointDetails(link.source);
            const targetDetails = getEndpointDetails(link.target);
            if (!sourceDetails || !targetDetails) return;
            
            let g = state.domCache.links.get(link.id);
            if (!g) {
                g = document.createElementNS("http://www.w3.org/2000/svg", 'g');
                g.setAttribute('class', 'link-group');
                g.dataset.id = link.id;
                state.domCache.links.set(link.id, g);
                linkLayer.appendChild(g);
            }
            
            if (state.selectedItems.has(link.id)) g.classList.add('selected');
            else g.classList.remove('selected');
            
            const hasReverseLink = state.diagram.links.some(l => 
                l.id !== link.id && l.source === link.target && l.target === link.source &&
                l.arrow !== 'both' && link.arrow !== 'both'
            );

            const isCurved = link.shape === 'curved' || hasReverseLink;
            const hasArrowAtEnd = (link.arrow === 'to' || link.arrow === 'both');
            const hasArrowAtStart = (link.arrow === 'from' || link.arrow === 'both');
            const markerOffset = 5; 

            let pathData, finalStart, finalEnd, controlPoint = null;
            let curveDirection = 1;

            if (isCurved && sourceDetails.id !== targetDetails.id) {
                const node1 = sourceDetails.id < targetDetails.id ? sourceDetails : targetDetails;
                const node2 = sourceDetails.id < targetDetails.id ? targetDetails : sourceDetails;
                const dx = node2.x - node1.x, dy = node2.y - node1.y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                
                if (dist > 0) {
                    if (hasReverseLink && sourceDetails.id > targetDetails.id) curveDirection = -1;
                    const nx = -dy / dist, ny = dx / dist;
                    const midX = (sourceDetails.x + targetDetails.x) / 2, midY = (sourceDetails.y + targetDetails.y) / 2;
                    const controlPointOffset = dist * 0.25 * curveDirection;
                    controlPoint = { x: midX + nx * controlPointOffset, y: midY + ny * controlPointOffset };

                    let startPoint = { x: sourceDetails.x, y: sourceDetails.y };
                    let endPoint = { x: targetDetails.x, y: targetDetails.y };
                    if (sourceDetails.type === 'group' && sourceDetails.bbox) startPoint = getRectIntersection(controlPoint, sourceDetails.bbox);
                    if (targetDetails.type === 'group' && targetDetails.bbox) endPoint = getRectIntersection(controlPoint, targetDetails.bbox);

                    const startAngle = Math.atan2(controlPoint.y - startPoint.y, controlPoint.x - startPoint.x);
                    const endAngle = Math.atan2(endPoint.y - controlPoint.y, endPoint.x - controlPoint.x);
                    
                    const totalStartOffset = (sourceDetails.type === 'node' ? sourceDetails.size : 0) + (hasArrowAtStart ? markerOffset : 0);
                    const totalEndOffset = (targetDetails.type === 'node' ? targetDetails.size : 0) + (hasArrowAtEnd ? markerOffset : 0);
                    
                    finalStart = { x: startPoint.x + Math.cos(startAngle) * totalStartOffset, y: startPoint.y + Math.sin(startAngle) * totalStartOffset };
                    finalEnd = { x: endPoint.x - Math.cos(endAngle) * totalEndOffset, y: endPoint.y - Math.sin(endAngle) * totalEndOffset };
                    pathData = `M ${finalStart.x} ${finalStart.y} Q ${controlPoint.x} ${controlPoint.y} ${finalEnd.x} ${finalEnd.y}`;
                }
            } 
            
            if (!pathData) {
                const points = getLinkEndpoints(sourceDetails, targetDetails);
                const dx = points.end.x - points.start.x, dy = points.end.y - points.start.y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                const unitVec = dist > 0 ? {x: dx/dist, y: dy/dist} : {x:0, y:0};
                
                finalStart = {x: points.start.x + unitVec.x * (hasArrowAtStart ? markerOffset : 0), y: points.start.y + unitVec.y * (hasArrowAtStart ? markerOffset : 0)};
                finalEnd = {x: points.end.x - unitVec.x * (hasArrowAtEnd ? markerOffset : 0), y: points.end.y - unitVec.y * (hasArrowAtEnd ? markerOffset : 0)};
                pathData = `M ${finalStart.x} ${finalStart.y} L ${finalEnd.x} ${finalEnd.y}`;
            }
            
            let path = g.querySelector('path.link');
            if (!path) {
                path = document.createElementNS("http://www.w3.org/2000/svg", 'path');
                path.setAttribute('class', 'link');
                path.setAttribute('fill', 'none');
                path.setAttribute('stroke-width', 2.5);
                g.appendChild(path);
            }
            
            path.setAttribute('d', pathData);
            path.setAttribute('stroke', link.color);
            if (link.style === 'dashed') path.setAttribute('stroke-dasharray', '8 4');
            else path.removeAttribute('stroke-dasharray');

            const markerUrl = `url(#arrowhead-${link.color.replace('#','')})`;
            path.setAttribute('marker-end', hasArrowAtEnd ? markerUrl : 'none');
            path.setAttribute('marker-start', hasArrowAtStart ? markerUrl : 'none');

            let text = g.querySelector('text.link-label');
            if (link.text && finalStart && finalEnd) {
                if (!text) {
                    text = document.createElementNS("http://www.w3.org/2000/svg", 'text');
                    text.setAttribute('class', 'link-label');
                    g.appendChild(text);
                }
                text.setAttribute('dy', curveDirection === -1 ? '15px' : '-5px');
                
                const textPathId = `text-path-${link.id}`;
                let textPathEl = defs.querySelector(`#${textPathId}`);
                if (!textPathEl) {
                    textPathEl = document.createElementNS("http://www.w3.org/2000/svg", 'path');
                    textPathEl.id = textPathId;
                    defs.appendChild(textPathEl);
                }
                
                const shouldFlipText = finalStart.x > finalEnd.x;
                if (shouldFlipText) {
                     if (isCurved && controlPoint) textPathEl.setAttribute('d', `M ${finalEnd.x} ${finalEnd.y} Q ${controlPoint.x} ${controlPoint.y} ${finalStart.x} ${finalStart.y}`);
                     else textPathEl.setAttribute('d', `M ${finalEnd.x} ${finalEnd.y} L ${finalStart.x} ${finalStart.y}`);
                } else {
                    textPathEl.setAttribute('d', pathData);
                }
                
                let textElement = text.querySelector('textPath');
                if (!textElement) {
                    textElement = document.createElementNS("http://www.w3.org/2000/svg", 'textPath');
                    textElement.setAttribute('href', `#${textPathId}`);
                    textElement.setAttribute('startOffset', '50%');
                    textElement.setAttribute('class', 'link-label-text');
                    textElement.setAttribute('text-anchor', 'middle');
                    text.appendChild(textElement);
                }
                textElement.setAttribute('fill', link.textColor || '#333');
                textElement.textContent = link.text;
            } else if (text) {
                text.remove();
            }
        });
    }

    function renderGroups() {
        const currentGroupIds = new Set(state.diagram.groups.map(g => g.id));
        for (const [id, element] of state.domCache.groups) {
            if (!currentGroupIds.has(id)) {
                element.remove();
                state.domCache.groups.delete(id);
            }
        }
        
        const sortedGroups = state.diagram.groups.map(group => {
            const bbox = getGroupBbox(group);
            return { group, bbox, area: bbox ? bbox.width * bbox.height : 0 };
        }).filter(item => item.bbox).sort((a, b) => b.area - a.area);

        sortedGroups.forEach(({ group }) => {
            let g = state.domCache.groups.get(group.id);
            if (!g) {
                g = document.createElementNS("http://www.w3.org/2000/svg", 'g');
                g.setAttribute('class', 'group');
                g.dataset.id = group.id;
                state.domCache.groups.set(group.id, g);
            }
            groupLayer.appendChild(g);
        });

        sortedGroups.forEach(({ group, bbox }) => {
            const padding = 40;
            let g = state.domCache.groups.get(group.id);
            
            if (state.selectedItems.has(group.id)) g.classList.add('selected');
            else g.classList.remove('selected');

            let rect = g.querySelector('rect.group-rect');
            if (!rect) {
                rect = document.createElementNS("http://www.w3.org/2000/svg", 'rect');
                rect.setAttribute('class', 'group-rect');
                g.appendChild(rect);
            }
            rect.setAttribute('x', bbox.x - padding);
            rect.setAttribute('y', bbox.y - padding);
            rect.setAttribute('width', bbox.width + padding * 2);
            rect.setAttribute('height', bbox.height + padding * 2);
            rect.setAttribute('stroke', group.color);
            rect.setAttribute('fill', hexToRgba(group.color, 0.1));
            rect.setAttribute('rx', '15');
            rect.setAttribute('ry', '15');
            
            let text = g.querySelector('text.group-label');
            if (!text) {
                text = document.createElementNS("http://www.w3.org/2000/svg", 'text');
                text.setAttribute('class', 'group-label');
                g.appendChild(text);
            }
            text.setAttribute('x', bbox.x - padding + 10);
            text.setAttribute('y', bbox.y - padding + 20);
            text.setAttribute('fill', group.color);
            text.textContent = group.name;

            let connector = g.querySelector('circle.connector');
            if (!connector) {
                connector = document.createElementNS("http://www.w3.org/2000/svg", 'circle');
                connector.setAttribute('class', 'connector');
                connector.setAttribute('r', 8);
                g.appendChild(connector);
            }
            connector.setAttribute('cx', bbox.x - padding + (bbox.width + padding * 2) / 2);
            connector.setAttribute('cy', bbox.y - padding);
            connector.setAttribute('fill', group.color);
        });
    }

function updateSidebar() {
    nodeSettings.classList.add('hidden');
    linkSettings.classList.add('hidden');
    groupSettings.classList.add('hidden');

    if (state.selectedItems.size === 0) {
        editPanel.classList.add('hidden');
        noSelectionPanel.classList.remove('hidden');
        return;
    }

    editPanel.classList.remove('hidden');
    noSelectionPanel.classList.add('hidden');

    const firstSelectedId = state.selectedItems.values().next().value;
    const node = state.diagram.nodes.find(n => n.id === firstSelectedId);
    const link = state.diagram.links.find(l => l.id === firstSelectedId);
    const group = state.diagram.groups.find(g => g.id === firstSelectedId);

    if (state.selectedItems.size > 1) {
         editPanelTitle.textContent = `${state.selectedItems.size}項目を選択中`;
         addNodeToGroupSection.classList.add('hidden');
    } else if (node) {
        editPanelTitle.textContent = 'ノード設定';
        nodeSettings.classList.remove('hidden');
        if (document.activeElement !== nodeNameInput) {
            nodeNameInput.value = node.name;
        }
        syncColorInputs(nodeColorInput, nodeColorCodeInput, node.color);
        nodeSizeInput.value = node.size;
        syncColorInputs(nodeTextColorInput, nodeTextColorCodeInput, node.textColor || '#333333');
        nodeShapeInput.value = node.shape || 'circle';
        syncColorInputs(nodeBgColorInput, nodeBgColorCodeInput, node.backgroundColor || '#ffffff');
        nodeImageDisplayInput.value = node.imageDisplayMode || 'clip';
        editImageBtn.disabled = !node.imageUrl;
    } else if (link) {
        editPanelTitle.textContent = '線設定';
        linkSettings.classList.remove('hidden');
        linkTextInput.value = link.text;
        syncColorInputs(linkColorInput, linkColorCodeInput, link.color);
        linkStyleInput.value = link.style;
        linkShapeInput.value = link.shape;
        linkArrowInput.value = link.arrow;
        syncColorInputs(linkTextColorInput, linkTextColorCodeInput, link.textColor || '#333333');
    } else if (group) {
        editPanelTitle.textContent = 'グループ設定';
        groupSettings.classList.remove('hidden');
        groupNameInput.value = group.name;
        syncColorInputs(groupColorInput, groupColorCodeInput, group.color);

        const nodesInGroup = new Set(group.nodeIds);
        const availableNodes = state.diagram.nodes.filter(n => !nodesInGroup.has(n.id));
        
        addNodeToGroupSelect.innerHTML = '';

        if (availableNodes.length > 0) {
            availableNodes.forEach(n => {
                const option = document.createElement('option');
                option.value = n.id;
                option.textContent = n.name || `(無題ノード)`;
                addNodeToGroupSelect.appendChild(option);
            });
            
            addNodeToGroupSelect.selectedIndex = 0;
            
            addNodeToGroupSection.classList.remove('hidden');
            addNodeToGroupBtn.disabled = false;
            addNodeToGroupMessage.textContent = '';
        } else {
            addNodeToGroupSection.classList.add('hidden');
            addNodeToGroupBtn.disabled = true;
            addNodeToGroupMessage.textContent = '追加できるノードがありません。';
        }
    }
}
    // --- 履歴管理 ---
    function saveState(actionName = 'unknown', shouldSaveToLocalStorage = true) {
        state.redoStack = [];
        state.history.push(JSON.parse(JSON.stringify(state.diagram)));
        if (state.history.length > 50) state.history.shift();
        updateUndoRedoButtons();
        
        log('DEBUG', `状態を保存しました (Action: ${actionName})`, { historySize: state.history.length });

        if (shouldSaveToLocalStorage) {
            saveToLocalStorage();
        }
    }

    function undo() {
        if (state.history.length > 1) {
            log('INFO', '操作を元に戻します (Undo)');
            const currentState = state.history.pop();
            state.redoStack.push(currentState);
            const prevState = state.history[state.history.length - 1];
            state.diagram = JSON.parse(JSON.stringify(prevState));
            state.selectedItems.clear();
            clearDomCache();
            render();
        }
    }

    function redo() {
        if (state.redoStack.length > 0) {
            log('INFO', '操作をやり直します (Redo)');
            const nextState = state.redoStack.pop();
            state.history.push(nextState);
            state.diagram = JSON.parse(JSON.stringify(nextState));
            state.selectedItems.clear();
            clearDomCache();
            render();
        }
    }

    function clearDomCache() {
        state.domCache.nodes.forEach(element => element.remove());
        state.domCache.links.forEach(element => element.remove());
        state.domCache.groups.forEach(element => element.remove());
        state.domCache.nodes.clear();
        state.domCache.links.clear();
        state.domCache.groups.clear();
    }
    
    function updateUndoRedoButtons() {
        undoBtn.disabled = state.history.length <= 1;
        redoBtn.disabled = state.redoStack.length === 0;
    }
    
    // --- イベント処理 ---
    
    // ★★★ 変更点: 線の描画ロジックを一本化 ★★★
    function handlePointerDown(e, isTouch = false) {
        hideContextMenu();
        const clientX = isTouch ? e.touches[0].clientX : e.clientX;
        const clientY = isTouch ? e.touches[0].clientY : e.clientY;
        const pos = getSvgPoint(clientX, clientY);
        const target = e.target;
        
        if (!isTouch && e.button === 2) return;
        
        if (target.matches('.connector')) {
            e.stopPropagation();
            const sourceElement = target.closest('[data-id]');
            if (sourceElement) {
                const sourceId = sourceElement.dataset.id;
                activeLink = { sourceId: sourceId }; // 状態をセットするだけ
                updateTempLink(sourceId, pos); // 初回描画
                return;
            }
        }

        const targetElement = e.target.closest('.node, .group, .link-group');
        const isCtrlOrCmd = e.ctrlKey || e.metaKey;

        if (targetElement) {
            e.stopPropagation();
            const id = targetElement.dataset.id;
            if (!isCtrlOrCmd && !state.selectedItems.has(id)) {
                state.selectedItems.clear();
            }
            if (isCtrlOrCmd) {
                state.selectedItems.has(id) ? state.selectedItems.delete(id) : state.selectedItems.add(id);
            } else {
                state.selectedItems.add(id);
            }
            
            activeDrag = { type: 'element', ids: [...state.selectedItems], startX: pos.x, startY: pos.y, initialPositions: new Map() };
            activeDrag.ids.forEach(dragId => {
                 const node = state.diagram.nodes.find(n => n.id === dragId);
                 if (node) activeDrag.initialPositions.set(dragId, {x: node.x, y: node.y});
                 
                 const group = state.diagram.groups.find(g => g.id === dragId);
                 if(group) {
                    const nodesInGroup = group.nodeIds.map(nid => state.diagram.nodes.find(n => n.id === nid)).filter(Boolean);
                    activeDrag.initialPositions.set(dragId, { nodes: nodesInGroup.map(n => ({id: n.id, x: n.x, y: n.y})) });
                 }
            });

        } else {
            if (!isTouch && e.button === 1) {
                 activeDrag = { type: 'pan' };
                 svg.classList.add('panning');
            } else if (!isTouch && e.button === 0 || isTouch) {
                if (!isCtrlOrCmd) state.selectedItems.clear();
                selectionBox = { startX: pos.x, startY: pos.y, rect: document.createElementNS("http://www.w3.org/2000/svg", 'rect') };
                selectionBox.rect.setAttribute('class', 'selection-box');
                selectionBoxLayer.appendChild(selectionBox.rect);
            }
        }
        lastMousePos = { x: clientX, y: clientY };
        render();
    }

    function handlePointerMove(e, isTouch = false) {
        if (isTouch && e.touches.length > 1) return;
        
        const clientX = isTouch ? e.touches[0].clientX : e.clientX;
        const clientY = isTouch ? e.touches[0].clientY : e.clientY;
        const pos = getSvgPoint(clientX, clientY);

        if (activeLink) {
            updateTempLink(activeLink.sourceId, pos); // ★★★ 変更点 ★★★
        } else if (activeDrag) {
            const dx = pos.x - activeDrag.startX;
            const dy = pos.y - activeDrag.startY;

            if (activeDrag.type === 'element') {
                activeDrag.ids.forEach(id => {
                    const node = state.diagram.nodes.find(n => n.id === id);
                    const group = state.diagram.groups.find(g => g.id === id);
                    const initialPos = activeDrag.initialPositions.get(id);

                    if (node && initialPos) {
                        node.x = initialPos.x + dx;
                        node.y = initialPos.y + dy;
                    } else if (group && initialPos && initialPos.nodes) {
                        initialPos.nodes.forEach(initialNodePos => {
                            const nodeToMove = state.diagram.nodes.find(n => n.id === initialNodePos.id);
                            if(nodeToMove){
                                nodeToMove.x = initialNodePos.x + dx;
                                nodeToMove.y = initialNodePos.y + dy;
                            }
                        });
                    }
                });
                render();
            } else if (activeDrag.type === 'pan') {
                 state.view.x += clientX - lastMousePos.x;
                 state.view.y += clientY - lastMousePos.y;
                 lastMousePos = { x: clientX, y: clientY };
                 render();
            }
        } else if (selectionBox) {
            const x = Math.min(selectionBox.startX, pos.x), y = Math.min(selectionBox.startY, pos.y);
            const width = Math.abs(pos.x - selectionBox.startX), height = Math.abs(pos.y - selectionBox.startY);
            selectionBox.rect.setAttribute('x', x);
            selectionBox.rect.setAttribute('y', y);
            selectionBox.rect.setAttribute('width', width);
            selectionBox.rect.setAttribute('height', height);
        }
    }

    function handlePointerUp(e, isTouch = false) {
        if (activeDrag?.type === 'element') saveState('element drag');

        if (activeLink) {
            const clientX = isTouch ? e.changedTouches[0].clientX : e.clientX;
            const clientY = isTouch ? e.changedTouches[0].clientY : e.clientY;

            const target = document.elementFromPoint(clientX, clientY);
            const targetElement = target?.closest('.node, .group');
            if (targetElement) {
                const targetId = targetElement.dataset.id;
                if (activeLink.sourceId !== targetId) createLink(activeLink.sourceId, targetId);
            }
            removeTempLink();
            activeLink = null;
        }
        
        if (selectionBox) {
            const screenRect = selectionBox.rect.getBoundingClientRect();
            const topLeft = getSvgPoint(screenRect.left, screenRect.top);
            const bottomRight = getSvgPoint(screenRect.right, screenRect.bottom);
            const selectionRect = {
                x: Math.min(topLeft.x, bottomRight.x),
                y: Math.min(topLeft.y, bottomRight.y),
                width: Math.abs(topLeft.x - bottomRight.x),
                height: Math.abs(topLeft.y - bottomRight.y)
            };

            state.diagram.nodes.forEach(node => {
                const nodeBBox = { x: node.x - node.size, y: node.y - node.size, width: node.size * 2, height: node.size * 2 };
                if (selectionRect.x < nodeBBox.x + nodeBBox.width &&
                    selectionRect.x + selectionRect.width > nodeBBox.x &&
                    selectionRect.y < nodeBBox.y + nodeBBox.height &&
                    selectionRect.y + selectionRect.height > nodeBBox.y) {
                     state.selectedItems.add(node.id);
                }
            });
            selectionBoxLayer.innerHTML = '';
            selectionBox = null;
            render();
        }

        if (activeDrag?.type === 'pan') svg.classList.remove('panning');
        activeDrag = null;
    }
    
    let touchHoldTimer = null; let touchStartPos = null;
    function handleTouchStart(e) { e.preventDefault(); if (e.touches.length === 1) { handlePointerDown(e, true); touchStartPos = { x: e.touches[0].clientX, y: e.touches[0].clientY }; touchHoldTimer = setTimeout(() => { const targetElement = e.target.closest('[data-id]'); if (targetElement) { handleContextMenu(e); } }, 500); } else if (e.touches.length === 2) { const t1 = getTouchPoint(e.touches[0]); const t2 = getTouchPoint(e.touches[1]); touchStartDistance = Math.hypot(t2.x - t1.x, t2.y - t1.y); pinchStartScale = state.view.k; } }
    function handleTouchMove(e) { e.preventDefault(); if (touchHoldTimer && touchStartPos) { const dx = Math.abs(e.touches[0].clientX - touchStartPos.x); const dy = Math.abs(e.touches[0].clientY - touchStartPos.y); if (dx > 10 || dy > 10) { clearTimeout(touchHoldTimer); touchHoldTimer = null; } } if (e.touches.length === 1) { handlePointerMove(e, true); } else if (e.touches.length === 2 && touchStartDistance > 0) { const t1 = getTouchPoint(e.touches[0]); const t2 = getTouchPoint(e.touches[1]); const dist = Math.hypot(t2.x-t1.x, t2.y-t1.y); const scale = dist / touchStartDistance; state.view.k = Math.max(0.1, Math.min(5, pinchStartScale * scale)); const centerX = (t1.x + t2.x) / 2; const centerY = (t1.y + t2.y) / 2; state.view.x = centerX - (centerX - state.view.x) * (state.view.k / pinchStartScale); state.view.y = centerY - (centerY - state.view.y) * (state.view.k / pinchStartScale); render(); } }
    function handleTouchEnd(e) { if (touchHoldTimer) { clearTimeout(touchHoldTimer); touchHoldTimer = null; } touchStartPos = null; if (e.touches.length === 0) { handlePointerUp(e, true); touchStartDistance = 0; } }

    function handleContextMenu(e) {
        e.preventDefault();
        const targetElement = e.target.closest('[data-id]');
        if (!targetElement) {
            hideContextMenu(); return;
        }
        const id = targetElement.dataset.id;
        const isCtrlOrCmd = e.ctrlKey || e.metaKey;
        if (!isCtrlOrCmd && !state.selectedItems.has(id)) {
             state.selectedItems.clear();
             state.selectedItems.add(id);
             render();
        }
        
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        showContextMenu(clientX, clientY, targetElement, id);
    }

function handleSidebarChange(e) {
    const selectedIds = [...state.selectedItems];
    if (selectedIds.length === 0) return;

    const targetElement = e.target;

    selectedIds.forEach(id => {
        const node = state.diagram.nodes.find(n => n.id === id);
        if (node) {
            node.name = nodeNameInput.value;
            node.color = nodeColorInput.value;
            node.size = parseInt(nodeSizeInput.value);
            node.textColor = nodeTextColorInput.value;
            node.shape = nodeShapeInput.value;
            node.backgroundColor = nodeBgColorInput.value;
            node.imageDisplayMode = nodeImageDisplayInput.value;
        }
        const link = state.diagram.links.find(l => l.id === id);
        if (link) {
            link.text = linkTextInput.value;
            link.color = linkColorInput.value;
            link.style = linkStyleInput.value;
            link.shape = linkShapeInput.value;
            link.arrow = linkArrowInput.value;
            link.textColor = linkTextColorInput.value;
        }
        const group = state.diagram.groups.find(g => g.id === id);
        if (group) {
            group.name = groupNameInput.value;
            group.color = groupColorInput.value;
        }
    });

    // カラーコード入力欄からの変更を反映
    if (targetElement.classList.contains('color-code-input')) {
        const colorPicker = targetElement.previousElementSibling;
        if (/^#[0-9a-fA-F]{6}$/.test(targetElement.value)) {
            colorPicker.value = targetElement.value;
            colorPicker.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    if (targetElement.id !== 'add-node-to-group-select') {
        render();
    }
}    
    const debouncedHandleSidebarChange = debounce(() => {
        saveState('sidebar change');
    }, 500);

    function handleWheel(e) {
        e.preventDefault();
        const pos = getSvgPoint(e.clientX, e.clientY);
        const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
        state.view.k = Math.max(0.1, Math.min(5, state.view.k * zoomFactor));
        state.view.x = pos.x - (pos.x - state.view.x) * zoomFactor;
        state.view.y = pos.y - (pos.y - state.view.y) * zoomFactor;
        render();
    }

    function setZoom(newScale, pivotX, pivotY) {
        const currentScale = state.view.k;
        const newK = Math.max(0.1, Math.min(5, newScale));
        const zoomFactor = newK / currentScale;
        
        const pos = getSvgPoint(pivotX, pivotY);

        state.view.k = newK;
        state.view.x = pos.x - (pos.x - state.view.x) * zoomFactor;
        state.view.y = pos.y - (pos.y - state.view.y) * zoomFactor;
        render();
    }

    function handleKeyDown(e) {
        const isCtrlOrCmd = e.ctrlKey || e.metaKey;
        
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') {
            if (e.target.tagName === 'TEXTAREA' && e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                e.target.blur();
            }
            return;
        }
        
        if (isCtrlOrCmd && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            if (e.shiftKey) redo();
            else undo();
        } else if (isCtrlOrCmd && e.key.toLowerCase() === 'y') {
            e.preventDefault();
            redo();
        } else if (isCtrlOrCmd && e.key.toLowerCase() === 'a') {
            e.preventDefault();
            state.selectedItems.clear();
            state.diagram.nodes.forEach(node => state.selectedItems.add(node.id));
            state.diagram.links.forEach(link => state.selectedItems.add(link.id));
            state.diagram.groups.forEach(group => state.selectedItems.add(group.id));
            render();
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            if (state.selectedItems.size > 0) {
                deleteSelectedItems();
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            render();
        } else if (e.key.toLowerCase() === 'n' && isCtrlOrCmd) {
            e.preventDefault();
            createNode();
        } else if (e.key.toLowerCase() === 'g' && isCtrlOrCmd) {
            e.preventDefault();
            createGroup();
        }
    }

    // --- コンテキストメニュー ---
    function showContextMenu(x, y, targetElement, id) {
        contextMenu.innerHTML = '';
        const menuItems = document.createElement('div');
        if (targetElement.matches('.node')) {
            const uploadButton = document.createElement('button');
            uploadButton.innerHTML = `<i class="fas fa-image mr-2"></i> アイコン画像を設定...`;
            uploadButton.onclick = () => { 
                targetNodeIdForImageUpload = id; 
                imageUploadInput.click(); 
                hideContextMenu(); 
            };
            menuItems.appendChild(uploadButton);
        }
        const deleteButton = document.createElement('button');
        deleteButton.innerHTML = `<i class="fas fa-trash-alt mr-2"></i> 削除`;
        deleteButton.onclick = deleteSelectedItems;
        menuItems.appendChild(deleteButton);
        
        contextMenu.style.display = 'block';
        contextMenu.appendChild(menuItems);
        
        const menuWidth = contextMenu.offsetWidth;
        const menuHeight = contextMenu.offsetHeight;
        const bodyWidth = document.body.clientWidth;
        const bodyHeight = document.body.clientHeight;

        let finalX = x, finalY = y;
        if (x + menuWidth > bodyWidth) finalX = x - menuWidth;
        if (y + menuHeight > bodyHeight) finalY = y - menuHeight;
        
        contextMenu.style.left = `${finalX}px`;
        contextMenu.style.top = `${finalY}px`;
    }

    function hideContextMenu() {
        contextMenu.style.display = 'none';
    }

    // --- 画像アップロード ---
    function handleImageUpload(e) {
        const file = e.target.files[0];
        const nodeIdToUpdate = targetNodeIdForImageUpload;
        
        targetNodeIdForImageUpload = null;
        e.target.value = '';

        if (!nodeIdToUpdate) return;
        
        if (!state.selectedItems.has(nodeIdToUpdate)) {
            state.selectedItems.clear();
            state.selectedItems.add(nodeIdToUpdate);
        }
        
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const node = state.diagram.nodes.find(n => n.id === nodeIdToUpdate);
                if (node) {
                    node.imageUrl = event.target.result;
                    render();
                    saveState('image upload');
                }
            };
            reader.readAsDataURL(file);
        } else {
            render();
        }
    }

    // ★★★ 変更点: createTempLinkFromSourceを削除し、updateTempLinkに統合 ★★★
    function updateTempLink(sourceId, targetPos) {
        let path = document.getElementById('temp-link');
        if (!path) {
            path = document.createElementNS("http://www.w3.org/2000/svg", 'path');
            path.id = 'temp-link';
            path.setAttribute('stroke', '#333');
            path.setAttribute('stroke-width', 2);
            path.setAttribute('stroke-dasharray', '5 5');
            path.setAttribute('fill', 'none');
            linkLayer.appendChild(path);
        }
    
        const sourceDetails = getEndpointDetails(sourceId);
        if (!sourceDetails) return;
    
        let startPos;
        if (sourceDetails.type === 'node') {
            startPos = { x: sourceDetails.x, y: sourceDetails.y };
        } else if (sourceDetails.type === 'group' && sourceDetails.bbox) {
            startPos = {
                x: sourceDetails.bbox.x + sourceDetails.bbox.width / 2,
                y: sourceDetails.bbox.y
            };
        } else {
            return;
        }
    
        path.setAttribute('d', `M ${startPos.x} ${startPos.y} L ${targetPos.x} ${targetPos.y}`);
    }

    function removeTempLink() { const path = document.getElementById('temp-link'); if (path) path.remove(); }

    // --- データ操作関数 ---
    function createNode() {
        const viewCenter = getSvgPoint(window.innerWidth / 2, window.innerHeight / 2);
        const id = getNextId();
        const newNode = {
            id, x: viewCenter.x, y: viewCenter.y, name: `ノード`,
            imageUrl: null, color: '#4f46e5', size: 40, textColor: '#333333',
            shape: 'circle', backgroundColor: '#ffffff', imageDisplayMode: 'clip',
            imageTransform: { scale: 1, offsetX: 0, offsetY: 0 }
        };
        state.diagram.nodes.push(newNode);
        log('INFO', 'ノードを作成しました。', newNode);

        const isGroupSelected = [...state.selectedItems].some(id => state.diagram.groups.some(g => g.id === id));
        if (!isGroupSelected) {
            state.selectedItems.clear();
            state.selectedItems.add(id);
        }
        
        saveState('create node');
        render();
    }

    function createLink(sourceId, targetId) {
        if (state.diagram.links.some(l => l.source === sourceId && l.target === targetId)) return;
        const id = getNextId();
        const newLink = {
            id, source: sourceId, target: targetId, text: '',
            color: '#333333', style: 'solid', shape: 'straight', arrow: 'to', textColor: '#333333'
        };
        state.diagram.links.push(newLink);
        log('INFO', '線を作成しました。', newLink);
        state.selectedItems.clear();
        state.selectedItems.add(id);
        saveState('create link');
        render();
    }

    function createGroup() {
        const selectedNodeIds = [...state.selectedItems].filter(id => state.diagram.nodes.some(n => n.id === id));
        if (selectedNodeIds.length < 1) {
            log('WARN', 'グループ化するノードが選択されていません。');
            return;
        }
        const id = getNextId();
        const newGroup = { id, nodeIds: selectedNodeIds, name: `グループ`, color: '#ffc107' };
        state.diagram.groups.push(newGroup);
        log('INFO', 'グループを作成しました。', newGroup);
        state.selectedItems.clear();
        state.selectedItems.add(id);
        saveState('create group');
        render();
    }

    function deleteSelectedItems() {
        const idsToDelete = new Set(state.selectedItems);
        if (idsToDelete.size === 0) return;
        log('INFO', `${idsToDelete.size}個のアイテムを削除します。`, [...idsToDelete]);

        state.diagram.nodes = state.diagram.nodes.filter(n => !idsToDelete.has(n.id));
        state.diagram.groups = state.diagram.groups.filter(g => !idsToDelete.has(g.id));
        state.diagram.links = state.diagram.links.filter(l => !idsToDelete.has(l.id));

        state.diagram.links = state.diagram.links.filter(l => !idsToDelete.has(l.source) && !idsToDelete.has(l.target));
        
        state.diagram.groups.forEach(g => g.nodeIds = g.nodeIds.filter(nid => !idsToDelete.has(nid)));
        state.diagram.groups = state.diagram.groups.filter(g => g.nodeIds.length > 0);
        
        state.selectedItems.clear();
        hideContextMenu();
        saveState('delete items');
        clearDomCache();
        render();
    }
    
    async function exportProject() { log('INFO', 'プロジェクトのエクスポートを開始します。'); const button = exportProjectBtn; const originalHtml = button.innerHTML; button.disabled = true; button.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i>保存中...`; try { const zip = new JSZip(); const imagesFolder = zip.folder("images"); const exportState = JSON.parse(JSON.stringify(state)); exportState.diagram.nodes.forEach(node => { if (node.imageUrl && node.imageUrl.startsWith('data:image')) { const dataUrl = node.imageUrl; const mimeTypeMatch = dataUrl.match(/data:(.*);base64,/); if (!mimeTypeMatch) return; const mimeType = mimeTypeMatch[1]; const base64Data = dataUrl.substring(dataUrl.indexOf(',') + 1); const extension = mimeType.split('/')[1] || 'png'; const fileName = `image_${node.id}.${extension}`; imagesFolder.file(fileName, base64Data, { base64: true }); node.imageUrl = `images/${fileName}`; } }); const dataToSave = { version: '1.0-zip', diagram: exportState.diagram, view: exportState.view, }; zip.file("data.json", JSON.stringify(dataToSave, null, 2)); const content = await zip.generateAsync({ type: "blob" }); const a = document.createElement("a"); a.href = URL.createObjectURL(content); a.download = `相関図プロジェクト_${new Date().toLocaleString('sv').replace(/[\/ :]/g, '-')}.zip`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(a.href); log('INFO', 'プロジェクトのエクスポートに成功しました。'); } catch (error) { log('ERROR', 'プロジェクトのエクスポートに失敗しました。', error); alert("プロジェクトのエクスポートに失敗しました。"); } finally { button.disabled = false; button.innerHTML = originalHtml; } }
    async function importProject(e) { const file = e.target.files[0]; if (!file) return; log('INFO', 'プロジェクトのインポートを開始します。', { name: file.name, size: file.size }); const button = importProjectBtn; const originalHtml = button.innerHTML; button.disabled = true; button.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i>読込中...`; try { const zip = await JSZip.loadAsync(file); const dataFile = zip.file("data.json"); if (!dataFile) { throw new Error("ZIPファイル内にdata.jsonが見つかりません。"); } const content = await dataFile.async("string"); const loadedData = JSON.parse(content); const imagePromises = loadedData.diagram.nodes.map(async (node) => { if (node.imageUrl && node.imageUrl.startsWith('images/')) { const imageFile = zip.file(node.imageUrl); if (imageFile) { const base64Data = await imageFile.async("base64"); const fileExtension = node.imageUrl.split('.').pop().toLowerCase(); const mimeType = `image/${fileExtension === 'jpg' ? 'jpeg' : fileExtension}`; node.imageUrl = `data:${mimeType};base64,${base64Data}`; } else { log('WARN', `画像ファイルが見つかりません: ${node.imageUrl}`); node.imageUrl = null; } } }); await Promise.all(imagePromises); state.diagram = loadedData.diagram; state.view = loadedData.view || { x: 0, y: 0, k: 1 }; state.selectedItems.clear(); state.history = []; state.redoStack = []; saveState('project import', false); clearDomCache(); render(); log('INFO', 'プロジェクトを正常に読み込みました。'); alert("プロジェクトを正常に読み込みました。"); } catch (error) { log('ERROR', 'プロジェクトのインポートに失敗しました。', error); alert(`プロジェクトのインポートに失敗しました: ${error.message}`); } finally { e.target.value = ''; button.disabled = false; button.innerHTML = originalHtml; } }
    
    async function exportPNG() {
        log('INFO', 'PNGエクスポートを開始します。');
        const exportBtn = document.getElementById('export-png-btn');
        const originalText = exportBtn.innerHTML;
        exportBtn.disabled = true;
        exportBtn.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i>生成中...`;
    
        try {
            const contentLayer = document.createElementNS("http://www.w3.org/2000/svg", 'g');
            contentLayer.appendChild(groupLayer.cloneNode(true));
            contentLayer.appendChild(linkLayer.cloneNode(true));
            contentLayer.appendChild(nodeLayer.cloneNode(true));
            svg.appendChild(contentLayer);
            const bbox = contentLayer.getBBox();
            svg.removeChild(contentLayer);
    
            if (bbox.width === 0 && bbox.height === 0) {
                log('WARN', 'エクスポートする内容がありません。');
                alert("エクスポートする内容がありません。");
                return;
            }
    
            const padding = 40;
            const scale = 2; // 解像度を2倍にする
    
            const svgClone = svg.cloneNode(true);
            svgClone.removeAttribute("class");
            svgClone.setAttribute('width', (bbox.width + padding * 2) * scale);
            svgClone.setAttribute('height', (bbox.height + padding * 2) * scale);
            svgClone.setAttribute('viewBox', `${bbox.x - padding} ${bbox.y - padding} ${bbox.width + padding * 2} ${bbox.height + padding * 2}`);
    
            const background = document.createElementNS("http://www.w3.org/2000/svg", 'rect');
            background.setAttribute('x', bbox.x - padding);
            background.setAttribute('y', bbox.y - padding);
            background.setAttribute('width', bbox.width + padding * 2);
            background.setAttribute('height', bbox.height + padding * 2);
            background.setAttribute('fill', 'white');
            svgClone.insertBefore(background, svgClone.firstChild);
    
            svgClone.querySelectorAll('.selection-box-layer, .connector, .node.selected, .link-group.selected, .group.selected').forEach(el => { el.classList.remove('selected'); });
            svgClone.querySelectorAll('.selection-box-layer, .connector').forEach(el => el.remove());
            
            svgClone.querySelectorAll('.node-name tspan, .link-label-text').forEach(textEl => {
                const currentFill = textEl.closest('text').getAttribute('fill') || '#333';
                textEl.setAttribute('stroke', 'white');
                textEl.setAttribute('stroke-width', '3px');
                textEl.setAttribute('stroke-linejoin', 'round');
                textEl.setAttribute('paint-order', 'stroke');
                textEl.setAttribute('fill', currentFill);
            });
    
            const svgString = new XMLSerializer().serializeToString(svgClone);
            const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
            const url = URL.createObjectURL(blob);
    
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();
            img.crossOrigin = "anonymous";
    
            img.onload = function() {
                canvas.width = (bbox.width + padding * 2) * scale;
                canvas.height = (bbox.height + padding * 2) * scale;
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                URL.revokeObjectURL(url);
    
                const dataUrl = canvas.toDataURL('image/png');
                const a = document.createElement('a');
                a.href = dataUrl;
                a.download = '相関図.png';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            };
    
            img.onerror = function(e) {
                log('ERROR', "PNGエクスポート用のSVG画像の読み込みに失敗しました。", e);
                alert("PNGエクスポートに失敗しました。");
                URL.revokeObjectURL(url);
            };
            
            img.src = url;
    
        } catch (error) {
            log('ERROR', "PNGエクスポート中にエラーが発生しました:", error);
            alert("PNGエクスポート中にエラーが発生しました。");
        } finally {
            exportBtn.disabled = false;
            exportBtn.innerHTML = originalText;
        }
    }

    function hexToRgba(hex, alpha) {
        let r=0,g=0,b=0;
        if(hex.length==4){r="0x"+hex[1]+hex[1];g="0x"+hex[2]+hex[2];b="0x"+hex[3]+hex[3];}
        else if(hex.length==7){r="0x"+hex[1]+hex[2];g="0x"+hex[3]+hex[4];b="0x"+hex[5]+hex[6];}
        return`rgba(${+r},${+g},${+b},${alpha})`;
    }

    // --- 画像編集モーダル ---
    function openImageEditor() {
        const nodeId = [...state.selectedItems].find(id => state.diagram.nodes.some(n => n.id === id));
        if (!nodeId) return;

        const node = state.diagram.nodes.find(n => n.id === nodeId);
        if (!node || !node.imageUrl) return;

        activeImageEditor = {
            nodeId: nodeId,
            transform: JSON.parse(JSON.stringify(node.imageTransform || { scale: 1, offsetX: 0, offsetY: 0 })),
            previewElement: null,
            isDragging: false,
            lastMousePos: { x: 0, y: 0 }
        };

        imageEditorPreview.innerHTML = '';
        const previewImage = document.createElement('div');
        previewImage.className = 'preview-image';
        previewImage.style.backgroundImage = `url(${node.imageUrl})`;
        imageEditorPreview.appendChild(previewImage);
        activeImageEditor.previewElement = previewImage;

        imageZoomSlider.value = activeImageEditor.transform.scale;
        updateImagePreview();

        imageEditorModal.classList.remove('hidden');
    }

    function closeImageEditor() {
        imageEditorModal.classList.add('hidden');
        activeImageEditor = null;
    }

    function saveImageEdit() {
        if (!activeImageEditor) return;
        const node = state.diagram.nodes.find(n => n.id === activeImageEditor.nodeId);
        if (node) {
            node.imageTransform = { ...activeImageEditor.transform };
            saveState('image edit');
            render();
        }
        closeImageEditor();
    }

    function updateImagePreview() {
        if (!activeImageEditor || !activeImageEditor.previewElement) return;
        const { scale, offsetX, offsetY } = activeImageEditor.transform;
        activeImageEditor.previewElement.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
    }

    function handleImageEditorMouseDown(e) {
        if (!activeImageEditor) return;
        e.preventDefault();
        activeImageEditor.isDragging = true;
        activeImageEditor.lastMousePos = { x: e.clientX, y: e.clientY };
        imageEditorPreview.style.cursor = 'grabbing';
    }

    function handleImageEditorMouseMove(e) {
        if (!activeImageEditor || !activeImageEditor.isDragging) return;
        e.preventDefault();
        const dx = e.clientX - activeImageEditor.lastMousePos.x;
        const dy = e.clientY - activeImageEditor.lastMousePos.y;
        activeImageEditor.transform.offsetX += dx;
        activeImageEditor.transform.offsetY += dy;
        activeImageEditor.lastMousePos = { x: e.clientX, y: e.clientY };
        updateImagePreview();
    }

    function handleImageEditorMouseUp(e) {
        if (!activeImageEditor || !activeImageEditor.isDragging) return;
        activeImageEditor.isDragging = false;
        imageEditorPreview.style.cursor = 'grab';
    }

    function init() {
        log('INFO', 'アプリケーションを初期化しています...');
        addNodeBtn.addEventListener('click', createNode);
        undoBtn.addEventListener('click', undo);
        redoBtn.addEventListener('click', redo);
        deleteBtn.addEventListener('click', deleteSelectedItems);
        groupBtn.addEventListener('click', createGroup);
        exportPngBtn.addEventListener('click', exportPNG);
        imageUploadInput.addEventListener('change', handleImageUpload);
        uploadImageBtn.addEventListener('click', () => {
            const selectedNodeId = [...state.selectedItems].find(id => state.diagram.nodes.some(n => n.id === id));
            if (selectedNodeId) { targetNodeIdForImageUpload = selectedNodeId; imageUploadInput.click(); }
        });
        
        editImageBtn.addEventListener('click', openImageEditor);
        saveImageEditBtn.addEventListener('click', saveImageEdit);
        cancelImageEditBtn.addEventListener('click', closeImageEditor);
        imageZoomSlider.addEventListener('input', () => {
            if (activeImageEditor) {
                activeImageEditor.transform.scale = parseFloat(imageZoomSlider.value);
                updateImagePreview();
            }
        });
        imageEditorPreview.addEventListener('mousedown', handleImageEditorMouseDown);
        window.addEventListener('mousemove', handleImageEditorMouseMove);
        window.addEventListener('mouseup', handleImageEditorMouseUp);
        
        nodeColorTemplates.addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON' && e.target.dataset.color) {
                const color = e.target.dataset.color;
                nodeColorInput.value = color;
                nodeColorCodeInput.value = color;
                nodeColorInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });

        addNodeToGroupBtn.addEventListener('click', () => {
            const nodeIdToAdd = addNodeToGroupSelect.value;
            const groupId = [...state.selectedItems].values().next().value;
            const group = state.diagram.groups.find(g => g.id === groupId);

            if(nodeIdToAdd && group) {
                group.nodeIds.push(nodeIdToAdd);
                saveState('add node to group');
                render();
            }
        });

        exportProjectBtn.addEventListener('click', exportProject);
        importProjectBtn.addEventListener('click', () => projectImportInput.click());
        projectImportInput.addEventListener('change', importProject);

        zoomInBtn.addEventListener('click', () => {
            setZoom(state.view.k * 1.2, window.innerWidth / 2, window.innerHeight / 2);
        });
        zoomOutBtn.addEventListener('click', () => {
            setZoom(state.view.k / 1.2, window.innerWidth / 2, window.innerHeight / 2);
        });
        zoomSlider.addEventListener('input', (e) => {
            setZoom(parseFloat(e.target.value), window.innerWidth / 2, window.innerHeight / 2);
        });

        sidebar.addEventListener('input', (e) => {
            handleSidebarChange(e);
            debouncedHandleSidebarChange();
        });
        
        svg.addEventListener('mousedown', (e) => handlePointerDown(e, false));
        svg.addEventListener('mousemove', (e) => handlePointerMove(e, false));
        window.addEventListener('mouseup', (e) => handlePointerUp(e, false));
        svg.addEventListener('contextmenu', handleContextMenu);
        svg.addEventListener('wheel', handleWheel, { passive: false });
        document.addEventListener('keydown', handleKeyDown);
        
        svg.addEventListener('touchstart', handleTouchStart, { passive: false });
        svg.addEventListener('touchmove', handleTouchMove, { passive: false });
        svg.addEventListener('touchend', handleTouchEnd);
        
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#context-menu')) hideContextMenu();
            if (!svg.contains(e.target) && !e.target.closest('#sidebar') && !e.target.closest('#context-menu')) {
                state.selectedItems.clear();
                render();
            }
        });
        
        if (!loadFromLocalStorage()) {
            saveState('initial state');
        }
        render();
        log('INFO', '初期化が完了しました。');
    }

    init();
})();