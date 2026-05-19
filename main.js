import './style.css'

const STORAGE_KEY = 'sovereign_dash_v4';
const LEGACY_STORAGE_KEY = 'sovereign_dash_v3';
const APP_BASE = import.meta.env.BASE_URL || '/';

class Dashboard {
  constructor() {
    this.state = this.createDefaultState();

    this.confettiTriggered = false;
    this.notesStatusTimeout = null;
    this.deferredInstallPrompt = null;
    this.launchAction = new URLSearchParams(window.location.search).get('action');
    this.launchActionHandled = false;
    this.loadState();
    this.initDOM();
    this.bindEvents();
    this.updateGreeting();
    this.updateDashboard();
    this.checkUrlForBackup();
    this.initPwaStatus();
    this.registerServiceWorker();
    this.maybeShowOnboarding();
    this.handleLaunchAction();
  }

  createDefaultState() {
    return {
      transactions: [],
      weeklyLog: {},
      notes: '',
      care: { water: false, snack: false, charger: false, fuel: false, break: false },
      meta: {
        onboardingComplete: false,
        lastBackupAt: '',
        lastBackupType: '',
        lastRestoreAt: ''
      },
      config: {
        dailyGoal: 150.0,
        weeklyGoal: 1000.0,
        dailyBills: 20.0,
        taxRate: 20.0,
        babyFundRate: 10.0,
        mileageRate: 0.67,
        hourlyTarget: 22.0,
        monthlyBills: { rent: 0, car: 0, insurance: 0, utilities: 0 }
      }
    };
  }

  mergeState(saved) {
    const defaults = this.createDefaultState();
    const config = {
      ...defaults.config,
      ...(saved.config || {}),
      monthlyBills: {
        ...defaults.config.monthlyBills,
        ...((saved.config && saved.config.monthlyBills) || {})
      }
    };

    return {
      ...defaults,
      ...saved,
      transactions: Array.isArray(saved.transactions) ? saved.transactions : defaults.transactions,
      weeklyLog: saved.weeklyLog || defaults.weeklyLog,
      care: { ...defaults.care, ...(saved.care || {}) },
      meta: { ...defaults.meta, ...(saved.meta || {}) },
      config
    };
  }

  loadState() {
    const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        this.state = this.mergeState(parsed);
        if (!parsed.meta) {
          this.state.meta.onboardingComplete = true;
        }
      } catch (e) {
        console.warn('Saved dashboard state could not be loaded.', e);
      }
    }
  }

  saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    this.updateDashboard();
  }

  checkUrlForBackup() {
    const params = new URLSearchParams(window.location.search);
    const backupData = params.get('backup');
    if (backupData) {
      try {
        const decoded = decodeURIComponent(escape(window.atob(backupData)));
        const parsedState = JSON.parse(decoded);
        
        if (parsedState && parsedState.config) {
          if (confirm('A backup was found in the URL. Do you want to restore it? This will replace your current data.')) {
            this.state = this.mergeState(parsedState);
            if (!parsedState.meta) {
              this.state.meta.onboardingComplete = true;
            }
            this.state.meta.lastRestoreAt = new Date().toISOString();
            this.saveState();
            this.initDOM();
            this.bindCareState();
            this.showToast('Backup restored successfully! 🎉');
          }
        }
      } catch (e) {
        this.showToast('Invalid backup link.', true);
      }
      
      const cleanUrl = window.location.origin + window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
      this.updateDashboard();
    }
  }

  generateBackupLink() {
    try {
      this.markBackup('link');
      const stateStr = JSON.stringify(this.state);
      const encoded = window.btoa(unescape(encodeURIComponent(stateStr)));
      const url = new URL(window.location.origin + window.location.pathname);
      url.searchParams.set('backup', encoded);
      const shareUrl = url.toString();

      if (navigator.share) {
        navigator.share({
          title: 'Veritas Dash Backup',
          text: 'Tap this link to restore your Veritas Dash data.',
          url: shareUrl
        }).catch(() => {
          this.copyToClipboard(shareUrl);
        });
      } else {
        this.copyToClipboard(shareUrl);
      }
    } catch (e) {
      this.showToast('Failed to create backup.', true);
    }
  }

  markBackup(type) {
    this.state.meta.lastBackupAt = new Date().toISOString();
    this.state.meta.lastBackupType = type;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    this.updateVaultStatus();
  }

  createBackupPayload() {
    return {
      app: 'sovereign-dash',
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      state: this.state
    };
  }

  exportBackupFile() {
    try {
      this.markBackup('file');
      const payload = this.createBackupPayload();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `sovereign_dash_backup_${this.getDateKey()}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      this.showToast('Backup file exported.');
    } catch (e) {
      this.showToast('Backup export failed.', true);
    }
  }

  async importBackupFile(file) {
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const importedState = this.extractBackupState(parsed);
      const count = this.countBackupEntries(importedState);
      const ok = confirm(`Restore this backup with ${count} saved item${count === 1 ? '' : 's'}? This replaces current browser data.`);

      if (!ok) return;

      this.state = this.mergeState(importedState);
      if (!importedState.meta) {
        this.state.meta.onboardingComplete = true;
      }
      this.state.meta.lastRestoreAt = new Date().toISOString();
      this.saveState();
      this.initDOM();
      this.bindCareState();
      this.closeAllModals();
      this.openModal(this.settingsModal);
      this.showToast('Backup restored.');
    } catch (e) {
      this.showToast('Backup import failed. Choose a Sovereign Dash JSON backup.', true);
    } finally {
      if (this.backupFileInput) {
        this.backupFileInput.value = '';
      }
    }
  }

  extractBackupState(parsed) {
    const maybeState = parsed && parsed.state ? parsed.state : parsed;
    if (!maybeState || typeof maybeState !== 'object' || !maybeState.config) {
      throw new Error('Invalid Sovereign Dash backup.');
    }
    return maybeState;
  }

  countBackupEntries(state) {
    return (Array.isArray(state.transactions) ? state.transactions.length : 0)
      + Object.keys(state.weeklyLog || {}).length;
  }

  copyToClipboard(text) {
    if (this.backupLinkOutput) {
      this.backupLinkOutput.value = text;
      this.backupLinkOutput.scrollTop = 0;
      this.backupLinkOutput.scrollLeft = 0;
    }

    const fallbackCopy = () => {
      const input = document.createElement('textarea');
      input.value = text;
      input.setAttribute('readonly', '');
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.appendChild(input);
      input.select();
      const copied = document.execCommand('copy');
      input.remove();
      this.showToast(copied ? 'Backup link copied and shown.' : 'Backup link ready below.');
    };

    if (!navigator.clipboard || !window.isSecureContext) {
      fallbackCopy();
      return;
    }

    navigator.clipboard.writeText(text)
      .then(() => this.showToast('Backup link copied and shown.'))
      .catch(() => fallbackCopy());
  }

  bindCareState() {
    this.careBtns.forEach(btn => {
      const key = btn.dataset.care;
      btn.classList.toggle('active', !!this.state.care[key]);
    });
  }

  initDOM() {
    this.dateDisplay = document.getElementById('dateDisplay');
    this.connectionStatus = document.getElementById('connectionStatus');
    this.installAppBtn = document.getElementById('installAppBtn');
    this.openOnboardingBtn = document.getElementById('openOnboardingBtn');
    this.progressRingFill = document.getElementById('progressRingFill');
    this.netProfit = document.getElementById('netProfit');
    this.dailyProgressText = document.getElementById('dailyProgressText');
    this.remainingToGoal = document.getElementById('remainingToGoal');
    this.dailyGoalDisplay = document.getElementById('dailyGoalDisplay');
    this.spendableCash = document.getElementById('spendableCash');
    this.taxReserve = document.getElementById('taxReserve');
    this.babyFund = document.getElementById('babyFund');
    this.mileageDeduction = document.getElementById('mileageDeduction');
    this.nextMoveText = document.getElementById('nextMoveText');
    this.careProgress = document.getElementById('careProgress');
    this.careBtns = document.querySelectorAll('.care-chip');
    this.grossEarnings = document.getElementById('grossEarnings');
    this.shiftExpenses = document.getElementById('shiftExpenses');
    this.allocatedBills = document.getElementById('allocatedBills');
    this.hourlyRate = document.getElementById('hourlyRate');
    this.transactionList = document.getElementById('transactionList');
    this.fabBtn = document.getElementById('fabBtn');
    this.actionModal = document.getElementById('actionModal');
    this.onboardingModal = document.getElementById('onboardingModal');
    this.settingsModal = document.getElementById('settingsModal');
    this.calculatorModal = document.getElementById('calculatorModal');
    this.historyModal = document.getElementById('historyModal');
    this.openHistoryBtn = document.getElementById('openHistoryBtn');
    this.historyList = document.getElementById('historyList');
    this.overlay = document.getElementById('overlay');
    this.openSettingsBtn = document.getElementById('openSettingsBtn');
    this.openCalculatorBtn = document.getElementById('openCalculatorBtn');
    this.exportCsvBtn = document.getElementById('exportCsvBtn');
    this.closeSettingsBtn = document.getElementById('closeSettingsBtn');
    this.clearTodayBtn = document.getElementById('clearTodayBtn');
    this.btnBackup = document.getElementById('btnBackup');
    this.btnExportBackup = document.getElementById('btnExportBackup');
    this.btnImportBackup = document.getElementById('btnImportBackup');
    this.backupFileInput = document.getElementById('backupFileInput');
    this.backupLinkOutput = document.getElementById('backupLinkOutput');
    this.vaultStatus = document.getElementById('vaultStatus');
    this.vaultReminder = document.getElementById('vaultReminder');
    this.earningsForm = document.getElementById('earningsForm');
    this.expensesForm = document.getElementById('expensesForm');
    this.settingsForm = document.getElementById('settingsForm');
    this.tabBtns = document.querySelectorAll('.tab-btn');
    this.tabContents = document.querySelectorAll('.tab-content');
    this.smartInsight = document.getElementById('insightText');
    this.weeklyEarned = document.getElementById('weeklyEarned');
    this.weeklyBarFill = document.getElementById('weeklyBarFill');
    this.weekPaceStatus = document.getElementById('weekPaceStatus');
    this.weekTakeHome = document.getElementById('weekTakeHome');
    this.weekRemaining = document.getElementById('weekRemaining');
    this.weekRunsLeft = document.getElementById('weekRunsLeft');
    this.weekReserveTotal = document.getElementById('weekReserveTotal');
    this.weekMileageTotal = document.getElementById('weekMileageTotal');
    this.weekHoursTotal = document.getElementById('weekHoursTotal');
    this.weekCommandText = document.getElementById('weekCommandText');
    this.coachPaceLine = document.getElementById('coachPaceLine');
    this.coachRunLine = document.getElementById('coachRunLine');
    this.coachReserveLine = document.getElementById('coachReserveLine');
    this.monthGross = document.getElementById('monthGross');
    this.monthTaxReserve = document.getElementById('monthTaxReserve');
    this.yearMiles = document.getElementById('yearMiles');
    this.yearDeduction = document.getElementById('yearDeduction');
    this.yearBabyFund = document.getElementById('yearBabyFund');
    this.yearTakeHome = document.getElementById('yearTakeHome');
    this.greetingEmoji = document.getElementById('greetingEmoji');
    this.greetingHeadline = document.getElementById('greetingHeadline');
    this.greetingSub = document.getElementById('greetingSub');
    this.dailyNotes = document.getElementById('dailyNotes');
    this.onboardingForm = document.getElementById('onboardingForm');
    this.skipOnboardingBtn = document.getElementById('skipOnboardingBtn');

    if (this.dailyNotes) {
      this.dailyNotes.value = this.state.notes || '';
    }

    this.populateSettingsInputs();
    this.populateOnboardingInputs();
    this.updateVaultStatus();
  }

  populateSettingsInputs() {
    document.getElementById('setDailyGoal').value = this.state.config.dailyGoal;
    document.getElementById('setWeeklyGoal').value = this.state.config.weeklyGoal;
    document.getElementById('setTaxRate').value = this.state.config.taxRate;
    document.getElementById('setBabyFundRate').value = this.state.config.babyFundRate;
    document.getElementById('setMileageRate').value = this.state.config.mileageRate;
    document.getElementById('setHourlyTarget').value = this.state.config.hourlyTarget;
    const mb = this.state.config.monthlyBills || { rent: 0, car: 0, insurance: 0, utilities: 0 };
    document.getElementById('setRent').value = mb.rent || '';
    document.getElementById('setCar').value = mb.car || '';
    document.getElementById('setInsurance').value = mb.insurance || '';
    document.getElementById('setUtilities').value = mb.utilities || '';
    this.updateComputedBillsDisplay();
  }

  populateOnboardingInputs() {
    if (!this.onboardingForm) return;
    const mb = this.state.config.monthlyBills || {};
    const monthlyTotal = Object.values(mb).reduce((sum, value) => sum + (Number(value) || 0), 0);
    document.getElementById('onboardDailyGoal').value = this.state.config.dailyGoal;
    document.getElementById('onboardWeeklyGoal').value = this.state.config.weeklyGoal;
    document.getElementById('onboardTaxRate').value = this.state.config.taxRate;
    document.getElementById('onboardBabyFundRate').value = this.state.config.babyFundRate;
    document.getElementById('onboardMonthlyBills').value = monthlyTotal || '';
    document.getElementById('onboardMileageRate').value = this.state.config.mileageRate;
  }

  updateVaultStatus() {
    if (!this.vaultStatus) return;

    const lastBackupAt = this.state.meta.lastBackupAt;
    const lastRestoreAt = this.state.meta.lastRestoreAt;
    const type = this.state.meta.lastBackupType === 'file' ? 'file' : this.state.meta.lastBackupType === 'link' ? 'link' : '';
    const totalEntries = this.state.transactions.length + Object.keys(this.state.weeklyLog || {}).length;

    if (lastBackupAt) {
      const stamp = new Date(lastBackupAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      this.vaultStatus.textContent = `Last backup: ${stamp}${type ? ` (${type})` : ''}.`;
      this.vaultStatus.classList.remove('needs-backup');
    } else {
      this.vaultStatus.textContent = totalEntries > 0 ? 'Backup needed: earnings are saved only in this browser.' : 'No file backup yet.';
      this.vaultStatus.classList.toggle('needs-backup', totalEntries > 0);
    }

    if (this.vaultReminder) {
      if (lastRestoreAt) {
        const restored = new Date(lastRestoreAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
        this.vaultReminder.textContent = `Last restore: ${restored}. Export a fresh file after important changes.`;
      } else if (lastBackupAt) {
        this.vaultReminder.textContent = 'Export another backup after a big week, phone change, or browser cleanup.';
      } else {
        this.vaultReminder.textContent = 'Export a backup file before switching phones, clearing browser data, or relying on this daily.';
      }
    }
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

  getDateKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  getStartOfWeek(date = new Date()) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - start.getDay());
    return start;
  }

  createEmptySummary() {
    return {
      gross: 0,
      expenses: 0,
      bills: 0,
      net: 0,
      taxReserve: 0,
      takeHome: 0,
      babyFund: 0,
      spendable: 0,
      miles: 0,
      hours: 0,
      mileageDeduction: 0,
      runCount: 0,
      days: 0
    };
  }

  addSummary(target, source) {
    Object.keys(target).forEach(key => {
      target[key] += Number(source[key]) || 0;
    });
  }

  getPeriodSummary(period) {
    const now = new Date();
    const weekStart = this.getStartOfWeek(now);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);
    const summary = this.createEmptySummary();

    Object.entries(this.state.weeklyLog || {}).forEach(([dateStr, day]) => {
      const date = new Date(`${dateStr}T12:00:00`);
      const inPeriod =
        period === 'week'
          ? date >= weekStart && date < weekEnd
          : period === 'month'
            ? date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
            : date.getFullYear() === now.getFullYear();

      if (inPeriod) {
        this.addSummary(summary, {
          gross: day.gross,
          expenses: day.expenses,
          bills: day.bills,
          net: day.net,
          taxReserve: day.taxReserve,
          takeHome: day.takeHome ?? day.net,
          babyFund: day.babyFund,
          spendable: day.spendable,
          miles: day.miles,
          hours: day.hours,
          mileageDeduction: day.mileageDeduction,
          runCount: day.runCount,
          days: 1
        });
      }
    });

    if (this.state.transactions.length > 0) {
      const today = this.getTodayTotals();
      this.addSummary(summary, { ...today, days: 1 });
    }

    return summary;
  }

  bindEvents() {
    const options = { weekday: 'long', month: 'long', day: 'numeric' };
    this.dateDisplay.textContent = new Date().toLocaleDateString(undefined, options);

    if (this.openOnboardingBtn) {
      this.openOnboardingBtn.addEventListener('click', () => this.openOnboarding());
    }
    if (this.installAppBtn) {
      this.installAppBtn.addEventListener('click', () => this.promptInstall());
    }

    this.fabBtn.addEventListener('click', () => this.openModal(this.actionModal));
    this.openSettingsBtn.addEventListener('click', () => this.openModal(this.settingsModal));
    if (this.openHistoryBtn) {
      this.openHistoryBtn.addEventListener('click', () => {
        this.renderHistory();
        this.openModal(this.historyModal);
      });
    }
    if (this.openCalculatorBtn) {
      this.openCalculatorBtn.addEventListener('click', () => this.openModal(this.calculatorModal));
    }
    if (this.exportCsvBtn) {
      this.exportCsvBtn.addEventListener('click', () => this.exportToCsv());
    }
    const closeCalcBtn = document.getElementById('closeCalcBtn');
    if (closeCalcBtn) closeCalcBtn.addEventListener('click', () => this.closeAllModals());
    const calcHandle = document.getElementById('calcSheetHandle');
    if (calcHandle) calcHandle.addEventListener('click', () => this.closeAllModals());
    if (this.closeSettingsBtn) {
      this.closeSettingsBtn.addEventListener('click', () => this.settingsModal.classList.remove('active'));
    }
    this.overlay.addEventListener('click', () => this.closeAllModals());

    if (this.btnBackup) {
      this.btnBackup.addEventListener('click', () => this.generateBackupLink());
    }
    if (this.btnExportBackup) {
      this.btnExportBackup.addEventListener('click', () => this.exportBackupFile());
    }
    if (this.btnImportBackup && this.backupFileInput) {
      this.btnImportBackup.addEventListener('click', () => this.backupFileInput.click());
      this.backupFileInput.addEventListener('change', () => this.importBackupFile(this.backupFileInput.files[0]));
    }

    if (this.onboardingForm) {
      this.onboardingForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveOnboarding();
      });
    }
    if (this.skipOnboardingBtn) {
      this.skipOnboardingBtn.addEventListener('click', () => {
        this.state.meta.onboardingComplete = true;
        this.saveState();
        this.closeAllModals();
        this.handleLaunchAction();
        this.showToast('Setup saved for later.');
      });
    }

    this.careBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.care;
        this.state.care[key] = !this.state.care[key];
        this.saveState();
      });
    });

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

    // Notes auto-save
    const notesStatus = document.getElementById('notesStatus');
    if (this.dailyNotes) {
      this.dailyNotes.addEventListener('input', (e) => {
        this.state.notes = e.target.value;
        this.saveState();
        if (notesStatus) {
          notesStatus.textContent = 'Saving...';
          notesStatus.classList.add('visible', 'saving');
          clearTimeout(this.notesStatusTimeout);
          this.notesStatusTimeout = setTimeout(() => {
            notesStatus.textContent = 'Saved';
            notesStatus.classList.remove('saving');
            setTimeout(() => notesStatus.classList.remove('visible'), 2000);
          }, 800);
        }
      });
    }

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
      const miles = parseFloat(document.getElementById('earningMiles').value) || 0;
      const hours = parseFloat(document.getElementById('earningHours').value) || 0;
      if (amount > 0) {
        this.addTransaction('earning', amount, desc, { miles, hours });
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
      const category = document.getElementById('expenseCategory').value || 'Other';
      if (amount > 0) {
        this.addTransaction('expense', amount, desc, { category });
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
      this.state.config.taxRate = parseFloat(document.getElementById('setTaxRate').value) || 0;
      this.state.config.babyFundRate = parseFloat(document.getElementById('setBabyFundRate').value) || 0;
      this.state.config.mileageRate = parseFloat(document.getElementById('setMileageRate').value) || 0;
      this.state.config.hourlyTarget = parseFloat(document.getElementById('setHourlyTarget').value) || 0;
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

  initPwaStatus() {
    const updateStatus = () => {
      if (!this.connectionStatus) return;
      const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
      if (!navigator.onLine) {
        this.connectionStatus.textContent = 'Offline';
        this.connectionStatus.classList.add('offline');
      } else if (standalone) {
        this.connectionStatus.textContent = 'Installed';
        this.connectionStatus.classList.remove('offline');
      } else {
        this.connectionStatus.textContent = 'Local';
        this.connectionStatus.classList.remove('offline');
      }
    };

    updateStatus();
    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      this.deferredInstallPrompt = event;
      if (this.installAppBtn) {
        this.installAppBtn.hidden = false;
      }
    });
    window.addEventListener('appinstalled', () => {
      this.deferredInstallPrompt = null;
      if (this.installAppBtn) {
        this.installAppBtn.hidden = true;
      }
      updateStatus();
      this.showToast('Sovereign Dash installed.');
    });
  }

  promptInstall() {
    if (!this.deferredInstallPrompt) {
      this.showToast('Install from your browser menu if the button is not available yet.');
      return;
    }

    this.deferredInstallPrompt.prompt();
    this.deferredInstallPrompt.userChoice.then((choice) => {
      if (choice.outcome === 'accepted' && this.installAppBtn) {
        this.installAppBtn.hidden = true;
      }
      this.deferredInstallPrompt = null;
    });
  }

  registerServiceWorker() {
    if (!('serviceWorker' in navigator) || window.location.protocol === 'file:') return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(`${APP_BASE}sw.js`).catch(() => {});
    });
  }

  maybeShowOnboarding() {
    if (this.state.meta.onboardingComplete) return;
    window.setTimeout(() => this.openOnboarding(), 250);
  }

  openOnboarding() {
    if (!this.onboardingModal) return;
    this.populateOnboardingInputs();
    this.openModal(this.onboardingModal);
  }

  saveOnboarding() {
    const dailyGoal = parseFloat(document.getElementById('onboardDailyGoal').value) || 0;
    const weeklyGoal = parseFloat(document.getElementById('onboardWeeklyGoal').value) || 0;
    const taxRate = parseFloat(document.getElementById('onboardTaxRate').value) || 0;
    const babyFundRate = parseFloat(document.getElementById('onboardBabyFundRate').value) || 0;
    const monthlyBills = parseFloat(document.getElementById('onboardMonthlyBills').value) || 0;
    const mileageRate = parseFloat(document.getElementById('onboardMileageRate').value) || 0;

    this.state.config.dailyGoal = dailyGoal;
    this.state.config.weeklyGoal = weeklyGoal;
    this.state.config.taxRate = taxRate;
    this.state.config.babyFundRate = babyFundRate;
    this.state.config.mileageRate = mileageRate;
    this.state.config.monthlyBills = { rent: monthlyBills, car: 0, insurance: 0, utilities: 0 };
    this.state.config.dailyBills = monthlyBills / 30;
    this.state.meta.onboardingComplete = true;

    this.populateSettingsInputs();
    this.saveState();
    this.closeAllModals();
    this.handleLaunchAction();
    this.showToast('Plan saved. Go earn it.');
  }

  handleLaunchAction() {
    if (!this.launchAction || this.launchActionHandled || !this.state.meta.onboardingComplete) return;
    this.launchActionHandled = true;
    const cleanUrl = window.location.origin + window.location.pathname;
    window.history.replaceState({}, document.title, cleanUrl);

    if (this.launchAction === 'add') {
      window.setTimeout(() => this.openModal(this.actionModal), 250);
    }
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
    // Close any currently open modal first
    this.closeAllModals();
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
    if (this.onboardingModal) this.onboardingModal.classList.remove('active');
    this.settingsModal.classList.remove('active');
    if (this.calculatorModal) this.calculatorModal.classList.remove('active');
    if (this.historyModal) this.historyModal.classList.remove('active');
  }

  addTransaction(type, amount, description, details = {}) {
    const txn = {
      id: crypto.randomUUID(),
      type,
      amount: Number(amount) || 0,
      description,
      miles: Number(details.miles) || 0,
      hours: Number(details.hours) || 0,
      category: details.category || (type === 'earning' ? 'Earning' : 'Other'),
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
    const today = this.getDateKey();
    const totals = this.getTodayTotals();
    this.state.weeklyLog[today] = {
      gross: totals.gross,
      expenses: totals.expenses,
      bills: totals.bills,
      net: totals.net,
      takeHome: totals.takeHome,
      spendable: totals.spendable,
      taxReserve: totals.taxReserve,
      babyFund: totals.babyFund,
      miles: totals.miles,
      hours: totals.hours,
      mileageDeduction: totals.mileageDeduction,
      runCount: totals.runCount
    };
    this.state.transactions = [];
    this.state.notes = '';
    this.state.care = this.createDefaultState().care;
    if (this.dailyNotes) {
      this.dailyNotes.value = '';
    }
    this.confettiTriggered = false;
    this.saveState();
    this.showToast('Day archived! Starting fresh 🌅');
  }

  renderHistory() {
    if (!this.historyList) return;
    this.historyList.innerHTML = '';
    const entries = Object.entries(this.state.weeklyLog).sort((a, b) => new Date(b[0]) - new Date(a[0]));
    
    if (entries.length === 0) {
      this.historyList.innerHTML = '<div class="empty-state"><div class="empty-icon">📜</div><div class="empty-title">No history yet</div><div class="empty-sub">Your archived shifts will appear here.</div></div>';
      return;
    }

    entries.forEach(([dateStr, data]) => {
      const options = { weekday: 'short', month: 'short', day: 'numeric' };
      const d = new Date(dateStr + "T12:00:00Z");
      const displayDate = d.toLocaleDateString(undefined, options);
      
      const item = document.createElement('div');
      item.className = 'history-item glass-panel';
      
      item.innerHTML = `
        <div class="history-item-header">
          <span class="history-date">${displayDate}</span>
          <span class="history-net ${(data.takeHome ?? data.net) >= 0 ? 'positive' : 'negative'}">
            $${(data.takeHome ?? data.net).toFixed(2)}
          </span>
        </div>
        <div class="history-item-details">
          <span>Gross: $${data.gross.toFixed(2)}</span>
          <span>Expenses: $${data.expenses.toFixed(2)}</span>
          <span>Miles: ${(data.miles || 0).toFixed(1)}</span>
        </div>
      `;
      this.historyList.appendChild(item);
    });
  }

  exportToCsv() {
    const rows = [];
    const today = this.getTodayTotals();
    const week = this.getPeriodSummary('week');
    const month = this.getPeriodSummary('month');
    const year = this.getPeriodSummary('year');
    const summaryHeaders = ['Period', 'Gross', 'Expenses', 'Bills', 'Tax Reserve', 'Baby Fund', 'Take Home', 'Miles', 'Mileage Deduction', 'Hours', 'Runs'];
    const summaryRow = (label, data) => [
      label,
      data.gross.toFixed(2),
      data.expenses.toFixed(2),
      data.bills.toFixed(2),
      data.taxReserve.toFixed(2),
      data.babyFund.toFixed(2),
      data.takeHome.toFixed(2),
      data.miles.toFixed(1),
      data.mileageDeduction.toFixed(2),
      data.hours.toFixed(2),
      data.runCount || 0
    ];

    rows.push(['Sovereign Dash Export']);
    rows.push(['Generated', new Date().toLocaleString()]);
    rows.push([]);
    rows.push(summaryHeaders);
    rows.push(summaryRow('Current Day', today));
    rows.push(summaryRow('This Week', week));
    rows.push(summaryRow('This Month', month));
    rows.push(summaryRow('Year To Date', year));
    rows.push([]);
    rows.push(['Archived Days']);
    rows.push(['Date', ...summaryHeaders.slice(1)]);

    Object.keys(this.state.weeklyLog || {}).sort().forEach(dateStr => {
      const day = this.state.weeklyLog[dateStr];
      rows.push([
        dateStr,
        (Number(day.gross) || 0).toFixed(2),
        (Number(day.expenses) || 0).toFixed(2),
        (Number(day.bills) || 0).toFixed(2),
        (Number(day.taxReserve) || 0).toFixed(2),
        (Number(day.babyFund) || 0).toFixed(2),
        (Number(day.takeHome ?? day.net) || 0).toFixed(2),
        (Number(day.miles) || 0).toFixed(1),
        (Number(day.mileageDeduction) || 0).toFixed(2),
        (Number(day.hours) || 0).toFixed(2),
        Number(day.runCount) || 0
      ]);
    });

    rows.push([]);
    rows.push(['Current Transactions']);
    rows.push(['Date', 'Time', 'Type', 'Description', 'Category', 'Amount', 'Miles', 'Hours']);

    (this.state.transactions || []).forEach(t => {
      const date = new Date(t.timestamp);
      rows.push([
        this.getDateKey(date),
        date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        t.type,
        t.description || '',
        t.category || '',
        (Number(t.amount) || 0).toFixed(2),
        (Number(t.miles) || 0).toFixed(1),
        (Number(t.hours) || 0).toFixed(2)
      ]);
    });

    const csvContent = rows.map(row => this.toCsvRow(row)).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute('href', url);
    link.setAttribute('download', `sovereign_dash_export_${this.getDateKey()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    this.showToast('CSV Exported! 📊');
  }

  toCsvRow(row) {
    return row.map(value => {
      const text = String(value ?? '');
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    }).join(',');
  }

  getWeeklyData() {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const week = this.getPeriodSummary('week');
    const daysWithData = new Set();

    // Calculate from current week entries
    for (let i = 0; i < 7; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() - dayOfWeek + i);
      const key = this.getDateKey(d);
      if (this.state.weeklyLog[key]) {
        daysWithData.add(i);
      }
    }

    if (this.state.transactions.length > 0) {
      daysWithData.add(dayOfWeek);
    }

    return { weekTotal: week.takeHome, daysWithData, dayOfWeek, week };
  }

  getTodayTotals() {
    let gross = 0;
    let expenses = 0;
    let miles = 0;
    let hours = 0;
    let runCount = 0;

    this.state.transactions.forEach(t => {
      if (t.type === 'earning') {
        gross += Number(t.amount) || 0;
        miles += Number(t.miles) || 0;
        hours += Number(t.hours) || 0;
        runCount++;
      } else if (t.type === 'expense') {
        expenses += Number(t.amount) || 0;
      }
    });

    const bills = Number(this.state.config.dailyBills) || 0;
    const net = gross - expenses - bills;
    const mileageDeduction = miles * (Number(this.state.config.mileageRate) || 0);
    const taxable = Math.max(0, gross - expenses - mileageDeduction);
    const taxReserve = taxable * ((Number(this.state.config.taxRate) || 0) / 100);
    const takeHome = net - taxReserve;
    const babyFund = Math.max(0, takeHome) * ((Number(this.state.config.babyFundRate) || 0) / 100);
    const spendable = takeHome - babyFund;
    const hourlyRate = hours > 0 ? gross / hours : 0;

    return {
      gross,
      expenses,
      bills,
      net,
      taxable,
      taxReserve,
      takeHome,
      babyFund,
      spendable,
      miles,
      hours,
      mileageDeduction,
      hourlyRate,
      runCount
    };
  }

  updateDashboard() {
    const totals = this.getTodayTotals();
    const progressPercent = this.state.config.dailyGoal > 0
      ? Math.max(0, Math.min(100, (totals.takeHome / this.state.config.dailyGoal) * 100))
      : 0;
    const remaining = Math.max(0, this.state.config.dailyGoal - totals.takeHome);
    const f = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

    this.grossEarnings.textContent = f.format(totals.gross);
    this.shiftExpenses.textContent = f.format(totals.expenses);
    this.allocatedBills.textContent = f.format(totals.bills);
    this.netProfit.textContent = f.format(totals.takeHome);
    this.remainingToGoal.textContent = f.format(remaining);
    this.dailyGoalDisplay.textContent = f.format(this.state.config.dailyGoal);
    this.dailyProgressText.textContent = `${progressPercent.toFixed(0)}% of Goal`;
    this.spendableCash.textContent = f.format(totals.spendable);
    this.taxReserve.textContent = f.format(totals.taxReserve);
    this.babyFund.textContent = f.format(totals.babyFund);
    this.mileageDeduction.textContent = f.format(totals.mileageDeduction);

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
    this.updateSmartInsight(totals.takeHome, remaining, progressPercent, totals.gross);
    this.updateNextMove(totals, remaining);
    this.renderCareChecklist();

    // Weekly
    this.updateWeeklyProgress();
    this.updateWeekCommand();
    this.updateTaxSnapshot();
    this.updateVaultStatus();

    // Hourly Rate
    this.calculateHourlyRate(totals.gross, totals.hours);

    // Render Transactions
    this.renderTransactions();
  }

  calculateHourlyRate(gross, loggedHours) {
    if (loggedHours > 0) {
      const f = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
      if (this.hourlyRate) this.hourlyRate.textContent = `${f.format(gross / loggedHours)}/hr`;
      return;
    }

    if (!this.state.transactions || this.state.transactions.length < 2) {
      if (this.hourlyRate) this.hourlyRate.textContent = '$0.00/hr';
      return;
    }
    const times = this.state.transactions.map(t => new Date(t.timestamp).getTime());
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    
    let hours = (maxTime - minTime) / (1000 * 60 * 60);
    if (hours <= 0) hours = 1; // avoid Infinity
    
    const rate = gross / hours;
    const f = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
    if (this.hourlyRate) this.hourlyRate.textContent = `${f.format(rate)}/hr`;
  }

  updateNextMove(totals, remaining) {
    const f = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
    const earningCount = this.state.transactions.filter(t => t.type === 'earning').length;

    if (earningCount === 0) {
      this.nextMoveText.textContent = 'Log a run with miles and hours to unlock the full plan.';
      return;
    }

    const averageTakeHomeRun = totals.takeHome / earningCount;
    const runsNeeded = Math.max(0, Math.ceil(remaining / Math.max(averageTakeHomeRun, 1)));
    const hourlyTarget = Number(this.state.config.hourlyTarget) || 0;

    if (totals.takeHome >= this.state.config.dailyGoal) {
      this.nextMoveText.textContent = `Goal covered. Protect ${f.format(totals.taxReserve)} for tax and ${f.format(totals.babyFund)} for baby fund.`;
    } else if (totals.hourlyRate > 0 && hourlyTarget > 0 && totals.hourlyRate < hourlyTarget) {
      this.nextMoveText.textContent = `Hourly pace is ${f.format(totals.hourlyRate)}/hr. Aim for higher-value zones before adding ${runsNeeded} more run${runsNeeded === 1 ? '' : 's'}.`;
    } else {
      this.nextMoveText.textContent = `${f.format(remaining)} left to goal. At current take-home pace, plan about ${runsNeeded} more run${runsNeeded === 1 ? '' : 's'}.`;
    }
  }

  updateWeekCommand() {
    const week = this.getPeriodSummary('week');
    const f = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
    const todayIndex = new Date().getDay();
    const daysElapsed = todayIndex + 1;
    const daysRemaining = Math.max(1, 7 - todayIndex);
    const remaining = Math.max(0, this.state.config.weeklyGoal - week.takeHome);
    const avgRun = week.runCount > 0 ? week.takeHome / week.runCount : 0;
    const runsLeft = remaining > 0 && avgRun > 0 ? Math.ceil(remaining / avgRun) : 0;
    const reserveTotal = week.taxReserve + week.babyFund;
    const weekPercent = this.state.config.weeklyGoal > 0 ? (week.takeHome / this.state.config.weeklyGoal) * 100 : 0;
    const expectedPace = this.state.config.weeklyGoal > 0 ? this.state.config.weeklyGoal * (daysElapsed / 7) : 0;
    const paceDelta = week.takeHome - expectedPace;
    const dailyNeed = remaining / daysRemaining;

    this.weekTakeHome.textContent = f.format(week.takeHome);
    this.weekRemaining.textContent = f.format(remaining);
    this.weekRunsLeft.textContent = String(runsLeft);
    this.weekReserveTotal.textContent = f.format(reserveTotal);
    this.weekMileageTotal.textContent = `${week.miles.toFixed(1)} mi`;
    this.weekHoursTotal.textContent = `${week.hours.toFixed(2)} hr`;

    if (weekPercent >= 100) {
      this.weekPaceStatus.textContent = 'Covered';
      this.weekCommandText.textContent = `Weekly goal covered. Reserve ${f.format(reserveTotal)} and keep the next run optional.`;
      this.coachPaceLine.textContent = `${f.format(Math.max(0, paceDelta))} ahead`;
      this.coachRunLine.textContent = 'Only take runs that are worth it';
      this.coachReserveLine.textContent = `${f.format(reserveTotal)} protected`;
    } else if (week.runCount === 0) {
      this.weekPaceStatus.textContent = 'Plan';
      this.weekCommandText.textContent = 'Build the week from today\'s first run.';
      this.coachPaceLine.textContent = `${f.format(this.state.config.weeklyGoal)} target`;
      this.coachRunLine.textContent = `Aim for ${f.format(dailyNeed)} today`;
      this.coachReserveLine.textContent = `${this.state.config.taxRate}% tax / ${this.state.config.babyFundRate}% baby`;
    } else {
      const paceLabel = Math.abs(paceDelta) < 25 ? 'On Pace' : paceDelta >= 0 ? 'Ahead' : 'Behind';
      this.weekPaceStatus.textContent = paceLabel;
      this.weekCommandText.textContent = `${f.format(remaining)} left this week. Need about ${f.format(dailyNeed)} take-home per remaining day.`;
      this.coachPaceLine.textContent = paceDelta >= 0
        ? `${f.format(paceDelta)} ahead of pace`
        : `${f.format(Math.abs(paceDelta))} behind pace`;
      this.coachRunLine.textContent = avgRun > 0
        ? `${runsLeft} run${runsLeft === 1 ? '' : 's'} left at ${f.format(avgRun)} avg take-home`
        : `Aim for ${f.format(dailyNeed)} today`;
      this.coachReserveLine.textContent = `${f.format(reserveTotal)} protected`;
    }
  }

  updateTaxSnapshot() {
    const month = this.getPeriodSummary('month');
    const year = this.getPeriodSummary('year');
    const f = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

    this.monthGross.textContent = f.format(month.gross);
    this.monthTaxReserve.textContent = f.format(month.taxReserve);
    this.yearMiles.textContent = year.miles.toFixed(1);
    this.yearDeduction.textContent = f.format(year.mileageDeduction);
    this.yearBabyFund.textContent = f.format(year.babyFund);
    this.yearTakeHome.textContent = f.format(year.takeHome);
  }

  renderCareChecklist() {
    let ready = 0;
    this.careBtns.forEach(btn => {
      const active = !!this.state.care[btn.dataset.care];
      if (active) ready++;
      btn.classList.toggle('active', active);
    });
    if (this.careProgress) {
      this.careProgress.textContent = `${ready}/${this.careBtns.length} ready`;
    }
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
    const totals = this.getTodayTotals();
    if (totals.takeHome >= this.state.config.dailyGoal && this.state.config.dailyGoal > 0) {
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

  showToast(message, isError = false) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = `toast${isError ? ' error' : ''}`;
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

      const iconDiv = document.createElement('div');
      iconDiv.className = 'txn-icon';
      iconDiv.textContent = emoji;

      const infoDiv = document.createElement('div');
      infoDiv.className = 'txn-info';

      const descDiv = document.createElement('div');
      descDiv.className = 'txn-desc';
      descDiv.textContent = t.description;

      const timeDiv = document.createElement('div');
      timeDiv.className = 'txn-time';
      const meta = [timeStr];
      if (t.type === 'earning') {
        if (Number(t.miles) > 0) meta.push(`${Number(t.miles).toFixed(1)} mi`);
        if (Number(t.hours) > 0) meta.push(`${Number(t.hours).toFixed(2)} hr`);
      } else if (t.category) {
        meta.push(t.category);
      }
      timeDiv.textContent = meta.join(' · ');

      infoDiv.appendChild(descDiv);
      infoDiv.appendChild(timeDiv);

      const amountDiv = document.createElement('div');
      amountDiv.className = `txn-amount ${t.type}`;
      amountDiv.textContent = `${symbol} ${f.format(Number(t.amount) || 0)}`;

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'txn-delete';
      deleteBtn.dataset.id = t.id;
      deleteBtn.setAttribute('aria-label', 'Delete');
      deleteBtn.textContent = '×';

      el.appendChild(iconDiv);
      el.appendChild(infoDiv);
      el.appendChild(amountDiv);
      el.appendChild(deleteBtn);
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
