/* Public remote images are embedded before export; uploaded files stay local. */
(() => {
    function normalize(raw) {
        let value = String(raw || '').trim().replace(/&amp;/g, '&');
        if (!value) throw new Error('empty');
        if (/^data:image\//i.test(value)) return value;
        if (value.startsWith('//')) value = 'https:' + value;
        else if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) value = 'https://' + value;
        let url;
        try { url = new URL(value); } catch { throw new Error('invalid'); }
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('invalid');
        for (let depth = 0; depth < 4; depth++) {
            if (!/(^|\.)google\.[a-z.]+$/i.test(url.hostname)) break;
            const image = url.searchParams.get('imgurl') || (url.pathname === '/url' && (url.searchParams.get('url') || url.searchParams.get('q')));
            if (!image || !/^https?:\/\//i.test(image)) break;
            url = new URL(image);
        }
        if (/(^|\.)google\.[a-z.]+$/i.test(url.hostname) && /\/(search|imgres)/.test(url.pathname)) throw new Error('notimage');
        if (/(^|\.)(pinterest\.[a-z.]+|pin\.it)$/i.test(url.hostname)) throw new Error('notimage');
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('invalid');
        return url.href;
    }
    async function request(url, timeout = 15000) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);
        try {
            const response = await fetch(url, {mode: 'cors', credentials: 'omit', signal: controller.signal, referrerPolicy: 'no-referrer'});
            if (!response.ok) throw new Error('http');
            return await response.blob();
        } catch (error) {
            if (error.message === 'http') throw error;
            throw new Error('fetch');
        } finally { clearTimeout(timer); }
    }
    async function sniff(blob) {
        const bytes = new Uint8Array(await blob.slice(0, 2048).arrayBuffer());
        const text = (a, b) => String.fromCharCode(...bytes.slice(a, b));
        if (bytes[0] === 0x89 && text(1, 4) === 'PNG') return 'image/png';
        if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
        if (text(0, 4) === 'GIF8') return 'image/gif';
        if (text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP') return 'image/webp';
        if (text(0, 2) === 'BM') return 'image/bmp';
        if (text(0, 4) === 'II*\0' || text(0, 4) === 'MM\0*') return 'image/tiff';
        if (bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0) return 'image/x-icon';
        if (text(4, 8) === 'ftyp') {
            const brands = text(8, Math.min(bytes.length, 64));
            if (/avif|avis/.test(brands)) return 'image/avif';
            if (/heic|heix|hevc|hevx|mif1|msf1/.test(brands)) return 'image/heic';
        }
        const beginning = text(0, bytes.length).trimStart().replace(/^\u00ef\u00bb\u00bf/, '');
        if (/^(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(beginning)) return 'image/svg+xml';
        if (/^(?:<!doctype\s+html|<html|<head|<body)/i.test(beginning)) throw new Error('notimage');
        return blob.type.startsWith('image/') ? blob.type : null;
    }
    const libraries = new Map();
    function loadLibrary(url, globalName) {
        if (window[globalName]) return Promise.resolve();
        if (!libraries.has(url)) libraries.set(url, new Promise((resolve, reject) => {
            const script = document.createElement('script');
            const timer = setTimeout(() => { script.remove(); libraries.delete(url); reject(new Error('decoder')); }, 20000);
            script.onload = () => { clearTimeout(timer); window[globalName] ? resolve() : reject(new Error('decoder')); };
            script.onerror = () => { clearTimeout(timer); libraries.delete(url); reject(new Error('decoder')); };
            script.src = url;
            document.head.appendChild(script);
        }));
        return libraries.get(url);
    }
    function dataURL(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('decode')); reader.readAsDataURL(blob);
        });
    }
    async function prepare(blob) {
        const type = await sniff(blob);
        if (!type) throw new Error('notimage');
        blob = new Blob([blob], {type});
        if (/heic|heif/.test(type)) {
            await loadLibrary('https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js', 'heic2any');
            let timer;
            try {
                const converted = await Promise.race([
                    window.heic2any({blob, toType: 'image/png'}),
                    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('heic')), 20000); })
                ]);
                blob = Array.isArray(converted) ? converted[0] : converted;
            } catch { throw new Error('heic'); } finally { clearTimeout(timer); }
        } else if (type === 'image/tiff') {
            await loadLibrary('https://cdn.jsdelivr.net/npm/pako@1.0.11/dist/pako.min.js', 'pako');
            await loadLibrary('https://cdn.jsdelivr.net/npm/utif@3.1.0/UTIF.js', 'UTIF');
            try {
                const buffer = await blob.arrayBuffer(); const pages = window.UTIF.decode(buffer);
                const page = pages[0]; if (!page) throw new Error('decode');
                window.UTIF.decodeImage(buffer, page, pages);
                if (!page.width || !page.height || page.width * page.height > 32000000) throw new Error('size');
                const canvas = document.createElement('canvas'); canvas.width = page.width; canvas.height = page.height;
                canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(window.UTIF.toRGBA8(page)), page.width, page.height), 0, 0);
                return canvas.toDataURL('image/png');
            } catch (error) { throw new Error(error.message === 'size' ? 'size' : 'decode'); }
        }
        const result = await dataURL(blob);
        await new Promise((resolve, reject) => {
            const image = new Image(); const timer = setTimeout(() => reject(new Error('decode')), 15000);
            image.onload = () => { clearTimeout(timer); resolve(); }; image.onerror = () => { clearTimeout(timer); reject(new Error('decode')); }; image.src = result;
        });
        return result;
    }
    async function fromURL(raw) {
        const url = normalize(raw);
        try { return await prepare(await request(url)); } catch (error) {
            if (url.startsWith('data:')) throw error;
        }
        // The image proxy supplies readable bytes for servers without CORS headers.
        const proxy = new URL('https://wsrv.nl/');
        proxy.searchParams.set('url', url); proxy.searchParams.set('output', 'png'); proxy.searchParams.set('w', '4096'); proxy.searchParams.set('h', '4096'); proxy.searchParams.set('fit', 'inside'); proxy.searchParams.set('we', '');
        try { return await prepare(await request(proxy.href, 25000)); }
        catch { throw new Error('blocked'); }
    }
    window.KSImageSource = {normalize, sniff, prepare, fromURL};
})();
