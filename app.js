<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FinanceFlow | Income</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="app">
    <header class="topbar">
      <div class="brand">
        <span class="brand-badge">FinanceFlow</span>
        <h1>Income Tracker</h1>
        <p>Add your current bank funds so the app does not start from zero, then keep registering new income as you receive it.</p>
      </div>

      <nav class="nav">
        <a href="index.html">Dashboard</a>
        <a class="active" href="income.html">Income</a>
        <a href="expenses.html">Expenses</a>
        <a href="savings.html">Savings</a>
        <a href="goals.html">Goals</a>
      </nav>
    </header>

    <section class="hero hero-income">
      <div>
        <div class="hero-tag">Income and available funds</div>
        <h2>Start with the money you already have in your accounts.</h2>
        <p>Your current bank funds are treated as your starting available money, and future income entries are added on top of that.</p>
      </div>

      <div class="hero-total">
        <span>Total Registered Income</span>
        <strong id="income-total">$0.00</strong>
      </div>
    </section>

    <section class="grid-2-wide">
      <div class="stack">
        <article class="card">
          <div class="inline-head">
            <h3 class="section-title" style="margin: 0;">Current Bank Funds</h3>
            <span class="badge">Starting Balance</span>
          </div>

          <p class="subtle" id="bank-balance-note">Add the money you currently have available in your bank accounts so the app does not begin from zero.</p>

          <div class="goal-breakdown" style="margin-bottom: 18px;">
            <div class="goal-stat">
              <span>Bank Funds</span>
              <strong id="income-bank-funds">$0.00</strong>
            </div>

            <div class="goal-stat">
              <span>Available Now</span>
              <strong id="income-available-now">$0.00</strong>
            </div>
          </div>

          <form id="bank-balance-form" class="form-grid">
            <label class="form-field">
              Current Total in Accounts
              <input class="input" id="bank-balance-amount" type="number" min="0" step="0.01" placeholder="0.00">
            </label>

            <button class="button" type="submit">Update Bank Funds</button>
            <div id="bank-balance-message" class="message"></div>
          </form>
        </article>

        <article class="card">
          <h3 class="section-title">Add Income</h3>

          <form id="income-form" class="form-grid">
            <label class="form-field">
              Income Name
              <input class="input" id="income-name" type="text" placeholder="Salary, freelance, business">
            </label>

            <label class="form-field">
              Amount
              <input class="input" id="income-amount" type="number" min="0" step="0.01" placeholder="0.00">
            </label>

            <button class="button" type="submit">Save Income</button>
            <div id="income-message" class="message"></div>
          </form>
        </article>
      </div>

      <article class="card">
        <div class="inline-head">
          <h3 class="section-title" style="margin: 0;">Income List</h3>
          <span class="badge" id="income-count">0 entries</span>
        </div>

        <div id="income-list" class="list">
          <div class="empty-state">No income added yet. Add your first income entry to start building your cash flow.</div>
        </div>
      </article>
    </section>
  </div>

  <script src="app.js"></script>
</body>
</html>
