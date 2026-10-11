(function () {
    'use strict';
    // Irregular positions and sizes, generated once and kept while resizing.
    const points=Array.from({length:7},(_,index)=>({side:index===0?0:index===1?1:Math.random()<.5?0:1,x:Math.random(),y:.04+Math.random()*.92,size:.65+Math.random()*.8,halo:7+Math.random()*7}));
    function paint() {
        const gutter=Math.max(0,(window.innerWidth-1240)/2);
        if(gutter<20){document.body.style.setProperty('--scatter-lights','none');return;}
        const gradients=points.map(point=>{
            const distance=8+point.x*(gutter-16);
            const x=point.side?window.innerWidth-distance:distance;
            return `radial-gradient(circle at ${x.toFixed(1)}px ${(point.y*100).toFixed(2)}%,rgba(255,246,182,.95) 0 ${point.size.toFixed(1)}px,rgba(233,224,145,.35) ${(point.size+1.3).toFixed(1)}px,transparent ${point.halo.toFixed(1)}px)`;
        });
        document.body.style.setProperty('--scatter-lights',gradients.join(','));
    }
    document.addEventListener('DOMContentLoaded',paint);
    window.addEventListener('resize',paint);
})();
