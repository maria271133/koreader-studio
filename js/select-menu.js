(function () {
    'use strict';
    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('select.mini-select').forEach(select => {
            const wrapper = document.createElement('div');
            wrapper.className = 'studio-select';
            const trigger = document.createElement('button');
            trigger.type = 'button';
            trigger.className = 'mini-select studio-select-trigger';
            trigger.setAttribute('aria-haspopup', 'listbox');
            trigger.setAttribute('aria-expanded', 'false');
            trigger.setAttribute('aria-label', select.title);
            const list = document.createElement('div');
            list.className = 'studio-select-menu';
            list.id = select.id + '-menu';
            list.setAttribute('role', 'listbox');
            list.setAttribute('aria-label', select.title);
            list.hidden = true;
            trigger.setAttribute('aria-controls', list.id);
            const buttons = Array.from(select.options, option => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'studio-select-option';
                button.setAttribute('role', 'option');
                button.textContent = option.textContent;
                button.addEventListener('click', () => {
                    select.value = option.value;
                    select.dispatchEvent(new Event('change', {bubbles:true}));
                    close();
                    trigger.focus();
                });
                list.appendChild(button);
                return button;
            });
            function sync() {
                trigger.textContent = select.options[select.selectedIndex].textContent + '  ▾';
                trigger.setAttribute('aria-label', select.title + ': ' + select.options[select.selectedIndex].textContent);
                buttons.forEach((button, index) => button.setAttribute('aria-selected', String(index === select.selectedIndex)));
            }
            function close() { list.hidden = true; trigger.setAttribute('aria-expanded', 'false'); }
            function open() {
                list.hidden = false;
                trigger.setAttribute('aria-expanded', 'true');
                buttons[select.selectedIndex].focus();
            }
            trigger.addEventListener('click', () => list.hidden ? open() : close());
            wrapper.addEventListener('keydown', event => {
                if(event.key === 'Escape') {close();trigger.focus();event.preventDefault();}
                if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
                    event.preventDefault();
                    if(list.hidden) {open();return;}
                    const index = buttons.indexOf(document.activeElement);
                    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
                    buttons[next].focus();
                }
            });
            document.addEventListener('click', event => {if(!wrapper.contains(event.target))close();});
            wrapper.addEventListener('focusout', event => {if(!wrapper.contains(event.relatedTarget))close();});
            select.addEventListener('change', sync);
            select.after(wrapper);
            select.hidden = true;
            wrapper.append(select, trigger, list);
            sync();
        });
    });
})();
