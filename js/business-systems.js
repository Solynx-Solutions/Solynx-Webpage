(function(){
 const b=document.querySelector('.menu'),m=document.getElementById('mobile-nav'),c=document.querySelector('.close');
 function set(v){if(!m)return;m.classList.toggle('open',v);document.body.style.overflow=v?'hidden':'';if(b)b.setAttribute('aria-expanded',String(v))}
 if(b)b.addEventListener('click',()=>set(true));if(c)c.addEventListener('click',()=>set(false));
 if(m)m.addEventListener('click',e=>{if(e.target===m||e.target.closest('a'))set(false)});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')set(false)});
})();
