import './style.css'

class Dashboard {
  constructor() {
    this.state = {
      transactions: [],
      weeklyLog: {},
      config: {
        dailyGoal: 150.0,
        weeklyGoal: 1000.0,
        dailyBills: 20.0,
        monthlyBills: { rent: 0, car: 0, insurance: 0, utilities: 0 }
      }
    };
    
    this.confettiTriggered = false;
    this.loadState();
    this.initDOM();
    this.bindEvents();
    this.updateGreeting();
    this.updateDashboard();
  }

  loadState() {
    const saved = localStorage.getItem('sovereign_dash_v3');
    if (saved) {
      const parsed = JSON.parse(saved);
      this.state = { ...this.state, ...parsed };
      if (!this.state.weeklyLog) this.state.weeklyLog = {};
    }
  }

  saveState() {
    localStorage.setItem('sovereign_dash_v3', JSON.stringify(this.state));
    this.updateDashboard();
  }

  initDOM() {
    this.dateDisplay = document.getElementById('dateDisplay');
    this.progressRingFill = document.getElementById('progressRingFill');
    this.netProfit = document.getElementById('netProfit');
    this.dailyProgressText = document.getElementById('dailyProgressText');
    this.remainingToGoal = document.getElementById('remainingToGoal');
    this.dailyGoalDisplay = document.getElementById('dailyGoalDisplay');
    this.grossEarnings = document.getElementById('grossEarnings');
    this.shiftExpenses = document.getElementById('shiftExpenses');
    this.allocatedBills = document.getElementById('allocatedBills');
    this.transactionList = document.getElementById('transactionList');
    this.fabBtn = document.getElementById('fabBtn');
    this.actionModal = document.getElementById('actionModal');
    this.settingsModal = document.getElementById('settingsModal');
    this.overlay = document.getElementById('overlay');
    this.openSettingsBtn = document.getElementById('openSettingsBtn');
    this.clearTodayBtn = document.getElementById('clearTodayBtn');
    this.earningsForm = document.getElementById('earningsForm');
    this.expensesForm = document.getElementById('expensesForm');
    this.settingsForm = document.getElementById('settingsForm');
    this.tabBtns = document.querySelectorAll('.tab-btn');
    this.tabContents = document.querySelectorAll('.tab-content');
    this.smartInsight = document.getElementById('insightText');
    this.weeklyEarned = document.getElementById('weeklyEarned');
    this.weeklyBarFill = document.getElementById('weeklyBarFill');
    this.greetingEmoji = document.getElementById('greetingEmoji');
    this.greetingHeadline = document.getElementById('greetingHeadline');
    this.greetingSub = document.getElementById('greetingSub');

    // Populate Settings
    document.getElementById('setDailyGoal').value = this.state.config.dailyGoal;
    document.getElementById('setWeeklyGoal').value = this.state.config.weeklyGoal;
    const mb = this.state.config.monthlyBills || { rent: 0, car: 0, insurance: 0, utilities: 0 };
    document.getElementById('setRent').value = mb.rent || '';
    document.getElementById('setCar').value = mb.car || '';
    document.getElementById('setInsurance').value = mb.insurance || '';
    document.getElementById('setUtilities').value = mb.utilities || '';
    this.updateComputedBillsDisplay();
  }

  updateComputedBillsDisplay() {
    const rent = parseFloat(document.getElementById('setRent').value) || 0;
    const car = parseFloat(document.getElementById('setCar').value) || 0;
    const ins = parseFloat(document.getElementById('setInsurance').value) || 0;
    const util = parseFloat(document.getElementById('setUtilities').value) || 0;
    const total = rent + car + ins + util;
    const daily = total / 30;
    document.getElementById('setDailyBills').textContent = `$${daily.toFixed(2)}/day`;
  }

  bindEvents() {
    const options = { weekday: 'long', month: 'long', day: 'numeric' };
    this.dateDisplay.textContent = new Date().toLocaleDateString(undefined, options);

    this.fabBtn.addEventListener('click', () => this.openModal(this.actionModal));
    this.openSettingsBtn.addEventListener('click', () => this.openModal(this.settingsModal));
    this.overlay.addEventListener('click', () => this.closeAllModals());

    // Tab Logic
    this.tabBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.tabBtns.forEach(b => b.classList.remove('active'));
        this.tabContents.forEach(c => c.classList.remove('active'));
        e.target.classList.add('active');
        document.getElementById(`tab-${e.target.dataset.tab}`).classList.add('active');
      });
    });

    // Quick Presets
    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const amount = parseFloat(btn.dataset.amount);
        const activeTab = document.querySelector('.tab-btn.active').dataset.tab;
        if (activeTab === 'earnings') {
          document.getElementById('earningAmount').value = amount;
          document.getElementById('earningAmount').focus();
        } else {
          document.getElementById('expenseAmount').value = amount;
          document.getElementById('expenseAmount').focus();
        }
        // Visual feedback
        btn.classList.add('pressed');
        setTimeout(() => btn.classList.remove('pressed'), 200);
      });
    });

    // Auto-calculate Daily Bills
    ['setRent', 'setCar', 'setInsurance', 'setUtilities'].forEach(id => {
      document.getElementById(id).addEventListener('input', () => this.updateComputedBillsDisplay());
    });

    // Clear Today
    this.clearTodayBtn.addEventListener('click', () => {
      if (confirm('Archive today\'s entries and start fresh?')) {
        this.archiveToday();
      }
    });

    // Earnings Form
    this.earningsForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const amount = parseFloat(document.getElementById('earningAmount').value);
      const desc = document.getElementById('earningDesc').value || 'DoorDash Run';
      if (amount > 0) {
        this.addTransaction('earning', amount, desc);
        this.earningsForm.reset();
        this.closeAllModals();
        this.showToast(`+$${amount.toFixed(2)} logged! 🎉`);
      }
    });

    // Expenses Form
    this.expensesForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const amount = parseFloat(document.getElementById('expenseAmount').value);
      const desc = document.getElementById('expenseDesc').value || 'Expense';
      if (amount > 0) {
        this.addTransaction('expense', amount, desc);
        this.expensesForm.reset();
        this.closeAllModals();
        this.showToast(`-$${amount.toFixed(2)} recorded`);
      }
    });

    // Settings Form
    this.settingsForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.state.config.dailyGoal = parseFloat(document.getElementById('setDailyGoal').value) || 0;
      this.state.config.weeklyGoal = parseFloat(document.getElementById('setWeeklyGoal').value) || 0;
      const rent = parseFloat(document.getElementById('setRent').value) || 0;
      const car = parseFloat(document.getElementById('setCar').value) || 0;
      const insurance = parseFloat(document.getElementById('setInsurance').value) || 0;
      const utilities = parseFloat(document.getElementById('setUtilities').value) || 0;
      this.state.config.monthlyBills = { rent, car, insurance, utilities };
      this.state.config.dailyBills = (rent + car + insurance + utilities) / 30;
      this.saveState();
      this.closeAllModals();
      this.showToast('Settings saved! ✅');
    });
  }

  updateGreeting() {
    const hour = new Date().getHours();
    let emoji, headline, sub;
    if (hour < 6) {
      emoji = '🌙'; headline = 'Late night hustle!'; sub = 'You\'re amazing for being out here 💜';
    } else if (hour < 12) {
      emoji = '☀️'; headline = 'Good morning, beautiful!'; sub = 'Let\'s crush it today 💪';
    } else if (hour < 17) {
      emoji = '🌤️'; headline = 'Afternoon grind!'; sub = 'You\'re doing so great, keep going! ✨';
    } else if (hour < 21) {
      emoji = '🌅'; headline = 'Evening shift!'; sub = 'Almost done, you got this! 🏠';
    } else {
      emoji = '🌙'; headline = 'Night owl mode!'; sub = 'So proud of you! Rest up soon 💤';
    }
    this.greetingEmoji.textContent = emoji;
    this.greetingHeadline.textContent = headline;
    this.greetingSub.textContent = sub;
  }

  openModal(modal) {
    this.overlay.classList.add('active');
    modal.classList.add('active');
    // Auto-focus the relevant input after animation
    setTimeout(() => {
      const input = modal.querySelector('input[type="number"]:not([readonly])');
      if (input) input.focus();
    }, 400);
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
    this.checkGoalCelebration();
  }

  deleteTransaction(id) {
    this.state.transactions = this.state.transactions.filter(t => t.id !== id);
    this.saveState();
  }

  archiveToday() {
    const today = new Date().toISOString().split('T')[0];
    let gross = 0, expenses = 0;
    this.state.transactions.forEach(t => {
      if (t.type === 'earning') gross += t.amount;
      else expenses += t.amount;
    });
    const net = gross - expenses - this.state.config.dailyBills;
    this.state.weeklyLog[today] = { gross, expenses, net };
    this.state.transactions = [];
    this.confettiTriggered = false;
    this.saveState();
    this.showToast('Day archived! Starting fresh 🌅');
  }

  getWeeklyData() {
    const now = new Date();
    const dayOfWeek = now.getDay();
    let weekTotal = 0;
    const daysWithData = new Set();

    // Calculate from current week entries
    for (let i = 0; i < 7; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() - dayOfWeek + i);
      const key = d.toISOString().split('T')[0];
      if (this.state.weeklyLog[key]) {
        weekTotal += this.state.weeklyLog[key].net;
        daysWithData.add(i);
      }
    }

    // Add today's live data
    let todayGross = 0, todayExp = 0;
    this.state.transactions.forEach(t => {
      if (t.type === 'earning') todayGross += t.amount;
      else todayExp += t.amount;
    });
    const todayNet = todayGross - todayExp - this.state.config.dailyBills;
    if (this.state.transactions.length > 0) {
      weekTotal += todayNet;
      daysWithData.add(dayOfWeek);
    }

    return { weekTotal, daysWithData, dayOfWeek };
  }

  updateDashboard() {
    let gross = 0, expenses = 0;
    this.state.transactions.forEach(t => {
      if (t.type === 'earning') gross += t.amount;
      else if (t.type === 'expense') expenses += t.amount;
    });

    const net = gross - expenses - this.state.config.dailyBills;
    const progressPercent = this.state.config.dailyGoal > 0
      ? Math.max(0, Math.min(100, (net / this.state.config.dailyGoal) * 100))
      : 0;
    const remaining = Math.max(0, this.state.config.dailyGoal - net);
    const f = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

    this.grossEarnings.textContent = f.format(gross);
    this.shiftExpenses.textContent = f.format(expenses);
    this.allocatedBills.textContent = f.format(this.state.config.dailyBills);
    this.netProfit.textContent = f.format(net);
    this.remainingToGoal.textContent = f.format(remaining);
    this.dailyGoalDisplay.textContent = f.format(this.state.config.dailyGoal);
    this.dailyProgressText.textContent = `${progressPercent.toFixed(0)}% of Goal`;

    // Dynamic ring color based on progress
    const ring = this.progressRingFill;
    if (progressPercent >= 100) {
      ring.style.stroke = 'hsl(150, 70%, 50%)';
      ring.style.filter = 'drop-shadow(0 0 12px hsla(150, 70%, 50%, 0.6))';
    } else if (progressPercent >= 75) {
      ring.style.stroke = 'var(--vrts-gold)';
      ring.style.filter = 'drop-shadow(0 0 8px var(--vrts-gold-glow))';
    } else if (progressPercent >= 50) {
      ring.style.stroke = 'hsl(44, 53%, 54%)';
      ring.style.filter = 'drop-shadow(0 0 6px hsla(44, 53%, 54%, 0.4))';
    } else {
      ring.style.stroke = 'hsl(220, 20%, 50%)';
      ring.style.filter = 'drop-shadow(0 0 4px hsla(220, 20%, 50%, 0.3))';
    }

    const circumference = 534;
    const offset = circumference - (progressPercent / 100) * circumference;
    ring.style.strokeDashoffset = offset;

    // Smart Insight
    this.updateSmartInsight(net, remaining, progressPercent, gross);

    // Weekly
    this.updateWeeklyProgress();

    // Render Transactions
    this.renderTransactions();
  }

  updateSmartInsight(net, remaining, percent, gross) {
    let insight;
    const totalEntries = this.state.transactions.length;
    const goal = this.state.config.dailyGoal;

    if (goal === 0) {
      insight = '⚙️ Set your daily goal in settings to get started!';
    } else if (percent >= 100) {
      insight = '🎉 Goal reached! You\'re incredible — treat yourself! 👑';
    } else if (percent >= 80) {
      const f = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
      insight = `🔥 Almost there! Just ${f.format(remaining)} more to hit your goal!`;
    } else if (percent >= 50) {
      insight = `💪 Halfway there! You\'re making great progress, keep it up!`;
    } else if (totalEntries === 0) {
      insight = '🚗 Ready to dash? Tap + to log your first run!';
    } else if (totalEntries === 1) {
      insight = `👍 First run logged! ${Math.ceil(100 - percent)}% more to go!`;
    } else {
      const avgPerRun = gross / Math.max(1, this.state.transactions.filter(t => t.type === 'earning').length);
      const runsNeeded = Math.ceil(remaining / Math.max(1, avgPerRun));
      insight = `📊 At your pace, ~${runsNeeded} more run${runsNeeded !== 1 ? 's' : ''} to hit your goal`;
    }
    this.smartInsight.textContent = insight;
  }

  updateWeeklyProgress() {
    const { weekTotal, daysWithData } = this.getWeeklyData();
    const weeklyGoal = this.state.config.weeklyGoal;
    const f = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
    this.weeklyEarned.textContent = `${f.format(weekTotal)} / ${f.format(weeklyGoal)}`;

    const weekPercent = weeklyGoal > 0 ? Math.max(0, Math.min(100, (weekTotal / weeklyGoal) * 100)) : 0;
    this.weeklyBarFill.style.width = `${weekPercent}%`;

    if (weekPercent >= 100) {
      this.weeklyBarFill.classList.add('complete');
    } else {
      this.weeklyBarFill.classList.remove('complete');
    }

    // Update day dots
    const dots = document.querySelectorAll('.day-dot');
    const today = new Date().getDay();
    dots.forEach((dot, i) => {
      dot.classList.remove('active', 'today', 'has-data');
      if (i === today) dot.classList.add('today');
      if (daysWithData.has(i)) dot.classList.add('has-data');
      if (i <= today) dot.classList.add('active');
    });
  }

  checkGoalCelebration() {
    if (this.confettiTriggered) return;
    let gross = 0, expenses = 0;
    this.state.transactions.forEach(t => {
      if (t.type === 'earning') gross += t.amount;
      else expenses += t.amount;
    });
    const net = gross - expenses - this.state.config.dailyBills;
    if (net >= this.state.config.dailyGoal && this.state.config.dailyGoal > 0) {
      this.confettiTriggered = true;
      this.fireConfetti();
      this.showToast('🎉 GOAL REACHED! You\'re a queen! 👑');
    }
  }

  fireConfetti() {
    const canvas = document.getElementById('confettiCanvas');
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.display = 'block';

    const colors = ['#C9A84C', '#FFD700', '#FFA500', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#FF69B4'];
    const particles = [];

    for (let i = 0; i < 150; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: -20 - Math.random() * 100,
        w: 6 + Math.random() * 6,
        h: 4 + Math.random() * 4,
        vx: (Math.random() - 0.5) * 4,
        vy: 2 + Math.random() * 4,
        rot: Math.random() * 360,
        rotSpeed: (Math.random() - 0.5) * 12,
        color: colors[Math.floor(Math.random() * colors.length)],
        opacity: 1
      });
    }

    let frame = 0;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;
      particles.forEach(p => {
        if (p.opacity <= 0) return;
        alive = true;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.05;
        p.rot += p.rotSpeed;
        if (frame > 60) p.opacity -= 0.008;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rot * Math.PI) / 180);
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });
      frame++;
      if (alive && frame < 300) {
        requestAnimationFrame(animate);
      } else {
        canvas.style.display = 'none';
      }
    };
    requestAnimationFrame(animate);
  }

  showToast(message) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  renderTransactions() {
    this.transactionList.innerHTML = '';
    
    if (this.state.transactions.length === 0) {
      this.transactionList.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🚗</div>
          <div class="empty-title">No entries yet</div>
          <div class="empty-sub">Tap the + button to log your first run!</div>
        </div>`;
      return;
    }

    const f = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

    this.state.transactions.forEach(t => {
      const el = document.createElement('div');
      el.className = `txn-item ${t.type}`;
      const timeStr = new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const symbol = t.type === 'earning' ? '↑' : '↓';
      const emoji = t.type === 'earning' ? '💰' : '⛽';

      el.innerHTML = `
        <div class="txn-icon">${emoji}</div>
        <div class="txn-info">
          <div class="txn-desc">${t.description}</div>
          <div class="txn-time">${timeStr}</div>
        </div>
        <div class="txn-amount ${t.type}">${symbol} ${f.format(t.amount)}</div>
        <button class="txn-delete" data-id="${t.id}" aria-label="Delete">×</button>
      `;
      this.transactionList.appendChild(el);
    });

    // Bind delete buttons
    this.transactionList.querySelectorAll('.txn-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const item = btn.closest('.txn-item');
        item.classList.add('deleting');
        setTimeout(() => this.deleteTransaction(id), 300);
      });
    });
  }
}

// Boot application
document.addEventListener('DOMContentLoaded', () => {
  new Dashboard();
});
