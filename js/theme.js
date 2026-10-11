(function () {
    'use strict';
    const root = document.documentElement;
    function apply(theme) {
        if (theme === 'dark') root.setAttribute('data-theme', 'dark');
        else root.removeAttribute('data-theme');
        const button = document.getElementById('btn-theme') || document.getElementById('theme-toggle');
        if (button) button.textContent = theme === 'dark' ? '☀️ Tema claro' : '🌙 Tema oscuro';
    }
    try { apply(localStorage.getItem('theme')); } catch { apply('light'); }
    document.addEventListener('DOMContentLoaded', () => {
        apply(root.getAttribute('data-theme'));
        const button = document.getElementById('btn-theme') || document.getElementById('theme-toggle');
        if (button) button.addEventListener('click', () => {
            const theme = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
            apply(theme);
            try { localStorage.setItem('theme', theme); } catch (error) { console.info('No se puede guardar el tema:', error); }
        });
    });
    window.addEventListener('storage', event => {
        if (event.key === 'theme' || event.key === null) apply(event.newValue);
    });
})();
