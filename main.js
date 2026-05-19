import './style.css'

const STORAGE_KEY = 'sovereign_dash_v4';
const LEGACY_STORAGE_KEY = 'sovereign_dash_v3';
const APP_BASE = import.meta.env.BASE_URL || '/';

class Dashboard {
  constructor() {
    this.state = this.createDefaultState();

    this.confettiTriggered = false;
    this.notesStatusTimeout = null;
    this.timerInterval = null;
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
    this.startTimerTicker();
  }

  createDefaultState() {
    return {
      transactions: [],
      weeklyLog: {},
      notes: '',
      care: { water: false, snack: false, charger: false, fuel: false, break: false },
      timer: {
        status: 'idle',
        startedAt: '',
        accumulatedMs: 0,
        lastUsedHours: 0
      },
      billShield: {
        dueDays: {
          rent: 1,
          car: 10,
          insurance: 15,
          utilities: 20
        },
        paid: {}
      },
      offerGuard: {
        pay: 0,
        miles: 0,
        minutes: 0,
        lastDecision: ''
      },
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
        babyPlan: {
          dueDate: '',
          target: 1500.0,
          savedStart: 0.0,
          note: 'Go bag, diapers, car seat, first month buffer.'
        },
        monthlyBills: { rent: 0, car: 0, insurance: 0, utilities: 0 }
      }
    };
  }

  mergeState(saved) {
    const defaults = this.createDefaultState();
    const timer = {
      ...defaults.timer,
      ...(saved.timer || {})
    };
    if (!['idle', 'running', 'paused'].includes(timer.status)) {
      timer.status = 'idle';
    }
    timer.accumulatedMs = Math.max(0, Number(timer.accumulatedMs) || 0);
    timer.lastUsedHours = Math.max(0, Number(timer.lastUsedHours) || 0);

    const billShield = {
      ...defaults.billShield,
      ...(saved.billShield || {}),
      dueDays: {
        ...defaults.billShield.dueDays,
        ...((saved.billShield && saved.billShield.dueDays) || {})
      },
      paid: {}
    };
    Object.keys(billShield.dueDays).forEach(key => {
      billShield.dueDays[key] = Math.max(1, Math.min(31, Math.round(Number(billShield.dueDays[key]) || defaults.billShield.dueDays[key] || 1)));
    });
    Object.entries((saved.billShield && saved.billShield.paid) || {}).forEach(([key, value]) => {
      if (value === true) billShield.paid[key] = true;
    });

    const offerGuard = {
      ...defaults.offerGuard,
      ...(saved.offerGuard || {})
    };
    offerGuard.pay = Math.max(0, Number(offerGuard.pay) || 0);
    offerGuard.miles = Math.max(0, Number(offerGuard.miles) || 0);
    offerGuard.minutes = Math.max(0, Number(offerGuard.minutes) || 0);
    if (!['take', 'maybe', 'skip', ''].includes(offerGuard.lastDecision)) {
      offerGuard.lastDecision = '';
    }

    const config = {
      ...defaults.config,
      ...(saved.config || {}),
      babyPlan: {
        ...defaults.config.babyPlan,
        ...((saved.config && saved.config.babyPlan) || {})
      },
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
      timer,
      billShield,
      offerGuard,
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
    this.offerGuardSection = document.querySelector('.offer-guard');
    this.offerPay = document.getElementById('offerPay');
    this.offerMiles = document.getElementById('offerMiles');
    this.offerMinutes = document.getElementById('offerMinutes');
    this.offerGuardStatus = document.getElementById('offerGuardStatus');
    this.offerHourly = document.getElementById('offerHourly');
    this.offerPerMile = document.getElementById('offerPerMile');
    this.offerNetEstimate = document.getElementById('offerNetEstimate');
    this.offerGuardText = document.getElementById('offerGuardText');
    this.btnUseOffer = document.getElementById('btnUseOffer');
    this.btnClearOffer = document.getElementById('btnClearOffer');
    this.runTimerStatus = document.getElementById('runTimerStatus');
    this.runTimerElapsed = document.getElementById('runTimerElapsed');
    this.runTimerStarted = document.getElementById('runTimerStarted');
    this.runTimerPace = document.getElementById('runTimerPace');
    this.btnTimerStart = document.getElementById('btnTimerStart');
    this.btnTimerPause = document.getElementById('btnTimerPause');
    this.btnTimerResume = document.getElementById('btnTimerResume');
    this.btnTimerUse = document.getElementById('btnTimerUse');
    this.btnTimerReset = document.getElementById('btnTimerReset');
    this.spendableCash = document.getElementById('spendableCash');
    this.taxReserve = document.getElementById('taxReserve');
    this.babyFund = document.getElementById('babyFund');
    this.mileageDeduction = document.getElementById('mileageDeduction');
    this.nextMoveText = document.getElementById('nextMoveText');
    this.billShieldStatus = document.getElementById('billShieldStatus');
    this.billShieldProtected = document.getElementById('billShieldProtected');
    this.billShieldSafe = document.getElementById('billShieldSafe');
    this.billShieldNext = document.getElementById('billShieldNext');
    this.billShieldPaid = document.getElementById('billShieldPaid');
    this.billShieldList = document.getElementById('billShieldList');
    this.billShieldText = document.getElementById('billShieldText');
    this.closeoutStatus = document.getElementById('closeoutStatus');
    this.closeoutTakeHome = document.getElementById('closeoutTakeHome');
    this.closeoutSafeSpend = document.getElementById('closeoutSafeSpend');
    this.closeoutReserve = document.getElementById('closeoutReserve');
    this.closeoutHoursMiles = document.getElementById('closeoutHoursMiles');
    this.closeoutChecks = document.getElementById('closeoutChecks');
    this.closeoutText = document.getElementById('closeoutText');
    this.btnCloseoutArchive = document.getElementById('btnCloseoutArchive');
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
    this.babyRunwayStatus = document.getElementById('babyRunwayStatus');
    this.babyRunwaySaved = document.getElementById('babyRunwaySaved');
    this.babyRunwayRemaining = document.getElementById('babyRunwayRemaining');
    this.babyRunwayWeeks = document.getElementById('babyRunwayWeeks');
    this.babyRunwayWeeklyNeed = document.getElementById('babyRunwayWeeklyNeed');
    this.babyRunwayBarFill = document.getElementById('babyRunwayBarFill');
    this.babyRunwayNote = document.getElementById('babyRunwayNote');
    this.babyRunwayText = document.getElementById('babyRunwayText');
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
    this.populateOfferInputs();
    this.updateVaultStatus();
  }

  populateSettingsInputs() {
    document.getElementById('setDailyGoal').value = this.state.config.dailyGoal;
    document.getElementById('setWeeklyGoal').value = this.state.config.weeklyGoal;
    document.getElementById('setTaxRate').value = this.state.config.taxRate;
    document.getElementById('setBabyFundRate').value = this.state.config.babyFundRate;
    document.getElementById('setMileageRate').value = this.state.config.mileageRate;
    document.getElementById('setHourlyTarget').value = this.state.config.hourlyTarget;
    const babyPlan = this.state.config.babyPlan || {};
    document.getElementById('setBabyDueDate').value = babyPlan.dueDate || '';
    document.getElementById('setBabyTarget').value = babyPlan.target || '';
    document.getElementById('setBabySavedStart').value = babyPlan.savedStart || '';
    document.getElementById('setBabyNote').value = babyPlan.note || '';
    const mb = this.state.config.monthlyBills || { rent: 0, car: 0, insurance: 0, utilities: 0 };
    document.getElementById('setRent').value = mb.rent || '';
    document.getElementById('setCar').value = mb.car || '';
    document.getElementById('setInsurance').value = mb.insurance || '';
    document.getElementById('setUtilities').value = mb.utilities || '';
    const dueDays = this.state.billShield?.dueDays || this.createDefaultState().billShield.dueDays;
    document.getElementById('setRentDue').value = dueDays.rent || 1;
    document.getElementById('setCarDue').value = dueDays.car || 10;
    document.getElementById('setInsuranceDue').value = dueDays.insurance || 15;
    document.getElementById('setUtilitiesDue').value = dueDays.utilities || 20;
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

  populateOfferInputs() {
    if (!this.offerPay) return;
    const offer = this.state.offerGuard || this.createDefaultState().offerGuard;
    this.offerPay.value = offer.pay > 0 ? offer.pay : '';
    this.offerMiles.value = offer.miles > 0 ? offer.miles : '';
    this.offerMinutes.value = offer.minutes > 0 ? offer.minutes : '';
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

  getLifetimeSummary() {
    const summary = this.createEmptySummary();

    Object.values(this.state.weeklyLog || {}).forEach(day => {
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
    });

    if (this.state.transactions.length > 0) {
      this.addSummary(summary, { ...this.getTodayTotals(), days: 1 });
    }

    return summary;
  }

  parseLocalDate(dateString) {
    if (!dateString) return null;
    const [year, month, day] = dateString.split('-').map(Number);
    if (!year || !month || !day) return null;
    const parsed = new Date(year, month - 1, day);
    parsed.setHours(0, 0, 0, 0);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  getBabyRunway() {
    const plan = this.state.config.babyPlan || {};
    const target = Math.max(0, Number(plan.target) || 0);
    const savedStart = Math.max(0, Number(plan.savedStart) || 0);
    const lifetime = this.getLifetimeSummary();
    const saved = savedStart + lifetime.babyFund;
    const remaining = Math.max(0, target - saved);
    const dueDate = this.parseLocalDate(plan.dueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysLeft = dueDate ? Math.ceil((dueDate - today) / 86400000) : null;
    const weeksLeft = daysLeft === null ? null : Math.max(0, daysLeft / 7);
    const weeklyNeed = weeksLeft === null
      ? 0
      : weeksLeft > 0
        ? remaining / weeksLeft
        : remaining;
    const progress = target > 0 ? Math.max(0, Math.min(100, (saved / target) * 100)) : 0;

    return {
      dueDate,
      dueDateText: plan.dueDate || '',
      target,
      savedStart,
      saved,
      remaining,
      daysLeft,
      weeksLeft,
      weeklyNeed,
      progress,
      weekBabyFund: this.getPeriodSummary('week').babyFund,
      note: (plan.note || '').trim()
    };
  }

  getCareSummary() {
    const keys = Object.keys(this.createDefaultState().care);
    const ready = keys.filter(key => !!this.state.care[key]).length;
    return { ready, total: keys.length };
  }

  getShiftCloseout() {
    const totals = this.getTodayTotals();
    const shield = this.getBillShield();
    const runway = this.getBabyRunway();
    const care = this.getCareSummary();
    const dailyGoal = Math.max(0, Number(this.state.config.dailyGoal) || 0);
    const remaining = Math.max(0, dailyGoal - totals.takeHome);
    const goalPercent = dailyGoal > 0 ? Math.max(0, Math.min(100, (totals.takeHome / dailyGoal) * 100)) : 0;
    const hasRun = totals.runCount > 0;
    const goalOk = dailyGoal > 0 ? totals.takeHome >= dailyGoal : hasRun;
    const billsOk = shield.needs <= 0;
    const babyGap = Math.max(0, runway.weeklyNeed - runway.weekBabyFund);
    const babyOk = !runway.target || runway.remaining <= 0 || runway.weeklyNeed <= 0 || babyGap <= 0;
    const careOk = care.ready >= Math.min(3, care.total);
    const reserveTotal = totals.taxReserve + totals.babyFund;
    let status = 'Not Ready';
    let text = 'Log a run before closing out.';

    if (!hasRun) {
      status = 'Log Run';
    } else if (!billsOk) {
      status = 'Protect Bills';
      text = `${this.formatMoney(shield.needs)} more needed before upcoming bills are protected.`;
    } else if (!goalOk) {
      status = 'Keep Going';
      text = `${this.formatMoney(remaining)} left to goal. Stop only if the family plan is covered.`;
    } else if (!careOk) {
      status = 'Check In';
      text = 'Money is covered. Finish water, snack, charger, fuel, or break-plan checks before stopping.';
    } else {
      status = 'Safe Stop';
      text = `${this.formatMoney(totals.takeHome)} take-home logged. Close the day when notes are saved.`;
    }

    return {
      totals,
      shield,
      runway,
      care,
      remaining,
      goalPercent,
      reserveTotal,
      safeSpend: shield.safeSpend,
      hasRun,
      status,
      text,
      checks: [
        {
          name: 'Goal',
          ok: goalOk,
          text: goalOk ? 'Daily goal covered' : `${this.formatMoney(remaining)} left`,
          badge: `${goalPercent.toFixed(0)}%`
        },
        {
          name: 'Bills',
          ok: billsOk,
          text: billsOk ? 'Upcoming bills protected' : `${this.formatMoney(shield.needs)} needed`,
          badge: shield.currentTotal ? `${shield.currentPaid}/${shield.currentTotal}` : 'Set'
        },
        {
          name: 'Baby',
          ok: babyOk,
          text: babyOk ? 'Baby pace protected' : `${this.formatMoney(babyGap)} pace gap`,
          badge: this.formatMoney(totals.babyFund)
        },
        {
          name: 'Care',
          ok: careOk,
          text: careOk ? 'Shift body check ready' : 'Finish the body check',
          badge: `${care.ready}/${care.total}`
        }
      ]
    };
  }

  updateShiftCloseout() {
    if (!this.closeoutStatus) return;
    const closeout = this.getShiftCloseout();

    this.closeoutStatus.textContent = closeout.status;
    this.closeoutTakeHome.textContent = this.formatMoney(closeout.totals.takeHome);
    this.closeoutSafeSpend.textContent = this.formatMoney(closeout.safeSpend);
    this.closeoutReserve.textContent = this.formatMoney(closeout.reserveTotal);
    this.closeoutHoursMiles.textContent = `${closeout.totals.hours.toFixed(2)}h · ${closeout.totals.miles.toFixed(1)}mi`;
    this.closeoutText.textContent = closeout.text;
    if (this.btnCloseoutArchive) this.btnCloseoutArchive.disabled = !closeout.hasRun;

    if (this.closeoutChecks) {
      this.closeoutChecks.innerHTML = closeout.checks.map(check => `
        <div class="closeout-check ${check.ok ? 'ok' : 'warn'}">
          <span class="closeout-check-name">${check.name}</span>
          <span class="closeout-check-text">${check.text}</span>
          <span class="closeout-check-badge">${check.badge}</span>
        </div>
      `).join('');
    }
  }

  getOfferGuardMetrics() {
    const offer = this.state.offerGuard || this.createDefaultState().offerGuard;
    const pay = Math.max(0, Number(offer.pay) || 0);
    const miles = Math.max(0, Number(offer.miles) || 0);
    const minutes = Math.max(0, Number(offer.minutes) || 0);
    const hours = minutes / 60;
    const targetHourly = Math.max(0, Number(this.state.config.hourlyTarget) || 0);
    const mileageRate = Math.max(0, Number(this.state.config.mileageRate) || 0);
    const hourly = hours > 0 ? pay / hours : 0;
    const perMile = miles > 0 ? pay / miles : 0;
    const mileageAllowance = miles * mileageRate;
    const adjusted = Math.max(0, pay - mileageAllowance);
    const valid = pay > 0 && miles > 0 && minutes > 0;
    const targetFloor = targetHourly > 0 ? targetHourly : 22;
    let decision = '';
    let status = 'Check';
    let text = 'Enter payout, miles, and minutes before accepting it.';

    if (valid) {
      if (hourly >= targetFloor && perMile >= 1.5) {
        decision = 'take';
        status = 'Take';
        text = `Strong offer: ${this.formatMoney(hourly)}/hr and ${this.formatMoney(perMile)}/mi beats the target.`;
      } else if (hourly >= targetFloor * 0.85 && perMile >= 1.1) {
        decision = 'maybe';
        status = 'Maybe';
        text = `Only take it if the drop-off fits the shift. Pace is ${this.formatMoney(hourly)}/hr and ${this.formatMoney(perMile)}/mi.`;
      } else {
        decision = 'skip';
        status = 'Skip';
        text = `Protect the shift. This misses the ${this.formatMoney(targetFloor)}/hr target or pays too little per mile.`;
      }
    }

    return {
      pay,
      miles,
      minutes,
      hours,
      hourly,
      perMile,
      mileageAllowance,
      adjusted,
      targetHourly: targetFloor,
      valid,
      decision,
      status,
      text
    };
  }

  formatMoney(value) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value) || 0);
  }

  updateOfferGuardFromInputs() {
    this.state.offerGuard = {
      ...(this.state.offerGuard || this.createDefaultState().offerGuard),
      pay: Math.max(0, parseFloat(this.offerPay?.value) || 0),
      miles: Math.max(0, parseFloat(this.offerMiles?.value) || 0),
      minutes: Math.max(0, parseFloat(this.offerMinutes?.value) || 0)
    };
    const metrics = this.getOfferGuardMetrics();
    this.state.offerGuard.lastDecision = metrics.decision;
    this.saveState();
  }

  updateOfferGuard() {
    if (!this.offerGuardStatus) return;
    const metrics = this.getOfferGuardMetrics();
    if (this.state.offerGuard) this.state.offerGuard.lastDecision = metrics.decision;

    this.offerGuardStatus.textContent = metrics.status;
    this.offerHourly.textContent = `${this.formatMoney(metrics.hourly)}/hr`;
    this.offerPerMile.textContent = `${this.formatMoney(metrics.perMile)}/mi`;
    this.offerNetEstimate.textContent = this.formatMoney(metrics.adjusted);
    this.offerGuardText.textContent = metrics.text;
    if (this.btnUseOffer) this.btnUseOffer.disabled = !metrics.valid;
    if (this.offerGuardSection) {
      this.offerGuardSection.dataset.decision = metrics.decision || 'check';
    }
  }

  clearOfferGuard() {
    this.state.offerGuard = this.createDefaultState().offerGuard;
    this.populateOfferInputs();
    this.saveState();
    this.showToast('Offer cleared.');
  }

  useOfferGuard() {
    const metrics = this.getOfferGuardMetrics();
    if (!metrics.valid) {
      this.showToast('Enter payout, miles, and minutes first.', true);
      return;
    }

    this.activateEntryTab('earnings');
    this.openModal(this.actionModal);
    const amountInput = document.getElementById('earningAmount');
    const milesInput = document.getElementById('earningMiles');
    const hoursInput = document.getElementById('earningHours');
    const descInput = document.getElementById('earningDesc');

    if (amountInput) amountInput.value = metrics.pay.toFixed(2);
    if (milesInput) milesInput.value = metrics.miles.toFixed(1);
    if (hoursInput) hoursInput.value = metrics.hours.toFixed(2);
    if (descInput && !descInput.value) descInput.value = 'Accepted offer';
    this.showToast('Offer loaded into earning entry.');
  }

  getBillCatalog() {
    const monthlyBills = this.state.config.monthlyBills || {};
    const dueDays = this.state.billShield?.dueDays || this.createDefaultState().billShield.dueDays;
    const catalog = [
      { id: 'rent', label: 'Rent', amount: Number(monthlyBills.rent) || 0, dueDay: dueDays.rent || 1 },
      { id: 'car', label: 'Car', amount: Number(monthlyBills.car) || 0, dueDay: dueDays.car || 10 },
      { id: 'insurance', label: 'Insurance', amount: Number(monthlyBills.insurance) || 0, dueDay: dueDays.insurance || 15 },
      { id: 'utilities', label: 'Utilities', amount: Number(monthlyBills.utilities) || 0, dueDay: dueDays.utilities || 20 }
    ];

    return catalog
      .filter(bill => bill.amount > 0)
      .map(bill => ({
        ...bill,
        dueDay: Math.max(1, Math.min(31, Math.round(Number(bill.dueDay) || 1)))
      }));
  }

  getBillPeriodKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  getBillDueDate(year, monthIndex, dueDay) {
    const lastDay = new Date(year, monthIndex + 1, 0).getDate();
    const date = new Date(year, monthIndex, Math.min(dueDay, lastDay));
    date.setHours(0, 0, 0, 0);
    return date;
  }

  formatBillDueLabel(record) {
    if (record.daysUntil < 0) return `${Math.abs(record.daysUntil)}d overdue`;
    if (record.daysUntil === 0) return 'Today';
    if (record.daysUntil === 1) return 'Tomorrow';
    return record.dueDate.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  getBillInstances() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const paid = this.state.billShield?.paid || {};
    const records = [];

    this.getBillCatalog().forEach(bill => {
      [0, 1].forEach(monthOffset => {
        const date = this.getBillDueDate(today.getFullYear(), today.getMonth() + monthOffset, bill.dueDay);
        const period = this.getBillPeriodKey(date);
        const key = `${bill.id}:${period}`;
        const daysUntil = Math.ceil((date - today) / 86400000);
        records.push({
          ...bill,
          key,
          period,
          dueDate: date,
          daysUntil,
          paid: paid[key] === true
        });
      });
    });

    return records.sort((a, b) => a.dueDate - b.dueDate || a.label.localeCompare(b.label));
  }

  getBillShield() {
    const records = this.getBillInstances();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const currentPeriod = this.getBillPeriodKey(today);
    const catalog = this.getBillCatalog();
    const currentPaid = catalog.filter(bill => this.state.billShield?.paid?.[`${bill.id}:${currentPeriod}`]).length;
    const protectionRecords = records.filter(record => !record.paid && record.daysUntil <= 14);
    const protectedAmount = protectionRecords.reduce((sum, record) => sum + record.amount, 0);
    const totals = this.getTodayTotals();
    const safeSpend = Math.max(0, totals.spendable - protectedAmount);
    const nextBill = records.find(record => !record.paid) || null;
    const upcomingRecords = records
      .filter(record => record.daysUntil <= 31 && (record.daysUntil >= 0 || !record.paid))
      .slice(0, 5);

    return {
      catalog,
      records,
      upcomingRecords,
      protectionRecords,
      protectedAmount,
      safeSpend,
      needs: Math.max(0, protectedAmount - totals.spendable),
      nextBill,
      currentPaid,
      currentTotal: catalog.length
    };
  }

  toggleBillPaid(key) {
    if (!key) return;
    const paid = { ...(this.state.billShield?.paid || {}) };
    if (paid[key]) {
      delete paid[key];
      this.showToast('Bill reopened.');
    } else {
      paid[key] = true;
      this.showToast('Bill marked paid.');
    }
    this.state.billShield = {
      ...this.createDefaultState().billShield,
      ...(this.state.billShield || {}),
      paid
    };
    this.saveState();
  }

  renderBillShieldList(records) {
    if (!this.billShieldList) return;
    const f = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

    if (!records.length) {
      this.billShieldList.innerHTML = '<div class="bill-empty">No active bills yet. Add bill amounts and due days in Settings.</div>';
      return;
    }

    this.billShieldList.innerHTML = records.map(record => {
      const rowState = record.paid ? 'paid' : record.daysUntil < 0 ? 'overdue' : record.daysUntil <= 3 ? 'urgent' : '';
      const status = record.paid ? 'Paid' : 'Mark Paid';
      return `
        <div class="bill-row ${rowState}">
          <div>
            <span class="bill-name">${record.label} · ${f.format(record.amount)}</span>
            <span class="bill-meta">${this.formatBillDueLabel(record)} · due day ${record.dueDay}</span>
          </div>
          <button type="button" class="bill-pay-btn ${record.paid ? 'paid' : ''}" data-bill-key="${record.key}">${status}</button>
        </div>
      `;
    }).join('');
  }

  updateBillShield() {
    if (!this.billShieldStatus) return;
    const shield = this.getBillShield();
    const f = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

    this.billShieldProtected.textContent = f.format(shield.protectedAmount);
    this.billShieldSafe.textContent = f.format(shield.safeSpend);
    this.billShieldPaid.textContent = `${shield.currentPaid}/${shield.currentTotal}`;

    if (!shield.currentTotal) {
      this.billShieldStatus.textContent = 'Set Bills';
      this.billShieldNext.textContent = 'Set dates';
      this.billShieldText.textContent = 'Add monthly bills and due days in Settings.';
      this.renderBillShieldList([]);
      return;
    }

    if (shield.nextBill) {
      this.billShieldNext.textContent = this.formatBillDueLabel(shield.nextBill);
    } else {
      this.billShieldNext.textContent = 'Covered';
    }

    if (shield.protectedAmount <= 0) {
      this.billShieldStatus.textContent = 'Covered';
      this.billShieldText.textContent = 'No unpaid bills due in the next 14 days.';
    } else if (shield.needs > 0) {
      this.billShieldStatus.textContent = 'Needs Runs';
      this.billShieldText.textContent = `${f.format(shield.needs)} more needed before the next 14 days are protected.`;
    } else {
      this.billShieldStatus.textContent = 'Protected';
      this.billShieldText.textContent = `${f.format(shield.safeSpend)} remains safe after unpaid bills due in 14 days.`;
    }

    this.renderBillShieldList(shield.upcomingRecords);
  }

  getRunTimerElapsedMs(now = Date.now()) {
    const timer = this.state.timer || this.createDefaultState().timer;
    let elapsed = Math.max(0, Number(timer.accumulatedMs) || 0);

    if (timer.status === 'running' && timer.startedAt) {
      const started = new Date(timer.startedAt).getTime();
      if (!Number.isNaN(started)) {
        elapsed += Math.max(0, now - started);
      }
    }

    return elapsed;
  }

  formatTimerDuration(ms) {
    const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [hours, minutes, seconds].map(value => String(value).padStart(2, '0')).join(':');
  }

  startRunTimer() {
    this.state.timer = {
      status: 'running',
      startedAt: new Date().toISOString(),
      accumulatedMs: 0,
      lastUsedHours: this.state.timer?.lastUsedHours || 0
    };
    this.saveState();
    this.showToast('Run timer started.');
  }

  pauseRunTimer() {
    if (this.state.timer.status !== 'running') return;
    this.state.timer.accumulatedMs = this.getRunTimerElapsedMs();
    this.state.timer.startedAt = '';
    this.state.timer.status = 'paused';
    this.saveState();
  }

  resumeRunTimer() {
    if (this.state.timer.status !== 'paused') return;
    this.state.timer.startedAt = new Date().toISOString();
    this.state.timer.status = 'running';
    this.saveState();
  }

  resetRunTimer() {
    const elapsed = this.getRunTimerElapsedMs();
    if (elapsed > 60000 && !confirm('Reset the run timer?')) return;
    this.state.timer = this.createDefaultState().timer;
    this.saveState();
    this.showToast('Run timer reset.');
  }

  useRunTimerHours() {
    const elapsed = this.getRunTimerElapsedMs();
    if (elapsed < 60000) {
      this.showToast('Run timer needs at least one minute.', true);
      return;
    }

    if (this.state.timer.status === 'running') {
      this.state.timer.accumulatedMs = elapsed;
      this.state.timer.startedAt = '';
      this.state.timer.status = 'paused';
    }

    const hours = elapsed / 3600000;
    this.state.timer.lastUsedHours = hours;
    this.saveState();
    this.activateEntryTab('earnings');
    this.openModal(this.actionModal);
    const hoursInput = document.getElementById('earningHours');
    const descInput = document.getElementById('earningDesc');
    if (hoursInput) {
      hoursInput.value = hours.toFixed(2);
    }
    if (descInput && !descInput.value) {
      descInput.value = 'Timed run';
    }
    this.showToast(`${hours.toFixed(2)} hr added to earning entry.`);
  }

  updateRunTimer() {
    if (!this.runTimerElapsed) return;

    const timer = this.state.timer || this.createDefaultState().timer;
    const elapsed = this.getRunTimerElapsedMs();
    const hours = elapsed / 3600000;
    const f = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
    const statusText = timer.status === 'running' ? 'Running' : timer.status === 'paused' ? 'Paused' : 'Idle';

    this.runTimerStatus.textContent = statusText;
    this.runTimerElapsed.textContent = this.formatTimerDuration(elapsed);

    if (timer.status === 'running' && timer.startedAt) {
      const started = new Date(timer.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      this.runTimerStarted.textContent = `Started ${started}`;
    } else if (elapsed >= 60000) {
      this.runTimerStarted.textContent = `${hours.toFixed(2)} hr captured`;
    } else {
      this.runTimerStarted.textContent = 'Ready when you are.';
    }

    const totals = this.getTodayTotals();
    if (elapsed >= 60000 && totals.gross > 0) {
      this.runTimerPace.textContent = `${f.format(totals.gross / Math.max(hours, 0.01))}/hr against logged gross.`;
    } else if (elapsed >= 60000) {
      this.runTimerPace.textContent = `${hours.toFixed(2)} hr ready to use in an earning entry.`;
    } else {
      this.runTimerPace.textContent = 'Start before a shift, then use the time when logging earnings.';
    }

    if (this.btnTimerStart) this.btnTimerStart.hidden = timer.status !== 'idle';
    if (this.btnTimerPause) this.btnTimerPause.hidden = timer.status !== 'running';
    if (this.btnTimerResume) this.btnTimerResume.hidden = timer.status !== 'paused';
    if (this.btnTimerUse) this.btnTimerUse.disabled = elapsed < 60000;
    if (this.btnTimerReset) this.btnTimerReset.disabled = elapsed < 1000 && timer.status === 'idle';
  }

  startTimerTicker() {
    if (this.timerInterval) return;
    this.updateRunTimer();
    this.timerInterval = window.setInterval(() => this.updateRunTimer(), 1000);
  }

  activateEntryTab(tabName) {
    this.tabBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabName));
    this.tabContents.forEach(content => content.classList.toggle('active', content.id === `tab-${tabName}`));
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
    if (this.btnTimerStart) {
      this.btnTimerStart.addEventListener('click', () => this.startRunTimer());
    }
    if (this.btnTimerPause) {
      this.btnTimerPause.addEventListener('click', () => this.pauseRunTimer());
    }
    if (this.btnTimerResume) {
      this.btnTimerResume.addEventListener('click', () => this.resumeRunTimer());
    }
    if (this.btnTimerUse) {
      this.btnTimerUse.addEventListener('click', () => this.useRunTimerHours());
    }
    if (this.btnTimerReset) {
      this.btnTimerReset.addEventListener('click', () => this.resetRunTimer());
    }
    [this.offerPay, this.offerMiles, this.offerMinutes].forEach(input => {
      if (input) input.addEventListener('input', () => this.updateOfferGuardFromInputs());
    });
    if (this.btnUseOffer) {
      this.btnUseOffer.addEventListener('click', () => this.useOfferGuard());
    }
    if (this.btnClearOffer) {
      this.btnClearOffer.addEventListener('click', () => this.clearOfferGuard());
    }
    if (this.btnCloseoutArchive) {
      this.btnCloseoutArchive.addEventListener('click', () => {
        if (confirm('Close out today and archive entries?')) {
          this.archiveToday();
        }
      });
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
    if (this.billShieldList) {
      this.billShieldList.addEventListener('click', (event) => {
        const button = event.target.closest('[data-bill-key]');
        if (!button) return;
        this.toggleBillPaid(button.dataset.billKey);
      });
    }

    // Tab Logic
    this.tabBtns.forEach(btn => {
      btn.addEventListener('click', () => this.activateEntryTab(btn.dataset.tab));
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
      this.state.config.babyPlan = {
        dueDate: document.getElementById('setBabyDueDate').value || '',
        target: parseFloat(document.getElementById('setBabyTarget').value) || 0,
        savedStart: parseFloat(document.getElementById('setBabySavedStart').value) || 0,
        note: document.getElementById('setBabyNote').value.trim() || 'Go bag, diapers, car seat, first month buffer.'
      };
      const rent = parseFloat(document.getElementById('setRent').value) || 0;
      const car = parseFloat(document.getElementById('setCar').value) || 0;
      const insurance = parseFloat(document.getElementById('setInsurance').value) || 0;
      const utilities = parseFloat(document.getElementById('setUtilities').value) || 0;
      this.state.config.monthlyBills = { rent, car, insurance, utilities };
      this.state.config.dailyBills = (rent + car + insurance + utilities) / 30;
      this.state.billShield = {
        ...this.createDefaultState().billShield,
        ...(this.state.billShield || {}),
        dueDays: {
          rent: Math.max(1, Math.min(31, Math.round(parseFloat(document.getElementById('setRentDue').value) || 1))),
          car: Math.max(1, Math.min(31, Math.round(parseFloat(document.getElementById('setCarDue').value) || 10))),
          insurance: Math.max(1, Math.min(31, Math.round(parseFloat(document.getElementById('setInsuranceDue').value) || 15))),
          utilities: Math.max(1, Math.min(31, Math.round(parseFloat(document.getElementById('setUtilitiesDue').value) || 20)))
        }
      };
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
    const runway = this.getBabyRunway();
    const shield = this.getBillShield();
    const offer = this.getOfferGuardMetrics();
    const closeout = this.getShiftCloseout();
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
    rows.push(['Shift Closeout']);
    rows.push(['Status', closeout.status]);
    rows.push(['Take Home', closeout.totals.takeHome.toFixed(2)]);
    rows.push(['Safe Spend', closeout.safeSpend.toFixed(2)]);
    rows.push(['Reserve', closeout.reserveTotal.toFixed(2)]);
    rows.push(['Hours', closeout.totals.hours.toFixed(2)]);
    rows.push(['Miles', closeout.totals.miles.toFixed(1)]);
    rows.push(['Closeout Note', closeout.text]);
    rows.push(['Check', 'Status', 'Detail', 'Badge']);
    closeout.checks.forEach(check => {
      rows.push([check.name, check.ok ? 'OK' : 'Needs Work', check.text, check.badge]);
    });
    rows.push([]);
    rows.push(['Baby Runway']);
    rows.push(['Due Date', runway.dueDateText]);
    rows.push(['Target', runway.target.toFixed(2)]);
    rows.push(['Already Saved', runway.savedStart.toFixed(2)]);
    rows.push(['Saved Total', runway.saved.toFixed(2)]);
    rows.push(['Remaining', runway.remaining.toFixed(2)]);
    rows.push(['Weeks Left', runway.weeksLeft === null ? '' : runway.weeksLeft.toFixed(1)]);
    rows.push(['Weekly Need', runway.weeklyNeed.toFixed(2)]);
    rows.push(['Readiness Note', runway.note]);
    rows.push([]);
    rows.push(['Bill Shield']);
    rows.push(['Protected Next 14 Days', shield.protectedAmount.toFixed(2)]);
    rows.push(['Safe Spend', shield.safeSpend.toFixed(2)]);
    rows.push(['Paid This Month', `${shield.currentPaid}/${shield.currentTotal}`]);
    rows.push(['Next Due', shield.nextBill ? `${shield.nextBill.label} ${this.formatBillDueLabel(shield.nextBill)}` : '']);
    rows.push(['Bill', 'Due Date', 'Due Label', 'Amount', 'Status']);
    shield.upcomingRecords.forEach(record => {
      rows.push([
        record.label,
        this.getDateKey(record.dueDate),
        this.formatBillDueLabel(record),
        record.amount.toFixed(2),
        record.paid ? 'Paid' : 'Unpaid'
      ]);
    });
    rows.push([]);
    rows.push(['Offer Guard']);
    rows.push(['Decision', offer.status]);
    rows.push(['Payout', offer.pay.toFixed(2)]);
    rows.push(['Miles', offer.miles.toFixed(1)]);
    rows.push(['Minutes', offer.minutes.toFixed(0)]);
    rows.push(['Hourly Pace', offer.hourly.toFixed(2)]);
    rows.push(['Per Mile', offer.perMile.toFixed(2)]);
    rows.push(['After Miles', offer.adjusted.toFixed(2)]);
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
    this.updateOfferGuard();
    this.updateRunTimer();

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
    this.updateBillShield();

    // Weekly
    this.updateWeeklyProgress();
    this.updateWeekCommand();
    this.updateTaxSnapshot();
    this.updateBabyRunway();
    this.updateShiftCloseout();
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

  updateBabyRunway() {
    if (!this.babyRunwaySaved) return;

    const runway = this.getBabyRunway();
    const f = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
    const hasTarget = runway.target > 0;
    const hasDueDate = !!runway.dueDate;

    this.babyRunwaySaved.textContent = f.format(runway.saved);
    this.babyRunwayRemaining.textContent = f.format(runway.remaining);
    this.babyRunwayWeeklyNeed.textContent = hasDueDate ? f.format(runway.weeklyNeed) : 'Set date';
    this.babyRunwayWeeks.textContent = hasDueDate
      ? runway.weeksLeft > 0
        ? runway.weeksLeft.toFixed(1)
        : 'Now'
      : 'Set date';
    this.babyRunwayBarFill.style.width = `${runway.progress}%`;
    this.babyRunwayBarFill.classList.toggle('complete', hasTarget && runway.remaining <= 0);
    this.babyRunwayNote.textContent = runway.note || 'Go bag, diapers, car seat, first month buffer.';

    if (!hasTarget && !hasDueDate) {
      this.babyRunwayStatus.textContent = 'Set Plan';
      this.babyRunwayText.textContent = 'Set a target and due date in Settings to build the runway.';
      return;
    }

    if (!hasTarget) {
      this.babyRunwayStatus.textContent = 'Set Target';
      this.babyRunwayText.textContent = 'Add a baby target in Settings to calculate the remaining runway.';
      return;
    }

    if (hasTarget && runway.remaining <= 0) {
      this.babyRunwayStatus.textContent = 'Ready';
      this.babyRunwayText.textContent = `Target covered. ${f.format(runway.saved)} is protected for the baby runway.`;
      return;
    }

    if (!hasDueDate) {
      this.babyRunwayStatus.textContent = 'Target';
      this.babyRunwayText.textContent = `${f.format(runway.remaining)} left toward the baby target. Add a due date for weekly pace.`;
      return;
    }

    if (runway.daysLeft < 0) {
      this.babyRunwayStatus.textContent = 'Open';
      this.babyRunwayText.textContent = `${f.format(runway.remaining)} still open against the baby target.`;
      return;
    }

    if (runway.weekBabyFund >= runway.weeklyNeed && runway.weeklyNeed > 0) {
      this.babyRunwayStatus.textContent = 'On Pace';
      this.babyRunwayText.textContent = `${f.format(runway.weekBabyFund)} saved this week against a ${f.format(runway.weeklyNeed)} weekly pace.`;
    } else if (runway.weekBabyFund > 0) {
      const gap = Math.max(0, runway.weeklyNeed - runway.weekBabyFund);
      this.babyRunwayStatus.textContent = 'Building';
      this.babyRunwayText.textContent = `${f.format(gap)} more baby fund this week keeps the runway on pace.`;
    } else {
      this.babyRunwayStatus.textContent = 'Needs Pace';
      this.babyRunwayText.textContent = `${f.format(runway.weeklyNeed)} per week needed for ${runway.weeksLeft.toFixed(1)} weeks.`;
    }
  }

  renderCareChecklist() {
    this.careBtns.forEach(btn => {
      const active = !!this.state.care[btn.dataset.care];
      btn.classList.toggle('active', active);
    });
    if (this.careProgress) {
      const care = this.getCareSummary();
      this.careProgress.textContent = `${care.ready}/${care.total} ready`;
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
