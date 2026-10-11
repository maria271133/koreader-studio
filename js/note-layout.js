(function () {
    'use strict';
    // Every card keeps its chosen shape. Only typography changes with its content.
    function fit(card, exportWidth) {
        if (exportWidth) card.style.width = exportWidth + 'px';
        const width = card.getBoundingClientRect().width;
        if (!width) return;
        const proportion = card.classList.contains('ratio-9-16') ? 16 / 9 : card.classList.contains('ratio-1-1') ? 1 : 3 / 4;
        card.style.height = Math.round(width * proportion) + 'px';
        const content = card.querySelector('.note-content');
        if (!content) return;
        const style = getComputedStyle(card);
        const available = card.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) - 2;
        const personalSize = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--font-hand-size')) || 2;
        const apply = scale => {
            card.style.setProperty('--quote-size', (Math.min(34, width * .053) * scale) + 'px');
            card.style.setProperty('--personal-size', (Math.min(personalSize * 16, width * .055) * scale) + 'px');
            card.style.setProperty('--meta-size', (Math.min(11, width * .028) * scale) + 'px');
            card.style.setProperty('--content-gap', (Math.min(22, width * .035) * scale) + 'px');
        };
        let low = 0, high = 1;
        const overflows = () => content.scrollHeight > available || [content, ...content.querySelectorAll('*')].some(element => element.scrollWidth > element.clientWidth + 1);
        apply(high);
        if (overflows()) {
            for (let step = 0; step < 18; step++) {
                const middle = (low + high) / 2;
                apply(middle);
                if (!overflows()) low = middle;
                else high = middle;
            }
            apply(low * .985);
        }
        card.dataset.fitted = 'true';
    }
    function fitAll(root = document) {
        root.querySelectorAll('#notesContainer .note-block').forEach(card => fit(card));
    }
    // Draw text with the browser's loaded fonts before SVG export. This avoids
    // a foreignObject renderer substituting fonts and changing line widths.
    function rasterize(root) {
        root.querySelectorAll('.note-meta, .note-meta-chapter, .note-text, .dialogue-line, .user-note-body, .user-note-header').forEach(element => {
            if(element.childElementCount || !element.firstChild || element.firstChild.nodeType !== Node.TEXT_NODE) return;
            const rect = element.getBoundingClientRect();
            if(!rect.width || !rect.height) return;
            const original = element.textContent;
            const style = getComputedStyle(element);
            const canvas = document.createElement('canvas');
            const scale = 2;
            canvas.width = Math.ceil(rect.width * scale);
            canvas.height = Math.ceil(rect.height * scale);
            const context = canvas.getContext('2d');
            context.scale(scale, scale);
            context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
            context.fillStyle = style.color;
            context.textBaseline = 'alphabetic';
            if('letterSpacing' in context) context.letterSpacing = style.letterSpacing;
            const ascent = context.measureText('Mg').fontBoundingBoxAscent;
            const range = document.createRange();
            const lines = [];
            let offset = 0;
            for(const character of original) {
                range.setStart(element.firstChild, offset);
                offset += character.length;
                range.setEnd(element.firstChild, offset);
                const box = range.getBoundingClientRect();
                if(character === '\n' || !box.width) continue;
                let line = lines[lines.length - 1];
                if(!line || Math.abs(line.top - box.top) > 2) {
                    line = {top:box.top, left:box.left, text:''};
                    lines.push(line);
                }
                line.text += character;
            }
            lines.forEach(line => context.fillText(line.text, line.left - rect.left, line.top - rect.top + ascent));
            const image = document.createElement('img');
            image.src = canvas.toDataURL('image/png');
            image.alt = original;
            image.style.cssText = 'display:block;width:100%;height:100%;max-width:none;';
            element.style.width = rect.width + 'px';
            element.style.height = rect.height + 'px';
            element.style.flexShrink = '0';
            element.replaceChildren(image);
        });
    }
    window.KSNoteLayout = {fit, fitAll, rasterize};
})();
