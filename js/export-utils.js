(function () {
    'use strict';
    function blob(canvas, type, quality) {
        return new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('No se pudo crear la imagen.')), type, quality));
    }
    function pixelRatio(node) {
        const width = Math.max(node.scrollWidth, node.offsetWidth, 1);
        const height = Math.max(node.scrollHeight, node.offsetHeight, 1);
        return Math.min(2, Math.sqrt(16000000 / (width * height)), 16000 / Math.max(width, height));
    }
    function withTimeout(promise, milliseconds, message) {
        let timer;
        const timeout = new Promise((resolve, reject) => {
            timer = setTimeout(() => reject(new Error(message)), milliseconds);
        });
        return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
    }
    async function render(node, options = {}) {
        const holder = document.createElement('div');
        holder.style.cssText = 'position:fixed;left:-100000px;top:0;pointer-events:none;';
        holder.style.width = node.getBoundingClientRect().width + 'px';
        const clone = node.cloneNode(true);
        clone.style.margin = '0';
        holder.appendChild(clone);
        node.parentElement.appendChild(holder);
        let restore = () => {};
        try {
            const {prepare, ...settings} = options;
            if (prepare) prepare(clone);
            if (window.KSNoteLayout) {
                if (clone.matches('.note-block')) window.KSNoteLayout.fit(clone);
                else window.KSNoteLayout.fitAll(clone);
                window.KSNoteLayout.rasterize(clone);
            }
            if (typeof window.freezeLineBreaks === 'function') restore = window.freezeLineBreaks(clone);
            if (settings.pixelRatio === undefined) settings.pixelRatio = pixelRatio(clone);
            return await withTimeout(htmlToImage.toCanvas(clone, settings), 45000, 'La captura tardó demasiado. Prueba con menos contenido.');
        } finally { restore(); holder.remove(); }
    }
    function startClipboardCopy() {
        if (!window.isSecureContext || !navigator.clipboard || !window.ClipboardItem) {
            throw new Error('Abre la página con Live Server o HTTPS para copiar imágenes al portapapeles.');
        }
        let resolveImage, rejectImage;
        const image = new Promise((resolve, reject) => {resolveImage=resolve;rejectImage=reject;});
        image.catch(() => {});
        // Initiate the write during the click; provide its PNG after rendering.
        const writing = navigator.clipboard.write([new ClipboardItem({'image/png': image})]).then(() => null, error => error);
        return {
            async finish(canvas) {
                try {
                    resolveImage(await blob(canvas, 'image/png'));
                    const error = await withTimeout(writing,15000,'El portapapeles no respondió.');
                    if(error)throw error;
                    return true;
                } catch(error) {rejectImage(error);throw error;}
            },
            cancel(error) {rejectImage(error);}
        };
    }
    window.KSExport = {blob, pixelRatio, startClipboardCopy, withTimeout, render};
})();
