/* EARTH 2049: SAVE SEED 7 — ARENA HUD. Plain DOM over the canvas, built on demand. Monospace only. */
'use strict';

AR.Hud = (() => {
  const { el } = AR;
  let root = null, built = false;
  const N = {};
  const CSS = `
#arHud{position:fixed;inset:0;pointer-events:none;z-index:40;display:none;font-family:Consolas,'Lucida Console',monospace;color:#fff;
  text-transform:uppercase;letter-spacing:.06em;text-shadow:0 2px 0 #000,0 0 6px rgba(0,0,0,.6);user-select:none}
#arHud.on{display:block}
#arHud .ch{position:absolute;left:50%;top:50%;width:0;height:0}
#arHud .ch i{position:absolute;background:#fff;box-shadow:0 0 0 1px #000}
#arHud .ch .t,#arHud .ch .b{width:2px;height:7px;left:-1px}#arHud .ch .l,#arHud .ch .r{height:2px;width:7px;top:-1px}
#arHud .ch .dot{width:2px;height:2px;left:-1px;top:-1px}
#arHud .hm{position:absolute;left:50%;top:50%;width:26px;height:26px;margin:-13px 0 0 -13px;opacity:0;transition:opacity .12s}
#arHud .hm:before,#arHud .hm:after{content:'';position:absolute;left:12px;top:-2px;width:2px;height:30px;background:#fff;transform:rotate(45deg);box-shadow:0 0 0 1px #000}
#arHud .hm:after{transform:rotate(-45deg)}#arHud .hm.crit:before,#arHud .hm.crit:after{background:#ffd400}#arHud .hm.kill:before,#arHud .hm.kill:after{background:#ff2b4a;width:3px}
#arHud .tl{position:absolute;left:18px;top:14px;font-size:13px;line-height:1.35}
#arHud .score{font-size:26px;font-weight:bold;color:#ffd400}
#arHud .sub{opacity:.85;font-size:12px}
#arHud .obj{margin-top:6px;color:#00e5ff;font-size:13px;max-width:360px}
#arHud .obj b{color:#fff}
#arHud .style{position:absolute;left:18px;top:34%;width:230px}
#arHud .rank{font-size:64px;font-weight:bold;line-height:.9;font-style:italic;transition:transform .15s}
#arHud .rankn{font-size:13px;margin-top:2px}
#arHud .meter{height:6px;background:rgba(0,0,0,.6);border:1px solid rgba(255,255,255,.35);margin-top:5px}
#arHud .meter i{display:block;height:100%;background:#fff;width:0}
#arHud .mult{font-size:12px;margin-top:4px;opacity:.9}
#arHud .streak{font-size:18px;color:#ff2bd6;margin-top:8px;font-weight:bold;min-height:22px}
#arHud .chat{position:absolute;right:14px;top:14px;width:290px;font-size:12px;line-height:1.35;background:linear-gradient(90deg,rgba(10,6,20,0),rgba(10,6,20,.55));
  padding:6px 8px;text-transform:none;letter-spacing:0}
#arHud .chat .hd{text-transform:uppercase;font-size:11px;letter-spacing:.1em;color:#ff4d6d;margin-bottom:3px}
#arHud .chat .hd b{background:#e0003c;color:#fff;padding:0 4px;margin-right:6px}
#arHud .chat .m{opacity:0;animation:arIn .18s forwards}
#arHud .chat .u{font-weight:bold}
@keyframes arIn{from{opacity:0;transform:translateX(12px)}to{opacity:1;transform:none}}
#arHud .bl{position:absolute;left:18px;bottom:16px;width:300px}
#arHud .bar{height:14px;background:rgba(0,0,0,.6);border:1px solid rgba(255,255,255,.4);position:relative;margin-top:4px}
#arHud .bar i{position:absolute;left:0;top:0;bottom:0;background:#ff2b6a;width:100%}
#arHud .bar.ar i{background:#4da6ff}#arHud .bar.sh i{background:#ff2bd6}
#arHud .bar span{position:absolute;right:4px;top:-1px;font-size:11px}
#arHud .hpnum{font-size:30px;font-weight:bold;line-height:1}
#arHud .pips{margin-top:6px;font-size:11px}
#arHud .pips b{display:inline-block;width:18px;height:6px;background:#00e5ff;margin-right:3px;box-shadow:0 0 6px #00e5ff}
#arHud .pips b.off{background:rgba(255,255,255,.18);box-shadow:none}
#arHud .pips b.n{background:#ff2bd6;box-shadow:0 0 6px #ff2bd6}
#arHud .br{position:absolute;right:18px;bottom:16px;text-align:right}
#arHud .ammo{font-size:44px;font-weight:bold;line-height:1}
#arHud .ammo small{font-size:18px;opacity:.7}
#arHud .ammo.low{color:#ff2b4a}
#arHud .wname{font-size:14px;color:#ffd400}
#arHud .wtag{font-size:10px;opacity:.7}
#arHud .reload{height:3px;background:#ffd400;width:0;margin-left:auto;margin-top:4px}
#arHud .other{font-size:11px;opacity:.6;margin-top:3px}
#arHud .bossbar{position:absolute;left:50%;top:16px;width:520px;margin-left:-260px;text-align:center;display:none}
#arHud .bossbar .bn{font-size:18px;font-weight:bold;color:#ff2bd6;letter-spacing:.2em}
#arHud .bossbar .bs{font-size:11px;opacity:.8}
#arHud .bossbar .bar{height:12px;margin-top:5px}
#arHud .bossbar .bar i{background:linear-gradient(90deg,#ff2bd6,#ffd400)}
#arHud .bossbar .bar.shield{box-shadow:0 0 10px #ff2bd6;border-color:#ff2bd6}
#arHud .banner{position:absolute;left:0;right:0;top:24%;text-align:center;opacity:0;transition:opacity .3s,transform .3s}
#arHud .banner.on{opacity:1}
#arHud .banner .bm{font-size:42px;font-weight:bold;letter-spacing:.14em;color:#fff}
#arHud .banner .bsu{font-size:14px;color:#ffd400;letter-spacing:.2em;margin-top:6px}
#arHud .toast{position:absolute;left:0;right:0;top:58%;text-align:center}
#arHud .toast div{font-size:18px;font-weight:bold;color:#ffd400;animation:arToast 1.3s forwards}
#arHud .toast div small{display:block;font-size:11px;color:#fff;opacity:.8}
@keyframes arToast{0%{opacity:0;transform:scale(1.4)}10%{opacity:1;transform:scale(1)}75%{opacity:1}100%{opacity:0;transform:translateY(-14px)}}
#arHud .subs{position:absolute;left:50%;bottom:92px;width:640px;margin-left:-320px;text-align:center;font-size:15px;text-transform:none;letter-spacing:.02em;line-height:1.4}
#arHud .subs b{color:#00e5ff;text-transform:uppercase;margin-right:6px}#arHud .subs b.riya{color:#ff2bd6}
#arHud .prompt{position:absolute;left:50%;top:62%;transform:translateX(-50%);font-size:14px;background:rgba(0,0,0,.6);padding:4px 10px;border:1px solid #ffd400;display:none}
#arHud .vig{position:absolute;inset:0;pointer-events:none;opacity:0;background:radial-gradient(ellipse at center,rgba(0,0,0,0) 55%,rgba(255,20,60,.75) 100%)}
#arHud .low{position:absolute;inset:0;opacity:0;background:radial-gradient(ellipse at center,rgba(0,0,0,0) 50%,rgba(120,0,20,.85) 100%);animation:arPulse 1s infinite}
@keyframes arPulse{50%{filter:brightness(1.5)}}
#arHud .dashfx{position:absolute;inset:0;opacity:0;background:radial-gradient(ellipse at center,rgba(0,0,0,0) 60%,rgba(0,229,255,.45) 100%)}
#arHud .dir{position:absolute;left:50%;top:50%;width:0;height:0}
#arHud .dir i{position:absolute;left:-40px;top:-150px;width:80px;height:24px;border-top:5px solid #ff2b4a;border-radius:50%;opacity:0;transform-origin:40px 150px;filter:drop-shadow(0 0 4px #ff2b4a)}
#arHud .wp{position:absolute;font-size:11px;text-align:center;transform:translate(-50%,-50%);white-space:nowrap}
#arHud .wp i{display:block;width:14px;height:14px;margin:0 auto 2px;border:2px solid #00e5ff;transform:rotate(45deg);box-shadow:0 0 8px #00e5ff}
#arHud .wp.ex i{border-color:#39ff8a;box-shadow:0 0 8px #39ff8a}
#arHud .wp.warn{color:#ff8c00}#arHud .wp.warn i{border-color:#ff8c00;box-shadow:0 0 8px #ff8c00}
#arScope{position:fixed;inset:0;pointer-events:none;z-index:39;display:none;background:radial-gradient(circle at center,rgba(0,0,0,0) 0,rgba(0,0,0,0) 33vh,#000 33.3vh)}
#arScope.on{display:block}
#arScope:before,#arScope:after{content:'';position:absolute;left:50%;top:17vh;bottom:17vh;width:1px;background:rgba(255,40,200,.8)}
#arScope:after{top:50%;bottom:auto;left:calc(50% - 33vh);width:66vh;height:1px}
#arDmg{position:fixed;inset:0;pointer-events:none;z-index:41;overflow:hidden}
.ardn{position:absolute;left:0;top:0;font-family:Consolas,monospace;font-weight:bold;font-size:15px;color:#fff;text-shadow:0 2px 0 #000;opacity:0;will-change:transform}
.ardn.crit{color:#ffd400;font-size:19px}.ardn.head{color:#ff2bd6;font-size:22px}.ardn.block{color:#4da6ff;font-size:12px}
.arov{position:fixed;inset:0;z-index:60;display:none;align-items:center;justify-content:center;flex-direction:column;background:rgba(6,3,14,.82);
  font-family:Consolas,'Lucida Console',monospace;color:#fff;text-transform:uppercase;letter-spacing:.06em}
.arov.on{display:flex}
.arov h1{font-size:34px;margin:0 0 4px;letter-spacing:.18em;color:#ffd400}
.arov h2{font-size:13px;margin:0 0 22px;opacity:.8;letter-spacing:.2em}
.arcards{display:flex;gap:18px;flex-wrap:wrap;justify-content:center}
.arcard{width:230px;min-height:250px;border:2px solid #555;background:linear-gradient(180deg,#1a1028,#0b0714);padding:16px;cursor:pointer;position:relative;
  transition:transform .12s,border-color .12s;box-shadow:0 0 0 1px #000}
.arcard:hover,.arcard.sel{transform:translateY(-6px) scale(1.03);border-color:#ffd400}
.arcard .r{font-size:10px;letter-spacing:.2em}
.arcard .n{font-size:19px;font-weight:bold;margin:10px 0 4px;color:#fff}
.arcard .s{font-size:10px;color:#ff2bd6;letter-spacing:.14em}
.arcard .d{font-size:13px;margin-top:14px;text-transform:none;letter-spacing:.01em;line-height:1.4;color:#ddd}
.arcard .k{position:absolute;bottom:10px;right:12px;font-size:11px;opacity:.6}
.arcard.r0{border-color:#3a6}.arcard.r1{border-color:#48f}.arcard.r2{border-color:#f2b}
.arcard .stat{font-size:11px;margin-top:6px;text-transform:uppercase}
.arcard .stat i{display:inline-block;height:6px;background:#ffd400;vertical-align:middle;margin-left:6px}
.arbtns{margin-top:24px;display:flex;gap:14px}
.arbtn{pointer-events:auto;font-family:inherit;font-size:14px;padding:10px 20px;background:#1a1028;color:#fff;border:2px solid #9b59ff;cursor:pointer;letter-spacing:.14em;text-transform:uppercase}
.arbtn:hover{background:#9b59ff}.arbtn.y{border-color:#ffd400}.arbtn.y:hover{background:#ffd400;color:#000}
.arres{width:min(720px,92vw)}
.arres .grade{font-size:56px;font-weight:bold;color:#ff2bd6;text-align:center;letter-spacing:.12em}
.arres table{width:100%;margin-top:14px;font-size:14px;border-collapse:collapse}
.arres td{padding:5px 4px;border-bottom:1px solid rgba(255,255,255,.1)}
.arres td:last-child{text-align:right;color:#ffd400}
.arres .tot td{font-size:18px;border-bottom:none;padding-top:10px}
.arres .gt{text-align:center;margin-top:12px;color:#39ff8a;font-size:16px}
@media (max-height:620px){#arHud{font-size:11px}#arHud .score{font-size:18px}#arHud .rank{font-size:40px}#arHud .chat{width:220px;font-size:10px}
  #arHud .chat .msgs .m:nth-last-child(n+7){display:none}#arHud .banner .bm{font-size:26px}#arHud .ammo{font-size:30px}#arHud .hpnum{font-size:20px}
  #arHud .style{top:30%}#arHud .subs{font-size:12px;bottom:70px}.arres .grade{font-size:30px}.arres table{font-size:11px}.arres td{padding:2px 4px}
  .arcard{width:180px;min-height:170px;padding:10px}.arcard .n{font-size:15px}.arcard .d{font-size:11px;margin-top:8px}.arov h1{font-size:22px}}
.arov{overflow:auto}
/* XP bar: chips are XP */
#arHud .xp{position:absolute;left:50%;bottom:14px;width:min(46vw,560px);transform:translateX(-50%);display:flex;align-items:center;gap:8px}
#arHud .xp .lv{font-size:15px;font-weight:bold;color:#ffd400;min-width:58px;text-align:right;transition:transform .15s}
#arHud .xp .lv.pop{transform:scale(1.6);color:#fff}
#arHud .xpbar{flex:1;height:10px;background:rgba(0,0,0,.65);border:1px solid rgba(255,212,0,.55);position:relative;overflow:hidden;box-shadow:0 0 8px rgba(255,212,0,.25)}
#arHud .xpbar i{position:absolute;left:0;top:0;bottom:0;width:0;background:linear-gradient(90deg,#ff9d00,#ffd400 60%,#fff6a8);transition:width .18s ease-out;box-shadow:0 0 10px #ffd400}
#arHud .xpbar.gain{border-color:#fff;box-shadow:0 0 16px #ffd400}
#arHud .xpbar.full i{background:#fff}
#arHud .xp .xg{font-size:11px;color:#fff6a8;min-width:40px;opacity:0}
#arHud .xp .xg.on{animation:arXg .5s}
@keyframes arXg{0%{opacity:1;transform:translateY(0)}100%{opacity:0;transform:translateY(-10px)}}
/* level-up burst */
#arHud .lvup{position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;overflow:hidden}
#arHud .lvup.on{display:flex}
#arHud .lvup .flash{position:absolute;inset:0;background:radial-gradient(circle at 50% 55%,rgba(255,250,200,.95),rgba(255,212,0,.55) 30%,rgba(255,43,214,.15) 60%,rgba(0,0,0,0) 80%);animation:arLvFlash 1.2s forwards}
#arHud .lvup .ring{position:absolute;left:50%;top:55%;width:40px;height:40px;margin:-20px;border:6px solid #ffd400;border-radius:50%;box-shadow:0 0 30px #ffd400,inset 0 0 20px #ffd400;animation:arLvRing .9s ease-out forwards}
#arHud .lvup .ring.r2{border-color:#00e5ff;box-shadow:0 0 30px #00e5ff;animation-delay:.12s;opacity:0}
#arHud .lvup .rays{position:absolute;left:50%;top:55%;width:180vmax;height:180vmax;margin:-90vmax;background:repeating-conic-gradient(rgba(255,212,0,.22) 0 6deg,rgba(0,0,0,0) 6deg 18deg);animation:arLvRays 1.3s forwards;
  -webkit-mask:radial-gradient(circle,#000 0,#000 18%,transparent 55%);mask:radial-gradient(circle,#000 0,#000 18%,transparent 55%)}
#arHud .lvup .big{position:relative;font-size:min(13vw,120px);font-weight:900;font-style:italic;letter-spacing:.06em;line-height:1;color:#fff;
  text-shadow:4px 0 0 #ff2bd6,-4px 0 0 #00e5ff,0 0 30px #ffd400,0 6px 0 #000;animation:arLvBig 1.25s cubic-bezier(.2,1.6,.4,1) forwards}
#arHud .lvup .num{position:relative;font-size:min(6vw,52px);font-weight:bold;color:#ffd400;letter-spacing:.3em;margin-top:6px;animation:arLvNum 1.25s forwards}
#arHud .lvup .spark{position:absolute;width:6px;height:6px;background:#fff;box-shadow:0 0 10px #ffd400,0 0 4px #fff;animation:arSpark 1.1s ease-out forwards}
@keyframes arLvFlash{0%{opacity:0}8%{opacity:1}100%{opacity:0}}
@keyframes arLvRing{0%{transform:scale(.2);opacity:1}100%{transform:scale(22);opacity:0}}
@keyframes arLvRays{0%{opacity:0;transform:rotate(0) scale(.6)}15%{opacity:1}100%{opacity:0;transform:rotate(40deg) scale(1.1)}}
@keyframes arLvBig{0%{transform:scale(3) skewX(-12deg);opacity:0;filter:blur(8px)}18%{transform:scale(.9) skewX(-8deg);opacity:1;filter:none}28%{transform:scale(1.08) skewX(-8deg)}75%{transform:scale(1) skewX(-8deg);opacity:1}100%{transform:scale(1.25) skewX(-8deg) translateY(-40px);opacity:0}}
@keyframes arLvNum{0%,15%{opacity:0;transform:translateY(20px)}30%{opacity:1;transform:none}80%{opacity:1}100%{opacity:0}}
@keyframes arSpark{0%{transform:translate(0,0) scale(1.4);opacity:1}100%{transform:translate(var(--dx),var(--dy)) scale(.2);opacity:0}}
/* the card screen: light rays, flip-in cards, rarity glows, a pick that lands */
.arov.fx{background:radial-gradient(ellipse at 50% 45%,rgba(60,20,90,.88),rgba(4,2,10,.95) 70%);perspective:1100px}
.arov.fx .rays{position:absolute;left:50%;top:46%;width:200vmax;height:200vmax;margin:-100vmax;pointer-events:none;z-index:-1;
  background:repeating-conic-gradient(rgba(255,212,0,.07) 0 5deg,rgba(0,0,0,0) 5deg 15deg);animation:arSpin 26s linear infinite}
.arov.fx.level .rays{background:repeating-conic-gradient(rgba(255,212,0,.14) 0 5deg,rgba(255,43,214,.05) 5deg 10deg,rgba(0,0,0,0) 10deg 15deg)}
@keyframes arSpin{to{transform:rotate(360deg)}}
.arov.fx h1{font-size:46px;font-style:italic;background:linear-gradient(90deg,#ffd400,#fff,#ff2bd6,#00e5ff,#ffd400);background-size:300% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;
  animation:arTitle 2.4s linear infinite,arTitleIn .55s cubic-bezier(.2,1.6,.4,1);filter:drop-shadow(0 4px 0 #000)}
@keyframes arTitle{to{background-position:300% 0}}
@keyframes arTitleIn{from{transform:scale(2.2);opacity:0}to{transform:none;opacity:1}}
.arov.fx .arcards{transform-style:preserve-3d}
.arov.fx .arcard{overflow:hidden;transition:transform .5s cubic-bezier(.2,1.3,.4,1),opacity .35s,border-color .12s}
.arov.fx .arcard.pre{opacity:0;transform:translateY(90px) rotateY(100deg) scale(.7)}
.arov.fx .arcard:after{content:'';position:absolute;top:0;bottom:0;left:-60%;width:40%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.35),transparent);transform:skewX(-18deg);animation:arShine 1.6s .5s ease-out;pointer-events:none}
@keyframes arShine{from{left:-60%}to{left:140%}}
.arov.fx .arcard.r1{box-shadow:0 0 22px rgba(68,170,255,.45);animation:arPulseB 1.6s 1s infinite}
@keyframes arPulseB{50%{box-shadow:0 0 36px rgba(68,170,255,.85)}}
.arov.fx .arcard.r2{border-color:transparent;background:linear-gradient(180deg,#2a0f38,#0b0714) padding-box,conic-gradient(from var(--a,0deg),#ff2bd6,#ffd400,#39ff8a,#00e5ff,#9b59ff,#ff2bd6) border-box;
  box-shadow:0 0 34px rgba(255,43,214,.6);animation:arHue 3s linear infinite}
@property --a{syntax:'<angle>';inherits:false;initial-value:0deg}
@keyframes arHue{to{--a:360deg}}
.arov.fx .arcard.r2 .r{text-shadow:0 0 10px #ff2bd6}
.arov.fx .arcard:hover,.arov.fx .arcard.sel{transform:translateY(-10px) scale(1.06) rotateX(4deg)}
.arov.fx .arcard.chosen{animation:arChosen .6s forwards!important;z-index:3}
.arov.fx .arcard.gone{animation:arGone .45s forwards!important}
@keyframes arChosen{0%{transform:scale(1.06)}30%{transform:scale(1.22);filter:brightness(2.2);box-shadow:0 0 80px #fff}100%{transform:scale(1.12);filter:brightness(1.2)}}
@keyframes arGone{to{opacity:0;transform:translateY(120px) rotate(8deg) scale(.8)}}
.arcard .stamp{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) rotate(-14deg) scale(3);opacity:0;font-size:28px;font-weight:900;color:#ffd400;border:4px solid #ffd400;padding:4px 10px;
  text-shadow:0 0 12px #ffd400;animation:arStamp .35s .12s cubic-bezier(.2,1.6,.4,1) forwards;background:rgba(0,0,0,.55)}
@keyframes arStamp{to{opacity:1;transform:translate(-50%,-50%) rotate(-14deg) scale(1)}}
.arov.fx .sp{position:absolute;width:5px;height:5px;background:#ffd400;box-shadow:0 0 8px #ffd400;pointer-events:none;animation:arFloat linear infinite;opacity:.8}
@keyframes arFloat{from{transform:translateY(0)}to{transform:translateY(-110vh)}}
#arLetter{position:fixed;left:0;right:0;z-index:38;pointer-events:none}
#arLetter:before,#arLetter:after{content:'';position:fixed;left:0;right:0;height:0;background:#000;transition:height .5s}
#arLetter:before{top:0}#arLetter:after{bottom:0}
#arLetter.on:before,#arLetter.on:after{height:11vh}
`;

  function build() {
    if (built) return; built = true;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    root = document.createElement('div'); root.id = 'arHud';
    root.innerHTML = `
      <div class="vig"></div><div class="low"></div><div class="dashfx"></div>
      <div class="ch"><i class="t"></i><i class="b"></i><i class="l"></i><i class="r"></i><i class="dot"></i></div>
      <div class="hm"></div><div class="dir"></div><div class="wps"></div>
      <div class="tl"><div class="score">0</div><div class="sub"><span class="chips">0</span> GIGATECH // <span class="viewers">VIEWERS 48.2K</span></div>
        <div class="obj"></div></div>
      <div class="style"><div class="rank">D</div><div class="rankn">LURKER</div><div class="meter"><i></i></div><div class="mult">x1.0 CLOUT</div><div class="streak"></div></div>
      <div class="chat"><div class="hd"><b>LIVE</b>RIYA VEX // CONTROLLED RIOT</div><div class="msgs"></div></div>
      <div class="bossbar"><div class="bn"></div><div class="bs"></div><div class="bar"><i></i></div></div>
      <div class="banner"><div class="bm"></div><div class="bsu"></div></div>
      <div class="toast"></div><div class="subs"></div><div class="prompt"></div><div class="lvup"></div>
      <div class="xp"><span class="xg"></span><b class="lv">LV 1</b><div class="xpbar"><i></i></div><span class="xg"></span></div>
      <div class="bl"><div class="hpnum">100</div><div class="bar sh" style="display:none"><i></i></div><div class="bar hp"><i></i><span>HP</span></div><div class="bar ar"><i></i><span>ARMOR</span></div>
        <div class="pips"><span class="dashp"></span> &nbsp; <span class="nadep"></span> HYPE NADE</div></div>
      <div class="br"><div class="ammo">12<small> / ∞</small></div><div class="reload"></div><div class="wname">VOLT-9</div><div class="wtag"></div><div class="other"></div></div>`;
    document.body.appendChild(root);
    N.xpLv = root.querySelector('.xp .lv'); N.xpBar = root.querySelector('.xpbar'); N.xpFill = root.querySelector('.xpbar i'); N.xpG = root.querySelectorAll('.xp .xg')[1];
    N.lvup = root.querySelector('.lvup');
    for (const k of ['score', 'chips', 'viewers', 'obj', 'rank', 'rankn', 'mult', 'streak', 'msgs', 'bossbar', 'banner', 'toast', 'subs', 'prompt', 'hpnum', 'ammo', 'reload', 'wname', 'wtag', 'other', 'vig', 'low', 'dashfx', 'dir', 'wps', 'hm', 'ch', 'dashp', 'nadep'])
      N[k] = root.querySelector('.' + k);
    N.meter = root.querySelector('.meter i'); N.hp = root.querySelector('.bar.hp i'); N.ar = root.querySelector('.bar.ar i'); N.sh = root.querySelector('.bar.sh');
    N.bossHp = N.bossbar.querySelector('.bar i'); N.bossBarEl = N.bossbar.querySelector('.bar');
    N.chL = root.querySelector('.ch .l'); N.chR = root.querySelector('.ch .r'); N.chT = root.querySelector('.ch .t'); N.chB = root.querySelector('.ch .b');
    for (let i = 0; i < 6; i++) N.dir.appendChild(document.createElement('i'));
    for (const id of ['arScope', 'arDmg', 'arLetter']) if (!el(id)) { const d = document.createElement('div'); d.id = id; document.body.appendChild(d); }
    // overlays
    for (const id of ['arCards', 'arResults', 'arPause']) { const d = document.createElement('div'); d.id = id; d.className = 'arov'; document.body.appendChild(d); }
  }
  function show(v) { build(); root.classList.toggle('on', v); if (!v) { for (const id of ['arCards', 'arResults', 'arPause']) el(id).classList.remove('on'); el('arScope').classList.remove('on'); } }

  /* ------------------------------------------------------------------ per frame */
  let hmT = 0, vig = 0, dashT = 0, dirs = [];
  const proj = AR.V3();
  function update(dt) {
    const P = AR.Player.P; if (!P || !root) return;
    // crosshair gap from current spread
    const sp = AR.Player.spread();
    const px = Math.max(3, Math.tan(sp) / Math.tan(AR.camera.fov * Math.PI / 360) * innerHeight / 2);
    N.chL.style.left = (-px - 7) + 'px'; N.chR.style.left = px + 'px'; N.chT.style.top = (-px - 7) + 'px'; N.chB.style.top = px + 'px';
    N.ch.style.opacity = AR.Player.gunFeel ? 1 - P.ads : (P.ads > 0.6 && AR.Player.gun?.d.scope ? 0 : 1 - P.ads * 0.5);
    hmT -= dt; if (hmT <= 0) N.hm.style.opacity = 0;
    // health
    N.hpnum.textContent = Math.ceil(P.hp);
    N.hpnum.style.color = P.hp < P.maxHp * 0.3 ? '#ff2b4a' : '#fff';
    N.hp.style.width = (P.hp / P.maxHp * 100) + '%'; N.ar.style.width = (P.armor / P.maxArmor * 100) + '%';
    if (AR.Player.S.overshield) { N.sh.style.display = 'block'; N.sh.firstChild.style.width = (P.shield / AR.Player.S.overshield * 100) + '%'; }
    N.low.style.opacity = P.hp < P.maxHp * 0.3 ? (1 - P.hp / (P.maxHp * 0.3)) * 0.9 : 0;
    vig = Math.max(0, vig - dt * 2.2); N.vig.style.opacity = vig;
    dashT = Math.max(0, dashT - dt * 4); N.dashfx.style.opacity = dashT;
    // pips
    const S = AR.Player.S;
    let dp = '';
    if (S.dashMode) { dp = 'DASH '; for (let i = 0; i < S.dashes; i++) dp += `<b class="${i < P.dashCharges ? '' : 'off'}"></b>`; }
    else dp = `<span style="color:${P.sprinting ? '#00e5ff' : 'rgba(255,255,255,.55)'}">${P.sprinting ? '» SPRINTING' : 'SPRINT'}</span>`;
    if (N.dashp._h !== dp) { N.dashp.innerHTML = dp; N.dashp._h = dp; }
    let np = ''; for (let i = 0; i < 2; i++) np += `<b class="n ${i < P.nades ? '' : 'off'}"></b>`;
    if (N.nadep._h !== np) { N.nadep.innerHTML = np; N.nadep._h = np; }
    // ammo
    const g = AR.Player.gun;
    if (g) {
      const mag = AR.Player.magSize(g);
      const txt = `${g.ammo}<small> / ${g.reserve === Infinity ? '∞' : g.reserve}</small>`;
      if (N.ammo._h !== txt) { N.ammo.innerHTML = txt; N.ammo._h = txt; }
      N.ammo.classList.toggle('low', g.ammo <= Math.ceil(mag * 0.25));
      N.reload.style.width = g.reloading ? (g.d.shellReload || AR.Player.gunFeel ? g.ammo / mag * 120 : (1 - g.reloadT / (g.d.reload * S.reload)) * 120) + 'px' : '0';
    }
    // damage direction arcs fade
    dirs.forEach((d, i) => { d.t -= dt; const n = N.dir.children[i]; if (n) { n.style.opacity = Math.max(0, d.t); n.style.transform = `rotate(${P.yaw - d.a}rad)`; } });
    // waypoints
    waypoints();
    // boss bar
    if (bossE) {
      N.bossHp.style.width = Math.max(0, bossE.hp / bossE.maxHp * 100) + '%';
      N.bossBarEl.classList.toggle('shield', AR.Boss.shielded());
      if (bossE.dying) { N.bossbar.style.display = 'none'; bossE = null; }
    }
  }
  function waypoints() {
    const W = AR.Mission?.waypoints?.() || [];
    while (N.wps.children.length < W.length) { const d = document.createElement('div'); d.className = 'wp'; d.innerHTML = '<i></i><span></span>'; N.wps.appendChild(d); }
    const P = AR.Player.P, cam = AR.camera;
    for (let i = 0; i < N.wps.children.length; i++) {
      const n = N.wps.children[i], w = W[i];
      if (!w) { n.style.display = 'none'; continue; }
      n.style.display = 'block';
      n.className = 'wp ' + (w.cls || '');
      proj.set(w.x, w.y, w.z).project(cam);
      let x = proj.x, y = proj.y;
      const behind = proj.z > 1;
      if (behind) { x = -x; y = -y; }
      const m = 0.9;
      if (behind || Math.abs(x) > m || Math.abs(y) > m) { const k = m / Math.max(Math.abs(x), Math.abs(y)); x *= k; y *= k; }
      n.style.left = ((x * 0.5 + 0.5) * innerWidth) + 'px'; n.style.top = ((-y * 0.5 + 0.5) * innerHeight) + 'px';
      const d = Math.hypot(w.x - P.body.pos.x, w.y - P.body.pos.y, w.z - P.body.pos.z);
      const t = `${w.label} ${Math.round(d)}M`;
      if (n._t !== t) { n.lastChild.textContent = t; n._t = t; }
    }
  }

  /* ------------------------------------------------------------------ events */
  function hitmark(crit, kill) {
    if (!N.hm) return;
    N.hm.className = 'hm' + (kill ? ' kill' : crit ? ' crit' : '');
    N.hm.style.opacity = 1; hmT = kill ? 0.25 : 0.1;
    N.hm.style.transform = kill ? 'scale(1.35)' : 'scale(1)';
  }
  function hurt(amount, from) {
    vig = Math.min(1, vig + 0.25 + amount / 40);
    if (from && AR.Player.P) {
      const P = AR.Player.P;
      const a = Math.atan2(-(from.x - P.body.pos.x), -(from.z - P.body.pos.z));
      dirs.push({ a, t: 1.2 });
      if (dirs.length > 6) dirs.shift();
    }
  }
  function flash(kind) { if (kind === 'dash') dashT = 1; }
  function weapon(g, P) {
    if (!N.wname || !g) return;
    const ti = AR.Arsenal.tierInfo(g.tier || 0);
    N.wname.textContent = (g.id === 'pistol' ? '' : ti.p + ' ') + g.d.name; N.wname.style.color = ti.c; N.wtag.textContent = (g.id === 'pistol' ? '' : ti.n + ' // ') + g.d.tag;
    const o = P.guns[P.cur === 0 ? 1 : 0];
    N.other.textContent = o ? `[Q] ${o.d.name}` : '';
  }
  function toast(t, s) {
    if (!N.toast) return;
    const d = document.createElement('div'); d.innerHTML = `${t}<small>${s || ''}</small>`;
    N.toast.innerHTML = ''; N.toast.appendChild(d);
  }
  let banT = null;
  function banner(m, s, dur = 2.6) {
    N.banner.querySelector('.bm').textContent = m; N.banner.querySelector('.bsu').textContent = s || '';
    N.banner.classList.add('on');
    clearTimeout(banT); banT = setTimeout(() => N.banner.classList.remove('on'), dur * 1000);
  }
  function prompt(t) {
    if (!N.prompt) return;
    if (t && window.Pad?.active) t = t.replace('[E]', '[X]');
    if (t) { if (N.prompt.textContent !== t) N.prompt.textContent = t; N.prompt.style.display = 'block'; } else N.prompt.style.display = 'none';
  }
  let subT = null;
  function say(who, text, dur) {
    N.subs.innerHTML = `<b class="${who === 'RIYA' ? 'riya' : ''}">${who}</b>${text}`;
    clearTimeout(subT); subT = setTimeout(() => { N.subs.innerHTML = ''; }, (dur || Math.max(2.6, text.length * 0.055)) * 1000);
  }
  const COLORS = ['#ff4d6d', '#ffd400', '#39ff8a', '#00e5ff', '#ff2bd6', '#9b59ff', '#ff8c00', '#8ad'];
  function chat(user, text, col) {
    if (!N.msgs) return;
    const d = document.createElement('div'); d.className = 'm';
    const c = col || COLORS[[...user].reduce((a, ch) => a + ch.charCodeAt(0), 0) % COLORS.length];
    d.innerHTML = `<span class="u" style="color:${c}">${user}</span>: ${text}`;
    N.msgs.appendChild(d);
    while (N.msgs.children.length > 10) N.msgs.firstChild.remove();
  }
  function score(s, chips, viewers) {
    if (!N.score) return;
    N.score.textContent = Math.round(s).toLocaleString('en-US');
    N.chips.textContent = chips;
    N.viewers.textContent = 'VIEWERS ' + (viewers >= 1e6 ? (viewers / 1e6).toFixed(2) + 'M' : (viewers / 1e3).toFixed(1) + 'K');
  }
  function objective(html) { if (N.obj) N.obj.innerHTML = html; }
  function style(rankIdx, frac, streak) {
    const R = AR.RANKS[rankIdx];
    if (N.rank.textContent !== R.k) {
      N.rank.textContent = R.k; N.rankn.textContent = R.n; N.rank.style.color = R.col; N.mult.textContent = `x${R.mult.toFixed(1)} CLOUT`;
      N.rank.style.transform = 'scale(1.45)'; setTimeout(() => { N.rank.style.transform = ''; }, 160);
    }
    N.meter.style.width = (frac * 100) + '%'; N.meter.style.background = R.col;
    if (streak !== undefined) N.streak.textContent = streak;
  }
  let bossE = null;
  function boss(e, name, sub) {
    bossE = e;
    N.bossbar.style.display = 'block';
    N.bossbar.querySelector('.bn').textContent = name; N.bossbar.querySelector('.bs').textContent = sub;
  }
  function warn() { toast('CHARGE INCOMING', 'sidestep'); }
  function letterbox(on) { el('arLetter').classList.toggle('on', on); }

  /* ------------------------------------------------------------------ overlays */
  function cards(title, sub, items, onPick, extra, o = {}) {
    const ov = el('arCards');
    const fx = o.kind === 'level' || o.kind === 'sponsor';
    ov.className = 'arov' + (fx ? ' fx ' + o.kind : '');
    const hint = window.Pad?.active ? 'D-PAD TO CHOOSE // A TO SIGN' : 'CLICK A CARD OR PRESS 1 / 2 / 3';
    ov.innerHTML = `${fx ? '<div class="rays"></div>' : ''}<h1>${title}</h1><h2>${sub}</h2><div class="arcards"></div><div class="arbtns"></div><div style="margin-top:14px;font-size:11px;opacity:.6">${hint}</div>`;
    if (o.kind === 'level') for (let i = 0; i < 26; i++) {
      const p = document.createElement('i'); p.className = 'sp';
      p.style.left = (Math.random() * 100) + '%'; p.style.top = (100 + Math.random() * 30) + '%';                  // NOSONAR - decoration
      p.style.animationDuration = (3 + Math.random() * 4) + 's'; p.style.animationDelay = (-Math.random() * 6) + 's';  // NOSONAR
      if (i % 3 === 0) { p.style.background = '#ff2bd6'; p.style.boxShadow = '0 0 8px #ff2bd6'; }
      ov.appendChild(p);
    }
    const wrap = ov.querySelector('.arcards');
    let ready = !fx;
    items.forEach((it, i) => {
      const c = document.createElement('div');
      c.className = 'arcard r' + (it.r ?? 0);
      c.style.pointerEvents = 'auto';
      if (fx) { c.classList.add('pre'); setTimeout(() => c.classList.remove('pre'), 180 + i * 130); }
      c.innerHTML = it.html;
      c.onclick = () => done(i);
      c.onmouseenter = () => { if (ready) AR.Sfx.cardHover?.(); };
      wrap.appendChild(c);
      if (fx) setTimeout(() => AR.Sfx.cardDeal?.(i, it.r ?? 0), (180 + i * 130));
    });
    // a short lockout: the trigger finger from the fight shouldn't sign the first card it lands on
    if (fx) setTimeout(() => { ready = true; }, 180 + items.length * 130 + 260);
    const btns = ov.querySelector('.arbtns');
    if (extra) for (const b of extra) { const x = document.createElement('button'); x.className = 'arbtn'; x.textContent = b.t; x.onclick = () => { if (ready) b.fn(); }; btns.appendChild(x); }
    let closed = false;
    const key = e => { if (['Digit1', 'Digit2', 'Digit3'].includes(e.code)) { e.stopPropagation(); done(+e.code.slice(-1) - 1); } };
    function done(i) {
      if (closed || !items[i] || !ready) return; closed = true;
      removeEventListener('keydown', key, true);
      if (!fx) { ov.classList.remove('on'); onPick(i); return; }
      const cs = [...wrap.children];
      cs.forEach((c, k) => c.classList.add(k === i ? 'chosen' : 'gone'));
      const st = document.createElement('div'); st.className = 'stamp'; st.textContent = 'SIGNED'; cs[i].appendChild(st);
      AR.Sfx.cardPick?.(items[i].r ?? 0);
      window.Pad?.rumble(0.5, 0.8, 220);
      setTimeout(() => { ov.classList.remove('on'); onPick(i); }, 620);
    }
    addEventListener('keydown', key, true);
    ov.classList.add('on');
    return { close: () => { closed = true; removeEventListener('keydown', key, true); ov.classList.remove('on'); } };
  }
  /* XP bar + level-up burst */
  let xpPopT = null;
  function xp(level, frac, gained, leveled) {
    if (!N.xpBar) return;
    const t = `LV ${level}`;
    if (N.xpLv.textContent !== t) { N.xpLv.textContent = t; }
    N.xpFill.style.width = (Math.max(0, Math.min(1, frac)) * 100) + '%';
    if (gained) {
      N.xpBar.classList.add('gain'); clearTimeout(xpPopT); xpPopT = setTimeout(() => N.xpBar.classList.remove('gain'), 140);
      N.xpG.textContent = '+' + gained + ' XP'; N.xpG.classList.remove('on'); void N.xpG.offsetWidth; N.xpG.classList.add('on');
    }
    if (leveled) { N.xpLv.classList.add('pop'); setTimeout(() => N.xpLv.classList.remove('pop'), 300); }
  }
  let lvT = null;
  function levelUp(level) {
    if (!N.lvup) return;
    let sp = '';
    for (let i = 0; i < 34; i++) {
      const a = Math.random() * Math.PI * 2, d = 160 + Math.random() * 420;                                     // NOSONAR - decoration
      sp += `<i class="spark" style="left:50%;top:55%;--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d}px;animation-delay:${(Math.random() * 0.15).toFixed(2)}s;${i % 3 ? '' : 'background:#ffd400'}"></i>`;  // NOSONAR
    }
    N.lvup.innerHTML = `<div class="flash"></div><div class="rays"></div><div class="ring"></div><div class="ring r2"></div>${sp}<div class="big">LEVEL UP!</div><div class="num">LV ${level}</div>`;
    N.lvup.classList.remove('on'); void N.lvup.offsetWidth; N.lvup.classList.add('on');
    clearTimeout(lvT); lvT = setTimeout(() => N.lvup.classList.remove('on'), 1350);
  }
  function results(data, onRetry, onHaven) {
    const ov = el('arResults');
    const rows = data.rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('');
    ov.innerHTML = `<div class="arres"><h1 style="text-align:center">${data.title}</h1><h2 style="text-align:center">${data.sub}</h2>
      <div class="grade">${data.grade}</div><table>${rows}<tr class="tot"><td>SCORE</td><td>${Math.round(data.score).toLocaleString('en-US')}</td></tr></table>
      <div class="gt">+${data.gt} GIGATECH BANKED${data.best ? ' // NEW PERSONAL BEST' : ''}</div>
      <div class="arbtns" style="justify-content:center"><button class="arbtn y" id="arRetry">${data.retryLabel}</button><button class="arbtn" id="arHaven">RETURN TO HAVEN</button></div></div>`;
    ov.querySelector('#arRetry').onclick = onRetry; ov.querySelector('#arHaven').onclick = onHaven;
    ov.classList.add('on');
  }
  function pause(on, onResume, onQuit) {
    const ov = el('arPause');
    if (!on) { ov.classList.remove('on'); return; }
    ov.innerHTML = `<h1>PAUSED</h1><h2>THE STREAM IS STILL LIVE</h2>
      <div style="font-size:12px;line-height:1.9;text-align:left;opacity:.85;text-transform:none;letter-spacing:.02em">
      WASD move &middot; SPACE jump (again in the air) &middot; SHIFT sprint (dash with JET DASH) &middot; CTRL / C slide (while sprinting)<br>
      LMB fire &middot; RMB aim &middot; R reload &middot; Q / wheel / 1 2 swap &middot; F kick &middot; G hype grenade &middot; E pick up<br>
      <b>CONTROLLER</b>: LS move &middot; RS look &middot; RT fire &middot; LT aim &middot; A jump &middot; B crouch / slide &middot; X pick up / reload &middot; Y swap &middot; RB kick &middot; LB grenade &middot; L3 sprint &middot; START pause</div>
      <div class="arbtns"><button class="arbtn y" id="arRes">RESUME</button><button class="arbtn" id="arQuit">ABANDON RUN</button></div>`;
    ov.querySelector('#arRes').onclick = onResume; ov.querySelector('#arQuit').onclick = onQuit;
    ov.classList.add('on');
  }

  return { build, show, update, hitmark, hurt, flash, weapon, toast, banner, prompt, say, chat, score, objective, style, boss, warn, letterbox, cards, results, pause, xp, levelUp };
})();
