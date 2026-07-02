const TOKEN_KEY = "mira-admin-token";

const LOGIN_SCREEN = document.querySelector("#admin-login-screen");
const DASHBOARD_SCREEN = document.querySelector("#admin-dashboard-screen");
const LOGIN_FORM = document.querySelector("#admin-login-form");
const PASSWORD_INPUT = document.querySelector("#admin-password");
const LOGIN_ERROR = document.querySelector("#admin-login-error");
const PAGE_TITLE = document.querySelector("#admin-page-title");
const SUMMARY = document.querySelector("#admin-summary");
const PARTICIPANTS_BODY = document.querySelector("#admin-participants-body");
const PARTICIPANTS_EMPTY = document.querySelector("#admin-participants-empty");
const PARTICIPANTS_SEARCH = document.querySelector("#admin-participants-search");
const TABLE_META = document.querySelector("#admin-table-meta");
const KPIS_ROOT = document.querySelector("#admin-kpis-root");
const REFRESH_BUTTON = document.querySelector("#admin-refresh");
const LOGOUT_BUTTON = document.querySelector("#admin-logout");
const NAV_BUTTONS = Array.from(document.querySelectorAll("[data-admin-page]"));
const PAGE_PARTICIPANTS = document.querySelector("#admin-page-participants");
const PAGE_KPIS = document.querySelector("#admin-page-kpis");
const MODAL = document.querySelector("#admin-modal");
const MODAL_BACKDROP = document.querySelector("#admin-modal-backdrop");
const MODAL_CLOSE = document.querySelector("#admin-modal-close");
const MODAL_TITLE = document.querySelector("#admin-modal-title");
const MODAL_INFO = document.querySelector("#admin-modal-info");
const MODAL_ANSWERS = document.querySelector("#admin-modal-answers");
const MODAL_TABS = Array.from(document.querySelectorAll("[data-modal-tab]"));

let participantsCache = [];
let participantSearchQuery = "";
let currentPage = "participants";
let selectedParticipantId = null;
let currentModalTab = "info";
let lastKpisUpdatedAt = null;

function getToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

function setToken(token) {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("fr-FR");
}

function getLatestSession(participant) {
  const sessions = Array.isArray(participant?.sessions) ? participant.sessions : [];
  return sessions.find((session) => session.sessionId) || null;
}

function getParticipantStatus(participant) {
  return getLatestSession(participant) ? "Terminé" : "Inscrit";
}

function getVerdictClass(verdict) {
  const normalized = String(verdict || "").toLowerCase();
  if (normalized.includes("encourageant")) return "admin-verdict-encourageant";
  if (normalized.includes("mitig")) return "admin-verdict-mitige";
  if (normalized.includes("non retenu") || normalized.includes("non-retenu")) {
    return "admin-verdict-non-retenu";
  }
  return "admin-verdict-neutral";
}

function getVerdictBarClass(verdict) {
  const normalized = String(verdict || "").toLowerCase();
  if (normalized.includes("encourageant")) return "admin-bar-fill--verdict-encourageant";
  if (normalized.includes("mitig")) return "admin-bar-fill--verdict-mitige";
  if (normalized.includes("non retenu") || normalized.includes("non-retenu")) {
    return "admin-bar-fill--verdict-non-retenu";
  }
  return "";
}

function filterParticipants(participants, query) {
  const needle = String(query || "")
    .trim()
    .toLowerCase();
  if (!needle) return participants;

  return participants.filter((participant) => {
    const haystack = [
      participant.firstName,
      participant.lastName,
      participant.email,
      participant.specialty,
      getParticipantStatus(participant),
      getLatestSession(participant)?.verdict
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(needle);
  });
}

function showLoginError(message) {
  if (!LOGIN_ERROR) return;
  if (message) {
    LOGIN_ERROR.textContent = message;
    LOGIN_ERROR.classList.remove("hidden");
  } else {
    LOGIN_ERROR.textContent = "";
    LOGIN_ERROR.classList.add("hidden");
  }
}

function showLoginScreen() {
  LOGIN_SCREEN?.classList.remove("hidden");
  DASHBOARD_SCREEN?.classList.add("hidden");
  closeModal();
}

function showDashboardScreen() {
  LOGIN_SCREEN?.classList.add("hidden");
  DASHBOARD_SCREEN?.classList.remove("hidden");
}

async function adminFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body) headers["Content-Type"] = "application/json";
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(path, { ...options, headers });
  const data = await response.json().catch(() => ({}));

  if (response.status === 429) {
    const retryAfterSec = data.retryAfterSec || response.headers.get("Retry-After") || 60;
    throw new Error(`Trop de requêtes. Réessayez dans ${retryAfterSec} seconde(s).`);
  }

  return { response, data };
}

function handleUnauthorized() {
  setToken(null);
  showLoginScreen();
  showLoginError("Session expirée. Reconnectez-vous.");
}

function setAdminPage(page) {
  currentPage = page;
  NAV_BUTTONS.forEach((button) => {
    button.classList.toggle("active", button.dataset.adminPage === page);
  });
  PAGE_PARTICIPANTS?.classList.toggle("hidden", page !== "participants");
  PAGE_KPIS?.classList.toggle("hidden", page !== "kpis");
  if (PAGE_TITLE) {
    PAGE_TITLE.textContent = page === "kpis" ? "KPIs" : "Participants";
  }
}

function renderAnswerStatus(answer) {
  if (answer.scored === false) return { label: "Profil", className: "admin-neutral" };
  if (answer.timedOut) return { label: "Timeout", className: "admin-miss" };
  if (answer.isFit) return { label: "OK", className: "admin-fit" };
  return { label: "Faux", className: "admin-miss" };
}

function renderVerdictPill(verdict) {
  if (!verdict) return "—";
  const className = getVerdictClass(verdict);
  return `<span class="admin-verdict-pill ${className}">${escapeHtml(verdict)}</span>`;
}

function updateParticipantsMeta(filteredCount, totalCount) {
  if (!TABLE_META) return;
  if (!totalCount) {
    TABLE_META.textContent = "Aucun participant";
    return;
  }
  if (filteredCount === totalCount) {
    TABLE_META.textContent = `${totalCount} participant${totalCount > 1 ? "s" : ""}`;
    return;
  }
  TABLE_META.textContent = `${filteredCount} sur ${totalCount} participant${totalCount > 1 ? "s" : ""}`;
}

function renderParticipantsTable(participants) {
  if (!PARTICIPANTS_BODY) return;

  const filtered = filterParticipants(participants, participantSearchQuery);
  updateParticipantsMeta(filtered.length, participants.length);

  if (!filtered.length) {
    PARTICIPANTS_BODY.innerHTML = "";
    if (PARTICIPANTS_EMPTY) {
      PARTICIPANTS_EMPTY.classList.remove("hidden");
      PARTICIPANTS_EMPTY.textContent = participants.length
        ? "Aucun résultat pour cette recherche."
        : "Aucun participant enregistré pour le moment.";
    }
    return;
  }

  PARTICIPANTS_EMPTY?.classList.add("hidden");
  PARTICIPANTS_BODY.innerHTML = filtered
    .map((participant) => {
      const session = getLatestSession(participant);
      const status = getParticipantStatus(participant);
      const statusClass = session ? "admin-status-done" : "admin-status-pending";

      return `
        <tr class="admin-table-row" data-participant-id="${escapeHtml(participant.candidateId)}" tabindex="0">
          <td><strong>${escapeHtml(participant.firstName)} ${escapeHtml(participant.lastName)}</strong></td>
          <td>${escapeHtml(participant.email)}</td>
          <td>${escapeHtml(participant.specialty)}</td>
          <td><span class="admin-status-pill ${statusClass}">${status}</span></td>
          <td>${session ? renderVerdictPill(session.verdict) : "—"}</td>
          <td>${session ? escapeHtml(session.score) : "—"}</td>
          <td>${formatDate(participant.registeredAt)}</td>
        </tr>
      `;
    })
    .join("");
}

function renderInfoView(participant) {
  const session = getLatestSession(participant);

  return `
    <dl class="admin-info-grid">
      <div><dt>Prénom</dt><dd>${escapeHtml(participant.firstName)}</dd></div>
      <div><dt>Nom</dt><dd>${escapeHtml(participant.lastName)}</dd></div>
      <div><dt>Email</dt><dd>${escapeHtml(participant.email)}</dd></div>
      <div><dt>Spécialité</dt><dd>${escapeHtml(participant.specialty)}</dd></div>
      <div><dt>ID candidat</dt><dd>${escapeHtml(participant.candidateId)}</dd></div>
      <div><dt>Inscription</dt><dd>${formatDate(participant.registeredAt)}</dd></div>
      <div><dt>Statut</dt><dd>${escapeHtml(getParticipantStatus(participant))}</dd></div>
      <div><dt>Verdict</dt><dd>${session ? renderVerdictPill(session.verdict) : "—"}</dd></div>
      <div><dt>Score</dt><dd>${session ? escapeHtml(session.score) : "—"}</dd></div>
      <div><dt>Session terminée</dt><dd>${formatDate(session?.completedAt)}</dd></div>
      <div><dt>ID session</dt><dd>${escapeHtml(session?.sessionId || "—")}</dd></div>
      <div><dt>Questions totales</dt><dd>${session ? escapeHtml(session.totalQuestions) : "—"}</dd></div>
    </dl>
  `;
}

function renderAnswersView(participant) {
  const session = getLatestSession(participant);
  if (!session) {
    return `
      <div class="admin-empty-state">
        <div class="admin-empty-state-icon" aria-hidden="true">?</div>
        <strong>Questionnaire non terminé</strong>
        <span>Ce participant s'est inscrit mais n'a pas encore complété le parcours.</span>
      </div>
    `;
  }

  const answers = Array.isArray(session.answers) ? session.answers : [];
  if (!answers.length) {
    return `<p class="admin-empty">Aucune réponse enregistrée pour cette session.</p>`;
  }

  return `
    <p class="admin-modal-session-meta">
      Session ${escapeHtml(session.sessionId)} · ${renderVerdictPill(session.verdict)} ·
      ${formatDate(session.completedAt)}
    </p>
    <div class="admin-table-wrap">
      <table class="admin-answers">
        <thead>
          <tr>
            <th>#</th>
            <th>Question</th>
            <th>Réponse</th>
            <th>Statut</th>
            <th>Temps</th>
          </tr>
        </thead>
        <tbody>
          ${answers
            .map((answer, index) => {
              const status = renderAnswerStatus(answer);
              return `
                <tr>
                  <td>${escapeHtml(answer.questionId || `q${index + 1}`)}</td>
                  <td>${escapeHtml(answer.questionText)}</td>
                  <td>${escapeHtml(answer.selectedLabel || answer.selectedSide || "—")}</td>
                  <td class="${status.className}">${status.label}</td>
                  <td>${Math.round((answer.responseTimeMs || 0) / 100) / 10}s</td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function setModalTab(tab) {
  currentModalTab = tab;
  MODAL_TABS.forEach((button) => {
    button.classList.toggle("active", button.dataset.modalTab === tab);
  });
  MODAL_INFO?.classList.toggle("hidden", tab !== "info");
  MODAL_ANSWERS?.classList.toggle("hidden", tab !== "answers");
}

function openParticipantModal(participantId) {
  const participant = participantsCache.find((item) => item.candidateId === participantId);
  if (!participant || !MODAL) return;

  selectedParticipantId = participantId;
  if (MODAL_TITLE) {
    MODAL_TITLE.textContent = `${participant.firstName} ${participant.lastName}`;
  }
  if (MODAL_INFO) MODAL_INFO.innerHTML = renderInfoView(participant);
  if (MODAL_ANSWERS) MODAL_ANSWERS.innerHTML = renderAnswersView(participant);
  setModalTab("info");
  MODAL.classList.remove("hidden");
}

function closeModal() {
  selectedParticipantId = null;
  MODAL?.classList.add("hidden");
}

function renderKpiCard(label, value, hint = "") {
  return `
    <article class="admin-kpi-card">
      <p class="admin-kpi-label">${escapeHtml(label)}</p>
      <p class="admin-kpi-value">${escapeHtml(value)}</p>
      ${hint ? `<p class="admin-kpi-hint">${escapeHtml(hint)}</p>` : ""}
    </article>
  `;
}

function renderHeroCard(label, value, hint, tone) {
  return `
    <article class="admin-kpi-hero-card admin-kpi-hero-card--${tone}">
      <p class="admin-kpi-hero-label">${escapeHtml(label)}</p>
      <p class="admin-kpi-hero-value">${escapeHtml(value)}</p>
      <p class="admin-kpi-hero-hint">${escapeHtml(hint)}</p>
    </article>
  `;
}

function renderFunnel(kpis) {
  const total = kpis.registeredCount || 0;
  const done = kpis.completedCount || 0;
  const pending = kpis.pendingCount || 0;
  const donePercent = total ? Math.round((done / total) * 100) : 0;
  const pendingPercent = total ? Math.max(0, 100 - donePercent) : 0;

  return `
    <section class="admin-kpis-funnel">
      <h3>Entonnoir de complétion</h3>
      <div class="admin-funnel-bar" role="img" aria-label="${donePercent}% des inscrits ont terminé">
        <div class="admin-funnel-segment admin-funnel-segment--done" style="width:${donePercent}%"></div>
        <div class="admin-funnel-segment admin-funnel-segment--pending" style="width:${pendingPercent}%"></div>
      </div>
      <div class="admin-funnel-legend">
        <span><span class="admin-funnel-dot" style="background:#3cb371"></span>${done} terminé${done > 1 ? "s" : ""} (${donePercent}%)</span>
        <span><span class="admin-funnel-dot" style="background:#f0c060"></span>${pending} en attente</span>
        <span>${total} inscrit${total > 1 ? "s" : ""} au total</span>
      </div>
    </section>
  `;
}

function renderBreakdown(title, counts, { barClassResolver } = {}) {
  const entries = Object.entries(counts || {}).sort((a, b) => b[1] - a[1]);
  if (!entries.length) {
    return `
      <article class="admin-kpi-breakdown">
        <h3>${escapeHtml(title)}</h3>
        <div class="admin-empty-state">
          <div class="admin-empty-state-icon" aria-hidden="true">—</div>
          <strong>Aucune donnée</strong>
          <span>Les statistiques apparaîtront dès les premières sessions.</span>
        </div>
      </article>
    `;
  }

  const max = Math.max(...entries.map(([, count]) => count), 1);

  return `
    <article class="admin-kpi-breakdown">
      <h3>${escapeHtml(title)}</h3>
      <ul class="admin-breakdown-list">
        ${entries
          .map(([label, count]) => {
            const width = Math.round((count / max) * 100);
            const barClass = barClassResolver ? barClassResolver(label) : "";
            return `
              <li class="admin-breakdown-row">
                <span class="admin-breakdown-label" title="${escapeHtml(label)}">${escapeHtml(label)}</span>
                <div class="admin-bar-track" aria-hidden="true">
                  <div class="admin-bar-fill ${barClass}" style="width:${width}%"></div>
                </div>
                <strong class="admin-breakdown-value">${escapeHtml(count)}</strong>
              </li>
            `;
          })
          .join("")}
      </ul>
    </article>
  `;
}

function renderKpis(kpis) {
  if (!KPIS_ROOT || !kpis) return;

  lastKpisUpdatedAt = new Date();

  KPIS_ROOT.innerHTML = `
    <section class="admin-kpis-hero">
      ${renderHeroCard(
        "Participants inscrits",
        kpis.registeredCount,
        "Total des profils enregistrés",
        "primary"
      )}
      ${renderHeroCard(
        "Questionnaires terminés",
        kpis.completedCount,
        `${kpis.completionRate}% de taux de complétion`,
        "success"
      )}
      ${renderHeroCard(
        "En attente",
        kpis.pendingCount,
        "Inscrits n'ayant pas encore terminé",
        "warning"
      )}
    </section>

    ${renderFunnel(kpis)}

    <section class="admin-kpis-metrics">
      ${renderKpiCard("Taux de complétion", `${kpis.completionRate}%`)}
      ${renderKpiCard("Score moyen", kpis.averageScore, "Sur les sessions terminées")}
      ${renderKpiCard("Précision moyenne", `${kpis.accuracyRate}%`, "Questions scorées uniquement")}
      ${renderKpiCard("Temps moyen / réponse", `${kpis.averageResponseTimeSec}s`)}
      ${renderKpiCard("Timeouts", kpis.timeoutCount, "Réponses non données à temps")}
    </section>

    <section class="admin-kpis-breakdowns">
      ${renderBreakdown("Répartition par spécialité", kpis.specialtyCounts)}
      ${renderBreakdown("Répartition par verdict", kpis.verdictCounts, {
        barClassResolver: (label) => getVerdictBarClass(label)
      })}
    </section>

    <p class="admin-kpis-updated">Mis à jour ${formatDate(lastKpisUpdatedAt.toISOString())}</p>
  `;
}

async function loadParticipants() {
  const { response, data } = await adminFetch("/api/admin/participants");
  if (response.status === 401) return handleUnauthorized();
  if (!response.ok || !data.ok) {
    if (SUMMARY) SUMMARY.textContent = "Impossible de charger les participants.";
    return [];
  }

  participantsCache = data.participants || [];
  const completedCount = participantsCache.filter((participant) => getLatestSession(participant)).length;

  if (SUMMARY && currentPage === "participants") {
    SUMMARY.textContent = `${participantsCache.length} participant(s) · ${completedCount} questionnaire(s) terminé(s)`;
  }

  renderParticipantsTable(participantsCache);
  return participantsCache;
}

async function loadKpis() {
  const { response, data } = await adminFetch("/api/admin/kpis");
  if (response.status === 401) return handleUnauthorized();
  if (!response.ok || !data.ok) {
    if (KPIS_ROOT) {
      KPIS_ROOT.innerHTML = `
        <div class="admin-empty-state">
          <div class="admin-empty-state-icon" aria-hidden="true">!</div>
          <strong>Chargement impossible</strong>
          <span>Impossible de récupérer les KPIs. Réessayez.</span>
        </div>
      `;
    }
    return;
  }

  if (SUMMARY && currentPage === "kpis") {
    const { registeredCount, completedCount, completionRate } = data.kpis;
    SUMMARY.textContent = `${registeredCount} inscrit(s) · ${completedCount} terminé(s) · ${completionRate}% de complétion`;
  }

  renderKpis(data.kpis);
}

async function refreshCurrentPage() {
  try {
    if (currentPage === "kpis") {
      await loadKpis();
      return;
    }
    await loadParticipants();
  } catch (error) {
    if (SUMMARY) {
      SUMMARY.textContent = error.message || "Erreur lors de l'actualisation.";
    }
  }
}

async function login(password) {
  showLoginError("");
  const { response, data } = await adminFetch("/api/admin/login", {
    method: "POST",
    body: JSON.stringify({ password })
  });

  if (response.status === 423) {
    const until = data.bannedUntil ? formatDate(data.bannedUntil) : "plus tard";
    showLoginError(`${data.error || "Accès bloqué."} Jusqu'à ${until}.`);
    return;
  }

  if (!response.ok || !data.ok || !data.token) {
    const remaining =
      typeof data.remainingAttempts === "number"
        ? ` Il reste ${data.remainingAttempts} tentative(s).`
        : "";
    showLoginError((data.error || "Connexion impossible.") + remaining);
    return;
  }

  setToken(data.token);
  showDashboardScreen();
  setAdminPage("participants");
  await refreshCurrentPage();
}

async function logout() {
  await adminFetch("/api/admin/logout", { method: "POST" });
  setToken(null);
  participantsCache = [];
  participantSearchQuery = "";
  if (PARTICIPANTS_SEARCH) PARTICIPANTS_SEARCH.value = "";
  showLoginScreen();
  showLoginError("");
  if (PASSWORD_INPUT) PASSWORD_INPUT.value = "";
}

LOGIN_FORM?.addEventListener("submit", (event) => {
  event.preventDefault();
  login(PASSWORD_INPUT?.value || "");
});

REFRESH_BUTTON?.addEventListener("click", () => {
  refreshCurrentPage().catch(console.error);
});

LOGOUT_BUTTON?.addEventListener("click", () => {
  logout().catch(console.error);
});

PARTICIPANTS_SEARCH?.addEventListener("input", (event) => {
  participantSearchQuery = event.target.value || "";
  renderParticipantsTable(participantsCache);
});

NAV_BUTTONS.forEach((button) => {
  button.addEventListener("click", () => {
    const page = button.dataset.adminPage;
    if (!page || page === currentPage) return;
    setAdminPage(page);
    refreshCurrentPage().catch(console.error);
  });
});

PARTICIPANTS_BODY?.addEventListener("click", (event) => {
  const row = event.target.closest("[data-participant-id]");
  if (!row) return;
  openParticipantModal(row.dataset.participantId);
});

PARTICIPANTS_BODY?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const row = event.target.closest("[data-participant-id]");
  if (!row) return;
  event.preventDefault();
  openParticipantModal(row.dataset.participantId);
});

MODAL_TABS.forEach((button) => {
  button.addEventListener("click", () => {
    setModalTab(button.dataset.modalTab || "info");
  });
});

MODAL_CLOSE?.addEventListener("click", closeModal);
MODAL_BACKDROP?.addEventListener("click", closeModal);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !MODAL?.classList.contains("hidden")) {
    closeModal();
  }
});

if (getToken()) {
  showDashboardScreen();
  refreshCurrentPage().catch(() => {
    setToken(null);
    showLoginScreen();
  });
} else {
  showLoginScreen();
}
