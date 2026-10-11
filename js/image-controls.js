(() => {
    const scene = document.getElementById('export-node');
    const tint = document.getElementById('custom-bg-opacity');
    const panel = document.getElementById('image-panel-opacity');
    if (!scene || !tint || !panel) return;
    const tintGroup = document.getElementById('image-tint-control');
    const panelGroup = document.getElementById('image-panel-control');
    const tintValue = document.getElementById('image-tint-value');
    const panelValue = document.getElementById('image-panel-value');
    const posX = document.getElementById('custom-bg-pos-x');
    const posY = document.getElementById('custom-bg-pos-y');
    function update() {
        tintValue.value = `${tint.value}%`;
        panelValue.value = `${panel.value}%`;
        document.getElementById('image-pos-x-value').value = `${posX.value}%`;
        document.getElementById('image-pos-y-value').value = `${posY.value}%`;
        scene.style.setProperty('--image-panel-opacity', Number(panel.value) / 100);
    }
    function sync() {
        const hasImage = scene.dataset.bg === 'custom';
        tintGroup.hidden = !hasImage;
        panelGroup.hidden = !hasImage;
        document.querySelectorAll('.image-controls-only').forEach(group => { group.hidden = !hasImage; });
        update();
    }
    tint.addEventListener('input', update);
    panel.addEventListener('input', update);
    posX.addEventListener('input', update);
    posY.addEventListener('input', update);
    document.getElementById('btn-change-file').addEventListener('click', () => {
        tint.value = 38;
        panel.value = 82;
        sync();
    });
    new MutationObserver(sync).observe(scene, {attributes: true, attributeFilter: ['data-bg']});
    sync();
})();
