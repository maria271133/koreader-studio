(function () {
    'use strict';
    const cache = new WeakMap();
    const dateKey = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    const rows = (db, sql) => {
        const result = db.exec(sql)[0];
        return result ? result.values.map(values => Object.fromEntries(result.columns.map((column,index) => [column,values[index]]))) : [];
    };
    function model(db) {
        if(cache.has(db)) return cache.get(db);
        const source = rows(db,"SELECT name FROM sqlite_master WHERE name='page_stat_data'").length ? 'page_stat_data' : 'page_stat';
        const events = rows(db,`SELECT id_book,start_time,duration FROM ${source} WHERE duration>0 AND duration<3600 AND start_time>0 ORDER BY start_time`);
        const books = rows(db,'SELECT * FROM book').map(book => ({...book,seconds:0,days:new Map(),hours:Array(24).fill(0)}));
        const byId = new Map(books.map(book => [book.id,book]));
        const days = new Map();
        const hours = Array(24).fill(0);
        let seconds = 0;
        events.forEach(event => {
            const date = new Date(event.start_time*1000), key = dateKey(date), hour = date.getHours();
            seconds += event.duration;
            hours[hour] += event.duration;
            if(!days.has(key)) days.set(key,{seconds:0,books:new Map()});
            const day = days.get(key);
            day.seconds += event.duration;
            day.books.set(event.id_book,(day.books.get(event.id_book)||0)+event.duration);
            const book = byId.get(event.id_book);
            if(book) {
                book.seconds += event.duration;
                book.hours[hour] += event.duration;
                book.days.set(key,(book.days.get(key)||0)+event.duration);
            }
        });
        let streak = 0, best = 0, previous;
        Array.from(days.keys()).sort().forEach(key => {
            const day = Date.parse(key+'T00:00:00Z');
            streak = previous !== undefined && day-previous === 86400000 ? streak+1 : 1;
            best = Math.max(best,streak); previous = day;
        });
        const value = {books,byId,days,hours,seconds,best,source};
        cache.set(db,value);
        return value;
    }
    const el = (tag,className,text) => {
        const node = document.createElement(tag);
        node.className = className || '';
        if(text !== undefined) node.textContent = text;
        return node;
    };
    const dateLabel = key => new Date(key+'T12:00:00').toLocaleDateString('es-ES',{day:'numeric',month:'long',year:'numeric'});
    function insights(days) {
        const keys=Array.from(days.keys()).sort(), months=new Map(), weekdays=Array(7).fill(0);
        let bestDay=null, bestSeconds=0, streak=0, best=0, previous;
        keys.forEach(key=>{
            const seconds=days.get(key)?.seconds ?? days.get(key) ?? 0;
            const month=key.slice(0,7);
            months.set(month,(months.get(month)||0)+seconds);
            weekdays[new Date(key+'T12:00:00').getDay()]+=seconds;
            if(seconds>bestSeconds){bestDay=key;bestSeconds=seconds;}
            const day=Date.parse(key+'T00:00:00Z');
            streak=previous!==undefined && day-previous===86400000 ? streak+1 : 1;
            best=Math.max(best,streak);previous=day;
        });
        let span='Sin lectura registrada';
        if(keys.length){
            const first=new Date(keys[0]+'T00:00:00Z'), last=new Date(keys.at(-1)+'T00:00:00Z');
            let years=last.getUTCFullYear()-first.getUTCFullYear();
            if(last.getUTCMonth()<first.getUTCMonth() || (last.getUTCMonth()===first.getUTCMonth() && last.getUTCDate()<first.getUTCDate()))years--;
            span=years>0 ? `${years} ${years===1?'año':'años'}` : `${Math.round((last-first)/86400000)+1} días`;
        }
        return {keys,months,weekdays,bestDay,bestSeconds,best,span};
    }
    function renderInsights(container,days,books,format,isBook) {
        container.replaceChildren();
        const info=insights(days);
        const summary=el('section','habit-panel');
        summary.append(el('h2','',isBook?'Este libro me acompaña':'Mi recorrido lector'));
        summary.append(el('p','habit-caption',info.keys.length
            ? `${info.span} entre el primer y el último registro · ${info.keys.length} días con lectura.\n${dateLabel(info.keys[0])} — ${dateLabel(info.keys.at(-1))}.`
            : 'Todavía no hay lectura registrada.'));
        const cards=el('div','habit-insight-cards');
        [[isBook?'Mi día con más lectura con este libro':'Mi día con más lectura',info.bestDay?`${dateLabel(info.bestDay)} · ${format(info.bestSeconds)}`:'Sin actividad'],
         [isBook?'Mi mayor racha con este libro':'Mi mayor racha',`${info.best} ${info.best===1?'día':'días'} consecutivos`],
         ['Mis anotaciones',`${books.reduce((sum,book)=>sum+(Number(book.highlights)||0),0)} subrayados · ${books.reduce((sum,book)=>sum+(Number(book.notes)||0),0)} notas personales`]]
        .forEach(([label,value])=>{const card=el('div','habit-day-value');card.append(el('span','',label),el('strong','',value));cards.append(card);});
        summary.append(cards);container.append(summary);
        const monthly=el('details','habit-brief');monthly.open=true;
        monthly.append(el('summary','','Mi evolución por meses y años'));
        const byYear=new Map();
        info.months.forEach((seconds,month)=>{const year=month.slice(0,4);if(!byYear.has(year))byYear.set(year,[]);byYear.get(year).push([month,seconds]);});
        byYear.forEach((months,year)=>{
            monthly.append(el('h3','habit-year-title',`${year} · ${format(months.reduce((sum,entry)=>sum+entry[1],0))}`));
            const grid=el('div','habit-day-values');
            months.forEach(([month,seconds])=>{
                const card=el('div','habit-day-value');
                const label=new Date(month+'-01T12:00:00').toLocaleDateString('es-ES',{month:'long'});
                card.append(el('span','',label),el('strong','',format(seconds)));grid.append(card);
            });monthly.append(grid);
        });
        monthly.append(el('p','habit-caption','Se muestran todos los meses con lectura registrada. Los meses sin lectura no aparecen.'));
        container.append(monthly);
        const weekly=el('details','habit-brief');weekly.open=true;
        weekly.append(el('summary','','Mis días de la semana'));
        const grid=el('div','habit-week-chart');
        const maximum=Math.max(1,...info.weekdays);
        const favorite=info.weekdays.indexOf(maximum);
        [1,2,3,4,5,6,0].forEach(day=>{
            const label=['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'][day];
            const row=el('div','habit-week-row');
            if(day===favorite)row.classList.add('is-favorite');
            const track=el('div','habit-week-track'), fill=el('span','habit-week-fill');
            fill.style.width=(info.weekdays[day]/maximum*100)+'%';
            track.setAttribute('aria-hidden','true');track.append(fill);
            row.append(el('span','habit-week-label',label),track,el('strong','habit-week-time',format(info.weekdays[day])));grid.append(row);
        });
        weekly.append(el('p','habit-caption','Tiempo acumulado de todos los lunes, martes… del periodo registrado.'),grid);container.append(weekly);
    }
    function chart(container, days, format) {
        container.replaceChildren();
        const keys = Array.from(days.keys()).sort();
        if(!keys.length) {container.append(el('p','habit-caption','Todavía no hay tiempo de lectura registrado.'));return;}
        const end = new Date(keys.at(-1)+'T12:00:00');
        const start = new Date(end);start.setDate(start.getDate()-29);
        const first = new Date(keys[0]+'T12:00:00');
        if(start<first)start.setTime(first.getTime());
        const dates = [];
        for(let date=new Date(start);date<=end;date.setDate(date.getDate()+1))dates.push(dateKey(date));
        const maximum = Math.max(1,...dates.map(key=>days.get(key)?.seconds ?? days.get(key) ?? 0));
        const bars = el('div','habit-bars');
        const detail = el('details','habit-brief habit-daily-details');
        detail.open = true;
        detail.append(el('summary','',`Tiempo de lectura por día · ${dates.length} días`));
        const values = el('div','habit-day-values');
        dates.forEach(key => {
            const value = days.get(key)?.seconds ?? days.get(key) ?? 0;
            const button = el('div','habit-bar');
            button.style.setProperty('--bar-height',(value/maximum*100)+'%');
            button.setAttribute('aria-label',`${dateLabel(key)}: ${format(value)}`);
            button.setAttribute('role','img');
            button.title = button.getAttribute('aria-label');
            button.append(el('span','habit-bar-fill'),el('span','habit-bar-label',String(Number(key.slice(-2)))));
            bars.append(button);
            const row=el('div','habit-day-value');
            const date=new Date(key+'T12:00:00').toLocaleDateString('es-ES',{weekday:'short',day:'2-digit',month:'2-digit'});
            row.append(el('span','',date),el('strong','',format(value)));
            values.append(row);
        });
        detail.append(values);
        container.append(bars,el('p','habit-chart-range',`${dateLabel(dates[0])} — ${dateLabel(dates.at(-1))}`),detail);
    }
    function render(db, selectBook, format) {
        const data = model(db), keys = Array.from(data.days.keys()).sort();
        const text = (id,value) => document.getElementById(id).textContent=value;
        text('g-hours',format(data.seconds));
        text('g-pages',data.days.size);
        text('g-average',format(data.days.size ? data.seconds/data.days.size : 0));
        text('g-streak',`${data.best} ${data.best===1?'día':'días'}`);
        text('g-books',`${data.books.filter(book=>book.seconds>0).length} libros con actividad`);
        text('habits-period',keys.length ? `${dateLabel(keys[0])} — ${dateLabel(keys.at(-1))}` : 'Sin actividad de lectura registrada');
        text('daily-caption','Minutos leídos cada día · hasta los últimos 30 días del archivo.');
        chart(document.getElementById('habit-daily'),data.days,format);
        text('habit-day-detail','');
        document.getElementById('habit-day-detail').hidden=true;
        const hours = document.getElementById('habit-hours');hours.replaceChildren();
        [['Mañana',6,12],['Tarde',12,19],['Noche',19,24],['Madrugada',0,6]].forEach(([label,start,end])=>{
            const seconds=data.hours.slice(start,end).reduce((sum,value)=>sum+value,0);
            const row=el('div','habit-hour-row');
            row.append(el('span','',label),el('strong','',format(seconds)));
            const track=el('div','habit-hour-track'), fill=el('span','');
            fill.style.width=(data.seconds?seconds/data.seconds*100:0)+'%';
            track.append(fill);row.append(track);hours.append(row);
        });
        const primary=document.getElementById('habit-books'), brief=document.getElementById('habit-brief-books');
        primary.replaceChildren();brief.replaceChildren();
        data.books.slice().sort((a,b)=>b.seconds-a.seconds).forEach(book=>{
            const card=el('button','habit-book-card');card.type='button';
            card.append(el('h3','',book.title||'Sin título'),el('p','habit-caption',book.authors==='N/A'?'Autor sin indicar':book.authors||'Autor sin indicar'),el('strong','habit-book-time',format(book.seconds)),el('p','habit-caption',`${book.days.size} días con lectura · ${book.highlights||0} subrayados · ${book.notes||0} notas`));
            card.addEventListener('click',()=>{
                selectBook(book.id,book.title);
                document.getElementById('btn-global').classList.remove('active-view');
                document.getElementById('btn-annual').classList.remove('active-view');
                document.getElementById('view-book').scrollIntoView({block:'start',behavior:'smooth'});
            });
            (book.seconds>=300 ? primary : brief).append(card);
        });
        if(!primary.childElementCount)primary.append(el('p','habit-caption','Tus lecturas de cinco minutos o más aparecerán aquí.'));
        brief.parentElement.hidden=!brief.childElementCount;
        renderInsights(document.getElementById('global-insights'),data.days,data.books,format,false);
        document.getElementById('export-node').dataset.habitsLoaded='true';
    }
    function renderBook(db,id,format) {
        const book=model(db).byId.get(Number(id));if(!book)return;
        document.getElementById('b-time').textContent=format(book.seconds);
        document.getElementById('b-days').textContent=book.days.size;
        document.getElementById('b-avg-daily').textContent=format(book.days.size?book.seconds/book.days.size:0);
        document.getElementById('b-highlights').textContent=book.highlights||0;
        document.getElementById('b-notes').textContent=`${book.notes||0} notas personales`;
        const hour=book.hours.indexOf(Math.max(...book.hours));
        document.getElementById('b-fav-hour').textContent=book.seconds?`${String(hour).padStart(2,'0')}:00`:'Sin actividad';
        document.getElementById('b-badge').style.display='none';
        chart(document.getElementById('book-daily'),book.days,format);
        document.getElementById('book-day-detail').textContent='';
        document.getElementById('book-day-detail').hidden=true;
        renderInsights(document.getElementById('book-insights'),book.days,[book],format,true);
    }
    document.addEventListener('DOMContentLoaded',()=>{
        const globalInsights=el('div','habit-insights');globalInsights.id='global-insights';
        document.querySelector('#view-global .habits-layout').after(globalInsights);
        const audit=document.querySelector('#view-book .audit-list');
        const cards=el('div','stats-grid book-metrics');
        [['b-time','Tiempo dedicado'],['b-days','Días con lectura'],['b-avg-daily','Media por día con lectura']].forEach(([id,label])=>{
            const value=document.getElementById(id);value.className='stat-val';
            const card=el('div','stat-card');card.append(value,el('div','stat-lbl',label));cards.append(card);
        });
        const highlights=el('div','stat-card'), value=el('div','stat-val','0');value.id='b-highlights';
        highlights.append(value,el('div','stat-lbl','Subrayados'));cards.append(highlights);
        audit.before(cards);
        audit.querySelectorAll('.audit-row').forEach(row=>{if(!row.querySelector('.audit-val'))row.remove();});
        const notes=el('p','habit-caption');notes.id='b-notes';cards.before(notes);
        const graph=el('section','habit-panel book-reading-chart');
        const daily=el('div','');daily.id='book-daily';
        const detail=el('p','habit-day-detail');detail.id='book-day-detail';
        graph.append(el('h2','','Mis días con este libro'),el('p','habit-caption','Tiempo de lectura diario · hasta los últimos 30 días registrados.'),daily,detail);
        audit.before(graph);
        const bookInsights=el('div','habit-insights');bookInsights.id='book-insights';
        graph.after(bookInsights);
        const details=el('details','habit-brief');details.append(el('summary','','Fechas y avance de lectura'));
        audit.before(details);details.append(audit);
        document.querySelectorAll('#b-raw-time,#b-speed').forEach(value=>value.closest('.audit-row').hidden=true);
    });
    window.KSHabits={model,insights,render,renderBook};
})();
