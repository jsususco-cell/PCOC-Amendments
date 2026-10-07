/* eslint-disable */
/* App layer over public/engine.js (the logic lifted from code page 177).
 *
 * Loaded as a classic script right after engine.js. Function declarations here
 * deliberately REPLACE engine ones of the same name (render, gRender, toast,
 * xml2): in a classic script the last declaration wins.
 *
 * Everything here writes the SAME fields page 177 writes. No table changes.
 */

/* ---------- transport: through the app's server, never a token in the browser ---------- */
function upUrl(u){
  u=String(u||'');
  if(u.indexOf(QB_ORIGIN)===0) u=u.slice(QB_ORIGIN.length);
  return /^\/up\//.test(u) ? '/api/up?p='+encodeURIComponent(u) : u;
}
function qfetch(u){ return fetch(upUrl(u),{credentials:'same-origin'}); }

function xml2(dbid,action,inner){
  return fetch('/api/qb?db='+encodeURIComponent(dbid)+'&action='+encodeURIComponent(action),{
    method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/xml'},
    body:'<qdbapi>'+inner+'</qdbapi>'
  }).then(function(r){
    if(r.status===401){ emit('auth'); throw new Error('You were signed out. Sign in again.'); }
    return r.text();
  }).then(function(t){
    var d=new DOMParser().parseFromString(t,'text/xml'),e=d.querySelector('errcode');
    if(!e) throw new Error('Quickbase did not answer.');
    if(e.textContent!=='0') throw new Error((d.querySelector('errdetail')||d.querySelector('errtext')).textContent);
    return d;
  });
}

/* Page 177 declares pdfjsReady() twice. The later one (scope-file reader)
   resolves to true/false, which broke the earlier caller (the document viewer,
   which needs the library itself). This one resolves to the library: truthy
   for the reader, usable for the viewer. */
function pdfjsReady(){
  if(window.__pdfjsLibP) return window.__pdfjsLibP;
  var base=['https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/','https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/'];
  window.__pdfjsLibP=new Promise(function(res){
    (function next(i){
      if(window.pdfjsLib) return res(window.pdfjsLib);
      if(i>=base.length) return res(null);
      var s=document.createElement('script'); s.src=base[i]+'pdf.min.js';
      s.onload=function(){ try{ window.pdfjsLib.GlobalWorkerOptions.workerSrc=base[i]+'pdf.worker.min.js'; }catch(e){} res(window.pdfjsLib||null); };
      s.onerror=function(){ next(i+1); };
      document.head.appendChild(s);
    })(0);
  });
  return window.__pdfjsLibP;
}

/* ---------- events to React ---------- */
var PCOC_L={};
function emit(ev,d){ (PCOC_L[ev]||[]).slice().forEach(function(f){ try{ f(d); }catch(e){ console.error(e); } }); }
var ERRBOX={ set innerHTML(v){ var t=document.createElement('div'); t.innerHTML=v; emit('error', t.textContent); } };
function render(){ emit('change'); }
function gRender(){ emit('change'); }
function toast(m){ emit('toast', m); }

/* ---------- the app's API ---------- */
var PC={};
PC.on=function(ev,f){ (PCOC_L[ev]=PCOC_L[ev]||[]).push(f); return function(){ PCOC_L[ev]=(PCOC_L[ev]||[]).filter(function(x){return x!==f;}); }; };
function caseByRid(rid){ return G.cases.filter(function(x){return String(x.rid)===String(rid);})[0]; }
function caseByCs(cs){ return G.cases.filter(function(x){return x.cs===cs;})[0]; }
PC.caseByRid=caseByRid; PC.caseByCs=caseByCs;

PC.loadAll=function(){
  return load().then(function(){ return gLoad(); }).then(function(){ return Promise.all([sfLoad(),PC.loadMilestones()]); })
    .then(function(){ PC.loaded=true; emit('change'); });
};
PC.reload=function(){ return PC.loadAll(); };

/* The upkeep page 177 ran on every page open, now run on purpose:
   new cases from new money rows, date stamps from sent emails, scope-file
   reading, automatic document builds, chasers. At most every 6 hours per
   browser unless someone presses Sync now. */
var UPKEEP_MS=6*36e5;
PC.upkeepDue=function(){ try{ return Date.now()-Number(localStorage.getItem('pcoc.upkeep')||0)>UPKEEP_MS; }catch(e){ return false; } };
PC.lastUpkeep=function(){ try{ return Number(localStorage.getItem('pcoc.upkeep')||0); }catch(e){ return 0; } };
PC.upkeep=function(){
  if(PC.busy) return PC.busy;
  emit('busy','Syncing cases with Canopy and the Outbox…');
  PC.busy=gSync().then(function(k){ if(k) return gLoad(); })
    .then(function(){ emit('busy','Stamping dates from sent emails…'); return mailSync(); }).then(function(k){ if(k) return gLoad(); })
    .then(function(){ emit('busy','Reading new scope files…'); return scopeScan().catch(function(e){ console.warn(e); }); })
    .then(function(){ emit('busy','Building documents…'); autoBuild(); return autoChase(); }).then(function(k){ if(k) return gLoad(); })
    .then(function(){ return autoDocs(); })
    .then(function(){ try{ localStorage.setItem('pcoc.upkeep',String(Date.now())); }catch(e){} })
    .catch(function(e){ toast('Sync stopped: '+e.message); })
    .then(function(){ PC.busy=null; emit('busy',''); emit('change'); });
  return PC.busy;
};

/* Save a case: dates (ISO), text fields, files. Port of page 177 saveCase(). */
PC.saveCase=function(rid,o){
  var c=caseByRid(rid); if(!c) return Promise.reject(new Error('Case not found.'));
  o=o||{}; var from=c.stage, inner='<rid>'+c.rid+'</rid>', chg=0, files=[], npaFile=o.npa||null;
  Object.keys(o.dates||{}).forEach(function(k){ var v=o.dates[k]||''; if(!CF[k]) return; if(v!==(c[k]||'')){ inner+='<field fid="'+CF[k]+'">'+gmdy(v)+'</field>'; c[k]=v; chg++; } });
  Object.keys(o.texts||{}).forEach(function(k){ var v=o.texts[k]==null?'':String(o.texts[k]); if(!TXT[k]) return; if(v!==(c[k]||'')){ inner+='<field fid="'+TXT[k]+'">'+esc(v)+'</field>'; c[k]=v; chg++; } });
  Object.keys(o.files||{}).forEach(function(k){ if(o.files[k]&&CF[k]) files.push({fid:CF[k],key:k,f:o.files[k]}); });
  if(npaFile&&!c.npaOn){ c.npaOn=gtoday(); inner+='<field fid="19">'+gmdy(c.npaOn)+'</field>'; chg++; }
  if(files.some(function(x){return x.key==='sign';})&&!c.signOn){ c.signOn=gtoday(); inner+='<field fid="31">'+gmdy(c.signOn)+'</field>'; }
  if(files.some(function(x){return x.key==='drw';})&&!c.drwRec){ c.drwRec=gtoday(); inner+='<field fid="17">'+gmdy(c.drwRec)+'</field>'; }
  var ns=derive(c); if(ns!==c.stage){ inner+='<field fid="10">'+esc(ns)+'</field><field fid="11">'+gmdy(gtoday())+'</field>'; c.stage=ns; c.since=gtoday(); c.days='0'; chg++; }
  if(!chg&&!files.length&&!npaFile) return Promise.resolve({changed:false,stage:c.stage,from:from});
  return Promise.all(files.map(function(x){ return b64of(x.f).then(function(b){ return {fid:x.fid,key:x.key,name:x.f.name,b:b}; }); }))
    .then(function(fs){ fs.forEach(function(x){ inner+='<field fid="'+x.fid+'" filename="'+esc(x.name)+'">'+x.b+'</field>'; c[x.key]=x.name; }); return xml2(CT,'API_EditRecord',inner); })
    .then(function(){
      if(!npaFile) return;
      return b64of(npaFile).then(function(b){ return Promise.all(rowsOf(c).map(function(r){ r.d1=npaFile.name;
        return xml('API_EditRecord','<rid>'+r.rid+'</rid><field fid="46" filename="'+esc(npaFile.name)+'">'+b+'</field><field fid="45">'+gmdy(c.npaOn)+'</field>'); })); });
    })
    .then(function(){ return gLoad(); })
    .then(function(){ return {changed:true,stage:c.stage,from:from}; });
};

/* Case-level papers that live on the money rows (one per scope change):
   d3 original arbitrio receipt (48), d4 PRDOH task order (68) or l4 its link (69).
   Written to every row of the case, as the Notice is. */
PC.saveRowDocs=function(rid,o){
  var c=caseByRid(rid); if(!c) return Promise.reject(new Error('Case not found.'));
  var R=rowsOf(c); if(!R.length) return Promise.reject(new Error('This case has no amendment rows.'));
  var parts=[], pre=Promise.resolve();
  [['d3',48],['d4',68]].forEach(function(p){ var f=o[p[0]]; if(!f) return;
    pre=pre.then(function(){ return b64of(f).then(function(b){ parts.push({k:p[0],fid:p[1],name:f.name,b:b}); }); }); });
  return pre.then(function(){
    var extra=(o.d4||o.l4)?'<field fid="70">Notice of Issued Task Order</field>':'';
    if(o.l4) extra+='<field fid="69">'+esc(o.l4)+'</field>';
    if(!parts.length&&!extra) return;
    return Promise.all(R.map(function(r){
      var inner='<rid>'+r.rid+'</rid>'+extra+parts.map(function(x){ return '<field fid="'+x.fid+'" filename="'+esc(x.name)+'">'+x.b+'</field>'; }).join('');
      return xml('API_EditRecord',inner).then(function(){ parts.forEach(function(x){ r[x.k]=x.name; }); if(o.l4) r.l4=o.l4; if(o.d4||o.l4) r.tokind='Notice of Issued Task Order'; });
    }));
  }).then(function(){ emit('change'); });
};

/* Intake decisions. Writes row Amendment Status (fid 14) and case Stage (fid 10). */
var DECIDE={
  amend:{row:'Required — Pending',stage:'A · Prepare request'},
  notreq:{row:'Not Required',stage:'Not required'},
  refund:{row:'Refund — money back to us',stage:'Refund owed to us'},
  structure:{row:'Waiting — Structure not passed',stage:'Waiting · Structure not passed'}
};
PC.decide=function(rid,kind){
  var c=caseByRid(rid), d=DECIDE[kind]; if(!c||!d) return Promise.reject(new Error('Nothing to decide.'));
  var keep={'Complete':1};
  return Promise.all(rowsOf(c).filter(function(r){ return !keep[r.st]; }).map(function(r){
      return xml('API_EditRecord','<rid>'+r.rid+'</rid><field fid="14">'+esc(d.row)+'</field>').then(function(){ r.st=d.row; }); }))
    .then(function(){ return xml2(CT,'API_EditRecord','<rid>'+c.rid+'</rid><field fid="10">'+esc(d.stage)+'</field><field fid="11">'+gmdy(gtoday())+'</field>'); })
    .then(function(){ return gLoad(); });
};
PC.finishedRule=function(v){
  return xml2(SETT,'API_EditRecord','<rid>1</rid><field fid="76">'+esc(v)+'</field>')
    .then(function(){ return gSync(); }).then(function(){ return PC.reload(); });
};
PC.getFinishedRule=function(){
  return xml2(SETT,'API_DoQuery','<query>{3.EX.1}</query><clist>76</clist><fmt>structured</fmt>')
    .then(function(d){ return (recs(d)[0]||{})['76']||'Ask Priscilla'; });
};

/* Payment on one money row. Port of page 177's row Save, minus the status
   dropdown (status is never rewritten here, so a refund row stays a refund). */
PC.savePayment=function(rowRid,v,receipt){
  var r=S.rows.filter(function(x){ return String(x.rid)===String(rowRid); })[0]; if(!r) return Promise.reject(new Error('Row not found.'));
  v=v||{};
  /* v holds only what changed; check against the record as it will be */
  var arb=('arb' in v)?v.arb:r.arb, pm=('pm' in v)?v.pm:r.pm, card=('card' in v)?v.card:r.card;
  if(!Object.keys(v).length&&!receipt) return Promise.resolve(null);
  if(Number(arb)>0&&!pm) return Promise.reject(new Error('Say how it was paid.'));
  if(pm==='Credit Card'&&!card) return Promise.reject(new Error('Which card paid it?'));
  var inner='<rid>'+r.rid+'</rid>';
  var put=function(fid,val){ inner+='<field fid="'+fid+'">'+esc(val==null?'':val)+'</field>'; };
  if('arb' in v) put(17,v.arb); if('notes' in v) put(19,v.notes);
  if('pm' in v) put(32,v.pm); if('pref' in v) put(33,v.pref); if('pby' in v) put(34,v.pby);
  if('pip' in v) inner+='<field fid="35">'+(v.pip?'1':'0')+'</field>';
  if('pwho' in v) put(36,v.pwho); if('pdate' in v) inner+='<field fid="37">'+mdy(v.pdate)+'</field>';
  if('card' in v) put(42,v.card); if('carb' in v) put(56,v.carb); if('cpat' in v) put(57,v.cpat);
  var b64=null;
  return (receipt?b64of(receipt).then(function(x){ b64=x; inner+='<field fid="38" filename="'+esc(receipt.name)+'">'+x+'</field>'; }):Promise.resolve())
    .then(function(){ return xml('API_EditRecord',inner); })
    .then(function(){
      ['arb','notes','pm','pref','pby','pwho','pdate','card'].forEach(function(k){ if(k in v) r[k]=v[k]; });
      if('pip' in v) r.pip=!!v.pip; if('carb' in v) r.carb=Number(v.carb)||0; if('cpat' in v) r.cpat=Number(v.cpat)||0;
      if(receipt) r.rcpt=receipt.name;
      var elig=Number(r.arb)>0&&r.pm&&r.pdate&&!r.jcref;
      if(!elig) return null;
      return postJobCost(r,{pm:r.pm,pref:r.pref,pby:r.pby,pip:r.pip,pwho:r.pwho,pdate:r.pdate,amt:r.arb,card:r.card},b64,receipt?receipt.name:'')
        .then(function(sid){ return xml('API_EditRecord','<rid>'+r.rid+'</rid><field fid="39">1</field><field fid="40">'+esc(sid)+'</field>').then(function(){ r.jc=true; r.jcref=sid; return sid; }); });
    })
    .then(function(sid){ emit('change'); return sid; });
};

/* A trip to the town. Port of page 177 saveVisit(), plus: when Paid, the
   amount for each scope change is recorded on its row in the same save
   (and the job cost posts), instead of being typed again in the money table. */
PC.saveTrip=function(o){
  o=o||{};
  if(!o.muni) return Promise.reject(new Error('Pick the town.'));
  if(!o.cases||!o.cases.length) return Promise.reject(new Error('Tick at least one case.'));
  if(!o.photo&&!o.roster&&o.outcome!=='Paid') return Promise.reject(new Error('Add a photo with the date and time, or of the sign-in sheet. The Program asks for proof.'));
  var inst=o.time?new Date(o.time).getTime():Date.now(), t=appMs(inst);
  var paidRows=(o.pay&&o.pay.rows||[]).filter(function(x){ return Number(x.amt)>0; });
  var amt=Number(o.amt)||paidRows.reduce(function(s,x){ return s+Number(x.amt); },0);
  if(o.outcome==='Paid'&&paidRows.length&&!(o.pay&&o.pay.pm)) return Promise.reject(new Error('Say how it was paid.'));
  if(o.outcome==='Paid'&&o.pay&&o.pay.pm==='Credit Card'&&!o.pay.card) return Promise.reject(new Error('Which card paid it?'));
  var v={t:String(inst),muni:o.muni,who:o.who||'',purpose:o.purpose||'Amendment taxes',outcome:o.outcome||'Paid',amt:amt,note:o.note||'',cases:o.cases.join(', '),roster:!!o.roster};
  var note=canopyNote(v);
  var fl=[[o.photo,13],[o.roster,14],[o.receipt,15]].filter(function(x){ return x[0]; });
  return Promise.all(fl.map(function(x){ return b64of(x[0]).then(function(b){ return '<field fid="'+x[1]+'" filename="'+esc(x[0].name)+'">'+b+'</field>'; }); }))
    .then(function(parts){
      var inner='<field fid="6">'+t+'</field><field fid="7">'+esc(v.muni)+'</field><field fid="8">'+esc(v.who)+'</field><field fid="9">'+esc(v.purpose)+'</field><field fid="10">'+esc(v.cases)+'</field><field fid="11">'+esc(v.outcome)+'</field>'
        +(v.amt?'<field fid="12">'+v.amt+'</field>':'')+'<field fid="16">'+esc(v.note)+'</field><field fid="17">'+esc(note)+'</field>'+parts.join('');
      return xml2(VT,'API_AddRecord',inner);
    })
    .then(function(){
      if(v.outcome!=='Paid') return;
      var iso=prIso(inst);
      return Promise.all(G.cases.filter(function(c){ return o.cases.indexOf(c.cs)>=0&&!c.paid; }).map(function(c){
        c.paid=iso; var ns=derive(c), inner='<rid>'+c.rid+'</rid><field fid="27">'+gmdy(iso)+'</field>';
        if(ns!==c.stage) inner+='<field fid="10">'+esc(ns)+'</field><field fid="11">'+gmdy(gtoday())+'</field>';
        return xml2(CT,'API_EditRecord',inner);
      })).then(function(){
        var p=o.pay||{}, ch=Promise.resolve(), posted=[];
        paidRows.forEach(function(x){ ch=ch.then(function(){
          return PC.savePayment(x.rid,{arb:String(x.amt),pm:p.pm||'',card:p.card||'',pref:p.pref||'',pby:v.who,pip:true,pwho:v.who,pdate:iso},o.receipt||null)
            .then(function(sid){ if(sid) posted.push(sid); }); }); });
        return ch.then(function(){ return posted; });
      });
    })
    .then(function(posted){ return gLoad().then(function(){ return {note:note,posted:posted||[]}; }); });
};
PC.markPasted=function(visitRid,who){
  return xml2(VT,'API_EditRecord','<rid>'+visitRid+'</rid><field fid="18">'+gmdy(gtoday())+'</field><field fid="19">'+esc(who||'')+'</field>').then(function(){ return gLoad(); });
};

/* Rates: arbitrio (fid 8) and patente (fid 14) per town, then the same
   recalculation page 177's applyRate() does on every row of that town. */
PC.loadRates=function(){
  return xml2(RT,'API_DoQuery','<clist>3.6.8.9.10.11.14</clist><fmt>structured</fmt><options>num-500</options>').then(function(d){
    return recs(d).map(function(o){ return {rid:o.rid,muni:o['6']||'',rate:o['8']===''?null:Number(o['8']),prate:o['14']===''?0:Number(o['14']),on:day(o['10']),note:o['11']||''}; });
  });
};
PC.saveRate=function(muni,rate,prate){
  rate=Number(rate); prate=Number(prate)||0;
  if(!isFinite(rate)||rate<0||rate>100) return Promise.reject(new Error('The arbitrio rate must be between 0 and 100.'));
  var e=RATES[muni], note='Rate changed on the PCOC Amendments app.';
  var f='<field fid="8">'+rate+'</field><field fid="14">'+prate+'</field><field fid="9">1</field><field fid="10">'+today()+'</field><field fid="11">'+esc(note)+'</field>';
  var p=(e&&e.rid)?xml2(RT,'API_EditRecord','<rid>'+e.rid+'</rid>'+f):xml2(RT,'API_AddRecord','<field fid="6">'+esc(muni)+'</field>'+f);
  return p.then(function(){
    RATES[muni]=RATES[muni]||{rid:null}; RATES[muni].rate=rate; RATES[muni].prate=prate;
    var hit=S.rows.filter(function(x){ return x.muni===muni; }), chain=Promise.resolve();
    hit.forEach(function(x){ x.rate=rate; x.adue=Math.round(x.amt*rate)/100; x.prate=prate; x.pdue=Math.round(x.amt*prate)/100;
      chain=chain.then(function(){ return xml('API_EditRecord','<rid>'+x.rid+'</rid><field fid="27">'+rate+'</field><field fid="28">'+x.adue.toFixed(2)+'</field><field fid="54">'+prate+'</field><field fid="55">'+x.pdue.toFixed(2)+'</field>'); }); });
    return chain.then(function(){ return loadRates(); }).then(function(){ emit('change'); return hit.length; });
  });
};

/* Emails: everything the PCOC pages put in the KTO Outbox. */
PC.outbox=function(){
  return xml2(OBXT,'API_DoQuery',"<query>{19.EX.'"+CT+"'}OR{19.EX.'"+TID+"'}</query><clist>3.1.6.7.8.10.11.14.19.20</clist><slist>3</slist><options>sortorder-D.num-500</options><fmt>structured</fmt>")
    .then(function(d){ return recs(d).map(function(o){
      var tbl=o['19'], rid=o['20'], c=null;
      if(tbl===CT) c=caseByRid(rid); else { var r=S.rows.filter(function(x){ return String(x.rid)===String(rid); })[0]; if(r) c=caseByCs(r.cs)||{cs:r.cs}; }
      return {rid:o.rid,created:day(o['1']),to:o['6']||'',cc:o['7']||'',subj:o['8']||'',st:o['10']||'',kind:o['11']||'',sent:day(o['14']),cs:c?c.cs:''}; }); });
};
PC.remindPA=function(rid){
  var c=caseByRid(rid); if(!c) return Promise.reject(new Error('Case not found.'));
  return qmail(c,KIND.chase,G.set.to,G.set.cc,'Seguimiento enmienda al permiso - '+c.cs,
    'Saludos,\n\nLe damos seguimiento a la enmienda al permiso sometida el '+us(c.sentPA)+'.\n\n'+caseHead(c)+'\nGracias,\nByrdson Services, LLC',[]);
};
PC.remindHarold=function(rid){
  var c=caseByRid(rid); if(!c) return Promise.reject(new Error('Case not found.'));
  return qmail(c,KIND.chase,G.set.harold,G.set.haroldCc,'Recordatorio planos revisados - '+c.cs,
    'Saludos Ing. Vidal,\n\nLe damos seguimiento a los planos revisados solicitados el '+us(c.drwReq)+' para la enmienda al permiso.\n\n'+caseHead(c)+'\nGracias,\nByrdson Services, LLC',[]);
};
PC.mail=function(rid,key){
  var c=caseByRid(rid); if(!c) return Promise.reject(new Error('Case not found.'));
  var fn={drw:mDrawings,pa:mPA,fal:mFAL,stk:mSticker,close:mClose}[key];
  if(!fn) return Promise.reject(new Error('Unknown email.'));
  return fn(c).then(function(st){ return mailLoad().then(function(){ emit('change'); return st; }); });
};
/* The PCOC template narrative (page 177's builder, with the fixes above).
   Used only when the Permitting Helper has no narrative for the case to revise. */
function ownNarrative(c,rows){
  return jobDates(c).then(function(J){
    applyJobFacts(c,J);
    var B=narrativeBlocks(c,J,rows?changes(rows):[]);
    return Promise.all([narrativePdf(c,B),blobB64(narrativeWord(c,B))]).then(function(o){
      return xml2(CT,'API_EditRecord','<rid>'+c.rid+'</rid><field fid="12" filename="'+esc(c.cs+' - Narrative - REVISED.pdf')+'">'+fileB64(o[0])+'</field><field fid="54" filename="'+esc(c.cs+' - Narrative - REVISED.doc')+'">'+o[1]+'</field>');
    });
  });
}

/* Make the papers. The Cost Estimate (and the Narrative, when the Permitting
   Helper has one for the case) are built by the Permitting Helper's own
   generators, through /api/revise, and say what they revise. Hands back the
   case as Quickbase now has it, plus what was done. */
PC.buildDocs=function(rid){
  var c=caseByRid(rid); if(!c) return Promise.reject(new Error('Case not found.'));
  var r0=rowsOf(c)[0]; if(!r0) return Promise.reject(new Error('This case has no amendment rows.'));
  if(!c.scx){
    return ownNarrative(c,null).then(function(){ return gLoad(); })
      .then(function(){ return {c:caseByRid(rid)||c, result:{narrative:'pcoc', narrativeReason:'No scope file yet, so only the PCOC Narrative was made.'}}; });
  }
  var name=fname(c.scx), sheet=/\.xlsx?$/i.test(name), parsed=null, result=null;
  return qfetch('/up/'+CT+'/a/r'+c.rid+'/e53/v0')
    .then(function(x){ if(!x.ok) throw new Error('Could not open the saved scope file.'); return x.arrayBuffer(); })
    .then(function(buf){ return parseScopeFile(buf).then(function(rows){ parsed=rows; return buf; }); })
    .then(function(buf){
      var changesList=rowsOf(c).filter(function(r){ return /^\d+$/.test(String(r.sc||'')); })
        .sort(function(a,b){ return String(a.appr).localeCompare(String(b.appr)); })
        .map(function(r){ return 'Program scope change '+r.sc+(r.typ?' ('+r.typ+')':'')+(r.appr?', approved '+longDate(r.appr):'')+'.'; });
      var body={ rid:Number(c.rid), atPermit:r0.atpermit||0, now:r0.connow||0, permitDate:r0.permit||'', changes:changesList };
      if(sheet) body.scope={ fileName:name, base64:fileB64(buf) };
      else body.rows=estLines(parsed).map(function(r,i){ return {row:i+1,itemNo:Number(r.n)||null,groupDesc:r.grp||'',desc:r.desc||'',qty:Number(r.qty)||0,unitCost:Number(r.uc)||0,salesTax:0,rcv:Number(r.rcv)||0}; });
      return fetch('/api/revise',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    })
    .then(function(x){ return x.json().then(function(j){ if(!x.ok) throw new Error(j.error||('The papers could not be made ('+x.status+').')); return j; }); })
    .then(function(j){ result=j; return j.narrative==='skipped' ? ownNarrative(c,parsed).then(function(){ result.narrative='pcoc'; }) : null; })
    .then(function(){ return gLoad(); })
    .then(function(){ return {c:caseByRid(rid)||c, result:result}; });
};

/* One printable PDF for a whole trip: each case's municipality pack, in order.
   Builds a case's pack first when it is missing or stale. */
PC.tripPack=function(rowList){
  return window.__pdflibReady.then(function(ok){
    if(!ok) throw new Error('The PDF library could not be loaded.');
    var P=window.PDFLib, ch=Promise.resolve(), parts=[], missed=[];
    rowList.forEach(function(r){ ch=ch.then(function(){
      return (packStale(r)?buildPack(r).catch(function(){}):Promise.resolve())
        .then(function(){ return qfetch(qbfile(r,71)); })
        .then(function(x){ if(!x.ok) throw new Error('no pack'); return x.arrayBuffer(); })
        .then(function(b){ parts.push(b); })
        .catch(function(){ missed.push(r.cs); });
    }); });
    return ch.then(function(){ return P.PDFDocument.create(); }).then(function(out){
      var c2=Promise.resolve();
      parts.forEach(function(b){ c2=c2.then(function(){ return P.PDFDocument.load(b,{ignoreEncryption:true}).then(function(src){
        return out.copyPages(src,src.getPageIndices()).then(function(ps){ ps.forEach(function(p){ out.addPage(p); }); }); }); }); });
      return c2.then(function(){ return out.save(); }).then(function(bytes){ emit('change'); return {bytes:bytes,missed:missed}; });
    });
  });
};

/* ===== Priscilla's flow (call 2026-10-06) =====
   - the town gets exactly 4 papers: Notification, Final Acceptance Letter,
     the ORIGINAL tax receipt, our calculation sheet (no estimate, no task order);
   - drawings are uploaded (they are in Smartsheet already), not requested;
   - the sign sticker is placed by our inspectors: no vendor email;
   - work starts at Substantial/Finishes; Structure is the early heads-up;
   - when the PA issues the PCOC, Leslie starts the use permit. */
function caseOfRow(r){ return G.cases.filter(function(c){ return c.cs===r.cs; })[0]||null; }
/* replaces page 177's count, which counted estimate + task order */
function dofOf(r){ var c=caseOfRow(r), n=0; if(r.d1||r.l1)n++; if(c&&c.fal)n++; if(r.d3||r.l3)n++; if(r.sheet)n++; return n; }
/* replaces page 177's print-pack contents: the 4 papers the town asks for */
function ITEMS(r){
  var c=caseOfRow(r);
  return [
    {n:'Notificacion de Enmienda al Permiso', lk:r.l1||'', qb:r.d1?('/up/'+TID+'/a/r'+r.rid+'/e46/v0'):''},
    {n:'Final Acceptance Letter', lk:'', qb:(c&&c.fal)?('/up/'+CT+'/a/r'+c.rid+'/e24/v0'):''},
    {n:'Recibo de arbitrios original', lk:r.l3||'', qb:r.d3?('/up/'+TID+'/a/r'+r.rid+'/e48/v0'):''},
    {n:'Calculo de arbitrios y patentes', lk:'', qb:r.sheet?('/up/'+TID+'/a/r'+r.rid+'/e66/v0'):''}
  ];
}
/* page 177's mailSync() minus the automatic sign-sticker email */
function mailSync(){
  var jobs=[];
  G.cases.forEach(function(c){
    var inner='';
    Object.keys(KSTAMP).forEach(function(kind){ var k=KSTAMP[kind], m=lastMail(c,kind);
      if(m&&m.st==='Sent'&&!c[k]){ c[k]=m.sent||gtoday(); inner+='<field fid="'+CF[k]+'">'+gmdy(c[k])+'</field>'; } });
    if(inner){ var ns=derive(c); if(ns!==c.stage){ inner+='<field fid="10">'+esc(ns)+'</field><field fid="11">'+gmdy(gtoday())+'</field>'; c.stage=ns; }
      jobs.push(xml2(CT,'API_EditRecord','<rid>'+c.rid+'</rid>'+inner)); }
  });
  return Promise.all(jobs).then(function(){ return jobs.length; });
}

/* The Final Acceptance Letter is asked of the PMs directly, with a plain
   email and no attachments (Priscilla, 2026-10-06). Recipient: Settings fid 78. */
function mFAL(c){
  var body='Hello,\n\nWe are ready for the construction permit amendment on '+c.cs+'. Please send us the Final Acceptance Letter for the case, so we can pay the municipal taxes.\n\n'
    +caseHead(c)+'\nThank you,\nByrdson Services, LLC';
  return qmail(c,KIND.fal,G.set.falTo,'','Final Acceptance Letter - '+c.cs,body,[]);
}

/* The next things to do, in Priscilla's words: page 177's list, reworded. */
PC.next=function(c){
  var m=missing(c)||[], s=stOf(c), out=[];
  m.forEach(function(t){
    if(/Mark in Canopy/.test(t)) return;
    if(/^Press "Email Harold/.test(t)) t='Upload Harold\'s revised drawings (they should already be in Smartsheet).';
    else if(/^Press "Order the sign sticker"/.test(t)) t='Ask the inspectors to put a sticker with the new permit number on the job sign.';
    else if(/^Press "Ask for the Final Acceptance Letter"/.test(t)) t='Ask the PMs for the Final Acceptance Letter.';
    else if(/^Go to the town and pay/.test(t)) t='Go to the town and pay. Put in the date and what they charged.';
    else if(/in Step 1, box 1\.?$/.test(t)) t=t.replace(/in Step 1, box 1\.?$/,'here (Scope file).');
    else if(/Amendment closed on/.test(t)) t='When the PA issues the PCOC (final construction permit), put the date in "PCOC issued on".';
    out.push(t);
  });
  if(s&&s.k==='A'&&!c.fal&&!c.falReq) out.push('Ask the PMs for the Final Acceptance Letter now, so it is here when the town needs it.');
  if(s&&s.k==='C'&&!rowsOf(c).some(function(r){ return r.sheet; })) out.splice(Math.max(0,out.length-1),0,'Build the calculation sheet.');
  if(s&&s.k==='E'&&!out.length) out.push('When the PA issues the PCOC (final construction permit), put the date in "PCOC issued on".');
  return out;
};

/* Canopy milestones from the Jobs table (read only): Structure is the
   heads-up, Substantial/Finishes is when the amendment work starts. */
G.ms={};
function msDate(v){
  var best=''; String(v||'').replace(/(\d{1,2})\/(\d{1,2})\/(\d{4})/g,function(_,d,m,y){
    var iso=y+'-'+('0'+m).slice(-2)+'-'+('0'+d).slice(-2); if(iso>best) best=iso; return _; });
  return best;
}
PC.loadMilestones=function(){
  var seen={}; S.rows.forEach(function(r){ if(r.job) seen[r.job]=1; });
  var ids=Object.keys(seen), chunks=[];
  for(var i=0;i<ids.length;i+=60) chunks.push(ids.slice(i,i+60));
  return Promise.all(chunks.map(function(ch){
    return xml2('buskqh27b','API_DoQuery','<query>'+ch.map(function(id){ return '{3.EX.'+id+'}'; }).join('OR')+'</query><clist>3.1365.1231.1366.1127</clist><fmt>structured</fmt><options>num-500</options>')
      .then(function(d){ recs(d).forEach(function(o){
        var goal=String(o['1127']||'').split(/\n/).filter(Boolean).pop()||'';
        G.ms[o.rid]={structure:msDate(o['1365']),substantial:msDate(o['1231'])||msDate(o['1366']),goal:goal};
      }); });
  })).catch(function(e){ console.warn('milestones',e); });
};
PC.msOf=function(c){ var r=rowsOf(c).filter(function(x){ return x.job; })[0]; return (r&&G.ms[r.job])||{}; };

PC.buildSheet=function(rid){
  var c=caseByRid(rid), r=c&&rowsOf(c)[0]; if(!r) return Promise.reject(new Error('This case has no amendment rows.'));
  return buildSheet(r).then(function(){ emit('change'); });
};
PC.buildPack=function(rid){
  var c=caseByRid(rid), r=c&&rowsOf(c)[0]; if(!r) return Promise.reject(new Error('This case has no amendment rows.'));
  return buildPack(r).then(function(res){ emit('change'); return res||{}; });
};

/* Hand-off to Leslie for the use permit, through the Outbox like every other email. */
var HANDOFF='PCOC Use Permit Handoff';
PC.handoffKind=HANDOFF;
PC.handoff=function(rid,to){
  var c=caseByRid(rid); if(!c) return Promise.reject(new Error('Case not found.'));
  if(!to) return Promise.reject(new Error('Type Leslie\'s email first.'));
  var r1=rowsOf(c).filter(function(r){ return r.d1; })[0];
  var body='Hi Leslie,\n\nThe permit amendment for '+c.cs+' is done. The PA issued the PCOC'+(c.closed?' on '+us(c.closed):'')+', so the use permit can start.\n\n'
    +caseHead(c)+(c.pcoc?'New permit number (PCOC): '+c.pcoc+'\n':'')+(c.paid?'Amendment taxes paid: '+us(c.paid)+'\n':'')
    +'\nThe papers are in the case folder in Drive (05 Permits / Amendment).\n\nThank you,\nByrdson Services PCOC team';
  return qmail(c,HANDOFF,to,'','PCOC listo, puede empezar el permiso de uso - '+c.cs,body,[r1?qurl(TID,r1.rid,46):null].filter(Boolean))
    .then(function(st){ emit('change'); return st; });
};

/* ===== Document fixes found on the PR-BR-50443 dry run (2026-10-07) ===== */

/* Cost Estimate: leave out lines worth nothing, as the Permitting Helper does
   (office request, 2 Oct 2026). The total is unchanged. */
function estLines(rows){ return window.__p177.estLines(rows).filter(function(r){ return !!r.rcv; }); }

/* Narrative: page 177's text, corrected where it reads wrong. */
function narrativeBlocks(c,J,ch){
  var B=window.__p177.narrativeBlocks(c,J,ch), r0=rowsOf(c)[0]||{};
  B.forEach(function(b){
    /* "structure with located on a 779-square-meter lot" when only the lot is known */
    b.s=String(b.s).replace(' with located on a ',' located on a ').replace(', located on a ',' and located on a ');
  });
  /* 1.3 needs at least one change listed. The "Xactimate Scope Import" export
     does not mark replaced lines, so list the case's approved scope changes. */
  var h=B.findIndex(function(b){ return b.t==='h'&&/^1\.3 /.test(b.s); }), next=B.findIndex(function(b,i){ return i>h&&b.t==='h'; });
  if(h>=0){
    var end=next<0?B.length:next, bullets=B.slice(h+1,end).filter(function(b){ return b.t==='b'; }).length;
    if(!bullets){
      var list=rowsOf(c).filter(function(r){ return /^\d+$/.test(String(r.sc||'')); }).sort(function(a,b){ return String(a.appr).localeCompare(String(b.appr)); })
        .map(function(r){ return {t:'b',s:'Program scope change '+r.sc+(r.typ?' ('+r.typ+')':'')+(r.appr?', approved '+longDate(r.appr):'')+'.'}; });
      if(!list.length) list=[{t:'b',s:'The approved scope changes are itemized in the revised Cost Estimate.'}];
      B.splice.apply(B,[h+2,0].concat(list));
    }
    /* "increased … an increase of $-9,932.92" when the cost went down */
    var amt=Number(r0.amt)||((Number(r0.connow)||0)-(Number(r0.atpermit)||0));
    B.forEach(function(b){
      if(b.t==='p'&&/^As a result of these approved changes/.test(b.s)){
        b.s='As a result of these approved changes, the construction cost '+(amt<0?'decreased':'increased')+' from '+money(r0.atpermit)+' at the time of the permit to '+money(r0.connow)+', '+(amt<0?'a decrease of ':'an increase of ')+money(Math.abs(amt))+'.';
      }
    });
  }
  return B;
}

/* Read the scope file on a case (Xactimate PDF, Canopy export, or the
   "Xactimate Scope Import" .xls) without saving anything: the line items,
   what the estimate leaves out, and the construction total against Canopy. */
PC.readScope=function(rid){
  var c=caseByRid(rid); if(!c) return Promise.reject(new Error('Case not found.'));
  if(!c.scx) return Promise.reject(new Error('There is no scope file on this case yet.'));
  var r0=rowsOf(c)[0]||{};
  return qfetch('/up/'+CT+'/a/r'+c.rid+'/e53/v0')
    .then(function(x){ if(!x.ok) throw new Error('The scope file could not be opened ('+x.status+').'); return x.arrayBuffer(); })
    .then(function(buf){ return parseScopeFile(buf); })
    .then(function(rows){
      var kept=estLines(rows), keptSet=new Set(kept);
      var total=estTotal(rows), now=r0.connow||0, atp=r0.atpermit||0;
      return {
        file:c.scx, rows:rows.map(function(r){ return {grp:r.grp,desc:r.desc,qty:r.qty,unit:r.unit,uc:r.uc,rcv:r.rcv,rev:!!r.rev,kept:keptSet.has(r),why:keptSet.has(r)?'':(isTax(r)?'Taxes':isSoft(r)?'Soft costs':r.rev?'Revised (old line)':'')}; }),
        total:total, canopyNow:now, atPermit:atp, diff:Math.round((total-now)*100)/100,
        cls:sfClass(total,r0), changes:changes(rows).length
      };
    });
};

PC.view=function(u,title){ return viewFile(u,title); };
PC.STAGE_LIMIT={A:14,B:21,C:14,D:10,E:30};

window.PCOC=PC;
window.G=G;

/* ---------- Intake rule (no table changes) ----------
   A case at "A · Prepare request" is still in INTAKE until someone presses
   Start 1 · Prepare. Start writes a dated first line into the case's Stage
   Note (fid 43); the rest of the note stays the team's own text. A case that
   already has Step 1 work on it counts as started too.
   Start is allowed only when the construction cost went UP, Structure passed
   (rebuilt houses) and Substantial/Finishes passed. */
var INTAKE_MARK=/^Started 1 \u00b7 Prepare on [^\n]*\n?/m;
var INTAKE_STG={k:'I',n:'Intake',l:'Intake',h:'Priscilla',d:'New scope change: decide whether to start 1 \u00b7 Prepare.'};
PC.markOf=function(c){ var m=String(c.note||'').match(INTAKE_MARK); return m?m[0].trim():''; };
PC.noteText=function(c){ return String(c.note||'').replace(INTAKE_MARK,'').replace(/^\n+/,''); };
PC.noteSave=function(c,txt){ var m=PC.markOf(c); return m?(m+(txt?'\n'+txt:'')):(txt||''); };
function stepWork(c){ return !!(c.narr||c.estChk||c.drwReq||c.drwRec||c.falReq||c.scopeReq||c.sentPA||rowsOf(c).some(function(r){ return r.estOn; })); }
function amtOf(c){ return rowsOf(c).reduce(function(t,r){ return t+(Number(r.amt)||0); },0); }
function structOk(c){ return rowsOf(c).some(function(r){ return r.sp; })||!!PC.msOf(c).structure; }
PC.isIntake=function(c){
  if(!rowsOf(c).length) return false;
  if(c.stage==='A \u00b7 Prepare request') return !PC.markOf(c)&&!stepWork(c);
  if(c.stage==='Refund owed to us'||c.stage==='Finished \u00b7 confirm with Priscilla') return true;
  if(c.stage==='Waiting \u00b7 Structure not passed') return structOk(c);
  return false;
};
PC.canStart=function(c){
  var a=amtOf(c);
  if(a<0) return {ok:false,why:'Cost went down. Refunds need their own path (not decided yet).'};
  if(Math.abs(a)<0.005) return {ok:false,why:'No cost change. Mark it Not required.'};
  if(c.fam==='RECON'&&!structOk(c)) return {ok:false,why:'Waiting for Structure.'};
  if(!PC.msOf(c).substantial) return {ok:false,why:'Waiting for Substantial/Finishes.'};
  return {ok:true,why:''};
};
PC.start=function(rid){
  var c=caseByRid(rid); if(!c) return Promise.reject(new Error('Case not found.'));
  var q=PC.canStart(c); if(!q.ok) return Promise.reject(new Error(q.why));
  var rest=PC.noteText(c), note='Started 1 \u00b7 Prepare on '+us(gtoday())+'.'+(rest?'\n'+rest:'');
  return xml2(CT,'API_EditRecord','<rid>'+c.rid+'</rid><field fid="43">'+esc(note)+'</field>')
    .then(function(){ c.note=note; return PC.decide(rid,'amend'); });
};
/* An unstarted Step 1 case reads as Intake everywhere, so the Step 1
   automations (scope request email, auto-built papers) leave it alone. */
function stOf(c){ var s=window.__p177.stOf(c); return (s&&s.k==='A'&&PC.isIntake(c))?INTAKE_STG:s; }
