let items = Array.from({length:20}).map((_,i)=>({
  id:i,
  qty:0,
  img:'https://via.placeholder.com/200'
}));

function render(){
  const grid = document.getElementById('grid');
  grid.innerHTML = '';

  items.forEach(item=>{
    const div = document.createElement('div');
    div.className='card';

    div.innerHTML = `
      <img src="/api/image?url=${encodeURIComponent(item.img)}">
      ${item.qty>0 ? '<div class="circle">'+item.qty+'</div>' : ''}
    `;

    div.onclick = ()=>{
      item.qty++;
      render();
    };

    grid.appendChild(div);
  });
}

async function update(){
  await fetch('/api/update',{method:'POST'});
}

async function reset(){
  await fetch('/api/reset-update',{method:'POST'});
}

setInterval(async ()=>{
  const res = await fetch('/api/update-status');
  const d = await res.json();

  document.getElementById('status').innerText =
    d.updating
      ? 'Обновление: '+d.progress+'%'
      : 'Готово. Следующее через '+Math.floor(d.next/1000)+' сек';
},2000);

render();