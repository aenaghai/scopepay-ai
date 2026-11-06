/* ScopePay AI — intentionally no build system, so beginners can edit it directly. */
const $ = selector => document.querySelector(selector);
const state = { projects: [], activeProjectId: null, activeChangeId: null, config: null };
const exampleRequest = "Hey! The landing page looks great. Could you also add an online booking system where visitors can schedule appointments, create accounts, and pay when they book? It should be a small change, right?";
const escapeHTML = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = value => '$' + Number(value || 0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
let sdkPromise = null;
let toastTimer;
function toast(message) {const target = $('#toast');target.textContent=message;target.className='toast-on';clearTimeout(toastTimer);toastTimer=setTimeout(()=>target.className='',4500);}
async function api(path, method='GET', data) {
  const opts={method,headers:{'Content-Type':'application/json'}};
  if(data !== undefined) opts.body=JSON.stringify(data);
  let response;
  try {response=await fetch(path,opts);} catch {throw new Error('Cannot reach the app server. Make sure python app.py is running.');}
  const body=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(typeof body.detail==='string' ? body.detail : `Request failed (${response.status})`);
  return body;
}
function activeProject(){return state.projects.find(x=>x.id===state.activeProjectId) || state.projects[0];}
function activeChange(){return activeProject()?.changes.find(x=>x.id===state.activeChangeId) || null;}
async function refresh(keep=true){
  const previousProject=keep?state.activeProjectId:null;
  const previousChange=keep?state.activeChangeId:null;
  state.projects=await api('/api/projects');
  state.activeProjectId=state.projects.some(p=>p.id===previousProject)?previousProject:state.projects[0]?.id;
  state.activeChangeId=activeProject()?.changes.some(c=>c.id===previousChange)?previousChange:null;
  paint();
}
function paint(){
  const project=activeProject();
  const totalChanges=state.projects.reduce((n,p)=>n+p.changes.length,0);
  const paid=state.projects.flatMap(p=>p.changes).filter(c=>c.status==='PAID').reduce((sum,c)=>sum+c.quote_amount,0);
  $('#metric-projects').textContent=state.projects.length;
  $('#metric-changes').textContent=totalChanges;
  $('#metric-paid').textContent=money(paid);
  $('#project-select').innerHTML=state.projects.map(p=>`<option value="${p.id}" ${p.id===state.activeProjectId?'selected':''}>${escapeHTML(p.title)}</option>`).join('');
  $('#sidebar-projects').innerHTML=state.projects.map(p=>`<button class="project-entry ${p.id===state.activeProjectId?'current':''}" data-project-id="${p.id}"><span class="project-dot"></span><span>${escapeHTML(p.title)}</span></button>`).join('');
  $('#scope-preview').textContent=project?.original_scope||'Create a project to begin.';
  renderHistory();renderResult();
}
function renderHistory(){
  const items=activeProject()?.changes||[];
  $('#history-count').textContent=`${items.length} item${items.length===1?'':'s'}`;
  $('#history-items').innerHTML=items.length?items.map(c=>`<button class="history-item" data-change-id="${c.id}"><span><b>${escapeHTML(c.request_text.slice(0,57))}${c.request_text.length>57?'…':''}</b><small>${escapeHTML(new Date(c.created_at).toLocaleString())} · ${escapeHTML(c.ai_mode==='GEMINI'?'Gemini analysis':'Offline preview')}</small></span><span class="status-pill ${c.status}">${escapeHTML(c.status==='PAID'?'TEST PAID':c.status==='APPROVED'?'APPROVED':'DRAFT')}</span></button>`).join(''):'<div class="history-empty">No change orders yet. Your first analysis will appear here.</div>';
}
const statusLabels={OUT_OF_SCOPE:'Potential scope creep',IN_SCOPE:'Likely in scope',NEEDS_REVIEW:'Needs human review'};
function renderResult(){
  const c=activeChange();
  $('#engine-label').textContent=state.config?.ai_enabled?'● Gemini key configured':'● Offline preview mode';
  if(!c){
    $('#result-body').className='empty-result';
    $('#result-body').innerHTML='<div class="empty-illustration"><div class="empty-ring"><span>✦</span></div><span class="spark spark1">✧</span><span class="spark spark2">✴</span></div><h3>Clarity starts here.</h3><p>Paste a client request and hit analyze. We\'ll turn the messy “can you also…” into a structured next step.</p><div class="empty-footer"><span>✳</span> Human-approved. Payment-ready.</div>';
    return;
  }
  const classification=escapeHTML(c.classification);
  let html=`<div class="analysis-content"><span class="result-tag ${classification}">✦ ${escapeHTML(statusLabels[c.classification]||c.classification)}</span><h3>Know what changed.</h3><p class="analysis-desc">${escapeHTML(c.explanation)}</p>`;
  if(c.ai_mode!=='GEMINI') html+='<div class="mode-notice">⚠ Offline heuristic preview, not an AI analysis. Add a Gemini API key for the actual AI-powered judging demo.</div>';
  html+=`<div class="insight-box"><span class="micro-heading">SCOPE COMPARISON</span><p>${escapeHTML(c.evidence)}</p></div>`;
  html+=`<div class="delivery-title">SUGGESTED CHANGE-ORDER ITEMS</div>${c.additions.map(x=>`<div class="deliverable"><span>✓</span>${escapeHTML(x)}</div>`).join('')}`;
  html+=`<div class="draft-reply-head"><span class="delivery-title" style="margin:0">CLIENT-FRIENDLY RESPONSE</span><button id="copy-reply">Copy ↗</button></div><div class="draft-reply">${escapeHTML(c.reply)}</div>`;
  if(c.status==='PROPOSED') {
    html+=`<div class="price-box"><label for="quote-amount">YOUR PROPOSED PRICE (USD)</label><div class="price-control"><span>$</span><input id="quote-amount" type="number" min="1" max="99999.99" step="0.01" value="${Number(c.quote_amount) || 150}" /></div><p class="price-note">You set the price. AI flags possible scope changes but never determines what a client owes.</p><div class="analysis-actions"><button id="approve-quote" class="primary-btn">Approve & create change order <span>→</span></button></div></div>`;
  } else if(c.status==='APPROVED'){
    html+=`<div class="approve-success">✓ Change order approved · ${money(c.quote_amount)} USD</div>`;
    if(state.config?.paypal_enabled) {
      html+='<p class="sandbox-note">Test payment only. Use a PayPal Sandbox personal buyer account.</p><div id="paypal-buttons" class="paypal-container">Loading PayPal Sandbox…</div>';
    } else {
      html+='<div class="sandbox-warning">🔌 PayPal Sandbox is not configured. Add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET to your local <b>.env</b> file, then restart the app. No payment is being simulated.</div>';
    }
  } else if(c.status==='PAID') {
    html+=`<div class="paid-box"><div>✓ VERIFIED SANDBOX CAPTURE</div><b>${money(c.quote_amount)} captured</b><p>PayPal capture ID: ${escapeHTML(c.paypal_capture_id)}<br />Completed ${escapeHTML(c.paid_at||'')}</p></div>`;
  }
  html+='</div>';
  $('#result-body').className='';$('#result-body').innerHTML=html;
  $('#copy-reply').addEventListener('click',()=>navigator.clipboard.writeText(c.reply).then(()=>toast('Client reply copied')).catch(()=>toast('Copy unavailable in this browser')));
  if(c.status==='PROPOSED') $('#approve-quote').addEventListener('click',()=>approveQuote(c.id));
  if(c.status==='APPROVED'&&state.config?.paypal_enabled) mountPayPalButtons(c.id);
}
async function approveQuote(id){
  const button=$('#approve-quote');const amount=$('#quote-amount').value;
  button.disabled=true;button.textContent='Approving…';
  try {await api(`/api/changes/${id}/quote`,'PATCH',{amount:String(amount)});await api(`/api/changes/${id}/approve`,'POST');await refresh();toast('Quote approved. Ready for Sandbox checkout.');}
  catch(err){toast(err.message);button.disabled=false;button.textContent='Approve & create change order →';}
}
async function loadPayPalSDK(){
  if(window.paypal?.Buttons) return;
  if(!sdkPromise){
    sdkPromise=new Promise((resolve,reject)=>{
      const s=document.createElement('script');
      s.src=`https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(state.config.paypal_client_id)}&currency=USD&intent=capture`;
      s.onload=resolve;s.onerror=()=>reject(new Error('Could not load PayPal SDK. Check your connection.'));
      document.head.appendChild(s);
    });
  }
  return sdkPromise;
}
async function mountPayPalButtons(id){
  const mount=$('#paypal-buttons');
  try{
    await loadPayPalSDK();
    if(!mount.isConnected || activeChange()?.id!==id) return;
    mount.innerHTML='';
    await window.paypal.Buttons({
      style:{layout:'vertical',shape:'rect',label:'paypal',height:42},
      createOrder: async ()=>{const result=await api(`/api/changes/${id}/paypal/create`,'POST');return result.id;},
      onApprove:async data=>{try{await api(`/api/changes/${id}/paypal/capture`,'POST',{orderID:data.orderID});await refresh();toast('Verified Sandbox payment captured.');}catch(err){toast(err.message);}},
      onCancel:()=>toast('Sandbox checkout cancelled. No payment was recorded.'),
      onError:err=>toast('PayPal checkout error. Check browser console and Sandbox accounts.')
    }).render(mount);
  }catch(err){if(mount.isConnected)mount.innerHTML=`<div class="error-msg">${escapeHTML(err.message)}</div>`;}
}
async function analyze(){
  const request=$('#client-request').value.trim();
  if(request.length<12){toast('Paste a client request of at least 12 characters.');$('#client-request').focus();return;}
  const btn=$('#analyze-button');btn.disabled=true;$('#analyze-button-text').textContent='✦ Comparing against agreement…';
  try{const result=await api(`/api/projects/${state.activeProjectId}/changes`,'POST',{request_text:request});state.activeChangeId=result.id;await refresh();$('#result-panel').scrollIntoView({behavior:'smooth',block:'center'});toast(result.ai_mode==='GEMINI'?'Gemini analysis complete.':'Offline preview complete. Add a Gemini key for real AI.');}
  catch(err){
    $('#result-body').className='';
    $('#result-body').innerHTML=`<div class="analysis-content" role="alert"><h3>Analysis couldn’t complete.</h3><div class="mode-notice">${escapeHTML(err.message)}</div><p>Your client request is still on the left. Click Analyze scope change to retry.</p></div>`;
    $('#result-panel').scrollIntoView({behavior:'smooth',block:'center'});
  }
  finally{btn.disabled=false;$('#analyze-button-text').textContent='✦ Analyze scope change';}
}
async function initialize(){
  try{
    state.config=await api('/api/status');
    $('#ai-badge').textContent=state.config.ai_enabled?'Key configured':'Preview only';
    $('#paypal-badge').textContent=state.config.paypal_enabled?'Connected':'Not connected';
    if(state.config.ai_enabled)$('#ai-badge').classList.add('connected');
    if(state.config.paypal_enabled)$('#paypal-badge').classList.add('connected');
    await refresh(false);
  }catch(err){toast(err.message);}
  $('#project-select').addEventListener('change',e=>{state.activeProjectId=Number(e.target.value);state.activeChangeId=null;paint();});
  $('#sidebar-projects').addEventListener('click',e=>{const button=e.target.closest('[data-project-id]');if(button){state.activeProjectId=Number(button.dataset.projectId);state.activeChangeId=null;paint();}});
  $('#history-items').addEventListener('click',e=>{const button=e.target.closest('[data-change-id]');if(button){state.activeChangeId=Number(button.dataset.changeId);renderResult();$('#result-panel').scrollIntoView({behavior:'smooth',block:'center'});}});
  $('#sample-request').addEventListener('click',()=>{$('#client-request').value=exampleRequest;toast('Example loaded. Click Analyze.');});
  $('#analyze-button').addEventListener('click',analyze);
  $('#new-project').addEventListener('click',()=>$('#project-dialog').showModal());
  $('#close-dialog').addEventListener('click',()=>$('#project-dialog').close());
  $('#cancel-dialog').addEventListener('click',()=>$('#project-dialog').close());
  $('#read-full-scope').addEventListener('click',()=>{$('#full-scope').textContent=activeProject()?.original_scope;$('#scope-dialog').showModal();});
  $('#close-scope').addEventListener('click',()=>$('#scope-dialog').close());
  $('#project-form').addEventListener('submit',async e=>{
    e.preventDefault();const form=e.target;const button=form.querySelector('[type=submit]');button.disabled=true;
    try{const payload=Object.fromEntries(new FormData(form));const result=await api('/api/projects','POST',payload);state.activeProjectId=result.id;state.activeChangeId=null;await refresh();$('#project-dialog').close();form.reset();toast('Project created. Add a client request to begin.');}
    catch(err){toast(err.message);}finally{button.disabled=false;}
  });
}
document.addEventListener('DOMContentLoaded',initialize);
