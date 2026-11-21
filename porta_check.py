#!/usr/bin/env python3
"""Porta Plazma independent checker (practice table only - never presses USB Connect).
Usage:  python3 porta_check.py /tmp/pt  /tmp/check
  - expects the repo checked out at argv[1] and served at http://localhost:8090 (python3 -m http.server 8090)
  - writes results.json, summary.md and screenshots (*.png) into argv[2]
Checks things the repo's own CI does not: screen fit/overlap/clipping at 3 laptop sizes, the
'start a cut off the cutting screen' safety path, every Make tool (page errors, dialog fits, Escape),
and every fold/3D preset (flat pattern vs 3D: area, holes, overlapping cut outlines)."""
import asyncio, json, sys, os, traceback
from playwright.async_api import async_playwright
REPO, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
URL = "http://localhost:8090/?test=1&turn=0"
R = {"screens": {}, "safety": {}, "tools": {}, "fold": {}, "errors": []}

LAYOUT = r"""()=>{
 const vis=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>1&&r.height>1&&s.visibility!=='hidden'&&s.display!=='none'&&+s.opacity>0.05};
 const name=e=>(e.id?'#'+e.id:'')||((e.textContent||'').trim().replace(/\s+/g,' ').slice(0,28))||e.tagName;
 const out={page:Math.max(0,document.scrollingElement.scrollHeight-innerHeight),scrollers:[],offscreen:[],clipped:[],overlap:[],textcut:[]};
 const exempt=e=>e.closest('#howtoDlg,#settingsDlg,[data-allow-scroll],#ctlLog,.ctl-log');
 for(const e of document.querySelectorAll('body *')){ if(!vis(e)||exempt(e))continue; const s=getComputedStyle(e);
   if(/(auto|scroll)/.test(s.overflowY)&&e.scrollHeight>e.clientHeight+2) out.scrollers.push(name(e)+' +'+(e.scrollHeight-e.clientHeight));
   if(e.children.length===0&&(e.textContent||'').trim().length>3&&s.overflow==='hidden'&&e.scrollWidth>e.clientWidth+2&&!e.title&&!e.closest('[title]')) out.textcut.push(name(e));
 }
 const hit=(e,x,y)=>{if(x<0||y<0||x>=innerWidth||y>=innerHeight)return false;const h=document.elementFromPoint(x,y);return !!h&&(h===e||e.contains(h)||h.contains(e))};
 const all=[...document.querySelectorAll('button,input,select,textarea,a[href]')].filter(e=>vis(e)&&!exempt(e)&&e.type!=='hidden');
 const live=all.filter(e=>{const r=e.getBoundingClientRect();return hit(e,r.left+r.width/2,r.top+r.height/2)});
 const c=document.elementFromPoint(innerWidth/2,innerHeight/2); let veil=false;
 for(let p=c;p&&p!==document.body;p=p.parentElement){const ps=getComputedStyle(p),q=p.getBoundingClientRect();if((ps.position==='fixed'||p.matches('dialog[open],[role=dialog],[aria-modal=true]'))&&q.width>innerWidth*0.4&&q.height>innerHeight*0.4){veil=true;break}}
 for(const e of live){const r=e.getBoundingClientRect();
   if(r.bottom>innerHeight+1||r.right>innerWidth+1||r.top<-1||r.left<-1) out.offscreen.push(name(e));
   const pts=[[r.left+3,r.top+3],[r.right-3,r.top+3],[r.left+3,r.bottom-3],[r.right-3,r.bottom-3]].filter(([x,y])=>x>=0&&y>=0&&x<innerWidth&&y<innerHeight);
   const miss=pts.filter(([x,y])=>!hit(e,x,y)).length; if(r.width>12&&r.height>12&&miss>=2) out.clipped.push(name(e));
 }
 for(let i=0;i<live.length;i++)for(let j=i+1;j<live.length;j++){const a=live[i],b=live[j]; if(a.contains(b)||b.contains(a))continue;
   const A=a.getBoundingClientRect(),B=b.getBoundingClientRect(); const ox=Math.min(A.right,B.right)-Math.max(A.left,B.left), oy=Math.min(A.bottom,B.bottom)-Math.max(A.top,B.top);
   if(ox>4&&oy>4) out.overlap.push(name(a)+' / '+name(b));}
 out.covered=veil?[]:all.filter(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth&&!live.includes(e)&&!e.closest('[inert]')}).map(name).slice(0,15);
 out.modalOpen=veil;
 for(const k of Object.keys(out)) if(Array.isArray(out[k])) out[k]=[...new Set(out[k])].slice(0,25);
 return out;}"""

async def page(b, W, H):
    pg = await b.new_page(viewport={"width": W, "height": H}, bypass_csp=True)
    pg._errs = []
    pg.on("pageerror", lambda e: pg._errs.append(str(e)[:200]))
    await pg.goto(URL); await pg.wait_for_function("()=>window.plasmaTest", timeout=20000); await pg.wait_for_timeout(600)
    return pg

async def ev(pg, js, arg=None):
    try: return await (pg.evaluate(js, arg) if arg is not None else pg.evaluate(js))
    except Exception as e: R["errors"].append("eval: " + str(e)[:160]); return None

async def click_text(pg, rx):
    return await ev(pg, "(rx)=>{const R=new RegExp(rx,'i');const b=[...document.querySelectorAll('button,a,[role=tab]')].find(x=>x.offsetParent&&R.test(x.textContent.trim()));if(b){b.click();return true}return false}", rx)

async def close_dialogs(pg):
    await pg.keyboard.press("Escape"); await pg.wait_for_timeout(200)
    await ev(pg, "()=>{document.querySelectorAll('dialog[open]').forEach(d=>d.close());[...document.querySelectorAll('button')].filter(b=>/^(close|cancel)$/i.test(b.textContent.trim())&&b.offsetParent).forEach(b=>b.click())}")

async def home_and_zero(pg):
    await ev(pg, "()=>{const b=document.getElementById('btnDemo');b&&b.click()}"); await pg.wait_for_timeout(1500)
    await ev(pg, "()=>{const M=plasmaTest.getM();try{M.command({cmd:'unlock'})}catch(e){} M.command({cmd:'home'})}"); await pg.wait_for_timeout(7000)

async def screens(b, W, H):
    pg = await page(b, W, H); key = f"{W}x{H}"; res = {}
    async def snap(n):
        await pg.wait_for_timeout(700)
        res[n] = await ev(pg, LAYOUT) or {}
        res[n]["pageErrors"] = pg._errs[:]; pg._errs.clear()
        await pg.screenshot(path=f"{OUT}/S_{key}_{n}.png")
    await snap("menu")
    await ev(pg, "()=>{const T=plasmaTest;T.showScreen('make',{force:true});T.setShapeFs&&T.setShapeFs(false);T.sketch.clear();}"); await snap("make_empty")
    await ev(pg, "()=>{const s=plasmaTest.sketch;s.add('plate',true);s.commit&&s.commit();}"); await snap("make_simple_part")
    await click_text(pg, "^advanced tools$|^advanced$"); await snap("make_advanced")
    for t in ["Features|Holes", "Arrange", "Part"]:
        await click_text(pg, "^(" + t + ")$"); await snap("make_tab_" + t.split("|")[0].lower())
    await ev(pg, "()=>{const b=[...document.querySelectorAll('[data-qb=more]')].find(e=>e.offsetParent);b&&b.click()}"); await snap("make_more_panel"); await close_dialogs(pg)
    await click_text(pg, "^simple( view)?$")
    await ev(pg, "()=>plasmaTest.openPresetBrowser&&plasmaTest.openPresetBrowser()"); await snap("presets"); await close_dialogs(pg)
    await ev(pg, "()=>{const T=plasmaTest;T.sendToCutting();T.goStep(1)}"); await snap("cut_part_noconn")
    await home_and_zero(pg); await ev(pg, "()=>plasmaTest.goStep(1)"); await snap("cut_part_practice")
    await ev(pg, "()=>plasmaTest.goStep(3)"); await snap("cut_setup_homed")
    await ev(pg, "()=>document.getElementById('btnZero').click()"); await pg.wait_for_timeout(1500); await snap("cut_setup_ready")
    await ev(pg, "()=>document.getElementById('btnStart').click()"); await pg.wait_for_timeout(900); await snap("start_confirm")
    await click_text(pg, "^everything"); await pg.wait_for_timeout(5000); await snap("cut_running")
    await pg.keyboard.press("Space"); await pg.wait_for_timeout(2500); await snap("cut_stopped")
    await ev(pg, "()=>{const b=document.getElementById('btnBarSetup');if(b)b.click();else{const T=plasmaTest;T.showScreen('cut',{force:true});T.showTab&&T.showTab('setup')}}"); await pg.wait_for_timeout(800)
    for t in ["Edges", "Motors", "Torch", "Controller"]:
        await click_text(pg, "^" + t); await snap("machine_" + t.lower())
    await ev(pg, "()=>plasmaTest.showScreen('menu',{force:true})")
    await ev(pg, "()=>plasmaTest.openAccount&&plasmaTest.openAccount()"); await snap("account"); await close_dialogs(pg)
    R["screens"][key] = res
    await pg.close()

async def safety(b):
    """Start confirm open -> leave via Menu -> confirm must not start a job; a job must never run with STOP hidden."""
    pg = await page(b, 1366, 640); out = {}
    await ev(pg, "()=>{const T=plasmaTest;T.showScreen('make',{force:true});T.setShapeFs&&T.setShapeFs(false);const s=T.sketch;s.clear();s.add('plate',true);s.commit&&s.commit();T.sendToCutting();T.goStep(3)}")
    await home_and_zero(pg)
    await ev(pg, "()=>document.getElementById('btnZero').click()"); await pg.wait_for_timeout(1500)
    for via in ["Menu", "Part"]:
        await ev(pg, "()=>{plasmaTest.showScreen('cut',{force:true});plasmaTest.goStep(3)}"); await pg.wait_for_timeout(500)
        await ev(pg, "()=>document.getElementById('btnStart').click()"); await pg.wait_for_timeout(800)
        try: await pg.get_by_role("button", name=via).first.click(timeout=2000); left = "clicked " + via
        except Exception as e: left = via + " not clickable (ok if disabled)"
        await pg.wait_for_timeout(600)
        await click_text(pg, "^everything")
        await pg.wait_for_timeout(2500)
        st = await ev(pg, """()=>{const stop=[...document.querySelectorAll('button')].some(b=>/STOP/.test(b.textContent)&&b.offsetParent);
            const S=plasmaTest.S;const running=!!(S.job&&(S.job.running||S.job.state==='running'))||!!S.running;
            return {screen:document.body.dataset.screen,running,stopVisible:stop}}""")
        st["leave"] = left; st["PASS"] = not (st and st.get("running") and (st.get("screen") != "cut" or not st.get("stopVisible")))
        out["via_" + via] = st
        await pg.screenshot(path=f"{OUT}/SAFETY_{via}.png")
        await pg.keyboard.press("Space"); await pg.wait_for_timeout(1500); await close_dialogs(pg)
    out["pageErrors"] = pg._errs[:]
    R["safety"] = out; await pg.close()

async def tools(b):
    pg = await page(b, 1536, 730); out = {}
    await ev(pg, "()=>{const T=plasmaTest;T.showScreen('make',{force:true});T.setShapeFs&&T.setShapeFs(false);T.sketch.clear();}")
    await click_text(pg, "^advanced tools$|^advanced$"); await pg.wait_for_timeout(500)
    await ev(pg, "()=>{const b=[...document.querySelectorAll('[data-qb=more]')].find(e=>e.offsetParent);b&&b.click()}"); await pg.wait_for_timeout(400)
    ids = await ev(pg, "()=>[...new Set([...document.querySelectorAll('[data-qb]')].map(e=>e.dataset.qb))].filter(x=>!['more','undo','redo','del','fit'].includes(x))") or []
    await close_dialogs(pg)
    for t in ids:
        await ev(pg, "()=>{const s=plasmaTest.sketch;s.clear();s.add('rect');s.sel={ids:[s.items[0].id],hole:null};s.draw&&s.draw()}")
        pg._errs.clear()
        how = await ev(pg, """(id)=>{const f=()=>[...document.querySelectorAll('[data-qb="'+id+'"]')].find(e=>e.offsetParent);let b=f();
            if(!b){const m=[...document.querySelectorAll('[data-qb=more]')].find(e=>e.offsetParent);m&&m.click();b=f()}
            if(!b)return 'NOT REACHABLE';const d=b.getAttribute('aria-disabled');b.click();return d?'disabled':'ok'}""", t)
        await pg.wait_for_timeout(600)
        fit = await ev(pg, """()=>{const d=[...document.querySelectorAll('dialog[open],.safedlg,[role=dialog]')].filter(e=>e.offsetParent);
            return d.map(e=>{const r=e.getBoundingClientRect();const btns=[...e.querySelectorAll('button')].filter(b=>b.offsetParent);
              const lost=btns.filter(b=>{const q=b.getBoundingClientRect();return q.bottom>innerHeight||q.top<0}).map(b=>b.textContent.trim().slice(0,20));
              return {top:Math.round(r.top),bottom:Math.round(r.bottom),offscreenButtons:lost}})}""")
        await pg.keyboard.press("Escape"); await pg.wait_for_timeout(300)
        still = await ev(pg, "()=>[...document.querySelectorAll('dialog[open],.safedlg,[role=dialog]')].filter(e=>e.offsetParent).length")
        out[t] = {"open": how, "dialogs": fit, "openAfterEscape": still, "pageErrors": pg._errs[:]}
        await close_dialogs(pg)
    R["tools"] = out; await pg.close()

FOLD = r"""async ()=>{const S=await import('/js/make/shapes.js');const F=await import('/js/make/fold3d.js');
 const A=(P)=>{let a=0;for(let i=0;i<P.length;i++){const p=P[i],q=P[(i+1)%P.length];a+=p[0]*q[1]-q[0]*p[1]}return a/2};
 const A3=(P)=>{let v=[0,0,0];for(let i=0;i<P.length;i++){const a=P[i],c=P[(i+1)%P.length];v[0]+=a[1]*c[2]-a[2]*c[1];v[1]+=a[2]*c[0]-a[0]*c[2];v[2]+=a[0]*c[1]-a[1]*c[0]}return Math.hypot(...v)/2};
 const inside=(pt,poly)=>{let c=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>pt[1])!=(b[1]>pt[1])&&pt[0]<(b[0]-a[0])*(pt[1]-a[1])/(b[1]-a[1])+a[0])c=!c}return c};
 const out=[];
 for(const s of S.SHAPES.filter(x=>F.isFoldPart(x))){const p={};for(const [k,,d] of s.params)p[k]=d; let row={id:s.id,name:s.name||s.label};
  try{const cs=S.makeShape(s.id,p);const cut=cs.filter(c=>!(c.closed===false||c.op==='score'||c.op==='mark'||c.role==='bend'));
   const ar=cut.map(c=>Math.abs(A(c.pts)));let flat=0,holes=0;
   cut.forEach((c,i)=>{const d=cut.filter((o,j)=>j!==i&&ar[j]>ar[i]&&inside(c.pts[0],o.pts)).length;if(d%2===0)flat+=ar[i];else{flat-=ar[i];holes++}});
   const bb=cut.map(c=>{const xs=c.pts.map(q=>q[0]),ys=c.pts.map(q=>q[1]);return [(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...ys)+Math.max(...ys))/2,Math.max(...xs)-Math.min(...xs)]});
   const ov=[];for(let i=0;i<bb.length;i++)for(let j=i+1;j<bb.length;j++){const a=bb[i],c=bb[j];if(a[2]<60&&c[2]<60&&Math.abs(a[2]-c[2])<a[2]*0.5&&Math.hypot(a[0]-c[0],a[1]-c[1])<(a[2]+c[2])/2&&!(inside([a[0],a[1]],cut[j].pts)||inside([c[0],c[1]],cut[i].pts)))ov.push(i+'&'+j)}
   const m=F.foldModel(s,p);let ma=0,mh=0;if(m)for(const f of m.faces){ma+=A3(f.pts);for(const h of (f.holes||[])){ma-=A3(h);mh++}}
   Object.assign(row,{flatArea:Math.round(flat),modelArea:Math.round(ma),ratio:flat?+(ma/flat).toFixed(3):null,holesCut:holes,holes3D:mh,overlappingCuts:ov,template:!!s.template});
  }catch(e){row.error=String(e).slice(0,150)}
  out.push(row)}
 return out}"""

async def fold(b):
    pg = await page(b, 1200, 800)
    rows = await ev(pg, FOLD) or []
    bad = [r for r in rows if r.get("error") or r.get("overlappingCuts") or (not r.get("template") and r.get("ratio") and not 0.95 < r["ratio"] < 1.05) or r.get("holesCut") != r.get("holes3D")]
    R["fold"] = {"checked": len(rows), "flagged": bad}
    await pg.close()

def summary():
    L = ["# Checker summary", ""]
    s = R["safety"]; L.append("## Safety (start a cut off the cutting screen)")
    for k, v in s.items():
        if k.startswith("via_"): L.append(f"- {k}: {'PASS' if v and v.get('PASS') else 'FAIL'} {json.dumps(v)}")
    if s.get("pageErrors"): L.append(f"- page errors: {s['pageErrors']}")
    L += ["", "## Screens (problems only)"]
    for size, st in R["screens"].items():
        for n, r in st.items():
            probs = {k: v for k, v in r.items() if (isinstance(v, list) and v and k != 'pageErrors') or (k == "page" and v) or (k == 'pageErrors' and v)}
            if probs: L.append(f"- **{size} {n}**: " + "; ".join(f"{k}: {v if not isinstance(v, list) else ', '.join(map(str, v))}" for k, v in probs.items()))
    L += ["", "## Make tools (problems only)"]
    for t, r in R["tools"].items():
        p = []
        if r["open"] not in ("ok", "disabled"): p.append(r["open"])
        if r["pageErrors"]: p.append("page errors: " + "; ".join(r["pageErrors"]))
        if r["openAfterEscape"]: p.append("dialog still open after Escape")
        for d in (r["dialogs"] or []):
            if d["offscreenButtons"] or d["top"] < 0: p.append(f"dialog off-screen (top {d['top']}, bottom {d['bottom']}, buttons {d['offscreenButtons']})")
        if p: L.append(f"- **{t}**: " + " | ".join(p))
    L += ["", f"## Fold / 3D presets: {R['fold'].get('checked', 0)} checked, {len(R['fold'].get('flagged', []))} flagged"]
    for r in R["fold"].get("flagged", []): L.append("- " + json.dumps(r))
    if R["errors"]: L += ["", "## Checker errors", *("- " + e for e in R["errors"][:20])]
    open(f"{OUT}/summary.md", "w").write("\n".join(L))

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        for name, coro in [("safety", safety(b)), ("tools", tools(b)), ("fold", fold(b)),
                           ("s1280", screens(b, 1280, 600)), ("s1366", screens(b, 1366, 640)), ("s1536", screens(b, 1536, 730))]:
            try: await coro
            except Exception: R["errors"].append(name + ": " + traceback.format_exc()[-400:])
            print("done", name, flush=True)
        await b.close()
    json.dump(R, open(f"{OUT}/results.json", "w"), indent=1)
    summary(); print(open(f"{OUT}/summary.md").read()[:6000])
asyncio.run(main())
