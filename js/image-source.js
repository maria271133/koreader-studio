/* Public remote images are embedded before export; uploaded files stay local. */
(() => {
    function normalize(raw) {
        let value = String(raw || '').trim().replace(/&amp;/g, '&');
        if (!value) throw new Error('empty');
        const markdown = value.match(/^\[[\s\S]*?\]\((https?:\/\/[\s\S]+)\)$/i);
        if (markdown) value = markdown[1];
        if (value.startsWith('<') && value.endsWith('>')) value = value.slice(1, -1);
        value = value.replace(/^["']|["']$/g, '').trim();
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
    function pageImages(html, base) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const images = [];
        const add = value => {
            if (!value) return;
            try {
                const url = new URL(value, base);
                if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !images.includes(url.href)) images.push(url.href);
            } catch { /* Ignore malformed metadata, keeping the other candidates. */ }
        };
        doc.querySelectorAll('meta[property="og:image:secure_url"],meta[property="og:image"],meta[name="twitter:image"],meta[property="twitter:image"],link[rel="image_src"]').forEach(el => add(el.content || el.getAttribute('href')));
        const schemaImages = value => {
            if (!value || typeof value !== 'object') return;
            if (Array.isArray(value)) return value.forEach(schemaImages);
            if (typeof value.image === 'string') add(value.image);
            if (Array.isArray(value.image)) value.image.forEach(image => add(typeof image === 'string' ? image : image?.url || image?.contentUrl));
            if (value.image && typeof value.image === 'object') add(value.image.url || value.image.contentUrl);
            if (value['@type'] === 'ImageObject') add(value.contentUrl || value.url);
            if (value['@graph']) schemaImages(value['@graph']);
        };
        doc.querySelectorAll('script[type="application/ld+json"]').forEach(el => { try { schemaImages(JSON.parse(el.textContent)); } catch {} });
        // Prefer the page's own declared image to logos and small interface icons.
        if (!images.length) doc.querySelectorAll('main img,article img,body img').forEach(el => {
            if (/logo|avatar|icon|pixel|tracking/i.test(el.getAttribute('src') || '')) return;
            if (el.hasAttribute('width') && Number(el.getAttribute('width')) < 120) return;
            add(el.getAttribute('data-src') || el.getAttribute('src'));
        });
        return images.slice(0, 4);
    }
    async function loadImage(url, originalBlob) {
        try { return await prepare(originalBlob || await request(url, 10000)); } catch (error) {
            if (url.startsWith('data:')) throw error;
        }
        // The image proxy supplies readable bytes for servers without CORS headers.
        const proxy = new URL('https://wsrv.nl/');
        proxy.searchParams.set('url', url); proxy.searchParams.set('output', 'png'); proxy.searchParams.set('w', '4096'); proxy.searchParams.set('h', '4096'); proxy.searchParams.set('fit', 'inside'); proxy.searchParams.set('we', '');
        try { return await prepare(await request(proxy.href, 15000)); }
        catch { throw new Error('blocked'); }
    }
    async function pageOrImage(blob, url) {
        const html = blob.type.includes('text/html') || /^\s*(?:<!doctype|<html|<head|<body)/i.test(await blob.slice(0, 200).text());
        if (!html) return loadImage(url, blob);
        const images = pageImages(await blob.text(), url);
        for (const image of images) {
            try { return await loadImage(image); } catch {}
        }
        throw new Error(images.length ? 'blocked' : 'noimage');
    }
    async function metadataImage(url) {
        const endpoint = new URL('https://api.microlink.io/');
        endpoint.searchParams.set('url', url);
        const blob = await request(endpoint.href, 20000);
        const metadata = JSON.parse(await blob.text());
        const image = metadata.status === 'success' && metadata.data?.image?.url;
        if (!image) throw new Error('noimage');
        return loadImage(normalize(image));
    }
    const cache = new Map();
    async function fromURL(raw) {
        const url = normalize(raw);
        if (cache.has(url)) return cache.get(url);
        let result;
        let lastError;
        try { result = await pageOrImage(await request(url, 10000), url); } catch (error) { lastError = error; }
        const pageLink = /(^|\.)(pinterest\.[a-z.]+|pin\.it)$/i.test(new URL(url).hostname);
        if (!result && pageLink) {
            try { result = await metadataImage(url); } catch (error) { lastError = error; }
        }
        if (!result && !pageLink && !url.startsWith('data:')) {
            try { result = await loadImage(url); } catch (error) { lastError = error; }
        }
        if (!result && !url.startsWith('data:')) {
            // Resolve redirects and page metadata, or fetch the original image bytes.
            const mirror = new URL('https://api.allorigins.win/raw');
            mirror.searchParams.set('url', url);
            try { result = await pageOrImage(await request(mirror.href, 15000), url); } catch (error) { lastError = error; }
        }
        if (!result && !pageLink && !url.startsWith('data:')) {
            try { result = await metadataImage(url); } catch (error) { lastError = error; }
        }
        if (!result) throw lastError || new Error('blocked');
        cache.set(url, result);
        if (cache.size > 4) cache.delete(cache.keys().next().value);
        return result;
    }
    window.KSImageSource = {normalize, sniff, prepare, fromURL, pageImages};
})();
