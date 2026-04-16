const STORAGE_KEY = "financeTrackerData";
const SHARED_PERSON_ID = "shared";
const DEFAULT_PEOPLE = [
  { id: "person-1", name: "You" },
  { id: "person-2", name: "Partner" }
];

let expenseChart = null;

function byId(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const element = byId(id);
  if (element) {
    element.textContent = value;
  }
}

function setHTML(id, value) {
  const element = byId(id);
  if (element) {
    element.innerHTML = value;
  }
}

function setWidth(id, value) {
  const element = byId(id);
  if (element) {
    element.style.width = value;
  }
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function cloneDefaultPeople() {
  return DEFAULT_PEOPLE.map((person) => ({ ...person }));
}

function getEmptyData() {
  return {
    people: cloneDefaultPeople(),
    incomes: [],
    expenses: [],
    goals: []
  };
}

function escapeHtml(value) {
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  };

  return String(value ?? "").replace(/[&<>"']/g, (character) => map[character]);
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(Number(value) || 0);
}

function formatDate(value) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "Unknown date";
  }

  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function normalizePeople(rawPeople) {
  const source = Array.isArray(rawPeople) ? rawPeople.slice(0, 2) : [];
  const normalized = DEFAULT_PEOPLE.map((fallback, index) => {
    const person = source[index] || {};
    const name = String(person.name || fallback.name).trim() || fallback.name;
    const id = String(person.id || fallback.id).trim() || fallback.id;

    return { id, name };
  });

  if (normalized[0].id === normalized[1].id) {
    normalized[1].id = DEFAULT_PEOPLE[1].id;
  }

  return normalized;
}

function normalizePersonId(personId, validIds) {
  return validIds.has(personId) ? personId : SHARED_PERSON_ID;
}

function normalizeGoals(rawGoals) {
  return (Array.isArray(rawGoals) ? rawGoals : []).map((goal) => ({
    id: goal.id || createId("goal"),
    name: String(goal.name || "").trim(),
    amount: Number(goal.amount) || 0,
    createdAt: goal.createdAt || new Date().toISOString()
  })).filter((goal) => goal.name && goal.amount > 0);
}

function normalizeIncomes(rawIncomes, validIds) {
  return (Array.isArray(rawIncomes) ? rawIncomes : []).map((income) => ({
    id: income.id || createId("income"),
    personId: normalizePersonId(income.personId, validIds),
    name: String(income.name || "").trim(),
    amount: Number(income.amount) || 0,
    createdAt: income.createdAt || new Date().toISOString()
  })).filter((income) => income.name && income.amount > 0);
}

function normalizeExpenses(rawExpenses, validIds) {
  return (Array.isArray(rawExpenses) ? rawExpenses : []).map((expense) => ({
    id: expense.id || createId("expense"),
    personId: normalizePersonId(expense.personId, validIds),
    name: String(expense.name || "").trim(),
    category: String(expense.category || "Other").trim() || "Other",
    amount: Number(expense.amount) || 0,
    createdAt: expense.createdAt || new Date().toISOString()
  })).filter((expense) => expense.name && expense.amount > 0);
}

function getData() {
  const emptyData = getEmptyData();

  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));

    if (!parsed || typeof parsed !== "object") {
      return emptyData;
    }

    const people = normalizePeople(parsed.people);
    const validIds = new Set(people.map((person) => person.id));

    return {
      people,
      incomes: normalizeIncomes(parsed.incomes, validIds),
      expenses: normalizeExpenses(parsed.expenses, validIds),
      goals: normalizeGoals(parsed.goals)
    };
  } catch (error) {
    return emptyData;
  }
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function initStorage() {
  saveData(getData());
}

function getPersonName(data, personId) {
  if (personId === SHARED_PERSON_ID) {
    return "Shared";
  }

  const person = data.people.find((entry) => entry.id === personId);
  return person ? person.name : "Shared";
}

function getPersonStats(data, personId) {
  const incomes = data.incomes.filter((income) => income.personId === personId);
  const expenses = data.expenses.filter((expense) => expense.personId === personId);

  const incomeTotal = incomes.reduce((sum, income) => sum + income.amount, 0);
  const expenseTotal = expenses.reduce((sum, expense) => sum + expense.amount, 0);

  return {
    id: personId,
    name: getPersonName(data, personId),
    income: incomeTotal,
    expenses: expenseTotal,
    available: incomeTotal - expenseTotal,
    incomeCount: incomes.length,
    expenseCount: expenses.length
  };
}

function calculateTotals(data) {
  const householdIncome = data.incomes.reduce((sum, income) => sum + income.amount, 0);
  const householdExpenses = data.expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const householdAvailable = householdIncome - householdExpenses;
  const personStats = data.people.map((person) => getPersonStats(data, person.id));
  const sharedStats = getPersonStats(data, SHARED_PERSON_ID);
  const deductionRate = householdIncome > 0 ? (householdExpenses / householdIncome) * 100 : 0;
  const comparisonBase = Math.max(householdIncome, householdExpenses, Math.abs(householdAvailable), 1);

  return {
    householdIncome,
    householdExpenses,
    householdAvailable,
    deductionRate,
    comparisonBase,
    personStats,
    sharedStats
  };
}

function setMessage(id, text, type) {
  const element = byId(id);

  if (!element) {
    return;
  }

  element.textContent = text;
  element.className = ["message", type].filter(Boolean).join(" ");
}

function sortByNewest(items) {
  return [...items].sort((left, right) => {
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });
}

function populatePersonSelect(selectId, data, placeholder) {
  const select = byId(selectId);

  if (!select) {
    return;
  }

  const currentValue = select.value;
  const options = [];

  if (placeholder) {
    options.push(`<option value="">${escapeHtml(placeholder)}</option>`);
  }

  data.people.forEach((person) => {
    options.push(`<option value="${escapeHtml(person.id)}">${escapeHtml(person.name)}</option>`);
  });

  select.innerHTML = options.join("");

  if (currentValue && data.people.some((person) => person.id === currentValue)) {
    select.value = currentValue;
  } else if (!placeholder && data.people[0]) {
    select.value = data.people[0].id;
  } else {
    select.value = "";
  }
}

function buildBalanceCards(totals, showShared) {
  const cards = totals.personStats.map((stat) => `
    <article class="person-card">
      <span class="person-kicker">${escapeHtml(stat.name)}</span>
      <strong>${formatCurrency(stat.available)}</strong>
      <div class="person-meta">
        <span>Income: ${formatCurrency(stat.income)}</span>
        <span>Expenses: ${formatCurrency(stat.expenses)}</span>
      </div>
    </article>
  `);

  if (showShared && (totals.sharedStats.income > 0 || totals.sharedStats.expenses > 0)) {
    cards.push(`
      <article class="person-card shared-card">
        <span class="person-kicker">Shared</span>
        <strong>${formatCurrency(totals.sharedStats.available)}</strong>
        <div class="person-meta">
          <span>Income: ${formatCurrency(totals.sharedStats.income)}</span>
          <span>Expenses: ${formatCurrency(totals.sharedStats.expenses)}</span>
        </div>
      </article>
    `);
  }

  return cards.join("");
}

function buildSummaryList(data, totals, kind) {
  const stats = [...totals.personStats];

  if (totals.sharedStats.income > 0 || totals.sharedStats.expenses > 0) {
    stats.push(totals.sharedStats);
  }

  const metricKey = kind === "income" ? "income" : "expenses";
  const countKey = kind === "income" ? "incomeCount" : "expenseCount";
  const emptyCopy = kind === "income"
    ? "No income has been recorded yet."
    : "No expenses have been recorded yet.";

  const nonZero = stats.filter((stat) => stat[countKey] > 0);

  if (!nonZero.length) {
    return `<div class="empty-state">${emptyCopy}</div>`;
  }

  return nonZero.map((stat) => `
    <div class="list-item">
      <div>
        <strong>${escapeHtml(stat.name)}</strong>
        <span>${stat[countKey]} ${stat[countKey] === 1 ? "entry" : "entries"}</span>
      </div>
      <strong>${formatCurrency(stat[metricKey])}</strong>
    </div>
  `).join("");
}

function buildActivityList(items, data, kind, emptyCopy) {
  if (!items.length) {
    return `<div class="empty-state">${emptyCopy}</div>`;
  }

  return items.map((item) => `
    <div class="list-item">
      <div>
        <strong>${escapeHtml(item.name)}</strong>
        <div class="item-meta">
          <span>${escapeHtml(getPersonName(data, item.personId))}</span>
          ${kind === "expense" ? `<span>${escapeHtml(item.category)}</span>` : ""}
          <span>${formatDate(item.createdAt)}</span>
        </div>
      </div>
      <strong>${formatCurrency(item.amount)}</strong>
    </div>
  `).join("");
}

function renderLegacyNote(id, totals) {
  const element = byId(id);

  if (!element) {
    return;
  }

  if (totals.sharedStats.income > 0 || totals.sharedStats.expenses > 0) {
    element.style.display = "block";
    element.textContent = "Existing entries created before the split view stay under Shared so they do not get assigned to the wrong person.";
  } else {
    element.style.display = "none";
    element.textContent = "";
  }
}

function renderExpenseChart(expenses) {
  const canvas = byId("expense-chart");
  const emptyState = byId("expense-chart-empty");

  if (!canvas || !emptyState) {
    return;
  }

  if (!expenses.length) {
    canvas.style.display = "none";
    emptyState.style.display = "grid";

    if (expenseChart) {
      expenseChart.destroy();
      expenseChart = null;
    }

    return;
  }

  if (typeof Chart === "undefined") {
    canvas.style.display = "none";
    emptyState.style.display = "grid";
    emptyState.textContent = "The category chart could not load.";
    return;
  }

  const grouped = expenses.reduce((result, expense) => {
    result[expense.category] = (result[expense.category] || 0) + expense.amount;
    return result;
  }, {});

  canvas.style.display = "block";
  emptyState.style.display = "none";

  if (expenseChart) {
    expenseChart.destroy();
  }

  expenseChart = new Chart(canvas, {
    type: "pie",
    data: {
      labels: Object.keys(grouped),
      datasets: [
        {
          data: Object.values(grouped),
          backgroundColor: ["#38bdf8", "#fb7185", "#f59e0b", "#22c55e", "#8b5cf6"],
          borderColor: "#0f172a",
          borderWidth: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            color: "#cbd5e1",
            padding: 18,
            font: {
              family: "Plus Jakarta Sans"
            }
          }
        }
      }
    }
  });
}

function renderDashboard() {
  if (!byId("dashboard-page")) {
    return;
  }

  const data = getData();
  const totals = calculateTotals(data);

  setText("dashboard-household-available", formatCurrency(totals.householdAvailable));
  setText("total-income", formatCurrency(totals.householdIncome));
  setText("total-expenses", formatCurrency(totals.householdExpenses));
  setText("total-available", formatCurrency(totals.householdAvailable));
  setText("deductions-value", `${totals.deductionRate.toFixed(1)}%`);

  setText("income-line", formatCurrency(totals.householdIncome));
  setText("expense-line", formatCurrency(totals.householdExpenses));
  setText("available-line", formatCurrency(totals.householdAvailable));

  setWidth("income-bar", `${Math.min((totals.householdIncome / totals.comparisonBase) * 100, 100)}%`);
  setWidth("expense-bar", `${Math.min((totals.householdExpenses / totals.comparisonBase) * 100, 100)}%`);
  setWidth("available-bar", `${Math.min((Math.abs(totals.householdAvailable) / totals.comparisonBase) * 100, 100)}%`);

  const summary = !data.incomes.length && !data.expenses.length
    ? "Add the first income or expense and the split view will light up for both of you."
    : `Household available balance is ${formatCurrency(totals.householdAvailable)} after everyone's tracked activity.`;

  setText("summary-text", summary);
  setHTML("person-stats", buildBalanceCards(totals, true));
  setHTML("income-split-list", buildSummaryList(data, totals, "income"));
  setHTML("expense-split-list", buildActivityList(
    sortByNewest(data.expenses).slice(0, 6),
    data,
    "expense",
    "No expenses have been recorded yet."
  ));
  renderLegacyNote("shared-data-note", totals);
}

function renderIncomePage() {
  if (!byId("income-page")) {
    return;
  }

  const data = getData();
  const totals = calculateTotals(data);

  setText("income-household-available", formatCurrency(totals.householdAvailable));
  setText("income-household-total", formatCurrency(totals.householdIncome));
  setText("income-people-count", `${data.people.length} people`);
  setText("income-count", `${data.incomes.length} ${data.incomes.length === 1 ? "entry" : "entries"}`);

  if (byId("member-name-1")) {
    byId("member-name-1").value = data.people[0].name;
  }

  if (byId("member-name-2")) {
    byId("member-name-2").value = data.people[1].name;
  }

  populatePersonSelect("income-person", data, "Select who received it");
  setHTML("income-balance-grid", buildBalanceCards(totals, true));
  setHTML("income-split-list", buildSummaryList(data, totals, "income"));
  setHTML("income-list", buildActivityList(
    sortByNewest(data.incomes),
    data,
    "income",
    "No income added yet. Add the first income entry to begin the shared tracking."
  ));
  renderLegacyNote("income-legacy-note", totals);
}

function renderExpensesPage() {
  if (!byId("expenses-page")) {
    return;
  }

  const data = getData();
  const totals = calculateTotals(data);

  setText("expense-household-total", formatCurrency(totals.householdExpenses));
  setText("expense-household-available", formatCurrency(totals.householdAvailable));
  setText("expense-count", `${data.expenses.length} ${data.expenses.length === 1 ? "entry" : "entries"}`);

  populatePersonSelect("expense-person", data, "Select who is paying");
  setHTML("expense-balance-grid", buildBalanceCards(totals, true));
  setHTML("expense-split-list", buildSummaryList(data, totals, "expense"));
  setHTML("expense-list", buildActivityList(
    sortByNewest(data.expenses),
    data,
    "expense",
    "No expenses added yet. Add the first one and assign who is covering it."
  ));
  renderLegacyNote("expense-legacy-note", totals);
  renderExpenseChart(data.expenses);
}

function renderAll() {
  renderDashboard();
  renderIncomePage();
  renderExpensesPage();
}

function saveMembers(event) {
  event.preventDefault();

  const firstName = String(byId("member-name-1")?.value || "").trim();
  const secondName = String(byId("member-name-2")?.value || "").trim();

  if (!firstName || !secondName) {
    setMessage("member-message", "Please enter a name for both people.", "error");
    return;
  }

  if (firstName.toLowerCase() === secondName.toLowerCase()) {
    setMessage("member-message", "Use two different names so the split stays clear.", "error");
    return;
  }

  const data = getData();
  data.people[0].name = firstName;
  data.people[1].name = secondName;

  saveData(data);
  setMessage("member-message", "Names updated across the whole app.", "success");
  renderAll();
}

function addIncome(event) {
  event.preventDefault();

  const personId = String(byId("income-person")?.value || "").trim();
  const name = String(byId("income-name")?.value || "").trim();
  const amount = Number(byId("income-amount")?.value);
  const data = getData();

  if (!data.people.some((person) => person.id === personId) || !name || !Number.isFinite(amount) || amount <= 0) {
    setMessage("income-message", "Choose who received the income, add a name, and enter an amount above zero.", "error");
    return;
  }

  data.incomes.unshift({
    id: createId("income"),
    personId,
    name,
    amount,
    createdAt: new Date().toISOString()
  });

  saveData(data);
  byId("income-form")?.reset();
  populatePersonSelect("income-person", data, "Select who received it");
  setMessage("income-message", "Income saved successfully.", "success");
  renderAll();
}

function addExpense(event) {
  event.preventDefault();

  const personId = String(byId("expense-person")?.value || "").trim();
  const name = String(byId("expense-name")?.value || "").trim();
  const category = String(byId("expense-category")?.value || "").trim();
  const amount = Number(byId("expense-amount")?.value);
  const data = getData();

  if (!data.people.some((person) => person.id === personId) || !name || !category || !Number.isFinite(amount) || amount <= 0) {
    setMessage("expense-message", "Choose who is paying, add the expense details, and enter an amount above zero.", "error");
    return;
  }

  data.expenses.unshift({
    id: createId("expense"),
    personId,
    name,
    category,
    amount,
    createdAt: new Date().toISOString()
  });

  saveData(data);
  byId("expense-form")?.reset();
  populatePersonSelect("expense-person", data, "Select who is paying");
  setMessage("expense-message", "Expense saved successfully.", "success");
  renderAll();
}

function bindEvents() {
  byId("member-form")?.addEventListener("submit", saveMembers);
  byId("income-form")?.addEventListener("submit", addIncome);
  byId("expense-form")?.addEventListener("submit", addExpense);
}

document.addEventListener("DOMContentLoaded", () => {
  initStorage();
  bindEvents();
  renderAll();
});

window.addEventListener("storage", renderAll);
