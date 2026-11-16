const host=document.getElementById('character-content');
const el=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
const figure=item=>{const f=el('figure'),a=el('a'),img=el('img');a.href=item.src;a.target='_blank';a.rel='noopener';img.src=item.src;img.alt=item.alt||item.caption;img.loading='lazy';if(item.width)img.width=item.width;if(item.height)img.height=item.height;a.append(img);f.append(a,el('figcaption',item.caption));return f;};
try{
 const response=await fetch('assets/cases/character/display.json');if(!response.ok)throw new Error(String(response.status));const data=await response.json();
 const hero=el('img',undefined,'character-hero');hero.src=data.hero;hero.width=1400;hero.height=1700;hero.alt='ORBIT-07航外搜救员完整角色';
 const summary=el('p',data.summary,'character-summary'),facts=el('div',undefined,'character-facts');for(const fact of data.facts)facts.append(el('span',fact));
 const nav=el('nav',undefined,'character-nav');nav.setAttribute('aria-label','角色制作章节');for(const item of data.sections){const a=el('a',item.title);a.href=`#${item.id}`;nav.append(a);}const content=[hero,summary,facts,nav];
 for(const item of data.sections){const section=el('section',undefined,'character-section');section.id=item.id;section.append(el('h2',item.title),el('p',item.text));
  if(item.images?.length){const gallery=el('div',undefined,'character-gallery');item.images.forEach(image=>gallery.append(figure(image)));section.append(gallery);}
  if(item.table){const table=el('table',undefined,'character-table'),head=el('thead'),headRow=el('tr');item.table.heads.forEach(text=>{const th=el('th',text);th.scope='col';headRow.append(th);});head.append(headRow);table.append(head);const body=el('tbody');for(const row of item.table.rows){const tr=el('tr');row.forEach(text=>tr.append(el('td',String(text))));body.append(tr);}table.append(body);section.append(table);}
  if(item.links?.length){const links=el('div',undefined,'case-links');for(const link of item.links){const a=el('a',link.label);a.href=link.href;links.append(a);}section.append(links);}content.push(section);
 }host.replaceChildren(...content);const target=document.getElementById(location.hash.slice(1));if(target)requestAnimationFrame(()=>target.scrollIntoView());
}catch(error){console.error('角色记录未能读取',error);host.replaceChildren(el('p','角色记录未能载入。可以使用上方交互作品或下方源工程链接查看。','read-error'));}
