import {inspectProduct,proposeChanges,validateProposal,executeApproved} from "./engine.js?v=2";
import {BATCH_SCHEMA_VERSION,sampleImports,validateBatchImport} from "./batch-schema.js?v=1";

const initialProducts=[
 {sku:"DEMO-1042",brand:"Northwind",title:"Reusable Air Filter",workflow:"CMS + Properties",checks:7,total:7,status:"Ready",category:null,description:null,image:true,attributes:{material:"cotton",reusable:true},marketplaceReady:false},
 {sku:"DEMO-1846",brand:"Apex",title:"Performance Oil Filter",workflow:"Full setup",checks:6,total:7,status:"Review",category:null,description:null,image:true,attributes:{material:"synthetic",reusable:true},marketplaceReady:false},
 {sku:"DEMO-2207",brand:"Veloce",title:"Cabin Filter Carbon",workflow:"Images + CMS",checks:5,total:7,status:"Review",category:null,description:null,image:true,attributes:{material:"carbon",reusable:true},marketplaceReady:false},
 {sku:"DEMO-3118",brand:"Northwind",title:"Air Intake Element",workflow:"Compatibility",checks:4,total:7,status:"Blocked",conflict:"Fitment evidence conflicts across two synthetic sources",category:null,description:null,image:true,attributes:{material:"cotton",reusable:true},marketplaceReady:false},
 {sku:"DEMO-4091",brand:"Apex",title:"Hydraulic Filter",workflow:"CMS + CSE",checks:7,total:7,status:"Ready",category:null,description:null,image:true,attributes:{material:"synthetic",reusable:true},marketplaceReady:false},
 {sku:"DEMO-5130",brand:"Veloce",title:"Fuel Filter Insert",workflow:"Full setup",checks:7,total:7,status:"Ready",category:null,description:null,image:true,attributes:{material:"paper",reusable:true},marketplaceReady:false}
];
let products=JSON.parse(localStorage.getItem("forgeOpsProducts")||JSON.stringify(initialProducts));
let historyData=JSON.parse(localStorage.getItem("forgeOpsHistory")||"[]");
const titles={overview:"About the demo",workspace:"7 · EDIT",images:"1 · IMG / Photos",content:"2 · CMS",properties:"3 · Properties",compatibility:"5 · Compatibility",batch:"Inputs · JSON batch",auditor:"BO Auditor",architecture:"System architecture",history:"History",backoffice:"6 · Simulated BO Bind"};
const $=q=>document.querySelector(q), $$=q=>[...document.querySelectorAll(q)];
let selected;
let boState={product:null,proposal:null,loaded:false};
let batchImport=null;
let auditRun=null;
let selectedFinding=null;
let intakeProduct=null;
let batchRunControl=null;
const persist=()=>{localStorage.setItem("forgeOpsProducts",JSON.stringify(products));localStorage.setItem("forgeOpsHistory",JSON.stringify(historyData))};
const currentProduct=()=>selected||products[0];
const productProfiles={
 "DEMO-1042":{fitment:"VW Golf VII · 1.6 TDI · 2015–2019 · 287 × 176 × 35 mm",vehicles:[["Ready","Volkswagen Golf VII","1.6 TDI","2015–2019","98%"],["Ready","Audi A3 8V","1.6 TDI","2016–2020","96%"],["Review","SEAT Leon","1.6 TDI","2014–2018","72%"]]},
 "DEMO-1846":{fitment:"Apex PN-1846 · thread M20 × 1.5 · Ø 76 mm",vehicles:[["Ready","Volkswagen Passat B8","2.0 TDI","2015–2020","97%"],["Ready","Škoda Octavia III","2.0 TDI","2014–2020","95%"],["Review","Audi A4 B9","2.0 TDI","2016–2020","74%"]]},
 "DEMO-2207":{fitment:"Cabin filter bay · 280 × 205 × 30 mm",vehicles:[["Ready","BMW 3 Series F30","320d","2012–2018","96%"],["Review","BMW 4 Series F32","420d","2013–2020","78%"],["Review","BMW X3 F25","20d","2011–2017","69%"]]},
 "DEMO-3118":{fitment:"Conflicting source evidence · intake dimensions disagree",vehicles:[["Review","Volkswagen Golf VII","1.4 TSI","2014–2018","58%"],["Review","Audi A3 8V","1.4 TFSI","2013–2017","54%"],["Blocked","Škoda Octavia III","1.4 TSI","2014–2018","41%"]]},
 "DEMO-4091":{fitment:"Hydraulic return-line filter · 25 μm",vehicles:[["Ready","JCB 3CX","Diesel","2015–2021","94%"],["Review","CAT 428F","Diesel","2014–2019","71%"]]},
 "DEMO-5130":{fitment:"Fuel housing insert · 2.0 TDI family",vehicles:[["Ready","Audi A3 8V","2.0 TDI","2014–2020","97%"],["Ready","SEAT Leon III","2.0 TDI","2013–2020","95%"],["Review","Volkswagen Tiguan II","2.0 TDI","2016–2021","73%"]]}
};
const copyProfiles={
 "DEMO-1042":{partNumber:"NW-1042",oem:"SYN-1K0-129-620",model:"Reusable intake element"},
 "DEMO-1846":{partNumber:"APX-1846",oem:"SYN-06J-115-403",model:"Performance spin-on filter"},
 "DEMO-2207":{partNumber:"VEL-2207",oem:"SYN-64-11-9-272-164",model:"Activated-carbon cabin element"},
 "DEMO-3118":{partNumber:"NW-3118",oem:null,model:"Air intake element"},
 "DEMO-4091":{partNumber:"APX-4091",oem:"SYN-32-925359",model:"Hydraulic return-line element"},
 "DEMO-5130":{partNumber:"VEL-5130",oem:"SYN-3Q0-127-177",model:"Fuel housing insert"}
};
const preparedPreviews=new Map();
const workbenchPreviews=new Map();
const workbenchHistory=new Map();
function ops(p){
 if(!p.ops){p.ops={assets:{imported:false,lookup:false,processed:false,staged:false,selected:"MAIN"},content:{language:"EN",staged:false},properties:{normalized:false},fitment:{refreshed:false,staged:false}}}
 return p.ops;
}
function filterType(p){return /oil/i.test(p.title)?"Oil Filter":/cabin/i.test(p.title)?"Cabin Filter":/fuel/i.test(p.title)?"Fuel Filter":/hydraulic/i.test(p.title)?"Hydraulic Filter":"Air Filter"}
function moduleStatus(p){const state=ops(p);return {assets:state.assets.staged?"Staged":state.assets.processed?"Checked":"Pending",content:state.content.staged?"Staged":"Draft",properties:state.properties.normalized?"Normalized":"Raw",fitment:p.conflict?"Blocked":state.fitment.staged?"Staged":"Review"}}
function renderModuleContext(){renderImages();renderContent();renderProperties();renderCompatibility()}

function toast(message){const el=$("#toast");el.textContent=message;el.classList.add("show");clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>el.classList.remove("show"),2100)}
function record(type,message,status="Ready"){
 historyData.unshift({time:new Date().toLocaleTimeString("en-GB"),type,message,status});
 historyData=historyData.slice(0,30);persist();renderHistory();activity(type,message);
}
function renderHistory(){
 const list=$("#historyList");if(!list)return;
 list.innerHTML=historyData.length?historyData.map(item=>`<div class="history-entry"><time>${item.time}</time><strong>${item.type}</strong><span>${item.message}</span>${pill(item.status)}</div>`).join(""):'<div class="empty">No actions in this session yet.</div>';
}
function renderMetrics(){
 const done=products.filter(p=>p.marketplaceReady).length;
 const review=products.filter(p=>p.status==="Review"||p.status==="Blocked").length;
 $("#metricQueue").textContent=products.length-done;
 $("#metricCompleted").textContent=148+done;
 $("#metricValidation").textContent=`${Math.max(90,96.8-review*.8).toFixed(1)}%`;
 $("#metricReview").textContent=review;
}
function refresh(){
 persist();renderRows();renderMetrics();renderBatch();renderAudit();renderHistory();renderIntake();
 if(selected)renderInspector();renderModuleContext();
}
function setView(id){$$(".view").forEach(v=>v.classList.toggle("active",v.id===id));$$(".nav").forEach(n=>n.classList.toggle("active",n.dataset.view===id));$("#viewTitle").textContent=titles[id];history.replaceState(null,"",`#${id}`);scrollTo({top:0,behavior:"smooth"})}
$$(".nav").forEach(n=>n.onclick=()=>setView(n.dataset.view));
$("#theme").onclick=()=>document.documentElement.classList.toggle("light");
$$(".action").forEach(b=>b.onclick=()=>toast(b.dataset.message));
$$(".languages button").forEach(b=>b.onclick=()=>{b.parentElement.querySelectorAll("button").forEach(x=>x.classList.remove("active"));b.classList.add("active");toast(`${b.textContent} content loaded`)});
$("#openWorkspace").onclick=()=>setView("workspace");
$("#overviewArchitecture").onclick=()=>setView("architecture");

const pill=s=>`<span class="pill ${s.toLowerCase()}">${s.toUpperCase()}</span>`;
function renderRows(){
 const q=$("#search").value.toLowerCase(),filter=$("#statusFilter").value;
 const rows=products.filter(p=>(filter==="all"||p.status===filter)&&`${p.sku} ${p.brand} ${p.title}`.toLowerCase().includes(q));
 $("#productRows").innerHTML=rows.map(p=>`<tr data-sku="${p.sku}" class="${selected?.sku===p.sku?"selected":""}"><td><strong>${p.sku}</strong><small>${p.brand} · ${p.title}</small></td><td>${p.workflow}</td><td><span class="bar"><i style="width:${p.checks/p.total*100}%"></i></span>${p.checks}/${p.total}</td><td>${pill(p.status)}</td></tr>`).join("");
 $$("#productRows tr").forEach(r=>r.onclick=()=>{selected=products.find(p=>p.sku===r.dataset.sku);renderRows();renderInspector();renderModuleContext()});
}
$("#search").oninput=renderRows;$("#statusFilter").onchange=renderRows;

function renderInspector(){
 const p=selected,inspection=inspectProduct(p);
 $("#inspectSku").textContent=p.sku;$("#inspectStatus").textContent=p.status.toUpperCase();$("#inspectStatus").className=`pill ${p.status.toLowerCase()}`;
 $("#inspectBody").className="";
 $("#inspectBody").innerHTML=`<div class="summary"><strong>${p.brand} ${p.title}</strong><span>${p.workflow} · ${inspection.complete}/${inspection.total} engine checks</span></div><div class="mini"><div><span>Input evidence</span><b>${p.conflict?"CONFLICT":"COMPLETE"}</b></div><div><span>Schema validation</span><b>PASS</b></div><div><span>Write permission</span><b>NOT GRANTED</b></div></div><div class="proposal-actions"><button id="openBO">Open simulated BO</button><button id="makeProposal" class="accent">Build proposal</button></div><div id="proposal"></div>`;
 $("#openBO").onclick=()=>openBackOffice(p);
 $("#makeProposal").onclick=()=>buildProposal(p);
}
function buildProposal(p){
 const proposal=proposeChanges(p),box=$("#proposal");
 if(proposal.status==="blocked"){box.innerHTML=`<div class="callout" style="border-color:var(--red)"><strong>Stopped safely</strong><span>${proposal.reason}. No write proposed.</span></div>`;$("#inspectStatus").textContent="BLOCKED";toast("Ambiguous evidence — stopped safely");return}
 const valid=validateProposal(p,proposal).ok;
 const currentValue=field=>field==="marketplaceReady"?String(p.marketplaceReady):(p[field]||"Missing");
 box.innerHTML=`<div class="proposal"><h3>PROPOSED OPERATIONS · ${valid?"VALID":"INVALID"}</h3><div class="diff"><div class="diff-head"><span>FIELD</span><span>CURRENT</span><span>PROPOSED</span></div>${proposal.operations.map(op=>`<div class="diff-row"><span>${op.field}</span><del>${currentValue(op.field)}</del><ins>${op.value}</ins></div>`).join("")}</div>${proposal.operations.map(op=>`<div class="operation"><span>${op.field} · ${op.reason}</span><b>${op.value}</b></div>`).join("")}<div class="proposal-actions"><button id="reject">Reject</button><button id="approve" class="accent">Approve & open BO</button></div></div>`;
 $("#inspectStatus").textContent="AWAITING APPROVAL";$("#inspectStatus").className="pill review";
 $("#reject").onclick=()=>{box.innerHTML='<div class="callout"><strong>Rejected</strong><span>Operator declined. Zero writes executed.</span></div>';record("REJECTED",`${p.sku} proposal rejected by operator.`,"Review");toast("Proposal rejected")};
 $("#approve").onclick=()=>{boState={product:p,proposal,loaded:false};record("APPROVED",`${p.sku} proposal approved; awaiting controlled BO execution.`,"Review");openBackOffice(p);toast("Approved proposal opened in simulated BO")};
}
function activity(type,message){$("#activity").insertAdjacentHTML("afterbegin",`<div><time>${new Date().toLocaleTimeString("en-GB")}</time><b class="${type==="VERIFIED"?"green":""}">${type}</b><span>${message}</span></div>`)}
function workflowDefinition(p){
 const type=filterType(p),definitions={
  "Oil Filter":{mode:"OIL FILTER SETUP",lead:"Images → structured copy → properties → fitment review",checks:["Resolution","Part / OEM","Thread evidence","Fitment"] ,view:"images"},
  "Cabin Filter":{mode:"CABIN FILTER SETUP",lead:"Images → carbon/material properties → multilingual copy",checks:["Resolution","Dimensions","Material","Category"],view:"images"},
  "Fuel Filter":{mode:"FUEL FILTER SETUP",lead:"Properties → housing evidence → compatibility review",checks:["Part number","Housing","Fitment","Content"],view:"properties"},
  "Hydraulic Filter":{mode:"HYDRAULIC FILTER SETUP",lead:"Technical properties → category → controlled content",checks:["Micron rating","Category","Image","Content"],view:"properties"},
  "Air Filter":{mode:"AIR FILTER SETUP",lead:"Images → dimensions → copy template → fitment review",checks:["Resolution","Dimensions","Material","Fitment"],view:"images"}
 };
 return {...definitions[type],type};
}
function renderIntake(){
 const state=$("#intakeState"),recordBox=$("#intakeRecord"),route=$("#workflowRoute"),evidence=$("#intakeEvidence"),p=intakeProduct;
 if(!p){state.textContent="AWAITING CODE";state.className="pill neutral";recordBox.className="intake-record empty";recordBox.textContent="Enter a product code to inspect the input record.";route.className="workflow-route empty";route.textContent="A route appears only after the product is read and classified.";evidence.textContent="The public demo uses a synthetic, read-only catalog adapter. No ERP or Back Office is queried.";return}
 const flow=workflowDefinition(p),inspection=inspectProduct(p),profile=copyProfiles[p.sku];
 state.textContent=p.conflict?"EVIDENCE CONFLICT":"ROUTE READY";state.className=`pill ${p.conflict?"blocked":"ready"}`;
 evidence.innerHTML=`<strong>Synthetic catalog adapter · read-only.</strong> Record ${p.sku} was loaded into the workspace. ${p.conflict?"A conflicting evidence flag is carried into the router; no automatic route is executable.":"Classification derives from visible product type and required evidence."}`;
 recordBox.className="intake-record";recordBox.innerHTML=`<div class="record-head"><div><strong>${p.sku} · ${p.brand}</strong><small>${p.title}</small></div>${pill(p.status)}</div><div class="intake-facts">${Object.entries({"Detected type":flow.type,"Part number":profile.partNumber,"OEM availability":profile.oem||"Not supplied","Required checks":`${inspection.complete}/${inspection.total} core`}).map(([key,value])=>`<div class="intake-fact"><span>${key}</span><strong>${value}</strong></div>`).join("")}</div>`;
 route.className="workflow-route";
 route.innerHTML=p.conflict?`<span>STOP CONDITION</span><h3>Manual evidence review required</h3><p>${p.conflict}. The router refuses to select an executable workflow or create a proposal.</p><div class="route-actions"><button data-open-view="compatibility">Open compatibility evidence</button><button data-open-view="workspace">Keep in workspace</button></div>`:`<span>RECOMMENDED MODE</span><h3>${flow.mode}</h3><p>${flow.lead}</p><div class="route-checks">${flow.checks.map(check=>`<span>${check}</span>`).join("")}</div><div class="route-actions"><button class="accent" data-open-view="${flow.view}">Open recommended module</button><button data-open-view="content">Open copy workflow</button><button data-open-view="workspace">Keep in workspace</button></div>`;
 $$("#workflowRoute [data-open-view]").forEach(button=>button.onclick=()=>setView(button.dataset.openView));
}
function lookupProduct(){
 const code=$("#productLookup").value.trim().toUpperCase();
 if(!code){toast("Enter a demo product code");return}
 const p=products.find(product=>product.sku===code);
 if(!p){intakeProduct=null;$("#intakeState").textContent="NOT FOUND";$("#intakeState").className="pill blocked";$("#intakeEvidence").innerHTML=`<strong>No synthetic record for ${code}.</strong> The adapter reads a fixed public catalog and does not infer unknown products.`;$("#intakeRecord").className="intake-record empty";$("#intakeRecord").textContent="No matching demo product.";$("#workflowRoute").className="workflow-route empty";$("#workflowRoute").textContent="No workflow can be selected for an unknown input.";toast("Product code not found");return}
 intakeProduct=p;selected=p;renderRows();renderInspector();renderModuleContext();renderIntake();record("PRODUCT_INTAKE_READ",`${p.sku}: synthetic read-only record loaded and classified as ${workflowDefinition(p).mode}.`,p.conflict?"Review":"Ready");toast(p.conflict?"Product loaded with evidence conflict":"Product classified and routed")
}
$("#lookupProduct").onclick=lookupProduct;$("#productLookup").onkeydown=event=>{if(event.key==="Enter")lookupProduct()};$$('.lookup-sample').forEach(button=>button.onclick=()=>{$("#productLookup").value=button.dataset.sku;lookupProduct()});
$("#buildBatch").onclick=()=>{setView("batch");toast("Batch proposal built from safe items")};

function imageCandidates(p){
 const type=filterType(p),state=ops(p).assets;
 if(state.liveError)return [];
 if(state.liveCandidates?.length)return state.liveCandidates;
 return [
  ["MAIN",`${p.sku}_main_1600.jpg`,1600,1600,state.processed?"PASS":"PENDING","Primary product view"],
  ["ALT 01",`${p.sku}_detail_1400.jpg`,1400,1400,state.processed?"PASS":"PENDING","Detail / media evidence"],
  ["ALT 02",`${p.sku}_pack_1200.jpg`,1200,1200,state.processed?"PASS":"PENDING","Packaging evidence"],
  ["REJECT",`${p.sku}_supplier_800.jpg`,800,800,state.processed?"REJECT":"PENDING","Below minimum resolution"],
  ["REVIEW",`${p.sku}_context_1200.jpg`,1200,900,state.processed?"REVIEW":"PENDING","Non-square contextual image"]
 ].map(x=>({type,label:x[0],file:x[1],width:x[2],height:x[3],dimensions:`${x[2]} × ${x[3]}`,decision:x[4],reason:x[5],source:"Synthetic fixture"}));
}
function stripHtml(value=""){return value.replace(/<[^>]*>/g,"").replace(/\s+/g," ").trim()}
function imageDecision(candidate){
 const ratio=candidate.width/candidate.height,min=Math.min(candidate.width,candidate.height);
 if(min<1000)return ["REJECT","Below 1000 px minimum"];
 if(Math.abs(1-ratio)>.18)return ["REVIEW","Non-square source requires crop review"];
 return ["PASS","Meets source resolution and framing thresholds"];
}
async function searchCommons(p){
 const state=ops(p).assets,query=`${filterType(p)} automotive`;
 const params=new URLSearchParams({action:"query",format:"json",formatversion:"2",generator:"search",gsrsearch:query,gsrnamespace:"6",gsrlimit:"8",prop:"imageinfo|info",inprop:"url",iiprop:"url|size|extmetadata",iiurlwidth:"1200",origin:"*"});
 const response=await fetch(`https://commons.wikimedia.org/w/api.php?${params}`);
 if(!response.ok)throw new Error(`Source returned ${response.status}`);
 const payload=await response.json();
 const candidates=(payload.query?.pages||[]).map((page,index)=>{
  const info=page.imageinfo?.[0];if(!info?.url)return null;
  const candidate={label:index===0?"MAIN":`ALT ${String(index).padStart(2,"0")}`,file:page.title.replace(/^File:/,""),width:info.width,height:info.height,dimensions:`${info.width} × ${info.height}`,url:info.thumburl||info.url,originalUrl:info.url,sourceUrl:info.descriptionurl||page.fullurl,source:"Wikimedia Commons",license:stripHtml(info.extmetadata?.LicenseShortName?.value||"See source"),author:stripHtml(info.extmetadata?.Artist?.value||"Commons contributor")};
  [candidate.decision,candidate.reason]=imageDecision(candidate);return candidate;
 }).filter(Boolean);
 if(!candidates.length)throw new Error("No usable image files returned");
 state.liveCandidates=candidates;state.source={name:"Wikimedia Commons",query,at:new Date().toLocaleTimeString("en-GB")};state.lookup=true;state.liveError="";state.selected=candidates[0].label;
}
function previewKey(p,candidate){return `${p.sku}:${candidate.label}`}
async function prepareSquarePreview(p,candidate){
 const target=1200,image=new Image();image.crossOrigin="anonymous";
 await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error("Preview image could not be loaded"));image.src=candidate.url});
 const canvas=document.createElement("canvas");canvas.width=target;canvas.height=target;
 const scale=Math.max(target/image.naturalWidth,target/image.naturalHeight),width=image.naturalWidth*scale,height=image.naturalHeight*scale;
 const context=canvas.getContext("2d");context.imageSmoothingEnabled=true;context.imageSmoothingQuality="high";context.fillStyle="#f6f4ef";context.fillRect(0,0,target,target);context.drawImage(image,(target-width)/2,(target-height)/2,width,height);
 preparedPreviews.set(previewKey(p,candidate),canvas.toDataURL("image/jpeg",.88));
 return {target:`${target} × ${target}`,method:Math.min(candidate.width,candidate.height)<target?"interpolated upscale + square crop (no AI detail generation)":"square crop from adequate source resolution"};
}
function workbenchKey(p,candidate){return `workbench:${p.sku}:${candidate.label}`}
function clearEdgeBackground(context,size,threshold){
 const image=context.getImageData(0,0,size,size),{data}=image,seen=new Uint8Array(size*size),queue=new Int32Array(size*size);let head=0,tail=0;
 const nearWhite=index=>data[index]>255-threshold&&data[index+1]>255-threshold&&data[index+2]>255-threshold;
 const add=(x,y)=>{const point=y*size+x,index=point*4;if(!seen[point]&&nearWhite(index)){seen[point]=1;queue[tail++]=point}};
 for(let x=0;x<size;x++){add(x,0);add(x,size-1)}for(let y=1;y<size-1;y++){add(0,y);add(size-1,y)}
 while(head<tail){const point=queue[head++],x=point%size,y=(point-x)/size,index=point*4;data[index]=246;data[index+1]=244;data[index+2]=239;data[index+3]=255;if(x)add(x-1,y);if(x<size-1)add(x+1,y);if(y)add(x,y-1);if(y<size-1)add(x,y+1)}
 context.putImageData(image,0,0);
}
async function buildWorkbenchPreview(p,candidate,config){
 const target=900,image=new Image();image.crossOrigin="anonymous";
 await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error("Source preview could not be loaded"));image.src=candidate.url});
 const canvas=document.createElement("canvas");canvas.width=target;canvas.height=target;const context=canvas.getContext("2d"),padding=target*(config.padding/100),inner=target-padding*2;
 const scale=Math.max(inner/image.naturalWidth,inner/image.naturalHeight),width=image.naturalWidth*scale,height=image.naturalHeight*scale;
 context.fillStyle="#f6f4ef";context.fillRect(0,0,target,target);context.drawImage(image,(target-width)/2,(target-height)/2,width,height);
 if(config.cleanup)clearEdgeBackground(context,target,config.threshold);
 const preview=canvas.toDataURL("image/jpeg",.9);workbenchPreviews.set(workbenchKey(p,candidate),preview);return preview;
}
function orderedCandidates(p,candidates){const state=ops(p).assets;if(!Array.isArray(state.order)||state.order.length!==candidates.length||state.order.some(label=>!candidates.some(candidate=>candidate.label===label)))state.order=candidates.map(candidate=>candidate.label);return state.order.map(label=>candidates.find(candidate=>candidate.label===label)).filter(Boolean)}
function renderWorkbench(){
 const p=currentProduct(),state=ops(p).assets,candidates=imageCandidates(p),selected=candidates.find(candidate=>candidate.label===state.selected)||candidates[0],config=state.workConfig||{padding:8,threshold:24,cleanup:false};
 $("#subjectPadding").value=config.padding;$("#paddingValue").textContent=`${config.padding}%`;$("#edgeThreshold").value=config.threshold;$("#thresholdValue").textContent=config.threshold;$("#edgeCleanup").checked=Boolean(config.cleanup);
 const preview=selected?.url?workbenchPreviews.get(workbenchKey(p,selected)):null,empty=$("#workbenchEmpty"),image=$("#workbenchPreview"),hasSource=Boolean(selected?.url);
 empty.textContent=hasSource?(preview?"":"Render a prepared preview for the selected live candidate."):"Search the live source and choose a candidate to unlock the workbench.";empty.style.display=preview?"none":"block";image.src=preview||"";image.classList.toggle("visible",Boolean(preview));
 $("#workbenchState").textContent=preview?"PREVIEW READY":hasSource?"READY TO PREP":"SOURCE REQUIRED";$("#workbenchState").className=`pill ${preview?"ready":hasSource?"review":"neutral"}`;
 $("#workbenchNote").innerHTML=hasSource?`<strong>Selected · ${selected.label} · ${selected.dimensions}</strong> Center framing uses ${config.padding}% padding. ${config.cleanup?`Edge-connected near-white pixels are replaced using threshold ${config.threshold}.`:"Edge cleanup is off."} This is browser-side preparation, not AI enhancement.`:"The workbench activates only for live candidates with browser-readable image data.";
 const ordered=orderedCandidates(p,candidates),main=state.main||ordered[0]?.label;
 $("#imageOrder").innerHTML=`<div class="order-list">${ordered.map((candidate,index)=>`<div class="order-row ${candidate.label===main?"main":""}"><span class="order-index">${String(index+1).padStart(2,"0")}</span><strong>${candidate.label}</strong><small>${candidate.label===main?"MAIN":"ALT"}</small></div>`).join("")}</div>`;
 [$("#applyImageEdits"),$("#makeMain"),$("#moveImageEarlier"),$("#moveImageLater")].forEach(button=>button.disabled=!hasSource);$("#undoImageEdits").disabled=!(workbenchHistory.get(workbenchKey(p,selected))||[]).length;
}
function renderImages(){
 const p=currentProduct(),state=ops(p).assets,candidates=imageCandidates(p);
 const live=Boolean(state.liveCandidates?.length);
 $("#imageContext").textContent=`Working product · ${p.sku} · ${filterType(p)} · ${state.staged?"upload proposal staged":state.processed?"quality review complete":live?"live source evidence loaded":"fixture preview"}`;
 $("#sourceState").textContent=state.lookup?`${state.source?.name||"Fixture"} · ${p.sku}`:"Awaiting SKU";
 $("#scrapeState").textContent=state.lookup?`${candidates.length} candidates found`:"0 candidates";
 const totals=candidates.reduce((acc,c)=>{acc[c.decision]=(acc[c.decision]||0)+1;return acc},{});
 $("#filterState").textContent=state.processed?`${totals.PASS||0} passed · ${totals.REVIEW||0} review · ${totals.REJECT||0} rejected`:"Not run";
 $("#uploadState").textContent=state.staged?"Proposal staged":state.imported?"Awaiting quality gate":"Not staged";
 $("#imageGrid").innerHTML=candidates.map((c,index)=>{const preview=preparedPreviews.get(previewKey(p,c));return `<div class="image ${state.imported&&c.decision==="PASS"?"done":""} ${state.selected===c.label?"selected":""} ${c.decision.toLowerCase()}" data-image="${c.label}">${c.url?`<img src="${preview||c.url}" alt="${c.file}">`:"<i></i>"}<small>${c.label} · ${c.dimensions}</small></div>`}).join("");
 $$("#imageGrid .image").forEach(card=>card.onclick=()=>{state.selected=card.dataset.image;record("ASSET_SELECTED",`${card.dataset.image} selected for ${p.sku}.`);renderImages();toast(`${card.dataset.image} selected`)});
 const selected=candidates.find(c=>c.label===state.selected)||candidates[0],workbenchReady=selected?.url&&workbenchPreviews.has(workbenchKey(p,selected));
 const checks=state.processed?[["pass",`Resolution ≥ 1000 px · ${totals.PASS||0} candidates`],[selected?.decision==="PASS"?"pass":"warn",`Selected asset · ${selected?.label||"none"} · ${selected?.decision||"pending"}`],[totals.REVIEW?"warn":"pass",`${totals.REVIEW||0} candidate(s) require crop review`],[totals.REJECT?"warn":"pass",`${totals.REJECT||0} candidate(s) rejected by resolution rule`],[state.transform?"pass":"warn",state.transform?`Prepared ${state.transform.target}: ${state.transform.method}`:`Select a pass candidate to prepare a 1200 × 1200 output`],[workbenchReady?"pass":"warn",workbenchReady?"Manual framing / edge-cleanup preview rendered":"Optional workbench preview not rendered"]]:[["warn","Candidate evidence not processed"],["warn","No image proposal available yet"]];
 $("#imageChecks").innerHTML=checks.map(([status,text])=>`<li class="${status}">${text}</li>`).join("");
 $("#imageCheckStatus").textContent=state.processed?"QUALITY REVIEW":"NOT RUN";$("#imageCheckStatus").className=`pill ${state.processed?"review":"neutral"}`;
 $("#imageEvidence").innerHTML=state.liveError?`<strong>Live source unavailable.</strong> ${state.liveError}`:live?`<strong>Live source · Wikimedia Commons.</strong> Query: ${state.source.query}. Each candidate retains dimensions, source page, author and licence metadata. <a href="${selected?.sourceUrl||"#"}" target="_blank" rel="noreferrer">Open selected source</a>`:"Use Search live source to retrieve real Commons candidates; the synthetic preview remains available only as a UI fallback.";
 renderWorkbench();
}
$("#imageDrop").onclick=()=>{const p=currentProduct(),state=ops(p).assets;state.imported=true;record("ASSETS_IMPORTED",`Synthetic asset set attached to ${p.sku}.`);renderImages();toast("Synthetic asset set imported")};
$("#findImages").onclick=async()=>{const p=currentProduct(),state=ops(p).assets;$("#findImages").disabled=true;$("#findImages").textContent="Searching Commons…";try{await searchCommons(p);record("LIVE_SOURCE_LOOKUP",`${p.sku}: Wikimedia Commons returned ${state.liveCandidates.length} real candidate files.`);renderImages();toast("Live source evidence loaded")}catch(error){state.lookup=false;state.liveError=`${error.message}. No candidate was substituted.`;renderImages();toast("Live source unavailable")}finally{$("#findImages").disabled=false;$("#findImages").textContent="Search live source"}};
$("#processImages").onclick=async()=>{const p=currentProduct(),state=ops(p).assets;if(!state.lookup){toast("Search a source first");return}const selected=imageCandidates(p).find(c=>c.label===state.selected);state.processed=true;if(selected?.decision==="PASS"&&selected.url){try{state.transform=await prepareSquarePreview(p,selected)}catch(error){state.transform={target:"metadata-only",method:`Preview transform unavailable: ${error.message}`}}record("IMAGE_FILTERS",`${p.sku}: evaluated live dimensions and prepared selected output policy.`);renderImages();toast("Quality gate completed")}else{record("IMAGE_FILTERS",`${p.sku}: selected candidate held back by quality rule.`,"Review");renderImages();toast("Select a passing candidate to prepare")}};
$("#stageImages").onclick=()=>{const p=currentProduct(),state=ops(p).assets;if(!state.processed){toast("Complete quality checks first");return}state.staged=true;record("IMAGES_STAGED",`${p.sku}: selected image set staged as a controlled upload proposal.`,"Review");refresh();toast("Image proposal staged")};
$("#prepareImageProposal").onclick=()=>$("#stageImages").click();
$("#subjectPadding").oninput=()=>$("#paddingValue").textContent=`${$("#subjectPadding").value}%`;
$("#edgeThreshold").oninput=()=>$("#thresholdValue").textContent=$("#edgeThreshold").value;
$("#applyImageEdits").onclick=async()=>{
 const p=currentProduct(),state=ops(p).assets,candidate=imageCandidates(p).find(item=>item.label===state.selected);if(!candidate?.url){toast("Choose a live candidate first");return}
 const key=workbenchKey(p,candidate),previous={...(state.workConfig||{padding:8,threshold:24,cleanup:false})},next={padding:Number($("#subjectPadding").value),threshold:Number($("#edgeThreshold").value),cleanup:$("#edgeCleanup").checked};
 const history=workbenchHistory.get(key)||[];history.push(previous);workbenchHistory.set(key,history);state.workConfig=next;$("#applyImageEdits").disabled=true;$("#applyImageEdits").textContent="Rendering…";
 try{await buildWorkbenchPreview(p,candidate,next);record("IMAGE_WORKBENCH_RENDERED",`${p.sku}: ${candidate.label} rendered with ${next.padding}% manual frame padding${next.cleanup?" and edge cleanup":""}.`);renderImages();toast("Prepared preview rendered")}catch(error){state.workConfig=previous;toast(`Preview unavailable: ${error.message}`)}finally{$("#applyImageEdits").disabled=false;$("#applyImageEdits").textContent="Render preview"}
};
$("#undoImageEdits").onclick=async()=>{
 const p=currentProduct(),state=ops(p).assets,candidate=imageCandidates(p).find(item=>item.label===state.selected),key=candidate&&workbenchKey(p,candidate),history=key&&workbenchHistory.get(key);if(!candidate||!history?.length)return;
 state.workConfig=history.pop();try{await buildWorkbenchPreview(p,candidate,state.workConfig);record("IMAGE_WORKBENCH_UNDO",`${p.sku}: restored the previous manual image preparation settings.`);renderImages();toast("Previous image settings restored")}catch(error){toast(`Undo preview unavailable: ${error.message}`)}
};
$("#makeMain").onclick=()=>{const p=currentProduct(),state=ops(p).assets;state.main=state.selected;record("IMAGE_MAIN_SELECTED",`${p.sku}: ${state.selected} set as the main upload image.`);renderImages();toast("Selected asset is now main")};
function moveSelectedImage(direction){const p=currentProduct(),state=ops(p).assets,candidates=imageCandidates(p),order=orderedCandidates(p,candidates).map(item=>item.label),index=order.indexOf(state.selected),next=index+direction;if(index<0||next<0||next>=order.length)return;[order[index],order[next]]=[order[next],order[index]];state.order=order;record("IMAGE_ORDER_UPDATED",`${p.sku}: ${state.selected} moved ${direction<0?"earlier":"later"} in the upload set.`);renderImages();toast("Upload order updated")}
$("#moveImageEarlier").onclick=()=>moveSelectedImage(-1);$("#moveImageLater").onclick=()=>moveSelectedImage(1);

function contentVariables(p){const profile=copyProfiles[p.sku],type=filterType(p);return {brand:p.brand,type,partNumber:profile.partNumber,oem:profile.oem,model:profile.model,material:p.attributes?.material||"unknown material",sourceTitle:`${p.brand} ${profile.model} · PN ${profile.partNumber}${profile.oem?` · OEM ${profile.oem}`:""}`}}
function localeDraft(v,lang){const labels={EN:"Structured replacement component",DE:"Strukturiertes Ersatzteil",FR:"Composant de remplacement structuré",IT:"Componente di ricambio strutturato",ES:"Componente de sustitución estructurado",GR:"Δομημένο ανταλλακτικό"},ref=v.oem?`OEM ref ${v.oem}`:"OEM reference not supplied";return {title:`${v.brand} ${v.type} ${v.partNumber}`,subtitle:`${labels[lang]} · ${ref}`,description:`${v.brand} ${v.type.toLowerCase()} for a controlled maintenance workflow. Part number ${v.partNumber}; ${ref}. Material evidence: ${v.material}.`,article:`<h2>${v.type} overview</h2>\n<p>${labels[lang]}. Part number ${v.partNumber}. This draft uses only visible structured variables and does not add performance claims.</p>`}}
function ensureDraft(state,p,lang){state.drafts||={};if(!state.drafts[lang])state.drafts[lang]=localeDraft(contentVariables(p),lang);return state.drafts[lang]}
function renderContent(){
 const p=currentProduct(),state=ops(p).content,lang=state.language,v=contentVariables(p),draft=ensureDraft(state,p,lang),stagedCount=Object.keys(state.stagedLocales||{}).length;
 $("#templateSource").textContent=v.sourceTitle;$("#templateFields").innerHTML=Object.entries({Brand:v.brand,"Part number":v.partNumber,"OEM reference":v.oem||"Not supplied",Type:v.type,Material:v.material,Model:v.model}).map(([key,value])=>`<div class="template-field"><span>${key}</span><strong>${value}</strong></div>`).join("");
 $("#templateState").textContent=state.generated?"6 DRAFTS READY":state.parsed?"FIELDS EXTRACTED":"RAW INPUT";$("#templateState").className=`pill ${state.generated?"ready":state.parsed?"review":"neutral"}`;$("#generateLocales").disabled=!state.parsed;
 $("#templateEvidence").innerHTML=state.parsed?`<strong>Transparent parser result.</strong> Part number: ${v.partNumber}. ${v.oem?`OEM reference: ${v.oem}.`:"No OEM value was supplied, so the template keeps that absence explicit."} Generate drafts to populate each locale card; content remains editable and unwritten.`:"No parser result yet. Extraction uses transparent rules over synthetic source text; it does not invent missing OEM references.";
 $("#contentContext").textContent=`Working product · ${p.sku} · ${lang} draft · ${stagedCount?`${stagedCount}/6 locale proposal${stagedCount===1?"":"s"} staged, not written`:state.generated?"generated, operator-editable draft":"template preview"}`;
 $("#contentTitle").value=draft.title;$("#contentSubtitle").value=draft.subtitle;$("#contentCategory").innerHTML=`<option>${p.category||`Vehicle Parts › Filters › ${v.type}s`}</option>`;$("#contentDescription").value=draft.description;$("#contentArticle").value=draft.article;
 const locales=["EN","DE","FR","IT","ES","GR"];
 $("#localeProgress").innerHTML=locales.map(locale=>{const generated=Boolean(state.generated),staged=Boolean(state.stagedLocales?.[locale]);return `<button data-locale="${locale}" class="${locale===lang?"active":""} ${generated?"generated":""} ${staged?"staged":""}"><strong>${locale}</strong><small>${staged?"STAGED":generated?"DRAFT":"RAW"}</small></button>`}).join("");$$("#localeProgress button").forEach(button=>button.onclick=()=>{saveCurrentDraft();state.language=button.dataset.locale;renderContent();toast(`${button.dataset.locale} draft loaded`)});
 $$(".languages button").forEach(b=>b.classList.toggle("active",b.dataset.language===lang));
 const ready=Boolean(draft.title&&draft.description.length>=30&&draft.article.length>=30),checks=[[state.parsed?"pass":"warn",state.parsed?"Brand, part number and OEM availability are traceable":"Extract structured variables before generating copy"],[state.generated?"pass":"warn",state.generated?"Locale draft was generated from visible variables":"Locale draft remains a template preview"],["pass","No unsupported performance claims in the template"],[state.stagedLocales?.[lang]?"pass":"warn",state.stagedLocales?.[lang]?`${lang} draft staged for human approval`:`${lang} draft is not in an approved write set`],["pass",`${stagedCount}/6 locale proposals staged`]];
 $("#contentChecks").innerHTML=checks.map(([status,text])=>`<li class="${status}">${text}</li>`).join("");$("#contentPolicy").textContent=state.stagedLocales?.[lang]?"STAGED":ready?"DRAFT VALID":"REVIEW";$("#contentPolicy").className=`pill ${state.stagedLocales?.[lang]?"review":ready?"ready":"blocked"}`;$("#contentLanguageState").textContent="Locale set: EN · DE · FR · IT · ES · GR. The generator creates editable, synthetic template drafts — not production translation claims.";
}
function saveCurrentDraft(){const p=currentProduct(),state=ops(p).content,draft=ensureDraft(state,p,state.language);draft.title=$("#contentTitle").value;draft.subtitle=$("#contentSubtitle").value;draft.description=$("#contentDescription").value;draft.article=$("#contentArticle").value}
$$(".languages button").forEach(b=>b.onclick=()=>{saveCurrentDraft();ops(currentProduct()).content.language=b.dataset.language;renderContent();toast(`${b.dataset.language} draft loaded`)});
[$("#contentTitle"),$("#contentSubtitle"),$("#contentDescription"),$("#contentArticle")].forEach(input=>input.oninput=saveCurrentDraft);
$("#extractFields").onclick=()=>{const p=currentProduct(),state=ops(p).content;state.parsed=true;record("COPY_FIELDS_EXTRACTED",`${p.sku}: transparent title parser extracted brand, part number and OEM availability from synthetic source text.`);renderContent();toast("Copy variables extracted")};
$("#generateLocales").onclick=()=>{const p=currentProduct(),state=ops(p).content;if(!state.parsed){toast("Extract fields first");return}state.drafts={};["EN","DE","FR","IT","ES","GR"].forEach(lang=>state.drafts[lang]=localeDraft(contentVariables(p),lang));state.generated=true;record("LOCALE_DRAFTS_GENERATED",`${p.sku}: six editable template drafts generated from visible structured variables.`);renderContent();toast("Six locale drafts generated")};
$("#stageContent").onclick=()=>{const p=currentProduct(),state=ops(p).content;saveCurrentDraft();state.stagedLocales||={};state.stagedLocales[state.language]=true;state.staged=true;state.draft=state.drafts[state.language];record("CONTENT_STAGED",`${p.sku} ${state.language} content draft staged for the approval flow.`,"Review");refresh();toast("Content proposal staged — no write executed")};

function renderProperties(){
 const p=currentProduct(),state=ops(p).properties,type=filterType(p),profile=productProfiles[p.sku];
 const values={Material:p.attributes?.material||"Unknown",Type:type,Reusable:p.attributes?.reusable?"Yes":"No",Source:"Synthetic structured evidence",Fitment:profile.fitment,Status:state.normalized?"Normalized":"Raw evidence",Category:p.category||"Unassigned",SKU:p.sku};
 $("#propertyContext").textContent=`Working product · ${p.sku} · ${state.normalized?"canonical values prepared":"raw product evidence"}`;
 $("#propertyGrid").innerHTML=Object.entries(values).map(([k,v])=>`<div class="property"><span>${k}</span><strong>${v}</strong></div>`).join("");
 $("#propertyStatus").textContent=state.normalized?"NORMALIZED":"RAW EVIDENCE";$("#propertyStatus").className=`pill ${state.normalized?"ready":"review"}`;
 $("#propertyEvidence").innerHTML=`<strong>${state.normalized?"Canonical mapping complete":"Deterministic mapping pending"}</strong><span>${state.normalized?"Each surfaced field retains its source/evidence class for review.":"The normalizer creates canonical fields from synthetic evidence; unknown values remain explicit rather than inferred."}</span>`;
}
$("#normalizeProperties").onclick=()=>{const p=currentProduct();ops(p).properties.normalized=true;record("PROPERTIES_NORMALIZED",`${p.sku} attributes normalized from traceable evidence.`);refresh();toast("Properties normalized")};

function renderCompatibility(){
 const p=currentProduct(),state=ops(p).fitment,profile=productProfiles[p.sku],rows=profile.vehicles;
 $("#compatEvidence").innerHTML=`<div><span>INPUT EVIDENCE</span><strong>${profile.fitment}</strong></div><b>→</b><div><span>CANDIDATE SET</span><strong>${rows.length} synthetic vehicle variants · ${p.conflict?"conflict held":"evidence scored"}</strong></div>`;
 $("#compatRows").innerHTML=rows.map(r=>`<tr><td>${pill(r[0])}</td>${r.slice(1).map(x=>`<td>${x}</td>`).join("")}</tr>`).join("");
 const safe=rows.filter(r=>r[0]==="Ready").length,review=rows.length-safe;
 $("#compatSafe").textContent=safe;$("#compatReview").textContent=review;
 $("#stageCompat").textContent=p.conflict?"Conflict requires review":state.staged?"Approved candidates staged":"Stage approved only";
 $("#stageCompat").disabled=Boolean(p.conflict);
}
$("#refreshCompat").onclick=()=>{const p=currentProduct();ops(p).fitment.refreshed=true;record("FITMENT_EVIDENCE",`${p.sku}: candidate set refreshed and confidence-ranked.`);renderCompatibility();toast("Compatibility evidence refreshed")};
$("#stageCompat").onclick=()=>{const p=currentProduct(),state=ops(p).fitment;if(p.conflict){toast("Conflict must be reviewed manually");return}state.staged=true;const safe=productProfiles[p.sku].vehicles.filter(r=>r[0]==="Ready").length;record("FITMENT_STAGED",`${safe} evidence-backed fitments staged for ${p.sku}.`,"Review");refresh();toast("Approved fitments staged")};

function schemaPill(status){return pill(status==="Valid"?"Ready":status)}
let previewSku=null;
function renderPreview(){
 const root=$("#forgePreview"),rows=batchImport?.loaded?batchImport.execution?.rows||[]:[];
 root.hidden=!rows.length;
 if(!rows.length){previewSku=null;return}
 if(!rows.some(row=>row.sku===previewSku))previewSku=rows[0].sku;
 const row=rows.find(item=>item.sku===previewSku),index=rows.indexOf(row);
 $("#previewPosition").textContent=`${index+1} / ${rows.length} · ${row.status.toUpperCase()}`;
 const pills=$("#previewPills");pills.replaceChildren();
 rows.forEach(item=>{
  const button=document.createElement("button");
  button.type="button";button.className=`preview-pill ${item.sku===previewSku?"active":""}`;
  button.textContent=`●  ${item.sku}`;
  button.setAttribute("aria-pressed",String(item.sku===previewSku));
  button.onclick=()=>{previewSku=item.sku;renderPreview()};
  pills.append(button);
 });
 const details=$("#previewDetails");details.replaceChildren();
 for(const locale of ["EN","DE","FR","IT","ES","GR"]){
  const operation=row.operations.find(item=>item.type==="content.stage"&&item.locale===locale);
  if(!operation)continue;
  const card=document.createElement("div");card.className="preview-locale";
  const label=document.createElement("strong");label.textContent=locale;
  const title=document.createElement("p");title.textContent=operation.fields?.title||"No title in payload";
  const description=document.createElement("small");description.textContent=operation.fields?.description||"No description in payload";
  card.append(label,title,description);details.append(card);
 }
 if(!details.children.length){
  const card=document.createElement("div");card.className="preview-locale";
  const label=document.createElement("strong");label.textContent="OPERATIONS";
  const body=document.createElement("p");body.textContent=row.operations.map(item=>item.type).join(" · ");
  card.append(label,body);details.append(card);
 }
 const run=$("#previewRun");run.disabled=row.status==="Verified"||batchImport.execution.status==="Executing";
 run.textContent=row.status==="Verified"?"Verified":"Approve & run selected";
}
function renderImportReport(){
 const summary=$("#importSummary"),state=$("#importState"),load=$("#loadValidQueue");
 if(!batchImport){summary.className="import-summary empty";summary.textContent="Load a sample or paste JSON to inspect its import report.";state.textContent="NO IMPORT";state.className="pill neutral";load.disabled=true;renderPreview();return}
 const {result}=batchImport,valid=result.items.filter(item=>item.status==="Valid").length,review=result.items.filter(item=>item.status==="Review").length,blocked=result.items.filter(item=>item.status==="Blocked").length;
 state.textContent=result.ok?`${valid} VALID`:"ISSUES FOUND";state.className=`pill ${result.ok?"ready":"review"}`;
 load.disabled=!valid;load.textContent=`Load ${valid} valid item${valid===1?"":"s"} into queue`;
 summary.className="import-summary";
 summary.innerHTML=`<div class="import-counts">${pill(`${valid} valid`)}${pill(`${review} review`)}${pill(`${blocked} blocked`)}</div>${result.items.map(item=>`<div class="import-row"><code>${item.sku}</code><span>${item.operations} ops</span><span>${item.message}</span>${schemaPill(item.status)}</div>`).join("")}${result.errors.map(error=>`<div class="import-error"><strong>${error.path}</strong> · ${error.message}</div>`).join("")}${result.warnings.map(warning=>`<div class="import-error"><strong>${warning.path}</strong> · ${warning.message}</div>`).join("")}`;
 renderPreview();
}
function validateJsonImport(){
 const input=$("#batchJson").value.trim();
 if(!input){toast("Paste JSON or load a sample");return}
 try{const payload=JSON.parse(input);batchImport={payload,result:validateBatchImport(payload,products.map(product=>product.sku)),loaded:false};renderImportReport();record("BATCH_SCHEMA_VALIDATED",`${batchImport.result.items.length} imported records checked against ${BATCH_SCHEMA_VERSION}.`,batchImport.result.ok?"Ready":"Review");toast(batchImport.result.ok?"Schema validation passed":"Schema report contains issues")}catch(error){batchImport={payload:null,result:{ok:false,errors:[{path:"$",message:`Invalid JSON: ${error.message}`}],warnings:[],items:[]},loaded:false};renderImportReport();toast("Invalid JSON")}
}
$("#loadReadyJson").onclick=()=>{$("#batchJson").value=JSON.stringify(sampleImports.ready,null,2);validateJsonImport()};
$("#loadMixedJson").onclick=()=>{$("#batchJson").value=JSON.stringify(sampleImports.mixed,null,2);validateJsonImport()};
$("#clearJson").onclick=()=>{$("#batchJson").value="";batchImport=null;renderImportReport();renderBatch();toast("Import cleared")};
$("#validateJson").onclick=validateJsonImport;
$("#loadValidQueue").onclick=()=>{if(!batchImport)return;const valid=batchImport.result.items.filter(item=>item.status==="Valid");batchImport.loaded=true;batchImport.execution={status:"Awaiting approval",rows:valid.map(item=>({sku:item.sku,status:"Queued",operations:item.record.operations.map(operation=>({...operation,status:"Queued"}))}))};record("BATCH_QUEUE_LOADED",`${valid.length} schema-valid record${valid.length===1?"":"s"} loaded as a typed controlled execution plan.`,"Review");renderImportReport();renderBatch();toast("Valid operation plan loaded — approval still required")};
function renderBatch(){
 renderPreview();
 const safe=products.filter(p=>!p.conflict&&!p.marketplaceReady).length,blocked=products.filter(p=>p.conflict).length,done=products.filter(p=>p.marketplaceReady).length;
 const staged={assets:products.filter(p=>ops(p).assets.staged).length,content:products.filter(p=>ops(p).content.staged).length,properties:products.filter(p=>ops(p).properties.normalized).length,fitment:products.filter(p=>ops(p).fitment.staged).length};
 const imported=batchImport?.loaded?batchImport.result.items.filter(item=>item.status==="Valid").length:0;
 const plan=batchImport?.execution;
 $("#batchList").innerHTML=plan?plan.rows.map(row=>`<div class="batch-plan-row"><strong>${row.sku}</strong><div class="batch-operation-list">${row.operations.map(operation=>`<span class="operation-pill ${operation.status.toLowerCase()}">${operation.type.replace(".stage","")} · ${operation.status}</span>`).join("")}</div>${pill(row.status)}</div>`).join(""):[[imported?`${imported} imported records`:`${safe} products`,imported?"Schema-valid queue loaded; awaiting approval":"Validated core updates awaiting approval",imported?"Review":"Ready"],[`${staged.assets} products`,"Image upload proposals staged","Review"],[`${staged.content} products`,"Multilingual content drafts staged","Review"],[`${staged.properties} products`,"Structured properties normalized","Ready"],[`${staged.fitment} products`,"Evidence-backed fitments staged","Review"],[`${blocked} products`,"Source conflict — isolated from execution","Blocked"],[`${done} products`,"Verified controlled writes in this session","Ready"]].map(r=>`<div class="batch-row"><strong>${r[0]}</strong><span>${r[1]}</span>${pill(r[2])}</div>`).join("");
 $("#approveBatch").textContent=imported?`Approve ${imported} imported item${imported===1?"":"s"}`:`Approve ${safe} safe writes`;
 const running=plan?.status==="Executing";$("#pauseBatch").disabled=!running;$("#pauseBatch").textContent=batchRunControl?.paused?"Resume":"Pause";$("#retryBatch").disabled=!plan?.rows.some(row=>row.status==="Failed");
}
$("#previewRun").onclick=()=>{
 const plan=batchImport?.execution,row=plan?.rows.find(item=>item.sku===previewSku);
 if(!row||plan.status==="Executing"||row.status==="Verified")return;
 runImportedPlan([row]);
};
$("#rejectBatch").onclick=()=>{$("#batchState").textContent="REJECTED";$("#batchState").className="pill blocked";record("BATCH_REJECTED","Batch proposal rejected. Zero writes executed.","Review");toast("Batch rejected — zero writes")};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function executeImportedOperation(product,operation){
 const state=ops(product);
 if(operation.type==="content.stage"){
  const locale=operation.locale;state.content.drafts||={};state.content.drafts[locale]={...localeDraft(contentVariables(product),locale),...operation.fields};state.content.stagedLocales||={};state.content.stagedLocales[locale]=true;state.content.staged=true;
  return {ok:Boolean(state.content.drafts[locale].title&&state.content.drafts[locale].description),message:`${locale} content draft staged and checked`};
 }
 if(operation.type==="images.stage"){const exists=imageCandidates(product).some(candidate=>candidate.label===operation.selected);if(!exists)return {ok:false,message:`Selected asset ${operation.selected} is not available`};state.assets.selected=operation.selected;state.assets.staged=true;return {ok:state.assets.selected===operation.selected&&state.assets.staged,message:"Selected image proposal staged"}}
 if(operation.type==="properties.normalize"){state.properties.normalized=true;return {ok:state.properties.normalized,message:"Structured properties normalized"}}
 if(operation.type==="fitment.stage"){if(product.conflict)return {ok:false,message:"Fitment evidence conflict blocks staging"};state.fitment.staged=true;return {ok:state.fitment.staged,message:"Evidence-backed fitment candidates staged"}}
 return {ok:false,message:"Operation is not allowlisted"};
}
async function runImportedPlan(rows){
 const plan=batchImport?.execution;if(!plan)return;plan.status="Executing";batchRunControl={paused:false};const state=$("#batchState");state.textContent="EXECUTING";state.className="pill review";renderBatch();
 for(const row of rows){
  row.status="Executing";renderBatch();const product=products.find(item=>item.sku===row.sku);
  for(const operation of row.operations.filter(item=>item.status!=="Verified")){
   while(batchRunControl?.paused){await wait(140)}
   operation.status="Executing";renderBatch();await wait(260);
   const result=product?executeImportedOperation(product,operation):{ok:false,message:"Product no longer exists in queue"};operation.status=result.ok?"Verified":"Failed";operation.message=result.message;
   record(result.ok?"BATCH_OPERATION_VERIFIED":"BATCH_OPERATION_FAILED",`${row.sku} · ${operation.type}: ${result.message}.`,result.ok?"Ready":"Blocked");renderBatch();
   if(!result.ok)break;
  }
  row.status=row.operations.some(operation=>operation.status==="Failed")?"Failed":row.operations.every(operation=>operation.status==="Verified")?"Verified":"Queued";renderBatch();
 }
 const failed=plan.rows.filter(row=>row.status==="Failed").length,verified=plan.rows.filter(row=>row.status==="Verified").length,complete=verified===plan.rows.length;
 plan.status=failed?"Completed with failures":complete?"Verified":"Partially verified";
 state.textContent=complete?`VERIFIED · ${verified}/${plan.rows.length}`:`PARTIAL · ${verified}/${plan.rows.length}`;
 state.className=`pill ${complete?"ready":"review"}`;batchRunControl=null;refresh();
 toast(failed?"Batch completed with isolated failures":complete?"Typed batch plan completed and verified":"Selected product verified; remaining products await approval");
}
$("#pauseBatch").onclick=()=>{if(!batchRunControl)return;batchRunControl.paused=!batchRunControl.paused;renderBatch();toast(batchRunControl.paused?"Batch paused after current operation":"Batch resumed")};
$("#retryBatch").onclick=()=>{const plan=batchImport?.execution;if(!plan)return;const failed=plan.rows.filter(row=>row.status==="Failed");failed.forEach(row=>{row.status="Queued";row.operations.forEach(operation=>{if(operation.status==="Failed")operation.status="Queued"})});record("BATCH_RETRY_REQUESTED",`${failed.length} failed row${failed.length===1?"":"s"} queued for retry only.`,"Review");runImportedPlan(failed);toast("Retrying failed rows only")};
$("#approveBatch").onclick=()=>{
 const importedSkus=batchImport?.loaded?batchImport.result.items.filter(item=>item.status==="Valid").map(item=>item.sku):null;
 if(importedSkus){const plan=batchImport?.execution;if(!plan){toast("Load the validated execution plan first");return}if(plan.status==="Executing"){toast("Batch is already executing");return}const pending=plan.rows.filter(row=>row.status!=="Verified");if(!pending.length){toast("All imported operations are already verified");return}runImportedPlan(pending);return}
 const s=$("#batchState"),targets=(importedSkus?products.filter(p=>importedSkus.includes(p.sku)):products.filter(p=>!p.conflict&&!p.marketplaceReady)).filter(p=>!p.conflict&&!p.marketplaceReady);
 if(!targets.length){toast("No safe pending items remain");return}
 s.textContent="EXECUTING";s.className="pill review";let index=0;
 const timer=setInterval(()=>{const p=targets[index],proposal=proposeChanges(p),result=executeApproved(p,proposal,true);if(result.ok){Object.assign(p,result.product,{status:"Ready",checks:7,total:7})};record(result.ok?"BATCH_VERIFIED":"BATCH_FAILED",`${p.sku}: ${result.ok?"write verified":"verification failed"}.`,result.ok?"Ready":"Blocked");index++;if(index===targets.length){clearInterval(timer);s.textContent=`VERIFIED · ${targets.length}/${targets.length}`;s.className="pill ready";refresh();toast("Batch completed and verified")}},420)
};
function scanQueue(){
 return products.map(p=>{
  if(p.conflict)return {id:`${p.sku}:fitment`,sku:p.sku,status:"Blocked",domain:"Compatibility safety",title:"Conflicting fitment evidence",detail:p.conflict,fixable:false,evidence:"Two synthetic sources disagree. The policy does not infer a vehicle mapping."};
  if(p.marketplaceReady)return {id:`${p.sku}:verified`,sku:p.sku,status:"Ready",domain:"Post-write verification",title:"Controlled write verified",detail:"Expected state matches the re-read product record.",fixable:false,evidence:"Verification compares every approved field with the simulated BO read-back."};
  const inspection=inspectProduct(p),proposal=proposeChanges(p),fields=proposal.operations.map(op=>op.field);
  return {id:`${p.sku}:core`,sku:p.sku,status:"Review",domain:"Core publication fields",title:`${inspection.missing.length} required field${inspection.missing.length===1?"":"s"} incomplete`,detail:`Missing: ${inspection.missing.join(", ")}. The product is not publish-ready.`,fixable:validateProposal(p,proposal).ok,evidence:`Policy can propose changes only for: ${fields.join(", ")}.`,proposal};
 });
}
function renderAudit(){
 const report=auditRun?.items||[];
 const counts={Ready:report.filter(x=>x.status==="Ready").length,Review:report.filter(x=>x.status==="Review").length,Blocked:report.filter(x=>x.status==="Blocked").length};
 $("#auditScanned").textContent=report.length;
 $("#auditPass").textContent=counts.Ready;
 $("#auditReview").textContent=counts.Review;
 $("#auditBlocked").textContent=counts.Blocked;
 $("#auditRunMeta").innerHTML=auditRun?`<strong>Run ${auditRun.id}</strong> · ${auditRun.at} · read-only scan across ${report.length} synthetic records. Findings are derived from current state, so a verified correction disappears on the next scan.`:"No scan has been run in this session. The scanner reads current demo state and creates no write operations.";
 $("#findings").innerHTML=report.length?report.map(item=>`<button class="finding ${selectedFinding?.id===item.id?"selected":""}" data-finding="${item.id}"><strong>${item.sku}</strong><span>${item.title}</span><span>${item.domain}</span>${pill(item.status)}</button>`).join(""):'<div class="empty">Run a scan to create a current report.</div>';
 $$("#findings .finding").forEach(button=>button.onclick=()=>{selectedFinding=report.find(item=>item.id===button.dataset.finding);renderAudit()});
 const detail=$("#auditDetail"),status=$("#auditStatus"),fix=$("#prepareFix"),item=selectedFinding;
 if(!item){$("#auditSku").textContent="Select a finding";status.textContent="IDLE";status.className="pill neutral";detail.className="empty";detail.textContent="Run the read-only scan, then inspect one finding. A fix is proposed only for allowlisted fields with enough evidence.";fix.disabled=true;return}
 $("#auditSku").textContent=item.sku;status.textContent=item.status.toUpperCase();status.className=`pill ${item.status.toLowerCase()}`;detail.className="audit-detail";
 detail.innerHTML=`<div class="audit-field"><span>FINDING</span><strong>${item.title}</strong></div><div class="audit-field"><span>WHY IT MATTERS</span><strong>${item.detail}</strong></div><div class="audit-field"><span>EVIDENCE + POLICY</span><strong>${item.evidence}</strong></div>${item.fixable?`<div class="callout"><strong>Fix is available</strong><span>The proposal remains inspectable and needs separate human approval before the existing BO execution and re-read verification flow.</span></div>`:`<div class="callout" style="border-color:var(--amber)"><strong>No automatic correction</strong><span>${item.status==="Blocked"?"Evidence is contradictory, so the workflow stops.":"This finding is already verified or requires an operator decision."}</span></div>`}`;
 fix.disabled=!item.fixable;fix.textContent=item.fixable?"Prepare controlled fix":"No automatic fix available";
}
function runAudit(){
 auditRun={id:`audit_${Math.random().toString(36).slice(2,8)}`,at:new Date().toLocaleTimeString("en-GB"),items:scanQueue()};
 selectedFinding=auditRun.items.find(item=>item.status==="Review")||auditRun.items[0]||null;
 record("AUDIT_COMPLETED",`${auditRun.items.length} records scanned read-only; ${auditRun.items.filter(item=>item.status==="Review").length} controlled fixes may be proposed.`);
 renderAudit();toast("Read-only audit completed");
}
$("#runAudit").onclick=runAudit;
$("#prepareFix").onclick=()=>{
 const item=selectedFinding,p=products.find(product=>product.sku===item?.sku);
 if(!item?.fixable||!p){toast("This finding cannot create a controlled fix");return}
 selected=p;renderRows();renderInspector();renderModuleContext();buildProposal(p);
 record("AUDIT_FIX_PREPARED",`${p.sku}: audit finding converted into an inspectable controlled proposal.`,"Review");
 setView("workspace");toast("Review the proposal, then approve before BO execution");
};

function logBO(source,message,kind=""){
 $("#boConsole").insertAdjacentHTML("beforeend",`<div><span class="${kind}">${source}</span><code>${message}</code></div>`);
 $("#boConsole").scrollTop=$("#boConsole").scrollHeight;
}
function renderBO(){
 const p=boState.product||selected;
 if(!p){$("#boTitle").textContent="No product selected";$("#boSubtitle").textContent="Select a product from the operations workspace.";return}
 $("#boTitle").textContent=`${p.sku} · ${p.brand} ${p.title}`;
 $("#boSubtitle").textContent=boState.proposal?`${boState.proposal.operations.length} approved operations ready for controlled execution.`:"Read-only product inspection. No approved write loaded.";
 $("#boConnection").textContent=boState.loaded?"CONNECTED":"STANDBY";$("#boConnection").className=`pill ${boState.loaded?"ready":"neutral"}`;
 $("#boReadState").textContent=boState.loaded?"READ COMPLETE":"NOT READ";$("#boReadState").className=`pill ${boState.loaded?"ready":"neutral"}`;
 $("#boFields").className="bo-fields";
 $("#boFields").innerHTML=[["SKU",p.sku],["Title",p.title||"Missing"],["Category",p.category||"Missing"],["Description",p.description||"Missing"],["Main image",p.image?"Present":"Missing"],["Marketplace ready",String(p.marketplaceReady)]].map(([k,v])=>`<div class="bo-field"><span>${k}</span><strong>${v}</strong></div>`).join("");
}
function openBackOffice(p){
 boState.product=p;setView("backoffice");renderBO();
 if(!boState.loaded){$("#boConsole").innerHTML='<div><span>system</span><code>Simulated BO ready. No production connection exists in this portfolio.</code></div>';logBO("session",`Selected ${p.sku} for read/write/verify flow.`,"ok")}
}
$("#boLoad").onclick=()=>{
 const p=boState.product||currentProduct();boState.product=p;boState.loaded=true;renderBO();logBO("readProduct",`GET /products/${p.sku} → 200 · record loaded`,"ok");record("BO_READ",`${p.sku} loaded in simulated Back Office.`);toast("Product record loaded")
};
$$(".tool-list button").forEach(button=>button.onclick=()=>{
 const p=boState.product||currentProduct(),tool=button.dataset.tool;
 const messages={readProduct:`GET /products/${p.sku} → read-only record`,validateProposal:"Validate typed operations against schema and allowlist",writeFields:"PATCH only title, category, description, marketplaceReady",verifyProduct:"GET final record and compare expected state"};
 logBO(tool,messages[tool],tool==="writeFields"?"warn":"ok");toast(`${tool} traced in console`)
});
$("#boRun").onclick=()=>{
 const p=boState.product||currentProduct(),proposal=boState.proposal;
 if(!proposal){logBO("system","Blocked: no approved proposal is loaded.","warn");toast("Approve a proposal before executing");return}
 if(!boState.loaded){logBO("system","Load the product record before execution.","warn");toast("Read the product record first");return}
 const valid=validateProposal(p,proposal);logBO("validateProposal",valid.ok?"PASS · schema and allowlist accepted":"FAIL · proposal rejected",valid.ok?"ok":"warn");
 if(!valid.ok)return;
 logBO("writeFields",`PATCH ${proposal.operations.length} allowed fields → simulated write complete`,"ok");
 const result=executeApproved(p,proposal,true);
 if(result.ok){Object.assign(p,result.product,{status:"Ready",checks:7,total:7});logBO("verifyProduct","GET final record → expected state matches actual state · PASS","ok");record("BO_VERIFIED",`${p.sku} executed through simulated BO and passed re-read verification.`);boState.proposal=null;renderBO();refresh();toast("BO execution verified")}else{logBO("verifyProduct","FAIL · post-write state differs from proposal","warn");record("BO_FAILED",`${p.sku} failed post-write verification.`,"Blocked")}
};
$("#clearHistory").onclick=()=>{historyData=[];persist();renderHistory();toast("Session history cleared")};
$("#resetDemo").onclick=()=>{products=JSON.parse(JSON.stringify(initialProducts));historyData=[];selected=null;boState={product:null,proposal:null,loaded:false};batchImport=null;auditRun=null;selectedFinding=null;intakeProduct=null;$("#batchJson").value="";$("#productLookup").value="";localStorage.removeItem("forgeOpsProducts");localStorage.removeItem("forgeOpsHistory");renderBO();renderImportReport();refresh();toast("Demo state reset")};

const tourSteps=[
 {view:"workspace",title:"Start with the operational queue",text:"A worklist exposes completeness, workflow type and review state. We will inspect an incomplete oil filter.",action:()=>{selected=products[1];renderRows();renderInspector()}},
 {view:"workspace",title:"Build a structured proposal",text:"The proposal layer returns typed field operations with evidence. Nothing is written yet.",action:()=>buildProposal(selected)},
 {view:"workspace",title:"Compare before and after",text:"The field diff makes every proposed mutation inspectable before the operator grants permission."},
 {view:"batch",title:"Scale the same controls to a batch",text:"Safe items can proceed together; ambiguous and conflicting items remain isolated for review."},
 {view:"architecture",title:"Keep decision and execution separate",text:"Policy, approval, narrow tool permissions and post-write verification are enforced as distinct boundaries."}
];
let tourIndex=0;
function renderTour(){
 const step=tourSteps[tourIndex];setView(step.view);step.action?.();
 $("#tourStep").textContent=`STEP ${tourIndex+1} OF ${tourSteps.length}`;
 $("#tourTitle").textContent=step.title;$("#tourText").textContent=step.text;
 $("#tourProgress").style.width=`${(tourIndex+1)/tourSteps.length*100}%`;
 $("#tourNext").textContent=tourIndex===tourSteps.length-1?"Finish":"Next";
}
$("#startTour").onclick=()=>{tourIndex=0;$("#tour").classList.remove("hidden");renderTour()};
$("#tourExit").onclick=()=>$("#tour").classList.add("hidden");
$("#tourNext").onclick=()=>{if(tourIndex===tourSteps.length-1){$("#tour").classList.add("hidden");toast("Walkthrough complete");return}tourIndex++;renderTour()};

renderRows();renderMetrics();renderBatch();renderAudit();renderHistory();renderBO();renderModuleContext();renderImportReport();renderIntake();
const initial=location.hash.slice(1);setView(titles[initial]?initial:"architecture");
