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

  if (!value || Number.isNaN(parsed.getTime())) {
    return "No date";
  }

  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function getDaysUntil(value) {
  const parsed = new Date(value);

  if (!value || Number.isNaN(parsed.getTime())) {
    return null;
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());

  return Math.ceil((target - today) / 86400000);
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
    dueDate: goal.dueDate || "",
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

function normalizeExpenseKind(value) {
  const raw = String(value || "").trim().toLowerCase();

  if (raw === "goal allocation" || raw === "goal-allocation") {
    return "goal-allocation";
  }

  if (raw === "fixed") {
    return "fixed";
  }

  return "variable";
}

function resolveGoalReference(expense, goals) {
  const goalId = String(expense.goalId || "").trim();
  const goalName = String(expense.goalName || "").trim();

  if (goalId) {
    const goalById = goals.find((goal) => goal.id === goalId);
    if (goalById) {
      return { goalId: goalById.id, goalName: goalById.name };
    }
  }

  if (goalName) {
    const goalByName = goals.find((goal) => goal.name.toLowerCase() === goalName.toLowerCase());
    if (goalByName) {
      return { goalId: goalByName.id, goalName: goalByName.name };
    }
  }

  return { goalId: goalId || "", goalName };
}

function normalizeExpenses(rawExpenses, validIds, goals) {
  return (Array.isArray(rawExpenses) ? rawExpenses : []).map((expense) => {
    const expenseKind = normalizeExpenseKind(
      expense.expenseKind || expense.expenseType || expense.type
    );
    const goalRef = resolveGoalReference(expense, goals);
    const goalName = expenseKind === "goal-allocation"
      ? goalRef.goalName || "Goal"
      : "";
    const name = String(expense.name || "").trim()
      || (expenseKind === "goal-allocation" && goalName ? `Allocation to ${goalName}` : "");
    const dueDate = expenseKind === "goal-allocation"
      ? ""
      : String(expense.dueDate || "").trim();

    return {
      id: expense.id || createId("expense"),
      personId: normalizePersonId(expense.personId, validIds),
      name,
      category: expenseKind === "goal-allocation"
        ? "Goals"
        : (String(expense.category || "Other").trim() || "Other"),
      amount: Number(expense.amount) || 0,
      createdAt: expense.createdAt || new Date().toISOString(),
      expenseKind,
      dueDate,
      goalId: expenseKind === "goal-allocation" ? goalRef.goalId : "",
      goalName
    };
  }).filter((expense) => expense.name && expense.amount > 0);
}

function isGoalAllocation(expense) {
  return expense.expenseKind === "goal-allocation";
}

function isFixedExpense(expense) {
  return expense.expenseKind === "fixed";
}

function isVariableExpense(expense) {
  return expense.expenseKind === "variable";
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
    const goals = normalizeGoals(parsed.goals);

    return {
      people,
      incomes: normalizeIncomes(parsed.incomes, validIds),
      expenses: normalizeExpenses(parsed.expenses, validIds, goals),
      goals
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

function getGoalName(data, goalId, fallbackName) {
  const goal = data.goals.find((entry) => entry.id === goalId);
  return goal ? goal.name : (fallbackName || "Goal");
}

function getPersonStats(data, personId) {
  const incomes = data.incomes.filter((income) => income.personId === personId);
  const expenses = data.expenses.filter((expense) => expense.personId === personId);

  const incomeTotal = incomes.reduce((sum, income) => sum + income.amount, 0);
  const expenseTotal = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const goalAllocated = expenses.reduce((sum, expense) => {
    return sum + (isGoalAllocation(expense) ? expense.amount : 0);
  }, 0);

  return {
    id: personId,
    name: getPersonName(data, personId),
    income: incomeTotal,
    expenses: expenseTotal,
    available: incomeTotal - expenseTotal,
    goalAllocated,
    incomeCount: incomes.length,
    expenseCount: expenses.length
  };
}

function getGoalAllocationMap(data) {
  const allocationMap = new Map();

  data.expenses.forEach((expense) => {
    if (!isGoalAllocation(expense) || !expense.goalId) {
      return;
    }

    allocationMap.set(expense.goalId, (allocationMap.get(expense.goalId) || 0) + expense.amount);
  });

  return allocationMap;
}

function calculateTotals(data) {
  const householdIncome = data.incomes.reduce((sum, income) => sum + income.amount, 0);
  const householdExpenses = data.expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const householdAvailable = householdIncome - householdExpenses;
  const totalGoalTarget = data.goals.reduce((sum, goal) => sum + goal.amount, 0);
  const totalGoalAllocated = data.expenses.reduce((sum, expense) => {
    return sum + (isGoalAllocation(expense) ? expense.amount : 0);
  }, 0);
  const personStats = data.people.map((person) => getPersonStats(data, person.id));
  const sharedStats = getPersonStats(data, SHARED_PERSON_ID);
  const deductionRate = householdIncome > 0 ? (householdExpenses / householdIncome) * 100 : 0;
  const comparisonBase = Math.max(householdIncome, householdExpenses, Math.abs(householdAvailable), 1);

  return {
    householdIncome,
    householdExpenses,
    householdAvailable,
    totalGoalTarget,
    totalGoalAllocated,
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

function populatePersonSelect(selectId, data, placeholder, includeShared = false) {
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

  if (includeShared) {
    options.push(`<option value="${SHARED_PERSON_ID}">Shared expense</option>`);
  }

  select.innerHTML = options.join("");

  const currentMatchesPerson = data.people.some((person) => person.id === currentValue);
  const currentMatchesShared = includeShared && currentValue === SHARED_PERSON_ID;

  if (currentValue && (currentMatchesPerson || currentMatchesShared)) {
    select.value = currentValue;
  } else if (!placeholder && data.people[0]) {
    select.value = data.people[0].id;
  } else {
    select.value = "";
  }
}

function populateGoalSelect(data) {
  const select = byId("expense-goal-id");

  if (!select) {
    return;
  }

  const currentValue = select.value;

  if (!data.goals.length) {
    select.innerHTML = '<option value="">Add a goal first</option>';
    select.disabled = true;
    return;
  }

  select.disabled = false;
  select.innerHTML = [
    '<option value="">Select a goal</option>',
    ...data.goals.map((goal) => `<option value="${escapeHtml(goal.id)}">${escapeHtml(goal.name)}</option>`)
  ].join("");

  if (currentValue && data.goals.some((goal) => goal.id === currentValue)) {
    select.value = currentValue;
  }
}

function updateExpenseFormState() {
  const typeSelect = byId("expense-type");
  const goalWrap = byId("expense-goal-wrap");
  const goalSelect = byId("expense-goal-id");
  const categoryInput = byId("expense-category");
  const dueDateInput = byId("expense-due-date");
  const note = byId("expense-type-note");

  if (!typeSelect) {
    return;
  }

  const type = typeSelect.value;
  const isAllocation = type === "goal-allocation";
  const isFixed = type === "fixed";

  if (goalWrap) {
    goalWrap.style.display = isAllocation ? "grid" : "none";
  }

  if (goalSelect) {
    goalSelect.required = isAllocation;
    if (!isAllocation) {
      goalSelect.value = "";
    }
  }

  if (categoryInput) {
    if (isAllocation) {
      categoryInput.value = "Goals";
      categoryInput.disabled = true;
    } else {
      categoryInput.disabled = false;
      if (categoryInput.value === "Goals") {
        categoryInput.value = "Home & Food";
      }
    }
  }

  if (dueDateInput) {
    dueDateInput.required = isFixed;
    dueDateInput.disabled = isAllocation;

    if (isAllocation) {
      dueDateInput.value = "";
    }
  }

  if (note) {
    if (isAllocation) {
      note.textContent = "This entry will count as money allocated to the selected goal and will reduce available funds immediately.";
    } else if (isFixed) {
      note.textContent = "Fixed expenses require a due date so you can track when the money is expected to go out.";
    } else {
      note.textContent = "Variable expenses can also include a due date if you want to track when the money goes out.";
    }
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
        ${stat.goalAllocated > 0 ? `<span>Goals allocated: ${formatCurrency(stat.goalAllocated)}</span>` : ""}
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
          ${totals.sharedStats.goalAllocated > 0 ? `<span>Goals allocated: ${formatCurrency(totals.sharedStats.goalAllocated)}</span>` : ""}
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

function buildExpenseMeta(item, data) {
  if (isGoalAllocation(item)) {
    return [
      escapeHtml(getPersonName(data, item.personId)),
      "Goal Allocation",
      escapeHtml(getGoalName(data, item.goalId, item.goalName)),
      formatDate(item.createdAt)
    ].map((value) => `<span>${value}</span>`).join("");
  }

  const kindLabel = isFixedExpense(item) ? "Fixed" : "Variable";
  const dateLabel = item.dueDate
    ? `Due ${formatDate(item.dueDate)}`
    : isFixedExpense(item)
      ? "No due date"
      : `Logged ${formatDate(item.createdAt)}`;

  return [
    escapeHtml(getPersonName(data, item.personId)),
    kindLabel,
    escapeHtml(item.category),
    dateLabel
  ].map((value) => `<span>${value}</span>`).join("");
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
          ${kind === "expense"
            ? buildExpenseMeta(item, data)
            : `<span>${escapeHtml(getPersonName(data, item.personId))}</span><span>${formatDate(item.createdAt)}</span>`}
        </div>
      </div>
      <strong>${formatCurrency(item.amount)}</strong>
    </div>
  `).join("");
}

function buildManageList(items, data, kind, emptyCopy) {
  if (!items.length) {
    return `<div class="empty-state">${emptyCopy}</div>`;
  }

  const deleteHandler = kind === "income" ? "deleteIncome" : "deleteExpense";

  return items.map((item) => `
    <div class="list-item">
      <div>
        <strong>${escapeHtml(item.name)}</strong>
        <div class="item-meta">
          ${kind === "expense"
            ? buildExpenseMeta(item, data)
            : `<span>${escapeHtml(getPersonName(data, item.personId))}</span><span>${formatDate(item.createdAt)}</span>`}
        </div>
      </div>
      <div style="text-align: right;">
        <strong>${formatCurrency(item.amount)}</strong>
        <div style="margin-top: 10px;">
          <button type="button" class="button button-danger" onclick="${deleteHandler}('${item.id}')">Delete</button>
        </div>
      </div>
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

function buildSavingsList(totals) {
  const rows = totals.personStats.map((stat) => {
    const contribution = totals.householdAvailable !== 0
      ? Math.max(0, (stat.available / totals.householdAvailable) * 100)
      : 0;

    return `
      <div class="list-item">
        <div>
          <strong>${escapeHtml(stat.name)}</strong>
          <div class="item-meta">
            <span>Income ${formatCurrency(stat.income)}</span>
            <span>Expenses ${formatCurrency(stat.expenses)}</span>
            ${stat.goalAllocated > 0 ? `<span>Goal allocations ${formatCurrency(stat.goalAllocated)}</span>` : ""}
          </div>
        </div>
        <div style="text-align: right;">
          <strong>${formatCurrency(stat.available)}</strong>
          <div class="item-meta" style="justify-content: flex-end;">
            <span>${contribution.toFixed(1)}% of household available</span>
          </div>
        </div>
      </div>
    `;
  });

  if (totals.sharedStats.income > 0 || totals.sharedStats.expenses > 0) {
    rows.push(`
      <div class="list-item">
        <div>
          <strong>Shared</strong>
          <div class="item-meta">
            <span>Legacy household entries kept unassigned</span>
          </div>
        </div>
        <strong>${formatCurrency(totals.sharedStats.available)}</strong>
      </div>
    `);
  }

  return rows.join("");
}

function buildGoalCards(data) {
  if (!data.goals.length) {
    return '<div class="empty-state">No goals added yet. Add your first target to see progress from your goal allocations.</div>';
  }

  const allocationMap = getGoalAllocationMap(data);

  return sortByNewest(data.goals).map((goal) => {
    const allocated = allocationMap.get(goal.id) || 0;
    const progress = goal.amount > 0
      ? Math.max(0, Math.min((allocated / goal.amount) * 100, 100))
      : 0;
    const remaining = Math.max(goal.amount - allocated, 0);
    const daysLeft = goal.dueDate ? getDaysUntil(goal.dueDate) : null;

    let dueCopy = "No due date";
    if (daysLeft !== null) {
      if (daysLeft < 0) {
        dueCopy = `${Math.abs(daysLeft)} days overdue`;
      } else if (daysLeft === 0) {
        dueCopy = "Due today";
      } else {
        dueCopy = `${daysLeft} days left`;
      }
    }

    return `
      <article class="goal-card">
        <div class="goal-head">
          <div>
            <strong>${escapeHtml(goal.name)}</strong>
            <div class="item-meta">
              <span>Target ${formatCurrency(goal.amount)}</span>
              <span>${goal.dueDate ? formatDate(goal.dueDate) : "No due date"}</span>
            </div>
          </div>
          <button type="button" class="button button-danger" onclick="deleteGoal('${goal.id}')">Delete</button>
        </div>
        <div class="goal-track">
          <div class="goal-fill" style="width: ${progress}%"></div>
        </div>
        <div class="goal-meta-row">
          <span>${progress.toFixed(1)}% funded</span>
          <span>${dueCopy}</span>
        </div>
        <div class="goal-meta-row">
          <span>Allocated ${formatCurrency(allocated)}</span>
          <strong>${remaining > 0 ? `${formatCurrency(remaining)} still needed` : "Fully funded"}</strong>
        </div>
      </article>
    `;
  }).join("");
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
  setHTML("income-list", buildManageList(
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

  const fixedTotal = data.expenses.reduce((sum, expense) => {
    return sum + (isFixedExpense(expense) ? expense.amount : 0);
  }, 0);

  const variableTotal = data.expenses.reduce((sum, expense) => {
    return sum + (isVariableExpense(expense) ? expense.amount : 0);
  }, 0);

  setText("expense-household-total", formatCurrency(totals.householdExpenses));
  setText("expense-household-total-hero", formatCurrency(totals.householdExpenses));
  setText("expense-household-available", formatCurrency(totals.householdAvailable));
  setText("expense-fixed-total", formatCurrency(fixedTotal));
  setText("expense-variable-total", formatCurrency(variableTotal));
  setText("expense-goal-allocated", formatCurrency(totals.totalGoalAllocated));
  setText("expense-count", `${data.expenses.length} ${data.expenses.length === 1 ? "entry" : "entries"}`);

  populatePersonSelect("expense-person", data, "Select who is paying", true);
  populateGoalSelect(data);
  updateExpenseFormState();

  setHTML("expense-balance-grid", buildBalanceCards(totals, true));
  setHTML("expense-split-list", buildSummaryList(data, totals, "expense"));
  setHTML("expense-list", buildManageList(
    sortByNewest(data.expenses),
    data,
    "expense",
    "No expenses added yet. Add the first one and assign who is covering it."
  ));
  renderLegacyNote("expense-legacy-note", totals);
  renderExpenseChart(data.expenses);
}

function renderSavingsPage() {
  if (!byId("savings-page")) {
    return;
  }

  const data = getData();
  const totals = calculateTotals(data);
  const savingsRate = totals.householdIncome > 0
    ? Math.max((totals.householdAvailable / totals.householdIncome) * 100, 0)
    : 0;

  setText("savings-household-available", formatCurrency(totals.householdAvailable));
  setText("savings-income-total", formatCurrency(totals.householdIncome));
  setText("savings-expense-total", formatCurrency(totals.householdExpenses));
  setText("savings-rate", `${savingsRate.toFixed(1)}%`);
  setHTML("savings-balance-grid", buildBalanceCards(totals, true));
  setHTML("savings-split-list", buildSavingsList(totals));
  renderLegacyNote("savings-legacy-note", totals);

  const summary = byId("savings-summary");
  if (summary) {
    if (!data.incomes.length && !data.expenses.length) {
      summary.textContent = "Add income and expenses first, and this page will show how much is still being preserved.";
    } else if (totals.householdAvailable >= 0) {
      summary.textContent = `The household is currently holding on to ${formatCurrency(totals.householdAvailable)} after all tracked expenses and goal allocations.`;
    } else {
      summary.textContent = `The household is currently overspent by ${formatCurrency(Math.abs(totals.householdAvailable))}.`;
    }
  }
}

function renderGoalsPage() {
  if (!byId("goals-page")) {
    return;
  }

  const data = getData();
  const totals = calculateTotals(data);
  const goalCoverage = totals.totalGoalTarget > 0
    ? Math.max(0, Math.min((totals.totalGoalAllocated / totals.totalGoalTarget) * 100, 100))
    : 0;

  setText("goals-household-available", formatCurrency(totals.householdAvailable));
  setText("goals-count", `${data.goals.length} ${data.goals.length === 1 ? "goal" : "goals"}`);
  setText("goals-total-target", formatCurrency(totals.totalGoalTarget));
  setText("goals-coverage", `${goalCoverage.toFixed(1)}%`);
  setHTML("goals-balance-grid", buildBalanceCards(totals, true));
  setHTML("goal-list", buildGoalCards(data));
  renderLegacyNote("goals-legacy-note", totals);

  const summary = byId("goals-summary");
  if (summary) {
    if (!data.goals.length) {
      summary.textContent = "Create a goal and we will compare it against the money you have actively allocated to your goals.";
    } else if (totals.totalGoalAllocated > 0) {
      summary.textContent = `You have allocated ${formatCurrency(totals.totalGoalAllocated)} to your goals so far. Household available is now ${formatCurrency(totals.householdAvailable)}.`;
    } else {
      summary.textContent = "You have goals saved, but no money has been allocated to them yet from the expenses page.";
    }
  }
}

function renderAll() {
  renderDashboard();
  renderIncomePage();
  renderExpensesPage();
  renderSavingsPage();
  renderGoalsPage();
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
  const expenseKind = normalizeExpenseKind(byId("expense-type")?.value || "variable");
  const nameInput = String(byId("expense-name")?.value || "").trim();
  const category = String(byId("expense-category")?.value || "").trim();
  const goalId = String(byId("expense-goal-id")?.value || "").trim();
  const dueDate = String(byId("expense-due-date")?.value || "").trim();
  const amount = Number(byId("expense-amount")?.value);
  const data = getData();

  const validPayer = personId === SHARED_PERSON_ID || data.people.some((person) => person.id === personId);
  const isAllocation = expenseKind === "goal-allocation";
  const isFixed = expenseKind === "fixed";

  if (!validPayer || !Number.isFinite(amount) || amount <= 0) {
    setMessage("expense-message", "Choose who is paying and enter an amount above zero.", "error");
    return;
  }

  let name = nameInput;
  let finalCategory = category || "Other";
  let linkedGoalId = "";
  let linkedGoalName = "";
  let finalDueDate = dueDate;

  if (isAllocation) {
    const goal = data.goals.find((entry) => entry.id === goalId);

    if (!goal) {
      setMessage("expense-message", "Select the goal you want to allocate money to.", "error");
      return;
    }

    linkedGoalId = goal.id;
    linkedGoalName = goal.name;
    finalCategory = "Goals";
    finalDueDate = "";
    name = name || `Allocation to ${goal.name}`;
  }

  if (isFixed && !finalDueDate) {
    setMessage("expense-message", "Fixed expenses require a due date.", "error");
    return;
  }

  if (!name) {
    setMessage("expense-message", "Add a name for the expense or allocation.", "error");
    return;
  }

  data.expenses.unshift({
    id: createId("expense"),
    personId,
    name,
    category: finalCategory,
    amount,
    createdAt: new Date().toISOString(),
    expenseKind,
    dueDate: finalDueDate,
    goalId: linkedGoalId,
    goalName: linkedGoalName
  });

  saveData(data);
  byId("expense-form")?.reset();
  populatePersonSelect("expense-person", data, "Select who is paying", true);
  populateGoalSelect(data);
  updateExpenseFormState();
  setMessage("expense-message", isAllocation
    ? "Goal allocation saved successfully."
    : "Expense saved successfully.", "success");
  renderAll();
}

function deleteIncome(incomeId) {
  const data = getData();
  const income = data.incomes.find((entry) => entry.id === incomeId);

  if (!income) {
    return;
  }

  const confirmed = window.confirm(`Delete income "${income.name}"?`);

  if (!confirmed) {
    return;
  }

  data.incomes = data.incomes.filter((entry) => entry.id !== incomeId);
  saveData(data);
  renderAll();
}

function deleteExpense(expenseId) {
  const data = getData();
  const expense = data.expenses.find((entry) => entry.id === expenseId);

  if (!expense) {
    return;
  }

  const confirmed = window.confirm(`Delete expense "${expense.name}"?`);

  if (!confirmed) {
    return;
  }

  data.expenses = data.expenses.filter((entry) => entry.id !== expenseId);
  saveData(data);
  renderAll();
}

function addGoal(event) {
  event.preventDefault();

  const name = String(byId("goal-name")?.value || "").trim();
  const amount = Number(byId("goal-amount")?.value);
  const dueDate = String(byId("goal-due-date")?.value || "").trim();
  const data = getData();

  if (!name || !Number.isFinite(amount) || amount <= 0) {
    setMessage("goal-message", "Add a goal name and an amount above zero.", "error");
    return;
  }

  data.goals.unshift({
    id: createId("goal"),
    name,
    amount,
    dueDate,
    createdAt: new Date().toISOString()
  });

  saveData(data);
  byId("goal-form")?.reset();
  setMessage("goal-message", "Goal saved successfully.", "success");
  renderAll();
}

function deleteGoal(goalId) {
  const data = getData();
  const goal = data.goals.find((entry) => entry.id === goalId);

  if (!goal) {
    return;
  }

  const linkedAllocations = data.expenses.filter((expense) => {
    return isGoalAllocation(expense) && expense.goalId === goalId;
  });
  const confirmationText = linkedAllocations.length
    ? `Delete goal "${goal.name}" and remove its ${linkedAllocations.length} linked allocation${linkedAllocations.length === 1 ? "" : "s"}?`
    : `Delete goal "${goal.name}"?`;
  const confirmed = window.confirm(confirmationText);

  if (!confirmed) {
    return;
  }

  data.goals = data.goals.filter((entry) => entry.id !== goalId);
  data.expenses = data.expenses.filter((expense) => {
    return !(isGoalAllocation(expense) && expense.goalId === goalId);
  });
  saveData(data);
  renderAll();
}

function resetFinanceData() {
  const code = window.prompt("Enter reset code to erase all finance data:");

  if (code === null) {
    return;
  }

  if (code !== "8681") {
    window.alert("Incorrect reset code.");
    return;
  }

  const confirmed = window.confirm(
    "This will delete all finance data, including incomes, expenses, goals, and household names. Continue?"
  );

  if (!confirmed) {
    return;
  }

  saveData(getEmptyData());
  renderAll();
  window.alert("Finance data has been reset.");
}

function bindEvents() {
  byId("member-form")?.addEventListener("submit", saveMembers);
  byId("income-form")?.addEventListener("submit", addIncome);
  byId("expense-form")?.addEventListener("submit", addExpense);
  byId("goal-form")?.addEventListener("submit", addGoal);
  byId("expense-type")?.addEventListener("change", updateExpenseFormState);
  byId("reset-finance-button")?.addEventListener("click", resetFinanceData);
}

document.addEventListener("DOMContentLoaded", () => {
  initStorage();
  bindEvents();
  renderAll();
});

window.addEventListener("storage", renderAll);
window.deleteIncome = deleteIncome;
window.deleteExpense = deleteExpense;
window.deleteGoal = deleteGoal;
