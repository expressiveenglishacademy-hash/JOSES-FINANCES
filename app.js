const STORAGE_KEY = "financeTrackerData";
let expenseChart = null;

function getData() {
  const emptyData = { incomes: [], expenses: [], goals: [] };

  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));

    if (!parsed || typeof parsed !== "object") {
      return emptyData;
    }

    return {
      incomes: Array.isArray(parsed.incomes) ? parsed.incomes : [],
      expenses: Array.isArray(parsed.expenses) ? parsed.expenses : [],
      goals: Array.isArray(parsed.goals) ? parsed.goals : []
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

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(Number(value) || 0);
}

function parseDateValue(value) {
  if (!value) {
    return null;
  }

  let parsed = null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    parsed = new Date(`${value}T00:00:00`);
  } else {
    parsed = new Date(value);
  }

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
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

function normalizeExpenseType(type) {
  return type === "Fixed" ? "Fixed" : "Variable";
}

function getExpenseStatus(expense) {
  const type = normalizeExpenseType(expense.type);

  if (type === "Variable") {
    return {
      text: "Variable",
      className: "status-pill status-warn"
    };
  }

  if (!expense.dueDate) {
    return {
      text: "No Due Date",
      className: "status-pill status-bad"
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

    if (aType === "Fixed") {
      const aDue = parseDateValue(a.dueDate);
      const bDue = parseDateValue(b.dueDate);

      if (aDue && bDue) {
        return aDue - bDue;
      }

      if (aDue) {
        return -1;
      }

      if (bDue) {
        return 1;
      }
    }

    const aCreated = parseDateValue(a.createdAt) || new Date(0);
    const bCreated = parseDateValue(b.createdAt) || new Date(0);

    return bCreated - aCreated;
  });
}

function calculateTotals(data) {
  const totalIncome = data.incomes.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const totalExpenses = data.expenses.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const totalSavings = totalIncome - totalExpenses;
  const totalGoals = data.goals.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

  return { totalIncome, totalExpenses, totalSavings, totalGoals };
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
    monthsLeft,
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

function addIncome(event) {
  if (event) {
    event.preventDefault();
  }

  const nameInput = document.getElementById("income-name");
  const amountInput = document.getElementById("income-amount");

  if (!nameInput || !amountInput) {
    return;
  }

  const name = nameInput.value.trim();
  const amount = Number(amountInput.value);

  if (!name || !Number.isFinite(amount) || amount <= 0) {
    setMessage("income-message", "Enter a valid income name and amount greater than zero.", "error");
    return;
  }

  const data = getData();

  data.incomes.unshift({
    name,
    amount,
    createdAt: new Date().toISOString()
  });

  saveData(data);
  document.getElementById("income-form").reset();
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

  if (!nameInput || !categoryInput || !typeInput || !dueDateInput || !amountInput) {
    return;
  }

  const name = nameInput.value.trim();
  const category = categoryInput.value;
  const type = normalizeExpenseType(typeInput.value);
  const dueDate = dueDateInput.value;
  const amount = Number(amountInput.value);

  if (!name || !category || !Number.isFinite(amount) || amount <= 0) {
    setMessage("expense-message", "Enter a valid expense, category, and amount greater than zero.", "error");
    return;
  }

  if (type === "Fixed" && !dueDate) {
    setMessage("expense-message", "Fixed expenses require a due date.", "error");
    return;
  }

  const data = getData();

  data.expenses.unshift({
    name,
    category,
    type,
    dueDate: type === "Fixed" ? dueDate : "",
    amount,
    createdAt: new Date().toISOString()
  });

  saveData(data);
  document.getElementById("expense-form").reset();
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
  document.getElementById("goal-form").reset();
  setMessage("goal-message", "Goal saved successfully.", "success");
  render();
}

function updateExpenseDueDateState() {
  const typeInput = document.getElementById("expense-type");
  const dueDateInput = document.getElementById("expense-due-date");
  const dueHelp = document.getElementById("expense-due-help");

  if (!typeInput || !dueDateInput || !dueHelp) {
    return;
  }

  const type = normalizeExpenseType(typeInput.value);
  const isFixed = type === "Fixed";

  dueDateInput.required = isFixed;
  dueHelp.textContent = isFixed
    ? "Required for fixed expenses. Use the bill due date."
    : "Optional for variable expenses. Leave blank if it does not apply.";
}

function renderDashboard(data, totals) {
  const incomeEl = document.getElementById("dashboard-income");

  if (!incomeEl) {
    return;
  }

  const totalIncome = totals.totalIncome;
  const totalExpenses = totals.totalExpenses;
  const totalSavings = totals.totalSavings;
  const totalGoals = totals.totalGoals;

  const savingsRate = totalIncome > 0 ? Math.max((totalSavings / totalIncome) * 100, 0) : 0;
  const deductionsRate = totalIncome > 0 ? (totalExpenses / totalIncome) * 100 : 0;
  const comparisonBase = Math.max(totalIncome, totalExpenses, Math.max(totalSavings, 0), 1);
  const goalCoverage = totalGoals > 0 ? Math.max(0, Math.min((Math.max(totalSavings, 0) / totalGoals) * 100, 100)) : 0;

  document.getElementById("dashboard-income").textContent = formatCurrency(totalIncome);
  document.getElementById("dashboard-expenses").textContent = formatCurrency(totalExpenses);
  document.getElementById("dashboard-savings").textContent = formatCurrency(totalSavings);
  document.getElementById("dashboard-deductions").textContent = `${deductionsRate.toFixed(1)}%`;

  document.getElementById("dashboard-income-line").textContent = formatCurrency(totalIncome);
  document.getElementById("dashboard-expense-line").textContent = formatCurrency(totalExpenses);
  document.getElementById("dashboard-savings-line").textContent = formatCurrency(totalSavings);

  document.getElementById("dashboard-income-bar").style.width = `${Math.min((totalIncome / comparisonBase) * 100, 100)}%`;
  document.getElementById("dashboard-expense-bar").style.width = `${Math.min((totalExpenses / comparisonBase) * 100, 100)}%`;
  document.getElementById("dashboard-savings-bar").style.width = `${Math.min((Math.max(totalSavings, 0) / comparisonBase) * 100, 100)}%`;
  document.getElementById("dashboard-goal-bar").style.width = `${goalCoverage}%`;

  const note = document.getElementById("dashboard-note");
  const summary = document.getElementById("dashboard-summary");
  const goalCopy = document.getElementById("dashboard-goal-copy");
  const goalList = document.getElementById("dashboard-goal-list");

  if (!data.incomes.length && !data.expenses.length) {
    note.textContent = "Income minus expenses.";
    summary.textContent = "Add your first income and expense entries to unlock your live overview.";
  } else if (totalSavings >= 0) {
    note.textContent = `You are keeping ${savingsRate.toFixed(1)}% of your income.`;
    summary.textContent = `You are saving ${savingsRate.toFixed(1)}% of your income after deductions.`;
  } else {
    note.textContent = "Expenses are currently higher than income.";
    summary.textContent = `You are overspending by ${formatCurrency(Math.abs(totalSavings))}.`;
  }

  if (!data.goals.length) {
    goalCopy.textContent = "No goals added yet. Head to the goals page to create your targets.";
    goalList.innerHTML = '<div class="empty-state">Your goals will appear here with live progress based on current savings.</div>';
    return;
  }

  if (totalSavings <= 0) {
    goalCopy.textContent = "Your goals need positive savings before they can start moving forward.";
  } else {
    goalCopy.textContent = `Current savings covers ${goalCoverage.toFixed(1)}% of your total goal target.`;
  }

  goalList.innerHTML = data.goals.slice(0, 4).map((goal) => {
    const goalAmount = Number(goal.amount) || 0;
    const progress = goalAmount > 0 ? Math.max(0, Math.min((Math.max(totalSavings, 0) / goalAmount) * 100, 100)) : 0;

    let statusText = "Not Enough";
    let statusClass = "status-bad";

    if (Math.max(totalSavings, 0) >= goalAmount) {
      statusText = "On Track";
      statusClass = "status-good";
    } else if (Math.max(totalSavings, 0) > 0) {
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

function renderIncomePage(data, totals) {
  const list = document.getElementById("income-list");

  if (!list) {
    return;
  }

  document.getElementById("income-total").textContent = formatCurrency(totals.totalIncome);
  document.getElementById("income-count").textContent = `${data.incomes.length} ${data.incomes.length === 1 ? "entry" : "entries"}`;

  if (!data.incomes.length) {
    list.innerHTML = '<div class="empty-state">No income added yet. Add your first entry to start the dashboard.</div>';
    return;
  }

  list.innerHTML = data.incomes.map((income) => `
    <div class="list-item">
      <div>
        <strong>${escapeHtml(income.name)}</strong>
        <span>Added ${formatDate(income.createdAt)}</span>
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
    emptyState.textContent = "Chart.js could not load.";
    return;
  }

  const grouped = expenses.reduce((acc, expense) => {
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
    return days !== null && days < 0;
  }).length;

  const dueSoonCount = fixedExpenses.filter((expense) => {
    const days = getDaysUntil(expense.dueDate);
    return days !== null && days >= 0 && days <= 7;
  }).length;

  document.getElementById("expense-total").textContent = formatCurrency(totals.totalExpenses);
  document.getElementById("expense-count").textContent = `${expenses.length} ${expenses.length === 1 ? "entry" : "entries"}`;

  const fixedTotalEl = document.getElementById("expense-fixed-total");
  const variableTotalEl = document.getElementById("expense-variable-total");
  const alertTotalEl = document.getElementById("expense-alert-total");
  const alertMetaEl = document.getElementById("expense-alert-meta");

  if (fixedTotalEl) {
    fixedTotalEl.textContent = formatCurrency(fixedTotal);
  }

  if (variableTotalEl) {
    variableTotalEl.textContent = formatCurrency(variableTotal);
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
        detailText += ` • Added ${formatDate(expense.createdAt)}`;
      }

      return `
        <div class="list-item">
          <div>
            <strong>${escapeHtml(expense.name)}</strong>
            <span>${detailText}</span>
          </div>
          <div style="text-align: right;">
            <strong>${formatCurrency(expense.amount)}</strong>
            <span class="${status.className}" style="margin-top: 8px;">${status.text}</span>
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
  const totalSavings = totals.totalSavings;
  const savingsRate = totalIncome > 0 ? Math.max((totalSavings / totalIncome) * 100, 0) : 0;

  document.getElementById("savings-income").textContent = formatCurrency(totalIncome);
  document.getElementById("savings-expenses").textContent = formatCurrency(totalExpenses);
  document.getElementById("savings-total").textContent = formatCurrency(totalSavings);
  document.getElementById("savings-rate").textContent = `${savingsRate.toFixed(1)}%`;
  document.getElementById("savings-progress").style.width = `${Math.min(savingsRate, 100)}%`;

  const copy = document.getElementById("savings-copy");
  const suggestion = document.getElementById("savings-suggestion");
  const status = document.getElementById("savings-status");
  const tipOne = document.getElementById("tip-one");
  const tipTwo = document.getElementById("tip-two");
  const tipThree = document.getElementById("tip-three");

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

  if (totalSavings < 0) {
    copy.textContent = "Your expenses are higher than your income right now.";
    suggestion.textContent = `You are overspending by ${formatCurrency(Math.abs(totalSavings))}.`;
    status.textContent = "Negative savings";
    status.className = "status-pill status-bad";
    document.getElementById("savings-progress").style.width = "0%";
    tipOne.textContent = "Trim one or two recurring categories to move back into positive savings.";
    tipTwo.textContent = "Even small cuts in flexible spending can help quickly.";
    tipThree.textContent = "Your goals will show better progress as soon as savings becomes positive.";
    return;
  }

  copy.textContent = `You currently keep ${formatCurrency(totalSavings)} after expenses.`;
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

  const availableNow = Math.max(totals.totalSavings, 0);
  const availableEl = document.getElementById("goal-available-now");
  const availableNote = document.getElementById("goal-available-note");

  if (availableEl) {
    availableEl.textContent = formatCurrency(availableNow);
  }

  if (availableNote) {
    if (totals.totalSavings > 0) {
      availableNote.textContent = `You currently have ${formatCurrency(availableNow)} available to put toward goals.`;
    } else if (totals.totalSavings === 0) {
      availableNote.textContent = "You do not have extra funds available yet. Add income or reduce expenses to create goal room.";
    } else {
      availableNote.textContent = `You are currently behind by ${formatCurrency(Math.abs(totals.totalSavings))}, so there are no available funds for goals right now.`;
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
  const incomeForm = document.getElementById("income-form");
  const expenseForm = document.getElementById("expense-form");
  const goalForm = document.getElementById("goal-form");
  const expenseType = document.getElementById("expense-type");

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
}

document.addEventListener("DOMContentLoaded", () => {
  initStorage();
  bindEvents();
  render();
});

window.addEventListener("storage", render);
