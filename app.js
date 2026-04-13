const STORAGE_KEY = "financeTrackerData";
let expenseChart = null;

function byId(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const el = byId(id);
  if (el) {
    el.textContent = value;
  }
}

function setHTML(id, value) {
  const el = byId(id);
  if (el) {
    el.innerHTML = value;
  }
}

function setWidth(id, value) {
  const el = byId(id);
  if (el) {
    el.style.width = value;
  }
}

function getEmptyData() {
  return {
    bankBalance: 0,
    incomeSources: [],
    incomes: [],
    expenses: [],
    goals: []
  };
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function normalizeExpenseType(type) {
  if (type === "Fixed") {
    return "Fixed";
  }

  if (type === "Goal Allocation") {
    return "Goal Allocation";
  }

  return "Variable";
}

function parseDateValue(value) {
  if (!value) {
    return null;
  }

  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00`)
    : new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function getTimeValue(value) {
  const date = parseDateValue(value);
  return date ? date.getTime() : 0;
}

function formatDate(value) {
  const date = parseDateValue(value);

  if (!date) {
    return "No date";
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function getDaysUntil(value) {
  const target = parseDateValue(value);

  if (!target) {
    return null;
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const due = new Date(target.getFullYear(), target.getMonth(), target.getDate());

  return Math.ceil((due - today) / 86400000);
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(Number(value) || 0);
}

function escapeHtml(value) {
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  };

  return String(value ?? "").replace(/[&<>"']/g, (char) => map[char]);
}

function getData() {
  const emptyData = getEmptyData();

  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));

    if (!parsed || typeof parsed !== "object") {
      return emptyData;
    }

    const rawIncomes = Array.isArray(parsed.incomes) ? parsed.incomes : [];
    const rawExpenses = Array.isArray(parsed.expenses) ? parsed.expenses : [];
    const rawGoals = Array.isArray(parsed.goals) ? parsed.goals : [];
    const rawIncomeSources = Array.isArray(parsed.incomeSources) ? parsed.incomeSources : [];

    const derivedIncomeSources = rawIncomeSources.length
      ? rawIncomeSources
      : Array.from(
          new Set(
            rawIncomes
              .map((income) => String(income.name || "").trim())
              .filter(Boolean)
          )
        ).map((name) => ({
          id: createId("source"),
          name,
          createdAt: new Date().toISOString()
        }));

    const incomeSources = derivedIncomeSources
      .map((source) => ({
        id: source.id || createId("source"),
        name: String(source.name || "").trim(),
        createdAt: source.createdAt || new Date().toISOString()
      }))
      .filter((source) => source.name);

    const goals = rawGoals
      .map((goal) => ({
        id: goal.id || createId("goal"),
        name: String(goal.name || "").trim(),
        amount: Number(goal.amount) || 0,
        dueDate: goal.dueDate || "",
        createdAt: goal.createdAt || new Date().toISOString()
      }))
      .filter((goal) => goal.name && goal.amount > 0);

    const incomes = rawIncomes
      .map((income) => {
        const name = String(income.name || "").trim();
        const sourceMatch = incomeSources.find(
          (source) =>
            source.id === income.sourceId ||
            source.name.toLowerCase() === name.toLowerCase()
        );

        return {
          id: income.id || createId("income"),
          sourceId: sourceMatch ? sourceMatch.id : "",
          name,
          amount: Number(income.amount) || 0,
          createdAt: income.createdAt || new Date().toISOString()
        };
      })
      .filter((income) => income.name && income.amount > 0);

    const expenses = rawExpenses
      .map((expense) => {
        const type = normalizeExpenseType(expense.type);
        const createdAt = expense.createdAt || new Date().toISOString();
        const autoPaid = type === "Variable" || type === "Goal Allocation";

        return {
          id: expense.id || createId("expense"),
          name: String(expense.name || "").trim(),
          category: String(expense.category || "Other").trim() || "Other",
          type,
          goalId: expense.goalId || "",
          goalName: String(expense.goalName || "").trim(),
          dueDate: expense.dueDate || "",
          amount: Number(expense.amount) || 0,
          isPaid: autoPaid
            ? true
            : typeof expense.isPaid === "boolean"
              ? expense.isPaid
              : false,
          paidAt: expense.paidAt || (autoPaid ? createdAt : ""),
          createdAt
        };
      })
      .filter((expense) => expense.name && expense.amount > 0);

    return {
      bankBalance: Number.isFinite(Number(parsed.bankBalance)) ? Number(parsed.bankBalance) : 0,
      incomeSources,
      incomes,
      expenses,
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

function isExpensePaid(expense) {
  const type = normalizeExpenseType(expense.type);
  return type === "Fixed" ? Boolean(expense.isPaid) : true;
}

function getGoalAllocationMap(expenses, goals) {
  const map = new Map();

  expenses.forEach((expense) => {
    if (normalizeExpenseType(expense.type) !== "Goal Allocation") {
      return;
    }

    let goalId = expense.goalId || "";

    if (!goalId && expense.goalName) {
      const match = goals.find(
        (goal) => goal.name.toLowerCase() === String(expense.goalName).toLowerCase()
      );
      goalId = match ? match.id : "";
    }

    if (!goalId) {
      return;
    }

    map.set(goalId, (map.get(goalId) || 0) + (Number(expense.amount) || 0));
  });

  return map;
}

function getExpenseStatus(expense) {
  const type = normalizeExpenseType(expense.type);

  if (type === "Variable") {
    return {
      text: "Paid",
      className: "status-pill status-good"
    };
  }

  if (type === "Goal Allocation") {
    return {
      text: "Allocated",
      className: "status-pill status-good"
    };
  }

  if (isExpensePaid(expense)) {
    return {
      text: "Paid",
      className: "status-pill status-good"
    };
  }

  const daysLeft = getDaysUntil(expense.dueDate);

  if (daysLeft === null) {
    return {
      text: "No Due Date",
      className: "status-pill status-bad"
    };
  }

  if (daysLeft < 0) {
    return {
      text: "Overdue",
      className: "status-pill status-bad"
    };
  }

  if (daysLeft === 0) {
    return {
      text: "Due Today",
      className: "status-pill status-warn"
    };
  }

  if (daysLeft <= 7) {
    return {
      text: "Due Soon",
      className: "status-pill status-warn"
    };
  }

  return {
    text: "Upcoming",
    className: "status-pill status-good"
  };
}

function sortExpensesForDisplay(expenses) {
  return [...expenses].sort((a, b) => {
    const aType = normalizeExpenseType(a.type);
    const bType = normalizeExpenseType(b.type);

    if (aType !== bType) {
      const order = {
        "Fixed": 0,
        "Goal Allocation": 1,
        "Variable": 2
      };

      return order[aType] - order[bType];
    }

    const aPaid = isExpensePaid(a);
    const bPaid = isExpensePaid(b);

    if (aPaid !== bPaid) {
      return aPaid ? 1 : -1;
    }

    if (aType === "Fixed") {
      const aDays = getDaysUntil(a.dueDate);
      const bDays = getDaysUntil(b.dueDate);
      const aValue = aDays === null ? 999999 : aDays;
      const bValue = bDays === null ? 999999 : bDays;

      if (aValue !== bValue) {
        return aValue - bValue;
      }
    }

    return getTimeValue(b.createdAt) - getTimeValue(a.createdAt);
  });
}

function calculateTotals(data) {
  const totalBankBalance = Number(data.bankBalance) || 0;
  const totalIncome = data.incomes.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

  const totalExpenses = data.expenses.reduce((sum, item) => {
    return sum + (isExpensePaid(item) ? (Number(item.amount) || 0) : 0);
  }, 0);

  const totalGoalAllocated = data.expenses.reduce((sum, item) => {
    return sum + (normalizeExpenseType(item.type) === "Goal Allocation" ? (Number(item.amount) || 0) : 0);
  }, 0);

  const netSavings = totalIncome - totalExpenses;
  const availableNow = totalBankBalance + netSavings;
  const totalGoals = data.goals.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

  return {
    totalBankBalance,
    totalIncome,
    totalExpenses,
    totalGoalAllocated,
    netSavings,
    availableNow,
    totalGoals
  };
}

function calculateGoalPlan(goalAmount, allocatedAmount, dueDate) {
  const target = Number(goalAmount) || 0;
  const allocated = Math.max(Number(allocatedAmount) || 0, 0);
  const remaining = Math.max(target - allocated, 0);
  const daysLeft = getDaysUntil(dueDate);
  const monthsLeft = daysLeft !== null && daysLeft > 0 ? Math.max(daysLeft / 30, 1) : null;
  const monthlyNeeded = remaining === 0 ? 0 : monthsLeft ? remaining / monthsLeft : remaining;
  const progress = target > 0 ? Math.min((allocated / target) * 100, 100) : 0;

  return {
    target,
    allocated,
    remaining,
    daysLeft,
    monthlyNeeded,
    progress
  };
}

function setMessage(id, text, type) {
  const el = byId(id);

  if (!el) {
    return;
  }

  el.textContent = text;
  el.className = ["message", type].filter(Boolean).join(" ");
}

function findIncomeSourceByName(data, name) {
  const normalized = String(name || "").trim().toLowerCase();
  return data.incomeSources.find((source) => source.name.toLowerCase() === normalized) || null;
}

function ensureIncomeSource(data, name) {
  const trimmedName = String(name || "").trim();
  const existing = findIncomeSourceByName(data, trimmedName);

  if (existing) {
    return existing;
  }

  const source = {
    id: createId("source"),
    name: trimmedName,
    createdAt: new Date().toISOString()
  };

  data.incomeSources.push(source);
  return source;
}

function updateBankBalance(event) {
  if (event) {
    event.preventDefault();
  }

  const amountInput = byId("bank-balance-amount");

  if (!amountInput) {
    return;
  }

  const amount = Number(amountInput.value);

  if (!Number.isFinite(amount) || amount < 0) {
    setMessage("bank-balance-message", "Enter a valid amount equal to or greater than zero.", "error");
    return;
  }

  const data = getData();
  data.bankBalance = amount;
  saveData(data);

  byId("bank-balance-form")?.reset();
  setMessage("bank-balance-message", "Current bank funds updated successfully.", "success");
  render();
}

function addIncome(event) {
  if (event) {
    event.preventDefault();
  }

  const sourceSelect = byId("income-source-select");
  const newSourceInput = byId("income-new-source");
  const legacyNameInput = byId("income-name");
  const amountInput = byId("income-amount");

  if (!amountInput) {
    return;
  }

  const data = getData();
  let sourceName = "";

  if (sourceSelect) {
    if (sourceSelect.value && sourceSelect.value !== "__new__") {
      const selectedSource = data.incomeSources.find((source) => source.id === sourceSelect.value);
      sourceName = selectedSource ? selectedSource.name : "";
    } else {
      sourceName = newSourceInput ? newSourceInput.value.trim() : "";
    }
  } else {
    sourceName = legacyNameInput ? legacyNameInput.value.trim() : "";
  }

  const amount = Number(amountInput.value);

  if (!sourceName || !Number.isFinite(amount) || amount <= 0) {
    setMessage("income-message", "Select or enter a valid income source and amount greater than zero.", "error");
    return;
  }

  const source = ensureIncomeSource(data, sourceName);

  data.incomes.unshift({
    id: createId("income"),
    sourceId: source.id,
    name: source.name,
    amount,
    createdAt: new Date().toISOString()
  });

  saveData(data);
  byId("income-form")?.reset();
  setMessage("income-message", "Income saved successfully.", "success");
  render();
}

function addExpense(event) {
  if (event) {
    event.preventDefault();
  }

  const nameInput = byId("expense-name");
  const categoryInput = byId("expense-category");
  const typeInput = byId("expense-type");
  const goalSelect = byId("expense-goal-id");
  const dueDateInput = byId("expense-due-date");
  const amountInput = byId("expense-amount");

  if (!nameInput || !categoryInput || !amountInput) {
    return;
  }

  const name = nameInput.value.trim();
  const type = normalizeExpenseType(typeInput ? typeInput.value : "Variable");
  const amount = Number(amountInput.value);

  if (!name || !Number.isFinite(amount) || amount <= 0) {
    setMessage("expense-message", "Enter a valid expense and amount greater than zero.", "error");
    return;
  }

  const data = getData();
  let category = categoryInput.value || "Other";
  let dueDate = dueDateInput ? dueDateInput.value : "";
  let goalId = "";
  let goalName = "";

  if (type === "Fixed" && !dueDate) {
    setMessage("expense-message", "Fixed expenses require a due date.", "error");
    return;
  }

  if (type === "Goal Allocation") {
    if (!data.goals.length) {
      setMessage("expense-message", "Add a goal first before creating a goal allocation.", "error");
      return;
    }

    if (!goalSelect || !goalSelect.value) {
      setMessage("expense-message", "Select a goal for this allocation.", "error");
      return;
    }

    const goal = data.goals.find((item) => item.id === goalSelect.value);

    if (!goal) {
      setMessage("expense-message", "Selected goal was not found.", "error");
      return;
    }

    goalId = goal.id;
    goalName = goal.name;
    category = "Goals";
    dueDate = "";
  }

  const now = new Date().toISOString();
  const autoPaid = type === "Variable" || type === "Goal Allocation";

  data.expenses.unshift({
    id: createId("expense"),
    name,
    category,
    type,
    goalId,
    goalName,
    dueDate,
    amount,
    isPaid: autoPaid,
    paidAt: autoPaid ? now : "",
    createdAt: now
  });

  saveData(data);
  byId("expense-form")?.reset();
  updateExpenseFormState();
  setMessage("expense-message", "Expense saved successfully.", "success");
  render();
}

function addGoal(event) {
  if (event) {
    event.preventDefault();
  }

  const nameInput = byId("goal-name");
  const amountInput = byId("goal-amount");
  const dueDateInput = byId("goal-due-date");

  if (!nameInput || !amountInput || !dueDateInput) {
    return;
  }

  const name = nameInput.value.trim();
  const amount = Number(amountInput.value);
  const dueDate = dueDateInput.value;

  if (!name || !Number.isFinite(amount) || amount <= 0 || !dueDate) {
    setMessage("goal-message", "Enter a valid goal name, amount greater than zero, and a due date.", "error");
    return;
  }

  const data = getData();

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
  render();
}

function deleteIncomeSource(sourceId) {
  const data = getData();
  const source = data.incomeSources.find((item) => item.id === sourceId);

  if (!source) {
    return;
  }

  const confirmed = window.confirm(`Remove "${source.name}" from the saved source menu? Past income history will stay saved.`);

  if (!confirmed) {
    return;
  }

  data.incomeSources = data.incomeSources.filter((item) => item.id !== sourceId);
  saveData(data);
  render();
}

function toggleExpensePaid(expenseId) {
  const data = getData();

  data.expenses = data.expenses.map((expense) => {
    if (expense.id !== expenseId) {
      return expense;
    }

    if (normalizeExpenseType(expense.type) !== "Fixed") {
      return expense;
    }

    const nextPaid = !Boolean(expense.isPaid);

    return {
      ...expense,
      isPaid: nextPaid,
      paidAt: nextPaid ? new Date().toISOString() : ""
    };
  });

  saveData(data);
  render();
}

function deleteExpense(expenseId) {
  const data = getData();
  const expense = data.expenses.find((item) => item.id === expenseId);

  if (!expense) {
    return;
  }

  const confirmed = window.confirm(`Delete expense "${expense.name}"?`);

  if (!confirmed) {
    return;
  }

  data.expenses = data.expenses.filter((item) => item.id !== expenseId);
  saveData(data);
  render();
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

  const confirmed = window.confirm("This will delete all finance data. Continue?");

  if (!confirmed) {
    return;
  }

  saveData(getEmptyData());
  render();
  window.alert("Finance data has been reset.");
}

function renderIncomeSourceSelect(data) {
  const select = byId("income-source-select");

  if (!select) {
    return;
  }

  const previousValue = select.value;
  const sources = [...data.incomeSources].sort((a, b) => a.name.localeCompare(b.name));

  let options = '<option value="__new__">Add new source</option>';
  options += sources.map((source) => `<option value="${source.id}">${escapeHtml(source.name)}</option>`).join("");

  select.innerHTML = options;

  if (previousValue && sources.some((source) => source.id === previousValue)) {
    select.value = previousValue;
  } else {
    select.value = sources.length ? sources[0].id : "__new__";
  }

  updateIncomeSourceMode();
}

function renderGoalSelectOptions(data) {
  const select = byId("expense-goal-id");

  if (!select) {
    return;
  }

  const previousValue = select.value;
  const goals = [...data.goals].sort((a, b) => a.name.localeCompare(b.name));

  if (!goals.length) {
    select.innerHTML = '<option value="">Add a goal first</option>';
    select.disabled = true;
    return;
  }

  select.disabled = false;

  let options = '<option value="">Select a goal</option>';
  options += goals.map((goal) => `<option value="${goal.id}">${escapeHtml(goal.name)}</option>`).join("");

  select.innerHTML = options;

  if (previousValue && goals.some((goal) => goal.id === previousValue)) {
    select.value = previousValue;
  }
}

function updateIncomeSourceMode() {
  const select = byId("income-source-select");
  const wrap = byId("income-new-source-wrap");
  const input = byId("income-new-source");

  if (!select || !wrap || !input) {
    return;
  }

  const useNew = select.value === "__new__";
  wrap.style.display = useNew ? "grid" : "none";
  input.required = useNew;

  if (!useNew) {
    input.value = "";
  }
}

function updateExpenseFormState() {
  const typeInput = byId("expense-type");
  const categoryInput = byId("expense-category");
  const dueDateInput = byId("expense-due-date");
  const dueHelp = byId("expense-due-help");
  const goalWrap = byId("expense-goal-wrap");
  const goalSelect = byId("expense-goal-id");

  if (!typeInput) {
    return;
  }

  const type = normalizeExpenseType(typeInput.value);
  const isFixed = type === "Fixed";
  const isGoalAllocation = type === "Goal Allocation";

  if (dueDateInput) {
    dueDateInput.required = isFixed;
    dueDateInput.disabled = isGoalAllocation;

    if (isGoalAllocation) {
      dueDateInput.value = "";
    }
  }

  if (goalWrap) {
    goalWrap.style.display = isGoalAllocation ? "grid" : "none";
  }

  if (goalSelect) {
    goalSelect.required = isGoalAllocation;

    if (!isGoalAllocation) {
      goalSelect.value = "";
    }
  }

  if (categoryInput) {
    if (isGoalAllocation) {
      categoryInput.value = "Goals";
      categoryInput.disabled = true;
    } else {
      categoryInput.disabled = false;

      if (categoryInput.value === "Goals") {
        categoryInput.value = "Home & Food";
      }
    }
  }

  if (dueHelp) {
    if (isFixed) {
      dueHelp.textContent = "Required for fixed expenses. Use the bill due date.";
    } else if (isGoalAllocation) {
      dueHelp.textContent = "Goal allocations are credited immediately to the selected goal.";
    } else {
      dueHelp.textContent = "Optional for variable expenses. Leave blank if it does not apply.";
    }
  }
}

function renderDashboard(data, totals) {
  if (!byId("dashboard-income")) {
    return;
  }

  const totalIncome = totals.totalIncome;
  const totalExpenses = totals.totalExpenses;
  const totalGoalAllocated = totals.totalGoalAllocated;
  const netSavings = totals.netSavings;
  const availableNow = totals.availableNow;
  const totalGoals = totals.totalGoals;

  const deductionsRate = totalIncome > 0 ? (totalExpenses / totalIncome) * 100 : 0;
  const comparisonBase = Math.max(totalIncome, totalExpenses, Math.max(netSavings, 0), 1);
  const goalCoverage = totalGoals > 0
    ? Math.max(0, Math.min((totalGoalAllocated / totalGoals) * 100, 100))
    : 0;

  setText("dashboard-income", formatCurrency(totalIncome));
  setText("dashboard-expenses", formatCurrency(totalExpenses));
  setText("dashboard-savings", formatCurrency(netSavings));
  setText("dashboard-deductions", `${deductionsRate.toFixed(1)}%`);
  setText("dashboard-available-balance", formatCurrency(availableNow));

  setText("dashboard-income-line", formatCurrency(totalIncome));
  setText("dashboard-expense-line", formatCurrency(totalExpenses));
  setText("dashboard-savings-line", formatCurrency(netSavings));

  setWidth("dashboard-income-bar", `${Math.min((totalIncome / comparisonBase) * 100, 100)}%`);
  setWidth("dashboard-expense-bar", `${Math.min((totalExpenses / comparisonBase) * 100, 100)}%`);
  setWidth("dashboard-savings-bar", `${Math.min((Math.max(netSavings, 0) / comparisonBase) * 100, 100)}%`);
  setWidth("dashboard-goal-bar", `${goalCoverage}%`);

  if (!data.incomes.length && !data.expenses.length) {
    setText("dashboard-note", "Income minus paid expenses and allocations.");
    setText("dashboard-summary", "Add your first income and expense entries to unlock your live overview.");
  } else if (netSavings >= 0) {
    const savingsRate = totalIncome > 0 ? Math.max((netSavings / totalIncome) * 100, 0) : 0;
    setText("dashboard-note", `You are keeping ${savingsRate.toFixed(1)}% of your income.`);
    setText("dashboard-summary", `Current available balance is ${formatCurrency(availableNow)}.`);
  } else {
    setText("dashboard-note", "Paid expenses are currently higher than income.");
    setText("dashboard-summary", `Current available balance is ${formatCurrency(availableNow)}.`);
  }

  const goalList = byId("dashboard-goal-list");
  const goalCopy = byId("dashboard-goal-copy");

  if (goalList && goalCopy) {
    const allocations = getGoalAllocationMap(data.expenses, data.goals);

    if (!data.goals.length) {
      goalCopy.textContent = "No goals added yet. Head to the goals page to create your targets.";
      goalList.innerHTML = '<div class="empty-state">Your goals will appear here with progress based on allocated money.</div>';
    } else {
      if (totalGoalAllocated > 0) {
        goalCopy.textContent = `You have allocated ${formatCurrency(totalGoalAllocated)} toward your goals.`;
      } else {
        goalCopy.textContent = "No money has been allocated to goals yet.";
      }

      goalList.innerHTML = data.goals.slice(0, 4).map((goal) => {
        const allocated = allocations.get(goal.id) || 0;
        const progress = goal.amount > 0 ? Math.min((allocated / goal.amount) * 100, 100) : 0;

        let statusText = "Not Enough";
        let statusClass = "status-bad";

        if (allocated >= goal.amount) {
          statusText = "On Track";
          statusClass = "status-good";
        } else if (allocated > 0) {
          statusText = "In Progress";
          statusClass = "status-warn";
        }

        return `
          <div class="list-item">
            <div>
              <strong>${escapeHtml(goal.name)}</strong>
              <span>${formatCurrency(allocated)} allocated • ${progress.toFixed(1)}% funded</span>
            </div>
            <span class="status-pill ${statusClass}">${statusText}</span>
          </div>
        `;
      }).join("");
    }
  }

  const reminderList = byId("dashboard-reminder-list");
  const reminderCount = byId("dashboard-reminder-count");
  const reminderMeta = byId("dashboard-reminder-meta");

  if (!reminderList || !reminderCount || !reminderMeta) {
    return;
  }

  const openBills = data.expenses
    .filter((expense) => normalizeExpenseType(expense.type) === "Fixed" && !isExpensePaid(expense))
    .sort((a, b) => {
      const aDays = getDaysUntil(a.dueDate);
      const bDays = getDaysUntil(b.dueDate);
      const aValue = aDays === null ? 999999 : aDays;
      const bValue = bDays === null ? 999999 : bDays;
      return aValue - bValue;
    });

  reminderCount.textContent = `${openBills.length} open bills`;

  const overdueCount = openBills.filter((expense) => {
    const days = getDaysUntil(expense.dueDate);
    return days !== null && days < 0;
  }).length;

  const dueSoonCount = openBills.filter((expense) => {
    const days = getDaysUntil(expense.dueDate);
    return days !== null && days >= 0 && days <= 7;
  }).length;

  if (!openBills.length) {
    reminderMeta.textContent = "Upcoming fixed payments that still need to be marked as paid.";
    reminderList.innerHTML = '<div class="empty-state">No open fixed payments. Once you add fixed expenses with due dates, reminders will appear here.</div>';
    return;
  }

  reminderMeta.textContent = `${dueSoonCount} due soon • ${overdueCount} overdue`;

  reminderList.innerHTML = openBills.map((expense) => {
    const status = getExpenseStatus(expense);
    const daysLeft = getDaysUntil(expense.dueDate);

    let dueText = `Due ${formatDate(expense.dueDate)}`;

    if (daysLeft !== null) {
      if (daysLeft < 0) {
        dueText += ` • ${Math.abs(daysLeft)} days overdue`;
      } else if (daysLeft === 0) {
        dueText += " • due today";
      } else {
        dueText += ` • ${daysLeft} days left`;
      }
    }

    return `
      <div class="list-item">
        <div>
          <strong>${escapeHtml(expense.name)}</strong>
          <span>${escapeHtml(expense.category)} • ${dueText}</span>
        </div>
        <div style="text-align: right;">
          <strong>${formatCurrency(expense.amount)}</strong>
          <div class="action-row" style="justify-content: flex-end; margin-top: 8px;">
            <span class="${status.className}">${status.text}</span>
            <button type="button" class="button-secondary button-small" onclick="toggleExpensePaid('${expense.id}')">Mark Paid</button>
            <button type="button" class="button-danger button-small" onclick="deleteExpense('${expense.id}')">Delete</button>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

function renderIncomePage(data, totals) {
  const list = byId("income-list");
  const sourceSummaryEl = byId("income-source-summary");
  const select = byId("income-source-select");

  if (!list && !sourceSummaryEl && !select) {
    return;
  }

  setText("income-total", formatCurrency(totals.totalIncome));
  setText("income-count", `${data.incomes.length} ${data.incomes.length === 1 ? "entry" : "entries"}`);
  setText("income-bank-funds", formatCurrency(totals.totalBankBalance));
  setText("income-available-now", formatCurrency(totals.availableNow));

  const bankNote = byId("bank-balance-note");
  if (bankNote) {
    bankNote.textContent = totals.totalBankBalance > 0
      ? `Your current bank funds are ${formatCurrency(totals.totalBankBalance)}. Available balance updates automatically as you receive income or add expenses.`
      : "Add the money you currently have available in your accounts so the app does not start from zero.";
  }

  renderIncomeSourceSelect(data);

  const sourceSummaryMap = new Map();

  data.incomes.forEach((income) => {
    const key = income.sourceId || income.name.toLowerCase();

    if (!sourceSummaryMap.has(key)) {
      sourceSummaryMap.set(key, {
        sourceId: income.sourceId || "",
        name: income.name,
        total: 0,
        count: 0,
        lastPayment: income.createdAt
      });
    }

    const item = sourceSummaryMap.get(key);
    item.total += Number(income.amount) || 0;
    item.count += 1;

    if (getTimeValue(income.createdAt) > getTimeValue(item.lastPayment)) {
      item.lastPayment = income.createdAt;
    }
  });

  data.incomeSources.forEach((source) => {
    if (!sourceSummaryMap.has(source.id)) {
      sourceSummaryMap.set(source.id, {
        sourceId: source.id,
        name: source.name,
        total: 0,
        count: 0,
        lastPayment: ""
      });
    }
  });

  const sourceSummary = Array.from(sourceSummaryMap.values()).sort((a, b) => {
    if (b.total !== a.total) {
      return b.total - a.total;
    }

    return a.name.localeCompare(b.name);
  });

  setText("income-source-count", `${data.incomeSources.length} saved`);

  if (sourceSummaryEl) {
    if (!sourceSummary.length) {
      sourceSummaryEl.innerHTML = '<div class="empty-state">No income sources saved yet. Add your first payment source to build the menu.</div>';
    } else {
      sourceSummaryEl.innerHTML = sourceSummary.map((source) => {
        const isSaved = data.incomeSources.some((item) => item.id === source.sourceId);

        return `
          <div class="goal-card">
            <div class="goal-head">
              <div>
                <strong>${escapeHtml(source.name)}</strong>
                <div class="subtle">${source.count} ${source.count === 1 ? "payment" : "payments"} received</div>
              </div>
              <div class="source-actions">
                <span class="${isSaved ? "badge" : "status-pill status-warn"}">${isSaved ? "Saved" : "Archived"}</span>
                ${isSaved ? `<button type="button" class="button-danger button-small" onclick="deleteIncomeSource('${source.sourceId}')">Delete</button>` : ""}
              </div>
            </div>

            <div class="goal-breakdown">
              <div class="goal-stat">
                <span>Total Received</span>
                <strong>${formatCurrency(source.total)}</strong>
              </div>
              <div class="goal-stat">
                <span>Last Payment</span>
                <strong>${source.lastPayment ? formatDate(source.lastPayment) : "No payments yet"}</strong>
              </div>
            </div>
          </div>
        `;
      }).join("");
    }
  }

  if (list) {
    if (!data.incomes.length) {
      list.innerHTML = '<div class="empty-state">No income added yet. Add your first income entry to start building your cash flow.</div>';
    } else {
      list.innerHTML = data.incomes.map((income) => `
        <div class="list-item">
          <div>
            <strong>${escapeHtml(income.name)}</strong>
            <span>Received ${formatDate(income.createdAt)}</span>
          </div>
          <strong>${formatCurrency(income.amount)}</strong>
        </div>
      `).join("");
    }
  }
}

function renderExpenseChart(expenses) {
  const canvas = byId("expense-chart");
  const emptyState = byId("expense-chart-empty");

  if (!canvas || !emptyState) {
    return;
  }

  const countedExpenses = expenses.filter((expense) => isExpensePaid(expense));

  if (!countedExpenses.length) {
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
    emptyState.textContent = "Chart.js could not load.";
    return;
  }

  const grouped = countedExpenses.reduce((acc, expense) => {
    const category = expense.category || "Other";
    acc[category] = (acc[category] || 0) + (Number(expense.amount) || 0);
    return acc;
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
          backgroundColor: ["#38bdf8", "#fb7185", "#f59e0b", "#22c55e", "#a78bfa"],
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

function renderExpensesPage(data, totals) {
  const list = byId("expense-list");
  const formExists = byId("expense-form");
  const goalSelectExists = byId("expense-goal-id");

  if (!list && !formExists && !goalSelectExists) {
    return;
  }

  renderGoalSelectOptions(data);
  updateExpenseFormState();

  const expenses = data.expenses.map((expense) => ({
    ...expense,
    type: normalizeExpenseType(expense.type)
  }));

  const fixedExpenses = expenses.filter((expense) => expense.type === "Fixed");
  const variableExpenses = expenses.filter((expense) => expense.type === "Variable");
  const goalAllocationExpenses = expenses.filter((expense) => expense.type === "Goal Allocation");

  const fixedTotal = fixedExpenses.reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
  const variableTotal = variableExpenses.reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
  const goalAllocationTotal = goalAllocationExpenses.reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);

  const overdueCount = fixedExpenses.filter((expense) => {
    const days = getDaysUntil(expense.dueDate);
    return !isExpensePaid(expense) && days !== null && days < 0;
  }).length;

  const dueSoonCount = fixedExpenses.filter((expense) => {
    const days = getDaysUntil(expense.dueDate);
    return !isExpensePaid(expense) && days !== null && days >= 0 && days <= 7;
  }).length;

  setText("expense-total", formatCurrency(totals.totalExpenses));
  setText("expense-count", `${expenses.length} ${expenses.length === 1 ? "entry" : "entries"}`);
  setText("expense-fixed-total", formatCurrency(fixedTotal));
  setText("expense-variable-total", formatCurrency(variableTotal));
  setText("expense-goal-total", formatCurrency(goalAllocationTotal));
  setText("expense-alert-total", `${overdueCount + dueSoonCount}`);

  const alertMeta = byId("expense-alert-meta");
  if (alertMeta) {
    if (!fixedExpenses.length) {
      alertMeta.textContent = "No fixed bills due yet.";
    } else {
      alertMeta.textContent = `${dueSoonCount} due soon • ${overdueCount} overdue`;
    }
  }

  if (list) {
    if (!expenses.length) {
      list.innerHTML = '<div class="empty-state">No expenses added yet. Start tracking fixed, variable, and goal allocations.</div>';
    } else {
      const sortedExpenses = sortExpensesForDisplay(expenses);

      list.innerHTML = sortedExpenses.map((expense) => {
        const type = normalizeExpenseType(expense.type);
        const status = getExpenseStatus(expense);

        let detailText = `${escapeHtml(expense.category)} • ${type}`;

        if (type === "Fixed" && expense.dueDate) {
          detailText += ` • Due ${formatDate(expense.dueDate)}`;
        } else if (type === "Variable") {
          detailText += ` • Paid ${formatDate(expense.createdAt)}`;
        } else if (type === "Goal Allocation") {
          detailText += ` • ${escapeHtml(expense.goalName || "Goal")} • Allocated ${formatDate(expense.createdAt)}`;
        }

        if (type === "Fixed" && isExpensePaid(expense) && expense.paidAt) {
          detailText += ` • Paid ${formatDate(expense.paidAt)}`;
        }

        return `
          <div class="list-item">
            <div>
              <strong>${escapeHtml(expense.name)}</strong>
              <span>${detailText}</span>
            </div>
            <div style="text-align: right;">
              <strong>${formatCurrency(expense.amount)}</strong>
              <div class="action-row" style="justify-content: flex-end; margin-top: 8px;">
                <span class="${status.className}">${status.text}</span>
                ${type === "Fixed" ? `<button type="button" class="button-secondary button-small" onclick="toggleExpensePaid('${expense.id}')">${isExpensePaid(expense) ? "Mark Unpaid" : "Mark Paid"}</button>` : ""}
                <button type="button" class="button-danger button-small" onclick="deleteExpense('${expense.id}')">Delete</button>
              </div>
            </div>
          </div>
        `;
      }).join("");
    }
  }

  renderExpenseChart(expenses);
}

function renderSavingsPage(data, totals) {
  const incomeEl = byId("savings-income");

  if (!incomeEl) {
    return;
  }

  const totalIncome = totals.totalIncome;
  const totalExpenses = totals.totalExpenses;
  const netSavings = totals.netSavings;
  const savingsRate = totalIncome > 0 ? Math.max((netSavings / totalIncome) * 100, 0) : 0;

  setText("savings-income", formatCurrency(totalIncome));
  setText("savings-expenses", formatCurrency(totalExpenses));
  setText("savings-total", formatCurrency(netSavings));
  setText("savings-rate", `${savingsRate.toFixed(1)}%`);
  setWidth("savings-progress", `${Math.min(savingsRate, 100)}%`);

  const copy = byId("savings-copy");
  const suggestion = byId("savings-suggestion");
  const status = byId("savings-status");
  const tipOne = byId("tip-one");
  const tipTwo = byId("tip-two");
  const tipThree = byId("tip-three");

  if (!copy || !suggestion || !status || !tipOne || !tipTwo || !tipThree) {
    return;
  }

  if (totalIncome === 0) {
    copy.textContent = "Add income first to calculate a savings percentage.";
    suggestion.textContent = "You are saving 0% of your income.";
    status.textContent = "No income yet";
    status.className = "status-pill status-warn";
    tipOne.textContent = "No division-by-zero crash: the app safely keeps savings percentage at 0% until income exists.";
    tipTwo.textContent = "Add income and expenses to get a real savings picture.";
    tipThree.textContent = "Once data is added, this page updates automatically across the app.";
    return;
  }

  if (netSavings < 0) {
    copy.textContent = "Your paid expenses are higher than your income right now.";
    suggestion.textContent = `You are overspending by ${formatCurrency(Math.abs(netSavings))}.`;
    status.textContent = "Negative savings";
    status.className = "status-pill status-bad";
    setWidth("savings-progress", "0%");
    tipOne.textContent = "Trim one or two recurring categories to move back into positive savings.";
    tipTwo.textContent = "Even small cuts in flexible spending can help quickly.";
    tipThree.textContent = "Your goals will show better progress as soon as savings becomes positive.";
    return;
  }

  copy.textContent = `You currently keep ${formatCurrency(netSavings)} after paid expenses.`;
  suggestion.textContent = `You are saving ${savingsRate.toFixed(1)}% of your income.`;

  if (savingsRate >= 30) {
    status.textContent = "Strong savings rate";
    status.className = "status-pill status-good";
    tipOne.textContent = "Your savings rate is strong and gives you room to fund goals faster.";
    tipTwo.textContent = "Consider directing a portion of savings toward one priority goal.";
    tipThree.textContent = "Keep your biggest expense category steady to protect this rate.";
  } else if (savingsRate >= 15) {
    status.textContent = "Healthy progress";
    status.className = "status-pill status-warn";
    tipOne.textContent = "You are saving consistently and still have room to improve.";
    tipTwo.textContent = "A small cut in non-essential spending could push your rate higher.";
    tipThree.textContent = "You are in a solid position to keep building toward goals.";
  } else {
    status.textContent = "Needs attention";
    status.className = "status-pill status-bad";
    tipOne.textContent = "Your savings rate is positive but still low.";
    tipTwo.textContent = "Increasing income or cutting one flexible category can help.";
    tipThree.textContent = "Every extra dollar left unspent improves your goal progress.";
  }
}

function renderGoalsPage(data, totals) {
  const list = byId("goal-list");

  if (!list) {
    return;
  }

  const allocationMap = getGoalAllocationMap(data.expenses, data.goals);
  const availableNow = Math.max(totals.availableNow, 0);

  setText("goal-available-now", formatCurrency(availableNow));

  const availableNote = byId("goal-available-note");
  if (availableNote) {
    if (availableNow > 0) {
      availableNote.textContent = `You currently have ${formatCurrency(availableNow)} available to work with after paid expenses and goal allocations.`;
    } else if (totals.availableNow === 0) {
      availableNote.textContent = "You do not have extra funds available yet. Add income or reduce expenses to create room.";
    } else {
      availableNote.textContent = `You are currently behind by ${formatCurrency(Math.abs(totals.availableNow))}, so there are no available funds right now.`;
    }
  }

  if (!data.goals.length) {
    list.innerHTML = '<div class="empty-state">No goals added yet. Add your first goal to track allocated money and progress.</div>';
    return;
  }

  list.innerHTML = data.goals.map((goal) => {
    const allocated = allocationMap.get(goal.id) || 0;
    const plan = calculateGoalPlan(goal.amount, allocated, goal.dueDate);
    const dueText = formatDate(goal.dueDate);

    let timeText = "No due date";

    if (plan.daysLeft !== null) {
      if (plan.daysLeft < 0) {
        timeText = `${Math.abs(plan.daysLeft)} days overdue`;
      } else if (plan.daysLeft === 0) {
        timeText = "Due today";
      } else {
        timeText = `${plan.daysLeft} days left`;
      }
    }

    let statusText = "Not Enough";
    let statusClass = "status-bad";

    if (plan.remaining <= 0) {
      statusText = "On Track";
      statusClass = "status-good";
    } else if (plan.allocated > 0) {
      statusText = "In Progress";
      statusClass = "status-warn";
    }

    const saveNowText = plan.remaining <= 0
      ? "Covered"
      : plan.daysLeft !== null && plan.daysLeft > 0
        ? `${formatCurrency(plan.monthlyNeeded)} / month`
        : formatCurrency(plan.remaining);

    return `
      <div class="goal-card">
        <div class="goal-head">
          <div>
            <strong>${escapeHtml(goal.name)}</strong>
            <div class="subtle">Target: ${formatCurrency(goal.amount)}</div>
          </div>
          <span class="status-pill ${statusClass}">${statusText}</span>
        </div>

        <div class="progress-track large">
          <div class="progress-fill fill-goals" style="width: ${plan.progress}%"></div>
        </div>

        <div class="goal-breakdown">
          <div class="goal-stat">
            <span>Allocated</span>
            <strong>${formatCurrency(plan.allocated)}</strong>
          </div>
          <div class="goal-stat">
            <span>Still Needed</span>
            <strong>${formatCurrency(plan.remaining)}</strong>
          </div>
          <div class="goal-stat">
            <span>Due Date</span>
            <strong>${dueText}</strong>
          </div>
          <div class="goal-stat">
            <span>Need To Save</span>
            <strong>${saveNowText}</strong>
          </div>
        </div>

        <div class="goal-meta">
          <span>${plan.progress.toFixed(1)}% funded</span>
          <span>${timeText}</span>
        </div>
      </div>
    `;
  }).join("");
}

function render() {
  const data = getData();
  const totals = calculateTotals(data);

  renderDashboard(data, totals);
  renderIncomePage(data, totals);
  renderExpensesPage(data, totals);
  renderSavingsPage(data, totals);
  renderGoalsPage(data, totals);
}

function bindEvents() {
  const bankBalanceForm = byId("bank-balance-form");
  const incomeForm = byId("income-form");
  const expenseForm = byId("expense-form");
  const goalForm = byId("goal-form");
  const expenseType = byId("expense-type");
  const incomeSourceSelect = byId("income-source-select");
  const resetButton = byId("reset-finance-button");

  if (bankBalanceForm) {
    bankBalanceForm.addEventListener("submit", updateBankBalance);
  }

  if (incomeForm) {
    incomeForm.addEventListener("submit", addIncome);
  }

  if (expenseForm) {
    expenseForm.addEventListener("submit", addExpense);
  }

  if (goalForm) {
    goalForm.addEventListener("submit", addGoal);
  }

  if (expenseType) {
    expenseType.addEventListener("change", updateExpenseFormState);
    updateExpenseFormState();
  }

  if (incomeSourceSelect) {
    incomeSourceSelect.addEventListener("change", updateIncomeSourceMode);
    updateIncomeSourceMode();
  }

  if (resetButton) {
    resetButton.addEventListener("click", resetFinanceData);
  }
}

window.deleteIncomeSource = deleteIncomeSource;
window.toggleExpensePaid = toggleExpensePaid;
window.deleteExpense = deleteExpense;
window.resetFinanceData = resetFinanceData;

document.addEventListener("DOMContentLoaded", () => {
  initStorage();
  bindEvents();
  render();
});

window.addEventListener("storage", render);
