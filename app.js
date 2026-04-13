const STORAGE_KEY = "financeTrackerData";
let expenseChart = null;

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
  return type === "Fixed" ? "Fixed" : "Variable";
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
    '"': "&quot;",
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
        const isPaid =
          type === "Variable"
            ? true
            : typeof expense.isPaid === "boolean"
              ? expense.isPaid
              : true;

        return {
          id: expense.id || createId("expense"),
          name: String(expense.name || "").trim(),
          category: String(expense.category || "Other").trim() || "Other",
          type,
          dueDate: expense.dueDate || "",
          amount: Number(expense.amount) || 0,
          isPaid,
          paidAt: expense.paidAt || (isPaid ? createdAt : ""),
          createdAt
        };
      })
      .filter((expense) => expense.name && expense.amount > 0);

    const goals = rawGoals
      .map((goal) => ({
        name: String(goal.name || "").trim(),
        amount: Number(goal.amount) || 0,
        dueDate: goal.dueDate || "",
        createdAt: goal.createdAt || new Date().toISOString()
      }))
      .filter((goal) => goal.name && goal.amount > 0);

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
  return normalizeExpenseType(expense.type) === "Variable" ? true : Boolean(expense.isPaid);
}

function getExpenseStatus(expense) {
  const type = normalizeExpenseType(expense.type);

  if (type === "Variable") {
    return {
      text: "Paid",
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
      return aType === "Fixed" ? -1 : 1;
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
  const netSavings = totalIncome - totalExpenses;
  const availableNow = totalBankBalance + netSavings;
  const totalGoals = data.goals.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

  return {
    totalBankBalance,
    totalIncome,
    totalExpenses,
    netSavings,
    availableNow,
    totalGoals
  };
}

function calculateGoalPlan(goalAmount, availableNow, dueDate) {
  const target = Number(goalAmount) || 0;
  const available = Math.max(Number(availableNow) || 0, 0);
  const remaining = Math.max(target - available, 0);
  const daysLeft = getDaysUntil(dueDate);
  const monthsLeft = daysLeft !== null && daysLeft > 0 ? Math.max(daysLeft / 30, 1) : null;
  const monthlyNeeded = remaining === 0 ? 0 : monthsLeft ? remaining / monthsLeft : remaining;
  const progress = target > 0 ? Math.min((available / target) * 100, 100) : 0;

  return {
    target,
    available,
    remaining,
    daysLeft,
    monthlyNeeded,
    progress
  };
}

function setMessage(id, text, type) {
  const el = document.getElementById(id);

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

  const amountInput = document.getElementById("bank-balance-amount");

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

  document.getElementById("bank-balance-form")?.reset();
  setMessage("bank-balance-message", "Current bank funds updated successfully.", "success");
  render();
}

function addIncome(event) {
  if (event) {
    event.preventDefault();
  }

  const sourceSelect = document.getElementById("income-source-select");
  const newSourceInput = document.getElementById("income-new-source");
  const legacyNameInput = document.getElementById("income-name");
  const amountInput = document.getElementById("income-amount");

  if (!amountInput) {
    return;
  }

  const data = getData();
  let sourceName = "";

  if (sourceSelect) {
    if (sourceSelect.value && sourceSelect.value !== "__new__") {
      const source = data.incomeSources.find((item) => item.id === sourceSelect.value);
      sourceName = source ? source.name : "";
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
  document.getElementById("income-form")?.reset();
  setMessage("income-message", "Income saved successfully.", "success");
  render();
}

function addExpense(event) {
  if (event) {
    event.preventDefault();
  }

  const nameInput = document.getElementById("expense-name");
  const categoryInput = document.getElementById("expense-category");
  const typeInput = document.getElementById("expense-type");
  const dueDateInput = document.getElementById("expense-due-date");
  const amountInput = document.getElementById("expense-amount");

  if (!nameInput || !categoryInput || !amountInput) {
    return;
  }

  const name = nameInput.value.trim();
  const category = categoryInput.value;
  const type = normalizeExpenseType(typeInput ? typeInput.value : "Variable");
  const dueDate = dueDateInput ? dueDateInput.value : "";
  const amount = Number(amountInput.value);

  if (!name || !category || !Number.isFinite(amount) || amount <= 0) {
    setMessage("expense-message", "Enter a valid expense, category, and amount greater than zero.", "error");
    return;
  }

  if (type === "Fixed" && !dueDate) {
    setMessage("expense-message", "Fixed expenses require a due date.", "error");
    return;
  }

  const now = new Date().toISOString();
  const data = getData();

  data.expenses.unshift({
    id: createId("expense"),
    name,
    category,
    type,
    dueDate: type === "Fixed" ? dueDate : "",
    amount,
    isPaid: type === "Variable",
    paidAt: type === "Variable" ? now : "",
    createdAt: now
  });

  saveData(data);
  document.getElementById("expense-form")?.reset();
  updateExpenseDueDateState();
  setMessage("expense-message", "Expense saved successfully.", "success");
  render();
}

function addGoal(event) {
  if (event) {
    event.preventDefault();
  }

  const nameInput = document.getElementById("goal-name");
  const amountInput = document.getElementById("goal-amount");
  const dueDateInput = document.getElementById("goal-due-date");

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
    name,
    amount,
    dueDate,
    createdAt: new Date().toISOString()
  });

  saveData(data);
  document.getElementById("goal-form")?.reset();
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

function updateIncomeSourceMode() {
  const select = document.getElementById("income-source-select");
  const wrap = document.getElementById("income-new-source-wrap");
  const input = document.getElementById("income-new-source");

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

function updateExpenseDueDateState() {
  const typeInput = document.getElementById("expense-type");
  const dueDateInput = document.getElementById("expense-due-date");
  const dueHelp = document.getElementById("expense-due-help");

  if (!typeInput || !dueDateInput || !dueHelp) {
    return;
  }

  const isFixed = normalizeExpenseType(typeInput.value) === "Fixed";
  dueDateInput.required = isFixed;
  dueHelp.textContent = isFixed
    ? "Required for fixed expenses. Use the bill due date."
    : "Optional for variable expenses. Leave blank if it does not apply.";
}

function renderIncomeSourceSelect(data) {
  const select = document.getElementById("income-source-select");

  if (!select) {
    return;
  }

  const sources = [...data.incomeSources].sort((a, b) => a.name.localeCompare(b.name));
  const previousValue = select.value;

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

function renderDashboard(data, totals) {
  const incomeEl = document.getElementById("dashboard-income");

  if (!incomeEl) {
    return;
  }

  const totalIncome = totals.totalIncome;
  const totalExpenses = totals.totalExpenses;
  const netSavings = totals.netSavings;
  const availableNow = totals.availableNow;
  const totalGoals = totals.totalGoals;

  const savingsRate = totalIncome > 0 ? Math.max((netSavings / totalIncome) * 100, 0) : 0;
  const deductionsRate = totalIncome > 0 ? (totalExpenses / totalIncome) * 100 : 0;
  const comparisonBase = Math.max(totalIncome, totalExpenses, Math.max(netSavings, 0), 1);
  const goalCoverage = totalGoals > 0 ? Math.max(0, Math.min((Math.max(availableNow, 0) / totalGoals) * 100, 100)) : 0;

  document.getElementById("dashboard-income").textContent = formatCurrency(totalIncome);
  document.getElementById("dashboard-expenses").textContent = formatCurrency(totalExpenses);
  document.getElementById("dashboard-savings").textContent = formatCurrency(netSavings);
  document.getElementById("dashboard-deductions").textContent = `${deductionsRate.toFixed(1)}%`;

  document.getElementById("dashboard-income-line").textContent = formatCurrency(totalIncome);
  document.getElementById("dashboard-expense-line").textContent = formatCurrency(totalExpenses);
  document.getElementById("dashboard-savings-line").textContent = formatCurrency(netSavings);

  document.getElementById("dashboard-income-bar").style.width = `${Math.min((totalIncome / comparisonBase) * 100, 100)}%`;
  document.getElementById("dashboard-expense-bar").style.width = `${Math.min((totalExpenses / comparisonBase) * 100, 100)}%`;
  document.getElementById("dashboard-savings-bar").style.width = `${Math.min((Math.max(netSavings, 0) / comparisonBase) * 100, 100)}%`;
  document.getElementById("dashboard-goal-bar").style.width = `${goalCoverage}%`;

  const note = document.getElementById("dashboard-note");
  const summary = document.getElementById("dashboard-summary");
  const goalCopy = document.getElementById("dashboard-goal-copy");
  const goalList = document.getElementById("dashboard-goal-list");

  if (note && summary) {
    if (!data.incomes.length && !data.expenses.length) {
      note.textContent = "Income minus paid expenses.";
      summary.textContent = "Add your first income and expense entries to unlock your live overview.";
    } else if (netSavings >= 0) {
      note.textContent = `You are keeping ${savingsRate.toFixed(1)}% of your income.`;
      summary.textContent = `You are saving ${savingsRate.toFixed(1)}% of your income after paid expenses.`;
    } else {
      note.textContent = "Paid expenses are currently higher than income.";
      summary.textContent = `You are overspending by ${formatCurrency(Math.abs(netSavings))}.`;
    }
  }

  if (goalCopy && goalList) {
    if (!data.goals.length) {
      goalCopy.textContent = "No goals added yet. Head to the goals page to create your targets.";
      goalList.innerHTML = '<div class="empty-state">Your goals will appear here with live progress based on current available funds.</div>';
    } else {
      if (availableNow <= 0) {
        goalCopy.textContent = "You do not have available funds for goals yet.";
      } else {
        goalCopy.textContent = `Current available funds cover ${goalCoverage.toFixed(1)}% of your total goal target.`;
      }

      goalList.innerHTML = data.goals.slice(0, 4).map((goal) => {
        const goalAmount = Number(goal.amount) || 0;
        const progress = goalAmount > 0 ? Math.max(0, Math.min((Math.max(availableNow, 0) / goalAmount) * 100, 100)) : 0;

        let statusText = "Not Enough";
        let statusClass = "status-bad";

        if (Math.max(availableNow, 0) >= goalAmount) {
          statusText = "On Track";
          statusClass = "status-good";
        } else if (Math.max(availableNow, 0) > 0) {
          statusText = "In Progress";
          statusClass = "status-warn";
        }

        return `
          <div class="list-item">
            <div>
              <strong>${escapeHtml(goal.name)}</strong>
              <span>${progress.toFixed(1)}% funded</span>
            </div>
            <span class="status-pill ${statusClass}">${statusText}</span>
          </div>
        `;
      }).join("");
    }
  }

  const reminderList = document.getElementById("dashboard-reminder-list");
  const reminderCount = document.getElementById("dashboard-reminder-count");
  const reminderMeta = document.getElementById("dashboard-reminder-meta");

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
  const list = document.getElementById("income-list");

  if (!list) {
    return;
  }

  const totalEl = document.getElementById("income-total");
  const countEl = document.getElementById("income-count");
  const bankFundsEl = document.getElementById("income-bank-funds");
  const availableNowEl = document.getElementById("income-available-now");
  const bankNoteEl = document.getElementById("bank-balance-note");
  const sourceCountEl = document.getElementById("income-source-count");
  const sourceSummaryEl = document.getElementById("income-source-summary");

  if (totalEl) {
    totalEl.textContent = formatCurrency(totals.totalIncome);
  }

  if (countEl) {
    countEl.textContent = `${data.incomes.length} ${data.incomes.length === 1 ? "entry" : "entries"}`;
  }

  if (bankFundsEl) {
    bankFundsEl.textContent = formatCurrency(totals.totalBankBalance);
  }

  if (availableNowEl) {
    availableNowEl.textContent = formatCurrency(totals.availableNow);
  }

  if (bankNoteEl) {
    bankNoteEl.textContent = totals.totalBankBalance > 0
      ? `Your current bank funds are ${formatCurrency(totals.totalBankBalance)}. This amount is used as your starting available money.`
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

  if (sourceCountEl) {
    sourceCountEl.textContent = `${data.incomeSources.length} saved`;
  }

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

  if (!data.incomes.length) {
    list.innerHTML = '<div class="empty-state">No income added yet. Add your first income entry to start building your cash flow.</div>';
    return;
  }

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

function renderExpenseChart(expenses) {
  const canvas = document.getElementById("expense-chart");
  const emptyState = document.getElementById("expense-chart-empty");

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
          backgroundColor: ["#38bdf8", "#fb7185", "#f59e0b", "#22c55e"],
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
  const list = document.getElementById("expense-list");

  if (!list) {
    return;
  }

  const expenses = data.expenses.map((expense) => ({
    ...expense,
    type: normalizeExpenseType(expense.type)
  }));

  const fixedExpenses = expenses.filter((expense) => expense.type === "Fixed");
  const variableExpenses = expenses.filter((expense) => expense.type === "Variable");

  const fixedTotal = fixedExpenses.reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
  const variableTotal = variableExpenses.reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);

  const overdueCount = fixedExpenses.filter((expense) => {
    const days = getDaysUntil(expense.dueDate);
    return !isExpensePaid(expense) && days !== null && days < 0;
  }).length;

  const dueSoonCount = fixedExpenses.filter((expense) => {
    const days = getDaysUntil(expense.dueDate);
    return !isExpensePaid(expense) && days !== null && days >= 0 && days <= 7;
  }).length;

  const totalEl = document.getElementById("expense-total");
  const countEl = document.getElementById("expense-count");
  const fixedEl = document.getElementById("expense-fixed-total");
  const variableEl = document.getElementById("expense-variable-total");
  const alertTotalEl = document.getElementById("expense-alert-total");
  const alertMetaEl = document.getElementById("expense-alert-meta");

  if (totalEl) {
    totalEl.textContent = formatCurrency(totals.totalExpenses);
  }

  if (countEl) {
    countEl.textContent = `${expenses.length} ${expenses.length === 1 ? "entry" : "entries"}`;
  }

  if (fixedEl) {
    fixedEl.textContent = formatCurrency(fixedTotal);
  }

  if (variableEl) {
    variableEl.textContent = formatCurrency(variableTotal);
  }

  if (alertTotalEl) {
    alertTotalEl.textContent = `${overdueCount + dueSoonCount}`;
  }

  if (alertMetaEl) {
    if (!fixedExpenses.length) {
      alertMetaEl.textContent = "No fixed bills due yet.";
    } else {
      alertMetaEl.textContent = `${dueSoonCount} due soon • ${overdueCount} overdue`;
    }
  }

  if (!expenses.length) {
    list.innerHTML = '<div class="empty-state">No expenses added yet. Start tracking fixed and variable spending to see your chart and totals.</div>';
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

  renderExpenseChart(expenses);
}

function renderSavingsPage(data, totals) {
  const incomeEl = document.getElementById("savings-income");

  if (!incomeEl) {
    return;
  }

  const totalIncome = totals.totalIncome;
  const totalExpenses = totals.totalExpenses;
  const netSavings = totals.netSavings;
  const savingsRate = totalIncome > 0 ? Math.max((netSavings / totalIncome) * 100, 0) : 0;

  document.getElementById("savings-income").textContent = formatCurrency(totalIncome);
  document.getElementById("savings-expenses").textContent = formatCurrency(totalExpenses);
  document.getElementById("savings-total").textContent = formatCurrency(netSavings);
  document.getElementById("savings-rate").textContent = `${savingsRate.toFixed(1)}%`;
  document.getElementById("savings-progress").style.width = `${Math.min(savingsRate, 100)}%`;

  const copy = document.getElementById("savings-copy");
  const suggestion = document.getElementById("savings-suggestion");
  const status = document.getElementById("savings-status");
  const tipOne = document.getElementById("tip-one");
  const tipTwo = document.getElementById("tip-two");
  const tipThree = document.getElementById("tip-three");

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
    document.getElementById("savings-progress").style.width = "0%";
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
  const list = document.getElementById("goal-list");

  if (!list) {
    return;
  }

  const availableNow = Math.max(totals.availableNow, 0);
  const availableEl = document.getElementById("goal-available-now");
  const availableNote = document.getElementById("goal-available-note");

  if (availableEl) {
    availableEl.textContent = formatCurrency(availableNow);
  }

  if (availableNote) {
    if (availableNow > 0) {
      availableNote.textContent = `You currently have ${formatCurrency(availableNow)} available to put toward goals.`;
    } else if (totals.availableNow === 0) {
      availableNote.textContent = "You do not have extra funds available yet. Add income or reduce expenses to create goal room.";
    } else {
      availableNote.textContent = `You are currently behind by ${formatCurrency(Math.abs(totals.availableNow))}, so there are no available funds for goals right now.`;
    }
  }

  if (!data.goals.length) {
    list.innerHTML = '<div class="empty-state">No goals added yet. Add your first goal to track progress using savings and due dates.</div>';
    return;
  }

  list.innerHTML = data.goals.map((goal) => {
    const plan = calculateGoalPlan(goal.amount, availableNow, goal.dueDate);
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
    } else if (plan.daysLeft !== null && plan.daysLeft > 0 && plan.monthlyNeeded <= availableNow && availableNow > 0) {
      statusText = "On Track";
      statusClass = "status-good";
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
            <span>Available Now</span>
            <strong>${formatCurrency(availableNow)}</strong>
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
  const bankBalanceForm = document.getElementById("bank-balance-form");
  const incomeForm = document.getElementById("income-form");
  const expenseForm = document.getElementById("expense-form");
  const goalForm = document.getElementById("goal-form");
  const expenseType = document.getElementById("expense-type");
  const incomeSourceSelect = document.getElementById("income-source-select");
  const resetButton = document.getElementById("reset-finance-button");

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
    expenseType.addEventListener("change", updateExpenseDueDateState);
    updateExpenseDueDateState();
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
