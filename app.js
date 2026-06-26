const $ = (selector) => document.querySelector(selector);

const roles = {
  mafia: { label: "마피아", hint: "밤마다 한 명을 제거합니다.", color: "#d85648" },
  doctor: { label: "의사", hint: "밤마다 한 명을 살립니다.", color: "#73b56d" },
  detective: { label: "경찰", hint: "밤마다 정체를 확인합니다.", color: "#5f8edc" },
  citizen: { label: "시민", hint: "토론과 투표로 마피아를 찾습니다.", color: "#d6a84f" },
};

const suggestedNames = ["지민", "서준", "하린", "도윤", "민서", "유찬", "가온", "나율"];

const state = {
  players: [],
  round: 1,
  phase: "setup",
  revealIndex: 0,
  roleVisible: false,
  nightStep: "mafia",
  selectedId: null,
  night: { mafia: null, doctor: null, detective: null },
  logs: [],
  timerSeconds: 180,
  timerRunning: false,
  timerId: null,
};

const panels = {
  setup: $("#setupPanel"),
  reveal: $("#revealPanel"),
  game: $("#gamePanel"),
  result: $("#resultPanel"),
};

const phaseText = {
  night: "밤",
  day: "낮",
  vote: "투표",
};

function showPanel(name) {
  Object.values(panels).forEach((panel) => panel.classList.remove("active"));
  panels[name].classList.add("active");
}

function addLog(text) {
  state.logs.unshift(text);
  renderLogs();
}

function renderLogs() {
  $("#logCount").textContent = state.logs.length;
  $("#logList").innerHTML = state.logs.map((log) => `<div class="log-item">${log}</div>`).join("");
}

function renderSetup() {
  $("#quickNames").innerHTML = suggestedNames
    .filter((name) => !state.players.some((player) => player.name === name))
    .slice(0, 6)
    .map((name) => `<button class="chip" type="button" data-quick="${name}">${name}</button>`)
    .join("");

  $("#setupPlayers").innerHTML = state.players
    .map(
      (player, index) => `
        <div class="player-row">
          <span class="avatar">${index + 1}</span>
          <strong class="player-name">${player.name}</strong>
          <button class="ghost-button" type="button" data-remove="${player.id}">삭제</button>
        </div>
      `,
    )
    .join("");
}

function addPlayer(name) {
  const cleanName = name.trim();
  if (!cleanName || state.players.length >= 12) return;
  if (state.players.some((player) => player.name === cleanName)) return;
  state.players.push({
    id: crypto.randomUUID(),
    name: cleanName,
    role: "citizen",
    alive: true,
  });
  $("#nameInput").value = "";
  renderSetup();
}

function buildDeck() {
  const mafiaCount = Number($("#mafiaCount").value);
  const hasDoctor = $("#doctorEnabled").checked;
  const hasDetective = $("#detectiveEnabled").checked;
  const deck = Array.from({ length: mafiaCount }, () => "mafia");
  if (hasDoctor) deck.push("doctor");
  if (hasDetective) deck.push("detective");
  while (deck.length < state.players.length) deck.push("citizen");
  return shuffle(deck);
}

function shuffle(items) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

function startGame() {
  const mafiaCount = Number($("#mafiaCount").value);
  const specialCount = Number($("#doctorEnabled").checked) + Number($("#detectiveEnabled").checked);
  if (state.players.length < 4) {
    addLog("4명 이상 필요합니다.");
    return;
  }
  if (mafiaCount + specialCount >= state.players.length) {
    addLog("시민이 최소 1명 필요합니다.");
    return;
  }

  const deck = buildDeck();
  state.players = state.players.map((player, index) => ({
    ...player,
    role: deck[index],
    alive: true,
  }));
  state.round = 1;
  state.revealIndex = 0;
  state.roleVisible = false;
  state.logs = [];
  renderLogs();
  renderReveal();
  showPanel("reveal");
}

function renderReveal() {
  const player = state.players[state.revealIndex];
  const role = roles[player.role];
  $("#revealTitle").textContent = state.roleVisible ? "역할 확인" : `${player.name} 차례`;
  $("#roleOwner").textContent = player.name;
  $("#roleName").textContent = state.roleVisible ? role.label : "?";
  $("#roleHint").textContent = state.roleVisible ? role.hint : "화면을 가리고 확인하세요.";
  $("#roleEmblem").style.background = state.roleVisible
    ? `radial-gradient(circle at 50% 34%, rgba(255,255,255,.24) 0 8px, transparent 9px), linear-gradient(145deg, ${role.color}, #1c1f26)`
    : "";
  $("#roleCard").classList.toggle("hidden-role", !state.roleVisible);
  $("#revealBtn").textContent = state.roleVisible
    ? state.revealIndex === state.players.length - 1
      ? "밤 시작"
      : "다음 사람"
    : "확인";
}

function revealNext() {
  if (!state.roleVisible) {
    state.roleVisible = true;
    renderReveal();
    return;
  }
  if (state.revealIndex < state.players.length - 1) {
    state.revealIndex += 1;
    state.roleVisible = false;
    renderReveal();
    return;
  }
  state.phase = "night";
  state.nightStep = "mafia";
  state.selectedId = null;
  addLog("1라운드 밤이 시작되었습니다.");
  renderGame();
  showPanel("game");
}

function livingPlayers() {
  return state.players.filter((player) => player.alive);
}

function renderGame() {
  $("#roundLabel").textContent = `${state.round}라운드`;
  $("#phaseLabel").textContent = phaseText[state.phase];
  $("#aliveLabel").textContent = `${livingPlayers().length}명 생존`;
  renderTimer();
  renderAction();
  renderTargets();
}

function renderAction() {
  const copy = {
    mafia: ["MAFIA", "마피아 지목", "제거할 대상을 선택하세요."],
    doctor: ["DOCTOR", "의사 선택", "살릴 대상을 선택하세요."],
    detective: ["DETECTIVE", "경찰 조사", "정체를 확인할 대상을 선택하세요."],
    day: ["DISCUSSION", "낮 토론", "결과를 보고 토론하세요."],
    vote: ["VOTE", "처형 투표", "가장 의심스러운 사람을 선택하세요."],
  };
  const key = state.phase === "night" ? state.nightStep : state.phase;
  const [kicker, title, text] = copy[key];
  $("#actionKicker").textContent = kicker;
  $("#actionTitle").textContent = title;
  $("#actionText").textContent = text;
  $("#nextPhaseBtn").textContent = state.phase === "day" ? "투표 시작" : "결정";
}

function renderTargets() {
  const noSelection = state.phase === "day";
  $("#targetGrid").innerHTML = state.players
    .map((player) => {
      const role = player.alive ? "생존" : roles[player.role].label;
      const disabled = noSelection || !player.alive;
      return `
        <button class="target ${state.selectedId === player.id ? "selected" : ""}" type="button" data-target="${player.id}" ${disabled ? "disabled" : ""}>
          <strong>${player.name}</strong>
          <span>${role}</span>
        </button>
      `;
    })
    .join("");
}

function pickTarget(id) {
  state.selectedId = id;
  renderTargets();
}

function nextPhase() {
  if (state.phase === "night") {
    if (!state.selectedId) return;
    state.night[state.nightStep] = state.selectedId;

    if (state.nightStep === "mafia" && livingPlayers().some((player) => player.role === "doctor")) {
      state.nightStep = "doctor";
      state.selectedId = null;
      renderGame();
      return;
    }
    if (["mafia", "doctor"].includes(state.nightStep) && livingPlayers().some((player) => player.role === "detective")) {
      state.nightStep = "detective";
      state.selectedId = null;
      renderGame();
      return;
    }
    resolveNight();
    return;
  }

  if (state.phase === "day") {
    state.phase = "vote";
    state.timerSeconds = 120;
    state.selectedId = null;
    renderGame();
    return;
  }

  if (state.phase === "vote") {
    if (!state.selectedId) return;
    eliminate(state.selectedId, "투표로");
    const winner = getWinner();
    if (winner) {
      endGame(winner);
      return;
    }
    state.round += 1;
    state.phase = "night";
    state.nightStep = "mafia";
    state.night = { mafia: null, doctor: null, detective: null };
    state.selectedId = null;
    state.timerSeconds = 180;
    addLog(`${state.round}라운드 밤이 시작되었습니다.`);
    renderGame();
  }
}

function resolveNight() {
  const killed = state.night.mafia;
  const saved = state.night.doctor;
  const checked = state.night.detective;
  const checkedPlayer = state.players.find((player) => player.id === checked);

  if (checkedPlayer) {
    addLog(`경찰 조사: ${checkedPlayer.name}은 ${checkedPlayer.role === "mafia" ? "마피아" : "마피아가 아님"}.`);
  }

  if (killed && killed !== saved) {
    eliminate(killed, "밤에");
  } else {
    addLog("밤에는 아무도 죽지 않았습니다.");
  }

  const winner = getWinner();
  if (winner) {
    endGame(winner);
    return;
  }

  state.phase = "day";
  state.selectedId = null;
  state.timerSeconds = 180;
  renderGame();
}

function eliminate(id, prefix) {
  const player = state.players.find((item) => item.id === id);
  if (!player) return;
  player.alive = false;
  addLog(`${player.name}이 ${prefix} 탈락했습니다. 정체는 ${roles[player.role].label}.`);
}

function getWinner() {
  const alive = livingPlayers();
  const mafia = alive.filter((player) => player.role === "mafia").length;
  const citizens = alive.length - mafia;
  if (mafia === 0) return "citizen";
  if (mafia >= citizens) return "mafia";
  return null;
}

function endGame(winner) {
  stopTimer();
  $("#winnerTitle").textContent = winner === "mafia" ? "마피아 승리" : "시민 승리";
  $("#finalPlayers").innerHTML = state.players
    .map(
      (player, index) => `
        <div class="player-row ${player.alive ? "" : "dead"}">
          <span class="avatar" style="background:${roles[player.role].color}">${index + 1}</span>
          <strong class="player-name">${player.name}</strong>
          <span>${roles[player.role].label}</span>
        </div>
      `,
    )
    .join("");
  addLog(winner === "mafia" ? "마피아가 도시를 장악했습니다." : "시민이 마피아를 모두 찾아냈습니다.");
  showPanel("result");
}

function renderTimer() {
  const minutes = String(Math.floor(state.timerSeconds / 60)).padStart(2, "0");
  const seconds = String(state.timerSeconds % 60).padStart(2, "0");
  $("#timerValue").textContent = `${minutes}:${seconds}`;
}

function toggleTimer() {
  if (state.timerRunning) {
    stopTimer();
    return;
  }
  state.timerRunning = true;
  state.timerId = setInterval(() => {
    state.timerSeconds = Math.max(0, state.timerSeconds - 1);
    renderTimer();
    if (state.timerSeconds === 0) stopTimer();
  }, 1000);
}

function stopTimer() {
  state.timerRunning = false;
  clearInterval(state.timerId);
}

function changeTimer(delta) {
  state.timerSeconds = Math.max(30, state.timerSeconds + delta);
  renderTimer();
}

function resetGame() {
  stopTimer();
  state.players = [];
  state.round = 1;
  state.phase = "setup";
  state.revealIndex = 0;
  state.roleVisible = false;
  state.nightStep = "mafia";
  state.selectedId = null;
  state.logs = [];
  state.timerSeconds = 180;
  renderSetup();
  renderLogs();
  showPanel("setup");
}

$("#addPlayerBtn").addEventListener("click", () => addPlayer($("#nameInput").value));
$("#nameInput").addEventListener("keydown", (event) => {
  if (event.key === "Enter") addPlayer(event.currentTarget.value);
});
$("#quickNames").addEventListener("click", (event) => {
  const button = event.target.closest("[data-quick]");
  if (button) addPlayer(button.dataset.quick);
});
$("#setupPlayers").addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove]");
  if (!button) return;
  state.players = state.players.filter((player) => player.id !== button.dataset.remove);
  renderSetup();
});
$("#startBtn").addEventListener("click", startGame);
$("#revealBtn").addEventListener("click", revealNext);
$("#targetGrid").addEventListener("click", (event) => {
  const button = event.target.closest("[data-target]");
  if (button) pickTarget(button.dataset.target);
});
$("#nextPhaseBtn").addEventListener("click", nextPhase);
$("#timerToggle").addEventListener("click", toggleTimer);
$("#timerMinus").addEventListener("click", () => changeTimer(-30));
$("#timerPlus").addEventListener("click", () => changeTimer(30));
$("#resetBtn").addEventListener("click", resetGame);
$("#againBtn").addEventListener("click", resetGame);

renderSetup();
renderLogs();
