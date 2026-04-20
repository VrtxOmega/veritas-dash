import './style.css'

class Dashboard {
  constructor() {
    this.state = {
      transactions: [],
      config: {
        dailyGoal: 150.0,
        weeklyGoal: 1000.0,
        dailyBills: 20.0,
      }
    };
    
    this.loadState();
    this.initDOM();
    this.bindEvents();
    this.updateDashboard();
  }

  loadState() {
    const saved = localStorage.getItem('sovereign_dash_v2');
    if (saved) {
      this.state = JSON.parse(saved);
    }
  }

  saveState() {
    localStorage.setItem('sovereign_dash_v2', JSON.stringify(this.state));
    this.updateDashboard();
  }

  initDOM() {
    // Top Bar
    this.dateDisplay = document.getElementById('dateDisplay');
    
    // Progress Ring & Hero
    this.progressRingFill = document.getElementById('progressRingFill');
    this.netProfit = document.getElementById('netProfit');
    this.dailyProgressText = document.getElementById('dailyProgressText');
    this.remainingToGoal = document.getElementById('remainingToGoal');
    this.dailyGoalDisplay = document.getElementById('dailyGoalDisplay');
    
    // Quick Stats
    this.grossEarnings = document.getElementById('grossEarnings');
    this.shiftExpenses = document.getElementById('shiftExpenses');
    this.allocatedBills = document.getElementById('allocatedBills');
    
    // List
    this.transactionList = document.getElementById('transactionList');
    
    // Modals
    this.fabBtn = document.getElementById('fabBtn');
    this.actionModal = document.getElementById('actionModal');
    this.settingsModal = document.getElementById('settingsModal');
    this.overlay = document.getElementById('overlay');
    this.openSettingsBtn = document.getElementById('openSettingsBtn');
    
    // Forms
    this.earningsForm = document.getElementById('earningsForm');
    this.expensesForm = document.getElementById('expensesForm');
    this.settingsForm = document.getElementById('settingsForm');
    
    // Tabs
    this.tabBtns = document.querySelectorAll('.tab-btn');
    this.tabContents = document.querySelectorAll('.tab-content');
    
    // Populate Settings Input
    document.getElementById('setDailyGoal').value = this.state.config.dailyGoal;
    document.getElementById('setWeeklyGoal').value = this.state.config.weeklyGoal;
    document.getElementById('setDailyBills').value = this.state.config.dailyBills;
  }

  bindEvents() {
    // Set Date
    const options = { weekday: 'long', month: 'long', day: 'numeric' };
    this.dateDisplay.textContent = new Date().toLocaleDateString(undefined, options);

    // Modal Logic
    this.fabBtn.addEventListener('click', () => this.openModal(this.actionModal));
    this.openSettingsBtn.addEventListener('click', () => this.openModal(this.settingsModal));
    this.overlay.addEventListener('click', () => this.closeAllModals());

    // Tab Logic
    this.tabBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        // Remove active class
        this.tabBtns.forEach(b => b.classList.remove('active'));
        this.tabContents.forEach(c => c.classList.remove('active'));
        
        // Add active to clicked
        e.target.classList.add('active');
        const targetId = `tab-${e.target.dataset.tab}`;
        document.getElementById(targetId).classList.add('active');
      });
    });

    // Form Submissions
    this.earningsForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const amount = parseFloat(document.getElementById('earningAmount').value);
      const desc = document.getElementById('earningDesc').value || 'Delivery Run';
      this.addTransaction('earning', amount, desc);
      this.earningsForm.reset();
      this.closeAllModals();
    });

    this.expensesForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const amount = parseFloat(document.getElementById('expenseAmount').value);
      const desc = document.getElementById('expenseDesc').value || 'Expense';
      this.addTransaction('expense', amount, desc);
      this.expensesForm.reset();
      this.closeAllModals();
    });

    this.settingsForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.state.config.dailyGoal = parseFloat(document.getElementById('setDailyGoal').value);
      this.state.config.weeklyGoal = parseFloat(document.getElementById('setWeeklyGoal').value);
      this.state.config.dailyBills = parseFloat(document.getElementById('setDailyBills').value);
      this.saveState();
      this.closeAllModals();
    });
  }

  openModal(modal) {
    this.overlay.classList.add('active');
    modal.classList.add('active');
  }

  closeAllModals() {
    this.overlay.classList.remove('active');
    this.actionModal.classList.remove('active');
    this.settingsModal.classList.remove('active');
  }

  addTransaction(type, amount, description) {
    const txn = {
      id: crypto.randomUUID(),
      type,
      amount,
      description,
      timestamp: new Date().toISOString()
    };
    
    this.state.transactions.unshift(txn);
    this.saveState();
  }

  updateDashboard() {
    let gross = 0;
    let expenses = 0;
    
    this.state.transactions.forEach(t => {
      if (t.type === 'earning') {
        gross += t.amount;
      } else if (t.type === 'expense') {
        expenses += t.amount;
      }
    });

    const net = gross - expenses - this.state.config.dailyBills;
    const progressPercent = Math.max(0, Math.min(100, (net / this.state.config.dailyGoal) * 100));
    const remaining = Math.max(0, this.state.config.dailyGoal - net);

    // Formatter
    const f = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

    // Update DOM Text
    this.grossEarnings.textContent = f.format(gross);
    this.shiftExpenses.textContent = f.format(expenses);
    this.allocatedBills.textContent = f.format(this.state.config.dailyBills);
    this.netProfit.textContent = f.format(net);
    this.remainingToGoal.textContent = f.format(remaining);
    this.dailyGoalDisplay.textContent = f.format(this.state.config.dailyGoal);
    this.dailyProgressText.textContent = `${progressPercent.toFixed(0)}% of Goal`;

    // Update Progress Ring SVG
    // Circumference = 2 * PI * r (r=85) -> ~534
    const circumference = 534;
    const offset = circumference - (progressPercent / 100) * circumference;
    this.progressRingFill.style.strokeDashoffset = offset;

    // Render Transaction List
    this.renderTransactions();
  }

  renderTransactions() {
    this.transactionList.innerHTML = '';
    
    if (this.state.transactions.length === 0) {
      this.transactionList.innerHTML = `<div class="empty-state">No entries yet. Time to hit the road!</div>`;
      return;
    }

    const f = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

    this.state.transactions.forEach(t => {
      const el = document.createElement('div');
      el.className = `txn-item ${t.type}`;
      
      const timeStr = new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const symbol = t.type === 'earning' ? '+' : '-';

      el.innerHTML = `
        <div class="txn-icon">${symbol}</div>
        <div class="txn-info">
          <div class="txn-desc">${t.description}</div>
          <div class="txn-time">${timeStr}</div>
        </div>
        <div class="txn-amount">${symbol}${f.format(t.amount)}</div>
      `;
      this.transactionList.appendChild(el);
    });
  }
}

// Boot application
document.addEventListener('DOMContentLoaded', () => {
  new Dashboard();
});
