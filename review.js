const make = (tag, text, className) => {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
};
const link = (text, url, download = false) => {
  const a = make('a', text); a.href = url;
  if (download) a.download = '';
  return a;
};
async function readJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`读取失败：${response.status}`);
  return response.json();
}
function showError(host, text, url) {
  const p = make('p', text, 'read-error');
  p.append(' ', link('直接打开文件 ↗', url)); host.replaceChildren(p);
}
async function renderJoint() {
  const host = document.getElementById('joint-evidence');
  const url = 'assets/cases/joint/display.json';
  try {
    const data = await readJson(url);
    const gallery = make('div', undefined, 'joint-gallery');
    for (const item of data.images) {
      const figure = make('figure');
      const a = link('', item.src); a.target = '_blank'; a.rel = 'noopener';
      const img = make('img'); img.src = item.src; img.alt = item.alt; img.loading = 'lazy'; img.width = item.width; img.height = item.height; img.width = item.width; img.height = item.height;
      a.append(img);figure.append(a, make('figcaption', item.caption));gallery.append(figure);
    }
    const summary = make('div', undefined, 'joint-summary');
    for (const item of data.findings) {const d=make('div');d.append(make('strong',item.title),make('p',item.text));summary.append(d);}
    const links=make('div',undefined,'case-links');
    for(const item of data.downloads)links.append(link(item.label,item.href,item.download));
    host.replaceChildren(gallery,make('p',data.description,'joint-caption'),summary,links,make('p',data.scope,'scope-note'));
  } catch (error) {
    console.error(error);showError(host,'关节材料暂时未能读取。',url);
  }
}
async function renderAnnotations() {
  const host=document.getElementById('annotation-records');
  const url='assets/cases/annotation/display.json';
  try {
    const data=await readJson(url);
    document.getElementById('annotation-summary').textContent=data.summary;
    const cards=data.records.map((record)=>{
      const article=make('article',undefined,'annotation-record');article.id=record.id;
      const top=make('div',undefined,'record-top');top.append(make('span',record.id,'record-id'),make('span',record.status,`record-status ${record.tone||''}`));
      article.append(top,make('h3',record.title));
      if(record.image){const a=link('',record.image);a.target='_blank';a.rel='noopener';const img=make('img');img.src=record.image;img.alt=record.imageAlt||record.title;img.loading='lazy';a.append(img);article.append(a);}
      const dl=make('dl');for(const item of record.fields)dl.append(make('dt',item.label),make('dd',item.text));article.append(dl);
      const detail=make('details');detail.append(make('summary','展开完整记录'),make('pre',JSON.stringify(record.raw,null,2)));article.append(detail);
      return article;
    });host.replaceChildren(...cards);
  } catch(error) {console.error(error);showError(host,'标注记录暂时未能读取。','assets/cases/annotation/records.json');}
}
renderJoint();renderAnnotations();
