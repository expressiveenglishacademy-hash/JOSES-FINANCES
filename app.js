const STORAGE_KEY = "financeTrackerData";
const SHARED_PERSON_ID = "shared";
const EXPENSE_DUE_SOON_DAYS = 7;
const INCOME_DUE_SOON_DAYS = 7;
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

function parseDateValue(value) {
  const raw = String(value || "").trim();

  if (!raw) {
    return null;
  }

  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (match) {
    const [, year, month, day] = match;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day));

    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(raw);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(value) {
  const parsed = parseDateValue(value);

  if (!parsed) {
    return "No date";
  }

  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function formatDateInput(value) {
  const parsed = parseDateValue(value);

  if (!parsed) {
    return "";
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function addDaysToDateInput(value, days) {
  const parsed = parseDateValue(value);

  if (!parsed) {
    return "";
  }

  parsed.setDate(parsed.getDate() + days);
  return formatDateInput(parsed);
}

function addMonthsToDateInput(value, months) {
  const parsed = parseDateValue(value);

  if (!parsed) {
    return "";
  }

  const originalDay = parsed.getDate();
  const target = new Date(parsed.getFullYear(), parsed.getMonth() + months, 1);
  const lastDayOfMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();

  target.setDate(Math.min(originalDay, lastDayOfMonth));

  return formatDateInput(target);
}

function getDaysUntil(value) {
  const parsed = parseDateValue(value);

  if (!parsed) {
    return null;
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());

  return Math.ceil((target - today) / 86400000);
}

function getDateSortValue(value, fallback = Number.POSITIVE_INFINITY) {
  const parsed = parseDateValue(value);
  return parsed ? parsed.getTime() : fallback;
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
    dueDate: String(goal.dueDate || "").trim(),
    createdAt: goal.createdAt || new Date().toISOString()
  })).filter((goal) => goal.name && goal.amount > 0);
}

function normalizeIncomeFrequency(value, hasExpectedDate = false) {
  const raw = String(value || "").trim().toLowerCase();

  if (raw === "bi-weekly" || raw === "biweekly") {
    return "bi-weekly";
  }

  if (raw === "monthly" || raw === "one-time" || raw === "one time" || raw === "onetime") {
    return "monthly";
  }

  if (raw === "manual") {
    return "manual";
  }

  return hasExpectedDate ? "monthly" : "manual";
}

function normalizeIncomeStatus(value, hasExpectedDate) {
  const raw = String(value || "").trim().toLowerCase();

  if (raw === "pending" || raw === "scheduled" || raw === "listed") {
    return "pending";
  }

  if (raw === "received") {
    return "received";
  }

  return hasExpectedDate ? "pending" : "received";
}

function normalizeIncomes(rawIncomes, validIds) {
  return (Array.isArray(rawIncomes) ? rawIncomes : []).map((income) => {
    const id = income.id || createId("income");
    const expectedDate = String(income.expectedDate || income.depositDate || "").trim();
    const incomeFrequency = normalizeIncomeFrequency(
      income.incomeFrequency || income.frequency,
      Boolean(expectedDate)
    );
    const incomeStatus = normalizeIncomeStatus(
      income.incomeStatus || income.status,
      Boolean(expectedDate)
    );
    const createdAt = income.createdAt || income.receivedAt || new Date().toISOString();
    const receivedAt = incomeStatus === "received"
      ? (income.receivedAt || income.createdAt || new Date().toISOString())
      : "";
    const recurrenceGroupId = String(
      income.recurrenceGroupId
      || (incomeFrequency !== "manual" ? `series-${id}` : "")
    ).trim();

    return {
      id,
      personId: normalizePersonId(income.personId, validIds),
      name: String(income.name || "").trim(),
      amount: Number(income.amount) || 0,
      incomeFrequency,
      expectedDate,
      incomeStatus,
      receivedAt,
      createdAt,
      recurrenceGroupId,
      generatedFromIncomeId: String(income.generatedFromIncomeId || "").trim()
    };
  }).filter((income) => income.name && income.amount > 0);
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

function normalizePaymentStatus(value, fallback = "paid") {
  const raw = String(value || "").trim().toLowerCase();

  if (raw === "paid") {
    return "paid";
  }

  if (raw === "pending" || raw === "listed") {
    return "pending";
  }

  return fallback;
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
    const legacyGoalAllocation = expense.type === "Goal Allocation";
    const expenseKind = normalizeExpenseKind(
      expense.expenseKind || expense.expenseType || (legacyGoalAllocation ? "goal-allocation" : expense.type)
    );
    const goalRef = resolveGoalReference(expense, goals);
    const goalName = expenseKind === "goal-allocation"
      ? goalRef.goalName || "Goal"
      : "";
    const name = String(expense.name || "").trim()
      || (expenseKind === "goal-allocation" && goalName ? `Allocation to ${goalName}` : "");
    const paymentStatus = expenseKind === "goal-allocation"
      ? "paid"
      : normalizePaymentStatus(expense.paymentStatus, "paid");
    const paidAt = paymentStatus === "paid"
      ? (expense.paidAt || expense.createdAt || new Date().toISOString())
      : "";
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
      paymentStatus,
      paidAt,
      dueDate,
      goalId: expenseKind === "goal-allocation" ? goalRef.goalId : "",
      goalName
    };
  }).filter((expense) => expense.name && expense.amount > 0);
}

function isReceivedIncome(income) {
  return income.incomeStatus === "received";
}

function isPendingIncome(income) {
  return income.incomeStatus !== "received";
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

function isPaidExpense(expense) {
  return isGoalAllocation(expense) || expense.paymentStatus === "paid";
}

function isPendingExpense(expense) {
  return !isGoalAllocation(expense) && expense.paymentStatus !== "paid";
}

function isCountedExpense(expense) {
  return isPaidExpense(expense);
}

function getIncomeStatus(income) {
  if (isReceivedIncome(income)) {
    return "received";
  }

  const daysUntil = getDaysUntil(income.expectedDate);

  if (daysUntil === null) {
    return "scheduled";
  }

  if (daysUntil < 0) {
    return "overdue";
  }

  if (daysUntil <= INCOME_DUE_SOON_DAYS) {
    return "due-soon";
  }

  return "scheduled";
}

function getExpenseStatus(expense) {
  if (isGoalAllocation(expense)) {
    return "allocated";
  }

  if (isPaidExpense(expense)) {
    return "paid";
  }

  const daysUntil = getDaysUntil(expense.dueDate);

  if (daysUntil === null) {
    return "listed";
  }

  if (daysUntil < 0) {
    return "overdue";
  }

  if (daysUntil <= EXPENSE_DUE_SOON_DAYS) {
    return "due-soon";
  }

  return "listed";
}

function getIncomeStatusLabel(status) {
  const labels = {
    scheduled: "Scheduled",
    "due-soon": "Due Soon",
    overdue: "Overdue",
    received: "Received"
  };

  return labels[status] || "Scheduled";
}

function getExpenseStatusLabel(status) {
  const labels = {
    listed: "Listed",
    "due-soon": "Due Soon",
    overdue: "Overdue",
    paid: "Paid",
    allocated: "Allocated"
  };

  return labels[status] || "Listed";
}

function getIncomeFrequencyLabel(income) {
  if (income.incomeFrequency === "bi-weekly") {
    return "Bi-Weekly";
  }

  if (income.incomeFrequency === "monthly") {
    return "Monthly";
  }

  return "Manual";
}

function getExpenseKindLabel(expense) {
  if (isGoalAllocation(expense)) {
    return "Goal Allocation";
  }

  return isFixedExpense(expense) ? "Fixed" : "Variable";
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
  const receivedIncomes = data.incomes.filter((income) => {
    return income.personId === personId && isReceivedIncome(income);
  });
  const pendingIncomes = data.incomes.filter((income) => {
    return income.personId === personId && isPendingIncome(income);
  });
  const countedExpenses = data.expenses.filter((expense) => {
    return expense.personId === personId && isCountedExpense(expense);
  });
  const pendingExpenses = data.expenses.filter((expense) => {
    return expense.personId === personId && isPendingExpense(expense);
  });

  const incomeTotal = receivedIncomes.reduce((sum, income) => sum + income.amount, 0);
  const scheduledIncome = pendingIncomes.reduce((sum, income) => sum + income.amount, 0);
  const expenseTotal = countedExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const pendingAmount = pendingExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const goalAllocated = countedExpenses.reduce((sum, expense) => {
    return sum + (isGoalAllocation(expense) ? expense.amount : 0);
  }, 0);

  return {
    id: personId,
    name: getPersonName(data, personId),
    income: incomeTotal,
    scheduledIncome,
    expenses: expenseTotal,
    pendingAmount,
    available: incomeTotal - expenseTotal,
    goalAllocated,
    incomeCount: receivedIncomes.length,
    expenseCount: countedExpenses.length
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
  const receivedIncomes = data.incomes.filter(isReceivedIncome);
  const countedExpenses = data.expenses.filter(isCountedExpense);
  const householdIncome = receivedIncomes.reduce((sum, income) => sum + income.amount, 0);
  const householdExpenses = countedExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const householdAvailable = householdIncome - householdExpenses;
  const totalGoalTarget = data.goals.reduce((sum, goal) => sum + goal.amount, 0);
  const totalGoalAllocated = countedExpenses.reduce((sum, expense) => {
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

function sortExpensesForDisplay(items) {
  const getRank = (expense) => {
    const status = getExpenseStatus(expense);

    if (status === "overdue") {
      return 0;
    }

    if (status === "due-soon") {
      return 1;
    }

    if (status === "listed") {
      return 2;
    }

    if (status === "paid") {
      return 3;
    }

    return 4;
  };

  return [...items].sort((left, right) => {
    const rankDiff = getRank(left) - getRank(right);

    if (rankDiff !== 0) {
      return rankDiff;
    }

    if (isPendingExpense(left) && isPendingExpense(right)) {
      const dueDiff = getDateSortValue(left.dueDate) - getDateSortValue(right.dueDate);

      if (dueDiff !== 0) {
        return dueDiff;
      }
    }

    return new Date(right.paidAt || right.createdAt).getTime() - new Date(left.paidAt || left.createdAt).getTime();
  });
}

function sortIncomesForDisplay(items) {
  const getRank = (income) => {
    const status = getIncomeStatus(income);

    if (status === "overdue") {
      return 0;
    }

    if (status === "due-soon") {
      return 1;
    }

    if (status === "scheduled") {
      return 2;
    }

    return 3;
  };

  return [...items].sort((left, right) => {
    const rankDiff = getRank(left) - getRank(right);

    if (rankDiff !== 0) {
      return rankDiff;
    }

    if (isPendingIncome(left) && isPendingIncome(right)) {
      const expectedDiff = getDateSortValue(left.expectedDate) - getDateSortValue(right.expectedDate);

      if (expectedDiff !== 0) {
        return expectedDiff;
      }
    }

    return new Date(right.receivedAt || right.createdAt).getTime() - new Date(left.receivedAt || left.createdAt).getTime();
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

function updateIncomeFormState() {
  const frequencySelect = byId("income-frequency");
  const expectedDateInput = byId("income-expected-date");
  const note = byId("income-schedule-note");

  if (!frequencySelect) {
    return;
  }

  const frequency = frequencySelect.value;

  if (expectedDateInput) {
    expectedDateInput.required = true;
  }

  if (note) {
    note.textContent = frequency === "bi-weekly"
      ? "When you mark a bi-weekly paycheck as received, the next paycheck 14 days later will be scheduled automatically."
      : "Monthly income keeps repeating every month until you remove the schedule.";
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
      note.textContent = "Goal allocations still deduct immediately because you are actively moving that money into a goal.";
    } else if (isFixed) {
      note.textContent = "Fixed expenses are listed first and only reduce the available balance after you manually mark them paid.";
    } else {
      note.textContent = "Variable expenses can stay listed, due soon, or overdue until you manually mark them paid.";
    }
  }
}

function buildStatusPill(status, label) {
  return `<span class="status-pill status-${escapeHtml(status)}">${escapeHtml(label)}</span>`;
}

function buildBalanceCards(totals, showShared) {
  const cards = totals.personStats.map((stat) => `
    <article class="person-card">
      <span class="person-kicker">${escapeHtml(stat.name)}</span>
      <strong>${formatCurrency(stat.available)}</strong>
      <div class="person-meta">
        <span>Received income: ${formatCurrency(stat.income)}</span>
        ${stat.scheduledIncome > 0 ? `<span>Scheduled income: ${formatCurrency(stat.scheduledIncome)}</span>` : ""}
        <span>Paid or allocated: ${formatCurrency(stat.expenses)}</span>
        ${stat.pendingAmount > 0 ? `<span>Pending bills: ${formatCurrency(stat.pendingAmount)}</span>` : ""}
        ${stat.goalAllocated > 0 ? `<span>Goals allocated: ${formatCurrency(stat.goalAllocated)}</span>` : ""}
      </div>
    </article>
  `);

  if (showShared && (totals.sharedStats.income > 0 || totals.sharedStats.expenses > 0 || totals.sharedStats.pendingAmount > 0 || totals.sharedStats.scheduledIncome > 0)) {
    cards.push(`
      <article class="person-card shared-card">
        <span class="person-kicker">Shared</span>
        <strong>${formatCurrency(totals.sharedStats.available)}</strong>
        <div class="person-meta">
          <span>Received income: ${formatCurrency(totals.sharedStats.income)}</span>
          ${totals.sharedStats.scheduledIncome > 0 ? `<span>Scheduled income: ${formatCurrency(totals.sharedStats.scheduledIncome)}</span>` : ""}
          <span>Paid or allocated: ${formatCurrency(totals.sharedStats.expenses)}</span>
          ${totals.sharedStats.pendingAmount > 0 ? `<span>Pending bills: ${formatCurrency(totals.sharedStats.pendingAmount)}</span>` : ""}
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
    ? "No received income has been recorded yet."
    : "No paid expenses have been recorded yet.";

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

function buildIncomeMeta(item, data) {
  const status = getIncomeStatus(item);
  const parts = [
    `<span>${escapeHtml(getPersonName(data, item.personId))}</span>`,
    `<span>${escapeHtml(getIncomeFrequencyLabel(item))}</span>`
  ];

  if (item.expectedDate) {
    parts.push(`<span>Expected ${escapeHtml(formatDate(item.expectedDate))}</span>`);
  }

  if (isReceivedIncome(item)) {
    parts.push(`<span>Received ${escapeHtml(formatDate(item.receivedAt || item.createdAt))}</span>`);
  }

  parts.push(buildStatusPill(status, getIncomeStatusLabel(status)));

  return parts.join("");
}

function buildExpenseMeta(item, data) {
  if (isGoalAllocation(item)) {
    return [
      `<span>${escapeHtml(getPersonName(data, item.personId))}</span>`,
      "<span>Goal Allocation</span>",
      `<span>${escapeHtml(getGoalName(data, item.goalId, item.goalName))}</span>`,
      `<span>${escapeHtml(formatDate(item.createdAt))}</span>`,
      buildStatusPill("allocated", getExpenseStatusLabel("allocated"))
    ].join("");
  }

  const status = getExpenseStatus(item);
  const parts = [
    `<span>${escapeHtml(getPersonName(data, item.personId))}</span>`,
    `<span>${escapeHtml(getExpenseKindLabel(item))}</span>`,
    `<span>${escapeHtml(item.category)}</span>`,
    item.dueDate
      ? `<span>Due ${escapeHtml(formatDate(item.dueDate))}</span>`
      : "<span>No due date</span>"
  ];

  if (isPaidExpense(item)) {
    parts.push(`<span>Paid ${escapeHtml(formatDate(item.paidAt || item.createdAt))}</span>`);
  }

  parts.push(buildStatusPill(status, getExpenseStatusLabel(status)));

  return parts.join("");
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
          ${kind === "expense" ? buildExpenseMeta(item, data) : buildIncomeMeta(item, data)}
        </div>
      </div>
      <strong>${formatCurrency(item.amount)}</strong>
    </div>
  `).join("");
}

function buildIncomeManageList(items, data, emptyCopy) {
  if (!items.length) {
    return `<div class="empty-state">${emptyCopy}</div>`;
  }

  return items.map((item) => `
    <div class="list-item">
      <div>
        <strong>${escapeHtml(item.name)}</strong>
        <div class="item-meta">${buildIncomeMeta(item, data)}</div>
      </div>
      <div class="action-stack">
        <strong>${formatCurrency(item.amount)}</strong>
        <div class="action-row">
          ${isPendingIncome(item)
            ? `<button type="button" class="button button-success" onclick="markIncomeReceived('${item.id}')">Mark Received</button>`
            : `<button type="button" class="button button-secondary" onclick="markIncomePending('${item.id}')">Mark Unreceived</button>`}
          <button type="button" class="button button-danger" onclick="deleteIncome('${item.id}')">Delete</button>
        </div>
      </div>
    </div>
  `).join("");
}

function buildAssigneeOptions(data, selectedPersonId) {
  const options = [];

  data.people.forEach((person) => {
    const selected = person.id === selectedPersonId ? " selected" : "";
    options.push(`<option value="${escapeHtml(person.id)}"${selected}>${escapeHtml(person.name)}</option>`);
  });

  const sharedSelected = selectedPersonId === SHARED_PERSON_ID ? " selected" : "";
  options.push(`<option value="${SHARED_PERSON_ID}"${sharedSelected}>Shared expense</option>`);

  return options.join("");
}

function buildExpenseManageList(items, data, emptyCopy) {
  if (!items.length) {
    return `<div class="empty-state">${emptyCopy}</div>`;
  }

  return items.map((item) => {
    const actions = [];

    if (!isGoalAllocation(item)) {
      if (isPendingExpense(item)) {
        actions.push(`<button type="button" class="button button-success" onclick="markExpensePaid('${item.id}')">Mark Paid</button>`);
      } else {
        actions.push(`<button type="button" class="button button-secondary" onclick="markExpenseUnpaid('${item.id}')">Mark Unpaid</button>`);
      }
    }

    actions.push(`<button type="button" class="button button-secondary" onclick="updateExpenseAssignee('${item.id}')">Save Assignee</button>`);
    actions.push(`<button type="button" class="button button-danger" onclick="deleteExpense('${item.id}')">Delete</button>`);

    return `
      <div class="list-item">
        <div>
          <strong>${escapeHtml(item.name)}</strong>
          <div class="item-meta">${buildExpenseMeta(item, data)}</div>
        </div>
        <div class="action-stack">
          <strong>${formatCurrency(item.amount)}</strong>
          <select class="inline-select" id="expense-assignee-${item.id}">
            ${buildAssigneeOptions(data, item.personId)}
          </select>
          <div class="action-row">
            ${actions.join("")}
          </div>
        </div>
      </div>
    `;
  }).join("");
}

function renderLegacyNote(id, totals) {
  const element = byId(id);

  if (!element) {
    return;
  }

  if (totals.sharedStats.income > 0 || totals.sharedStats.expenses > 0 || totals.sharedStats.pendingAmount > 0 || totals.sharedStats.scheduledIncome > 0) {
    element.style.display = "block";
    element.textContent = "Existing entries created before the split view stay under Shared so they do not get assigned to the wrong person.";
  } else {
    element.style.display = "none";
    element.textContent = "";
  }
}

function renderExpenseChart(expenses) {
  const canvas = byId("expense-chart");
  const emptyState = byId("expense-chart-empty") || byId("chart-empty");

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
            <span>Received income ${formatCurrency(stat.income)}</span>
            ${stat.scheduledIncome > 0 ? `<span>Scheduled income ${formatCurrency(stat.scheduledIncome)}</span>` : ""}
            <span>Paid or allocated ${formatCurrency(stat.expenses)}</span>
            ${stat.pendingAmount > 0 ? `<span>Pending bills ${formatCurrency(stat.pendingAmount)}</span>` : ""}
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

  if (totals.sharedStats.income > 0 || totals.sharedStats.expenses > 0 || totals.sharedStats.pendingAmount > 0 || totals.sharedStats.scheduledIncome > 0) {
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
    : `Household available balance is ${formatCurrency(totals.householdAvailable)} after received income, paid bills, and goal allocations.`;

  setText("summary-text", summary);
  setHTML("person-stats", buildBalanceCards(totals, true));
  setHTML("income-split-list", buildSummaryList(data, totals, "income"));
  setHTML("expense-split-list", buildActivityList(
    sortByNewest(data.expenses.filter(isCountedExpense)).slice(0, 6),
    data,
    "expense",
    "No paid expenses have been recorded yet."
  ));
  renderLegacyNote("shared-data-note", totals);
}

function renderIncomePage() {
  if (!byId("income-page")) {
    return;
  }

  const data = getData();
  const totals = calculateTotals(data);
  const scheduledIncomes = data.incomes.filter(isPendingIncome);
  const dueSoonIncomes = scheduledIncomes.filter((income) => getIncomeStatus(income) === "due-soon");
  const overdueIncomes = scheduledIncomes.filter((income) => getIncomeStatus(income) === "overdue");
  const scheduledTotal = scheduledIncomes.reduce((sum, income) => sum + income.amount, 0);
  const dueSoonTotal = dueSoonIncomes.reduce((sum, income) => sum + income.amount, 0);
  const overdueTotal = overdueIncomes.reduce((sum, income) => sum + income.amount, 0);

  setText("income-household-available", formatCurrency(totals.householdAvailable));
  setText("income-household-total", formatCurrency(totals.householdIncome));
  setText("income-scheduled-total", formatCurrency(scheduledTotal));
  setText("income-due-soon-total", formatCurrency(dueSoonTotal));
  setText("income-overdue-total", formatCurrency(overdueTotal));
  setText("income-people-count", `${data.people.length} people`);
  setText("income-count", `${data.incomes.length} ${data.incomes.length === 1 ? "entry" : "entries"}`);

  if (byId("member-name-1")) {
    byId("member-name-1").value = data.people[0].name;
  }

  if (byId("member-name-2")) {
    byId("member-name-2").value = data.people[1].name;
  }

  populatePersonSelect("income-person", data, "Select who receives it");
  updateIncomeFormState();

  setHTML("income-balance-grid", buildBalanceCards(totals, true));
  setHTML("income-split-list", buildSummaryList(data, totals, "income"));
  setHTML("income-list", buildIncomeManageList(
    sortIncomesForDisplay(data.incomes),
    data,
    "No income scheduled yet. Add the first expected deposit to start tracking incoming money."
  ));
  renderLegacyNote("income-legacy-note", totals);
}

function renderExpensesPage() {
  if (!byId("expenses-page")) {
    return;
  }

  const data = getData();
  const totals = calculateTotals(data);
  const pendingExpenses = data.expenses.filter(isPendingExpense);
  const dueSoonExpenses = pendingExpenses.filter((expense) => getExpenseStatus(expense) === "due-soon");
  const overdueExpenses = pendingExpenses.filter((expense) => getExpenseStatus(expense) === "overdue");
  const pendingTotal = pendingExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const dueSoonTotal = dueSoonExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const overdueTotal = overdueExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const chartExpenses = data.expenses.filter(isCountedExpense);
  const chartEmpty = byId("expense-chart-empty") || byId("chart-empty");

  setText("expense-household-total", formatCurrency(totals.householdExpenses));
  setText("expense-household-total-hero", formatCurrency(totals.householdExpenses));
  setText("expense-household-available", formatCurrency(totals.householdAvailable));
  setText("expense-pending-total", formatCurrency(pendingTotal));
  setText("expense-due-soon-total", formatCurrency(dueSoonTotal));
  setText("expense-overdue-total", formatCurrency(overdueTotal));
  setText("expense-goal-allocated", formatCurrency(totals.totalGoalAllocated));
  setText("expense-count", `${data.expenses.length} ${data.expenses.length === 1 ? "entry" : "entries"}`);

  populatePersonSelect("expense-person", data, "Select who is assigned", true);
  populateGoalSelect(data);
  updateExpenseFormState();

  setHTML("expense-balance-grid", buildBalanceCards(totals, true));
  setHTML("expense-split-list", buildSummaryList(data, totals, "expense"));
  setHTML("expense-list", buildExpenseManageList(
    sortExpensesForDisplay(data.expenses),
    data,
    "No expenses added yet. Add the first one and it will stay listed until you mark it paid."
  ));

  if (chartEmpty && !chartExpenses.length && pendingExpenses.length) {
    chartEmpty.textContent = "Your bills are listed, but none have been marked paid yet. Mark one paid or add a goal allocation to build the chart.";
  }

  renderLegacyNote("expense-legacy-note", totals);
  renderExpenseChart(chartExpenses);
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
      summary.textContent = `The household is currently holding on to ${formatCurrency(totals.householdAvailable)} after received income, paid expenses, and goal allocations.`;
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
  const incomeFrequency = normalizeIncomeFrequency(byId("income-frequency")?.value || "monthly", true);
  const expectedDate = String(byId("income-expected-date")?.value || "").trim();
  const data = getData();

  if (!data.people.some((person) => person.id === personId) || !name || !Number.isFinite(amount) || amount <= 0 || !expectedDate) {
    setMessage("income-message", "Choose who receives it, add a name, set a date, and enter an amount above zero.", "error");
    return;
  }

  const id = createId("income");

  data.incomes.unshift({
    id,
    personId,
    name,
    amount,
    incomeFrequency,
    expectedDate,
    incomeStatus: "pending",
    receivedAt: "",
    createdAt: new Date().toISOString(),
    recurrenceGroupId: `series-${id}`,
    generatedFromIncomeId: ""
  });

  saveData(data);
  byId("income-form")?.reset();
  populatePersonSelect("income-person", data, "Select who receives it");
  updateIncomeFormState();
  setMessage(
    "income-message",
    incomeFrequency === "bi-weekly"
      ? "Bi-weekly income scheduled. Mark it received and the next paycheck will be queued automatically."
      : "Monthly income scheduled. Mark it received and the next month's deposit will be queued automatically.",
    "success"
  );
  renderAll();
}

function ensureNextRecurringIncome(data, income) {
  if (!income.expectedDate || income.incomeFrequency === "manual") {
    return;
  }

  let nextExpectedDate = "";

  if (income.incomeFrequency === "bi-weekly") {
    nextExpectedDate = addDaysToDateInput(income.expectedDate, 14);
  } else if (income.incomeFrequency === "monthly") {
    nextExpectedDate = addMonthsToDateInput(income.expectedDate, 1);
  }

  if (!nextExpectedDate) {
    return;
  }

  const recurrenceGroupId = income.recurrenceGroupId || `series-${income.id}`;
  const alreadyExists = data.incomes.some((entry) => {
    return entry.recurrenceGroupId === recurrenceGroupId && entry.expectedDate === nextExpectedDate;
  });

  if (alreadyExists) {
    return;
  }

  data.incomes.unshift({
    id: createId("income"),
    personId: income.personId,
    name: income.name,
    amount: income.amount,
    incomeFrequency: income.incomeFrequency,
    expectedDate: nextExpectedDate,
    incomeStatus: "pending",
    receivedAt: "",
    createdAt: new Date().toISOString(),
    recurrenceGroupId,
    generatedFromIncomeId: income.id
  });
}

function markIncomeReceived(incomeId) {
  const data = getData();
  const income = data.incomes.find((entry) => entry.id === incomeId);

  if (!income || isReceivedIncome(income)) {
    return;
  }

  income.incomeStatus = "received";
  income.receivedAt = new Date().toISOString();
  ensureNextRecurringIncome(data, income);
  saveData(data);
  renderAll();
}

function markIncomePending(incomeId) {
  const data = getData();
  const income = data.incomes.find((entry) => entry.id === incomeId);

  if (!income || isPendingIncome(income)) {
    return;
  }

  income.incomeStatus = "pending";
  income.receivedAt = "";

  if (income.recurrenceGroupId && income.expectedDate) {
    data.incomes = data.incomes.filter((entry) => {
      return !(
        entry.recurrenceGroupId === income.recurrenceGroupId
        && isPendingIncome(entry)
        && getDateSortValue(entry.expectedDate) > getDateSortValue(income.expectedDate)
      );
    });
  }

  saveData(data);
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

  const validAssignee = personId === SHARED_PERSON_ID || data.people.some((person) => person.id === personId);
  const isAllocation = expenseKind === "goal-allocation";
  const isFixed = expenseKind === "fixed";

  if (!validAssignee || !Number.isFinite(amount) || amount <= 0) {
    setMessage("expense-message", "Choose who is assigned and enter an amount above zero.", "error");
    return;
  }

  let name = nameInput;
  let finalCategory = category || "Other";
  let linkedGoalId = "";
  let linkedGoalName = "";
  let finalDueDate = dueDate;
  let paymentStatus = "pending";
  let paidAt = "";

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
    paymentStatus = "paid";
    paidAt = new Date().toISOString();
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
    paymentStatus,
    paidAt,
    dueDate: finalDueDate,
    goalId: linkedGoalId,
    goalName: linkedGoalName
  });

  saveData(data);
  byId("expense-form")?.reset();
  populatePersonSelect("expense-person", data, "Select who is assigned", true);
  populateGoalSelect(data);
  updateExpenseFormState();
  setMessage(
    "expense-message",
    isAllocation
      ? "Goal allocation saved successfully."
      : "Expense listed successfully. It will only reduce balances after you mark it paid.",
    "success"
  );
  renderAll();
}

function updateExpenseAssignee(expenseId) {
  const data = getData();
  const expense = data.expenses.find((entry) => entry.id === expenseId);
  const select = byId(`expense-assignee-${expenseId}`);

  if (!expense || !select) {
    return;
  }

  const nextPersonId = String(select.value || "").trim();
  const validAssignee = nextPersonId === SHARED_PERSON_ID || data.people.some((person) => person.id === nextPersonId);

  if (!validAssignee) {
    return;
  }

  expense.personId = nextPersonId;
  saveData(data);
  renderAll();
}

function markExpensePaid(expenseId) {
  const data = getData();
  const expense = data.expenses.find((entry) => entry.id === expenseId);

  if (!expense || isGoalAllocation(expense) || isPaidExpense(expense)) {
    return;
  }

  expense.paymentStatus = "paid";
  expense.paidAt = new Date().toISOString();
  saveData(data);
  renderAll();
}

function markExpenseUnpaid(expenseId) {
  const data = getData();
  const expense = data.expenses.find((entry) => entry.id === expenseId);

  if (!expense || isGoalAllocation(expense) || isPendingExpense(expense)) {
    return;
  }

  expense.paymentStatus = "pending";
  expense.paidAt = "";
  saveData(data);
  renderAll();
}

function deleteIncome(incomeId) {
  const data = getData();
  const income = data.incomes.find((entry) => entry.id === incomeId);

  if (!income) {
    return;
  }

  const confirmed = window.confirm(`Delete income entry "${income.name}"?`);

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

  const confirmed = window.confirm(`Delete entry "${expense.name}"?`);

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
  byId("income-frequency")?.addEventListener("change", updateIncomeFormState);
  byId("expense-type")?.addEventListener("change", updateExpenseFormState);
  byId("reset-finance-button")?.addEventListener("click", resetFinanceData);
}

document.addEventListener("DOMContentLoaded", () => {
  initStorage();
  bindEvents();
  updateIncomeFormState();
  updateExpenseFormState();
  renderAll();
});

window.addEventListener("storage", renderAll);
window.deleteIncome = deleteIncome;
window.deleteExpense = deleteExpense;
window.deleteGoal = deleteGoal;
window.markIncomeReceived = markIncomeReceived;
window.markIncomePending = markIncomePending;
window.markExpensePaid = markExpensePaid;
window.markExpenseUnpaid = markExpenseUnpaid;
window.updateExpenseAssignee = updateExpenseAssignee;
