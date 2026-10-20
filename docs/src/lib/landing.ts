/**
 * Product landing interactivity (Magma system): live run demo, tabs,
 * environment picker, teams/refusals cyclers, typewriter CTA, canvas
 * background, dark/light mode. Scoped to the given root element; the
 * returned function stops every timer, frame loop and listener (route
 * unmount / StrictMode remount safe).
 */
export function initLanding(scope: HTMLElement): () => void {
const $ = (s: string): any => scope.querySelector(s);
const $$ = (s: string): any[] => [...scope.querySelectorAll(s)];
const pendingTimeouts = new Set<any>();
const pendingIntervals = new Set<any>();
let rafId = 0;
let resizeHandler: (() => void) | undefined;
function setTimeout(fn: () => void, ms?: number): any {
  const id: any = globalThis.setTimeout(() => { pendingTimeouts.delete(id); fn(); }, ms);
  pendingTimeouts.add(id);
  return id;
}
function clearTimeout(id?: any): void { if (id !== undefined) { pendingTimeouts.delete(id); globalThis.clearTimeout(id); } }
function setInterval(fn: () => void, ms?: number): any {
  const id: any = globalThis.setInterval(fn, ms);
  pendingIntervals.add(id);
  return id;
}
function clearInterval(id?: any): void { if (id !== undefined) { pendingIntervals.delete(id); globalThis.clearInterval(id); } }
function requestAnimationFrame(fn: (t: number) => void): number { rafId = globalThis.requestAnimationFrame(fn); return rafId; }

/* Magma: ember orange glowing through oxblood rock, hottest at the vent. */
const MAGMA={n:'Magma',d:'s',r:8,b:8,D:['#1b0b0a','#fbeee8','#ff6a3d','#ffb454','#1b0b0a'],L:['#f6ecea','#2a0f0c','#c93a1a','#e88a1c','#ffffff'],sD:['#7ad69a','#ff4d5e','#ffc15a'],sL:['#1c7a45','#b3202f','#a86100']};
const SH: Record<string, [string, number, string, number]>={s:['var(--sans)',600,'-.055em',1]};
const hx=(c: string)=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16)),mix=(a: string,b: string,t: number)=>'#'+hx(a).map((v,i)=>Math.round(v*t+hx(b)[i]*(1-t)).toString(16).padStart(2,'0')).join('');
function vars(p: typeof MAGMA,m: string){const[c0,c1,c2,c3,c4]=m==='dark'?p.D:p.L,[ok,bad,am]=m==='dark'?p.sD:p.sL,h=SH[p.d];
 const v={bg:c0,fg:c1,mu:mix(c1,c0,.62),ln:mix(c1,c0,.14),ln2:mix(c1,c0,.27),acc:c2,acc2:c3,on:c4,ok,bad,am};
 return Object.entries(v).map(([k,x])=>`--${k}:${x}`).join(';')+`;--df:${h[0]};--dw:${h[1]};--dl:${h[2]};--dz:${h[3]};--r:${p.r}px;--br:${p.b}px;color-scheme:${m}`}
let mode='dark';
function applyMode(m: string){mode=m;scope.style.cssText=vars(MAGMA,m);if((window as any).bgTheme)(window as any).bgTheme();
 try{localStorage.setItem('nozzle-mode',m)}catch(e){}}
$('#md').onclick=()=>applyMode(mode==='dark'?'light':'dark');
{let m0=matchMedia('(prefers-color-scheme:light)').matches?'light':'dark';try{m0=localStorage.getItem('nozzle-mode')||m0}catch(e){}applyMode(m0)}
const hl=(s: string): string=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/^(\s*(?:- )?)([a-z_]+):/gm,'$1<i>$2</i>:').replace(/(#.*)$/gm,'<span class="cm">$1</span>');
function tabs(g: string,fn: (k: any)=>void){const bs=$$(`[data-g="${g}"] button`);bs.forEach(b=>b.onclick=()=>{bs.forEach(x=>x.setAttribute('aria-selected',x===b));fn(b.dataset.k)});bs[0].click()}

/* live run demo */
const W=130,H=44,LB: Record<string, string>={wait:'waiting',run:'running',ok:'succeeded',fail:'failed',blk:'blocked',hold:'needs approval'};
const N: Record<string, {x:number;y:number;up:string[];d?:number;g?:number}>={build:{x:10,y:50,up:[],d:3},lint:{x:10,y:190,up:[],d:2},test:{x:200,y:20,up:['build'],d:4},scan:{x:200,y:100,up:['build'],d:3},docs:{x:200,y:190,up:['lint'],d:2},approve:{x:390,y:60,up:['test','scan'],g:1},deploy:{x:580,y:60,up:['approve'],d:3}};
const Y: Array<[string | null, string]>=[[null,'name: release\nsteps:'],['build','  - id: build\n    command: ./build.sh'],['lint','  - id: lint\n    command: ./lint.sh'],['test','  - id: test\n    needs: [build]\n    command: ./test.sh $IMAGE_TAG'],['scan','  - id: scan\n    needs: [build]\n    command: ./scan.sh $IMAGE_TAG'],['docs','  - id: docs\n    needs: [lint]\n    command: ./docs.sh'],['approve','  - id: approve\n    needs: [test, scan]\n    gate: approval'],['deploy','  - id: deploy\n    needs: [approve]\n    when: branch == "main"\n    executor: container\n    command: ./deploy.sh $IMAGE_TAG']];
$('#yml').innerHTML=Y.map(([id,t])=>`<div class="st" ${id?`data-s="${id}"`:''}>${hl(t!)}<`).join('');
const E: string[][]=[];for(const id in N)N[id].up.forEach(a=>E.push([a,id]));
$('#gr').innerHTML=E.map(([a,b])=>{const p=N[a],q=N[b],x1=p.x+W,y1=p.y+H/2,x2=q.x,y2=q.y+H/2,m=(x1+x2)/2;return `<path class="e" d="M${x1} ${y1}C${m} ${y1} ${m} ${y2} ${x2} ${y2}"/>`}).join('')+Object.entries(N).map(([id,n])=>`<g class="n" data-id="${id}" tabindex="0" role="button" aria-label="${id}${n.g?'':', activate to make this step fail'}" transform="translate(${n.x},${n.y})"><rect width="${W}" height="${H}" rx="10"/><circle cx="16" cy="22" r="4.5"/><text class="nm" x="30" y="20">${id}</text><text class="sb" x="30" y="35">waiting</text></g>`).join('');
const gn: Record<string, any>={},ge=$$('#gr .e');$$('#gr .n').forEach(g=>gn[g.dataset.id]=g);
let S: Record<string, any>={},fail=new Set(),timer: number|undefined,t0: number;
function log(ic: string,c: string,m: string){const l=$('#lg'),d=document.createElement('div');d.innerHTML=`<span class="t">+${((Date.now()-t0)/1000).toFixed(1)}s</span><span class="k ${c}">${ic}</span>${m}`;l.appendChild(d);l.scrollTop=l.scrollHeight}
function draw(){for(const id in N){const s=S[id].st;gn[id].setAttribute('class','n '+s+(fail.has(id)?' mk':''));gn[id].querySelector('.sb').textContent=fail.has(id)&&s==='wait'?'will fail':LB[s]}
 E.forEach(([a,b],i)=>{const x=S[a].st,y=S[b].st;ge[i].setAttribute('class','e'+(y==='blk'?' dead':x==='ok'&&(y==='run'||y==='hold')?' flow':x==='ok'&&y==='ok'?' done':''))});
 $$('#yml .st[data-s]').forEach(e=>e.className='st '+S[e.dataset.s].st)}
function tick(){let open=0;
 for(const id in N){const n=N[id],s=S[id];
  if(s.st==='wait'){const bad=n.up.find(x=>S[x].st==='fail'||S[x].st==='blk');
   if(bad){s.st='blk';log('⊘','hold',`${id} blocked by upstream failure: ${bad}`)}
   else if(n.up.every(x=>S[x].st==='ok')){if(n.g){s.st='hold';log('⏸','hold',`${id} waiting for a human`);$('#ap').hidden=false}else{s.st='run';s.k=0;log('▸','run',`${id} claimed and started`)}}}
  else if(s.st==='run'){if(++s.k>=(n.d as number)){if(fail.has(id)){s.st='fail';log('✗','fail',`${id} failed with exit code 1`)}else{s.st='ok';log('✓','ok',`${id} succeeded`);if(id==='build')log('→','run','IMAGE_TAG=reg/app:4f2a9c handed to test and scan')}}}}
 draw();
 if(Object.values(S).every(s=>['ok','fail','blk'].includes(s.st))){clearInterval(timer);const v=Object.values(S),bad=v.filter(s=>s.st!=='ok').length;
  log('·','',Object.keys(N).map(id=>({ok:'✓',fail:'✗',blk:'⊘'} as Record<string, string>)[S[id].st]+' '+id).join('  '));
  log(bad?'✗':'✓',bad?'fail':'ok',bad?`run failed: ${v.filter(s=>s.st==='fail').length} failed, ${v.filter(s=>s.st==='blk').length} blocked, exit code 1`:`run succeeded: 7 of 7 steps made it, exit code 0`)}}
function start(){clearInterval(timer);S={};for(const id in N)S[id]={st:'wait',k:0};t0=Date.now();$('#lg').innerHTML='';$('#ap').hidden=true;log('$','','nzl run workflow.yaml');log('✓','ok','graph validated: 7 steps, no cycles');draw();timer=setInterval(tick,520)}
$('#ap').onclick=()=>{S.approve.st='ok';$('#ap').hidden=true;log('✓','ok','approve granted by you');draw()};
$('#rp').onclick=start;
const tog=(g: any)=>{if(N[g.dataset.id].g)return;const id=g.dataset.id;fail.has(id)?fail.delete(id):fail.add(id);start()};
$('#gr').onclick=(e: any)=>{const g=e.target.closest('.n');if(g)tog(g)};
$('#gr').onkeydown=(e: any)=>{if(e.key==='Enter'||e.key===' '){const g=e.target.closest('.n');if(g){e.preventDefault();tog(g)}}};
start();

/* cycle validation */
let cyc=false;const cy=()=>{$('#cy').innerHTML=hl(`  - id: build\n    needs: ${cyc?'[deploy]':'[]'}\n  - id: test\n    needs: [build]\n  - id: deploy\n    needs: [test]`);$('#cye').hidden=!cyc;$('#cyb').textContent=cyc?'Undo':'Add a cycle'};
$('#cyb').onclick=()=>{cyc=!cyc;cy()};cy();

/* languages and drivers */
const LANG: Record<string, string>={yaml:`name: release
schedule: "0 2 * * *"
steps:
  - id: build
    command: ./build.sh
  - id: test
    needs: [build]
    command: ./test.sh $IMAGE_TAG`,
py:`wf = Workflow("release", schedule="0 2 * * *")
build = wf.step("build", command="./build.sh")
test = wf.step("test", needs=[build],
               command="./test.sh $IMAGE_TAG")
for svc in services:
    wf.step(f"deploy-{svc}", needs=[test],
            command=f"./deploy.sh {svc}")`,
ts:`const wf = workflow("release", { schedule: "0 2 * * *" });
const build = wf.step("build", { command: "./build.sh" });
const test = wf.step("test", {
  needs: [build], command: "./test.sh $IMAGE_TAG" });
for (const svc of services)
  wf.step(\`deploy-\${svc}\`, { needs: [test],
    command: \`./deploy.sh \${svc}\` });`};
tabs('lang',k=>$('#lc').innerHTML=hl(LANG[k]));
const EXE: Record<string, [string, string]>={shell:['shell','Runs as a plain process, right beside your code.'],container:['container','Runs in a container from a pool, GPU or otherwise, with the isolation your artifact pipeline needs.'],remote:['remote','Runs on the machine that owns the data.'],function:['function','Runs in a cloud function, wherever the cloud points it.'],more:['yours','…and more. Executors are pluggable, so anything that can claim a step, run it and report back can be one.']};
tabs('exe',k=>{$('#ec').innerHTML=hl(`  - id: train\n    needs: [prepare]\n    executor: ${EXE[k][0]}   # the only line that changes\n    command: ./train.sh`);$('#ed').textContent=EXE[k][1]});

/* one step, anywhere */
const reduce=matchMedia('(prefers-reduced-motion:reduce)').matches;
const EV=[['Your laptop','local shell','shell','spawned pid 48213 on this machine'],['Docker','container','container','container started from the local image'],['Kubernetes','cluster pod','container','pod train-7c9f scheduled on gke-core-1'],['AWS ECS','public cloud','container','ECS task started on Fargate'],['AWS Lambda','serverless','function','function invoked, request id 9b1e'],['Google Cloud Run','serverless','container','revision started, instance warm in 1.2s'],['Azure Container Apps','public cloud','container','replica started in westeurope'],['Cloudflare Containers','edge','container','container started at the edge, FRA'],['GPU pool','container pool','container','claimed worker a100-3 from the pool'],['The box with the data','remote machine','remote','connected to data-01, running in place'],['HPC cluster','batch scheduler','remote','job queued, node n0412 allocated'],['Edge functions','serverless','function','function started 11 ms from the user'],['You name it…','write the driver','yours','your driver claims the step, runs it and reports the result']];
$('#xg').innerHTML=EV.map((e,i)=>`<button class="tl${i===12?' you':''}" data-i="${i}" aria-pressed="false"><b>${e[0]}</b><span>${e[1]}</span></button>`).join('');
let xi = 0, xt: any[] = [], auto: any;
function sel(i: number){xi=i;const e=EV[i];$$('#xg .tl').forEach((b,j)=>b.setAttribute('aria-pressed',j===i));
 $('#xc').innerHTML=hl(`  - id: train\n    needs: [prepare]\n    executor: ${e[2]}   # ${i===12?'a driver you wrote':'runs on '+e[0]}\n    command: ./train.sh`);
 const T=$('#xt');T.innerHTML='';xt.forEach(clearTimeout);xt=[];
 ['$ nzl run workflow.yaml','▸ train claimed','▸ '+e[3],'✓ train succeeded, exit code 0'].forEach((l,k)=>{const f=()=>{const d=document.createElement('div');d.className=['mu','run','run','ok'][k];d.textContent=l;T.appendChild(d)};reduce?f():xt.push(setTimeout(f,k*420))})}
$('#xg').onclick=(e: any)=>{const b=e.target.closest('.tl');if(b){clearInterval(auto);sel(+b.dataset.i)}};
sel(0);if(!reduce)auto=setInterval(()=>sel((xi+1)%EV.length),3800);

/* refusals: the cost of each, side by side */
const NO: Array<[string, string[], string[]]>=[
['Hold your definition hostage to a language',['pipeline.py   # your team writes TypeScript','✗ rewrite every workflow in the tool’s language','✗ two copies of one pipeline start to drift'],['release.yaml  → neutral spec','release.ts    → the same neutral spec','✓ same semantics, whoever wrote it, in any language']],
['Hold execution hostage to a platform',['step train needs the machine that holds the data','✗ platform runners only, so copy 2 TB out first','✗ a platform outage or quota stops the release'],['step train  executor: remote','▸ runs on the machine that owns the data','✓ nothing copied, nothing waiting on someone else’s fleet']],
['Hold your pipeline hostage to its warehouse',['pipeline logic lives inside the warehouse','✗ change warehouses and the pipeline goes with it','✗ steps outside the warehouse can’t join the graph'],['the warehouse is one step among many','▸ swap it out and the graph stays the same','✓ the pipeline stays yours']],
['Fail silently',['transform  exit 1, error swallowed','load       ran anyway, on stale data','✗ the run is green and the dashboard is wrong'],['transform  failed with exit code 1','load       blocked by upstream failure: transform','✓ the failure is loud, local and explained']],
['Truncate quietly',['extract wrote 2.0 GB, limit 1.0 GB','next step received 1.0 GB, no error','✗ half the data and a confident wrong answer'],['output is 2.0 GB, too large to inline','▸ passed by reference as blob://orders.parquet','✓ and if it can’t pass safely, the step fails loudly']],
['Exit zero after a disaster',['3 of 7 steps failed','exit code 0','✗ CI goes green and the bad build ships'],['3 of 7 steps failed','summary names every task','✓ exit code 1, because a red run means something']],
['Lose work to a dead worker',['worker lost at minute 47','✗ the run restarts from step one','✗ 47 minutes of work gone'],['lease expired, heartbeat missed','▸ step reclaimed by another worker','✓ attempts are tracked, so progress is progress']]];
const ln=(a: string[],o: number)=>a.map((l: string,i: number)=>`<div style="--k:${i+o}" class="${({'✗':'fail','✓':'ok','▸':'run'} as Record<string,string>)[l[0]]||'mu'}">${l}</div>`).join('');
$('#nob').innerHTML=NO.map((x,i)=>`<button data-k="${i}">${x[0]}</button>`).join('');
let ni=0;tabs('no',k=>{ni=+k;$('#rb').innerHTML=ln(NO[k][1],0);$('#rg').innerHTML=ln(NO[k][2],3)});
const na=setInterval(()=>$$('#nob button')[(ni+1)%NO.length].click(),6500);['pointerdown','keydown'].forEach(v=>$('#nob').addEventListener(v,()=>clearInterval(na)));

/* background: packets travelling along pipeline lines */
(()=>{const c=$('#bg'),g=c.getContext('2d'),G=72,P: any[]=[];let W = 0, H = 0, D = 1, col: Record<string, string> = {};
 const sz=()=>{D=Math.min(devicePixelRatio||1,2);W=c.width=innerWidth*D;H=c.height=innerHeight*D};
 (window as any).bgTheme=()=>{const s=getComputedStyle(scope);col={a:s.getPropertyValue('--acc').trim(),b:s.getPropertyValue('--acc2').trim()}};
 sz();addEventListener('resize', (resizeHandler = sz));(window as any).bgTheme();if(reduce)return;
 const sp=()=>{const s=G*D,h=Math.random()<.5;P.push({x:Math.floor(Math.random()*W/s)*s,y:Math.floor(Math.random()*H/s)*s,dx:h?(Math.random()<.5?1:-1):0,dy:h?0:(Math.random()<.5?1:-1),t:0,n:0,m:6+Math.random()*10|0,k:Math.random()<.7?'a':'b',tr:[]})};
 (function f(){g.clearRect(0,0,W,H);const s=G*D;while(P.length<W*H/(s*s)/7)sp();
  for(let i=P.length-1;i>=0;i--){const p=P[i];p.t+=.018;
   if(p.t>=1){p.tr.push([p.x,p.y]);if(p.tr.length>4)p.tr.shift();p.x+=p.dx*s;p.y+=p.dy*s;p.t=0;p.n++;
    if(Math.random()<.4){const q=p.dx;p.dx=p.dy*(Math.random()<.5?1:-1);p.dy=q*(Math.random()<.5?1:-1)}
    if(p.n>p.m){P.splice(i,1);continue}}
   const hx=p.x+p.dx*s*p.t,hy=p.y+p.dy*s*p.t,pts=[...p.tr,[p.x,p.y],[hx,hy]];g.strokeStyle=g.fillStyle=col[p.k];g.lineWidth=1.5*D;
   for(let j=1;j<pts.length;j++){g.globalAlpha=.5*j/pts.length*Math.min(1,(p.m-p.n)/2+.2);g.beginPath();g.moveTo(...pts[j-1]);g.lineTo(...pts[j]);g.stroke()}
   g.globalAlpha=.75;g.beginPath();g.arc(hx,hy,2.4*D,0,7);g.fill()}
  requestAnimationFrame(f)})()})();

/* environments */
const ENVS: Record<string, string>={dev:`  - id: deploy
    needs: [test]
    executor: shell         # a plain process on your laptop
    env: { TARGET: dev }
    command: ./deploy.sh $IMAGE_TAG`,stg:`  - id: deploy
    needs: [test]
    executor: container     # same step, now in a container
    env: { TARGET: staging }
    command: ./deploy.sh $IMAGE_TAG`,prod:`  - id: approve
    needs: [test]
    gate: approval          # prod pauses for a human
  - id: deploy
    needs: [approve]
    executor: container
    env: { TARGET: prod }
    command: ./deploy.sh $IMAGE_TAG`};
tabs('env',k=>$('#ev').innerHTML=hl(ENVS[k]));

/* teams: cycling use cases */
const TM=[
{n:'DevOps',lose:'Hosted runners and cluster-native pipelines make yours a guest: their fleet, their YAML dialect, their prerequisites.',b:['A workflow that is just a file, diffed in review and run anywhere with one command','Exit codes you can build CI on'],s:['push','build','test','deploy']},
{n:'Data',lose:'A scheduler cluster to keep alive, a Python-only DAG model and a zoo of DAG files drifting away from the repo.',b:['Cron in the same file, and retries with real attempt tracking','Datasets passed by blob reference, with replay from run history'],s:['extract','validate','transform','publish']},
{n:'AI',lose:'Every agent framework rebuilds queues, retries and state inside itself, and rebuilds them badly.',b:['<b>Author:</b> writes workflows that humans review before anything runs','<b>Citizen:</b> a step whose output flows by the same rules as any other','<b>Pilot:</b> watches the lifecycle stream and decides what runs where'],s:['author','validate','agent step','pilot']},
{n:'Platform',lose:'A ticket queue for every team that needs a pipeline.',b:['One HTTP contract, so clients generate themselves in any language','Run it in Docker Compose, Kubernetes or on the edge, whichever you already operate'],s:['request','client','workflow','events']},
{n:'Security and compliance',lose:'Approvals buried in chat threads that nobody can replay.',b:['Gates pause a run for approval or a signature and resume on the answer','Every lifecycle move is an event, so any run replays exactly'],s:['change','approval','deploy','replay'],g:1}];
let tt: any[] = [], ti = 0;
function team(i: number){ti=i;tt.forEach(clearTimeout);tt=[];const t=TM[i];
 $('#tmv').innerHTML=`<h3>${t.n}</h3><p class="lose">${t.lose}</p><ul>${t.b.map(x=>`<li>${x}</li>`).join('')}</ul><div class="chain">${t.s.map(l=>`<span class="cn">${l}</span>`).join('<i class="ca"></i>')}</div>`;
 const ns=$$('#tmv .cn');if(reduce){ns.forEach(n=>n.className='cn ok');return}
 const at=(f: () => void,ms?: number)=>tt.push(setTimeout(f,ms));let k=0;
 (function st(){if(k>=ns.length){at(()=>{ns.forEach(n=>n.className='cn');k=0;st()},1800);return}
  const n=ns[k],h=t.g===k;n.className='cn '+(h?'hold':'run');at(()=>{n.className='cn ok';k++;at(st,260)},h?1500:650)})()}
$('#tmb').innerHTML=TM.map((t,i)=>`<button data-k="${i}">${t.n}</button>`).join('');
tabs('tm',k=>team(+k));
const ta=reduce?0:setInterval(()=>$$('#tmb button')[(ti+1)%TM.length].click(),8000);['pointerdown','keydown'].forEach(v=>$('#tmb').addEventListener(v,()=>clearInterval(ta)));

/* call to action: filenames cycling in monospace */
const FN=['ci.yaml','monthly_report.py','nightly_etl.yaml','train_model.ts','release.yaml','agent_triage.py','backup.yaml','pii_purge.yaml'];
let fi=0,fc=0,fd=1;const fn=$('#fn');
if(reduce)setInterval(()=>{fn.textContent=FN[fi=(fi+1)%FN.length]},2200);
else(function type(){const w=FN[fi];fc+=fd;fn.textContent=w.slice(0,fc);let t=75;if(fd>0&&fc===w.length){fd=-1;t=1500}else if(fd<0&&fc===0){fd=1;fi=(fi+1)%FN.length;t=300}else if(fd<0)t=35;setTimeout(type,t)})();

/* copy */
$('#cp').onclick=async()=>{const b=$('#cp');try{await navigator.clipboard.writeText('nzl run '+FN[fi]);b.textContent='Copied'}catch(e){b.textContent='Select and copy'}setTimeout(()=>b.textContent='Copy',1800)};

return () => {
  pendingTimeouts.forEach((id) => globalThis.clearTimeout(id));
  pendingIntervals.forEach((id) => globalThis.clearInterval(id));
  pendingTimeouts.clear();
  pendingIntervals.clear();
  globalThis.cancelAnimationFrame(rafId);
  try { xt.forEach(clearTimeout); } catch { /* already torn down */ }
  try { tt.forEach(clearTimeout); } catch { /* already torn down */ }
  if (resizeHandler) window.removeEventListener("resize", resizeHandler);
};
}
