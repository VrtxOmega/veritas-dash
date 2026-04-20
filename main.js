// State Management
let state = {
  dailyGoal: 150.00,
  weeklyGoal: 1000.00,
  dailyBills: 20.00,
  transactions: []
};

// DOM Elements
const els = {
  dateDisplay: document.getElementById('dateDisplay'),
  dailyGoalDisplay: document.getElementById('dailyGoalDisplay'),
  weeklyGoalDisplay: document.getElementById('weeklyGoalDisplay'),
  dailyProgressText: document.getElementById('dailyProgressText'),
  dailyProgressBar: document.getElementById('dailyProgressBar'),
  
  grossEarnings: document.getElementById('grossEarnings'),
  shiftExpenses: document.getElementById('shiftExpenses'),
  allocatedBills: document.getElementById('allocatedBills'),
  netProfit: document.getElementById('netProfit'),
  remainingToGoal: document.getElementById('remainingToGoal'),
  
  transactionList: document.getElementById('transactionList'),
  
  tabs: document.querySelectorAll('.tab-btn'),
  tabContents: document.querySelectorAll('.tab-content'),
  
  earningsForm: document.getElementById('earningsForm'),
  expensesForm: document.getElementById('expensesForm'),
  settingsForm: document.getElementById('settingsForm'),
};

// Initialize
function init() {
  loadState();
  updateDate();
  setupTabs();
  setupForms();
  render();
  
  // Update date every minute
  setInterval(updateDate, 60000);
}

function loadState() {
  const saved = localStorage.getItem('vrts_dash_state');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      // Ensure we only load today's transactions or keep them based on date
      // For simplicity, we just load them all. In a full app, we'd filter by date.
      state = { ...state, ...parsed };
    } catch(e) {
      console.error("Failed to parse state", e);
    }
  }
}

function saveState() {
  localStorage.setItem('vrts_dash_state', JSON.stringify(state));
}

function updateDate() {
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  els.dateDisplay.textContent = new Date().toLocaleDateString(undefined, options);
}

function setupTabs() {
  els.tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Remove active from all
      els.tabs.forEach(t => t.classList.remove('active'));
      els.tabContents.forEach(c => c.classList.remove('active'));
      
      // Set active
      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    });
  });
}

function setupForms() {
  // Settings
  document.getElementById('setDailyGoal').value = state.dailyGoal;
  document.getElementById('setWeeklyGoal').value = state.weeklyGoal;
  document.getElementById('setDailyBills').value = state.dailyBills;
  
  els.settingsForm.addEventListener('submit', (e) => {
    e.preventDefault();
    state.dailyGoal = parseFloat(document.getElementById('setDailyGoal').value) || 0;
    state.weeklyGoal = parseFloat(document.getElementById('setWeeklyGoal').value) || 0;
    state.dailyBills = parseFloat(document.getElementById('setDailyBills').value) || 0;
    saveState();
    render();
    
    // Switch to earnings tab
    els.tabs[0].click();
  });
  
  // Earnings
  els.earningsForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const amtInput = document.getElementById('earningAmount');
    const descInput = document.getElementById('earningDesc');
    
    addTransaction('earning', parseFloat(amtInput.value) || 0, descInput.value || 'DoorDash Earning');
    
    amtInput.value = '';
    descInput.value = '';
  });
  
  // Expenses
  els.expensesForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const amtInput = document.getElementById('expenseAmount');
    const descInput = document.getElementById('expenseDesc');
    
    addTransaction('expense', parseFloat(amtInput.value) || 0, descInput.value || 'Expense');
    
    amtInput.value = '';
    descInput.value = '';
    
    // Switch back to earnings tab as default workflow
    els.tabs[0].click();
  });
}

function addTransaction(type, amount, description) {
  state.transactions.unshift({
    id: Date.now().toString(),
    type,
    amount,
    description,
    timestamp: new Date().toISOString()
  });
  saveState();
  render();
}

function formatCurrency(val) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
}

function render() {
  // Calculations
  const grossEarnings = state.transactions
    .filter(t => t.type === 'earning')
    .reduce((sum, t) => sum + t.amount, 0);
    
  const shiftExpenses = state.transactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);
    
  const netProfit = grossEarnings - shiftExpenses - state.dailyBills;
  
  const progressPercent = state.dailyGoal > 0 ? Math.min(100, Math.max(0, (netProfit / state.dailyGoal) * 100)) : 0;
  
  let remaining = state.dailyGoal - netProfit;
  if (remaining < 0) remaining = 0;
  
  // Update DOM
  els.dailyGoalDisplay.textContent = formatCurrency(state.dailyGoal);
  els.weeklyGoalDisplay.textContent = formatCurrency(state.weeklyGoal);
  
  els.grossEarnings.textContent = formatCurrency(grossEarnings);
  els.shiftExpenses.textContent = formatCurrency(shiftExpenses);
  els.allocatedBills.textContent = formatCurrency(state.dailyBills);
  els.netProfit.textContent = formatCurrency(netProfit);
  els.remainingToGoal.textContent = formatCurrency(remaining);
  
  els.dailyProgressText.textContent = `${progressPercent.toFixed(1)}%`;
  els.dailyProgressBar.style.width = `${progressPercent}%`;
  
  // Optional: Change progress bar color if goal met
  if (progressPercent >= 100) {
    els.dailyProgressBar.style.background = 'linear-gradient(90deg, var(--color-positive), #73d19f)';
    els.dailyProgressBar.style.boxShadow = '0 0 15px var(--color-positive)';
  } else {
    els.dailyProgressBar.style.background = 'linear-gradient(90deg, var(--vrts-gold), #e8c678)';
    els.dailyProgressBar.style.boxShadow = '0 0 10px var(--vrts-gold-glow)';
  }
  
  // Render Transactions
  els.transactionList.innerHTML = '';
  
  if (state.transactions.length === 0) {
    els.transactionList.innerHTML = '<div class="empty-state">No entries for this shift yet.</div>';
  } else {
    state.transactions.forEach(t => {
      const el = document.createElement('div');
      el.className = `txn-item ${t.type}`;
      
      const timeStr = new Date(t.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      const sign = t.type === 'earning' ? '+' : '-';
      
      el.innerHTML = `
        <div class="txn-info">
          <span class="txn-desc">${t.description}</span>
          <span class="txn-time">${timeStr}</span>
        </div>
        <div class="txn-amount">${sign}${formatCurrency(t.amount)}</div>
      `;
      
      els.transactionList.appendChild(el);
    });
  }
}

// Boot
init();
