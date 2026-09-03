(function(){
  "use strict";

  var $ = function(s){ return document.querySelector(s); };
  var homeEl = $("#home"), gameEl = $("#game"), resultEl = $("#result"), infoEl = $("#info");
  var itemsEl = $("#items"), runnerEl = $("#runner"), worldEl = $("#world");
  var msgEl = $("#msg"), hintEl = worldEl.querySelector("em");
  var timeEl = $("#time"), batEl = $("#bat"), scoreEl = $("#score");
  var fillEl = $("#fill"), barEl = document.querySelector(".bar");
  var distEl = $("#dist"), bestEl = $("#best");
  var bestScoreEl = $("#bestScore"), playsEl = $("#plays");

  var ROUND_SECONDS = 90;
  var LANE_X = [22, 50, 78]; // percent, left/center/right lane centers
  var BASE_SPEED = 32;       // starting m/s-equivalent
  var SPEED_TIER_SECONDS = 10; // speed steps up once per this many seconds
  var SPEED_TIER_STEP = 6;     // amount added per tier
  var MILESTONE_BUMP = 5;      // instant speed jump on crossing a distance milestone
  var MILESTONES = [500, 1000, 2000];
  var RUNNER_ROW = 82;       // percent-of-world where collisions resolve
  var HIT_TOLERANCE = 8;

  var ITEM_TYPES = {
    solar:   { emoji:"☀️", kind:"good", score:18, battery: 7  },
    battery: { emoji:"🔋", kind:"good", score:30, battery: 14 },
    coin:    { emoji:"💰", kind:"good", score:45, battery: 0  },
    spark:   { emoji:"⚡", kind:"bad",  score:0,  battery:-14 },
    cloud:   { emoji:"☁️", kind:"bad",  score:0,  battery:-8  },
    monster: { emoji:"💥", kind:"bad",  score:0,  battery:-20 }
  };
  // Spawn mix shifts from mostly-collectible to noticeably-harder over the round.
  var SPAWN_WEIGHTS_START = { solar:25, battery:20, coin:19, spark:12, cloud:13, monster:12 };
  var SPAWN_WEIGHTS_END   = { solar:20, battery:18, coin:16, spark:16, cloud:16, monster:15 };

  var META_KEY = "battery-run-meta";
  var meta = { muted:false, best:0, bestScore:0, plays:0 };
  function loadMeta(){
    try{
      var raw = localStorage.getItem(META_KEY);
      if(raw) Object.assign(meta, JSON.parse(raw));
    }catch(e){}
  }
  function saveMeta(){
    try{ localStorage.setItem(META_KEY, JSON.stringify(meta)); }catch(e){}
  }

  var audioCtx = null;
  function blip(freq, gain, dur){
    if(meta.muted) return;
    try{
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      var o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = "sine";
      o.frequency.value = freq || 600;
      g.gain.value = gain || 0.05;
      o.connect(g); g.connect(audioCtx.destination);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + (dur || 0.15));
      o.start(); o.stop(audioCtx.currentTime + (dur || 0.16));
    }catch(e){}
  }

  var state = null, rafId = null, lastTime = 0, spawnTimer = 0;

  function showScreen(el){
    [homeEl, gameEl, resultEl, infoEl].forEach(function(s){ s.classList.remove("active"); });
    el.classList.add("active");
  }

  function laneLeft(l){ return LANE_X[l]; }

  function speedTier(){
    return Math.floor(state.elapsed / SPEED_TIER_SECONDS);
  }

  function currentSpeed(){
    return BASE_SPEED + speedTier() * SPEED_TIER_STEP + state.speedBump;
  }

  function positionRunner(){
    runnerEl.style.left = laneLeft(state.lane) + "%";
  }

  function resetState(){
    itemsEl.innerHTML = "";
    worldEl.classList.remove("flash-good", "flash-bad");
    hintEl.classList.remove("hide");

    state = {
      timeLeft: ROUND_SECONDS,
      battery: 50,
      score: 0,
      dist: 0,
      lane: 1,
      elapsed: 0,
      speedBump: 0,
      lastTier: 0,
      milestonesHit: {},
      batteriesCollected: 0,
      energyCollected: 0,
      running: true
    };

    // Snap the runner to its lane with no slide-in from wherever the last run left it.
    runnerEl.style.transition = "none";
    positionRunner();
    void runnerEl.offsetWidth;
    runnerEl.style.transition = "";

    render();
    lastTime = performance.now();
    spawnTimer = 0;
    rafId = requestAnimationFrame(loop);
  }

  function moveLane(delta){
    if(!state || !state.running) return;
    var next = Math.max(0, Math.min(2, state.lane + delta));
    if(next === state.lane) return;
    state.lane = next;
    positionRunner();
    runnerEl.classList.remove("lane-shift");
    void runnerEl.offsetWidth;
    runnerEl.classList.add("lane-shift");
    hintEl.classList.add("hide");
    blip(720, 0.03, 0.08);
  }

  function batteryClass(){
    if(state.battery <= 15) return "bad";
    if(state.battery <= 35) return "warn";
    return "";
  }

  function render(){
    timeEl.textContent = Math.max(0, Math.ceil(state.timeLeft));
    var cls = batteryClass();
    batEl.textContent = Math.round(Math.max(0, state.battery)) + "%";
    batEl.className = cls;
    barEl.className = "bar " + cls;
    fillEl.style.width = Math.max(0, state.battery) + "%";
    scoreEl.textContent = Math.round(state.score).toLocaleString();
    distEl.textContent = Math.round(state.dist) + " m";
  }

  function toast(text){
    msgEl.textContent = text;
    msgEl.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(function(){ msgEl.classList.remove("show"); }, 1200);
  }

  function floatText(xPct, yPct, text, good){
    var el = document.createElement("div");
    el.className = "float-txt " + (good ? "good" : "bad");
    el.textContent = text;
    el.style.left = xPct + "%";
    el.style.top = yPct + "%";
    itemsEl.appendChild(el);
    setTimeout(function(){ el.remove(); }, 800);
  }

  function pickType(){
    var t = Math.min(1, state.elapsed / ROUND_SECONDS);
    var keys = Object.keys(ITEM_TYPES);
    var total = 0;
    var weights = keys.map(function(k){
      var a = SPAWN_WEIGHTS_START[k], b = SPAWN_WEIGHTS_END[k];
      var w = a + (b - a) * t;
      total += w;
      return w;
    });
    var r = Math.random() * total;
    for(var i = 0; i < keys.length; i++){
      r -= weights[i];
      if(r <= 0) return keys[i];
    }
    return keys[keys.length - 1];
  }

  function spawnItem(){
    var lane = Math.floor(Math.random() * 3);
    var typeKey = pickType();
    var el = document.createElement("div");
    el.className = "item";
    el.textContent = ITEM_TYPES[typeKey].emoji;
    el.dataset.lane = lane;
    el.dataset.y = -8;
    el.dataset.type = typeKey;
    el.style.left = laneLeft(lane) + "%";
    el.style.top = el.dataset.y + "%";
    itemsEl.appendChild(el);
  }

  function checkMilestones(){
    MILESTONES.forEach(function(m){
      if(state.dist >= m && !state.milestonesHit[m]){
        state.milestonesHit[m] = true;
        state.speedBump += MILESTONE_BUMP;
        toast("🔥 " + m.toLocaleString() + "m! Speed up!");
        blip(880, 0.05, 0.25);
      }
    });
  }

  function checkSpeedTier(){
    var tier = speedTier();
    if(tier > state.lastTier){
      state.lastTier = tier;
      toast("⚡ Speeding up!");
      blip(700, 0.045, 0.2);
    }
  }

  function loop(now){
    if(!state.running) return;
    var dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    state.elapsed += dt;
    state.timeLeft -= dt;

    var speed = currentSpeed();
    state.dist += speed * dt;
    state.score += dt * 10;
    state.battery -= (0.8 + state.elapsed * 0.02) * dt;

    checkMilestones();
    checkSpeedTier();

    spawnTimer -= dt;
    if(spawnTimer <= 0){
      spawnItem();
      spawnTimer = Math.max(0.35, 0.75 - state.elapsed * 0.0057);
    }

    var fallRate = speed * 0.8; // percent-of-world-height per second
    var runnerLane = state.lane;
    Array.prototype.slice.call(itemsEl.querySelectorAll(".item")).forEach(function(el){
      var y = parseFloat(el.dataset.y) + fallRate * dt;
      el.dataset.y = y;
      el.style.top = y + "%";
      var lane = +el.dataset.lane;
      if(Math.abs(y - RUNNER_ROW) <= HIT_TOLERANCE && lane === runnerLane){
        resolveHit(el);
      } else if(y > 108){
        el.remove();
      }
    });

    render();

    if(state.timeLeft <= 0 || state.battery <= 0){
      finishRun();
      return;
    }
    rafId = requestAnimationFrame(loop);
  }

  function resolveHit(el){
    var typeKey = el.dataset.type;
    var t = ITEM_TYPES[typeKey];
    var x = parseFloat(el.style.left), y = parseFloat(el.style.top);
    el.classList.add("pop");
    setTimeout(function(){ el.remove(); }, 260);

    state.score += t.score;
    state.battery = Math.max(0, Math.min(100, state.battery + t.battery));

    if(t.kind === "good"){
      if(typeKey === "battery") state.batteriesCollected++;
      else state.energyCollected++;
      floatText(x, y, t.score ? ("+" + t.score) : ("+" + t.battery + "%"), true);
      worldEl.classList.remove("flash-good"); void worldEl.offsetWidth; worldEl.classList.add("flash-good");
      blip(typeKey === "coin" ? 980 : 760, 0.05, 0.14);
    } else {
      floatText(x, y, t.battery + "%", false);
      worldEl.classList.remove("flash-bad"); void worldEl.offsetWidth; worldEl.classList.add("flash-bad");
      runnerEl.classList.remove("hit"); void runnerEl.offsetWidth; runnerEl.classList.add("hit");
      blip(180, 0.06, 0.2);
    }
  }

  function finishRun(){
    state.running = false;
    cancelAnimationFrame(rafId);

    var dist = Math.round(state.dist);
    var score = Math.round(state.score);
    var isNewBest = dist > meta.best;
    if(isNewBest) meta.best = dist;
    if(score > meta.bestScore) meta.bestScore = score;
    meta.plays += 1;
    saveMeta();

    $("#fd").textContent = dist + " m";
    $("#fb").textContent = state.batteriesCollected;
    $("#fe").textContent = state.energyCollected;
    $("#fs").textContent = score.toLocaleString();
    $("#nb").textContent = isNewBest ? "🏆 NEW BEST DISTANCE!" : ("BEST: " + meta.best.toLocaleString() + " m");
    bestEl.textContent = meta.best.toLocaleString() + " m";
    bestScoreEl.textContent = meta.bestScore.toLocaleString();
    playsEl.textContent = meta.plays.toLocaleString();

    blip(520, 0.05, 0.3);
    showScreen(resultEl);
  }

  /* ---------------- controls ---------------- */
  $("#start").addEventListener("click", function(){ showScreen(gameEl); resetState(); });
  $("#again").addEventListener("click", function(){ showScreen(gameEl); resetState(); });
  $("#backHome").addEventListener("click", function(){ showScreen(homeEl); });
  $("#btnInfo").addEventListener("click", function(){ showScreen(infoEl); });
  $("#btnInfoClose").addEventListener("click", function(){ showScreen(homeEl); });
  $("#left").addEventListener("click", function(){ moveLane(-1); });
  $("#right").addEventListener("click", function(){ moveLane(1); });

  $("#share").addEventListener("click", function(){
    var dist = $("#fd").textContent, score = $("#fs").textContent;
    var text = "I ran " + dist + " and scored " + score + " points in Stage Zero Battery Run ⚡ Think you can beat me?";
    if(navigator.share){
      navigator.share({ title:"Battery Run", text: text }).catch(function(){});
    } else if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(function(){ toast("📋 Copied — send it to a friend!"); }).catch(function(){});
    } else {
      toast(text);
    }
  });

  document.addEventListener("keydown", function(e){
    if(!gameEl.classList.contains("active")) return;
    if(e.key === "ArrowLeft") moveLane(-1);
    if(e.key === "ArrowRight") moveLane(1);
  });

  var touchX = null;
  worldEl.addEventListener("touchstart", function(e){ touchX = e.changedTouches[0].clientX; }, { passive:true });
  worldEl.addEventListener("touchend", function(e){
    if(touchX === null) return;
    var dx = e.changedTouches[0].clientX - touchX;
    if(Math.abs(dx) > 28) moveLane(dx > 0 ? 1 : -1);
    touchX = null;
  }, { passive:true });

  // Mute toggle — injected rather than hand-editing the static markup.
  var muteBtn = document.createElement("button");
  muteBtn.type = "button";
  muteBtn.className = "mute-btn";
  muteBtn.setAttribute("aria-label", "Toggle sound");
  gameEl.appendChild(muteBtn);
  function refreshMuteBtn(){ muteBtn.textContent = meta.muted ? "🔇" : "🔊"; }
  muteBtn.addEventListener("click", function(){ meta.muted = !meta.muted; saveMeta(); refreshMuteBtn(); });

  /* ---------------- decorative skyline ---------------- */
  function buildSkyline(){
    var city = worldEl.querySelector(".city");
    for(var i = 0; i < 9; i++){
      var b = document.createElement("i");
      b.className = "bldg";
      b.style.width = (7 + Math.random() * 5) + "%";
      b.style.height = (35 + Math.random() * 65) + "%";
      if(Math.random() < 0.6){
        var win = document.createElement("i");
        win.style.left = "25%";
        win.style.top = (20 + Math.random() * 40) + "%";
        win.style.height = "18%";
        b.appendChild(win);
      }
      city.appendChild(b);
    }
  }

  /* ---------------- init ---------------- */
  loadMeta();
  bestEl.textContent = meta.best.toLocaleString() + " m";
  bestScoreEl.textContent = meta.bestScore.toLocaleString();
  playsEl.textContent = meta.plays.toLocaleString();
  refreshMuteBtn();
  buildSkyline();
})();
